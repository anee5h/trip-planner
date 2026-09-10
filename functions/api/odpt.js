/**
 * KAI-289 — server-side ODPT acquisition endpoint.
 *
 * POST /api/odpt
 * Body: { operation: "nearby_stations" | "station" | "railway" | "railway_fare" | "datapoint", ...op fields }
 *
 * The browser sends ONLY an allow-listed operation and its narrow, validated
 * filters. The ODPT credential (`ODPT_API_KEY`) lives in the Pages Functions
 * environment and is appended server-side by `odpt-core.js`; it is never
 * shipped to the client bundle, echoed back, logged, or embedded in a source
 * URL. There is no pass-through proxy: the provider host, resource path and
 * permitted query parameters are fixed server-side.
 *
 * This endpoint returns Meguruto's canonical normalized ODPT evidence — never
 * raw ODPT JSON-LD.
 */
import { isRateLimited, rateLimitResponse } from "../_request-guards.js";
import { odptLookup, validateOdptRequest } from "./odpt-core.js";

/**
 * Conservative Meguruto-side guard for our own endpoint, following the
 * existing `_request-guards.js` approach. ODPT API v4.16 does not publish a
 * universal numeric request quota, so no provider quota is invented here;
 * provider-frequency handling for dynamic resources belongs to later tickets.
 */
const ODPT_RATE_LIMIT = {
  scope: "odpt",
  limit: 60,
  windowMs: 10 * 60 * 1000,
};

const MAX_BODY_BYTES = 4096;

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "method_not_allowed" },
      { status: 405 },
    );
  }

  if (isRateLimited(request, ODPT_RATE_LIMIT)) {
    return rateLimitResponse(600);
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 },
    );
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Validation failures are 4xx. Canonical provider outcomes (including
  // provider_not_configured, billing_required, no_data and empty results) are
  // returned as data so the client keeps one normalized ODPT result shape.
  const validated = validateOdptRequest(body);
  if (!validated.ok) {
    return Response.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const result = await odptLookup(validated.body, env);
  return Response.json(result, { status: 200 });
};

export { ODPT_RATE_LIMIT, MAX_BODY_BYTES };
