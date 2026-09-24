import { describe, expect, it } from "vitest";
import {
  BASE_DELAY_MS,
  MAX_ATTEMPTS,
  MAX_DELAY_MS,
  extractHttpStatus,
  getRetryDelayMs,
  isMissingObjectFailure,
  isRetryableR2Failure,
} from "../r2-with-retry.mjs";

describe("R2 retry classification", () => {
  it("recognizes the bounded transient HTTP status set", () => {
    for (const status of [429, 500, 502, 503, 504, 522, 524]) {
      expect(
        isRetryableR2Failure(`Failed to fetch - ${status}: provider error`),
      ).toBe(true);
    }
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("recognizes transport failures without retrying permanent failures", () => {
    expect(isRetryableR2Failure("TypeError: fetch failed")).toBe(true);
    expect(isRetryableR2Failure("Failed to fetch - 401: Unauthorized")).toBe(
      false,
    );
    expect(isRetryableR2Failure("Failed to fetch - 403: Forbidden")).toBe(
      false,
    );
    expect(isRetryableR2Failure("bucket not found - 404")).toBe(false);
    expect(isRetryableR2Failure("invalid configuration")).toBe(false);
  });

  it("allows only an absent history object, not an absent bucket", () => {
    expect(isMissingObjectFailure("Failed to fetch object - 404")).toBe(true);
    expect(isMissingObjectFailure("bucket not found - 404")).toBe(false);
    expect(extractHttpStatus("Failed to fetch - 522: <none>")).toBe(522);
  });

  it("keeps exponential backoff bounded and jittered", () => {
    expect(getRetryDelayMs(1, () => 0)).toBe(Math.round(BASE_DELAY_MS * 0.5));
    expect(getRetryDelayMs(2, () => 1)).toBe(BASE_DELAY_MS * 2);
    expect(getRetryDelayMs(20, () => 1)).toBe(MAX_DELAY_MS);
  });
});
