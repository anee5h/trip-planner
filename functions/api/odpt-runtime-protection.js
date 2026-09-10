/**
 * KAI-290 PR 2B — ODPT runtime request protection.
 *
 * Makes ODPT provider requests safe to execute at runtime by adding, in order:
 *
 *   validated request
 *     -> canonical request identity + credential-free provider scope
 *     -> SYNCHRONOUS in-flight lookup/register
 *          follower -> join the leader's result (no provider call, no token)
 *          leader   -> cache lookup            (no provider call, no token)
 *                      budget per ACTUAL provider attempt
 *                      provider fetch
 *                      cache write if eligible
 *     -> canonical result
 *
 * The in-flight check is registered synchronously BEFORE the leader's cache
 * lookup, deliberately: with cache-first ordering two concurrent identical
 * callers can both miss and both fetch, breaking coalescing.
 *
 * Budget permission is required for every ACTUAL outbound provider attempt —
 * the initial request and the bounded 503 retry each cost a token — so the
 * documented "N fetches per window" contract describes real provider traffic
 * rather than logical lookups.
 *
 * This module changes ONLY how provider requests are executed. It never
 * converts timetable evidence into durations, selects routes, or participates in
 * ranking/feasibility/budget/UI decisions.
 *
 * Honest coordination scope — read this before trusting any limit:
 *
 *   - The in-memory result cache is ISOLATE-LOCAL. Cloudflare Pages Functions
 *     isolates do not share module memory.
 *   - The Cloudflare Cache API store is EDGE-LOCAL: shared by isolates within a
 *     data center, but NOT globally distributed.
 *   - The request budget is ISOLATE-LOCAL. It is a safety valve against a runaway
 *     caller or a retry storm reaching one isolate — it is NOT a provider-wide
 *     quota guard, and it is not described as one. A genuinely distributed
 *     counter would need new infrastructure (Durable Objects / D1 / KV) and is
 *     deliberately out of scope here; `OdptRequestBudget` is the replacement
 *     seam for that later work.
 */
import {
  ODPT_CACHE_CONTRACT_VERSION,
  canonicalOdptRequestIdentity,
  odptCacheKey,
  odptProviderScope,
} from "./odpt-request-identity.js";

// ── Cache policy (Meguruto operational policy, NOT provider guarantees) ───────

/**
 * Resource classes. TTLs differ per class on purpose: a single universal TTL
 * would either over-cache timetables or under-cache reference data.
 */
