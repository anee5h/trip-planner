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

  // Background owner notification — does not block or fail the submission.
  context.waitUntil(notifyOwner(env, row));

  return Response.json({ ok: true }, { status: 201 });
};
