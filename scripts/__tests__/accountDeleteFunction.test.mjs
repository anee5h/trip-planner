/**
 * KAI-44: server-side tests for POST /api/account/delete
 * (functions/api/account/delete.js).
 *
 * A destructive endpoint needs destructive-endpoint tests: authorization,
 * server-enforced recent authentication (stale tokens rejected BEFORE any
 * DELETE), wrong-user attempts, per-table ownership columns, stage
 * ordering, partial-failure reporting, retry/idempotency, env fail-closed,
 * network exceptions at every stage, and Auth-delete-last.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest } from "../../functions/api/account/delete.js";
import { __resetRequestGuardState } from "../../functions/_request-guards.js";

const BASE = "https://example.com/api/account/delete";
const TEST_ENV = {
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
  SUPABASE_PUBLISHABLE_KEY: "fake-publishable-key",
};

const VERIFIED_UID = "verified-user-123";
// amr[].timestamp is UNIX SECONDS (like iat/exp), not milliseconds.
const FRESH_AMR = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
const STALE_AMR = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

/** Builds a fake JWT: base64url(header).base64url(payload).fake-signature. */
function makeJwt(claims) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: VERIFIED_UID, role: "authenticated", ...claims }),
  ).toString("base64url");
  return `${header}.${payload}.ZmFrZS1zaWduYXR1cmU`;
}

