# KAI-290 — ODPT runtime request protection, caching and provider budget

Status: **implemented** (KAI-290 PR 2B) for the request-protection layer; the
per-journey budget in §6 remains **design only** and belongs to the later
timetable-Journey PR.

Scope: how ODPT evidence is acquired safely through the existing server boundary
`POST /api/odpt`. Nothing here changes travel behaviour: no Journey derivation,
no ranking, no feasibility, no budgets, no UI.

This document supersedes the PR 1 design draft at the same path. PR 1 was written
before the authenticated production audit; §1 records what the audit changed.

---

## 1. What the authenticated audit changed

The bounded authenticated audit (KAI-290 audit PR, `qa/kai-290/odpt-coverage.*`)
replaced several PR-1 assumptions with measurements.

### 1.1 The 1 MB response guard is retained and is load-bearing

`ODPT_MAX_RESPONSE_BYTES = 1_000_000` in `functions/api/odpt-core.js` fails closed
with `provider_response_too_large`. Live measurement showed:

| Query shape                                        | Live result                |
| -------------------------------------------------- | -------------------------- |
| `station_timetable` filtered by **operator**       | `provider_response_too_large` |
| `train_timetable` filtered by **whole railway**    | `provider_response_too_large` |
| `train_timetable` by **exact train identity**      | success                    |

**The guard must not be raised to make broad timetable queries work.** It is an
enforced expression of "broad timetable reads are not a runtime strategy".
Caching is likewise not a licence to widen a request: nothing in this design
makes an operator-wide or whole-railway timetable read acceptable at runtime.

### 1.2 Timetable retrieval must be narrow — ideally exact train identity

Verified shape (`odpt.Train:TokyoMetro.Marunouchi.B427` → 1 record, 18 ordered
stop objects, Shinjuku → Ikebukuro). The runtime direction is:

```
identify the service/train narrowly
  -> request TrainTimetable by exact train identity
  -> consume normalized evidence
```

**Not** `download the whole railway timetable -> filter client-side`. Deriving
that identity safely is the later Journey PR's responsibility; this PR only makes
such requests safe to execute.

### 1.3 Timetable pilot scope

`odpt.Operator:TokyoMetro` and `odpt.Operator:Toei` are the current
timetable-backed pilot. **JR-East remains outside this timetable pilot**: in the
bounded authenticated audit no usable JR-East `TrainType`, `RailDirection`,
`StationTimetable` or `TrainTimetable` data was returned across the sampled major
stations and railways. That is observed zero coverage *in the audited corpus*
(ODPT search completeness is not guaranteed), not a claim of universal provider
incapability. This PR does not revisit that conclusion and does not act on it.

### 1.4 Where protection lives — a deliberate change from PR 1

PR 1 proposed a decorator over `OdptApiProvider` in the browser. That is the
wrong layer for this goal: the resource being protected is the **single shared
ODPT credential**, which is only ever used server-side. A browser-side cache would
be per-user and would protect nothing collectively.

Protection is therefore implemented **inside the server boundary**, in
`functions/api/odpt-runtime-protection.js` + `functions/api/odpt-request-identity.js`,
wrapping the existing `odptLookup`. There is no second ODPT client.
`OdptApiProvider` remains the raw client transport and keeps its **no caching**
invariant.

---

## 2. Request flow

```
rate limit (per-client, isolate-local)
  -> parse + validate            (rejects before any identity/cache/budget)
  -> provider readiness          (config failure cannot be masked by cache)
  -> canonical request identity
  -> in-flight dedup join        (no provider call, no budget token)
        else single-flight leader:
          -> cache lookup        (no provider call, no budget token)
          -> provider budget acquire   (only a real fetch costs one)
          -> odptLookup (fetch + 1 MB guard + normalize)
          -> cache write if the result class is cacheable
  -> canonical result + runtime metadata
```

Ordering guarantees that the mandatory tests pin:

- validation happens **before** identity generation, so an invalid request can
  never create a cache entry, join a dedup group, or consume a budget token;
- a cache hit costs no provider call and no budget token;
- a dedup follower costs no provider call and no extra budget token;
- **only a real provider fetch calls `acquire()`**.

### 2.1 Single-flight is registered synchronously

`run()` looks up and registers the in-flight entry with **no `await` between the
two**, so two concurrent identical callers cannot both become leaders regardless
of cache latency. A follower therefore never duplicates a provider call. The
in-flight entry is removed in a `finally`, i.e. on **both** success and failure —
a rejected promise can never remain in the map and poison later identical calls.

---

## 3. Canonical request identity

One generator (`canonicalOdptRequestIdentity`) is shared by caching, deduplication
and budget accounting, so all three agree on what "the same request" means. It is
generated **only after validation**, from the operation plus the validated
semantic filters declared by that operation's schema.

