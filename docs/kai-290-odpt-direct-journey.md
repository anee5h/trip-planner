# KAI-290 PR 2C — ODPT direct timetable Journey primitive

Status: **capability only**. Nothing in production calls this. No existing
estimate, precedence, ranking, feasibility, budget or UI behaviour changes.

This document describes the contract of the first timetable-backed Journey
primitive so the later benchmark/integration decision rests on a stated contract
rather than on reading the code.

---

## 1. Module layout

| File | Role |
| --- | --- |
| `src/shared/services/transport/odptDirectJourney.ts` | **Pure** derivation: one exact `TrainTimetable` record (or an explicitly linked split chain) → verified `Journey`. No I/O, no clock reads. |
| `src/shared/services/transport/OdptDirectJourneyService.ts` | I/O resolver: bounded discovery + candidate inspection, per-journey budget, discriminated result. |

The split is deliberate: the duration proof is testable with zero network, and
the fan-out policy is testable with zero provider.

Reused, never re-implemented: `odptChronology` (service-day chronology, the
23→0 rollover contract, split-pair validation), `odptStationIdentity` (station
resolution), and the canonical `Journey` contract.

## 2. Pilot operator scope

```
odpt.Operator:TokyoMetro
odpt.Operator:Toei
```

Declared once in `ODPT_TIMETABLE_PILOT_OPERATORS`. JR-East is **outside** this
pilot and fails closed with `operator_outside_timetable_pilot` — the primitive
never falls through to another operator's data, and an unsupported operator is
never evidence that its data is absent. Basis: the bounded authenticated
production audit (see `kai-290-odpt-timetable-pilot-constraints.md`).

Inputs must be **already-resolved exact ODPT station records**. The service
accepts no Destination, no raw coordinates, no bare station name, no provider
URL, and no fuzzy identity; callers without exact identities get `inconclusive`.

## 3. Query shapes

Discovery — exactly one lookup, scoped to the exact origin and service date:

```
provider.stationTimetable({ station: origin.sameAs, date: serviceDate })
```

Duration — one lookup per candidate, always narrowed by exact train identity:

```
provider.trainTimetable({ train: exactTrainIdentity, calendar: <discovered> })
```

The `calendar` filter is added only when the discovering `StationTimetable`
declared one. There is **no** operator-wide `StationTimetable` query, **no**
whole-railway `TrainTimetable` query, and no arbitrary URL / query escape hatch.
`StationTimetable` ordering is never read as a route: it lists many trains at one
station, so it is discovery evidence only.

## 4. Departure window

A bounded local window is **required**:

- `serviceDate` must be a real Gregorian `YYYY-MM-DD` (impossible dates such as
  `2017-02-29` are rejected — `Date.parse` normalises them, so month, day
  existence and leap years are checked numerically).
- `departureWindow.start` / `.end` must be usable `HH:MM`, with `start <= end`.
- Maximum width **3 hours**.
- **No cross-midnight search window** (`23:00 → 01:00`) in this PR: how it maps
  onto service dates is unspecified, so it fails closed rather than being
  guessed. A *TrainTimetable* may still cross midnight — that is the separate,
  provider-proven `23:xx → 00:xx` rollover rule in `odptChronology`.

Objects are filtered locally to the window; duplicates are deduplicated by train
identity; candidates are ordered deterministically by scheduled departure, then
by stable identity. **This is an inspection order, not a ranking** — there is no
"fastest", "cheapest" or "preferred" selection anywhere in this PR.

## 5. Per-journey fan-out budget

**8 logical ODPT boundary lookups per resolution**: 1 `StationTimetable`
discovery + at most 7 exact-train `TrainTimetable` lookups. The eighth is
allowed, a ninth is never issued.

This is separate from PR 2B's server-side provider budget:

| Budget | Protects | Counts |
| --- | --- | --- |
| PR 2B (`/api/odpt`) | shared provider traffic | actual outbound **attempts**, isolate-local |
| PR 2C (this primitive) | one resolution fanning out over unbounded trains | **logical** provider method calls |

