# KAI-290 PR 1 — ODPT runtime provider budget, caching and deduplication (design)

Status: **design only**. PR 1 ships this document and no runtime code.
Scope: the strategy PR 2 implements for ODPT evidence acquired through the
existing server boundary `POST /api/odpt`.

## Context and motivation

The KAI-289 boundary is already in production: `functions/api/odpt.js` +
`functions/api/odpt-core.js` hold `ODPT_API_KEY` server-side and expose a finite
allow-list of operations (`nearby_stations`, `station`, `railway`,
`railway_fare`, `datapoint`), each with a validated input schema. The browser
only ever calls `/api/odpt` through
`src/shared/services/transport/OdptApiProvider.ts`, which today performs **no
caching** (stated in that module) and has no timetable method.

`functions/_request-guards.js` already rate-limits `/api/odpt` at ~60 requests /
10 min / client IP. That guard is **per-client-IP and per-isolate**: it protects
Meguruto's own endpoint from one abusive client, but it does not protect the
single shared ODPT credential from the aggregate of many legitimate users, each
well under their own client limit. That gap is the reason this document exists.

The design is a decorator over the existing provider, not a change to it:
`OdptApiProvider` stays the raw, uncached transport; a new budgeted provider
implements the same `OdptProvider` interface and adds cache, dedup and budget.
That keeps the existing invariant (`OdptApiProvider` does no caching) testable
and unchanged. `odpt:Train` and `odpt:TrainInformation` are realtime: out of
scope here and in PR 2, never modelled as static.

## Provider quota is observational, never contractual

Live responses on 2026-09-10 advertised `X-RateLimit-Limit-minute: 60`,
`-hour: 3600`, `-day: 24000`. Those figures are **observational only**, were
observed on one credential on one occasion, and are **not documented in ODPT API
Specification v4.16**. No provider quota, window or ratio may be hard-coded as a
product limit, used to size a TTL, or used to compute the per-journey budget
below. The same position is already recorded in `odpt-core.js` (§ status-table
comment, KAI-289). Every number in this document is a Meguruto self-imposed
bound derived from the operation graph and from our own protective intent.

## Decision summary

| Resource                     | Cacheable | Freshness clock                     | Default TTL                |
| ---------------------------- | --------- | ----------------------------------- | -------------------------- |
| `odpt:Station`               | yes       | `dc:date`, `dct:valid`              | 24 h                       |
| `odpt:Operator`              | yes       | `dc:date`                           | 24 h                       |
| `odpt:Railway`               | yes       | `dct:issued`, `dct:valid`           | 24 h                       |
| `odpt:RailwayFare`           | yes       | `dct:issued`, `dct:valid`           | 12 h                       |
| `odpt:Calendar`              | yes       | `odpt:day`, `odpt:duration`         | min(24 h, end of duration) |
| `odpt:StationTimetable`      | yes       | `dct:issued`, `dct:valid`           | 6 h                        |
| `odpt:TrainTimetable`        | yes       | `dct:issued`, `dct:valid`           | 6 h                        |
| `odpt:Train`, `TrainInfo`    | **no**    | realtime — out of scope             | never cached               |

Per-journey cap: **12 provider calls** (8 base + 4 per transfer, max 1 transfer).
Budget exhaustion fails closed into the existing conservative estimator, never
into fabricated data, and is a third outcome distinct from a provider error.

## 1. Resource classification: static, revision-scoped, or realtime

- **Static reference data** — `odpt:Station`, `odpt:Operator`, `odpt:Railway`,
  `odpt:RailwayFare`. Effectively immutable between schedule/fare revisions.
  Their only in-band clocks are `dc:date` (generation timestamp), `dct:issued`
  (revision date) and `dct:valid` (guarantee period). There is no short-horizon
  change signal, so a wall-clock minute TTL is the wrong mechanism; the mechanism
  is *revision-aware* caching with a long ceiling.
- **Revision-scoped schedule data** — `odpt:StationTimetable`,
  `odpt:TrainTimetable`. Static *for a given `dct:issued` schedule revision* and
  guaranteed only through `dct:valid`. A revision can be superseded at short
  notice (seasonal revisions, corrections), so these need a materially shorter
  ceiling than reference data.
