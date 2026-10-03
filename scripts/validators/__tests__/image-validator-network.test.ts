import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationContext } from "../types";

const { mockLookup, mockGet } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("dns", () => ({ default: { lookup: mockLookup } }));
vi.mock("https", () => ({ default: { get: mockGet } }));

import { imagesValidator } from "../images";

function makeContext(
  images: Array<{ id: string; url: string }> = [
    {
      id: "test-destination",
      url: "https://upload.wikimedia.org/test-image.jpg",
    },
  ],
): ValidationContext {
  return {
    catalog: {
      destinations: images.map(
        ({ id, url }) =>
          ({
            id,
            heroImage: url,
          }) as ValidationContext["catalog"]["destinations"][number],
      ),
      collections: [],
    },
    config: {
      hubCollectionBlacklist: [],
      budgetTolerancePercent: 0,
      budgetMinToleranceYen: 0,
      httpTimeoutMs: 4_000,
      maxWarningThreshold: 50,
      allowedImageMimeTypes: ["image/jpeg"],
    },
  };
}

function createResponse(
  statusCode: number,
  headers: Record<string, string> = {},
) {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    resume: () => void;
    destroy: () => void;
  };
  response.statusCode = statusCode;
  response.headers = headers;
  response.resume = vi.fn();
  response.destroy = vi.fn();
  return response;
}

function createRequest() {
  const request = new EventEmitter() as EventEmitter & { destroy: () => void };
  request.destroy = vi.fn();
  return request;
}

