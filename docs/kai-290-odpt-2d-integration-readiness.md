# KAI-290 — 2D close-out: integration-readiness audit and blocker taxonomy

**Outcome: KAI-290 closes with an evidence-only audit. No user-facing integration
was shipped, because the eligible cohort is exactly zero.**

Base: `origin/main` @ `345690dea7fa88025d7760952198f226765fc617` (PR 2C).

This document records *why*, deterministically, so the decision is auditable
rather than a matter of interpretation. It is reproduced by
`scripts/audit/kai-290-odpt-eligibility.mjs`; no number here is hand-asserted.

---

## 1. Headline counts

From the committed artifact `qa/kai-290/odpt-eligibility.json`:

| Metric | Value |
| --- | --- |
| Total catalogue records | **1130** |
| Exact ODPT destination station identities | **0** |
| Deterministically resolvable destination identities | **0** |
| Ambiguous destination identities | **0** |
| Unavailable destination identities | **1130** |
| Current departure-time input | **absent** |
| Current user-facing eligible cohort | **0** |

Method: offline scan of committed catalogue artifacts. **0 network calls, 0
provider calls, 0 credentials read.**

---

## 2. Phase-zero input classification

The #390 primitive proves `exact ODPT station -> exact ODPT station` and needs all
four of these. Each is classified per the audit contract, with the evidence below.

| # | Input | Classification | Evidence |
| --- | --- | --- | --- |
| A | Origin exact ODPT station identity | **`unavailable`** | Origin data is `{name, lat, lng}` only |
| B | Destination/arrival exact ODPT station identity | **`unavailable`** | **0 of 1130** records carry any `odpt.*` value |
| C | Service date | **`deterministically_resolvable`** (trip-context flows only) | `navState.travelDate` / `tripContext.travelDate` |
| D | Bounded departure window | **`unavailable`** | No time-of-day input exists anywhere |

A and B are both required and neither is available, so no destination can be
eligible today. Detail follows.

### 2.1 Destination arrival-station identity — `unavailable` (0 / 1130)

- **No record contains any `odpt.<Type>` value.**
- **No arrival-station field exists in the schema** — no `arrivalStationId`,
  `odptStationId`, `operator`, `railway` or `stationCode`.
- `nearestStation` (41 records) is **free text** (`"Sendai Station (then express
  bus)"`), i.e. exactly the forbidden nearest-named-station evidence.
- `relationships.nearestStationId` is a **destination** id (resolved via
  `catsToUse.find(d => d.id === ...)`), and appears on **0** records anyway.
- The two `kind: "station"` destinations (`kishi-station-tama-cat`,
  `doai-station`) carry no operator/railway/code/identity.
- `localTransport` blocks (1130): 978 `unavailable`, 123 `not_applicable`, 16
  `verified_walking`, 13 `verified_required_access` — **0** contain an ODPT id.

### 2.2 Origin station identity — `unavailable`

`src/shared/components/StationInput.tsx` reads `/data/stations-by-prefecture.json`,
whose shape was verified across the sample: **`{name, lat, lng}` and nothing else**
(`ALL keys seen: ['lat', 'lng', 'name']`). Sample:
`{"name": "Abashiri Station (網走駅)", "lat": 44.019873, "lng": 144.254156}`. No ODPT
identity, operator, railway or station code.

**Product semantics are favourable** — the origin *is* a departure station:

- EN: `"from": "From"`, `"selectBaseStation": "Select base station:"`
- JA: `"from": "出発地"`, `"selectBaseStation": "出発駅を選択："` (出発駅 = departure station)

So the item-3 condition *"the product semantics explicitly say the trip begins at
that station"* **is** met for an explicitly selected station. That is not the
blocker.

**Still `unavailable`, not `deterministically_resolvable`:** turning a name or
coordinate into an exact ODPT identity needs the `geographic` path of
`odptStationIdentity`, which requires an ODPT `/places/odpt:Station?lat&lon&radius`
call — a new provider call and an unmeasured identity path. The
`operator_railway_identity` path cannot apply (no operator/railway evidence on the
origin side). Unmeasured ⇒ not claimed as resolvable. Note also that the origin may
be **current GPS location**, which item 3 rules out as a station origin entirely.

### 2.3 Departure-time input — `absent`

No time-of-day input exists anywhere. The only `type="time"` reference in the repo
is a **test asserting the date picker has none**. `TripStop.departureTime` is
declared but never set or read by production code. `DayPlanWidget`'s "custom time"
is available **duration**, not a departure time.

### 2.4 Service date — `deterministically_resolvable` (partial)

`DestinationDetails.activeTravelDate` (from `navState.travelDate` /
`tripContext.travelDate`) supplies a date in planner-originated flows, but not on
direct navigation. A date alone is insufficient regardless, since the #390 window
requires a time.

---

## 3. Blocker taxonomy

Machine-readable, exhaustive, and fail-closed. A record is eligible only when
**every** input is satisfied; the first unmet input names the blocker.