- **Date-scoped static data** — `odpt:Calendar`. Static, but bound to explicit
  `odpt:day` applicable dates and an `odpt:duration` validity period, with
  `dc:date` as generation time. Freshness is *calendar-bounded*, not
  clock-bounded.
- **Realtime — not cacheable here** — `odpt:Train`, `odpt:TrainInformation`. Out
  of scope for this ticket and PR 2: no TTL, no negative cache, no fallback
  design in this document.

Fare coverage is *not* proven operator-wide (TokyoMetro is proven; operator-wide
is not). "Static" here means *the value does not change quickly*, not *the value
exists*. Coverage stays `"unknown"` on every record, exactly as
`recordProvenance` emits today.

## 2. Cache keys and identity resolution

Identity rule: the resolver treats **`owl:sameAs` as the stable provider
identity** (it is what keeps same-named stations on different operators/railways
distinct, and it is what `normalizeStation` / `normalizeRailway` /
`normalizeRailwayFare` use as `record.id`). **`ucode` (`@id`) is retained as the
alternate**, not as the primary key. A station identity can be reached by
several evidence paths — `sameAs`, `ucode`, `operator + stationCode`, or
`operator + title` — so the cache must key on the *resolved canonical identity*,
never on the query that happened to reach it.

Keys are a versioned, pipe-delimited string namespace (`odpt:v1:`); the version
prefix exists so the key contract can be bumped deliberately, invalidating old
entries on upgrade. Parts are trimmed; `operator`, `lineCode`, `stationCode` are
lowercased; `owl:sameAs` is **not** case-folded (it is a case-sensitive
identity). Fare pairs are **not** sorted: `odpt:fromStation` → `odpt:toStation`
is directional and a reverse fare is a different fact.

| Purpose                  | Key                                                                           |
| ------------------------ | ----------------------------------------------------------------------------- |
| Station by sameAs        | `odpt:v1:station:sameAs:<owl:sameAs>`                                         |
| Station by ucode         | `odpt:v1:station:ucode:<ucode>` → alias of the sameAs entry                   |
| Station by operator+code | `odpt:v1:station:code:<operator>|<stationCode>`                               |
| Station by operator+title| `odpt:v1:station:title:<operator>|<dc:title>`                                 |
| Nearby station candidates| `odpt:v1:station:nearby:<lat>|<lon>|<radius>` (exact values as sent)          |
| Railway by sameAs        | `odpt:v1:railway:sameAs:<owl:sameAs>`                                         |
| Railway by code          | `odpt:v1:railway:code:<operator>|<lineCode>`                                  |
| Fare by station pair     | `odpt:v1:fare:<from.owl:sameAs>|<to.owl:sameAs>|<operator or ->`              |
| Station timetable        | `odpt:v1:stt:<station.owl:sameAs>|<railway.owl:sameAs>|<railDirection or ->`  |
| Train timetable          | `odpt:v1:ttt:<railway.owl:sameAs>|<railDirection or ->`                       |
| Calendar by identity     | `odpt:v1:calendar:<owl:sameAs or ucode>`                                      |
| Exact datapoint          | `odpt:v1:datapoint:<dataUri>`                                                 |

Two decisions that keep these keys honest:

- **`nearby_stations` is keyed on the exact requested `lat`/`lon`/`radius`.**
  Coordinate quantisation is deliberately *not* applied: a rounded key could
  serve a candidate set computed for a different query point, and ODPT radius
  membership is boundary-sensitive. Hits come from a stable origin point, not
  from rounding. A `nearby_stations` response is a candidate set with
  `coverage: "unknown"` — and because JR-East station records carry no
  coordinates (0/134 in production), a nearby result set must never be read as a
  complete station universe for a corridor.
- **Schedule revision is entry metadata, not a key part.** `dct:issued` is
  unknowable before the fetch, so it cannot appear in the lookup key; it is
  stored on the entry to drive revision-aware invalidation (§3). A ucode-only
  resource (no `owl:sameAs`) keys on its ucode, exactly as `normalizeDatapoint`
  allows.

