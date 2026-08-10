# Meguruto — Current Transport Architecture (KAI-12 Phase 0)

Branch audited: `aneeshpatil8/kai-63-remove-default-explore-filters-and-audit-transport-mode` @ `89ce96b9` (KAI-63, **unmerged** at time of writing; `origin/main` = `de28285e`).

Audit date: 2026-08-10. Catalogue size: **761 destinations** (`src/shared/data/destinations-index.json`).

This document is the Phase 0 deliverable of KAI-12. No implementation was performed — the phase is research-only because KAI-63 is not yet merged.

---

## 1. Evidence hierarchy

Meguruto transport uses a three-level evidence hierarchy, enforced by types in `src/shared/services/transport/`:

| Level | Type | Source of truth | Where produced |
|---|---|---|---|
| **verified** | `OriginAwareTransportEstimate` (`evidence: "verified"`) | route registries (`ground-routes.json`, `flight-estimates.json`, `ferry-estimates.json`) | `OriginAwareTransportService.getOriginAwareTransportEstimate` |
| **bounded estimated** | `EstimatedTransportEstimate` (`evidence: "estimated"`) | distance-based estimator, locality radius 120 km, same-zone only | `SafeGroundEstimateService.getSafeGroundEstimate` |
| **unknown** | `null` / absent | — | any registry miss; conservative by design |

`destination.transportOptions` (legacy static minutes) is **not** canonical proof of a route from a specific origin. It is used only as a destination-level "mode supported" gate and as a same-zone estimator eligibility check. Planning never reads it as a duration.

---

## 2. Data model inventory

### 2.1 `src/shared/data/ground-routes.json` — verified rail corridors (train/shinkansen)

- **52 prefecture-pair routes** (`routes`), **14 municipality-pair routes** (`municipalityRoutes`).
- Keys: `from`, `to` (prefecture slug, e.g. `osaka`; or municipality id `Tokyo:shinjuku`), `bidirectional`, `mode` (`train` | `shinkansen`), `timeRange [min,max] min`, `sourceUrl`, `checkedAt`.
- **No fare field.** No service-class field (no ordinary/rapid/limited-express distinction). No directionality flags beyond `bidirectional`.
- Origin prefectures present: **only `osaka`, `tokyo`, `fukuoka`** in the `from` column. All other prefectures exist only as destinations.
- Sample: `osaka→kyoto shinkansen [15,35]`, `tokyo→hokkaido train [240,330]` (see §2.6 weakness).
- `checkedAt` values: `2026-08-06` (valid as of audit date).
- Sources: Wikipedia, Japan-guide, Navitime pages — **not primary operator sources** (KAI-63 provenance quality; KAI-12 must upgrade to operator timetables).
- Lookup: `GroundRouteEstimator.getGroundRoute(fromPrefecture, toPrefecture, mode)` / `getMunicipalityGroundRoute` (bidirectional matching only; non-bidirectional entries require exact orientation).
- Exact inventory (audit 2026-08-10):
  - **Train (17)**: osaka→kyoto/nara/shiga/wakayama/oita/gunma/gifu/mie/tokyo; tokyo→kyoto/kanagawa/tochigi/saitama/chiba/gunma/nagano/gifu/yamanashi/shizuoka/ibaraki (only `tokyo` and `osaka` as origins).
  - **Shinkansen (35)**: osaka→kyoto/aichi/hyogo/fukuoka/hiroshima/okayama/tokyo; tokyo→kyoto/osaka/aichi/miyagi/ishikawa/hiroshima/okayama/hokkaido/aomori/akita/yamagata/niigata/fukushima/nagano/iwate/toyama/gifu; fukuoka→kyoto/osaka/hiroshima/okayama/kagoshima/kumamoto/nagasaki/oita(train).
  - **Municipality (14)**: Tokyo wards (9), Osaka (2), Okinawa:naha self-loop (1), Hiroshima (1), Miyazaki (1).
