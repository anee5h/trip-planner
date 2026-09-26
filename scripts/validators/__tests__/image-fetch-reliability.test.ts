import { describe, expect, it, vi } from "vitest";
import {
  parseRetryAfterMs,
  retryImageFetch,
  type ImageCheckResult,
} from "../images";

describe("image fetch retry policy", () => {
  it("retries transient network failures with bounded exponential backoff", async () => {
    const attempt = vi
      .fn<() => Promise<ImageCheckResult>>()
      .mockResolvedValueOnce({
        ok: false,
        error: "DNS lookup failed: EAI_AGAIN",
        failureType: "transient",
      })
      .mockResolvedValueOnce({
        ok: false,
        error: "socket timeout",
        failureType: "transient",
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const wait = vi.fn(async (_delayMs: number) => {});

    const result = await retryImageFetch(attempt, {
      sleep: wait,
      random: () => 0.5,
      now: () => 1_000,
    });

    expect(result).toMatchObject({ ok: true, status: 200, attempts: 3 });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delayMs]) => delayMs)).toEqual([1_000, 2_000]);
  });

  it("waits at least the server Retry-After delay before retrying a throttle", async () => {
    const attempt = vi
      .fn<() => Promise<ImageCheckResult>>()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        error: "HTTP 429",
        failureType: "transient",
        retryAfter: "2",
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const wait = vi.fn(async (_delayMs: number) => {});

    const result = await retryImageFetch(attempt, {
      sleep: wait,
      random: () => 0,
      now: () => 1_000,
    });

    expect(result).toMatchObject({ ok: true, status: 200, attempts: 2 });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls[0][0]).toBeGreaterThanOrEqual(2_000);
  });

  it("parses Retry-After as either seconds or an HTTP date", () => {
    const now = Date.parse("Wed, 21 Oct 2015 07:27:00 GMT");

    expect(parseRetryAfterMs("3", now)).toBe(3_000);
    expect(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:30 GMT", now)).toBe(
      90_000,
    );
    expect(parseRetryAfterMs("not-a-date", now)).toBeUndefined();
  });

  it("does not retry before a Retry-After value beyond the bounded wait budget", async () => {
    const attempt = vi.fn<() => Promise<ImageCheckResult>>().mockResolvedValue({
      ok: false,
      status: 429,
      error: "HTTP 429",
      failureType: "transient",
      retryAfter: "60",
    });
    const wait = vi.fn(async (_delayMs: number) => {});

    const result = await retryImageFetch(attempt, {
      sleep: wait,
      random: () => 0.5,
      now: () => 1_000,
    });

    expect(result).toMatchObject({ ok: false, status: 429, attempts: 1 });
    expect(result.error).toContain("Retry-After");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it.each([
    { failureType: "hard" as const, error: "HTTP 404" },
    { failureType: "policy" as const, error: "host is not allowed" },
  ])("does not retry $failureType failures", async ({ failureType, error }) => {
    const attempt = vi.fn<() => Promise<ImageCheckResult>>().mockResolvedValue({
      ok: false,
      error,
      failureType,
    });
    const wait = vi.fn(async (_delayMs: number) => {});

    const result = await retryImageFetch(attempt, {
      sleep: wait,
      random: () => 0.5,
      now: () => 1_000,
    });

    expect(result).toMatchObject({ ok: false, failureType, attempts: 1 });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
