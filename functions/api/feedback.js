/**
 * KAI-96 + KAI-137: durable owner-visible feedback capture.
 *
 * POST /api/feedback — validates the payload, then inserts into the Supabase
 * `feedback` table. The secret key lives only in server-side environment
 * (Cloudflare Pages settings, or `.dev.vars` locally); it is never exposed
 * to the client bundle.
 *
 * KAI-137: Supabase's modern key model. The `sb_secret_...` key
 * (SUPABASE_SECRET_KEY) is sent ONLY through the `apikey` header — never as
 * `Authorization: Bearer` (that header is reserved for user session tokens).
 * The legacy SUPABASE_SERVICE_ROLE_KEY JWT is no longer required.
 *
 * Requires env vars (see .dev.vars.example):
 *   SUPABASE_URL          — https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY   — modern `sb_secret_...` key (bypasses RLS)
 *
 * Schema: run supabase/migrations/001_feedback.sql in the Supabase SQL editor
 * before deploying (rollback: DROP TABLE feedback).
 */
import { isRateLimited, rateLimitResponse } from "../_request-guards.js";

const VALID_TYPES = new Set(["general", "feature", "bug"]);
const MAX_MESSAGE = 2000;
const MAX_FIELD = 200;
const MAX_BODY_BYTES = 8192;
const FEEDBACK_RATE_LIMIT = {
  scope: "feedback",
  limit: 3,
  windowMs: 10 * 60 * 1000,
};

const cap = (value, limit) =>
  typeof value === "string" ? value.slice(0, limit) : null;

const badRequest = (error) =>
  Response.json({ ok: false, error }, { status: 400 });

/**
 * Best-effort owner notification (Resend, free tier: 3k/mo, 100/day).
 * Never fails the submission — feedback is already durably captured in
 * Supabase; the email is a convenience notification to info@meguruto.app.
 * Requires RESEND_API_KEY (and a domain verified in Resend); RESEND_FROM
 * defaults to feedback@meguruto.app.
 */
const notifyOwner = async (env, row) => {
  if (!env.RESEND_API_KEY) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || "Meguruto <feedback@meguruto.app>",
        to: ["info@meguruto.app"],
        subject: `[Meguruto feedback:${row.type}] ${row.message.slice(0, 60)}`,
        text: [
          `Type: ${row.type}`,
          "Message:",
          row.message,
          "---",
          `Route: ${row.route ?? "-"}`,
          `Locale: ${row.locale ?? "-"}`,
          `App version: ${row.app_version ?? "-"}`,
          `Browser: ${row.browser_class ?? "-"}`,
          `User: ${row.user_id ?? "anonymous"}`,
          `Received: ${new Date().toISOString()}`,
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      console.error(
        `feedback: resend failed ${res.status}`,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error("feedback: owner email notification failed", err);
  }
};

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "method_not_allowed" },
      { status: 405 },
    );
  }

  if (isRateLimited(request, FEEDBACK_RATE_LIMIT)) {
    return rateLimitResponse(600);
  }

  let body;
  let raw;
  try {
    raw = await request.text();
  } catch {
    return badRequest("invalid_json");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 },
    );
  }
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest("invalid_json");
  }
  if (typeof body !== "object" || body === null)
    return badRequest("invalid_json");

  const type = body.type;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!VALID_TYPES.has(type)) return badRequest("invalid_type");
  if (!message || message.length > MAX_MESSAGE) {
    return badRequest("invalid_message");
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error(
      "feedback: SUPABASE_URL / SUPABASE_SECRET_KEY not configured",
    );
    return Response.json(
      {
        ok: false,
        error: "not_configured",
        handlerVersion: "kai-137-envdiag-1",
        hasSupabaseUrl: Boolean(env?.SUPABASE_URL),
        hasSupabaseSecretKey: Boolean(env?.SUPABASE_SECRET_KEY),
      },
      { status: 500 },
    );
  }

  // user_id is NEVER taken from the client body — it is derived server-side
  // by verifying the caller's Supabase session token (GoTrue /auth/v1/user).
  // Unverified/unauthenticated callers get null.
  const authHeader = request.headers.get("Authorization");
  let user_id = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          // The caller's own session access token.
          Authorization: authHeader,
          // KAI-137: the secret key rides separately as apikey — it is
          // never substituted into Authorization.
          apikey: env.SUPABASE_SECRET_KEY,
        },
      });
      if (userRes.ok) {
        const user = await userRes.json();
        user_id = user?.id ?? null;
      }
    } catch (err) {
      console.error("feedback: user verification failed", err);
    }
  }

  const row = {
    type,
    message,
    route: cap(body.route, MAX_FIELD),
    locale: cap(body.locale, 16),
    app_version: cap(body.app_version, 32),
    browser_class: cap(body.browser_class, 32),
    user_id,
  };

  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // KAI-137: the modern sb_secret_... key is sent ONLY as apikey.
        // Authorization must NOT carry the secret key.
        apikey: env.SUPABASE_SECRET_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (err) {
    // Network failure on the insert — same honest 502 as a non-2xx.
    console.error("feedback: supabase insert request failed", err);
    return Response.json(
      { ok: false, error: "storage_failed" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`feedback: supabase insert failed ${res.status}`, detail);
    return Response.json(
      { ok: false, error: "storage_failed" },
      { status: 502 },
    );
  }

  // Background owner notification — does not block or fail the submission.
  context.waitUntil(notifyOwner(env, row));

  return Response.json({ ok: true }, { status: 201 });
};