- Known false-claim risks in the current registry (KAI-12/Luna targets):
  - `tokyo→hokkaido shinkansen [235,300]` — Hokkaido Shinkansen terminus is Shin-Hakodate-Hokuto until the Sapporo extension opens (2031); "hokkaido" as a prefecture key overgeneralizes (Hakodate reachable, Sapporo not).
  - `osaka→oita train [240,300]` — Osaka→Oita is ferry-dependent (Sunflower) or Shinkansen+Sonic; a plain "train" entry risks a false land-only claim.
  - `osaka→gunma train [240,300]` — long corridor with no direct conventional service; realistic route is Shinkansen + local, currently flattened into one "train" number.
  - All 52 entries are sourced from Wikipedia/Japan-guide/Navitime — **secondary sources**, none from operator timetables.

### 2.2 `src/shared/data/flight-estimates.json` — verified direct-flight registry

- **34 routes** between 20 airports (`airports.json`).
- Keys: `from`, `to` (IATA), `flightTime [min,max]`, `fare [min,max] | null`, `fareStatus` (`verified`/`unverified`), `sourceUrl`, `fareSourceUrl`, `checkedAt`.
- **26 routes carry fares; 8 have `fare: null`.** Only **11 routes carry `sourceUrl`+`checkedAt`** — the other 23 route-existence entries have **no provenance at all** (validator requires provenance only when fare metadata present; see §4).
- `getFlightRoute` matches bidirectionally.
- Important: routes are **direct-only**; no transfer model exists. If a "direct" registry entry is actually a connecting itinerary, it is a false claim (see KAI-12 flight audit).

### 2.3 `src/shared/data/airports.json` — airport registry (21 airports)

- Keys: `id`, `code`, `name`, `city`, `prefecture`, `coordinates`.
- Domestic airports only, limited to catalogue-relevant set. Missing majors: **Sendai (SDJ), Nagoya… (NGO present), Okinawa… OKA present, Oita (OIT), Kagoshima KOJ present**, notably **SDJ absent** — Sendai origin gets 0 flight routes (baseline confirmed).
- Catchment: origin airports within **250 km** (`ORIGIN_AIRPORT_CATCHMENT_KM`) and **same transport zone** (`airport-zones.json`), top 3 candidates.
- Destination arrival airport = nearest airport ≤ 250 km in the destination's zone (`findArrivalAirport`).

### 2.4 `src/shared/data/transport-topology.json` + `airport-zones.json` — island/zone topology

- **15 zones**: 4 major land zones (`mainland-honshu`, `mainland-kyushu`, `mainland-shikoku`, `hokkaido`) + 11 island/remote zones.
- Zone `localModes` (rail/road/bus only): honshu/kyushu `[train, shinkansen, car, my_car, bus]`; shikoku/hokkaido `[train, car, my_car, bus]`; islands vary. **`okinawa-main` includes `train`** (monorail) — flag for semantic audit.
- **Edges (3, all bidirectional)**: honshu↔kyushu `[train, shinkansen, car, bus]`; honshu↔shikoku `[train, car, bus]` (no shinkansen — correct, no bridge shinkansen); honshu↔hokkaido `[train, shinkansen]` (no car/bus — correct: no road link).
- Flight/ferry are **never edge modes** — proven by registries.
- **Weakness found (baseline)**: `MAINLAND_BOUNDS` shikoku box `lat [32.5,34.5], lng [132.2,134.9]` **overlaps Honshu**: a Hiroshima coordinate origin (34.385, 132.455) resolves to `mainland-shikoku`, flipping shinkansen eligibility (0) and bus/train coverage for a major city. Mainland boxes are ordered after island boxes but overlap each other; the shikoku box should be tightened (e.g. to lat ≤ 34.3, lng ≥ 133.2) or replaced with prefecture metadata for coordinate origins.

### 2.5 `src/shared/data/ferry-routes.json` / `ferry-estimates.json` — ferry registries

Out of scope for KAI-12 (documented for completeness): ferry services carry the richest fare model (`fareBasis` one-way/round-trip, `fareValidFrom/To`, `operatingPeriods`, operator, vessel type). This is the reference model for KAI-12 fare expansion.