/** Access token with an amr claim at the given authentication timestamp. */
function accessTokenWithAmr(timestamp) {
  return makeJwt({
    amr: [{ method: "oauth", timestamp, provider: "google" }],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

const FRESH_TOKEN = accessTokenWithAmr(FRESH_AMR);
const STALE_TOKEN = accessTokenWithAmr(STALE_AMR);
const NO_AMR_TOKEN = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

/**
 * Scripted Supabase mock. Behavior:
 *   authUser     — id returned by /auth/v1/user, or null → 401
 *   authStatus   — /auth/v1/user HTTP status (default 200)
 *   grantStatus  — password-grant response status (200 ok / 400 wrong pw)
 *   grantUser    — user id returned by a successful password grant
 *   tableStatus  — { trips, user_data, feedback } DELETE statuses (204 ok)
 *   adminStatus  — Auth admin DELETE status (204 ok)
 *   throwOn      — stage whose fetch() should reject (network exception)
 * Records every call so tests can assert ordering and filter columns.
 */
function mockSupabase({
  authUser = VERIFIED_UID,
  authStatus = 200,
  grantStatus = 200,
  grantUser = VERIFIED_UID,
  tableStatus = {},
  adminStatus = 204,
  throwOn = null,
} = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", init });
    if (throwOn) {
      const stage =
        throwOn === "admin"
          ? "admin"
          : throwOn === "auth"
            ? "auth"
            : throwOn === "grant"
              ? "grant"
              : "table";
      const isStage =
        stage === "admin"
          ? u.includes("/auth/v1/admin/users/")
          : stage === "auth"
            ? u.includes("/auth/v1/user")
            : stage === "grant"
              ? u.includes("grant_type=password")
              : /\/rest\/v1\/(trips|user_data|feedback)\?/.test(u);
      if (isStage) throw new Error(`network down (${throwOn})`);
    }
    if (u.includes("grant_type=password")) {
      if (grantStatus !== 200) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: grantStatus,
        });
      }
      return new Response(JSON.stringify({ user: { id: grantUser } }), {
        status: 200,
      });
    }
    if (u.includes("/auth/v1/user")) {
      if (authStatus !== 200) {
        return new Response("{}", { status: authStatus });
      }
      return authUser
        ? new Response(JSON.stringify({ id: authUser }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    const table = u.match(/\/rest\/v1\/(trips|user_data|feedback)\?/)?.[1];
    if (table) {
      const status = tableStatus[table] ?? 204;
      return new Response(null, { status });
    }
    if (u.includes("/auth/v1/admin/users/")) {
      return new Response(null, { status: adminStatus });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function postContext({
  env = TEST_ENV,
  authHeader = `Bearer ${FRESH_TOKEN}`,
  body = { reauthMode: "otp" },
} = {}) {
  const headers = {};
  if (authHeader) headers.Authorization = authHeader;
  return {
    request: new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env,
  };
}

const tableDeleteCalls = (calls) =>
  calls.filter((c) => c.url.includes("/rest/v1/"));
const authDeleteCalled = (calls) =>
  calls.some((c) => c.url.includes("/auth/v1/admin/users/"));

beforeEach(() => {
  __resetRequestGuardState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/account/delete — authorization", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await onRequest({
      request: new Request(BASE, { method: "GET" }),
      env: TEST_ENV,
    });
    expect(res.status).toBe(405);
  });

  it("rejects missing Authorization with 401", async () => {
    const res = await onRequest(postContext({ authHeader: null }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("rejects an invalid token with 401", async () => {
    mockSupabase({ authUser: null });
    const res = await onRequest(postContext());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_session");
  });

  it("distinguishes upstream 5xx from a session rejection (502, not 401)", async () => {
    mockSupabase({ authStatus: 503 });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("verification_failed");
    expect(body.retrySafe).toBe(true);
  });

  it("treats 403 as a session rejection (401)", async () => {
    mockSupabase({ authStatus: 403 });
    const res = await onRequest(postContext());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_session");
  });

  it("fails closed with 500 when env vars are missing", async () => {
    const res = await onRequest(postContext({ env: {} }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("fails closed when the publishable key is missing", async () => {
    const res = await onRequest(
      postContext({
        env: {
          SUPABASE_URL: "https://fake.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
        },
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("rate-limits repeated attempts before session verification", async () => {
    const { calls } = mockSupabase();
    for (let i = 0; i < 3; i += 1) {
      expect((await onRequest(postContext({ body: {} }))).status).toBe(401);
    }
    const blocked = await onRequest(postContext({ body: {} }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");
    expect(calls).toHaveLength(0);
  });

  it("returns 502 with a retry-safe payload when session verification itself fails", async () => {
    mockSupabase({ throwOn: "auth" });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("verification_failed");
    expect(body.step).toBe("verify_session");
    expect(body.retrySafe).toBe(true);
  });
});

describe("POST /api/account/delete — server-enforced recent authentication", () => {
  it("rejects oversized UTF-8 payloads before session verification", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(
      postContext({
        body: {
          reauthMode: "password",
          email: "u@example.com",
          password: "あ".repeat(6000),
        },
      }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("payload_too_large");
    expect(calls).toHaveLength(0);
  });

  it("rejects requests without a reauthMode", async () => {
    mockSupabase();
    const res = await onRequest(postContext({ body: {} }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("reauth_required");
  });

  it("REJECTS a valid-but-stale session before any table DELETE (otp mode)", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(
      postContext({ authHeader: `Bearer ${STALE_TOKEN}` }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("reauth_required");
    expect(tableDeleteCalls(calls)).toHaveLength(0);
    expect(authDeleteCalled(calls)).toBe(false);
  });

  it("REJECTS tokens without an amr claim (cannot prove recent auth)", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(
      postContext({ authHeader: `Bearer ${NO_AMR_TOKEN}` }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("reauth_required");
    expect(tableDeleteCalls(calls)).toHaveLength(0);
  });

  it("accepts a session with recent authentication (otp mode)", async () => {
    mockSupabase();
    const res = await onRequest(postContext());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("requires email+password for reauthMode password", async () => {
    mockSupabase();
    const res = await onRequest(
      postContext({ body: { reauthMode: "password" } }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("reauth_failed");
  });

  it("rejects a wrong password (grant 400) with 401 and deletes nothing", async () => {
    const { calls } = mockSupabase({ grantStatus: 400 });
    const res = await onRequest(
      postContext({
        body: {
          reauthMode: "password",
          email: "u@example.com",
          password: "wrong",
        },
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("reauth_failed");
    expect(tableDeleteCalls(calls)).toHaveLength(0);
    expect(authDeleteCalled(calls)).toBe(false);
  });

  it("proceeds with deletion after a successful password grant", async () => {
    const { calls } = mockSupabase({
      grantStatus: 200,
      grantUser: VERIFIED_UID,
    });
    const res = await onRequest(
      postContext({
        body: {
          reauthMode: "password",
          email: "u@example.com",
          password: "correct",
        },
      }),
    );
    expect(res.status).toBe(200);
    // The password-grant (user authentication) request must carry the
    // PUBLISHABLE key — never the service-role credential.
    const grant = calls.find((c) => c.url.includes("grant_type=password"));
    expect(grant).toBeDefined();
    expect(grant.init.headers.apikey).toBe("fake-publishable-key");
    expect(grant.init.headers.Authorization).toBeUndefined();
  });

  it("rejects a grant whose user does not match the session user", async () => {
    const { calls } = mockSupabase({
      grantStatus: 200,
      grantUser: "other-user",
    });
    const res = await onRequest(
      postContext({
        body: {
          reauthMode: "password",
          email: "u@example.com",
          password: "correct",
        },
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("reauth_failed");
    expect(tableDeleteCalls(calls)).toHaveLength(0);
  });

  it("returns 502 when the password grant hits an upstream 5xx", async () => {
    mockSupabase({ grantStatus: 503 });
    const res = await onRequest(
      postContext({
        body: { reauthMode: "password", email: "u@example.com", password: "x" },
      }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("verification_failed");
  });

  it("returns 502 when the password grant request throws", async () => {
    mockSupabase({ throwOn: "grant" });
    const res = await onRequest(
      postContext({
        body: { reauthMode: "password", email: "u@example.com", password: "x" },
      }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("verification_failed");
  });
});

describe("POST /api/account/delete — target identity and ownership columns", () => {
  it("derives the target uid ONLY from the verified session (client cannot choose)", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(postContext());
    expect(res.status).toBe(200);
    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes.length).toBe(4); // 3 tables + auth user
    for (const call of deletes) {
      expect(call.url).toContain(VERIFIED_UID);
      expect(call.url).not.toContain("client-chosen-uid");
    }
  });

  it("deletes trips by user_id, user_data by id, feedback by user_id", async () => {
    const { calls } = mockSupabase();
    await onRequest(postContext());
    const tableCalls = tableDeleteCalls(calls);
    expect(tableCalls).toHaveLength(3);
    expect(tableCalls[0].url).toContain(
      `/rest/v1/trips?user_id=eq.${VERIFIED_UID}`,
    );
    expect(tableCalls[1].url).toContain(
      `/rest/v1/user_data?id=eq.${VERIFIED_UID}`,
    );
    expect(tableCalls[2].url).toContain(
      `/rest/v1/feedback?user_id=eq.${VERIFIED_UID}`,
    );
  });

  it("deletes the Auth user LAST (after every app table)", async () => {
    const { calls } = mockSupabase();
    await onRequest(postContext());
    const deleteOrder = calls
      .filter((c) => c.method === "DELETE")
      .map((c) => c.url);
    expect(deleteOrder[3]).toContain("/auth/v1/admin/users/");
    for (let i = 0; i < 3; i += 1) {
      expect(deleteOrder[i]).toContain("/rest/v1/");
    }
  });

  it("treats 404 table responses as already-deleted (idempotent retry)", async () => {
    mockSupabase({
      tableStatus: { trips: 404, user_data: 404, feedback: 404 },
    });
    const res = await onRequest(postContext());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toEqual({
      trips: true,
      user_data: true,
      feedback: true,
    });
  });
});

describe("POST /api/account/delete — partial failures and compensation", () => {
  it("does NOT delete the Auth user when the first table fails, and reports it", async () => {
    const { calls } = mockSupabase({ tableStatus: { trips: 500 } });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("data_deletion_failed");
    expect(body.step).toBe("delete_trips");
    expect(body.retrySafe).toBe(true);
    expect(body.deleted).toEqual({ trips: false });
    expect(authDeleteCalled(calls)).toBe(false);
  });

  it("reports already-completed steps when a later table fails", async () => {
    const { calls } = mockSupabase({ tableStatus: { user_data: 500 } });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.step).toBe("delete_user_data");
    expect(body.deleted).toEqual({ trips: true, user_data: false });
    expect(authDeleteCalled(calls)).toBe(false);
  });

  it("reports retry-safe state when Auth deletion fails after app data", async () => {
    mockSupabase({ adminStatus: 500 });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("auth_delete_failed");
    expect(body.step).toBe("delete_auth_user");
    expect(body.retrySafe).toBe(true);
    expect(body.deleted).toEqual({
      trips: true,
      user_data: true,
      feedback: true,
    });
  });

  it("gives an honest retry-safe response when a table DELETE request throws", async () => {
    mockSupabase({ throwOn: "trips" });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("data_deletion_failed");
    expect(body.step).toBe("delete_trips");
    expect(body.retrySafe).toBe(true);
    expect(body.deleted).toEqual({});
  });

  it("gives an honest retry-safe response when the Auth DELETE request throws", async () => {
    mockSupabase({ throwOn: "admin" });
    const res = await onRequest(postContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("auth_delete_failed");
    expect(body.step).toBe("delete_auth_user");
    expect(body.retrySafe).toBe(true);
    expect(body.deleted).toEqual({
      trips: true,
      user_data: true,
      feedback: true,
    });
  });

  it("returns 200 with the deleted manifest on full success", async () => {
    mockSupabase();
    const res = await onRequest(postContext());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toEqual({
      trips: true,
      user_data: true,
      feedback: true,
    });
  });
});
