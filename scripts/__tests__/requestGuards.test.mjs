import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __resetRequestGuardState,
  isRateLimited,
} from "../../functions/_request-guards.js";

const MAX_TRACKED_CLIENTS = 2048;
const BASE = "https://example.com/api/test";

function requestFor(ip) {
  return new Request(BASE, {
    headers: { "CF-Connecting-IP": ip },
  });
}

function guardOptions(overrides = {}) {
  return {
    scope: "request-guard-test",
    limit: 1000,
    windowMs: 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  __resetRequestGuardState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("request guard capacity behavior", () => {
  it("fails closed for new clients after the live bucket cap", () => {
    const options = guardOptions();

    for (let i = 0; i < MAX_TRACKED_CLIENTS; i += 1) {
      expect(isRateLimited(requestFor(`client-${i}`), options)).toBe(false);
    }

    expect(isRateLimited(requestFor("unseen-client-a"), options)).toBe(true);
    expect(isRateLimited(requestFor("unseen-client-b"), options)).toBe(true);
    expect(isRateLimited(requestFor("unseen-client-a"), options)).toBe(true);
  });

  it("keeps an existing tracked client on its normal counter", () => {
    const options = guardOptions({ limit: 2 });
    const request = requestFor("tracked-client");

    expect(isRateLimited(request, options)).toBe(false);
    expect(isRateLimited(request, options)).toBe(false);
    expect(isRateLimited(request, options)).toBe(true);
  });

  it("reclaims expired buckets before allowing a new client", () => {
    vi.useFakeTimers();
    const options = guardOptions({ windowMs: 1_000 });

    for (let i = 0; i < MAX_TRACKED_CLIENTS; i += 1) {
      expect(isRateLimited(requestFor(`expiring-client-${i}`), options)).toBe(
        false,
      );
    }

    vi.advanceTimersByTime(1_001);

    expect(isRateLimited(requestFor("reclaimed-client"), options)).toBe(false);
    expect(isRateLimited(requestFor("another-new-client"), options)).toBe(
      false,
    );
  });
});
