/**
 * KAI-226 — server-side OpenRouteService car-route acquisition (core logic).
 *
 * Kept separate from `onRequest` so the entire mapping (validation → HTTP →
 * canonical normalized result) is unit-testable with an injected fetch.
 * The ORS credential lives ONLY in the Pages Functions environment
 * (`OPENROUTESERVICE_API_KEY`); the browser never sees it. No provider URL is
 * ever accepted from client input — the ORS endpoint is fixed here.
 */

export const ORS_DRIVING_CAR_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/json";

export const CAR_ROUTE_FETCH_TIMEOUT_MS = 10_000;

const DIRECTIONS = new Set(["outbound", "return"]);
const ALLOWED_KEYS = new Set(["origin", "target", "direction", "departureAt"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validCoordinates(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    isFiniteNumber(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    isFiniteNumber(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

/** @returns {{ok:true, body?:any, error?:string, status?:number}} */
export function validateCarRouteRequest(body) {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "invalid_json" };
  }
  // Allowlist only: provider URLs or any other field are rejected outright,
  // and the ORS endpoint is fixed server-side.
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, error: "unsupported_field" };
    }
  }
  if (!validCoordinates(body.origin)) {
    return { ok: false, error: "invalid_origin" };
  }
  const target = body.target;
  if (
    target === null ||
    typeof target !== "object" ||
    !validCoordinates(target) ||
    typeof target.id !== "string" ||
    target.id.length === 0 ||
    target.id.length > 100
  ) {
    return { ok: false, error: "invalid_target" };
  }
  if (typeof target.label === "string" && target.label.length > 120) {
    return { ok: false, error: "invalid_target" };
  }
  if (!DIRECTIONS.has(body.direction)) {
    return { ok: false, error: "invalid_direction" };
  }
  if (body.departureAt !== undefined) {
    if (typeof body.departureAt !== "string") {
      return { ok: false, error: "invalid_departure" };
    }
    if (Number.isNaN(Date.parse(body.departureAt))) {
      return { ok: false, error: "invalid_departure" };
    }
    if (body.departureAt.length > 64) {
      return { ok: false, error: "invalid_departure" };
    }
  }
  return { ok: true, body };
}

function canonicalFailure(requestBody, errorCode, availability, now) {
  const outbound = requestBody.direction === "outbound";
  const origin = outbound ? requestBody.origin : requestBody.target;
  const destination = outbound ? requestBody.target : requestBody.origin;
  return {
    availability,
    errorCode,
    origin: { lat: origin.lat, lng: origin.lng },
    originEndpoint: outbound
      ? {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: origin,
        }
      : {
          id: requestBody.target.id,
          label: requestBody.target.label ?? requestBody.target.id,
          kind: "documented_endpoint",
          coordinates: destination,
        },
    destination: outbound
      ? {
          id: requestBody.target.id,
          label: requestBody.target.label ?? requestBody.target.id,
          kind: "documented_endpoint",
          coordinates: destination,
        }
      : {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: origin,
        },
    provider: "openrouteservice",
    direction: requestBody.direction,
    retrievedAt: now(),
    sourceUrl: ORS_DRIVING_CAR_URL,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
  };
}

function isUnroutableBody(payload) {
  const text = JSON.stringify(payload ?? "").toLowerCase();
  return /no[_ ]route|not[_ ]rout|unroutable|unreachable|disconnected|could not find.*rout/.test(
    text,
  );
}

/**
 * Runs one route request against hosted ORS and returns Meguruto's canonical
 * normalized CarRouteResult (never raw ORS JSON).
 *
 * @param {{origin:{lat:number,lng:number},target:{lat:number,lng:number,id:string,label?:string},direction:"outbound"|"return",departureAt?:string}} requestBody
 * @param {{OPENROUTESERVICE_API_KEY?:string}} env
 * @param {(url:string, init?:RequestInit)=>Promise<Response>} [fetchImpl]
 * @param {()=>string} [now]
 */
export async function routeCar(
  requestBody,
  env,
  fetchImpl,
  now = () => new Date().toISOString(),
) {
  const validated = validateCarRouteRequest(requestBody);
  if (!validated.ok) {
    return {
      ...canonicalFailure(
        requestBody,
        `invalid_request_${validated.error}`,
        "error",
        now,
      ),
    };
  }
  const body = validated.body;
  const fetchFn = fetchImpl ?? globalThis.fetch;
  const apiKey = env?.OPENROUTESERVICE_API_KEY?.trim();

  if (!apiKey) {
    return canonicalFailure(body, "provider_not_configured", "error", now);
  }
  if (typeof fetchFn !== "function") {
    return canonicalFailure(body, "network_error", "error", now);
  }

  const outbound = body.direction === "outbound";
  const from = outbound ? body.origin : body.target;
  const to = outbound ? body.target : body.origin;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CAR_ROUTE_FETCH_TIMEOUT_MS,
  );
  let response;
  try {
    response = await fetchFn(ORS_DRIVING_CAR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
        instructions: false,
      }),
      signal: controller.signal,
    });
  } catch {
    return canonicalFailure(body, "network_error", "error", now);
  } finally {
    clearTimeout(timeout);
  }

  // Status-class failures are classified BEFORE attempting to parse the body,
  // mirroring the client adapter's semantics.
  if (response.status === 429) {
    return canonicalFailure(body, "quota_exceeded", "error", now);
  }
  if (response.status === 401 || response.status === 403) {
    return canonicalFailure(body, "provider_authorization_error", "error", now);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return canonicalFailure(
      body,
      response.ok
        ? "invalid_provider_response"
        : `provider_http_${response.status}`,
      "error",
      now,
    );
  }

  if (!response.ok) {
    if (response.status === 404 || isUnroutableBody(payload)) {
      return canonicalFailure(body, "unroutable", "no_route", now);
    }
    return canonicalFailure(
      body,
      `provider_http_${response.status}`,
      "error",
      now,
    );
  }

  const routes = payload?.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    return canonicalFailure(body, "unroutable", "no_route", now);
  }
  const summary = routes[0]?.summary;
  if (summary === null || typeof summary !== "object") {
    return canonicalFailure(body, "invalid_provider_response", "error", now);
  }
  if (!isFiniteNumber(summary.distance) || summary.distance < 0) {
    return canonicalFailure(body, "malformed_distance", "error", now);
  }
  if (!isFiniteNumber(summary.duration) || summary.duration < 0) {
    return canonicalFailure(body, "malformed_duration", "error", now);
  }

  return {
    availability: "available",
    origin: { lat: from.lat, lng: from.lng },
    originEndpoint: outbound
      ? {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: from,
        }
      : {
          id: body.target.id,
          label: body.target.label ?? body.target.id,
          kind: "documented_endpoint",
          coordinates: from,
        },
    destination: outbound
      ? {
          id: body.target.id,
          label: body.target.label ?? body.target.id,
          kind: "documented_endpoint",
          coordinates: to,
        }
      : { id: "origin", label: "Trip origin", kind: "origin", coordinates: to },
    provider: "openrouteservice",
    direction: body.direction,
    retrievedAt: now(),
    sourceUrl: ORS_DRIVING_CAR_URL,
    distanceKm: summary.distance / 1000,
    durationMinutes: summary.duration / 60,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "verified",
    completeness: "complete",
  };
}
