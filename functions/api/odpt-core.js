/**
 * KAI-289 — server-side ODPT (Public Transportation Open Data Center) provider
 * foundation.
 *
 * Authoritative contract: ODPT API Specification v4.16 (2026-09-03),
 * https://developer.odpt.org/documents
 *
 * Kept separate from `onRequest` so the whole mapping (validation → outbound
 * request construction → HTTP → canonical normalized result) is unit-testable
 * with an injected fetch, mirroring `functions/api/car-route-core.js`.
 *
 * SECURITY MODEL
 * - `ODPT_API_KEY` lives ONLY in the Pages Functions environment. It is
 *   appended to the provider query string by this module and can never be
 *   supplied or overridden by client input.
 * - There is no pass-through proxy: the caller selects one of a finite set of
 *   allow-listed operations, each with its own validated input schema. The
 *   provider host and resource path are fixed here (plus an operator-level,
 *   allow-listed per-dataset base URL override), never taken from a request.
 * - Errors carry codes only. Raw provider payloads and credential-bearing URLs
 *   are never surfaced.
 *
 * SPEC SEMANTICS ENFORCED HERE (API v4.16 §1.3.1)
 * - Every successful ODPT search result is an array of objects: `[]` means
 *   "no match", `[item]` is one result. Those are success, not failure.
 * - A successful payload that is not an array ({}, null, "string", 42) is
 *   rejected rather than coerced (fail closed).
 * - ODPT silently truncates at a system upper limit, so a broad response is
 *   never evidence of complete coverage. Search operations therefore require
 *   at least one narrowing filter, and every result carries
 *   `coverage: "unknown"`.
 * - `acl:consumerKey` is mandatory (§1.3.1) and injected server-side.
 * - The default endpoint is https://api.odpt.org/api/v4 but "this may differ
 *   depending on the dataset" (§1.3.1), so the base URL is configurable per
 *   deployment and validated against an allow-list of hosts.
 */

export const ODPT_DEFAULT_BASE_URL = "https://api.odpt.org/api/v4";

/** Hosts a deployment may point the base URL at, unless extended by config. */
export const ODPT_DEFAULT_ALLOWED_HOSTS = ["api.odpt.org"];

export const ODPT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Bounded retry. Only HTTP 503 triggers a second attempt; authentication,
 * authorization, billing, not-found and malformed-request responses are never
 * retried (`API v4.16` §1.4/§1.6 status tables), and 400/401/402/403/404 must
 * never be replayed into a paid or unauthorized path.
 */
export const ODPT_MAX_ATTEMPTS = 2;
export const ODPT_RETRY_BACKOFF_MS = 250;

/** Upper bound on a provider response body we are willing to parse. */
export const ODPT_MAX_RESPONSE_BYTES = 1_000_000;

/** ODPT limits the geographic search radius to 0–4,000 m (§1.7, Table 5). */
export const ODPT_RADIUS_MAX_METERS = 4_000;

export const ODPT_CONSUMER_KEY_PARAM = "acl:consumerKey";

/** Longest accepted ODPT identity string (ucode or owl:sameAs). */
const MAX_IDENTITY_LENGTH = 200;

/**
 * `owl:sameAs` naming convention, e.g. odpt.Station:JR-East.Yamanote.Tokyo
 * (API v4.16 §3.3.3–§3.3.5).
 */
const ODPT_SAME_AS_PATTERN = /^odpt\.[A-Za-z][A-Za-z0-9]*:[A-Za-z0-9._-]+$/;

/** ucode identifier, e.g. urn:ucode:_00001C000000000000010000030FD7E5 (§1.6). */
const ODPT_UCODE_PATTERN = /^urn:ucode:_[A-Za-z0-9._-]+$/;

/** Station identity usable as odpt:fromStation / odpt:toStation (§3.3.4). */
const ODPT_STATION_ID_PATTERN = /^odpt\.Station:[A-Za-z0-9._-]+$/;

/**
 * Documented status codes → canonical Meguruto error codes.
 * 402 is documented only for exact datapoint acquisition (§1.6) and is mapped
 * to `billing_required`, which under Meguruto's hard-¥0 rule is a terminal
 * unsupported-provider state — never a retry, never a fabricated fact.
 *
 * OBSERVED LIVE DIVERGENCE (2026-09-10, KAI-289 smoke)
 * The live endpoint returns HTTP 403 with a plain-text body
 * `Invalid acl:consumerKey.` for an invalid *or missing* consumer key, while
 * API v4.16 §1.4/§1.6 document 401 as "acl:consumerKey is incorrect". The
 * response is served by ODPT's own Express app behind Kong and carries ODPT's
 * rate-limit headers, so this is provider behaviour rather than an edge/WAF
 * block.
 *
 * This mapping is left spec-faithful on purpose: both 401 and 403 are terminal
 * provider failures that can never be presented as absent transport, so the
 * classification stays honest either way. Reinterpreting 403 as an
 * authentication failure would require sniffing a provider message string,
 * which is exactly the kind of brittle semantic assumption this ticket avoids.
 * The divergence is recorded here so a later ticket can decide deliberately
 * (an authenticated live smoke is still required to confirm which code a
 * valid-but-unauthorized key produces).
 *
 * The live provider also advertises request limits in response headers
 * (X-RateLimit-Limit-minute: 60, -hour: 3600, -day: 24000) that API v4.16 does
 * not document. No provider quota is encoded here: KAI-289 keeps Meguruto's own
 * conservative configurable guard, which sits comfortably inside those limits.
 */
const ODPT_STATUS_ERROR_CODES = new Map([
  [400, "provider_invalid_request"],
  [401, "provider_authentication_error"],
  [402, "billing_required"],
  [403, "provider_authorization_error"],
  [404, "no_applicable_data"],
  [405, "provider_method_not_allowed"],
  [500, "provider_internal_error"],
  [503, "provider_unavailable"],
]);

const RETRYABLE_STATUSES = new Set([503]);

