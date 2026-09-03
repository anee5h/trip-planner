/**
 * KAI-226 — server-side car-route acquisition endpoint.
 *
 * POST /api/car-route
 * Body: { origin:{lat,lng}, target:{lat,lng,id,label?}, direction:"outbound"|"return", departureAt? }
 *
 * The browser sends ONLY coordinates + target identity. The ORS credential
 * (OPENROUTESERVICE_API_KEY) lives in the Pages Functions environment and is
 * never shipped to the client bundle. The endpoint returns Meguruto's
 * canonical normalized CarRouteResult — never raw ORS JSON, and never a
 * provider URL chosen by the caller (the ORS endpoint is fixed server-side).
 */
import { isRateLimited, rateLimitResponse } from "../_request-guards.js";
import { routeCar, validateCarRouteRequest } from "./car-route-core.js";

const CAR_ROUTE_RATE_LIMIT = {
  scope: "car-route",
  // One car-relevant request issues at most CAR_ROUTE_ENRICHMENT_LIMIT×2
  // calls; this window permits ~6 full planning refreshes per client.
  limit: 120,
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

  if (isRateLimited(request, CAR_ROUTE_RATE_LIMIT)) {
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

  // Validation failures are 4xx; canonical route outcomes (including
  // provider_not_configured, quota, no_route) are returned as data so the
  // client keeps one normalized canonical shape.
  const validated = validateCarRouteRequest(body);
  if (!validated.ok) {
    return Response.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const result = await routeCar(validated.body, env);
  return Response.json(result, { status: 200 });
};
