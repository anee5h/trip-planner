/**
 * KAI-289 — server-side ODPT acquisition endpoint.
 * KAI-290 PR 2B — runtime request protection (dedup, cache, provider budget).
 *
 * POST /api/odpt
 * Body: { operation: ..., ...op fields }
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
 *
 * Request execution order (KAI-290 PR 2B):
 *
 *   rate limit -> parse -> validate
 *     -> canonical request identity
 *     -> cache lookup            (no provider call, no budget token)
 *     -> in-flight dedup join    (no provider call, no budget token)
 *     -> provider budget acquire (only a real provider fetch costs one)
 *     -> odptLookup (fetch + 1 MB size guard + normalize)
 *     -> cache write if eligible -> canonical result
 *
 * The 1 MB response guard is unchanged and must not be raised. Broad timetable
 * reads (operator-wide StationTimetable, whole-railway TrainTimetable) are not
 * runtime strategies; the narrow train-identity shape is.
 */
import { isRateLimited, rateLimitResponse } from "../_request-guards.js";
import {
  odptLookup,
  odptProviderReadiness,
  validateOdptRequest,
} from "./odpt-core.js";
import {
  ODPT_DEFAULT_BUDGET_LIMIT,
  ODPT_DEFAULT_BUDGET_WINDOW_MS,
  createEdgeCacheStore,
  createMemoryCacheStore,
  createOdptRequestBudget,
  createOdptResultCache,
  createOdptRuntimeProtection,
} from "./odpt-runtime-protection.js";

/**
 * Conservative Meguruto-side guard for our own endpoint, following the
 * existing `_request-guards.js` approach. ODPT API v4.16 does not publish a
 * universal numeric request quota, so no provider quota is invented here.
 */
const ODPT_RATE_LIMIT = {
  scope: "odpt",
  limit: 60,
  windowMs: 10 * 60 * 1000,
};

const MAX_BODY_BYTES = 4096;

/** Positive-integer env override, else the conservative default. */
function resolveBudgetInteger(raw, fallback) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Prefers the Cloudflare Cache API (shared by isolates in a data center) and
 * falls back to an isolate-local memory store. Reported via the returned
 * store's `scope` so nothing can claim stronger coordination than it has.
 */
function selectCacheStore() {
  const edge =
    typeof globalThis.caches !== "undefined" && globalThis.caches
      ? globalThis.caches.default
      : undefined;
  if (
    edge &&
    typeof edge.match === "function" &&
    typeof edge.put === "function"
  ) {
    try {
      return createEdgeCacheStore({ cache: edge });
    } catch {
      // Fall through to the memory store rather than failing the request.
    }
  }
  return createMemoryCacheStore();
}

let protection = null;

/**
 * Lazily builds the per-isolate protection layer so `env` can configure the
 * budget. Module state persists for the isolate's lifetime, which is exactly
 * why the budget is documented as isolate-local.
 */
function getProtection(env) {
  if (protection) return protection;
  protection = createOdptRuntimeProtection({
    cache: createOdptResultCache({ store: selectCacheStore() }),
    budget: createOdptRequestBudget({
      limit: resolveBudgetInteger(
        env?.ODPT_PROVIDER_BUDGET_LIMIT,
        ODPT_DEFAULT_BUDGET_LIMIT,
      ),
      windowMs: resolveBudgetInteger(
        env?.ODPT_PROVIDER_BUDGET_WINDOW_MS,
        ODPT_DEFAULT_BUDGET_WINDOW_MS,
      ),
    }),
  });
  return protection;
}

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

  // Validation happens BEFORE any identity generation, caching or budget
  // accounting, so an invalid request can never create a cache entry, join a
  // dedup group, or consume a provider token.
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

  // Provider configuration/readiness is a REQUEST-INDEPENDENT failure and is
  // checked BEFORE the cache, so a cached success can never mask a misconfigured
  // credential (which would make the endpoint look healthy while every real
  // provider call fails). `odptLookup` supplies the canonical envelope for this
  // state, and returns it without issuing a fetch.
  if (!odptProviderReadiness(env).ok) {
    return Response.json(await odptLookup(validated.body, env), {
      status: 200,
    });
  }

  // Cache hits and dedup followers never reach the provider or the budget.
  const runtimeProtection = getProtection(env);
  const { result, runtime } = await runtimeProtection.run(validated, () =>
    odptLookup(validated.body, env),
  );

  // The transport payload is unchanged; `runtime` only reports how this
  // request was served (no credential, no caller identity, no raw payload).
  return Response.json({ ...result, runtime }, { status: 200 });
};

/** Test-only inspection of the protection layer's safe counters and scope. */
export function __getOdptProtectionState() {
  if (!protection) return null;
  return {
    counters: { ...protection.counters },
    cacheScope: protection.cache?.scope ?? null,
    budgetScope: protection.budget?.scope ?? null,
    budget: protection.budget?.snapshot() ?? null,
    inFlight: protection.inFlightSize(),
  };
}

/** Test-only reset so isolated endpoint tests do not share protection state. */
export function __resetOdptProtection() {
  protection = null;
}

export { ODPT_RATE_LIMIT, MAX_BODY_BYTES };