Format: a versioned prefix plus a JSON array of `[name, value]` pairs sorted by
name, e.g.

```
odpt-canonical-v1:[["operation","train_timetable"],["train","odpt.Train:Toei.Mita.535T"]]
```

Two deliberate choices:

- **Array-of-pairs, not a `name=value|name=value` join.** A naive join collides
  for text filters that legitimately contain the separator: `title: "A|stationCode=B"`
  would produce the same string as `title: "A"` + `stationCode: "B"`. JSON
  escaping makes that impossible (regression-tested).
- **Sorted by name**, so JSON property order in the caller's request cannot
  change the identity.

An array of pairs also guarantees the provider's own `acl:consumerKey` parameter
can never be confused with a caller filter.

The identity never contains, and is never derived from: `ODPT_API_KEY`, the
`acl:consumerKey` parameter name, the caller IP, the credential-bearing provider
URL, or any unvalidated caller field. Fields that validation rejects never reach
the canonicalizer; undeclared fields are ignored even if injected.

Cache keys are a synthetic, credential-free URL derived from a deterministic
64-bit digest of the identity (`https://odpt-cache.meguruto.internal/v1/<digest>`).
The credential-bearing upstream URL is **never** a cache key. Entries store their
full canonical identity, and a mismatch (hash collision) is treated as a **miss**
and evicted rather than serving another request's result.

---

## 4. Cache policy

### 4.1 Classes and TTLs

TTLs are **Meguruto operational policy**, not ODPT update guarantees. One
universal TTL would either over-cache timetables or under-cache reference data,
so each resource class has its own.

| Class       | Operations                                                                                    | TTL    |
| ----------- | --------------------------------------------------------------------------------------------- | ------ |
| `reference` | `operator`, `station`, `railway`, `nearby_stations`, `train_type`, `rail_direction`            | 6 h    |
| `calendar`  | `calendar`                                                                                    | 1 h    |
| `timetable` | `station_timetable`, `train_timetable`, `datapoint`                                           | 5 min  |
| `fare`      | `railway_fare`                                                                                | 1 h    |
| `negative`  | any successful `no_data` (HTTP 404)                                                           | 1 min  |

Two notes:

- These replace the PR 1 draft values (24 h / 12 h / 6 h). The audit made
  timetables the volatile, expensive class and reference data cheap to refetch;
  shorter data TTLs are the conservative choice for correctness now that the
  narrow-identity shape is known.
- `datapoint` is placed in the most conservative *data* class because its `@type`
  is only known **after** the fetch — it may return timetable-shaped data, so
  long-lived caching would be an unsupported assumption.

No TTL is infinite; every TTL is finite and positive.

### 4.2 Cacheable / non-cacheable result matrix

| Result                              | Cached? | Notes                                             |
| ----------------------------------- | ------- | ------------------------------------------------- |
| `records` (including successful `[]`) | yes   | successful empty is a real provider answer        |
| `no_data` (HTTP 404)                | yes     | short `negative` TTL, stays `no_data`, never `[]`  |
| `provider_authentication_error` (401) | **no** | never cached as data                              |
| `billing_required` (402)            | **no**  | never cached, never rewritten to `no_data`         |
| `provider_authorization_error` (403) | **no** |                                                   |
| `provider_internal_error` (500)      | **no** |                                                   |
| `provider_unavailable` (503)         | **no** |                                                   |
| `provider_invalid_request` (400)     | **no** |                                                   |
| `provider_method_not_allowed` (405)  | **no** |                                                   |
| `malformed_provider_json` / `invalid_provider_response` | **no** |                                  |
| `malformed_provider_record` and the timetable record errors | **no** |                             |
| `provider_response_too_large`        | **no** | must never be cached as an empty result             |
| `budget_exhausted`                   | **no** | a Meguruto state, not provider evidence             |
| `provider_timeout` / `network_error` | **no** |                                                   |
| `provider_not_configured` / `provider_endpoint_not_allowed` / `provider_request_config_error` | **no** |      |

The non-cacheable error codes are an explicit, tested list
(`ODPT_NON_CACHEABLE_ERROR_CODES`) rather than an implicit "anything that is not
`records`", so adding a new error code cannot silently start caching a failure.

No error-stampede suppression TTL is implemented: it was not needed to keep this
design simple, and adding one would complicate preserving the original error
state.

### 4.3 Configuration/readiness is checked before the cache

`odptProviderReadiness(env)` evaluates request-independent failures (missing
credential, disallowed endpoint) **before** the cache. Without this, a cached
success would mask a misconfigured credential: the endpoint would look healthy
and serve data while every real provider call failed. Regression-tested at the
endpoint level.

---

## 5. Deduplication and caching stores — coordination scope

