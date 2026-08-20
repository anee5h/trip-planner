/**
 * KAI-137: server-side tests for POST /api/feedback
 * (functions/api/feedback.js).
 *
 * Covers the modern Supabase secret-key model: the sb_secret_... key
 * (SUPABASE_SECRET_KEY) is sent ONLY through the `apikey` header — never
 * as Authorization: Bearer. Anonymous + authenticated submissions, success,
 * backend failure, and correct headers on both the insert and the
 * session-verification calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest } from "../../functions/api/feedback.js";

const BASE = "https://example.com/api/feedback";
const TEST_ENV = {
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_fake-secret-key",
};

const VERIFIED_UID = "verified-user-123";

/**
 * Scripted Supabase mock. Behavior:
 *   authUser     — id returned by /auth/v1/user, or null → 401
 *   authStatus   — /auth/v1/user HTTP status (default 200)
 *   insertStatus — /rest/v1/feedback POST status (201 ok)
 *   throwOn      — "auth" or "insert": fetch() rejects (network exception)
 * Records every call so tests can assert headers and payloads.
 */
function mockSupabase({
  authUser = VERIFIED_UID,
  authStatus = 200,
  insertStatus = 201,
  throwOn = null,
} = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", init });
    if (throwOn === "auth" && u.includes("/auth/v1/user")) {
      throw new Error("network down (auth)");
    }
    if (throwOn === "insert" && u.includes("/rest/v1/feedback")) {
      throw new Error("network down (insert)");
    }
    if (u.includes("/auth/v1/user")) {
      if (authStatus !== 200) {
        return new Response("{}", { status: authStatus });
      }
      return authUser
        ? new Response(JSON.stringify({ id: authUser }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (u.includes("/rest/v1/feedback")) {
      return new Response(null, { status: insertStatus });
    }
    // Resend (owner notification) — success, does not affect the result.
    if (u.includes("api.resend.com")) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function postContext({
  env = TEST_ENV,
  authHeader = null,
  body = { type: "general", message: "Hello from a test" },
} = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;
  return {
    request: new Request(BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    env,
    waitUntil: vi.fn(),
  };
}

const insertCall = (calls) =>
  calls.find((c) => c.url.includes("/rest/v1/feedback"));
const authCall = (calls) => calls.find((c) => c.url.includes("/auth/v1/user"));

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/feedback — validation", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await onRequest({
      request: new Request(BASE, { method: "GET" }),
      env: TEST_ENV,
    });
    expect(res.status).toBe(405);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await onRequest({
      request: new Request(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      env: TEST_ENV,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("rejects an invalid type with 400", async () => {
    const res = await onRequest(
      postContext({ body: { type: "spam", message: "x" } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_type");
  });

  it("rejects an empty message with 400", async () => {
    const res = await onRequest(
      postContext({ body: { type: "general", message: "   " } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_message");
  });

  it("fails closed with 500 when the secret key env is missing", async () => {
    const res = await onRequest(
      postContext({ env: { SUPABASE_URL: "https://fake.supabase.co" } }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("not_configured");
  });
});

describe("POST /api/feedback — anonymous submission", () => {
  it("inserts without a user_id and without an Authorization header", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(postContext({ authHeader: null }));
    expect(res.status).toBe(201);
    expect((await res.json()).ok).toBe(true);

    const insert = insertCall(calls);
    expect(insert).toBeDefined();
    const payload = JSON.parse(insert.init.body);
    expect(payload.user_id).toBeNull();
    expect(payload.type).toBe("general");
    expect(payload.message).toBe("Hello from a test");
    // The insert must carry the secret key ONLY as apikey.
    expect(insert.init.headers.apikey).toBe(TEST_ENV.SUPABASE_SECRET_KEY);
    expect(insert.init.headers.Authorization).toBeUndefined();
    // No session-verification call happens for anonymous callers.
    expect(authCall(calls)).toBeUndefined();
  });
});

describe("POST /api/feedback — authenticated submission", () => {
  it("verifies the session and stores the derived user_id", async () => {
    const { calls } = mockSupabase({ authUser: VERIFIED_UID });
    const res = await onRequest(
      postContext({ authHeader: "Bearer fake-session-token" }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).ok).toBe(true);

    const insert = insertCall(calls);
    const payload = JSON.parse(insert.init.body);
    expect(payload.user_id).toBe(VERIFIED_UID);

    // Session verification: the caller's token stays as Authorization:
    // Bearer, and the secret key rides separately as apikey.
    const auth = authCall(calls);
    expect(auth).toBeDefined();
    expect(auth.init.headers.Authorization).toBe("Bearer fake-session-token");
    expect(auth.init.headers.apikey).toBe(TEST_ENV.SUPABASE_SECRET_KEY);
  });

  it("treats a rejected session as anonymous (user_id null), still succeeds", async () => {
    const { calls } = mockSupabase({ authUser: null, authStatus: 401 });
    const res = await onRequest(
      postContext({ authHeader: "Bearer stale-token" }),
    );
    expect(res.status).toBe(201);
    const payload = JSON.parse(insertCall(calls).init.body);
    expect(payload.user_id).toBeNull();
  });

  it("degrades to anonymous when session verification throws", async () => {
    const { calls } = mockSupabase({ throwOn: "auth" });
    const res = await onRequest(
      postContext({ authHeader: "Bearer fake-session-token" }),
    );
    expect(res.status).toBe(201);
    const payload = JSON.parse(insertCall(calls).init.body);
    expect(payload.user_id).toBeNull();
  });
});

describe("POST /api/feedback — backend failure", () => {
  it("returns 502 storage_failed when the insert is rejected", async () => {
    mockSupabase({ insertStatus: 500 });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_failed");
  });

  it("returns 502 storage_failed when the insert request throws", async () => {
    mockSupabase({ throwOn: "insert" });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_failed");
  });
});

describe("POST /api/feedback — header contract (KAI-137)", () => {
  it("never sends the secret key as Authorization: Bearer on ANY call", async () => {
    const { calls } = mockSupabase();
    await onRequest(postContext({ authHeader: "Bearer user-token" }));
    for (const call of calls) {
      const auth = call.init.headers.Authorization;
      expect(auth).not.toBe(`Bearer ${TEST_ENV.SUPABASE_SECRET_KEY}`);
      if (auth !== undefined) {
        expect(auth).not.toContain(TEST_ENV.SUPABASE_SECRET_KEY);
      }
    }
  });

  it("sends the secret key as apikey on both the insert and verification", async () => {
    const { calls } = mockSupabase();
    await onRequest(postContext({ authHeader: "Bearer user-token" }));
    expect(insertCall(calls).init.headers.apikey).toBe(
      TEST_ENV.SUPABASE_SECRET_KEY,
    );
    expect(authCall(calls).init.headers.apikey).toBe(
      TEST_ENV.SUPABASE_SECRET_KEY,
    );
  });

  it("caps long fields and trims the message", async () => {
    const { calls } = mockSupabase();
    await onRequest(
      postContext({
        body: {
          type: "bug",
          message: "  padded message  ",
          route: "x".repeat(500),
          locale: "en",
          app_version: "2.0.0",
          browser_class: "mobile",
        },
      }),
    );
    const payload = JSON.parse(insertCall(calls).init.body);
    expect(payload.message).toBe("padded message");
    expect(payload.route).toHaveLength(200); // capped at MAX_FIELD
    expect(payload.locale).toBe("en");
    expect(payload.app_version).toBe("2.0.0");
    expect(payload.browser_class).toBe("mobile");
  });
});