A server-side 503 retry is handled and accounted by PR 2B, so it consumes no
second slot here, and this client never retries manually.

## 6. Duration semantics

The verified duration is **on-train scheduled time**: the origin's scheduled
**departure** → the destination's scheduled **arrival**, both read from the same
proven stop sequence.

It does **not** include, and must never be labelled as: access to/from either
station, waiting before departure, any transfer, walking or feeder leg,
disruption delay, crowding, or ticket purchase. It is **not** a door-to-door
travel time.

The origin requires `departureStation == origin.sameAs` **and** a usable
`departureTime`; the destination requires `arrivalStation == destination.sameAs`
**and** a usable `arrivalTime`. A destination departure is never substituted for
a missing arrival (that would silently change what the number means).

A direct Journey is proven only when the exact origin occurs in the ordered stop
sequence, the exact destination occurs **later**, both events carry usable times,
chronology is valid, and the duration is positive. Exact ODPT identities are
compared — never names, geographic proximity, or similar-looking ids.

## 7. Ambiguity fails closed

If a record can form more than one plausible ordered origin/destination pair —
a looping or duplicated visit — the result is
`inconclusive: ambiguous_stop_pair`. The primitive never chooses the first,
shortest, closest or fastest pair. It prefers **no verified Journey** to a
guessed one.

## 8. Multiple records and split services

An exact train identity may legitimately return **more than one**
`TrainTimetable` record. Two very different shapes produce that, and the order of
handling is load-bearing.

### 8.1 Records are evaluated INDEPENDENTLY first

**Measured.** `odpt.Train:Toei.Mita.535T` returns TWO records, and they are
**calendar variants of the same service** — `…535T.SaturdayHoliday` and
`…535T.Weekday` — each with 25 ordered stops, the same first/last stations and
the same `05:00 → 05:46` span, and **neither declaring any
`odpt:nextTrainTimetable` / `odpt:previousTrainTimetable` link**.

Either record alone already proves the origin → destination pair, so a single
record is sufficient and the group must NOT be treated as a mandatory chain.
Reaching for a chain join first would report every such service as inconclusive.

Sibling records that prove the same pair with the **same** scheduled times agree,
so the duration is proven whichever applies. Records that prove it with
**different** times cannot be reconciled — the builder is given no calendar — and
fail closed as `inconclusive: ambiguous_split_chain`.

### 8.2 An explicitly linked chain, only as a fallback

Only if no single record proves the pair is a join attempted, and only when:

1. the provider's explicit `odpt:nextTrainTimetable` /
   `odpt:previousTrainTimetable` link connects them, **and**
2. the existing `validateSplitTimetablePair()` reports compatibility.

Matching train numbers, train names, operators, railways, times or terminals are
**never** evidence of continuation. At most a 2-record chain is joined; longer
chains (`split_chain_too_long`), two-way-ambiguous link sets
(`ambiguous_split_chain`), unlinked groups (`split_chain_not_linked`) and
linked-but-incompatible pairs (`split_chain_incompatible`) all fail closed.

**No split service has been measured.** The provider contract defines the links
and the primitive honours them defensively, but the `MITA_PART_1` / `MITA_PART_2`
fixtures are a hypothetical shape, not a provider observation.

A split continuation is the same service, not a passenger transfer, and still
produces exactly one train leg.

If a returned record declares a continuation that was **not** retrieved, the
candidate is `inconclusive: split_continuation_not_retrieved` — uninspected
evidence, never an absence.

## 9. Result contract

```
status: "resolved" | "no_direct_service_evidence" | "inconclusive"
```

`no_direct_service_evidence` means *the bounded inspected evidence produced no
proven direct Journey*. It is **never** a claim that no train service exists —
ODPT search completeness is not guaranteed, and `[]` is a successful provider
answer rather than a capability statement. Lack of ODPT evidence never produces
"transport unavailable".

