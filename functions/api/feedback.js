/**
 * KAI-96: durable owner-visible feedback capture.
 *
 * POST /api/feedback — validates the payload, then inserts into the Supabase
 * `feedback` table using the service-role key. The service key lives only in
 * server-side environment (Cloudflare Pages settings, or `.dev.vars` locally);
 * it is never exposed to the client bundle.
 *
 * Requires env vars (see .dev.vars.example):
 *   SUPABASE_URL              — https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 *
 * Schema: run supabase/migrations/001_feedback.sql in the Supabase SQL editor
 * before deploying (rollback: DROP TABLE feedback).
 */

const VALID_TYPES = new Set(["general", "feature", "bug"]);
const MAX_MESSAGE = 2000;
const MAX_FIELD = 200;

const cap = (value, limit) =>
  typeof value === "string" ? value.slice(0, limit) : null;

const validUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const badRequest = (error) =>
  Response.json({ ok: false, error }, { status: 400 });

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "method_not_allowed" },
      { status: 405 },
    );
  }

  let body;
  try {
    body = await request.json();
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

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "feedback: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured",
    );
    return Response.json(
      { ok: false, error: "not_configured" },
      { status: 500 },
    );
  }

  const row = {
    type,
    message,
    route: cap(body.route, MAX_FIELD),
    locale: cap(body.locale, 16),
    app_version: cap(body.app_version, 32),
    browser_class: cap(body.browser_class, 32),
    user_id: validUuid(body.user_id) ? body.user_id : null,
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/feedback`, {
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
    console.error(`feedback: supabase insert failed ${res.status}`, detail);
    return Response.json(
      { ok: false, error: "storage_failed" },
      { status: 502 },
    );
  }

  return Response.json({ ok: true }, { status: 201 });
};
