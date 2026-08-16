/**
 * KAI-44: true account deletion — server-authorized + server-verified
 * recent authentication.
 *
 * POST /api/account/delete
 *
 * 0. Env guard (fails closed).
 * 1. Verifies the caller's Supabase session (GoTrue /auth/v1/user) — 401/403
 *    is invalid_session, upstream 5xx is verification_failed (retry-safe),
 *    never a fake "session expired".
 * 2. SERVER-ENFORCED recent authentication. The UI gate alone is not the
 *    security boundary — anyone can POST directly — so the endpoint
 *    requires one of:
 *      reauthMode "password" — { email, password } verified RIGHT NOW via
 *        the GoTrue password grant; the grant user must match the Bearer
 *        session user. A stolen/old session cannot supply the password.
 *      reauthMode "otp" — the access token's `amr` claim must carry a
 *        recent authentication timestamp (within REAUTH_WINDOW_MS). amr is
 *        set at session creation (fresh sign-in or GoTrue reauthentication
 *        OTP verification) and is NOT updated by silent token refresh, so
 *        a months-old session that keeps refreshing cannot satisfy this.
 * 3. Deletes app-owned rows via the explicit per-table ownership manifest
 *    (trips.user_id, user_data.id, feedback.user_id) — idempotent.
 * 4. Deletes the Auth user LAST (point of no return).
 *
 * Every stage is exception-guarded and returns an honest
 * { error, step, deleted, retrySafe } payload on network failure.
 */
const APP_OWNED_TABLES = [
  { table: "trips", column: "user_id" },
  { table: "user_data", column: "id" },
  { table: "feedback", column: "user_id" },
];

/** amr authentication timestamp must be within this window. */
const REAUTH_WINDOW_MS = 15 * 60 * 1000;

const json = (payload, status) => Response.json(payload, { status });

/**
 * Decodes a JWT payload (base64url section 2) using web-runtime
 * primitives only — Buffer is NOT available in the Pages Function runtime
 * without nodejs_compat, which this project intentionally does not enable.
 */
