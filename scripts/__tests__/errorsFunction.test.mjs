/**
 * KAI-46: server-side tests for POST /api/errors (functions/api/errors.js).
 *
 * These exercise the real handler with mocked fetch/env — proving the
 * ingestion endpoint rejects malformed bodies, ignores client-supplied
 * user ids, derives authenticated ids, redacts stored values, enforces
 * abuse controls and fails closed on misconfiguration. Anyone can bypass
 * the browser reporter and POST directly, so the server contract is what
 * matters.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest, __resetServerState } from "../../functions/api/errors.js";
import { __resetRequestGuardState } from "../../functions/_request-guards.js";

const BASE = "https://example.com/api/errors";
const TEST_ENV = {
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
};

function makeContext({ body, raw, authHeader, env = TEST_ENV, ip }) {
  const headers = {};
  if (authHeader) headers.Authorization = authHeader;
  if (body !== undefined && raw === undefined) {
    return {
      request: new Request(BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
          ...(ip ? { "CF-Connecting-IP": ip } : {}),
        },
        body: JSON.stringify(body),
      }),
      env: { ...env, __waitUntil: vi.fn() },
    };
  }
  return {
    request: new Request(BASE, {
      method: "POST",
      headers: { ...headers, ...(ip ? { "CF-Connecting-IP": ip } : {}) },
      body: raw,
    }),
    env: { ...env, __waitUntil: vi.fn() },
  };
}

/** fetch mock that records every REST call made by the handler. */
function mockSupabase({ authUser = null, insertOk = true } = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/user")) {
      return authUser
        ? new Response(JSON.stringify({ id: authUser }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (
      String(url).includes("/rest/v1/error_events") &&
      init?.method === "POST"
    ) {
      return insertOk
        ? new Response(null, { status: 201 })
        : new Response("insert failed", { status: 500 });
    }
    if (
      String(url).includes("/rest/v1/error_events") &&
      init?.method === "DELETE"
    ) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

const VALID_BODY = {
  message: "boom",
  feature: "test-feature",
  route: "/settings",
  locale: "en",
  appVersion: "2.0.0-beta.1",
  commitSha: "abc123def456",
  browser: "macos",
  errorName: "Error",
  stackHead: "Error: boom\n    at fn (file.js:1:1)",
};

beforeEach(() => {
  __resetServerState();
  __resetRequestGuardState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/errors — validation and guards", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await onRequest({
      request: new Request(BASE, { method: "GET" }),
      env: TEST_ENV,
    });
    expect(res.status).toBe(405);
  });

  it("fails closed with 500 when required env vars are missing", async () => {
    const res = await onRequest(makeContext({ body: VALID_BODY, env: {} }));
    expect(res.status).toBe(500);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await onRequest(makeContext({ raw: "not json" }));
    expect(res.status).toBe(400);
  });

  it("rejects null and array bodies with 400", async () => {
    expect((await onRequest(makeContext({ raw: "null" }))).status).toBe(400);
    expect((await onRequest(makeContext({ raw: "[1,2]" }))).status).toBe(400);
  });

  it("rejects empty or non-string messages with 400", async () => {
    expect(
      (await onRequest(makeContext({ body: { message: "   " } }))).status,
    ).toBe(400);
    expect(
      (await onRequest(makeContext({ body: { message: 42 } }))).status,
    ).toBe(400);
  });

  it("rejects payloads larger than 16 KiB with 413", async () => {
    const big = { message: "x".repeat(20_000) };
    const res = await onRequest(makeContext({ body: big }));
    expect(res.status).toBe(413);
  });

  it("rate-limits server-side after 30 requests per minute", async () => {
    mockSupabase({ insertOk: true });
    for (let i = 0; i < 30; i += 1) {
      const res = await onRequest(
        makeContext({ body: VALID_BODY, ip: "error-test-ip" }),
      );
      expect(res.status).toBe(201);
    }
    const blocked = await onRequest(
      makeContext({ body: VALID_BODY, ip: "error-test-ip" }),
    );
    expect(blocked.status).toBe(429);
    expect(
      (await onRequest(makeContext({ body: VALID_BODY, ip: "other-ip" })))
        .status,
    ).toBe(201);
  });
});

describe("POST /api/errors — attribution and privacy", () => {
  it("ignores client-supplied user ids and derives the id from the verified token", async () => {
    const { calls } = mockSupabase({ authUser: "server-side-user-id" });
    const res = await onRequest(
      makeContext({
        body: { ...VALID_BODY, userId: "client-forged-id" },
        authHeader: "Bearer test-access-token",
      }),
    );
    expect(res.status).toBe(201);
    const insert = calls.find((c) => c.init?.method === "POST");
    const row = JSON.parse(insert.init.body);
    expect(row.user_id).toBe("server-side-user-id");
    expect(row.user_id).not.toBe("client-forged-id");
    expect("userId" in row).toBe(false);
  });

  it("stores user_id null when no session token is sent (signed out)", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(makeContext({ body: VALID_BODY }));
    expect(res.status).toBe(201);
    const insert = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(insert.init.body).user_id).toBeNull();
  });

  it("redacts JWTs, sb_secret_ keys and emails before storing", async () => {
    const { calls } = mockSupabase();
    const res = await onRequest(
      makeContext({
        body: {
          ...VALID_BODY,
          message:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake",
          stackHead:
            "contact owner@example.com or rotate sb_secret_AAAAAAAAAAAAAAAA",
        },
      }),
    );
    expect(res.status).toBe(201);
    const row = JSON.parse(
      calls.find((c) => c.init?.method === "POST").init.body,
    );
    expect(row.message).toContain("[REDACTED]");
    expect(row.stack_head).toContain("[REDACTED]");
    expect(JSON.stringify(row)).not.toContain("eyJhbGci");
    expect(JSON.stringify(row)).not.toContain("owner@example.com");
    expect(JSON.stringify(row)).not.toContain("sb_secret_");
  });

  it("returns 502 when the storage insert fails", async () => {
    mockSupabase({ insertOk: false });
    const res = await onRequest(makeContext({ body: VALID_BODY }));
    expect(res.status).toBe(502);
  });

  it("runs the 90-day retention DELETE against the SUPABASE host", async () => {
    const { calls } = mockSupabase();
    const context = makeContext({ body: VALID_BODY });
    const res = await onRequest(context);
    expect(res.status).toBe(201);
    // Execute the queued waitUntil promise (the retention cleanup) and
    // assert its destination — building the URL from request.url would
    // point the DELETE at the Meguruto origin and silently no-op.
    expect(context.env.__waitUntil).toHaveBeenCalledTimes(1);
    await context.env.__waitUntil.mock.calls[0][0];
    const del = calls.find((c) => c.init?.method === "DELETE");
    expect(del).toBeDefined();
    const url = new URL(del.url);
    expect(url.hostname).toBe("fake.supabase.co");
    expect(url.pathname).toBe("/rest/v1/error_events");
    expect(url.searchParams.get("created_at")).toMatch(
      /^lt\.\d{4}-\d{2}-\d{2}T/,
    );
    expect(del.init.headers.apikey).toBe("fake-service-key");
    expect(del.init.headers.Authorization).toBe("Bearer fake-service-key");
  });
});
