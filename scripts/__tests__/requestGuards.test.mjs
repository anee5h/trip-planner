import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __getRequestGuardStats,
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

describe("request guard CPU fast path", () => {
  it("does not prune globally for an active existing client", () => {
    const options = guardOptions({ limit: 2 });
    const request = requestFor("tracked-client");

    expect(isRateLimited(request, options)).toBe(false);
    expect(isRateLimited(request, options)).toBe(false);
    expect(isRateLimited(request, options)).toBe(true);

    expect(__getRequestGuardStats()).toEqual({
      bucketCount: 1,
      pruneCount: 0,
    });
  });

  it("admits a new client below capacity without pruning", () => {
    expect(isRateLimited(requestFor("new-client"), guardOptions())).toBe(false);

    expect(__getRequestGuardStats()).toEqual({
      bucketCount: 1,
      pruneCount: 0,
    });
  });
});

describe("request guard capacity behavior", () => {
  it("fails closed for new clients after the live bucket cap", () => {
    const options = guardOptions({ limit: 2 });

    for (let i = 0; i < MAX_TRACKED_CLIENTS; i += 1) {
      expect(isRateLimited(requestFor(`client-${i}`), options)).toBe(false);
    }

    expect(__getRequestGuardStats()).toEqual({
      bucketCount: MAX_TRACKED_CLIENTS,
      pruneCount: 0,
    });
    expect(isRateLimited(requestFor("unseen-client-a"), options)).toBe(true);
    expect(isRateLimited(requestFor("unseen-client-b"), options)).toBe(true);
    expect(isRateLimited(requestFor("unseen-client-a"), options)).toBe(true);
    expect(__getRequestGuardStats()).toEqual({
      bucketCount: MAX_TRACKED_CLIENTS,
      pruneCount: 3,
    });

    const existing = requestFor("client-0");
    expect(isRateLimited(existing, options)).toBe(false);
    expect(isRateLimited(existing, options)).toBe(true);
    expect(__getRequestGuardStats()).toEqual({
      bucketCount: MAX_TRACKED_CLIENTS,
      pruneCount: 3,
    });
  });

  it("resets an expired bucket belonging to the requesting client", () => {
    vi.useFakeTimers();
    const options = guardOptions({ limit: 1, windowMs: 1_000 });
    const request = requestFor("expired-client");

    expect(isRateLimited(request, options)).toBe(false);
    vi.advanceTimersByTime(1_001);

    expect(isRateLimited(request, options)).toBe(false);
    expect(isRateLimited(request, options)).toBe(true);
    expect(__getRequestGuardStats()).toEqual({
      bucketCount: 1,
      pruneCount: 0,
    });
  });

  it("prunes on the full-capacity path and admits a client after reclaiming expired state", () => {
    vi.useFakeTimers();
    const expiringOptions = guardOptions({ windowMs: 1_000 });
    const activeOptions = guardOptions({ windowMs: 60_000 });

    expect(isRateLimited(requestFor("expiring-client"), expiringOptions)).toBe(
      false,
    );
    vi.advanceTimersByTime(1_001);

    for (let i = 0; i < MAX_TRACKED_CLIENTS - 1; i += 1) {
      expect(
        isRateLimited(requestFor(`active-client-${i}`), activeOptions),
      ).toBe(false);
    }

    expect(__getRequestGuardStats()).toEqual({
      bucketCount: MAX_TRACKED_CLIENTS,
      pruneCount: 0,
    });
    expect(isRateLimited(requestFor("reclaimed-client"), activeOptions)).toBe(
      false,
    );
    expect(__getRequestGuardStats()).toEqual({
      bucketCount: MAX_TRACKED_CLIENTS,
      pruneCount: 1,
    });
  });
});