| Reason code | Meaning | Records on current main |
| --- | --- | --- |
| `destination_station_identity_missing` | No exact ODPT arrival-station anchor. | 1130 |
| `destination_station_identity_ambiguous` | Several competing anchors, no rule to choose. | 0 |
| `origin_station_identity_missing` | Anchor present, but the origin side has no exact ODPT identity. | 0 |
| `departure_time_input_absent` | No trustworthy departure time to form a bounded window. | 0 |
| `service_date_context_absent` | No real service date in context. | 0 |

The `destination_station_identity_missing` count is 1130 because every record fails
at the first gate; the later reasons are listed and tested so they attribute
correctly once KAI-291A unlocks the earlier gate.

### Classification precedence (fail-closed)

```
exact                    exactly one identity in a NAMED anchor field
deterministically_resolvable   explicit canonical mapping, no exact anchor
ambiguous                more than one competing anchor
unavailable              everything else  <-- the honest default
```

**Identity evidence rules.** An identity string that merely appears *somewhere* in
a record (a note, a nested mapping) is evidence a mapping **exists** — never
evidence of which station the destination arrives at. It is reported in
`identitiesElsewhere` for diagnosis and **never** promotes a record. This was a
real bug caught by the tooling tests: a blind recursive scan let a mapping
masquerade as an `exact` anchor.

**Forbidden evidence, never accepted by this audit:** fuzzy/partial name matching,
nearest-station distance guesses, name-only identity, municipality centroid,
"main station" convention, destination `kind: "station"` without an explicit
identity, and coordinate proximity.

---

## 4. What was deliberately NOT built

Item 12 and item 27 reserve these decisions; and with a zero cohort each would be
unverifiable surface area:

- No async enrichment seam, no `useOdptJourneyEnrichment` hook, no precedence
  helper — nothing to exercise.
- No departure-time control invented to make the feature visible (item 12).
- No catalogue station mapping, no hand-authored identities (item 27).
- No zero-eligible production path wired.
- No UI, no copy, no screenshots — there is no eligible screen to photograph.
- No production ODPT smoke (item 26 scopes it to after implementation).

**Zero production/runtime behaviour changes.** No `src/` file is modified by this
PR; it adds one audit script, its tests, and documentation/artifacts.

---

## 5. Re-scope: KAI-291A comes first

The blocker is a data-identity gap, not a code gap. It belongs to KAI-291's static
coverage work.

**KAI-291A — deterministic destination -> ODPT arrival-station identity coverage
(TokyoMetro + Toei pilot).** Establish a trustworthy destination station-anchor
registry **before** broader routing/network-graph work, because every later stage
depends on destination anchors being exact rather than inferred.

### Proposed acceptance criteria

1. **Registry exists and is typed.** A `destinationId -> odpt.Station` anchor
   registry with, per entry: the exact ODPT station identity (`owl:sameAs`), the
   operator and railway identities, the evidence path used, a source URL, and a
   `checkedAt` date. No anchor without provenance.
2. **Explicit identity evidence only.** Each anchor is established by exactly one
   of: an explicit ODPT station id; an explicit canonical mapping; or a linked
   station record that itself carries an exact identity. Fuzzy matching,
   nearest-station distance, name-only identity, municipality centroid and "main
   station" convention are **forbidden** and must not appear in the registry
   builder.
3. **Deterministic and offline.** The builder is a pure function of committed
   inputs; the registry is regenerated reproducibly (stable ordering, stable JSON)
   and the build makes **no** network calls and reads no credential.
4. **Ambiguity is preserved, never resolved by guess.** A destination with several
   plausible arrival stations stays `ambiguous` and is excluded from the eligible
   set until a deterministic rule or human-reviewed evidence settles it.
5. **Pilot scope only.** TokyoMetro and Toei operators only; JR-East is out of
   scope (measured: no timetable resources). No broader operator expansion in
   KAI-291A.
6. **Coverage is measured and reported honestly.** A committed artifact reports,
   for the whole catalogue: total records, exact anchors, ambiguous, unavailable,
   and per-operator counts. The `scripts/audit/kai-290-odpt-eligibility.mjs` scan
   **must be re-run and its counts reproduced** (it is already wired to pick up
   anchors once an anchor field or mapping exists), so progress is a diff, not a
   claim.
7. **No silent eligibility inflation.** Adding anchors must not flip a record to
   eligible if the origin identity or departure window is still missing; the
   eligibility gate stays fail-closed and its tests keep passing.
8. **Sanity floor, stated as a target not a guarantee.** A minimum viable anchor
   count for the pilot (e.g. >= 50 TokyoMetro + Toei-served destinations with
   exact arrival-station identities) so that 2D can be re-attempted against a
   non-empty cohort. If unreachable with trustworthy evidence, report the real
   number rather than lowering the evidence bar.

### Explicitly out of scope for KAI-291A

Origin-side ODPT identity resolution (`/places`), transfer routing, walking/feeder
legs, fare modelling, and any change to recommendation/ranking/feasibility/budget.
A departure-time input remains a product decision to be scoped separately before
any user-facing 2D re-attempt.