### 2.6 `destination.transportOptions` / `transportFares` — legacy static metadata

- `transportOptions`: `{train?, car?, my_car?, shinkansen?, bus?, flight?, ferry?}` — **static minutes from a fixed/unspecified origin**. Deprecated as duration evidence; still gates `supported(mode)` in `getValidModes` and is the last-resort input in `getTransportCost` fallbacks.
- `transportFares`: `{train?, shinkansen?, bus?, car?, my_car?}` — **explicit one-way per-person fares (JPY)**; used with precedence in `getTransportCost` (×2 round-trip × party). No provenance fields (no sourceUrl/checkedAt) — **schema gap** for KAI-12 fare policy.
- `localAccessModes` / `localAccessUnestimated` — destination-level access constraint for islands/special records.
- `transportZoneId` — explicit zone assignment (required for island/remote records).
- `relationships.gatewayHubId` — regional access hub for places reachable only via a gateway (islands, remote mountains). **Not used by any transport service** — a known unused hook (see gap analysis).

---

## 3. Service inventory

### 3.1 `OriginAwareTransportService.ts` (canonical origin-aware estimates)

- `getOriginAwareTransportEstimate(dest, context, modes)` → fastest verified estimate across requested modes, or `null`.
- Resolves origin prefecture/municipality from home coords via `OriginAreaService.resolveOriginMunicipalityId` (confidence-guarded).
- Same-prefecture trips → municipality-pair registry; cross-prefecture → prefecture-pair registry.
- Flight branch: `getFlightTransportEstimate`; ferry branch: `getFerryTransportEstimate`; **bus and car have no verified corridor registry → always `null`** (by design; KAI-12 bus audit target).
- Never fabricates a duration from distance or generic speeds.

### 3.2 `SafeGroundEstimateService.ts` (bounded estimates)

- `getSafeGroundEstimate(dest, ctx)` → `EstimatedTransportEstimate` only when:
  - same major land zone (honshu/kyushu/shikoku/hokkaido), not remote;
  - distance ≤ **120 km**;
  - caller's authorized modes intersect topology modes;
  - destination `localAccessUnestimated !== true`, finite coords.
- Uses `estimateBetween` (generic speed model: train 75 km/h, bus 50, car 65, shinkansen 180) — **not** verified corridor data.
- Flight/ferry explicitly excluded → islands cannot gain train/car feasibility from coordinate distance.

### 3.3 `FlightTransportEstimator.ts` (verified direct flights)

- `getFlightTransportEstimate(dest, homeCoords)`:
  1. arrival airport = nearest to dest ≤ 250 km **in dest's zone**;
  2. origin airports = nearest ≤ 250 km **in origin's zone**;
  3. route must exist in `flight-estimates.json` (direct-only);
  4. door-to-door = origin access (generic estimator) + **105 min airport buffer** + flightTime + dest access;
  5. `costUnavailable` when `fare === null` — never fabricates a flight price.
- `recommended` flag compares against generic ground estimate (distance-based) — **not** against verified rail corridors (consistency risk: flight recommended vs unverified ground).

### 3.4 `TransportTopologyService.ts` (authorization)

- Zone resolution (island boxes → prefecture metadata → mainland boxes), `getEligibleOriginModes` (edges/localModes), `hasFerryRoute`, `getAirportZone`.
- Rail/road/bus authorization exclusively from explicit edges; flight/ferry from registries.

### 3.5 `RecommendationScorer.getValidModes` (mode eligibility)

- Authorizes from topology + flight/ferry estimates; intersects user selection; **`supported(mode)` requires `dest.transportOptions[mode]` present for ground modes** — legacy key gates verified corridors (baseline: Tokyo origin has 202 verified-shinkansen destinations but only 178 visible under shinkansen filter because 24 verified destinations lack the legacy key).
- No budget-tier mode deletion (KAI-63).

### 3.6 `BudgetService.getTransportCost` / `getAdjustedBudget`