Aliasing: one physical fetch writes the primary key plus any alias keys the
record supports (a `station` hit by `sameAs` also registers `station:ucode:` and,
when `operator`/`stationCode`/`title` are present, the code/title aliases). That
is the dedup lever in §5: the same station reached by another path costs nothing.

## 3. TTL and freshness basis per resource

TTL is a *bounded ceiling*, not the primary freshness mechanism. Each entry
records `issuedAt` (`dct:issued`), `generatedAt` (`dc:date`) and `validUntil`
(`dct:valid`) from the normalized record; an entry is stale when either its
ceiling elapses **or** the observed revision metadata shows it is superseded.
The clock is never read from the observational provider headers.

- `odpt:Station` — **24 h**, keyed on identity. Basis: `dc:date` generation and
  `dct:valid`; a station record changes only with a schedule/operator revision.
- `odpt:Operator` — **24 h**. Basis: `dc:date`.
- `odpt:Railway` — **24 h**. Basis: `dct:issued` (revision), `dct:valid`.
- `odpt:RailwayFare` — **12 h**. Basis: `dct:issued` / `dct:valid`. Shorter than
  the rest of the static set because fares are the most volatile of the static
  resources and fare coverage is not proven operator-wide.
- `odpt:Calendar` — **min(24 h, time until the end of `odpt:duration`)**. Basis:
  `odpt:duration` (validity window) and `odpt:day` (explicit applicable dates);
  `dc:date` is generation time. A calendar entry whose `odpt:duration` has ended
  is stale regardless of the clock, and a date outside the `odpt:day` set must
  never be answered from that entry.
- `odpt:StationTimetable` / `odpt:TrainTimetable` — **6 h**. Basis: `dct:issued`
  (schedule revision) and `dct:valid` (data guarantee). The ceiling is
  deliberately short: a revision or correction can be published without any
  signal reaching us, and `dct:issued` is a revision *date*, not a deadline.
- `odpt:Train` / `odpt:TrainInformation` — **never cached**.

Outcome handling, mirroring `CarRouteApiProvider`'s philosophy:

- `outcome: "records"` with records → cached for the resource TTL.
- `outcome: "records"` and empty, and `outcome: "no_data"` (HTTP 404) → a real
  provider answer, cached only as a **short negative** (`NEGATIVE_TTL = 5 min`)
  so a burst does not re-ask, but a newly published fact is not pinned. Neither
  is ever read as "no transport exists".
- `outcome: "error"` (any provider code, `network_error`, `rate_limited`) →
  **never cached**, so an outage recovers automatically on the next evaluation,
  exactly as the existing car-route cache behaves.

## 4. Per-journey ODPT call budget

The budget counts **physical provider calls actually issued** — i.e. cache
misses that reach `/api/odpt`. TTL hits, alias hits and in-flight joins consume
zero. One coalesced group costs one call no matter how many joiners (§5). The
budget is scoped **per journey evaluation**, not per user or per session; the
cache is shared across evaluations within an isolate.

Worst case, one transfer:

| Step                          | Operation                          | Calls |
| ----------------------------- | ---------------------------------- | ----- |
| Origin station identity       | `station` (`sameAs` / `ucode`)     | 1     |
| Destination station identity  | `station`                          | 1     |
| Origin line identity          | `railway`                          | 1     |
| Destination line identity     | `railway`                          | 1     |
| Fare                          | `railway_fare`                     | 1     |
| Applicable calendar           | `datapoint` (`odpt:Calendar`)      | 1     |
| Leg A station timetable       | `station_timetable`                | 1     |
| Leg B station timetable       | `station_timetable`                | 1     |
| **Base, no transfer**         |                                    | **8** |
| Transfer station identity     | `station`                          | 1     |
| Transfer line identity        | `railway`                          | 1     |
| Transfer station timetable    | `station_timetable`                | 1     |
| Re-split leg timetable        | `station_timetable`                | 1     |
| **+ one transfer**            |                                    | **+4**|
| **Cap (`ODPT_JOURNEY_EVALUATION_MAX_CALLS`)** |            | **12**|