/**
 * Allow-listed operations. Each entry lists the only caller-supplied fields
 * accepted for that operation; every other key (including `rdf:type`,
 * `acl:consumerKey`, `url`, `endpoint` and `queryParameters`) is rejected by
 * `validateOdptRequest`. Each entry declares exactly which caller fields are
 * accepted and how each one is used, so a path input can never be emitted as a
 * query parameter by accident:
 *
 *   pathParams  — consumed into the resource path (`/resource/<value>`)
 *   queryParams — emitted as documented ODPT query parameters
 *
 * Note `datapoint`: `$DATA_URI` is a PATH component of
 * `/api/v4/datapoints/$DATA_URI` (§1.6), not an ODPT query parameter, so it is
 * declared as a pathParam and never reaches `buildParams`.
 *
 * Every `queryParams` entry must have a documented name in `FILTER_PARAM_NAMES`;
 * a mapping-completeness test enforces that so a schema mistake fails loudly in
 * CI instead of producing a malformed provider request at runtime.
 */
export const OPERATION_SCHEMAS = Object.freeze({
  nearby_stations: {
    resource: "places/odpt:Station",
    pathParams: [],
    queryParams: ["lat", "lon", "radius"],
  },
  station: {
    resource: "odpt:Station",
    pathParams: [],
    queryParams: ["sameAs", "title", "operator", "railway", "stationCode"],
  },
  railway: {
    resource: "odpt:Railway",
    pathParams: [],
    queryParams: ["sameAs", "title", "operator", "lineCode"],
  },
  railway_fare: {
    resource: "odpt:RailwayFare",
    pathParams: [],
    queryParams: ["fromStation", "toStation", "operator"],
  },
  datapoint: {
    resource: "datapoints",
    pathParams: ["dataUri"],
    queryParams: [],
  },
  // KAI-290: reference/enumeration resources. These are bounded provider lists
  // (the set of calendars, operators, directions, train types), so they may be
  // read without a narrowing filter. Timetables below may not.
  calendar: {
    resource: "odpt:Calendar",
    pathParams: [],
    queryParams: ["sameAs"],
  },
  operator: {
    resource: "odpt:Operator",
    pathParams: [],
    queryParams: ["sameAs"],
  },
  train_type: {
    resource: "odpt:TrainType",
    pathParams: [],
    queryParams: ["sameAs", "operator"],
  },
  rail_direction: {
    resource: "odpt:RailDirection",
    pathParams: [],
    queryParams: ["sameAs", "operator"],
  },
  // KAI-290: timetable resources are per-station / per-train and potentially
  // enormous, so every one of them requires at least one narrowing filter.
  // A broad timetable query must never become normal runtime behaviour.
  station_timetable: {
    resource: "odpt:StationTimetable",
    pathParams: [],
    queryParams: [
      "sameAs",
      "station",
      "railway",
      "operator",
      "railDirection",
      "calendar",
      "date",
    ],
  },
  train_timetable: {
    resource: "odpt:TrainTimetable",
    pathParams: [],
    queryParams: [
      "sameAs",
      "trainNumber",
      "railway",
      "operator",
      "trainType",
      "train",
      "calendar",
    ],
  },
});

/** Caller field name → documented ODPT query parameter name. */
export const FILTER_PARAM_NAMES = Object.freeze({
  sameAs: "owl:sameAs",
  title: "dc:title",
  operator: "odpt:operator",
  railway: "odpt:railway",
  stationCode: "odpt:stationCode",
  lineCode: "odpt:lineCode",
  fromStation: "odpt:fromStation",
  toStation: "odpt:toStation",
  lat: "lat",
  lon: "lon",
  radius: "radius",
  // KAI-290 timetable / reference-resource filters (API v4.16 §2.2, §3.2.6,
  // §3.2.9). Only parameter names the specification documents are listed here.
  station: "odpt:station",
  railDirection: "odpt:railDirection",
  calendar: "odpt:calendar",
  date: "dc:date",
  trainNumber: "odpt:trainNumber",
  trainType: "odpt:trainType",
  train: "odpt:train",
});

/**
 * How each accepted input is validated. Keeping this beside the parameter
 * mapping means a newly added filter cannot be validated by accident as free
 * text, and identity-shaped inputs can never become arbitrary provider values.
 */
export const FILTER_KINDS = Object.freeze({
  sameAs: "identity",
  operator: "identity",
  railway: "identity",
  railDirection: "identity",
  calendar: "identity",
  trainType: "identity",
  train: "identity",
  station: "stationIdentity",
  fromStation: "stationIdentity",
  toStation: "stationIdentity",
  title: "text",
  stationCode: "text",
  lineCode: "text",
  trainNumber: "trainNumber",
  date: "date",
  // Geographic search inputs. Declared here so every mapped ODPT parameter has
  // an explicit validation kind; the documented WGS84/0–4,000 m bounds are
  // additionally enforced by the nearby_stations branch.
  lat: "number",
  lon: "number",
  radius: "number",
});

/**
 * KAI-290 operations that read a bounded provider enumeration list. They may be
 * requested without a narrowing filter.
 */
export const REFERENCE_OPERATIONS = Object.freeze(
  new Set(["calendar", "operator", "train_type", "rail_direction"]),
);

/**
 * KAI-290 operations that read potentially unbounded per-station / per-train
 * timetables and therefore always require a narrowing filter.
 */
export const TIMETABLE_OPERATIONS = Object.freeze(
  new Set(["station_timetable", "train_timetable"]),
);

/**
 * Operations whose result set is unbounded enough that ODPT's silent
 * truncation could hide data. These require at least one narrowing filter so a
 * response is never mistaken for complete provider coverage (§1.3.1).
 *
 * `calendar` / `operator` / `train_type` / `rail_direction` are documented
 * enumeration lists and `datapoint` addresses one exact resource, so they are
 * intentionally excluded.
 */
export const OPERATIONS_REQUIRING_FILTER = Object.freeze([
  "station",
  "railway",
  "railway_fare",
  ...TIMETABLE_OPERATIONS,
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Bounded structural label for diagnostics — never the payload itself. */
function providerValueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validIdentity(value) {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_IDENTITY_LENGTH) return false;
  return ODPT_SAME_AS_PATTERN.test(value) || ODPT_UCODE_PATTERN.test(value);
}

function validStationIdentity(value) {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_IDENTITY_LENGTH) return false;
  return ODPT_STATION_ID_PATTERN.test(value) || ODPT_UCODE_PATTERN.test(value);
}

function validTextFilter(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    value.trim() === value
  );
}