- Precedence: `dest.transportFares[mode]` (explicit) → duration-based heuristics (`TRANSPORT_PRICING_CONFIG`: train tiered ¥160/¥250/¥890 bases + per-min; shinkansen ¥2200 + ¥62/min; bus ¥800 + ¥11/min; car rental+toll+gas).
- **With an explicit origin, ground fares require a verified origin-aware duration; without one → `null` (never fabricated).**
- Round-trip = one-way × 2 × party for transit; car scales by vehicles (4 seats).
- **Fare provenance gap**: heuristic fares are estimates, not verified; explicit `transportFares` lack source/checkedAt; `TRANSPORT_PRICING_CONFIG` rates are unprovenanced constants.

### 3.7 Legacy `TransportEstimator.estimateBetween` / `getTransportEstimates`

- Generic speed×distance estimator; used by flight access legs, `LocalDiscoveryDisplayEstimator`, and legacy consumers. Not a route fact.

---

## 4. Current validator coverage (transport)

`scripts/validators/transport-topology.ts` (`validate-all` registry):

- Zone localModes validity; remote zones never expose shinkansen locally.
- Edge sanity (zones exist, no self-edge, rail/road/bus modes only, no duplicates).
- Flight routes: airports exist, zones assigned; fare/null-consistency (`fare:null` requires `fareStatus:"unverified"`, fare requires verified); invalid fare ranges; **provenance (sourceUrl+checkedAt) required only when fare metadata present** — 23 unprovenanced routes pass today.
- Ferry routes/services: zones, sourceUrl+checkedAt required, ISO dates, **no future `checkedAt` vs `REFERENCE_TODAY = 2026-08-05`**, fare validity windows, operating periods.
- Destinations: explicit zone assignments, island-marked never resolve to mainland, `localAccessModes` ⊆ zone localModes.

Missing validator coverage (KAI-12 targets):
- no sourceUrl/checkedAt requirement for **ground routes with no fare** (all 52 pass without provenance? — no: ground routes carry sourceUrl+checkedAt, but the validator does not check them);
- no future-date check for ground/flight `checkedAt`;
- no duplicate-corridor detection across `routes` vs `municipalityRoutes`;
- no guard against routes from `unknown` topology;
- no guard against ferry/flight-dependent islands gaining train-only access;
- no validation that a "verified" claim is not sourced from legacy `transportOptions`;
- no fare basis/fare product metadata for rail (no schema yet — gap analysis).

---

## 5. Consumer inventory

