/**
 * KAI-46: privacy-safe error event capture.
 *
 * POST /api/errors — validates the payload, enforces server-side abuse
 * controls, redacts every stored value, derives the caller's user id from
 * a verified Supabase session (when a Bearer token is supplied), inserts
 * into `error_events` via the service-role key, and opportunistically
 * enforces the 90-day retention policy.
 *
 * Privacy boundary: the same redaction the browser reporter applies is
 * applied again here before anything is stored — anyone can bypass the
 * browser and POST directly, so the server must not trust client-side
 * scrubbing. Client-supplied user ids are never trusted.
 */
import { redactSensitiveValues } from "../../src/shared/utils/redact.js";

const MAX_MESSAGE = 2000;
const MAX_BODY_BYTES = 16_384;
const RATE_LIMIT_PER_MINUTE = 30;
const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // at most hourly per isolate

const cap = (value, limit) =>
  typeof value === "string" ? value.slice(0, limit) : null;

/** Server-side abuse counter (in-isolate fallback; KV makes it durable). */
let sentThisMinute = 0;
let windowStart = Date.now();
let lastCleanupAt = 0;

/** Test-only: reset module state between test cases. */
export function __resetServerState() {
  sentThisMinute = 0;
  windowStart = Date.now();
  lastCleanupAt = 0;
}

const badRequest = (error) =>
  Response.json({ ok: false, error }, { status: 400 });

/** Per-minute abuse guard: KV-backed when the binding exists (durable
 *  across isolates), else a per-isolate sliding window (best-effort).
 *  Note: the KV path is a get → increment → put sequence — a best-effort
 *  distributed limiter, not a strictly atomic 30/min guarantee under
 *  concurrent requests (the in-isolate guard still bounds per-instance
 *  bursts, and the combination is a substantial improvement over
 *  client-only throttling). */
async function rateLimited(env, ip) {
  const minute = Math.floor(Date.now() / 60_000);
  if (env.ERROR_RATE_KV) {
    try {
      const key = `err:${ip}:${minute}`;
      const count = Number((await env.ERROR_RATE_KV.get(key)) ?? "0");
      await env.ERROR_RATE_KV.put(key, String(count + 1), {
        expirationTtl: 120,
      });
      return count >= RATE_LIMIT_PER_MINUTE;
    } catch {
      // KV unavailable — fall through to the in-isolate guard.
    }
  }
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    sentThisMinute = 0;
  }
  sentThisMinute += 1;
  return sentThisMinute > RATE_LIMIT_PER_MINUTE;
}

/** Best-effort retention cleanup: delete rows older than 90 days, at most
 *  once per hour per isolate, run after the response is returned. The
 *  DELETE targets the SUPABASE host — building it from request.url would
 *  point at the Meguruto origin and silently no-op. */
function scheduleRetentionCleanup(env) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  const cutoff = new Date(now - RETENTION_MS).toISOString();
  const url = new URL("/rest/v1/error_events", env.SUPABASE_URL);
  url.searchParams.set("created_at", `lt.${cutoff}`);
  env.__waitUntil?.(
    fetch(url, {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }).catch(() => {
      // Best-effort: retention is a policy guard, not a hard requirement
      // per request.
    }),
  );
}

export const onRequest = async (context) => {
  const { request, env } = context;
  const waitUntil = context.waitUntil ?? env.__waitUntil;

  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "method_not_allowed" },
      { status: 405 },
    );
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("errors: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return Response.json(
      { ok: false, error: "not_configured" },
      { status: 500 },
    );
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (await rateLimited(env, ip)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // Size cap BEFORE parsing: a huge body must not reach JSON.parse.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 },
    );
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest("invalid_json");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("invalid_body");
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return badRequest("invalid_message");
  }

  // user_id is derived server-side by verifying the caller's Supabase
  // token. A client-supplied user id is never trusted.
  let user_id = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: authHeader,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        },
      });
      if (userRes.ok) {
        const user = await userRes.json();
        user_id = user?.id ?? null;
      }
    } catch (err) {
      console.error("errors: user verification failed", err);
    }
  }

  // Every stored value passes through the shared redactor.
  const redact = redactSensitiveValues;
  const row = {
    message: redact(message.slice(0, MAX_MESSAGE)),
    feature: redact(cap(body.feature, 64)) ?? "app",
    route: redact(cap(body.route, 200)),
    locale: redact(cap(body.locale, 16)),
    app_version: redact(cap(body.appVersion, 32)),
    commit_sha: redact(cap(body.commitSha, 40)),
    browser: redact(cap(body.browser, 16)),
    error_name: redact(cap(body.errorName, 64)),
    stack_head: redact(cap(body.stackHead, 500)),
    user_id,
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/error_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`errors: insert failed ${res.status}`, detail);
    return Response.json(
      { ok: false, error: "storage_failed" },
      { status: 502 },
    );
  }

  scheduleRetentionCleanup({ ...env, __waitUntil: waitUntil });

  return Response.json({ ok: true }, { status: 201 });
};