export const ODPT_CACHE_CLASS = Object.freeze({
  REFERENCE: "reference",
  CALENDAR: "calendar",
  TIMETABLE: "timetable",
  FARE: "fare",
  /** Successful `no_data` (HTTP 404). Short-lived, and never becomes `[]`. */
  NEGATIVE: "negative",
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Conservative starting TTLs, in milliseconds.
 *
 * These are Meguruto cache policy choices based on how each resource is
 * documented and observed to change. They are NOT claims about ODPT update
 * guarantees, and nothing here should be read as a provider SLA.
 */
export const ODPT_CACHE_TTL_MS = Object.freeze({
  reference: 6 * HOUR,
  calendar: 1 * HOUR,
  timetable: 5 * MINUTE,
  fare: 1 * HOUR,
});

/** Short negative TTL for `no_data`. Conservative: it can go stale quickly. */
export const ODPT_NEGATIVE_CACHE_TTL_MS = 1 * MINUTE;

/** Hard ceiling on entries held by the memory store. */
export const ODPT_MEMORY_CACHE_MAX_ENTRIES = 512;

/**
 * Which cache class each allow-listed operation belongs to.
 *
 * `datapoint` is deliberately placed in the most conservative *data* class: its
 * `@type` is only known AFTER the fetch, so a datapoint lookup could return a
 * timetable-shaped resource. Treating it as long-lived reference data would be
 * an unsupported assumption.
 */
export const ODPT_OPERATION_CACHE_CLASS = Object.freeze({
  operator: ODPT_CACHE_CLASS.REFERENCE,
  station: ODPT_CACHE_CLASS.REFERENCE,
  railway: ODPT_CACHE_CLASS.REFERENCE,
  nearby_stations: ODPT_CACHE_CLASS.REFERENCE,
  train_type: ODPT_CACHE_CLASS.REFERENCE,
  rail_direction: ODPT_CACHE_CLASS.REFERENCE,
  datapoint: ODPT_CACHE_CLASS.TIMETABLE,
  calendar: ODPT_CACHE_CLASS.CALENDAR,
  station_timetable: ODPT_CACHE_CLASS.TIMETABLE,
  train_timetable: ODPT_CACHE_CLASS.TIMETABLE,
  railway_fare: ODPT_CACHE_CLASS.FARE,
});

export function cacheClassForOperation(operation) {
  return ODPT_OPERATION_CACHE_CLASS[operation] ?? null;
}

export function cacheTtlMsForClass(cacheClass) {
  if (cacheClass === ODPT_CACHE_CLASS.NEGATIVE) {
    return ODPT_NEGATIVE_CACHE_TTL_MS;
  }
  return ODPT_CACHE_TTL_MS[cacheClass] ?? null;
}

/**
 * Provider error codes that must NEVER be cached as ordinary data.
 *
 * Kept as an explicit, testable list rather than an implicit "anything that is
 * not `records`" so that adding a new error code cannot silently start caching
 * a failure.
 */
export const ODPT_NON_CACHEABLE_ERROR_CODES = Object.freeze([
  "provider_authentication_error",
  "provider_authorization_error",
  "billing_required",
  "provider_internal_error",
  "provider_unavailable",
  "provider_invalid_request",
  "provider_method_not_allowed",
  "provider_timeout",
  "network_error",
  "provider_not_configured",
  "provider_endpoint_not_allowed",
  "provider_request_config_error",
  "invalid_provider_response",
  "malformed_provider_json",
  "malformed_provider_record",
  "malformed_timetable_objects",
  "timetable_without_train_number",
  "provider_response_too_large",
  "budget_exhausted",
  "rate_limited",
]);

/**
 * Decides whether a provider result may be cached, and in which class.
 *
 * Only two outcomes are cacheable:
 *   - `records`  — normalized records, INCLUDING a successful empty array
 *   - `no_data`  — HTTP 404, cached in the short NEGATIVE class and returned
 *                  still as `no_data` (never rewritten to `[]`)
 *
 * Every `error` outcome is non-cacheable. In particular `provider_response_too_large`
 * must never be cached as an empty result, and `billing_required` must never be
 * cached as `no_data`.
 */
export function classifyResultForCache(result, operation) {
  if (!result || typeof result !== "object") {
    return { cacheable: false, reason: "not_a_result" };
  }
  const { outcome, errorCode } = result;

  if (outcome === "records") {
    const cacheClass = cacheClassForOperation(operation);
    if (!cacheClass) return { cacheable: false, reason: "unknown_operation" };
    return {
      cacheable: true,
      cacheClass,
      ttlMs: cacheTtlMsForClass(cacheClass),
    };
  }

  if (outcome === "no_data") {
    return {
      cacheable: true,
      cacheClass: ODPT_CACHE_CLASS.NEGATIVE,
      ttlMs: ODPT_NEGATIVE_CACHE_TTL_MS,
    };
  }

  if (outcome === "error") {
    const code = typeof errorCode === "string" ? errorCode : "unknown_error";
    return {
      cacheable: false,
      reason: ODPT_NON_CACHEABLE_ERROR_CODES.includes(code)
        ? `error_code_not_cacheable:${code}`
        : `error_outcome_not_cacheable:${code}`,
    };
  }

  return { cacheable: false, reason: `unknown_outcome:${String(outcome)}` };
}

// ── Provider-declared validity ───────────────────────────────────────────────

/**
 * Parses the END of an ODPT Calendar `odpt:duration` ISO8601 period.
 *
 * API v4.16 documents `odpt:duration` as an ISO8601 period and gives a
 * DATE-ONLY example (`2017-11-13/2017-11-18`). Generic `Date.parse` must not be
 * used for a date-only endpoint: JavaScript would silently apply UTC-midnight
 * semantics that ODPT never specified.
 *
 * Three explicit cases:
 *
 *   A. End carries an explicit timezone/offset (`Z`, `+09:00`, `+0900`) →
 *      use that instant.
 *   B. End is bare `YYYY-MM-DD` → the cache ceiling is the START OF THAT DATE IN
 *      ASIA/TOKYO (UTC+9, no DST). This is **Meguruto's own conservative cache
 *      policy**, not a claim that ODPT defines the period as end-exclusive or
 *      defines any timezone for it.
 *   C. Anything else (missing end, a datetime WITHOUT a timezone, a malformed
 *      value) → `unsupported`. No instant is invented; the caller falls back to
 *      its documented conservative policy TTL.
 *
 * Note case A deliberately rejects a timezone-less datetime: without an offset
 * the instant is genuinely ambiguous, so guessing one would fabricate validity.
 */
const ODPT_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Meguruto's conservative zone for date-only Calendar periods (UTC+9, no DST). */
export const ODPT_DATE_ONLY_TIMEZONE_OFFSET = "+09:00";

export function parseCalendarPeriodEnd(period) {
  if (typeof period !== "string") {
    return { status: "unsupported", reason: "not_a_string" };
  }
  const parts = period.split("/");
  if (parts.length !== 2) {
    return { status: "unsupported", reason: "not_a_two_part_period" };
  }
  if (parts[0].trim().length === 0) {
    return { status: "unsupported", reason: "missing_start" };
  }
  const end = parts[1].trim();
  if (end.length === 0) {
    return { status: "unsupported", reason: "missing_end" };
  }

  if (ODPT_DATE_ONLY_PATTERN.test(end)) {
    const endMs = Date.parse(
      `${end}T00:00:00${ODPT_DATE_ONLY_TIMEZONE_OFFSET}`,
    );
    if (Number.isNaN(endMs)) {
      return { status: "unsupported", reason: "unparseable_date_only" };
    }
    return {
      status: "date_only_start_of_day_jst",
      endMs,
      /** Documents that the instant is Meguruto policy, not a provider claim. */
      policy: "meguruto_start_of_date_asia_tokyo",
    };
  }

  // Require an explicit zone so the instant is unambiguous.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(end)) {
    return { status: "unsupported", reason: "datetime_without_timezone" };
  }
  const endMs = Date.parse(end);
  if (Number.isNaN(endMs)) {
    return { status: "unsupported", reason: "unparseable_datetime" };
  }
  return { status: "datetime", endMs };
}

/**
 * Extracts the EARLIEST trustworthy provider-declared validity end from a
 * normalized result (KAI-290 PR 2B).
 *
 * A cached entry must never outlive provider-declared validity, so the policy
 * TTL is a MAXIMUM rather than the whole answer.
 *
 * Only fields that actually declare validity are read:
 *   - `validUntil` (from `dct:valid`) — specified as a date-TIME, parsed as an
 *     instant; top-level where the schema has it, else on provenance
 *   - a Calendar's `duration` period end (see `parseCalendarPeriodEnd`)
 *
 * `dc:date` / `dct:issued` are deliberately NOT used: they record when data was
 * generated/published, which is not a statement that it remains valid. Inferring
 * validity from them would fabricate an expiry the provider never declared.
 *
 * Malformed/unparseable values are ignored rather than guessed, so the caller
 * falls back to the conservative policy TTL. Returns `{earliestMs: null}` when
 * no usable evidence exists (including a successful empty array, which has no
 * records to carry validity).
 */
export function extractProviderValidityEndMs(result) {
  const records = Array.isArray(result?.records) ? result.records : [];
  let earliestMs = null;
  let considered = 0;
  let unparseable = 0;
  const notes = [];

  const consider = (raw) => {
    if (typeof raw !== "string" || raw.trim().length === 0) return;
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      unparseable += 1;
      return;
    }
    considered += 1;
    if (earliestMs === null || parsed < earliestMs) earliestMs = parsed;
  };

  for (const record of records) {
    if (!isRecord(record)) continue;
    // `dct:valid` is preserved top-level where the schema has it, and always on
    // provenance; prefer the top-level field and fall back to provenance.
    consider(record.validUntil);
    if (record.validUntil === undefined) {
      consider(record.provenance?.validUntil);
    }

    // Calendar validity window: an ISO8601 period, parsed explicitly.
    if (record.duration !== undefined && record.duration !== null) {
      const parsed = parseCalendarPeriodEnd(record.duration);
      if (parsed.status === "unsupported") {
        unparseable += 1;
        notes.push(`duration_unsupported:${parsed.reason}`);
      } else {
        considered += 1;
        if (parsed.status === "date_only_start_of_day_jst") {
          notes.push("duration_date_only_ceiling_meguruto_asia_tokyo");
        }
        if (earliestMs === null || parsed.endMs < earliestMs) {
          earliestMs = parsed.endMs;
        }
      }
    }
  }

  return {
    earliestMs,
    considered,
    unparseable,
    recordCount: records.length,
    notes,
  };
}