function decodeJwtPayload(token) {
  try {
    const section = token.split(".")[1];
    if (!section) return null;
    const base64 = section
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(section.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Server-side recent-authentication check for reauthMode "otp": the token's
 * amr claim (authentication methods reference, RFC 8176) must contain an
 * entry with a recent authentication timestamp. amr reflects when the
 * session was AUTHENTICATED (fresh OAuth sign-in), not when it was last
 * refreshed. Supabase encodes amr[].timestamp as UNIX SECONDS (like
 * iat/exp), so it is converted to milliseconds before the window check;
 * the NEWEST valid entry is used rather than blindly amr[0].
 */
function hasRecentAuthentication(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const amr = payload?.amr;
  if (!Array.isArray(amr) || amr.length === 0) return false;
  const newestSeconds = amr.reduce((newest, entry) => {
    const ts =
      entry && typeof entry === "object" && typeof entry.timestamp === "number"
        ? entry.timestamp
        : -1;
    return ts > newest ? ts : newest;
  }, -1);
  if (newestSeconds < 0) return false;
  const ageMs = Date.now() - newestSeconds * 1000;
  return ageMs >= 0 && ageMs <= REAUTH_WINDOW_MS;
}

export const onRequest = async (context) => {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_PUBLISHABLE_KEY
  ) {
    console.error(
      "account/delete: missing SUPABASE_URL / SERVICE_ROLE_KEY / PUBLISHABLE_KEY",
    );
    return json({ ok: false, error: "not_configured" }, 500);
  }

  // Parse + validate the body (reauth payload) before anything else.
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: "invalid_body" }, 400);
  }
  if (raw.length > 16_384) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }
  const reauthMode = body.reauthMode;
  if (reauthMode !== "password" && reauthMode !== "otp") {
    return json({ ok: false, error: "reauth_required" }, 401);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const accessToken = authHeader.slice("Bearer ".length);

  // 1. Verify the caller session — distinguish rejection from upstream 5xx.
  let userRes;
  try {
    userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  } catch (err) {
    console.error("account/delete: session verification request failed", err);
    return json(
      {
        ok: false,
        error: "verification_failed",
        step: "verify_session",
        retrySafe: true,
      },
      502,
    );
  }
  if (userRes.status === 401 || userRes.status === 403) {
    return json({ ok: false, error: "invalid_session" }, 401);
  }
  if (!userRes.ok) {
    // Upstream 5xx — NOT a session problem; retryable, honest.
    console.error("account/delete: auth/user upstream failure", userRes.status);
    return json(
      {
        ok: false,
        error: "verification_failed",
        step: "verify_session",
        retrySafe: true,
      },
      502,
    );
  }
  let sessionUser;
  try {
    sessionUser = await userRes.json();
  } catch {
    sessionUser = null;
  }
  const sessionUserId = sessionUser?.id;
  if (!sessionUserId) {
    return json({ ok: false, error: "invalid_session" }, 401);
  }

  // 2. Server-verified recent authentication.
  let targetUserId = sessionUserId;
  if (reauthMode === "password") {
    const { email, password } = body;
    if (typeof email !== "string" || typeof password !== "string") {
      return json({ ok: false, error: "reauth_failed" }, 401);
    }
    let grantRes;
    try {
      grantRes = await fetch(
        `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // User-authentication calls use the publishable (anon) key —
            // the service-role credential stays reserved for the
            // administrative deletion calls below.
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email, password }),
        },
      );
    } catch (err) {
      console.error("account/delete: password grant request failed", err);
      return json(
        { ok: false, error: "verification_failed", retrySafe: true },
        502,
      );
    }
    if (grantRes.status === 400 || grantRes.status === 401) {
      return json({ ok: false, error: "reauth_failed" }, 401);
    }
    if (!grantRes.ok) {
      return json(
        { ok: false, error: "verification_failed", retrySafe: true },
        502,
      );
    }
    let grantUser;
    try {
      grantUser = (await grantRes.json())?.user;
    } catch {
      grantUser = null;
    }
    if (!grantUser?.id || grantUser.id !== sessionUserId) {
      // Credentials belong to a different account than the session.
      return json({ ok: false, error: "reauth_failed" }, 401);
    }
    targetUserId = grantUser.id;
  } else if (!hasRecentAuthentication(accessToken)) {
    // OTP mode: the session must carry recent authentication. A valid but
    // stale/non-reauthenticated session is rejected BEFORE any DELETE.
    return json({ ok: false, error: "reauth_required" }, 401);
  }

  const adminHeaders = {
    "Content-Type": "application/json",
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  // 3. Delete app-owned rows (idempotent; retry-safe). Ownership column
  //    comes from the manifest — never assumed to be user_id everywhere.
  const deleted = {};
  for (const { table, column } of APP_OWNED_TABLES) {
    const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
    url.searchParams.set(column, `eq.${targetUserId}`);
    let res;
    try {
      res = await fetch(url, { method: "DELETE", headers: adminHeaders });
    } catch (err) {
      console.error(`account/delete: ${table} delete request failed`, err);
      return json(
        {
          ok: false,
          error: "data_deletion_failed",
          step: `delete_${table}`,
          deleted,
          retrySafe: true,
        },
        502,
      );
    }
    // 404 = nothing to delete (table not yet migrated, or already
    // deleted) — still a successful step for idempotent retries.
    deleted[table] = res.ok || res.status === 404;
    if (!res.ok && res.status !== 404) {
      console.error(`account/delete: ${table} delete failed`, res.status);
      return json(
        {
          ok: false,
          error: "data_deletion_failed",
          step: `delete_${table}`,
          deleted,
          retrySafe: true,
        },
        502,
      );
    }
  }

  // 4. Delete the Auth user (point of no return) — ALWAYS last.
  let adminDelete;
  try {
    adminDelete = await fetch(
      `${env.SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`,
      { method: "DELETE", headers: adminHeaders },
    );
  } catch (err) {
    console.error("account/delete: auth user delete request failed", err);
    return json(
      {
        ok: false,
        error: "auth_delete_failed",
        step: "delete_auth_user",
        deleted,
        retrySafe: true,
      },
      502,
    );
  }
  if (!adminDelete.ok && adminDelete.status !== 404) {
    console.error(
      "account/delete: auth user delete failed",
      adminDelete.status,
    );
    return json(
      {
        ok: false,
        error: "auth_delete_failed",
        step: "delete_auth_user",
        deleted,
        retrySafe: true,
      },
      502,
    );
  }

  return json({ ok: true, deleted }, 200);
};