**Isolate-local, and named as such.** Cloudflare Pages Functions isolates do not
share module-memory state, so nothing here is described as global.

| Layer                  | Scope                                        |
| ---------------------- | -------------------------------------------- |
| in-flight dedup        | isolate-local                                |
| memory cache store     | isolate-local                                |
| Cloudflare Cache API   | **edge-local** (shared per data center, not globally distributed) |
| provider request budget | isolate-local                               |

The boundary prefers the Cloudflare Cache API when available and falls back to an
isolate-local memory cache. `/api/odpt` is a POST endpoint, so the Cache API
cannot key off the inbound request; a synthetic **GET** key is built from the
credential-free canonical identity instead.

Cache operations are failure-tolerant: a cache read/write error degrades to "no
cached value" and is counted, because a cache problem must never fail a request
the provider could have served.

### 5.1 Provider quota remains observational

Live responses on 2026-09-10 advertised `X-RateLimit-Limit-minute: 60`,
`-hour: 3600`, `-day: 24000`. Those are **observations on one credential on one
occasion**, are **not documented in ODPT API Specification v4.16**, and are not
encoded as contractual limits anywhere. The same position is recorded in
`odpt-core.js` (KAI-289).

---

## 6. Provider request budget

`createOdptRequestBudget({limit, windowMs, now})` — a fixed-window counter with an
injectable clock, so window behaviour is deterministic under a fake timer and the
configuration is testable.

Defaults: **30 provider fetches per 60 s per isolate**, overridable via
`ODPT_PROVIDER_BUDGET_LIMIT` / `ODPT_PROVIDER_BUDGET_WINDOW_MS`. The default is
sized comfortably inside the observed per-minute figure for one isolate.

### 6.1 What this is NOT

It is **isolate-local**. It is a safety valve against a runaway caller or a retry
storm reaching one isolate — it is **not** a provider-wide quota guard, and it is
not described as one anywhere in the code or this document. Over N isolates the
effective ceiling is higher than the nominal limit.

A genuinely distributed counter would need new infrastructure (Durable Objects,
D1, KV, or another stateful service). **That is deliberately not added here.**
`OdptRequestBudget` is the replacement seam: a distributed implementation can
satisfy the same `acquire()` contract later without touching callers.

### 6.2 `budget_exhausted` is its own state

When the budget refuses a fetch, the boundary returns the canonical envelope with
`outcome: "error"`, `errorCode: "budget_exhausted"`, empty `records`, and an empty
`sourceUrl` (no provider request was issued). It is:

- **not** `no_data` (the provider was never asked),
- **not** an empty success (nothing was confirmed),
- **not** a provider failure (the provider never failed).

It is never cached.

### 6.3 Per-journey budget — DESIGN ONLY, not implemented

A per-journey cap of **12 provider calls** (8 base + 4 per transfer, max 1
transfer) remains the plan for the later timetable-Journey PR, where it will fail
closed into the existing conservative estimator rather than inventing data. No
part of that is implemented in this PR, and no runtime path currently derives a
Journey from ODPT evidence.

---

## 7. Semantic result contract

Transport states stay distinct and are **never** converted into one another by
caching or dedup:

| Category                | States                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Success                 | `records` (including `[]`)                                                                |
| No data                 | `no_data`                                                                                 |
| Billing                 | `billing_required`                                                                        |
| Budget                  | `budget_exhausted`                                                                        |
| Provider / contract     | `provider_authentication_error`, `provider_authorization_error`, `provider_invalid_request`, `provider_internal_error`, `provider_unavailable`, `provider_method_not_allowed`, `provider_response_too_large`, `malformed_provider_json`, `invalid_provider_response`, `provider_timeout`, `network_error`, `provider_not_configured` |

`budget_exhausted` is added to `OdptErrorCode` in `OdptProvider.ts` for exactly
this reason. Cached and fresh results carry the **same** payload; only the
`runtime` metadata differs.

---

## 8. Observability

Responses carry a credential-free `runtime` object:

```json
{ "cacheClass": "reference", "cacheHit": false, "dedupHit": false,
  "providerRequest": true, "budgetAllowed": true }
```

It never contains the credential, the consumer key, the caller IP, or the raw
provider payload. Safe counters (`cacheHits`, `cacheMisses`, `cacheWrites`,
`cacheErrors`, `dedupHits`, `providerRequests`, `budgetAllowed`,
`budgetRejected`) are exposed for tests rather than written to production logs —
no permanent console logging is added. Tests assert the console stays silent.

---

## 9. Non-goals (unchanged behaviour)

No Journey derivation, no timetable-to-duration conversion, no route selection,
no ranking/feasibility/budget change, no UI or planner change, no
`OriginAwareTransportService` precedence change, no KAI-348 fallback change. This
PR changes **how ODPT requests are executed**, not travel behaviour.
