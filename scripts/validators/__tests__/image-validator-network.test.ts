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

function makeContext(): ValidationContext {
  return {
    catalog: {
      destinations: [
        {
          id: "test-destination",
          heroImage: "https://upload.wikimedia.org/test-image.jpg",
        } as ValidationContext["catalog"]["destinations"][number],
      ],
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