Constants PR 2 defines: `ODPT_JOURNEY_EVALUATION_BASE_CALLS = 8`,
`ODPT_TRANSFER_CALL_ALLOWANCE = 4`, `ODPT_MAX_TRANSFERS_EVALUATED = 1`,
`ODPT_JOURNEY_EVALUATION_MAX_CALLS = 12`.

Reasoning: the figure is derived from the operation graph (two endpoint
identities, two lines, one fare, one calendar, two leg timetables), plus the
marginal cost of one transfer (identity + line + timetable at the node + one
re-split timetable). The base is 8 rather than the naive 7 because the calendar
resolution is budgeted as a first-class call. Twelve is the ceiling one
evaluation may consume; because the cache amortises it, N users on the same
corridor cost ~12 calls total, not 12·N — so aggregate credential pressure is
driven by *distinct cache misses* (new station pairs), not by request volume.
Raising the transfer count later is a one-constant change. **This budget is not
derived from, and must not be argued from, the observational provider figures.**

## 5. Duplicate-call elimination within one evaluation

An evaluation receives one shared budget/ledger object; the cache lives behind
the provider interface so every operation in that evaluation draws from the same
entries and the same budget.

- **Canonicalise before fetching.** Every station/railway request is resolved to
  its canonical identity *before* touching the cache, so `station(sameAs: S)`,
  `station(ucode: U)` and `station(operator: O, stationCode: C)` that denote the
  same station all land on the same key. The alias map written on first fetch
  makes the later paths free.
- **Cross-operation reuse.** The origin identity fetched for
  `nearby_stations` is the same entry consumed by `station`, `station_timetable`
  and `railway_fare` later in the same evaluation. No operation re-fetches
  another operation's subject.
- **Single-flight in-flight coalescing.** A `Map<string, Promise<…>>` of pending
  fetches is keyed by the *same* cache key. A second request for a key with a
  fetch in flight awaits that promise instead of issuing a call. On settle the
  pending entry is removed; on success the result is written to the TTL cache.
  On failure the shared failure is returned to all awaiting callers and **not**
  written to the TTL cache, so the next evaluation retries.
- **Deterministic accounting.** A coalesced group increments the issued-call
  counter once and `odpt_dedup_saved_calls` once per joiner. Budget consumption
  is charged once per group, so concurrency can never multiply budget cost.
- **Never dedup across a different query.** Two requests with different resolved
  keys (different line, different direction, different radius, reversed fare
  pair) are never merged, even if they look similar.

## 6. Budget-exhausted fallback (fail closed)

The budget layer's public surface is intentionally **not** an `OdptResult`:

```ts
type OdptBudgetedOutcome<T> =
  | { status: "ok"; result: OdptResult<T> }   // may itself be an error/no_data
  | { status: "skipped"; reason: "budget_exhausted" };
```

`budget_exhausted` is a third state, not provider error and not "no evidence".
That distinction is structural, not conventional:

- it can never be mistaken for a provider code (`provider_*`, `network_error`,
  `rate_limited`) because it does not travel in the `OdptResult` union;
- it can never be mistaken for a real "no match" (`no_data` / empty `records`),
  which means the provider answered;
- nothing is fabricated. No station identity, timetable time or fare is
  synthesised, and no corridor is marked absent.

When an evaluation receives `status: "skipped"`, it **fails closed into the
existing conservative estimation path**: `getSafeGroundEstimate` →
`GroundFallbackModel` (the same bounded rough estimator already used by
`carRouteOutageFallback.ts`). The estimate is display-only, carries
`evidence: "estimated"`, `decisionSemantics: "conservative"`, and
`fallbackReason: "odpt_budget_exhausted"`. It populates **no** canonical
distance, fare or timetable fact and is never a provider-backed result.

Fallback reasons stay distinct so the cause is always legible:

| Situation                                    | Reason                      |
| -------------------------------------------- | --------------------------- |
| No provider call could be afforded           | `odpt_budget_exhausted`     |
| A call was afforded and the provider failed  | `odpt_provider_<code>`      |
| Provider answered, but no matching evidence  | `odpt_no_evidence`          |