/** ODPT train numbers are short opaque tokens, e.g. `123M`, `B1045S`. */
function validTrainNumber(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 32 &&
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

/**
 * `dc:date` on StationTimetable acquires the timetable for a specific date.
 * Accept an ISO8601 date or date-time and nothing else, so the value can never
 * carry provider query syntax.
 */
function validDateFilter(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+([+-]\d{2}:?\d{2}|Z)?)?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

/**
 * Applies the declared validation kind for one caller-supplied input.
 * @returns {string|undefined} an error code, or undefined when valid.
 */
function validateFilterValue(filter, value) {
  const kind = FILTER_KINDS[filter];
  switch (kind) {
    case "identity":
      return validIdentity(value) ? undefined : `invalid_${filter}`;
    case "stationIdentity":
      return validStationIdentity(value) ? undefined : `invalid_${filter}`;
    case "text":
      return validTextFilter(value) ? undefined : `invalid_${filter}`;
    case "trainNumber":
      return validTrainNumber(value) ? undefined : `invalid_${filter}`;
    case "date":
      return validDateFilter(value) ? undefined : `invalid_${filter}`;
    case "number":
      return isFiniteNumber(value) ? undefined : `invalid_${filter}`;
    default:
      // A declared query input with no validation kind is a schema mistake.
      // Fail closed rather than accepting the value unvalidated.
      return `unsupported_filter_${filter}`;
  }
}

/**
 * Removes the credential-bearing query parameter from any URL that could reach
 * a response, log, error or snapshot. Defence in depth: normal results are
 * built without the credential in the first place.
 *
 * @param {string} rawUrl
 * @param {string} [secret] credential value to scrub if present anywhere
 */
export function sanitizeOdptUrl(rawUrl, secret) {
  let out = String(rawUrl ?? "");
  out = out
    .replace(/([?&])acl:consumerKey=[^&#]*/gi, "$1")
    .replace(/\?&+/g, "?")
    .replace(/&&+/g, "&")
    .replace(/[?&]+$/, "");
  if (typeof secret === "string" && secret.length > 0) {
    out = out.split(secret).join("");
  }
  return out;
}

function parseAllowedHosts(env) {
  const hosts = new Set(ODPT_DEFAULT_ALLOWED_HOSTS);
  const configured = env?.ODPT_ALLOWED_HOSTS;
  if (typeof configured === "string") {
    for (const entry of configured.split(",")) {
      const host = entry.trim().toLowerCase();
      if (host.length > 0 && /^[a-z0-9.-]+$/.test(host)) hosts.add(host);
    }
  }
  return hosts;
}

/**
 * Resolves the provider base URL from deployment configuration. Client input
 * can never influence this: the only source is `env`.
 *
 * @param {{ODPT_API_BASE_URL?:string, ODPT_ALLOWED_HOSTS?:string}} env
 * @returns {{ok:true, baseUrl:string}|{ok:false, error:string}}
 */
export function resolveOdptBaseUrl(env) {
  const configured = env?.ODPT_API_BASE_URL;
  const raw =
    typeof configured === "string" && configured.trim().length > 0
      ? configured.trim()
      : ODPT_DEFAULT_BASE_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "provider_endpoint_not_allowed" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "provider_endpoint_not_allowed" };
  }
  if (!parseAllowedHosts(env).has(parsed.hostname.toLowerCase())) {
    return { ok: false, error: "provider_endpoint_not_allowed" };
  }
  return { ok: true, baseUrl: parsed.toString().replace(/\/+$/, "") };
}

/**
 * Validates a caller request against the finite operation contract.
 *
 * @param {unknown} body
 * @returns {{ok:true, body:Record<string, unknown>, operation:string}|{ok:false, error:string}}
 */
export function validateOdptRequest(body) {
  if (!isRecord(body)) return { ok: false, error: "invalid_json" };

  const operation = body.operation;
  if (typeof operation !== "string") {
    return { ok: false, error: "invalid_operation" };
  }
  const schema = Object.prototype.hasOwnProperty.call(
    OPERATION_SCHEMAS,
    operation,
  )
    ? OPERATION_SCHEMAS[operation]
    : undefined;
  if (!schema) return { ok: false, error: "unsupported_operation" };

  // Allowlist only: rdf:type, acl:consumerKey, url, endpoint, queryParameters
  // and any other caller field are rejected outright rather than ignored.
  const allowed = new Set([
    "operation",
    ...schema.pathParams,
    ...schema.queryParams,
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) return { ok: false, error: "unsupported_field" };
  }

  if (operation === "nearby_stations") {
    if (!isFiniteNumber(body.lat) || body.lat < -90 || body.lat > 90) {
      return { ok: false, error: "invalid_lat" };
    }
    if (!isFiniteNumber(body.lon) || body.lon < -180 || body.lon > 180) {
      return { ok: false, error: "invalid_lon" };
    }
    // ODPT documents 0–4,000 m; the bound is enforced server-side so a caller
    // cannot widen the search beyond the provider contract.
    if (
      !isFiniteNumber(body.radius) ||
      body.radius < 0 ||
      body.radius > ODPT_RADIUS_MAX_METERS
    ) {
      return { ok: false, error: "invalid_radius" };
    }
    return { ok: true, body, operation };
  }

  if (operation === "station" || operation === "railway") {
    // ODPT silently truncates at a system upper limit, so an unfiltered search
    // could never be read as complete coverage (§1.3.1). Requiring at least one
    // narrowing filter is what makes these operations honest.
    const present = schema.queryParams.filter(
      (filter) => body[filter] !== undefined,
    );
    if (present.length === 0) {
      return { ok: false, error: "unfiltered_search_not_allowed" };
    }
    for (const filter of present) {
      const value = body[filter];
      if (filter === "sameAs") {
        if (!validIdentity(value))
          return { ok: false, error: "invalid_sameAs" };
        continue;
      }
      if (filter === "operator" || filter === "railway") {
        if (!validIdentity(value)) {
          return { ok: false, error: `invalid_${filter}` };
        }
        continue;
      }
      if (!validTextFilter(value)) {
        return { ok: false, error: `invalid_${filter}` };
      }
    }
    return { ok: true, body, operation };
  }

  // KAI-290: reference/enumeration resources. Every declared input is
  // validated by its declared kind; no filter is mandatory because these are
  // bounded provider lists rather than unbounded searches.
  if (REFERENCE_OPERATIONS.has(operation)) {
    for (const filter of schema.queryParams) {
      if (body[filter] === undefined) continue;
      const error = validateFilterValue(filter, body[filter]);
      if (error) return { ok: false, error };
    }
    return { ok: true, body, operation };
  }

  // KAI-290: timetable resources. Narrowing is mandatory and every input is
  // validated by kind, so a caller can never widen a timetable query or smuggle
  // a non-identity value into an identity-shaped parameter.
  if (TIMETABLE_OPERATIONS.has(operation)) {
    const present = schema.queryParams.filter(
      (filter) => body[filter] !== undefined,
    );
    if (present.length === 0) {
      return { ok: false, error: "unfiltered_search_not_allowed" };
    }
    for (const filter of present) {
      const error = validateFilterValue(filter, body[filter]);
      if (error) return { ok: false, error };
    }
    return { ok: true, body, operation };
  }

  if (operation === "railway_fare") {
    // Fares are queried by explicit station identity, never by station name
    // (§3.2.4 / §3.3.4): names are shared across operators and would silently
    // return another company's fare.
    if (!validStationIdentity(body.fromStation)) {
      return { ok: false, error: "invalid_fromStation" };
    }
    if (!validStationIdentity(body.toStation)) {
      return { ok: false, error: "invalid_toStation" };
    }
    if (body.operator !== undefined && !validIdentity(body.operator)) {
      return { ok: false, error: "invalid_operator" };
    }
    return { ok: true, body, operation };
  }

  // datapoint: an ODPT ucode or one-to-one owl:sameAs value (§1.6). Validated
  // strictly so no caller value can become an arbitrary fetched URL.
  if (!validIdentity(body.dataUri)) {
    return { ok: false, error: "invalid_dataUri" };
  }
  return { ok: true, body, operation };
}

/**
 * Builds the ODPT query parameters for an operation from its declared
 * `queryParams` only. Path inputs are never emitted here.
 *
 * Returns `null` when a declared query input has no documented ODPT parameter
 * name. That is a schema/configuration mistake, so it fails closed (no provider
 * request is made) instead of silently emitting an `undefined=` parameter or
 * dropping the input.
 */
export function buildParams(operation, input) {
  const schema = OPERATION_SCHEMAS[operation];
  const params = [];
  for (const name of schema.queryParams) {
    const value = input[name];
    if (value === undefined) continue;
    const paramName = FILTER_PARAM_NAMES[name];
    if (typeof paramName !== "string" || paramName.length === 0) return null;
    params.push([paramName, String(value)]);
  }
  return params;
}

/**
 * Builds the resource path for an operation, appending each declared
 * `pathParams` value (e.g. `datapoints/<dataUri>` for §1.6 exact acquisition).
 */
export function buildResourcePath(operation, input) {
  const schema = OPERATION_SCHEMAS[operation];
  let resource = schema.resource;
  for (const name of schema.pathParams) {
    resource += `/${input[name]}`;
  }
  return resource;
}

/**
 * Builds the outbound provider URL. Parameter keys come from this module's own
 * allow-list; caller values are URI-encoded (API v4.16 §1.3.1). The consumer
 * key is appended last and only when `consumerKey` is given — display URLs are
 * built by omitting it entirely.
 */
export function buildOdptUrl(baseUrl, resource, params, consumerKey) {
  const query = params
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("&");
  const withKey =
    typeof consumerKey === "string" && consumerKey.length > 0
      ? `${query.length > 0 ? `${query}&` : ""}${ODPT_CONSUMER_KEY_PARAM}=${encodeURIComponent(consumerKey)}`
      : query;
  return `${baseUrl}/${resource}${withKey.length > 0 ? `?${withKey}` : ""}`;
}

function malformedRecord(error = "malformed_provider_record") {
  return { kind: "malformed_record", error };
}

function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.length > 0);
}