| Consumer | Transport surface | Key mechanics |
|---|---|---|
| Explore `Destinations.tsx` | filters by mode eligibility + duration feasibility | KAI-63: no default filter; unset selection ⇒ `ALL_PUBLIC_MODES` (`[train, shinkansen, bus, flight, ferry]`). Weekend gate (643–682) and day-trip/restricted gate (843–886) both call `getValidModes` + `isTripDatesTransportEligible` + `matchesPersonalizedDayTripDuration`. Budget filter (500–508) uses catalogue budget ranges, not transport. Sort "budget" uses `getSortableVerifiedBudget` (verified-only; unknown never zero). `weekendTravelById` (774–795) shows one-way midpoint + best verified mode for weekend trips. |
| Destination cards (`DestinationCard.tsx`) | travel row (441–475) shows gateway-origin estimate; evidence via `getDayTripTravelDurationEvidence`/`estimateTripDuration` | `getValidModes` 220–229; `getDayTripTravelDurationEvidence` 229–239 |
| Destination Details (`DestinationDetails.tsx`) | per-mode Travel Time card + Budget card | `groundMinutesFor` (662–676): origin-aware midpoint when home coords exist, else **falls back to `destination.transportOptions` minutes** (legacy display fallback — flagged). Local route fallback renders `formatApproximateTransportTime` (`~`/`約` marker) + `copy.localRouteUnverified` (EN "Travel time not verified for this origin"). Budget card shows "On-site budget (transport excluded)" when no mode has a cost; flight/ferry cost-unavailable handled. |
| Explore filter facet labels | `DestinationFilters.tsx:282,876` labels the rail facet **"Local trains" (在来線)** while the mode chip is "Train" (電車) — the two labels coexist for the same backend `train` mode (KAI-12 semantics note) | — |
| Home recommendation pipeline | `RecommendationPipeline.runRecommendationPipeline` (57–330); eligibility filter (70–164) uses `getValidModes`; day-trip feasibility via `TripDurationService` | `TripDurationService.getDayTripTravelDurationEvidence` (43–73): canonical ladder — verified (OriginAware) wins, else bounded estimated (SafeGround), else unknown; zone guard 46–49. `estimateDayTripDuration` (331+), `getDayTripTravelEfficiency` (187+) penalize unknown travel. |
| Weekend policy | `WeekendPolicy.ts` `WEEKEND_TRAVEL_POLICY` (13–25): local ≤60 / nearby ≤90 / normal ≤120 / strong ≤240 / acceptable ≤300 / weak ≤420 min; `evaluateWeekendTravelFit` (65–92): **unknown minutes → ineligible** (never treated as fast) | weekend trips additionally require ferry availability per day (`TravelConditions.isTripDatesTransportEligible` 113–135) |
| Home match cards / Roulette | `HomeMatchCard` reads `scoredDestination.transportEstimate` (127); weekend → `getFastestPreferredTransport`; day trip → `getDayTripTravelDurationEvidence`; roulette winner panel mirrors this | `LocalDiscoveryDisplayEstimator.getSafeDisplayEstimate` (27) = display-only bounded estimate for nearby discovery, authorized via `getValidModes` |
| Planner budget | `PlannerBudgetPolicy.getPlannerBudgetLimit` (24–41): per-person daily caps (economy 10k → luxury 75k) × party × duration multiplier; transport costs come from `getAdjustedBudget`/`getTransportCost` | — |

### Evidence ladder (authoritative)

`TripDurationService.getDayTripTravelDurationEvidence` (43–73):
1. verified origin-aware estimate (`getOriginAwareTransportEstimate`) — wins;
2. bounded estimated (`getSafeGroundEstimate`) — ≤120 km, same major land zone;
3. **unknown** — weekend fit ineligible, day-trip feasibility conservative.

Unknown durations never rank as fast (WeekendPolicy ineligibility; `getSortableVerifiedBudget` never zero-costs unknown fares; budget "transport excluded" label).

## 6. Concept table (required deliverable)

| Concept | Current source of truth | Evidence type | Origin-aware? | Fare-aware? | Known weakness |
|---|---|---|---|---|---|
| Train duration (intercity) | `ground-routes.json` prefecture pairs | verified (registry) | yes | no | Only 3 origin prefectures; no service class; secondary sources |
| Train duration (intra-prefecture) | `municipalityRoutes` (14) | verified (registry) | yes | no | Sparse (Tokyo wards only) |
| Shinkansen duration | same registries | verified | yes | no | No corridor/operator/service-class model; gateway semantics absent |
| Bus duration | — (none) | — | — | — | **No verified intercity bus registry at all**; bus filter shows legacy-only/estimated |
| Flight duration | `flight-estimates.json` (34 direct) | verified | yes | partial (26 fares, no product basis) | 23 routes unprovenanced; no SDJ; connecting itineraries unrepresentable |
| Ferry duration/fare | `ferry-estimates.json` | verified | yes | yes (richest model) | Out of KAI-12 scope |
| Train fare | heuristic `TRANSPORT_PRICING_CONFIG` or `transportFares` | estimated / explicit-unprovenanced | yes (duration-driven) | — | No fare basis metadata; limited-express surcharge not representable |
| Shinkansen fare | heuristic | estimated | yes | — | No seat-class product basis (ordinary non-reserved vs reserved) |
| Bus fare | heuristic | estimated | yes | — | No verified basis; local-bus fares must not stand in for highway coach |
| Flight fare | `flight-estimates.json` fare ranges | verified/unverified | yes | yes | No validity window; dynamic pricing not documented; 8 null |
| Mode eligibility | topology edges + registries + `transportOptions` gate | verified/explicit | yes | no | Legacy key gates verified corridors; bus eligibility implies intercity only via edge, not terminal evidence |
| Zone/topology | `transport-topology.json` | explicit | yes | no | Shikoku mainland box overlaps Honshu (Hiroshima origin mis-resolves); okinawa `train` local mode |
| Access to gateway (airport/station) | generic `estimateBetween` | estimated | yes | estimated | Access legs not registry-backed; last-mile unknown for most destinations |
| Gateway mapping (station/airport per destination) | nearest-airport heuristic + `gatewayHubId` (unused) | heuristic/explicit | partial | no | `gatewayHubId` unused by transport; no station gateway inventory |
| Destination budget | `budgetRecommended/Min/Max` + `getAdjustedBudget` | mixed | yes | partial | Transport leg is estimated fare; `transportFares` unprovenanced |
| `transportOptions` legacy minutes | destination records | legacy/static | **no** | no | **Not canonical proof of origin-aware routes** (first principle) |