beforeEach(() => {
  mockLookup.mockReset();
  mockGet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("image validator transient network recovery", () => {
  it("reports aggregate request and retry diagnostics without URL data", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const response = createResponse(200, {
            "content-type": "image/jpeg",
          });
          callback(response);
          response.emit("end");
        });
        return request;
      },
    );

    const result = await imagesValidator.validate(makeContext());

    expect(result.diagnostics).toMatchObject({
      uniqueUrlsChecked: 1,
      httpRequests: 1,
      successfulFirstAttempts: 1,
      successfulRetries: 0,
      retryExhaustedUrls: 0,
      http429Responses: 0,
      retryAfterWaitMs: 0,
      exponentialBackoffDelayMs: 0,
      timeoutRetries: 0,
      dnsRetries: 0,
      dnsLookups: 1,
      concurrencyQueueWaitMs: 0,
    });
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      "upload.wikimedia.org",
    );
  });

  it("keeps permanent DNS resolution failures terminal", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: Error, addresses?: unknown[]) => void,
      ) =>
        callback(
          Object.assign(new Error("name not found"), { code: "ENOTFOUND" }),
        ),
    );

    const result = await imagesValidator.validate(makeContext());

    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "BROKEN_IMAGE_URL",
    });
    expect(result.diagnostics).toMatchObject({
      permanentDnsFailures: 1,
      dnsRetries: 0,
    });
  });

  it("fails validation when DNS stays stalled through bounded retries", async () => {
    mockLookup.mockImplementation(() => {});
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockLookup).toHaveBeenCalledTimes(3);
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "IMAGE_FETCH_UNVERIFIED",
          message: expect.stringContaining("after 3 attempts"),
        }),
      ]),
    );
    expect(result.diagnostics).toMatchObject({
      dnsTimeouts: 3,
      dnsRetries: 2,
      retryExhaustedUrls: 1,
      successfulFirstAttempts: 0,
      successfulRetries: 0,
    });
  });

  it("caps outstanding DNS lookups after timed-out resolver work", async () => {
    let outstandingLookups = 0;
    let maxOutstandingLookups = 0;
    mockLookup.mockImplementation(() => {
      outstandingLookups += 1;
      maxOutstandingLookups = Math.max(
        maxOutstandingLookups,
        outstandingLookups,
      );
    });
    vi.useFakeTimers();

    const pending = imagesValidator.validate(
      makeContext(
        Array.from({ length: 6 }, (_, index) => ({
          id: `stalled-dns-${index}`,
          url: `https://upload.wikimedia.org/stalled-${index}.jpg`,
        })),
      ),
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(maxOutstandingLookups).toBe(3);
    expect(mockLookup).toHaveBeenCalledTimes(3);
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.metrics.errorsCount).toBe(6);
    expect(result.diagnostics).toMatchObject({ dnsTimeouts: 3 });
    expect(result.diagnostics.dnsCapacitySkips).toBeGreaterThan(0);
  });

  it("releases DNS capacity when a timed-out lookup eventually completes", async () => {
    type LookupCallback = (error: Error | null, addresses?: unknown[]) => void;
    const lateCallbacks: LookupCallback[] = [];
    const stalledHosts = new Set<string>();
    let activeResolverCalls = 0;
    let maxActiveResolverCalls = 0;
    mockLookup.mockImplementation(
      (hostname: string, _options: unknown, callback: LookupCallback) => {
        activeResolverCalls += 1;
        maxActiveResolverCalls = Math.max(
          maxActiveResolverCalls,
          activeResolverCalls,
        );
        const finishLookup: LookupCallback = (error, addresses) => {
          activeResolverCalls -= 1;
          callback(error, addresses);
        };
        if (stalledHosts.size < 3 && !stalledHosts.has(hostname)) {
          stalledHosts.add(hostname);
          lateCallbacks.push(finishLookup);
          return;
        }
        finishLookup(null, [{ address: "208.80.154.224", family: 4 }]);
      },
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const response = createResponse(200, {
            "content-type": "image/jpeg",
          });
          callback(response);
          response.emit("end");
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(
      makeContext([
        {
          id: "late-dns-wikimedia",
          url: "https://upload.wikimedia.org/late.jpg",
        },
        {
          id: "late-dns-unsplash",
          url: "https://images.unsplash.com/late.jpg",
        },
        {
          id: "late-dns-istock",
          url: "https://media.istockphoto.com/late.jpg",
        },
        {
          id: "after-dns-saturation",
          url: "https://museum.seiko.co.jp/after-saturation.jpg",
        },
      ]),
    );
    await vi.advanceTimersByTimeAsync(4_000);

    expect(lateCallbacks).toHaveLength(3);
    expect(activeResolverCalls).toBe(3);
    for (const callback of lateCallbacks) {
      callback(null, [{ address: "208.80.154.224", family: 4 }]);
    }
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(maxActiveResolverCalls).toBe(3);
    expect(activeResolverCalls).toBe(0);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({ maxConcurrentDnsLookups: 3 });
    expect(result.diagnostics.dnsCapacitySkips).toBeGreaterThan(0);
    expect(mockGet).toHaveBeenCalledTimes(4);
  });

  it("rejects an unapproved image host without DNS or HTTP traffic", async () => {
    const result = await imagesValidator.validate(
      makeContext([
        {
          id: "invalid-host",
          url: "https://not-allowed.example/image.jpg",
        },
      ]),
    );

    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "IMAGE_POLICY_VIOLATION",
    });
  });

  it("checks an exact duplicate URL once and reports its duplicate reference", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const response = createResponse(200, {
            "content-type": "image/jpeg",
          });
          callback(response);
          response.emit("end");
        });
        return request;
      },
    );

    const result = await imagesValidator.validate(
      makeContext([
        {
          id: "duplicate-one",
          url: "https://upload.wikimedia.org/shared.jpg",
        },
        {
          id: "duplicate-two",
          url: "https://upload.wikimedia.org/shared.jpg",
        },
      ]),
    );

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toMatchObject({
      uniqueUrlsChecked: 1,
      duplicateUrlReferences: 1,
      httpRequests: 1,
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_IMAGE_URL" }),
      ]),
    );
  });

  it("keeps concurrent requests capped at three while multiple URLs recover from 429", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    const attemptsByUrl = new Map<string, number>();
    let activeRequests = 0;
    let maxActiveRequests = 0;
    mockGet.mockImplementation(
      (
        url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        const attempt = (attemptsByUrl.get(url) ?? 0) + 1;
        attemptsByUrl.set(url, attempt);
        const request = createRequest();
        setTimeout(() => {
          const status = attempt === 1 ? 429 : 200;
          const response = createResponse(
            status,
            status === 429
              ? { "retry-after": "0" }
              : { "content-type": "image/jpeg" },
          );
          callback(response);
          activeRequests -= 1;
          if (status === 200) response.emit("end");
        }, 0);
        return request;
      },
    );
    vi.useFakeTimers();

    const imageHosts = [
      "upload.wikimedia.org",
      "images.unsplash.com",
      "media.istockphoto.com",
      "commons.wikimedia.org",
      "museum.seiko.co.jp",
      "mangapark.jp",
      "thumb.wikimedia.org",
    ];
    const images = imageHosts.map((host, index) => ({
      id: `destination-${index}`,
      url: `https://${host}/image-${index}.jpg`,
    }));
    const pending = imagesValidator.validate(makeContext(images));
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(maxActiveRequests).toBeLessThanOrEqual(3);
    expect(mockGet).toHaveBeenCalledTimes(14);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      maxConcurrentRequests: 3,
      successfulRetries: 7,
      retryExhaustedUrls: 0,
      http429Responses: 7,
    });
  });

  it("allows unrelated providers while Wikimedia honors shared cooldown", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    const requestCounts = new Map<string, number>();
    mockGet.mockImplementation(
      (
        url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const count = (requestCounts.get(url) ?? 0) + 1;
        requestCounts.set(url, count);
        const request = createRequest();
        setTimeout(() => {
          const throttled =
            new URL(url).hostname.endsWith(".wikimedia.org") && count === 1;
          const response = createResponse(
            throttled ? 429 : 200,
            throttled
              ? { "retry-after": "2" }
              : { "content-type": "image/jpeg" },
          );
          callback(response);
          if (!throttled) response.emit("end");
        }, 0);
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(
      makeContext([
        {
          id: "throttled-wikimedia-one",
          url: "https://upload.wikimedia.org/throttled-one.jpg",
        },
        {
          id: "throttled-wikimedia-two",
          url: "https://commons.wikimedia.org/throttled-two.jpg",
        },
        {
          id: "throttled-wikimedia-three",
          url: "https://thumb.wikimedia.org/throttled-three.jpg",
        },
        {
          id: "fast-unsplash",
          url: "https://images.unsplash.com/fast.jpg",
        },
      ]),
    );
    await vi.advanceTimersByTimeAsync(250);
    const unrelatedProviderStartedDuringWait = mockGet.mock.calls.some(
      ([url]) => url === "https://images.unsplash.com/fast.jpg",
    );
    const sameProviderSiblingStartedDuringCooldown = mockGet.mock.calls.some(
      ([url]) =>
        url === "https://commons.wikimedia.org/throttled-two.jpg" ||
        url === "https://thumb.wikimedia.org/throttled-three.jpg",
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(unrelatedProviderStartedDuringWait).toBe(true);
    expect(sameProviderSiblingStartedDuringCooldown).toBe(false);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      http429Responses: 3,
      successfulRetries: 3,
    });
    expect(result.diagnostics?.maxConcurrentRequests).toBeLessThanOrEqual(3);
  });

  it("releases all request slots while throttled URLs wait", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    const throttledUrls = new Set([
      "https://upload.wikimedia.org/slow.jpg",
      "https://images.unsplash.com/slow.jpg",
      "https://museum.seiko.co.jp/slow.jpg",
    ]);
    const requestCounts = new Map<string, number>();
    let maxActiveRequests = 0;
    let activeRequests = 0;
    mockGet.mockImplementation(
      (
        url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const attempt = (requestCounts.get(url) ?? 0) + 1;
        requestCounts.set(url, attempt);
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        const request = createRequest();
        setTimeout(() => {
          const throttled = throttledUrls.has(url) && attempt === 1;
          const response = createResponse(
            throttled ? 429 : 200,
            throttled
              ? { "retry-after": "2" }
              : { "content-type": "image/jpeg" },
          );
          callback(response);
          activeRequests -= 1;
          if (!throttled) response.emit("end");
        }, 0);
        return request;
      },
    );
    vi.useFakeTimers();

    const unrelatedUrl = "https://mangapark.jp/fast.jpg";
    const pending = imagesValidator.validate(
      makeContext([
        { id: "slow-wikimedia", url: "https://upload.wikimedia.org/slow.jpg" },
        { id: "slow-unsplash", url: "https://images.unsplash.com/slow.jpg" },
        { id: "slow-seiko", url: "https://museum.seiko.co.jp/slow.jpg" },
        { id: "fast-mangapark", url: unrelatedUrl },
      ]),
    );
    await vi.advanceTimersByTimeAsync(250);
    const unrelatedProviderStartedDuringWait = mockGet.mock.calls.some(
      ([url]) => url === unrelatedUrl,
    );
    const retryStartedDuringWait = Array.from(throttledUrls).some(
      (url) => (requestCounts.get(url) ?? 0) > 1,
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(maxActiveRequests).toBe(3);
    expect(unrelatedProviderStartedDuringWait).toBe(true);
    expect(retryStartedDuringWait).toBe(false);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      maxConcurrentRequests: 3,
      http429Responses: 3,
      successfulRetries: 3,
    });
  });

  it("blocks same-provider URLs after an over-budget Retry-After", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          if (url === "https://upload.wikimedia.org/over-budget.jpg") {
            callback(createResponse(429, { "retry-after": "60" }));
          } else {
            const response = createResponse(200, {
              "content-type": "image/jpeg",
            });
            callback(response);
            response.emit("end");
          }
        });
        return request;
      },
    );

    const result = await imagesValidator.validate(
      makeContext([
        {
          id: "over-budget-wikimedia",
          url: "https://upload.wikimedia.org/over-budget.jpg",
        },
        {
          id: "wikimedia-sibling",
          url: "https://commons.wikimedia.org/sibling.jpg",
        },
        {
          id: "unrelated-unsplash",
          url: "https://images.unsplash.com/fast.jpg",
        },
      ]),
    );

    expect(mockGet.mock.calls.map(([url]) => url)).not.toContain(
      "https://commons.wikimedia.org/sibling.jpg",
    );
    expect(result.passed).toBe(false);
    expect(result.metrics.errorsCount).toBe(2);
    expect(result.diagnostics).toMatchObject({
      retryAfterOverBudget: 1,
      providerCooldownSkippedUrls: 1,
    });
  });

  it("omits URL paths and query credentials from image failure issues", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => callback(createResponse(404)));
        return request;
      },
    );
    const sensitiveUrl =
      "https://upload.wikimedia.org/private/path.jpg?token=private-secret#fragment";

    const result = await imagesValidator.validate(
      makeContext([{ id: "private-image", url: sensitiveUrl }]),
    );

    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues[0].message).toContain("https://upload.wikimedia.org");
    expect(result.issues[0].message).not.toMatch(
      /private\/path|private-secret|token=|fragment/,
    );
  });

  it("enforces the destination provider limit across a redirect", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    vi.useFakeTimers();

    let activeWikimediaRequests = 0;
    let maxActiveWikimediaRequests = 0;
    const wikimediaUrl = "https://upload.wikimedia.org/direct.jpg";
    const redirectedWikimediaUrl =
      "https://upload.wikimedia.org/redirect-target.jpg";
    mockGet.mockImplementation(
      (
        url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        if (url === "https://images.unsplash.com/redirect.jpg") {
          queueMicrotask(() =>
            callback(createResponse(302, { location: redirectedWikimediaUrl })),
          );
          return request;
        }
        if (url === wikimediaUrl || url === redirectedWikimediaUrl) {
          activeWikimediaRequests += 1;
          maxActiveWikimediaRequests = Math.max(
            maxActiveWikimediaRequests,
            activeWikimediaRequests,
          );
          const delayMs = url === wikimediaUrl ? 500 : 0;
          setTimeout(() => {
            const response = createResponse(200, {
              "content-type": "image/jpeg",
            });
            callback(response);
            response.emit("end");
            activeWikimediaRequests -= 1;
          }, delayMs);
        }
        return request;
      },
    );

    const pending = imagesValidator.validate(
      makeContext([
        {
          id: "cross-provider-redirect",
          url: "https://images.unsplash.com/redirect.jpg",
        },
        { id: "direct-wikimedia", url: wikimediaUrl },
      ]),
    );
    await vi.advanceTimersByTimeAsync(250);
    const redirectedRequestStartedTooEarly = mockGet.mock.calls.some(
      ([url]) => url === redirectedWikimediaUrl,
    );
    const maxConcurrentWikimediaRequestsDuringDirect =
      maxActiveWikimediaRequests;
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(redirectedRequestStartedTooEarly).toBe(false);
    expect(maxConcurrentWikimediaRequestsDuringDirect).toBe(1);
    expect(maxActiveWikimediaRequests).toBe(1);
    expect(result.metrics.errorsCount).toBe(0);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("counts a transient DNS failure on a redirect as a DNS retry", async () => {
    let lookups = 0;
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: Error | null, addresses?: unknown[]) => void,
      ) => {
        lookups += 1;
        if (lookups === 2) {
          callback(
            Object.assign(new Error("temporary redirect DNS failure"), {
              code: "EAI_AGAIN",
            }),
          );
          return;
        }
        callback(null, [{ address: "208.80.154.224", family: 4 }]);
      },
    );
    mockGet.mockImplementation(
      (
        url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const isRedirect = url.includes("upload.wikimedia.org");
          const response = isRedirect
            ? createResponse(302, {
                location: "https://images.unsplash.com/redirect.jpg",
              })
            : createResponse(200, { "content-type": "image/jpeg" });
          callback(response);
          if (!isRedirect) response.emit("end");
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(lookups).toBe(4);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      dnsRetries: 1,
      transientDnsFailures: 1,
      successfulRetries: 1,
    });
  });

  it("retries a transient DNS lookup failure and then validates the image", async () => {
    let lookups = 0;
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: Error | null, addresses?: unknown[]) => void,
      ) => {
        lookups += 1;
        if (lookups === 1) {
          callback(
            Object.assign(new Error("temporary DNS failure"), {
              code: "EAI_AGAIN",
            }),
          );
        } else {
          callback(null, [{ address: "208.80.154.224", family: 4 }]);
        }
      },
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const response = createResponse(200, {
            "content-type": "image/jpeg",
          });
          callback(response);
          response.emit("end");
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(lookups).toBe(2);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.metrics.warningsCount).toBe(0);
    expect(result.metrics.totalChecked).toBe(1);
    expect(result.diagnostics).toMatchObject({
      dnsRetries: 1,
      transientDnsFailures: 1,
      successfulRetries: 1,
      requestTimeouts: 0,
    });
  });

  it("counts request and stream failures separately across recovery", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    let attempts = 0;
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        attempts += 1;
        queueMicrotask(() => {
          if (attempts === 1) {
            request.emit(
              "error",
              Object.assign(new Error("connection reset"), {
                code: "ECONNRESET",
              }),
            );
            return;
          }
          const response = createResponse(200, {
            "content-type": "image/jpeg",
          });
          callback(response);
          if (attempts === 2) {
            response.emit(
              "error",
              Object.assign(new Error("stream reset"), {
                code: "ECONNRESET",
              }),
            );
          } else {
            response.emit("end");
          }
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(attempts).toBe(3);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      requestFailures: 1,
      streamFailures: 1,
      successfulRetries: 1,
      retryAttempts: 2,
    });
  });

  it("paces Wikimedia requests after a shared cooldown before resuming the cohort", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    const requestStarts: number[] = [];
    const responseStatuses: number[] = [];
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const startedAt = performance.now();
        const tooSoon =
          requestStarts.length > 0 &&
          startedAt - requestStarts[requestStarts.length - 1] < 1_000;
        const statusCode = requestStarts.length === 0 || tooSoon ? 429 : 200;
        requestStarts.push(startedAt);
        responseStatuses.push(statusCode);
        const request = createRequest();
        queueMicrotask(() => {
          const response = createResponse(
            statusCode,
            statusCode === 429
              ? { "retry-after": "10" }
              : { "content-type": "image/jpeg" },
          );
          callback(response);
          if (statusCode === 200) response.emit("end");
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(
      makeContext(
        Array.from({ length: 4 }, (_, index) => ({
          id: `paced-wikimedia-${index}`,
          url: `https://upload.wikimedia.org/paced-${index}.jpg`,
        })),
      ),
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    const requestIntervals = requestStarts
      .slice(1)
      .map((startedAt, index) => startedAt - requestStarts[index]);

    expect(result.metrics.errorsCount).toBe(0);
    expect(responseStatuses.filter((status) => status === 429)).toHaveLength(1);
    expect(Math.min(...requestIntervals)).toBeGreaterThanOrEqual(1_000);
    expect(result.diagnostics.providerCooldownSkippedUrls).toBe(0);
    expect(result.diagnostics.wikimediaRequestPacingDelayMs).toBeGreaterThan(0);
    expect(result.diagnostics).toMatchObject({
      wikimediaHttpRequests: 5,
      wikimediaHttp429Responses: 1,
      retryAfterWaitMs: 10_000,
    });
  });

  it("honors a Wikimedia Retry-After response and clears a transient 429", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => {
        callback(null, [{ address: "208.80.154.224", family: 4 }]);
      },
    );
    const statuses = [429, 200];
    let throttledResponse: ReturnType<typeof createResponse> | undefined;
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const statusCode = statuses.shift() ?? 200;
          const response = createResponse(
            statusCode,
            statusCode === 429
              ? { "retry-after": "2" }
              : { "content-type": "image/jpeg" },
          );
          if (statusCode === 429) throttledResponse = response;
          callback(response);
          if (statusCode === 200) response.emit("end");
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.metrics.warningsCount).toBe(0);
    expect(throttledResponse?.destroy).toHaveBeenCalledTimes(1);
    expect(throttledResponse?.resume).not.toHaveBeenCalled();
    expect(result.diagnostics).toMatchObject({
      http429Responses: 1,
      retryAfterHeaders: 1,
      retryAfterWaitMs: 2_000,
      successfulRetries: 1,
      retryExhaustedUrls: 0,
    });
  });

  it("does not retry a TLS certificate failure as a transient network error", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        _callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() =>
          request.emit(
            "error",
            Object.assign(new Error("certificate name mismatch"), {
              code: "ERR_TLS_CERT_ALTNAME_INVALID",
            }),
          ),
        );
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "BROKEN_IMAGE_URL",
    });
  });

  it("fails verification after exhausting retries for a persistent 429", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => callback(createResponse(429)));
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(result.passed).toBe(false);
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "IMAGE_FETCH_UNVERIFIED",
          message: expect.stringContaining("after 3 attempts"),
        }),
      ]),
    );
    expect(result.diagnostics).toMatchObject({
      http429Responses: 3,
      successfulFirstAttempts: 0,
      successfulRetries: 0,
      retryExhaustedUrls: 1,
    });
  });

  it("fails verification instead of retrying before an over-budget Retry-After", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() =>
          callback(createResponse(429, { "retry-after": "60" })),
        );
        return request;
      },
    );

    const result = await imagesValidator.validate(makeContext());

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.passed).toBe(false);
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "IMAGE_FETCH_UNVERIFIED",
    });
    expect(result.diagnostics).toMatchObject({
      retryAfterOverBudget: 1,
      retryAttempts: 0,
    });
  });

  it("follows an allowlisted redirect without downloading its body", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    let redirectResponse: ReturnType<typeof createResponse> | undefined;
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          if (mockGet.mock.calls.length === 1) {
            redirectResponse = createResponse(302, {
              location: "https://upload.wikimedia.org/final.jpg",
            });
            callback(redirectResponse);
          } else {
            const response = createResponse(200, {
              "content-type": "image/jpeg",
            });
            callback(response);
            response.emit("end");
          }
        });
        return request;
      },
    );

    const result = await imagesValidator.validate(makeContext());

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(redirectResponse?.destroy).toHaveBeenCalledTimes(1);
    expect(redirectResponse?.resume).not.toHaveBeenCalled();
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      redirectResponses: 1,
      httpRequests: 2,
      successfulFirstAttempts: 1,
    });
  });

  it("recovers from HTTP 503 before the retry budget is exhausted", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    const statuses = [503, 200];
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => {
          const status = statuses.shift() ?? 200;
          const response = createResponse(
            status,
            status === 200 ? { "content-type": "image/jpeg" } : {},
          );
          callback(response);
          if (status === 200) response.emit("end");
        });
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.metrics.warningsCount).toBe(0);
    expect(result.diagnostics).toMatchObject({
      http503Responses: 1,
      successfulRetries: 1,
      retryExhaustedUrls: 0,
    });
  });

  it("retries a request timeout and then validates the image", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => {
        callback(null, [{ address: "208.80.154.224", family: 4 }]);
      },
    );
    let requests = 0;
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        requests += 1;
        if (requests === 1) {
          queueMicrotask(() => request.emit("timeout"));
        } else {
          queueMicrotask(() => {
            const response = createResponse(200, {
              "content-type": "image/jpeg",
            });
            callback(response);
            response.emit("end");
          });
        }
        return request;
      },
    );
    vi.useFakeTimers();

    const pending = imagesValidator.validate(makeContext());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.metrics.errorsCount).toBe(0);
    expect(result.metrics.warningsCount).toBe(0);
  });

  it("retains HTTP 403 access denial as a blocking error without retrying", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => callback(null, [{ address: "208.80.154.224", family: 4 }]),
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => callback(createResponse(403)));
        return request;
      },
    );

    const result = await imagesValidator.validate(makeContext());

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "BROKEN_IMAGE_URL",
    });
    expect(result.issues[0].message).toContain("HTTP 403");
    expect(result.diagnostics?.http403Responses).toBe(1);
  });

  it("retains a 404 as a blocking broken-image error without retrying", async () => {
    mockLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (error: null, addresses: unknown[]) => void,
      ) => {
        callback(null, [{ address: "208.80.154.224", family: 4 }]);
      },
    );
    mockGet.mockImplementation(
      (
        _url: string,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = createRequest();
        queueMicrotask(() => callback(createResponse(404)));
        return request;
      },
    );

    const result = await imagesValidator.validate(makeContext());

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.metrics.errorsCount).toBe(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "BROKEN_IMAGE_URL",
          message: expect.stringContaining("HTTP 404"),
        }),
      ]),
    );
  });
});