function multilingualTitle(value) {
  if (!isRecord(value)) return null;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function recordProvenance(raw, resource, sourceUrl, fetchedAt) {
  return {
    provider: "odpt",
    /** Stable ODPT-facing identity (owl:sameAs). */
    providerId: optionalString(raw["owl:sameAs"]),
    /** ucode, retained alongside owl:sameAs rather than replacing it. */
    ucode: optionalString(raw["@id"]),
    generatedAt: optionalString(raw["dc:date"]),
    issuedAt: optionalString(raw["dct:issued"]),
    validUntil: optionalString(raw["dct:valid"]),
    fetchedAt,
    sourceResource: resource,
    sourceUrl,
    /**
     * ODPT silently truncates results at a system upper limit, so no ODPT
     * response may be presented as complete coverage (§1.3.1).
     */
    coverage: "unknown",
  };
}

/**
 * Normalizes one odpt:Station record (§3.3.5). `owl:sameAs` is required: it is
 * the identity that keeps same-named stations on different operators/railways
 * distinct, so a record without it fails closed.
 */
export function normalizeStation(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  const lat = isFiniteNumber(raw["geo:lat"]) ? raw["geo:lat"] : null;
  const lng = isFiniteNumber(raw["geo:long"]) ? raw["geo:long"] : null;

  return {
    record: {
      /** ODPT-facing stable identity; use this, not the human-readable name. */
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      title: optionalString(raw["dc:title"]),
      stationTitle: multilingualTitle(raw["odpt:stationTitle"]),
      operator: optionalString(raw["odpt:operator"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      railway: optionalString(raw["odpt:railway"]),
      railwayTitle: multilingualTitle(raw["odpt:railwayTitle"]),
      stationCode: optionalString(raw["odpt:stationCode"]),
      coordinates: lat !== null && lng !== null ? { lat, lng } : null,
      connectingRailway: stringArray(raw["odpt:connectingRailway"]),
      connectingStation: stringArray(raw["odpt:connectingStation"]),
      date: optionalString(raw["dc:date"]),
      validUntil: optionalString(raw["dct:valid"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.station.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/**
 * Normalizes one odpt:Railway record (§3.3.3), preserving station order and
 * stable station IDs exactly as supplied — the array is never re-sorted, since
 * ODPT defines the ordering semantics through `odpt:index`.
 */
export function normalizeRailway(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  const rawOrder = raw["odpt:stationOrder"];
  if (rawOrder !== undefined && !Array.isArray(rawOrder)) {
    return malformedRecord("malformed_station_order");
  }
  const stationOrder = [];
  for (const entry of rawOrder ?? []) {
    if (!isRecord(entry)) return malformedRecord("malformed_station_order");
    const station = optionalString(entry["odpt:station"]);
    if (!station) return malformedRecord("malformed_station_order");
    stationOrder.push({
      index: Number.isInteger(entry["odpt:index"]) ? entry["odpt:index"] : null,
      station,
      stationTitle: multilingualTitle(entry["odpt:stationTitle"]),
    });
  }

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      title: optionalString(raw["dc:title"]),
      railwayTitle: multilingualTitle(raw["odpt:railwayTitle"]),
      kana: optionalString(raw["odpt:kana"]),
      operator: optionalString(raw["odpt:operator"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      lineCode: optionalString(raw["odpt:lineCode"]),
      color: optionalString(raw["odpt:color"]),
      ascendingRailDirection: optionalString(
        raw["odpt:ascendingRailDirection"],
      ),
      descendingRailDirection: optionalString(
        raw["odpt:descendingRailDirection"],
      ),
      stationOrder,
      date: optionalString(raw["dc:date"]),
      issuedAt: optionalString(raw["dct:issued"]),
      validUntil: optionalString(raw["dct:valid"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.railway.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

function optionalFare(value) {
  return isFiniteNumber(value) ? value : null;
}

/**
 * Normalizes one odpt:RailwayFare record (§3.3.4). Ticket, IC-card and child
 * fares are retained as separate fields and are never collapsed into one
 * number; a missing optional fare stays null rather than becoming ¥0.
 *
 * `odpt:ticketFare` is required by the specification for a returned
 * RailwayFare record, so a fare record without it fails closed.
 */
export function normalizeRailwayFare(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();
  if (!isFiniteNumber(raw["odpt:ticketFare"])) {
    return malformedRecord("fare_without_ticket_fare");
  }
  const fromStation = optionalString(raw["odpt:fromStation"]);
  const toStation = optionalString(raw["odpt:toStation"]);
  if (!fromStation || !toStation) {
    return malformedRecord("fare_without_station_pair");
  }

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      operator: optionalString(raw["odpt:operator"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      fromStation,
      toStation,
      ticketFare: optionalFare(raw["odpt:ticketFare"]),
      icCardFare: optionalFare(raw["odpt:icCardFare"]),
      childTicketFare: optionalFare(raw["odpt:childTicketFare"]),
      childIcCardFare: optionalFare(raw["odpt:childIcCardFare"]),
      viaStation: stringArray(raw["odpt:viaStation"]),
      viaRailway: stringArray(raw["odpt:viaRailway"]),
      ticketType: optionalString(raw["odpt:ticketType"]),
      paymentMethod: stringArray(raw["odpt:paymentMethod"]),
      date: optionalString(raw["dc:date"]),
      issuedAt: optionalString(raw["dct:issued"]),
      validUntil: optionalString(raw["dct:valid"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.railway_fare.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/**
 * Generic identity envelope for a datapoint whose `@type` this foundation does
 * not model yet (§1.6 acquires the same data types as the data dump API).
 * Retains the ODPT-facing identity and dates without guessing at a resource
 * shape, so unknown types are represented honestly rather than coerced.
 */
export function normalizeDatapoint(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  const ucode = optionalString(raw["@id"]);
  if (!sameAs && !ucode) return malformedRecord();

  return {
    record: {
      id: sameAs ?? ucode,
      sameAs,
      ucode,
      type: optionalString(raw["@type"]),
      date: optionalString(raw["dc:date"]),
      validUntil: optionalString(raw["dct:valid"]),
      provenance: recordProvenance(raw, "datapoints", sourceUrl, fetchedAt),
    },
  };
}

/**
 * Dispatches a datapoint payload on its declared `@type` so a known resource
 * gets its full normalization, while an unmodelled type falls back to the
 * generic envelope.
 */
function normalizeDatapointByType(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  switch (raw["@type"]) {
    case "odpt:Station":
      return normalizeStation(raw, sourceUrl, fetchedAt);
    case "odpt:Railway":
      return normalizeRailway(raw, sourceUrl, fetchedAt);
    case "odpt:RailwayFare":
      return normalizeRailwayFare(raw, sourceUrl, fetchedAt);
    case "odpt:Calendar":
      return normalizeCalendar(raw, sourceUrl, fetchedAt);
    case "odpt:Operator":
      return normalizeOperatorRecord(raw, sourceUrl, fetchedAt);
    case "odpt:RailDirection":
      return normalizeRailDirection(raw, sourceUrl, fetchedAt);
    case "odpt:TrainType":
      return normalizeTrainType(raw, sourceUrl, fetchedAt);
    case "odpt:StationTimetable":
      return normalizeStationTimetable(raw, sourceUrl, fetchedAt);
    case "odpt:TrainTimetable":
      return normalizeTrainTimetable(raw, sourceUrl, fetchedAt);
    default:
      return normalizeDatapoint(raw, sourceUrl, fetchedAt);
  }
}

/**
 * ODPT time values are plain clock times (e.g. "05:08"), NOT dates. The service
 * day is not embedded in each event, so midnight rollover has to be derived
 * from sequence order later (see the client-side chronology helper). Normalizing
 * here keeps the provider's literal value and does not guess a date.
 */
const ODPT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function optionalTime(value) {
  return typeof value === "string" && ODPT_TIME_PATTERN.test(value)
    ? value
    : null;
}

/** A list of multilingual title objects, e.g. `odpt:trainName`. */
function multilingualList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    const title = multilingualTitle(entry);
    if (title) out.push(title);
  }
  return out;
}

/**
 * `odpt:isLast` / `odpt:isOrigin` are documented as "omitted if not ...", so an
 * absent value means false. `odpt:needExtraFee` carries no such guarantee, so it
 * is preserved as null (unknown) when absent rather than assumed false — the
 * difference decides whether a base fare may be presented as the full price.
 */
function specOmittedBoolean(value) {
  return value === true;
}

function triStateBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function optionalInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function multilingualNote(raw) {
  return multilingualTitle(raw["odpt:note"]);
}

/**
 * Normalizes one odpt:Calendar record (§2.3.1).
 *
 * The specification's precedence rules (Specific.* overrides base; Holiday
 * overrides Saturday; multiple applicable Specific calendars merge) are applied
 * by the client-side resolver, which needs the raw `odpt:day` and
 * `odpt:duration` evidence. Nothing is collapsed to a weekday/saturday/holiday
 * triple here.
 */
export function normalizeCalendar(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  const day = stringArray(raw["odpt:day"]);
  const duration = optionalString(raw["odpt:duration"]);

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      title: optionalString(raw["dc:title"]),
      calendarTitle: multilingualTitle(raw["odpt:calendarTitle"]),
      /** ISO8601 dates on which this calendar explicitly applies. */
      day,
      /** ISO8601 validity period, `start/end`. */
      duration,
      /**
       * `Specific.*` calendars take precedence over base calendars (§2.3.1).
       * Derived here so consumers do not re-implement the naming rule.
       */
      isSpecific: sameAs.startsWith("odpt.Calendar:Specific."),
      date: optionalString(raw["dc:date"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.calendar.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/** Normalizes one odpt:Operator record (§2.3.2). */
export function normalizeOperatorRecord(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      title: optionalString(raw["dc:title"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      date: optionalString(raw["dc:date"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.operator.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/** Normalizes one odpt:RailDirection record (§3.3.2). */
export function normalizeRailDirection(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      title: optionalString(raw["dc:title"]),
      railDirectionTitle: multilingualTitle(raw["odpt:railDirectionTitle"]),
      date: optionalString(raw["dc:date"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.rail_direction.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/** Normalizes one odpt:TrainType record (§3.3.10). */
export function normalizeTrainType(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      operator: optionalString(raw["odpt:operator"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      title: optionalString(raw["dc:title"]),
      trainTypeTitle: multilingualTitle(raw["odpt:trainTypeTitle"]),
      date: optionalString(raw["dc:date"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.train_type.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/**
 * Normalizes one `odpt:stationTimetableObject` (§3.3.6). The object describes a
 * train's arrival/departure at ONE station, with the departure/arrival station
 * lists carrying that train's wider service context — it is not by itself an
 * end-to-end journey.
 */
function stationTimetableObject(entry) {
  if (!isRecord(entry)) return null;
  return {
    arrivalTime: optionalTime(entry["odpt:arrivalTime"]),
    departureTime: optionalTime(entry["odpt:departureTime"]),
    originStation: stringArray(entry["odpt:originStation"]),
    destinationStation: stringArray(entry["odpt:destinationStation"]),
    viaStation: stringArray(entry["odpt:viaStation"]),
    viaRailway: stringArray(entry["odpt:viaRailway"]),
    train: optionalString(entry["odpt:train"]),
    trainNumber: optionalString(entry["odpt:trainNumber"]),
    trainType: optionalString(entry["odpt:trainType"]),
    trainName: multilingualList(entry["odpt:trainName"]),
    trainOwner: optionalString(entry["odpt:trainOwner"]),
    // Documented as "omitted if not ...", so absence means false.
    isLast: specOmittedBoolean(entry["odpt:isLast"]),
    isOrigin: specOmittedBoolean(entry["odpt:isOrigin"]),
    platformNumber: optionalString(entry["odpt:platformNumber"]),
    platformName: multilingualTitle(entry["odpt:platformName"]),
    carComposition: optionalInteger(entry["odpt:carComposition"]),
    note: multilingualNote(entry),
  };
}

/**
 * Normalizes one odpt:StationTimetable record (§3.3.6).
 *
 * This is departure/arrival evidence at a single station. It is deliberately NOT
 * converted into a journey: the specification's ordering of
 * `odpt:stationTimetableObject` is not a stop-by-stop path, so a duration cannot
 * be derived from it alone.
 */
export function normalizeStationTimetable(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  const rawObjects = raw["odpt:stationTimetableObject"];
  if (!Array.isArray(rawObjects)) {
    return malformedRecord("malformed_timetable_objects");
  }
  const objects = [];
  for (const entry of rawObjects) {
    const normalized = stationTimetableObject(entry);
    if (normalized === null) {
      return malformedRecord("malformed_timetable_objects");
    }
    objects.push(normalized);
  }

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      operator: optionalString(raw["odpt:operator"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      railway: optionalString(raw["odpt:railway"]),
      railwayTitle: multilingualTitle(raw["odpt:railwayTitle"]),
      station: optionalString(raw["odpt:station"]),
      stationTitle: multilingualTitle(raw["odpt:stationTitle"]),
      railDirection: optionalString(raw["odpt:railDirection"]),
      railDirectionTitle: multilingualTitle(raw["odpt:railDirectionTitle"]),
      calendar: optionalString(raw["odpt:calendar"]),
      objects,
      objectCount: objects.length,
      note: multilingualNote(raw),
      date: optionalString(raw["dc:date"]),
      issuedAt: optionalString(raw["dct:issued"]),
      validUntil: optionalString(raw["dct:valid"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.station_timetable.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

/** Normalizes one `odpt:trainTimetableObject` (§3.3.9). */
function trainTimetableObject(entry) {
  if (!isRecord(entry)) return null;
  return {
    arrivalTime: optionalTime(entry["odpt:arrivalTime"]),
    arrivalStation: optionalString(entry["odpt:arrivalStation"]),
    departureTime: optionalTime(entry["odpt:departureTime"]),
    departureStation: optionalString(entry["odpt:departureStation"]),
    platformNumber: optionalString(entry["odpt:platformNumber"]),
    platformName: multilingualTitle(entry["odpt:platformName"]),
    note: multilingualNote(entry),
  };
}

/**
 * Normalizes one odpt:TrainTimetable record (§3.3.9).
 *
 * This is the stronger primitive for later journey reconstruction because
 * `odpt:trainTimetableObject` carries the ordered stop-by-stop
 * arrival/departure station/time pairs. It is still NOT assembled into a
 * Journey here — transfer reconstruction and duration derivation deliberately
 * belong to a later ticket.
 *
 * `odpt:needExtraFee` is preserved as a tri-state: `true` means a base
 * RailwayFare is NOT the complete price, and `false`/`null` are kept distinct so
 * "known not to need a supplement" is never confused with "unknown".
 */
export function normalizeTrainTimetable(raw, sourceUrl, fetchedAt) {
  if (!isRecord(raw)) return malformedRecord();
  const sameAs = optionalString(raw["owl:sameAs"]);
  if (!sameAs) return malformedRecord();

  const trainNumber = optionalString(raw["odpt:trainNumber"]);
  if (!trainNumber) return malformedRecord("timetable_without_train_number");

  const rawObjects = raw["odpt:trainTimetableObject"];
  if (!Array.isArray(rawObjects)) {
    return malformedRecord("malformed_timetable_objects");
  }
  const objects = [];
  for (const entry of rawObjects) {
    const normalized = trainTimetableObject(entry);
    if (normalized === null) {
      return malformedRecord("malformed_timetable_objects");
    }
    objects.push(normalized);
  }

  return {
    record: {
      id: sameAs,
      sameAs,
      ucode: optionalString(raw["@id"]),
      operator: optionalString(raw["odpt:operator"]),
      operatorTitle: multilingualTitle(raw["odpt:operatorTitle"]),
      railway: optionalString(raw["odpt:railway"]),
      railwayTitle: multilingualTitle(raw["odpt:railwayTitle"]),
      railDirection: optionalString(raw["odpt:railDirection"]),
      calendar: optionalString(raw["odpt:calendar"]),
      train: optionalString(raw["odpt:train"]),
      trainNumber,
      trainType: optionalString(raw["odpt:trainType"]),
      trainName: multilingualList(raw["odpt:trainName"]),
      trainOwner: optionalString(raw["odpt:trainOwner"]),
      originStation: stringArray(raw["odpt:originStation"]),
      destinationStation: stringArray(raw["odpt:destinationStation"]),
      viaStation: stringArray(raw["odpt:viaStation"]),
      viaRailway: stringArray(raw["odpt:viaRailway"]),
      /**
       * Explicit split-service links. These are the ONLY sanctioned way to join
       * one train's timetable records; same number/name/time are not evidence.
       */
      previousTrainTimetable: stringArray(raw["odpt:previousTrainTimetable"]),
      nextTrainTimetable: stringArray(raw["odpt:nextTrainTimetable"]),
      objects,
      objectCount: objects.length,
      /** true = supplement required, false = known not required, null = unknown. */
      needExtraFee: triStateBoolean(raw["odpt:needExtraFee"]),
      note: multilingualNote(raw),
      date: optionalString(raw["dc:date"]),
      issuedAt: optionalString(raw["dct:issued"]),
      validUntil: optionalString(raw["dct:valid"]),
      provenance: recordProvenance(
        raw,
        OPERATION_SCHEMAS.train_timetable.resource,
        sourceUrl,
        fetchedAt,
      ),
    },
  };
}

const NORMALIZERS = {
  station: normalizeStation,
  nearby_stations: normalizeStation,
  railway: normalizeRailway,
  railway_fare: normalizeRailwayFare,
  datapoint: normalizeDatapointByType,
  calendar: normalizeCalendar,
  operator: normalizeOperatorRecord,
  rail_direction: normalizeRailDirection,
  train_type: normalizeTrainType,
  station_timetable: normalizeStationTimetable,
  train_timetable: normalizeTrainTimetable,
};

function resultBase(operation, resource, sourceUrl, now) {
  return {
    provider: "odpt",
    operation,
    outcome: "error",
    records: [],
    recordCount: 0,
    retrievedAt: now(),
    sourceResource: resource,
    sourceUrl,
    /** Identifies the normalization contract the payload was read against. */
    normalization: "odpt-api-v4.16",
  };
}

function failure(operation, resource, sourceUrl, errorCode, now) {
  return { ...resultBase(operation, resource, sourceUrl, now), errorCode };
}

async function readArrayPayload(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    return { kind: "unreadable" };
  }
  if (text.length > ODPT_MAX_RESPONSE_BYTES) {
    return { kind: "too_large" };
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { kind: "malformed_json" };
  }
  if (!Array.isArray(payload)) {
    // {} / null / "string" / 42 are not ODPT search results (§1.3.1).
    return { kind: "non_array", payloadType: providerValueType(payload) };
  }
  return { kind: "array", payload };
}

async function fetchOnce(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/ld+json, application/json" },
      signal: controller.signal,
    });
    return { kind: "response", response };
  } catch (error) {
    const aborted =
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError";
    return { kind: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Budget refusal codes a `beforeProviderAttempt` hook may return.
 *
 * `budget_exhausted` — the budget check succeeded and no capacity remains.
 * `budget_unavailable` — no trustworthy decision could be obtained (the budget
 * backend failed); the provider request was NOT issued. Distinct from ordinary
 * exhaustion on purpose: it is a Meguruto infrastructure failure, not a policy
 * refusal, and must never be reported as provider unavailability or as data.
 */
const BUDGET_REFUSAL_CODES = new Set([
  "budget_exhausted",
  "budget_unavailable",
]);

/**
 * Reports whether the provider is usable at all with this environment.
 *
 * Exported for KAI-290 PR 2B so the boundary can evaluate these
 * request-INDEPENDENT failures BEFORE consulting the result cache. Otherwise a
 * cached success would mask a misconfigured credential: the endpoint would look
 * healthy and serve data while every real provider call would fail.
 *
 * Returns `{ok: true}` or `{ok: false, error}` where `error` is the same code
 * `odptLookup` would report.
 */
export function odptProviderReadiness(env) {
  const base = resolveOdptBaseUrl(env);
  if (!base.ok) return { ok: false, error: base.error };
  const apiKey =
    typeof env?.ODPT_API_KEY === "string" ? env.ODPT_API_KEY.trim() : "";
  if (apiKey.length === 0) {
    return { ok: false, error: "provider_not_configured" };
  }
  return { ok: true };
}

/**
 * Executes one allow-listed ODPT operation and returns a canonical normalized
 * result. Never throws, never returns raw provider payloads, and never includes
 * the consumer key in any field.
 *
 * @param {unknown} requestBody caller request (validated against the contract)
 * @param {{ODPT_API_KEY?:string, ODPT_API_BASE_URL?:string, ODPT_ALLOWED_HOSTS?:string}} env
 * @param {(url:string, init?:RequestInit)=>Promise<Response>} [fetchImpl]
 * @param {()=>string} [now]
 * @param {{sleepImpl?:(ms:number)=>Promise<void>, timeoutMs?:number}} [options]
 *        Test/deployment hooks for bounded retry backoff and fetch timeout.
 */
export async function odptLookup(
  requestBody,
  env,
  fetchImpl,
  now = () => new Date().toISOString(),
  options = {},
) {
  const sleepImpl = options.sleepImpl ?? sleep;
  const timeoutMs = options.timeoutMs ?? ODPT_FETCH_TIMEOUT_MS;
  const validated = validateOdptRequest(requestBody);
  if (!validated.ok) {
    const requestedOperation =
      isRecord(requestBody) && typeof requestBody.operation === "string"
        ? requestBody.operation
        : "unknown";
    const resource = Object.prototype.hasOwnProperty.call(
      OPERATION_SCHEMAS,
      requestedOperation,
    )
      ? OPERATION_SCHEMAS[requestedOperation].resource
      : "unknown";
    return failure(
      requestedOperation,
      resource,
      "",
      `invalid_request_${validated.error}`,
      now,
    );
  }

  const { operation, body } = validated;
  const resource = buildResourcePath(operation, body);
  const sourceResource = operation === "datapoint" ? "datapoints" : resource;

  const base = resolveOdptBaseUrl(env);
  if (!base.ok) {
    return failure(operation, sourceResource, "", base.error, now);
  }

  const apiKey =
    typeof env?.ODPT_API_KEY === "string" ? env.ODPT_API_KEY.trim() : "";
  if (apiKey.length === 0) {
    return failure(
      operation,
      sourceResource,
      "",
      "provider_not_configured",
      now,
    );
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    return failure(operation, sourceResource, "", "network_error", now);
  }

  // KAI-290 PR 2B: optional acquire-attempt hook. Called immediately before
  // EVERY outbound provider HTTP attempt (initial and the bounded 503 retry),
  // so a caller can budget each real attempt rather than each logical lookup.
  // Retry mechanics stay here; only the permission decision is injected.
  const beforeProviderAttempt = options.beforeProviderAttempt ?? null;

  const params = buildParams(operation, body);
  if (params === null) {
    // A declared query input with no documented ODPT parameter name is a
    // server-side schema mistake. Fail closed without issuing a request rather
    // than sending a malformed query.
    return failure(
      operation,
      sourceResource,
      "",
      "provider_request_config_error",
      now,
    );
  }
  const callUrl = buildOdptUrl(base.baseUrl, resource, params, apiKey);
  // Displayed provenance is built WITHOUT the credential, and is additionally
  // scrubbed in case a future change reintroduces it.
  const safeSourceUrl = sanitizeOdptUrl(
    buildOdptUrl(base.baseUrl, resource, params, undefined),
    apiKey,
  );

  let attempt = 0;
  let lastFailure = "provider_unavailable";
  while (attempt < ODPT_MAX_ATTEMPTS) {
    attempt += 1;

    // Budget permission is required for EVERY actual outbound attempt. When a
    // would-be RETRY is refused, the result must stay truthful: the provider was
    // attempted once, the retry was blocked by Meguruto, and no second provider
    // response exists. `sourceUrl` is reported only when at least one request
    // really went out, so a first-attempt refusal carries an empty `sourceUrl`
    // while a refused retry keeps the safe sanitized URL of the attempt that did
    // happen.
    //
    // The refusal PHASE (first attempt vs retry) and the number of attempts made
    // are deliberately NOT part of this result: they are internal runtime/test
    // observability, tracked by the protection layer. The public ODPT result
    // contract exposes only the canonical fields (outcome, errorCode, records,
    // recordCount, retrievedAt, sourceResource, sourceUrl, normalization).
    if (typeof beforeProviderAttempt === "function") {
      const permission = await beforeProviderAttempt({ attempt });
      if (!permission || permission.allowed !== true) {
        const attemptsMade = attempt - 1;
        // The caller may distinguish WHY permission was refused. Only these two
        // documented budget states are honoured; anything else falls back to
        // ordinary exhaustion rather than letting an arbitrary code through.
        const refusalCode = BUDGET_REFUSAL_CODES.has(permission?.errorCode)
          ? permission.errorCode
          : "budget_exhausted";
        return failure(
          operation,
          sourceResource,
          attemptsMade > 0 ? safeSourceUrl : "",
          refusalCode,
          now,
        );
      }
    }

    const outcome = await fetchOnce(callUrl, fetchFn, timeoutMs);

    if (outcome.kind === "timeout") {
      return failure(
        operation,
        sourceResource,
        safeSourceUrl,
        "provider_timeout",
        now,
      );
    }
    if (outcome.kind === "network") {
      return failure(
        operation,
        sourceResource,
        safeSourceUrl,
        "network_error",
        now,
      );
    }

    const { response } = outcome;
    if (!response.ok) {
      const status = response.status;
      const errorCode =
        ODPT_STATUS_ERROR_CODES.get(status) ?? `provider_http_${status}`;
      if (RETRYABLE_STATUSES.has(status) && attempt < ODPT_MAX_ATTEMPTS) {
        lastFailure = errorCode;
        // Bounded single backoff; only 503 reaches here.
        await sleepImpl(ODPT_RETRY_BACKOFF_MS);
        continue;
      }
      if (status === 404) {
        // Documented "No applicable data": not a provider failure, and not
        // equivalent to a successful empty search either.
        return {
          ...resultBase(operation, sourceResource, safeSourceUrl, now),
          outcome: "no_data",
          errorCode,
        };
      }
      return failure(operation, sourceResource, safeSourceUrl, errorCode, now);
    }

    const parsed = await readArrayPayload(response);
    if (parsed.kind === "unreadable") {
      return failure(
        operation,
        sourceResource,
        safeSourceUrl,
        "invalid_provider_response",
        now,
      );
    }
    if (parsed.kind === "too_large") {
      return failure(
        operation,
        sourceResource,
        safeSourceUrl,
        "provider_response_too_large",
        now,
      );
    }
    if (parsed.kind === "malformed_json") {
      return failure(
        operation,
        sourceResource,
        safeSourceUrl,
        "malformed_provider_json",
        now,
      );
    }
    if (parsed.kind === "non_array") {
      return failure(
        operation,
        sourceResource,
        safeSourceUrl,
        `unexpected_provider_payload_${parsed.payloadType}`,
        now,
      );
    }

    const normalize = NORMALIZERS[operation];
    const fetchedAt = now();
    const records = [];
    for (const entry of parsed.payload) {
      const outcomeForRecord = normalize(entry, safeSourceUrl, fetchedAt);
      if (outcomeForRecord.record === undefined) {
        return failure(
          operation,
          sourceResource,
          safeSourceUrl,
          outcomeForRecord.error,
          now,
        );
      }
      records.push(outcomeForRecord.record);
    }

    // A successful empty array is a real ODPT answer ("no matching records"),
    // distinct from both a provider failure and a 404.
    return {
      ...resultBase(operation, sourceResource, safeSourceUrl, now),
      outcome: "records",
      records,
      recordCount: records.length,
    };
  }

  return failure(operation, sourceResource, safeSourceUrl, lastFailure, now);
}