// ── Cache stores ─────────────────────────────────────────────────────────────

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Isolate-local memory store. The default, and the store used in tests.
 * `scope` is reported so nothing downstream can mislabel it as global.
 */
export function createMemoryCacheStore({
  now = Date.now,
  maxEntries = ODPT_MEMORY_CACHE_MAX_ENTRIES,
} = {}) {
  const entries = new Map();

  function pruneExpired(currentTime) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(key);
    }
  }

  return {
    scope: "isolate-local",
    async read(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry;
    },
    async write(key, entry) {
      if (entries.size >= maxEntries) {
        pruneExpired(now());
        if (entries.size >= maxEntries) {
          // Evict the entry closest to expiry.
          let oldestKey = null;
          let oldestExpiry = Number.POSITIVE_INFINITY;
          for (const [existingKey, existing] of entries) {
            if (existing.expiresAt < oldestExpiry) {
              oldestExpiry = existing.expiresAt;
              oldestKey = existingKey;
            }
          }
          if (oldestKey !== null) entries.delete(oldestKey);
        }
      }
      entries.set(key, entry);
    },
    async remove(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

/**
 * Cloudflare Cache API store (EDGE-LOCAL: shared per data center, not global).
 *
 * `/api/odpt` is a POST endpoint, so the Cache API cannot key off the inbound
 * request. A synthetic GET key is built from the credential-free canonical
 * identity instead — the credential-bearing provider URL is never used as a key.
 *
 * Every operation is failure-tolerant: a cache read/write error degrades to "no
 * cached value" and is counted, because a cache problem must never fail a
 * request that the provider could have served.
 */
export function createEdgeCacheStore({ cache, now = Date.now } = {}) {
  if (!cache || typeof cache.match !== "function") {
    throw new TypeError("createEdgeCacheStore requires a Cache API instance");
  }
  const requestFor = (key) => new Request(key, { method: "GET" });

  return {
    scope: "edge-local (per Cloudflare data center)",
    async read(key) {
      const response = await cache.match(requestFor(key));
      if (!response) return null;
      let parsed;
      try {
        parsed = await response.json();
      } catch {
        return null;
      }
      if (!isRecord(parsed) || typeof parsed.identity !== "string") return null;
      if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now()) {
        return null;
      }
      return parsed;
    },
    async write(key, entry) {
      const ttlSeconds = Math.max(
        1,
        Math.ceil((entry.expiresAt - now()) / 1000),
      );
      await cache.put(
        requestFor(key),
        new Response(JSON.stringify(entry), {
          headers: {
            "content-type": "application/json",
            "cache-control": `max-age=${ttlSeconds}`,
          },
        }),
      );
    },
    async remove(key) {
      await cache.delete(requestFor(key));
    },
    size() {
      return null;
    },
  };
}

/**
 * Result cache over a store, adding effective-TTL handling, provider-scope
 * isolation and identity/contract verification.
 *
 * The full cache context (contract version, provider scope, canonical identity)
 * is stored alongside the value, so a hash collision, a provider-scope change or
 * a payload-contract bump is DETECTED and treated as a miss rather than serving
 * a different request's — or a different endpoint's — result.
 */
export function createOdptResultCache({ store, now = Date.now } = {}) {
  if (!store) throw new TypeError("createOdptResultCache requires a store");
  return {
    scope: store.scope,
    async lookup({ identity, cacheClass, providerScope }) {
      const scope = normalizeScope(providerScope);
      const ttlMs = cacheTtlMsForClass(cacheClass);
      if (ttlMs === null) return { hit: false, reason: "unclassifiable" };
      const key = odptCacheKey({ providerScope: scope, identity });
      const entry = await store.read(key);
      if (!entry) return { hit: false };
      const mismatch =
        entry.identity !== identity ||
        normalizeScope(entry.providerScope) !== scope ||
        entry.contractVersion !== ODPT_CACHE_CONTRACT_VERSION;
      if (mismatch) {
        // Never serve another scope's / contract's result: evict and miss.
        await store.remove(key);
        return { hit: false, reason: "cache_context_mismatch" };
      }
      return {
        hit: true,
        cacheClass: entry.cacheClass ?? cacheClass,
        value: entry.value,
        expiresAt: entry.expiresAt,
      };
    },
    /**
     * Stores a result, capping the entry's lifetime by provider-declared
     * validity when usable evidence exists.
     *
     *   effective expiry = min(now + policy TTL, applicable validity end)
     *
     * The policy TTL is the MAXIMUM: provider validity may shorten it, never
     * extend it. If the earliest applicable validity is already in the past the
     * result is not positive-cached at all.
     */
    async store({ identity, cacheClass, value, providerScope }) {
      const scope = normalizeScope(providerScope);
      const ttlMs = cacheTtlMsForClass(cacheClass);
      if (ttlMs === null) return { stored: false, reason: "unclassifiable" };
      const currentTime = now();
      const policyExpiry = currentTime + ttlMs;

      const validity = extractProviderValidityEndMs(value);
      let expiresAt = policyExpiry;
      let validityCapped = false;
      if (validity.earliestMs !== null) {
        if (validity.earliestMs <= currentTime) {
          // Already-expired evidence must not be positive-cached.
          return {
            stored: false,
            reason: "provider_validity_expired",
            validityExpiresAt: validity.earliestMs,
          };
        }
        if (validity.earliestMs < policyExpiry) {
          expiresAt = validity.earliestMs;
          validityCapped = true;
        }
      }

      await store.write(odptCacheKey({ providerScope: scope, identity }), {
        contractVersion: ODPT_CACHE_CONTRACT_VERSION,
        providerScope: scope,
        identity,
        cacheClass,
        expiresAt,
        value,
      });
      return {
        stored: true,
        expiresAt,
        ttlMs: expiresAt - currentTime,
        policyTtlMs: ttlMs,
        validityCapped,
        validityExpiresAt: validity.earliestMs,
      };
    },
  };
}

/** Absent/blank scopes collapse to one explicit token, never to `undefined`. */
function normalizeScope(providerScope) {
  return typeof providerScope === "string" && providerScope.length > 0
    ? providerScope
    : odptProviderScope(null);
}

// ── Provider request budget ──────────────────────────────────────────────────

/**
 * Conservative Meguruto-side default. The live provider advertises
 * `X-RateLimit-Limit-minute: 60` for the shared credential, but those headers
 * are production OBSERVATIONS, not a documented contract, so no provider quota
 * is encoded here. This is a safety valve sized comfortably inside the observed
 * figure for one isolate — NOT a provider-wide guarantee. See the module header
 * for the coordination-scope caveat.
 */
export const ODPT_DEFAULT_BUDGET_LIMIT = 30;
export const ODPT_DEFAULT_BUDGET_WINDOW_MS = MINUTE;

/**
 * ISOLATE-LOCAL fixed-window provider-fetch budget.
 *
 * Only a real provider fetch consumes a token: cache hits, dedup followers,
 * validation failures and rejected caller requests do not call `acquire` at all.
 * The clock is injectable so window behaviour is deterministic under a fake timer.
 */
export function createOdptRequestBudget({
  limit = ODPT_DEFAULT_BUDGET_LIMIT,
  windowMs = ODPT_DEFAULT_BUDGET_WINDOW_MS,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("budget limit must be a positive integer");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new TypeError("budget windowMs must be a positive number");
  }
  let used = 0;
  let resetAt = null;

  return {
    scope: "isolate-local",
    limit,
    windowMs,
    acquire() {
      const currentTime = now();
      if (resetAt === null || currentTime >= resetAt) {
        used = 1;
        resetAt = currentTime + windowMs;
        return { allowed: true, remaining: limit - used, retryAfterMs: 0 };
      }
      if (used < limit) {
        used += 1;
        return { allowed: true, remaining: limit - used, retryAfterMs: 0 };
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, resetAt - currentTime),
      };
    },
    snapshot() {
      return { limit, windowMs, used, resetAt, scope: "isolate-local" };
    },
    reset() {
      used = 0;
      resetAt = null;
    },
  };
}