Provider failures are treated the same way `carRouteOutageFallback` already
treats them: a *temporary* class (`network_error`, `provider_timeout`,
`provider_unavailable`, `^provider_http_5\d\d$`, `rate_limited`,
`provider_not_configured`) may degrade to the conservative estimate; terminal
classes (`billing_required`, `provider_authentication_error`,
`provider_authorization_error`, `invalid_*`, `malformed_*`) block the fallback
and surface honestly. Recovery is automatic because error results are never
cached.

## 7. Instrumentation counters

Module-scope counters in house style, with `snapshotOdptBudgetCounters()` and
`resetOdptBudgetCounters()` (mirroring `snapshotCarRouteFallbackCounters` /
`snapshotCarRouteIntentCounters`). Counter keys are `snake_case`.

| Counter name                    | Meaning                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `odpt_calls_issued`             | Physical provider calls issued (cache misses that reached API) |
| `odpt_cache_hits`               | TTL-cache hits                                                 |
| `odpt_cache_misses`             | TTL-cache misses (lookups that did not hit)                    |
| `odpt_dedup_saved_calls`        | Lookups served by alias or in-flight coalescing                |
| `odpt_negative_cache_hits`      | Hits on a cached empty / `no_data` answer                      |
| `odpt_budget_exhausted`         | Evaluations that hit the per-journey cap                       |
| `odpt_budget_remaining`         | Gauge: remaining calls in the current evaluation               |
| `odpt_fallback_total`           | Fallbacks entered, any reason                                  |
| `odpt_fallback_budget_exhausted`| Fallbacks whose reason was budget exhaustion                   |
| `odpt_fallback_provider_error`  | Fallbacks whose reason was a provider failure                  |
| `odpt_fallback_no_evidence`     | Fallbacks whose reason was a genuine no-match                  |
| `odpt_cache_entries`            | Gauge: live entries in the bounded cache                       |
| `odpt_cache_evictions`          | Entries dropped by the size bound                              |

`odpt_calls_issued` vs `odpt_cache_misses` is the diagnostic that proves dedup
is working: misses minus coalesced saves should equal issued calls.

## 8. PR 2 scope vs PR 1 (design-only)

**PR 1 (this document) deliberately does not:**

- build a distributed cache — no KV, D1, Durable Object, Cache API or any
  other shared binding;
- integrate with the recommendation or destination-detail runtime — no
  journey-evaluation caller is wired, and no existing runtime path is changed;
- add realtime ODPT resources (`odpt:Train`, `odpt:TrainInformation`);
- encode any provider quota as a product limit;
- change `functions/_request-guards.js`, `/api/odpt` or `odpt-core.js`.

**PR 2 (implementation) builds, directly from this document:**

1. Server: add `station_timetable` and `train_timetable` to `OPERATION_SCHEMAS`
   with validated filters, plus normalizers for `odpt:StationTimetable` /
   `odpt:TrainTimetable` emitting `dct:issued` / `dct:valid` through the existing
   `recordProvenance` fields. Calendar/Operator use the existing `datapoint`
   operation unless a filtered search is proven necessary.
2. Client cache module (e.g. `OdptEvidenceCache.ts`): TTL cache, `odpt:v1:` key
   builder, alias map and negative caching per §2–§3, modelled on
   `CarRouteApiProvider` (TTL, max-entry bound, expiry eviction, never cache
   errors).
3. Single-flight coalescing per §5.
4. Per-evaluation budget (`8` / `+4` / max `1` transfer / cap `12`) threaded
   through the evaluation entry point per §4.
5. The `OdptBudgetedOutcome` sentinel and `odpt_budget_exhausted` fallback wiring
   into `SafeGroundEstimateService` per §6.
6. Counters in §7 with `snapshot` / `reset` helpers.
7. Tests: injected `fetchImpl`; fake timers for TTL expiry (positive, negative,
   calendar-duration and `dct:valid`); concurrency proving N simultaneous
   same-key requests issue one call; alias reuse of a sameAs entry via ucode;
   error-not-cached recovery; and budget exhaustion producing reason
   `odpt_budget_exhausted`, not a provider code.