`resolved` carries `coverage: "complete" | "partial"` (partial when the lookup
cap truncated inspection) plus safe diagnostics:

```
stationTimetableLookups, exactTrainLookups, logicalLookups,
candidatesDiscovered, candidatesInspected,
candidatesWithoutTrainIdentity, candidateLimitReached, reasons
```

### Absence / inconclusive matrix

| Evidence | Result |
| --- | --- |
| `StationTimetable` successful `[]` or documented 404 | `no_direct_service_evidence` |
| `StationTimetable` provider failure / `too_large` / budget state | `inconclusive` |
| No in-window object with an exact train identity | `no_direct_service_evidence` |
| `TrainTimetable` successful `[]` or documented 404 | candidate gives no direct evidence |
| `TrainTimetable` provider failure / `too_large` / budget state | candidate is `inconclusive` |
| Invalid chronology | candidate is `inconclusive` |
| Destination precedes origin | not a valid outbound candidate |
| Required origin departure / destination arrival absent | candidate cannot verify a duration |
| Uninspected candidates remain and nothing proven | `inconclusive: journey_budget_exhausted` |
| Uninspected candidates remain and something proven | `resolved`, `coverage: "partial"` |

## 10. Fare is deliberately unknown

No `RailwayFare` call is made in this PR. The Journey cost stays
`state: "unknown"`, `representation: null`, `evidence: "unknown"`,
`scope: "unknown"`, `completeness: "unknown"`. `needExtraFee === false` is **not**
a fare of zero, and a verified timetable duration is not a verified fare.

## 11. Evidence without polluting the canonical contract

The canonical `Journey` stays provider-neutral and `src/shared/types/journey.ts`
is **unchanged** by this PR. ODPT-specific audit detail lives in an
`OdptDirectJourneyEvidence` wrapper beside it: operator, train identity, train
number/type, railway, calendar, rail direction, service date, the exact scheduled
clock times used, contributing timetable record ids, credential-free source URLs,
retrieval time, and whether a split chain was required.

Station endpoints use `kind: "station"`, `id` = the exact ODPT identity, and an
`anchorKey` derived deterministically from that identity (so the anchor is stable
whether or not the provider supplied coordinates). Coordinates are attached only
when the provider actually supplied them; none are ever invented.

## 12. Fixtures and benchmark

- `__tests__/fixtures/odptDirectJourneyFixtures.ts` — hand-authored, sanitized,
  credential-free, minimal normalized shapes covering **both** pilot operators:
  the measured TokyoMetro 18-stop Marunouchi single-record direct service, and
  the measured Toei 25-stop **calendar-variant** pair (two records, no links).
  A hypothetical explicitly-linked split pair is included too, labelled as
  unmeasured. These are **not** live provider snapshots; only the
  identity/topology shape is taken from measured evidence.
- `__tests__/odptDirectJourneyBench.ts` — offline, deterministic benchmark
  harness reporting per scenario: operator, origin, destination, candidates
  discovered / inspected / verified, failure reasons, logical calls used,
  durations produced, split-chain usage. It is evidence for the **next**
  integration decision and must not be used to change precedence in this PR.

## 13. Known limitations

1. Direct (zero-transfer) services only — no transfer routing, no walking or
   feeder legs.
2. TokyoMetro and Toei only; JR-East is outside the pilot.
3. No fare modelling.
4. No cross-midnight candidate-discovery window.
5. A continuation that is not returned alongside the primary record is
   `inconclusive` rather than fetched separately: candidate lookups must always
   carry an exact train identity, and fetching a linked record by id would break
   that invariant.
6. Sibling records that disagree on scheduled times fail closed even when one of
   them is the right one for the requested date: the builder receives no calendar,
   so it cannot choose. Passing the applicable calendar through the resolver's
   `trainTimetable` query is the intended mitigation.
6. The primitive is not integrated, so its accuracy has no production telemetry.
