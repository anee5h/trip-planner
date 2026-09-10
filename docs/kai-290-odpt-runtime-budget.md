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
  -> canonical request identity + credential-free provider scope
  -> SYNCHRONOUS in-flight lookup/register
       follower -> join the leader's result   (no provider call, no token)
       leader   ->
           cache lookup                       (no provider call, no token)
           budget permission PER ACTUAL PROVIDER ATTEMPT
             attempt 1 (initial)
             attempt 2 (bounded 503 retry) if attempt 1 returned 503
           provider fetch (+ 1 MB guard, normalize)
           cache write if the result class is cacheable and not validity-expired
  -> canonical result + runtime metadata
```

Ordering guarantees that the mandatory tests pin:

- validation happens **before** identity generation, so an invalid request can
  never create a cache entry, join a dedup group, or consume a budget token;
- a cache hit costs no provider call and no budget token;
- a dedup follower costs no provider call and no extra budget token;
- **every actual outbound provider attempt requires budget permission**, so a 503
  retry costs a second token.

### 2.1 The in-flight check is registered synchronously and BEFORE the cache

`run()` looks up and registers the in-flight entry with **no `await` between the
two**, and that happens before the leader performs its cache lookup. With the
cache consulted first, two concurrent identical callers can both observe a miss
and both start a fetch, which would break single-flight coalescing on any cache
with latency. The in-flight entry is removed in a `finally`, i.e. on **both**
success and failure — a rejected promise can never remain in the map and poison
later identical calls.

Registration is keyed by `provider scope + canonical identity`, so two deployments
configured with different ODPT base URLs can never coalesce into one fetch.

### 2.2 Budgeting is per ATTEMPT, not per logical lookup

`odptLookup` accepts a narrow `beforeProviderAttempt` hook and calls it
immediately before each real `fetch`, keeping retry mechanics in `odpt-core.js`
and the permission decision in the protection layer.

| Situation | Tokens | Actual provider attempts |
| --------- | ------ | ------------------------ |
| first attempt succeeds | 1 | 1 |
| 503, retry succeeds | 2 | 2 |
| 503, 503 | 2 | 2 |
| 503, retry refused by budget | 1 | **1** |
| cache hit | 0 | 0 |
| dedup follower (N callers) | 0 extra | 0 extra |
| timeout / network attempt that reached `fetch` | 1 | 1 |
| validation, readiness or config failure | 0 | 0 |

No token is reserved for a retry that never happens.

**A retry blocked by budget is reported truthfully.** The final canonical state is
`budget_exhausted`, and `sourceUrl` is empty only when nothing was fetched: a
first-attempt refusal carries `""`, while a refused retry keeps the safe sanitized
URL of the attempt that really happened. The original 503 is not silently rewritten
into a provider error.

The refusal PHASE (first attempt vs retry) and the number of attempts made are
**internal diagnostics**, reported on the protection layer's `runtime` object —
never on the public result. An HTTP client needs to know *that* the budget refused,
not *where*, so the public envelope carries no `providerAttempts` and no
`retryBlockedByBudget`.

Counters follow the same definition: `providerRequests` and `providerAttempts`
mean **actual outbound provider attempts**, never logical lookups.


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
64-bit digest over **three components**: the cache payload contract version, a
**provider scope** derived from the resolved provider base URL, and the canonical
request identity. The credential-bearing upstream URL is **never** a cache key.
Entries store all three, and any mismatch is treated as a **miss** and evicted
rather than serving another request's — or another endpoint's — result.

### 3.1 Provider scope is part of the cache key

`ODPT_API_BASE_URL` is deployment-configurable and allow-listed, so the same
semantic request (`station` + `operator=Toei`) can be served from two different
configured ODPT endpoints. Without a provider scope one deployment's cached
payload could be served for another endpoint's request. The scope is
`odpt-provider-v1:<digest of the normalized resolved base URL>` — fixed length,
credential-free, and normalized so a trailing slash or hostname case cannot split
one provider into two scopes.

### 3.2 Cache payload contract version

`ODPT_CACHE_CONTRACT_VERSION` is **separate** from
`ODPT_REQUEST_IDENTITY_VERSION`, because they version different things: the
identity constant changes when the identity *representation* changes, while the
contract constant changes when the *cached normalized payload schema* changes.
Bumping the contract deliberately invalidates old cache entries instead of
serving old-shaped payloads.

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

### 4.2 Effective expiry is capped by provider-declared validity

The class TTL is the **maximum policy lifetime**, not the whole answer. A cache
entry must never outlive trustworthy provider-declared validity:

```
effective expiry = min( now + policy TTL , applicable provider validity end )
```

Rules:

- provider validity may **shorten** the policy TTL, never **extend** it;
- if the earliest applicable validity is **already expired**, the result is **not
  positive-cached** at all;
- for a result with multiple records, the **earliest** applicable validity end
  among them governs;
- a successful `[]` has no records to carry validity, so the class TTL applies;
- `no_data` (404) keeps its independent 1-minute negative TTL;
- provider failures remain non-cacheable regardless of validity;
- malformed/unparseable optional validity does **not** fabricate an expiry — it
  falls back conservatively to the policy TTL and does not fail the record.

Validity is read only from fields that declare it: `validUntil` (from
`dct:valid`, specified as a date-**time**, parsed as an instant; top-level or on
provenance) and a Calendar's `duration` interval end.
**`dc:date` and `dct:issued` are deliberately not used** — they record when data
was generated/published, which is not a statement that it remains valid;
inferring validity from them would invent an expiry the provider never declared.

### 4.2.1 Calendar `odpt:duration` periods are parsed explicitly

API v4.16 documents a Calendar's `odpt:duration` as an ISO8601 period and gives a
**date-only** example:

```
2017-11-13/2017-11-18
```

Generic `Date.parse` must not be used on the endpoint of such a period: for a bare
`YYYY-MM-DD` JavaScript would silently apply **UTC-midnight** semantics that ODPT
never specified. Parsing is therefore explicit, with three cases:

| End value | Handling | Cache ceiling |
| --- | --- | --- |
| Full ISO8601 datetime **with** an explicit offset (`Z`, `+09:00`, `+0900`) | case A | that instant |
| Bare `YYYY-MM-DD` | case B | **start of that date in Asia/Tokyo (UTC+9)** |
| Missing end, timezone-less datetime, three-part or otherwise malformed interval | case C | **no instant invented** → policy TTL fallback |

**Case B is Meguruto's own conservative cache policy, not a provider claim.** It
does *not* assert that ODPT defines the period as end-exclusive, and it does *not*
assert that ODPT defines a timezone for a date-only value. Applying Asia/Tokyo
start-of-day yields an **earlier** (thus safer) ceiling than UTC midnight — nine
hours earlier for the same date, since JST is ahead of UTC. Marking the choice as
policy keeps the difference between what the provider said and what we assumed
inspectable.

A datetime **without** a timezone is rejected rather than guessed: without an
offset the instant is genuinely ambiguous, so parsing it would fabricate validity.
Note the asymmetry with `dct:valid` above — that field is specified as a date-time,
so its parsing is unchanged by this rule.

Malformed periods never produce an instant. They are counted as unparseable and
recorded as a note (`duration_unsupported:<reason>`), and the entry falls back to
the documented policy TTL rather than failing the record or inventing an expiry.

**Dates are validated structurally, not just syntactically.** A `YYYY-MM-DD` shape
check alone is insufficient because JavaScript's `Date` parsing *normalises*
impossible dates: `Date.parse("2017-02-29")` silently yields
`2017-03-01T00:00:00.000Z`, and `2017-11-31` rolls into December. Using that would
produce a cache ceiling for a date the provider never named. The numeric
components are therefore checked first — month in `1..12`, day present in that
Gregorian month with the real leap rule (divisible by 4, except centuries not
divisible by 400) — and only a real date reaches `Date`. Impossible values
(`2017-02-29`, `2017-02-30`, `2017-11-31`, `2017-13-01`, `2017-00-10`,
`1900-02-29`) are `unsupported`, while `2016-02-29` and `2000-02-29` are valid.

The same structural validation is applied to explicit-offset datetimes, so
`2017-02-29T00:00:00+09:00` is rejected rather than accepted as 1 March, and the
time and offset components are range-checked (hour `0..23`, minute `0..59`,
second `0..60`, offset hours `0..14`). Timezone-less datetimes remain unsupported.


### 4.3 Cacheable / non-cacheable result matrix

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

### 4.4 Configuration/readiness is checked before the cache

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

The acquisition call site is **async-compatible**: the protection layer does
`await budget.acquire(identity)`. The current in-memory implementation is
synchronous (awaiting a non-promise is a no-op), but the documented replacement
seam — a Durable Object, D1 or KV-backed counter — will necessarily be
asynchronous, and it must be droppable in without touching callers. Both shapes
are covered by tests.

Defaults: **30 actual outbound provider attempts per 60 s per isolate**,
overridable via `ODPT_PROVIDER_BUDGET_LIMIT` /
`ODPT_PROVIDER_BUDGET_WINDOW_MS`. The default is sized comfortably inside the
observed per-minute figure for one isolate.

The limit counts **attempts, not lookups**: a logical lookup that hits a 503 and
retries spends two tokens, which is why the contract is stated in attempts.

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

### 6.2.1 `budget_unavailable` is a DISTINCT state

If the budget mechanism itself fails — it throws or rejects, so no trustworthy
decision can be obtained — that is **not** ordinary exhaustion and **not** a
provider failure. The boundary returns the canonical envelope with
`outcome: "error"`, `errorCode: "budget_unavailable"`, empty `records`, and an
empty `sourceUrl`.

| State | Meaning | Provider request issued? |
| --- | --- | --- |
| `budget_exhausted` | the check **succeeded**; no capacity remains | no |
| `budget_unavailable` | Meguruto could **not obtain a trustworthy decision** | no |

Both are `error`, both are non-cacheable, neither is ever `no_data`, and neither
is ever a successful `[]`. No provider attempt is counted for the blocked attempt.

The failure never escapes the lookup: `odptLookup`'s "never throws" contract is
preserved, so a broken budget backend degrades into a clearly-labelled error
rather than an unhandled rejection or a fabricated provider answer.

If a provider request **did** already happen (for example the first attempt
returned 503 and the budget decision was then unavailable before the bounded
retry), truthfulness is preserved: `sourceUrl` still carries the attempt that was
really made, the real attempt is counted once internally
(`runtime.providerAttempts: 1`, `runtime.budgetRefusalPhase: "retry"`), and no
second provider fetch is issued. None of that bookkeeping appears on the public
result.

#### Malformed decisions are NOT exhaustion

The decision is interpreted **strictly three-way**, because only an explicit
boolean is a trustworthy answer:

| Budget answer | Treat as |
| --- | --- |
| `{ allowed: true }` | allowed — the attempt proceeds |
| `{ allowed: false }` | `budget_exhausted` — the check succeeded and said "no capacity" |
| anything else | `budget_unavailable` — no trustworthy decision was obtained |

"Anything else" includes `undefined`, `null`, `{}`, `{ remaining: 10 }`,
`{ allowed: "false" }`, `{ allowed: 0 }`, `{ allowed: null }` and `{ allowed: 1 }`.
A malformed answer is **not** proof that the budget is exhausted, so it must never
be reported as `budget_exhausted`. Malformed decisions are counted separately
(`budgetMalformed`) from explicit refusals (`budgetRejected`) and from backend
failures (`budgetUnavailable`).

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
| Budget                  | `budget_exhausted`, `budget_unavailable`                                                  |
| Provider / contract     | `provider_authentication_error`, `provider_authorization_error`, `provider_invalid_request`, `provider_internal_error`, `provider_unavailable`, `provider_method_not_allowed`, `provider_response_too_large`, `malformed_provider_json`, `invalid_provider_response`, `provider_timeout`, `network_error`, `provider_not_configured` |

`budget_exhausted` and `budget_unavailable` are added to `OdptErrorCode` in
`OdptProvider.ts` for exactly this reason. Cached and fresh results carry the
**same** payload; only the internal `runtime` metadata differs.

---

## 8. Observability

**The public response body is the canonical ODPT result and nothing else.**

Runtime metadata is deliberately **not** exposed on `/api/odpt`: it is internal
observability, and including it would silently widen the public endpoint contract
that every caller depends on. The endpoint returns
`Response.json(result, { status: 200 })` exactly as before this PR.

The same metadata remains available internally — to the protection unit tests and
to injected harnesses — via the credential-free `runtime` object returned by
`protection.run(...)`:

```json
{ "cacheClass": "reference", "cacheHit": false, "dedupHit": false,
  "providerRequest": true, "providerAttempts": 1,
  "budgetTokensUsed": 1, "budgetExhausted": false,
  "budgetUnavailable": false, "budgetRefusalPhase": null }
```

and via `__getOdptProtectionState()` (test-only) for endpoint tests.

`providerAttempts` and `budgetTokensUsed` count **actual outbound attempts** and
the tokens those attempts cost, so a 503 retry shows `providerAttempts: 2`. It
never contains the credential, the consumer key, the caller IP, or the raw
provider payload. Safe counters (`cacheHits`, `cacheMisses`, `cacheWrites`,
`cacheSkips`, `cacheErrors`, `dedupHits`, `providerRequests`, `budgetAllowed`,
`budgetRejected`, `budgetUnavailable`, `budgetMalformed`) are exposed for tests
rather than written to production logs —
no permanent console logging is added. Tests assert the console stays silent.

---

## 9. Non-goals (unchanged behaviour)

No Journey derivation, no timetable-to-duration conversion, no route selection,
no ranking/feasibility/budget change, no UI or planner change, no
`OriginAwareTransportService` precedence change, no KAI-348 fallback change. This
PR changes **how ODPT requests are executed**, not travel behaviour.