---

## 7. Test/validator inventory summary (explore agent #2)

- Transport service tests (12 files): `OriginAwareTransportService`, `TransportEstimator`, `TransportTopologyService`, `PreferredTransport`, `FerryEstimator`, `KurashikiTransportProvenance` (regression: legacy `transportOptions.shinkansen:200` authorizes mode + neutral browsing; origin-aware estimate uses verified `tokyo→okayama [210,300]`, never the legacy value).
- Recommendation tests: `transportAuthorization` (40+; flight registry auth; distance alone never creates flight/ferry), `PerModeBudgetConsistency` (per-mode durations), `DayTripFeasibility`, `TravelConditions`, `RecommendationScorer`, `RecommendationService`.
- Explore: `ExploreTransportAudit` (KAI-63, Yokohama origin), `ExploreDefaultState` (KAI-63 regression), plus untracked local `count_modes.test.ts` (user scaffolding, untouched).
- No test hard-codes transport `checkedAt`; `audit-catalog-integrity` flags future-dated `checkedAt` (`REF` constant) for destination editorial data.
- Validator registry (`scripts/validators/registry.ts`, 13 validators): `destinations` → `destinationDetails` → `places` → `collections` → `relationships` → `search` → `links` → `images` → `ratings` → `visitHours` → `majorCityExpansion` → `duplicateKeys` → `transportTopology`. `npm run validate-all` runs all; `--profile fast` skips Catalog Images only; `check:catalog-ci` is a changed-scope gate, not a validator run.
- `scripts/audit/catalog-integrity.ts` categories: A relationships, B geographic suspicion (island boxes), C duration/completeness, D (transport-adjacent).
- Catalogue stats (n=761): 723 with `transportOptions`; keys — train 682, shinkansen 183, car 236, bus 229, ferry 1, walk 2, my_car 0; **`transportFares` present on 0 records**; `transportZoneId` on 31 (7 = `unknown`); `localAccessModes` on 4; `gatewayHubId` on 40; `parentDestinationId` on 542; 186 distinct municipalities; all 47 prefectures.

## 8. Key architecture gaps identified (summary)

1. **No gateway model**: stations/airports/bus terminals are not first-class entities; airport access is a 250 km nearest heuristic; `gatewayHubId` exists but unused.
2. **Prefecture-pair registry cannot express**: transfers (Shinkansen→conventional), multi-leg journeys, service-class differences, directionality beyond `bidirectional`.
3. **No bus registry** (verified=0 for all origins).
4. **No fare model for rail**: no product/basis metadata; `transportFares` lacks provenance.
5. **Flight registry**: 23/34 unprovenanced; direct-only (correct) but some entries may be false directs (e.g. HND→ISG/MMY/TSJ/ASJ/KUM/SDO via OKA in reality); no SDJ.
6. **`getValidModes` legacy-key gate** hides verified corridors.
7. **Topology box overlap** (Hiroshima origin → shikoku).
8. **Recommendation engine** uses verified duration only when present; unknown durations must not rank fast (validated by tests; see baseline).

See `TRANSPORT_MODEL_GAP_ANALYSIS.md` for the full problem/fix matrix.
