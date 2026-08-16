/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetErrorReporter,
  installGlobalErrorHandlers,
  isOperationalAuthFailure,
  reportAuthFailureIfOperational,
  reportError,
} from "../errorReporter";

// Session lookup mock: signed-out by default; individual tests flip it.
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

describe("KAI-46 error reporter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetErrorReporter();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts a privacy-safe payload with context", async () => {
    reportError(new Error("boom"), "test-feature");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/errors");
    const body = JSON.parse(init.body);
    expect(body.message).toBe("boom");
    expect(body.errorName).toBe("Error");
    expect(body.feature).toBe("test-feature");
    expect(body.appVersion).toBeDefined();
    expect(body.commitSha).toBeDefined();
    expect(body.route).toBeDefined();
    expect(body.locale).toBeDefined();
    expect(body.browser).toBeDefined();
  });

  it("never includes tokens, payloads or raw event data", async () => {
    reportError(
      new Error("sync failed (database connection refused)"),
      "trips-sync",
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Only the documented context keys are transmitted — nothing from
    // cookies, localStorage, headers or the DOM is copied in.
    expect(Object.keys(body).sort()).toEqual([
      "appVersion",
      "browser",
      "commitSha",
      "errorName",
      "feature",
      "locale",
      "message",
      "route",
      "stackHead",
    ]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("localStorage");
    expect(serialized).not.toContain("authorization");
  });

  it("redacts JWTs, Bearer tokens, secret keys and emails from the payload", async () => {
    const leaky = new Error(
      "auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake " +
        "sb_secret_AAAAAAAAAAAAAAAA owner@example.com?access_token=supersecretvalue123",
    );
    reportError(leaky, "auth:sign-in");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.message).toContain("[REDACTED]");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("eyJhbGci");
    expect(serialized).not.toContain("sb_secret_");
    expect(serialized).not.toContain("owner@example.com");
    expect(serialized).not.toContain("supersecretvalue123");
  });

  it("attaches the Supabase access token best-effort when signed in", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-access-token" } },
    });
    reportError(new Error("boom"), "f");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
  });

  it("sends no Authorization header when signed out", async () => {
    reportError(new Error("boom"), "f");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("rate-limits to 10 reports per minute", async () => {
    for (let i = 0; i < 15; i += 1) reportError(new Error(`e${i}`));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("global handlers capture window errors and rejections", async () => {
    installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    const rejected = Promise.reject(new Error("rejected"));
    rejected.catch(() => {}); // consume so the fixture is not an unhandled rejection
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: rejected,
        reason: new Error("rejected"),
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("never throws when delivery fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(() => reportError(new Error("x"), "f")).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe("KAI-46 auth failure classification", () => {
  it("treats user-input failures (400) as non-operational", () => {
    expect(
      isOperationalAuthFailure({
        status: 400,
        message: "Invalid login credentials",
      }),
    ).toBe(false);
  });

  it("treats rate limits (429) and server faults (>=500) as operational", () => {
    expect(isOperationalAuthFailure({ status: 429 })).toBe(true);
    expect(isOperationalAuthFailure({ status: 500 })).toBe(true);
    expect(isOperationalAuthFailure({ status: 502 })).toBe(true);
  });

  it("treats network/unknown errors (no status) as operational", () => {
    expect(isOperationalAuthFailure(new TypeError("Failed to fetch"))).toBe(
      true,
    );
    expect(isOperationalAuthFailure("something broke")).toBe(true);
  });

  it("reports operational auth failures but stays silent on 400 validation", async () => {
    __resetErrorReporter();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    reportAuthFailureIfOperational(
      Object.assign(new Error("Invalid login credentials"), { status: 400 }),
      "sign-in",
    );
    reportAuthFailureIfOperational(
      Object.assign(new Error("supabase auth is down"), { status: 500 }),
      "sign-in",
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.feature).toBe("auth:sign-in");
    expect(body.message).toBe("supabase auth is down");
  });
});