// ── Observability ────────────────────────────────────────────────────────────

/**
 * Safe behavioural counters. No credential, no caller identity, no raw payload —
 * these are the only observability surface, and tests read them instead of
 * production logs.
 */
export function createOdptProtectionCounters() {
  return {
    cacheHits: 0,
    cacheMisses: 0,
    cacheWrites: 0,
    cacheSkips: 0,
    cacheErrors: 0,
    dedupHits: 0,
    providerRequests: 0,
    budgetAllowed: 0,
    budgetRejected: 0,
    budgetUnavailable: 0,
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Builds the protection layer.
 *
 * @param {object} options
 * @param {object|null} options.cache   result cache (from createOdptResultCache)
 * @param {object|null} options.budget  provider budget (from createOdptRequestBudget)
 */
export function createOdptRuntimeProtection({
  cache = null,
  budget = null,
} = {}) {
  const counters = createOdptProtectionCounters();
  /** composite dedup key -> Promise<{result, runtime}> for one provider fetch. */
  const inFlight = new Map();

  async function lookupCached(identity, cacheClass, providerScope) {
    if (!cache) return { hit: false };
    try {
      return await cache.lookup({ identity, cacheClass, providerScope });
    } catch {
      // A cache failure must never fail the request.
      counters.cacheErrors += 1;
      return { hit: false, reason: "cache_error" };
    }
  }

  async function writeCached(identity, cacheClass, value, providerScope) {
    if (!cache) return;
    try {
      const outcome = await cache.store({
        identity,
        cacheClass,
        value,
        providerScope,
      });
      if (outcome?.stored === false) {
        counters.cacheSkips += 1;
      } else {
        counters.cacheWrites += 1;
      }
    } catch {
      counters.cacheErrors += 1;
    }
  }

  /**
   * The single-flight leader: cache lookup, then a budget permission per ACTUAL
   * provider attempt, then the fetch.
   *
   * Reached only when this caller won the synchronous in-flight registration
   * below, so exactly one leader exists per cache context at a time.
   */
  async function executeLeader(
    identity,
    cacheClass,
    validated,
    executeProvider,
    providerScope,
  ) {
    // 1. Cache lookup — costs no provider fetch and no budget token.
    const cached = await lookupCached(identity, cacheClass, providerScope);
    if (cached.hit) {
      counters.cacheHits += 1;
      return {
        result: cached.value,
        runtime: {
          cacheHit: true,
          dedupHit: false,
          providerRequest: false,
          providerAttempts: 0,
          budgetTokensUsed: 0,
          budgetExhausted: false,
          budgetUnavailable: false,
        },
      };
    }
    counters.cacheMisses += 1;

    // 2. Budget — permission is required for EVERY actual outbound attempt, so a
    //    503 retry costs a SECOND token instead of riding on the first. This
    //    function is handed to `odptLookup`, which calls it immediately before
    //    each real fetch, keeping retry mechanics in one place.
    let attempts = 0;
    let tokensUsed = 0;
    let blockedByBudget = false;
    let budgetUnavailable = false;
    const acquireAttempt = async () => {
      if (budget) {
        // `await` tolerates BOTH shapes: the current in-memory budget is
        // synchronous, while the documented replacement seam (Durable Object /
        // D1 / KV) will be asynchronous. Awaiting a non-promise is a no-op.
        let decision;
        try {
          decision = await budget.acquire(identity);
        } catch {
          // A budget-backend failure is NOT ordinary exhaustion: no trustworthy
          // decision was obtained, so no provider request is issued. The error
          // must not escape `odptLookup` (which never throws) and must not be
          // dressed up as a provider failure.
          counters.budgetUnavailable += 1;
          budgetUnavailable = true;
          return { allowed: false, errorCode: "budget_unavailable" };
        }
        if (!decision || decision.allowed !== true) {
          counters.budgetRejected += 1;
          blockedByBudget = true;
          return {
            allowed: false,
            errorCode: "budget_exhausted",
            retryAfterMs: decision?.retryAfterMs,
          };
        }
        counters.budgetAllowed += 1;
        tokensUsed += 1;
      }
      // Counted only after permission is granted, i.e. when an outbound attempt
      // will genuinely be issued (including a timeout/network attempt). A blocked
      // attempt is never counted.
      attempts += 1;
      counters.providerRequests += 1;
      return { allowed: true };
    };

    // 3. Provider fetch (includes the 1 MB size guard and normalization).
    const result = await executeProvider({ acquireAttempt });

    // 4. Safe cache write, only when the result class is cacheable.
    const classification = classifyResultForCache(result, validated.operation);
    if (classification.cacheable) {
      await writeCached(
        identity,
        classification.cacheClass,
        result,
        providerScope,
      );
    }

    return {
      result,
      runtime: {
        cacheHit: false,
        dedupHit: false,
        providerRequest: attempts > 0,
        providerAttempts: attempts,
        budgetTokensUsed: tokensUsed,
        budgetExhausted: blockedByBudget,
        budgetUnavailable,
      },
    };
  }

  /**
   * Executes a validated request with cache, dedup and budget protection.
   *
   * @param {{ok: true, operation: string, body: object}} validated
   * @param {(ctx: {acquireAttempt: Function}) => Promise<object>} executeProvider
   *   performs the real fetch. It MUST call `ctx.acquireAttempt()` before each
   *   outbound provider attempt so every attempt is budgeted.
   * @param {{providerScope?: string}} [context] resolved provider scope
   * @returns {Promise<{result: object, runtime: object}>}
   */
  async function run(validated, executeProvider, context = {}) {
    const identity = canonicalOdptRequestIdentity(validated);
    const cacheClass = cacheClassForOperation(validated.operation);
    const providerScope = normalizeScope(context.providerScope);
    // One dedup key per cache context: identical requests against different
    // configured provider endpoints must never share an in-flight fetch.
    const dedupKey = `${providerScope}|${identity}`;

    // Single-flight registration is deliberately SYNCHRONOUS (no await between
    // the lookup and the set) so two concurrent identical callers can never both
    // become leaders, no matter how slow a cache read is. A follower therefore
    // never issues a provider request or consumes a budget token.
    const existing = inFlight.get(dedupKey);
    if (existing) {
      counters.dedupHits += 1;
      const { result } = await existing;
      return {
        result,
        runtime: {
          cacheClass,
          cacheHit: false,
          dedupHit: true,
          providerRequest: false,
          providerAttempts: 0,
          budgetTokensUsed: 0,
          budgetExhausted: false,
          budgetUnavailable: false,
        },
      };
    }

    const leader = executeLeader(
      identity,
      cacheClass,
      validated,
      executeProvider,
      providerScope,
    );
    inFlight.set(dedupKey, leader);

    try {
      const { result, runtime } = await leader;
      return { result, runtime: { cacheClass, ...runtime } };
    } finally {
      // Removal must happen on BOTH success and failure, otherwise a rejected
      // promise would stay in the map and poison every later identical call.
      if (inFlight.get(dedupKey) === leader) inFlight.delete(dedupKey);
    }
  }

  return {
    run,
    counters,
    cache,
    budget,
    inFlightSize: () => inFlight.size,
  };
}

/** Honest coordination scope for each layer, for docs and PR reporting. */
export const ODPT_PROTECTION_SCOPE = Object.freeze({
  memoryCache: "isolate-local",
  edgeCache: "edge-local (per Cloudflare data center)",
  inFlightDedup: "isolate-local",
  requestBudget: "isolate-local",
});
