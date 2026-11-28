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
  reportErrorAndWait,
} from "@/shared/utils/errorReporter";
import {
  __resetChunkLoadRecoveryForTests,
  CHUNK_RECOVERY_SESSION_KEY,
  installChunkLoadRecovery,
} from "@/shared/utils/chunkLoadRecovery";

// Session lookup mock: signed-out by default; individual tests flip it.
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

describe("KAI-46 error reporter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetErrorReporter();
    __resetChunkLoadRecoveryForTests();
    window.sessionStorage.removeItem(CHUNK_RECOVERY_SESSION_KEY);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    installChunkLoadRecovery();
    installGlobalErrorHandlers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetChunkLoadRecoveryForTests();
    __resetErrorReporter();
  });

  it("posts a privacy-safe payload with context", async () => {
    reportError(new Error("boom"), "test-feature");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("/api/errors");
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
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
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
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
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
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-access-token",
    );
  });

  it("sends no Authorization header when signed out", async () => {
    reportError(new Error("boom"), "f");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it("rate-limits to 10 reports per minute", async () => {
    for (let index = 0; index < 15; index += 1) {
      reportError(new Error(`e${index}`));
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("global handlers capture window errors and rejections", async () => {
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
    expect(
      fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(String((init as RequestInit).body)).feature,
      ),
    ).toEqual(["window", "promise"]);
  });

  it("reports chunk failures when recovery is cooling down or storage throws", async () => {
    window.sessionStorage.setItem(
      CHUNK_RECOVERY_SESSION_KEY,
      String(Date.now()),
    );
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Failed to fetch dynamically imported module",
        error: new Error("Failed to fetch dynamically imported module"),
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).feature).toBe(
      "window",
    );

    fetchMock.mockClear();
    const storageGetter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Storage is unavailable", "SecurityError");
      });
    const rejected = Promise.reject(
      new Error("Failed to fetch dynamically imported module"),
    );
    rejected.catch(() => {});
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: rejected,
        reason: new Error("Failed to fetch dynamically imported module"),
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).feature).toBe(
      "promise",
    );
    storageGetter.mockRestore();
  });

  it("sends a keepalive chunk-reload report through the shared reporter after the normal cap", async () => {
    for (let index = 0; index < 10; index += 1) {
      reportError(new Error(`ordinary error ${index}`), "test");
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));

    await reportErrorAndWait(
      new Error("Failed to fetch dynamically imported module"),
      "chunk-reload",
    );

    expect(fetchMock).toHaveBeenCalledTimes(11);
    const [, request] = fetchMock.mock.calls[10] as [string, RequestInit];
    expect(request.keepalive).toBe(true);
    expect(JSON.parse(String(request.body))).toMatchObject({
      feature: "chunk-reload",
      message: "Failed to fetch dynamically imported module",
    });
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
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const authFetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", authFetchMock);
    reportAuthFailureIfOperational(
      Object.assign(new Error("Invalid login credentials"), { status: 400 }),
      "sign-in",
    );
    reportAuthFailureIfOperational(
      Object.assign(new Error("supabase auth is down"), { status: 500 }),
      "sign-in",
    );
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(authFetchMock.mock.calls[0][1].body));
    expect(body.feature).toBe("auth:sign-in");
    expect(body.message).toBe("supabase auth is down");
  });
});
