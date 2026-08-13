# KAI-63 — Non-Bus Transport Coverage Audit (Phase 1: Research Report) — CORRECTED

**Status:** Research only. No code or data changed.
**Baseline:** `origin/main` @ **f468a26d** (`data: integrate merged UNESCO PR #142 into the collection-audit stack (#151)`).
**Product/architecture amendment (2026-08-13, after review):** §4 and §5 now specify that **route/reachability evidence and duration evidence are independent axes**. Mode eligibility must never depend on Meguruto being able to state a travel duration; a reachable destination with unknown duration stays mode-eligible and may show "Travel time unavailable". Duration filtering applies only when the user explicitly selects a duration/trip-mode constraint; "Any" duration imposes no hidden 14-hour cap. All count tables in this report still measure **current behavior** (which couples the two axes); they are not rerun by this amendment.
**Correction notice:** The first version of this report audited 800 records from a stale local HEAD (44192f21). Origin/main @ f468a26d contains **983** records and includes KAI-66 corridor/flight work (#139/#140), KAI-83 (#144) and collection PRs (#145–151) that the stale checkout lacked. **All counts in this revision were reproduced against f468a26d** in a clean detached worktree (`/tmp/kai63-main`, node_modules symlinked; harness copies under `qa/kai-63/` there and in the main tree). The dirty main working tree (uncommitted `OriginAwareTransportService.ts`, `TransportTopologyService.ts`, `BusRouteEstimator.ts`, `ground-routes.json`, `flight-estimates.json`, `airports.json`, `airport-zones.json` — user WIP incl. SDJ arrival routes) was **not** used as the baseline; it is noted in §B.

---

## 1. Baseline reconciliation (983 vs 800)

| Quantity                                       | Count           | Evidence                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical source destination count**         | **983**         | `src/shared/data/destinations-index.json` @ f468a26d is the canonical runtime source (imported directly by `PlaceCatalog.getCanonicalPlaces`). No separate canonical raw registry exists in-tree; `scripts/data/*.json` are one-off import inputs for `pipeline.cjs` only. |
| **Generated `destinations-index.json` count**  | **983**         | The committed index is both canonical input and the record set; nothing regenerates it from a larger source.                                                                                                                                                               |
| **Generated detail/meta outputs**              | 983 / 983       | `scripts/catalog/generate-outputs.ts` generates `public/data/destinations/<id>.json` (983 files) and `destinations-meta.json` (983) from the index; `check-catalog-sync` enforces byte-identical, idempotent regeneration.                                                 |
| **Published count**                            | **736**         | `status: published` 736 / `beta` 173 / `verified` 74 (983 total). `editorial.lifecycle`: published 736, in_review 128, none 119.                                                                                                                                           |
| **Explore-eligible count (EN)**                | **983**         | `isPlaceAvailableInLocale(place,"en")` returns `true` unconditionally — no status/role filter.                                                                                                                                                                             |
| **Explore-eligible count (JA)**                | **708**         | JA gate = `lifecycle==="published"` + ja name/description/highlights.                                                                                                                                                                                                      |
| **Status/role filtering that turns 983 → 800** | **None exists** | The 800 in the original report was a **stale checkout** (HEAD 44192f21, which predates f468a26d by 14 commits including KAI-66 #139/#140 and the collection PRs). All 258/136/49/… counts from the first revision are **withdrawn**.                                       |

The dirty working tree at the time of this audit also differs from f468a26d in transport registries (`ground-routes.json`: +6 train rows, +7 municipality rows, fare-provenance edits; `flight-estimates.json`: +SDJ arrival routes; `airports.json`/`airport-zones.json`: SDJ fields). Those are uncommitted user changes, not part of the f468a26d baseline.

---

## A. Executive summary

### Current counts (reproduced against f468a26d, 2026-08-13)

| Quantity                                                     | Value                                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Full catalogue (`destinations-index.json`)                   | **983** (historic KAI-63 observation: 731)                                                     |
| Explore-eligible (EN) / fresh Explore, unfiltered            | **983**                                                                                        |
| No-origin + any transport mode selected                      | **983** (transport filter inert without an origin)                                             |
| **Yokohama origin — full UI gate**                           | train **260** · shinkansen **152** · car **52** · my_car **52** · flight **214** · ferry **0** |
| Yokohama origin — authorization layer (`getValidModes` only) | train 711 · shinkansen 229 · car 281 · my_car 281 · flight 279 · ferry 3                       |
| Osaka origin — full gate                                     | train 136 · shinkansen 227 · car 50 · flight 86 · ferry 2                                      |
| Fukuoka origin — full gate                                   | train 59 · shinkansen 169 · car 3 · flight 310 · ferry 21                                      |
| Sapporo origin — full gate                                   | train 18 · shinkansen 0 · car 0 · flight 355 · ferry 0                                         |
| Takamatsu origin — full gate                                 | train 42 · shinkansen 0 · car 34 · flight 208 · ferry 2                                        |

### Historic reproducibility (revised)

| Historic                    | Current (f468a26d)              | Verdict                                                                               |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| Unfiltered 731              | 983                             | catalogue grew (KAI-31/32/57 + collections PRs #145–151 + KAI-83)                     |
| Local train 259             | **260** (full gate, Yokohama)   | **reproducible within catalogue drift**                                               |
| Shinkansen 10               | **152**                         | KAI-12 (#131) + KAI-66 (#139) corridors/hubs raised it; not reproducible as-is        |
| Rental/Personal car 410/410 | **52** full gate / **281** auth | **not reproducible**; the day-trip duration gate + sparse car metadata (291/983 keys) |

### Biggest root causes (unchanged in kind, updated magnitudes)

1. **Legacy metadata presence gate** — `getValidModes` uses `transportOptions.{train,car}` key presence as train/car eligibility. At f468a26d: 730 train keys, 291 car keys, **190 records with no `transportOptions` at all**; 218 train-authorized and **609 car-authorized** records lack the key.
2. **Estimate-collapse** — with an origin, Explore requires duration evidence (corridor row or ≤120 km same-zone estimate) and a **14 h round-trip cap even at "any" duration**. From Yokohama: Local train = **0 results in Kansai, Chugoku, Tohoku, Kyushu**; car = ≤120 km bubble; Hakodate/Onuma/Kanazawa/Takaoka and all ferry islands drop at the 14 h cap (each verified day-trip-impossible).
3. **Shinkansen registry-limited** — 641 topology-authorized records lack a verified corridor+hub path; no Utsunomiya/Takasaki/Shin-Yamaguchi/Nishi-Kyushu hubs; Kanazawa/Toyama destinations lack `municipalityId` wiring (radius fallback partially compensates); no intra-zone rows (Kanto = 3 from Yokohama, all via the Karuizawa/Nagano corridor).
4. **Island topology** — **14** unknown-zone records (Miyajima ×6, Amami ×1, +7 new collection records: Rishiri-Rebun-Sarobetsu, Kerama-shoto, Iki-Tsushima, Koshikijima, Shodoshima, Inujima, Ogijima) invisible to every transport filter; ferry islands unreachable from distant origins (300 km origin-port catchment, no rail→port→ferry legs).
5. **Rental ≡ Personal car by construction** — identical resolver path, 0 `my_car` keys, synthesized at runtime; counts identical by construction (281/281 auth, 52/52 full gate).
6. **State defect (P0)** — `mode=ferry`/`mode=local`/junk `car=` URL values activate a restriction with **zero visible chips** while the modal shows "Any transport".

### Trustworthiness verdict (unchanged)

Filters **under-report; they do not fabricate**. No confirmed false-positive coverage at the baseline. Two minor truthfulness caveats: fabricated legacy train values on rail-less islands (blocked from Honshu origins by topology, but would surface for same-zone Okinawa origins via the `okinawa-main` zone's `train` localMode = Yui Rail), and gateway trips attach the corridor endpoint's fare (e.g. Tomioka via Karuizawa uses the Tokyo→Nagano fare).

### Counts summary

- Confirmed code/state defects: **3** (D1 URL state validation; D7a nearest-airport no-fallback; D7b candidate-airport-limit KOJ drop).
- Data inconsistencies: **2** (D10a sakurajima ferry inverse gap; D12 fabricated island transport values).
- Data-coverage gap families: **5** (train corridors D6, car/train metadata D2, Shinkansen hubs/rows D5, flight routes D8, ferry services/legs D10).
- Unresolved: **14** unknown-zone records; 15 fare-null flight routes and 5 ferry fare windows (cost-only, never eligibility).

---

## B. Transport architecture map (f468a26d)

Unchanged from the first revision; names and flow verified identical at f468a26d:

```
destinations-index.json (983, canonical runtime source)
  ├─ transportOptions   (LEGACY presence gate; values = fixed Tokyo-era minutes; train 730, car 291,
  │                      bus 278, shinkansen 183, ferry 12, flight 2, walk 2 [stray]; my_car 0)
  ├─ transportZoneId    (explicit on ~40 records incl. 14 "unknown"; rest derived)
  ├─ localAccessModes   (4 records)
  ├─ recommendedVisitHours (983/983)  ├─ municipalityId (954)
        ▼
TransportTopologyService.ts  ← transport-topology.json (15 zones, 3 edges; island/prefecture boxes;
                                localAccessModes narrowing; flight/ferry never edge modes)
        ▼
Registries:
  ground-routes.json      32 shinkansen + 22 train prefecture-pair rows + 25 municipality train rows
  GroundRouteEstimator.ts 31 SHINKANSEN_ACCESS_HUBS, 33 MUNICIPALITY_SHINKANSEN_HUB_IDS, radii 50/30 km
  flight-estimates.json   41 routes (SDJ departure-only; no HND→SDJ) / airports 23 / airport-zones 23
  ferry-estimates.json    14 ports / 12 services; ferry-routes.json 12 zone pairs
  SafeGroundEstimateService.ts  ≤120 km same-zone coordinate estimate (evidence="estimated")
        ▼
OriginAwareTransportService.ts  getOriginAwareTransportEstimate (flight/ferry/train/shinkansen/bus;
                                  car/my_car explicitly return nothing)
        ▼
RecommendationScorer.ts  getValidModes  ← eligibility gate (topology ∪ flight/ferry estimates;
                          train/car = transportOptions presence; shinkansen/bus = corridor or presence;
                          my_car→car alias)
        ▼
Destinations.tsx  gate runs only when tripMode=day_trip | tripDuration≠any | hasRestrictedTransportSelection
                  → getValidModes > 0 → isTripDatesTransportEligible (dates only)
                  → matchesPersonalizedDayTripDuration (14 h envelope; evidence-unknown excludes with origin)
                  no origin ⇒ gate neutral (983/983)
        ▼
DestinationFilters.tsx  6 chips (Local trains / Express·Shinkansen / Domestic flights / Bus /
                        Personal car / Rental car; NO ferry chip)
```

**Baseline note:** the working tree contains uncommitted transport changes (OriginAwareTransportService, TransportTopologyService, BusRouteEstimator, ground-routes/flight-estimates/airports incl. SDJ arrival routes) that post-date f468a26d. They were excluded from this audit; several would reduce D6/D8 gaps if merged.

---

## C. Mode-by-mode findings (updated numbers)

### C1. Local train — **260** user-visible / 711 authorized (Yokohama); historic 259 → reproduced

- Semantics/data source/exclusion logic unchanged from revision 1: topology authorization + `transportOptions.train` presence + (with origin) corridor row **keyed on the origin prefecture** or ≤120 km same-zone estimate + 14 h envelope.
- Exclusions (Yokohama): eligible 711; topology-unsupported 40 (all islands: Okinawa 17, Ishigaki 6, Yakushima 5, Miyako 4, Amami 2, Ogasawara 2, Sado/Naoshima/Teshima/Tomogashima 1 each); **missing metadata 218**; unknown zone 14.
- Corridor registry @ f468a26d: 22 train rows, origin endpoints osaka/tokyo/fukuoka (the stale-checkout row list was contaminated by uncommitted WIP — 28 rows; corrected). **No row starts from kanagawa/saitama/…**; from Yokohama, Local train = the ≤120 km bubble (Kanto 244 + Yamanashi 9 + Shizuoka 7 = 260). Kansai/Chugoku/Tohoku/Kyushu = 0.
- 190 records have no `transportOptions` at all (was 38/800); 218 train-authorized records lack the key.

### C2. Shinkansen — **152** user-visible / 229 authorized (Yokohama); historic 10

- Semantics: gateway + catchment (Model B) constrained by verified corridor rows (32 @ f468a26d, Model C). KAI-66 #139 added corridor rows before f468a26d (the 32-row set at baseline: osaka→{kyoto,aichi,hyogo,fukuoka,hiroshima,okayama}, tokyo→{kyoto,osaka,aichi,miyagi,ishikawa,hiroshima,okayama,hokkaido,aomori,akita,yamagata,niigata,fukushima,nagano,iwate,toyama,gifu,shizuoka,fukuoka}, fukuoka→{kyoto,hiroshima,okayama,kagoshima,kumamoto,nagasaki}, hiroshima→okayama).
- Exclusions: eligible 229; topology-unsupported 99 (Shikoku 59 — correct, no Shinkansen edge; islands 40); **missing verified route 641**; unknown 14.
- Kanto intra-region = **3** from Yokohama (tomioka-silk-mill-gunma, minowa-castle, myogi-arafune-saku-kogen — all via the Karuizawa hub + `tokyo→nagano` corridor; the same gateway-fare caveat applies). Mie = 1 (`nabana-no-sato` via Nagoya hub, access 21 km — a valid gateway case). Hokkaido auth = 4 (Hakodate ×3 + Onuma), full gate = 0 (14 h cap).
- Gaps unchanged: no Utsunomiya/Takasaki/Shin-Yamaguchi/Nishi-Kyushu hubs; no wiring for Kanazawa/Toyama destinations (radius fallback works when within 30 km); no intra-zone rows; gateway fare = corridor endpoint fare.

### C3/C4. Personal car & Rental car — **52** user-visible / 281 authorized (Yokohama)

- Identical by construction (see §E). Exclusions: topology-unsupported 79 (Hokkaido 39 — no car edge across Tsugaru; islands 40); **missing metadata 609** (dominant); unknown 14.
- Metadata census: car keys 291/983; 35/124 city hubs; 0/23 Tokyo ward hubs (no documented policy); ferry-only islands carry car values (Sado, Ogasawara, Tomogashima) blocked by topology.

### C5. Ferry — **3** authorized (Ogasawara Islands, Ogasawara National Park, Sado Island Gold Mines) / 0 user-visible from Yokohama (all day-trip-impossible: Sado 18.8 h, Ogasawara 55.6 h totals — verified); Osaka/Takamatsu 2 (Naoshima, Teshima); Fukuoka 21 (Tsushima + local).

- New at baseline: `ferry` keys now on 12 records (was 1); `ogasawara-national-park` added by a collection PR.
- Findings unchanged: Tomogashima = the only season-gated service (03-01..11-30), invisible in date-less browsing; sakurajima service without a zone-pair row (inverse gap); hokkaido/yakushima/amami/okinawa-main zone pairs in `ferry-routes.json` without estimable services; no ferry UI chip; 300 km origin-port catchment.

### C6. Air — **214** user-visible / 279 authorized (Yokohama); Fukuoka 310/490; Sapporo 355.

- **HND→SDJ still absent at f468a26d** (SDJ is departure-only; 7 routes). KAI-66 #140 added SDJ/UKB routes but only SDJ→* — all 102 Tohoku records remain flight-invisible from Tokyo (region flight = 0).
- Defects unchanged: nearest-airport zone mismatch has no in-zone fallback (`akiyoshido-cave-yamaguchi`: FUK 106 km out-of-zone beats in-zone HIJ 150 km); `candidateAirportLimit=3` drops KOJ from Fukuoka (kills KOJ→ASJ/KUM year-round; only seasonal FUK→KUM remains).
- fare:null ⇒ `costUnavailable`, eligibility unaffected (correct).

### C7. Explore state audit (f468a26d) — unchanged conclusions

Same as revision 1: default no-restriction; saved prefs inject only partySize; URL restore injects transport state incl. unrenderable `ferry`/junk modes (D1); no-origin gate inert; with origin, filter = authorization ∧ evidence ∧ 14 h; `homeStationTransportZoneId` populated on every origin path; no status/lifecycle filtering at the Explore level (983 EN).

---

## D. Full exclusion breakdown (Yokohama origin, f468a26d)

| Mode         | Eligible | Topology-unsupported  | Missing metadata | Missing verified route/registry               | Unknown zone | User-visible (full gate) |
| ------------ | -------- | --------------------- | ---------------- | --------------------------------------------- | ------------ | ------------------------ |
| Local train  | 711      | 40 (islands)          | 218              | 0 (duration-gate drop ≈ 451 not counted here) | 14           | 260                      |
| Shinkansen   | 229      | 99 (Shikoku+islands)  | 0                | **641**                                       | 14           | 152                      |
| Personal car | 281      | 79 (Hokkaido+islands) | **609**          | 0                                             | 14           | 52                       |
| Rental car   | 281      | 79                    | **609**          | 0                                             | 14           | 52                       |
| Flight       | 279      | n/a                   | 0                | 690 (no airport/route/zone match)             | 14           | 214                      |
| Ferry        | 3        | n/a                   | 0                | 966 (port >300 km / no service / seasonal)    | 14           | 0                        |

(983 = eligible + unsupported + missing + unknown per row. Flight/ferry "unsupported" columns are the no-route remainder.)

---

## 3. Defect inventory (ID'd families, consistent totals)

**14 distinct root-cause families (D1–D14).** Code/state defects: 3 (D1, D7a, D7b). Data inconsistencies: 2 (D10a, D12). All others are coverage/semantics gaps.

| ID  | Family                                                                                                                                                                                                                                                                                                                                                                  | Kind               | Count / magnitude                                                                                               | Evidence                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | URL transport-state validation: `mode=ferry/local/express` or junk `car=` accepted; restriction active with zero chips and "Any transport" label; ferry has no chip                                                                                                                                                                                                     | code/state         | 1                                                                                                               | `destinationSearchParams.ts` (unvalidated parse), `DestinationFilters.tsx` (6 chips, no ferry)          |
| D2  | Legacy `transportOptions` presence gate for train/car; 190 empty records; 218 train + 609 car keys missing                                                                                                                                                                                                                                                              | data               | 190 / 218 / 609                                                                                                 | census @ f468a26d                                                                                       |
| D3  | Asymmetric eligibility: train/car = key presence; shinkansen/bus = corridor (with coords); flight/ferry = estimator                                                                                                                                                                                                                                                     | resolver semantics | 1                                                                                                               | `RecommendationScorer.getValidModes`                                                                    |
| D4  | Duration/evidence collapse: no-origin filter inert (983/983); "any" = 14 h cap; evidence-unknown excludes authorized cross-zone results. **Target (per §4.1/§5): reachability and duration independent — eligibility never requires a duration; "any" imposes no cap; duration filters run only under an explicit duration/trip-mode selection**                        | resolver semantics | 451 train / 229 car / 77 shinkansen / 65 flight dropped between auth and full gate (Yokohama; current behavior) | `TripDurationService.matchesPersonalizedDayTripDuration`                                                |
| D5  | Shinkansen registry: 641 authorized-unverified; 4 missing hubs (Utsunomiya, Takasaki, Shin-Yamaguchi, Nishi-Kyushu); no intra-zone rows; Kanazawa/Toyama wiring absent                                                                                                                                                                                                  | registry data      | 641 / 4 hubs                                                                                                    | `GroundRouteEstimator.ts`, `ground-routes.json`                                                         |
| D6  | Train corridor registry keyed on origin prefecture; no rows from kanagawa/saitama/… ⇒ cross-zone conventional rail invisible (Kansai/Chugoku/Tohoku/Kyushu = 0 from Yokohama)                                                                                                                                                                                           | registry data      | 22 rows, 3 origin endpoints                                                                                     | `ground-routes.json`                                                                                    |
| D7a | Flight nearest-airport zone mismatch never falls back to an in-zone airport (akiyoshido: FUK vs in-zone HIJ)                                                                                                                                                                                                                                                            | code               | 1                                                                                                               | `FlightTransportEstimator.findArrivalAirport`                                                           |
| D7b | `candidateAirportLimit=3` drops in-zone KOJ from Fukuoka (kills KOJ→ASJ/KUM year-round)                                                                                                                                                                                                                                                                                 | code               | 1                                                                                                               | `FlightTransportEstimator.findNearestAirports`                                                          |
| D8  | No arrival routes to SDJ (Sendai) at f468a26d; 102 Tohoku records flight-invisible from Tokyo                                                                                                                                                                                                                                                                           | registry data      | 1 route family                                                                                                  | `flight-estimates.json`                                                                                 |
| D9  | 14 records resolve to `unknown` zone (Miyajima ×6, amami-iriomote, +7 new: rishiri-rebun-sarobetsu, kerama-shoto, iki-tsushima, koshikijima, shodoshima, inujima, ogijima) — invisible to every transport filter                                                                                                                                                        | data               | 14                                                                                                              | `resolveDestinationTransportZone`                                                                       |
| D10 | Ferry model: (a) sakurajima service without zone-pair row (inverse gap); (b) hokkaido/yakushima/amami/okinawa-main zone pairs without estimable services; (c) 300 km origin-port catchment + no rail→port→ferry legs (Naoshima/Teshima/Yakushima/Tomogashima unreachable from Tokyo); (d) tomogashima season-gated, invisible in date-less browse; (e) no ferry UI chip | data + model       | (a) 1, (b) 4 pairs, (c) systemic, (d) 1, (e) 1                                                                  | `ferry-estimates.json`, `ferry-routes.json`, `FerryTransportEstimator.ts`, `DestinationFilters.tsx`     |
| D11 | Rental ≡ Personal car structural identity (same edge, same key, 0 `my_car` keys, runtime synthesis)                                                                                                                                                                                                                                                                     | product/semantics  | 1                                                                                                               | `RecommendationScorer.ts`, `DestinationService.ts`                                                      |
| D12 | Fabricated legacy values: rail-less islands carry train 180–200 (naha-city, ishigaki-city, miyakojima-city, yakushima-town, kouri-island); `okinawa-main` zone lists `train` localMode (Yui Rail)                                                                                                                                                                       | data truthfulness  | ~12 records + 1 zone                                                                                            | index census, `transport-topology.json`                                                                 |
| D13 | No validators for key membership/value semantics; fabricated values pass                                                                                                                                                                                                                                                                                                | validation         | 0 validators                                                                                                    | `scripts/validators/destinations.ts` (MISSING_TRANSPORT_OPTIONS only, warning for suspicious estimates) |
| D14 | Gateway fare provenance: corridor-endpoint fare attached to catchment trips (Tomioka via Karuizawa = Tokyo→Nagano 8,250 ¥)                                                                                                                                                                                                                                              | fare provenance    | 1 pattern                                                                                                       | `OriginAwareTransportService` shinkansen branch                                                         |

---

## 4. Canonical replacement semantics — do not bulk-backfill

**Do not mass-set `transportOptions.car/train = true`.** The legacy field is unprovenanced (fixed Tokyo-era minutes, `minutesFromBase` era) and any bulk fill would convert an honest omission into a fabricated claim.

### 4.1 Invariant: reachability and duration are independent axes

The canonical model keeps **two orthogonal evidence axes** that must never collapse:

- **Reachability / route evidence** — topology (physical possibility) + verified route rows + destination access evidence. This is the **only** input to mode **eligibility**.
- **Duration evidence** — verified corridor duration, bounded estimate, or nothing. This feeds (a) display ("Travel time unavailable" when absent) and (b) **duration filtering, which runs only when the user explicitly selects a duration or trip-mode constraint**. It must never gate eligibility.

Consequences:

- A destination with a valid route but **unknown duration** is mode-**eligible** and may show "Travel time unavailable" (the card copy already exists — `travelUnavailable`).
- "Any" duration selects **no duration constraint** — it must not impose the 14-hour day-trip envelope. The 14 h cap belongs exclusively to an explicit Day-trip mode selection.
- Missing duration is **never** a reason to exclude a reachable destination from a mode filter.

**Proposed canonical model:** replace the _presence gate_ with a per-destination **transport access fact** derived from three independent, evidence-bearing layers:

1. **Topology (physical)** — zone + edges + destination-level `localAccessModes` (already exists; extend from 4 records to all islands/gateway records). This answers "is this mode physically possible here?".
2. **Verified routes (registries)** — corridor/ferry/flight/hub rows with `sourceUrl` + `checkedAt`. This answers "do we have evidence of a real route?".
3. **Destination access legs (new)** — a typed record per mode: `{ access: "direct" | "gateway" | "none" | "unknown", legMode?, legTime?, fare?, sourceUrl?, checkedAt? }`, replacing the `transportOptions` value slot. "unknown" stays unknown; no value is invented.

**Eligibility contract after migration:** mode is eligible in Explore iff topology authorizes it **and** (verified route exists **or** explicit access evidence exists) — never from an unprovenanced number, and **never conditioned on a stated duration**. Shinkansen = trunk corridor + modelled last-mile leg; car = drivable + parking/access evidence; train = station/station-pair evidence. Duration display and duration/trip-mode filtering read the same access facts plus the corridor/estimate registries, but as a separate step that Explore invokes only when a duration/trip-mode constraint is active.

**Migration strategy (staged, reversible, count-compared at every step):**

1. Add the new field + schema + validators (new records only; legacy field untouched).
2. Run a one-pass evidence audit (per destination, per mode) producing the access facts; record `sourceUrl`/`checkedAt` for every non-"unknown" value; keep "unknown" wherever evidence is absent. Duration facts are recorded **separately** (same audit, distinct field), never folded into eligibility.
3. Flip `getValidModes` train/car reads to the new field behind a runtime flag; run the audit harness (this report's harness) before/after and compare per-mode counts per origin — the delta is the documented effect. In the same flip, **remove the duration gate from the mode-selection path**: `getValidModes` stops consulting `matchesPersonalizedDayTripDuration`; eligibility = topology ∧ route/access evidence only.
4. Route duration resolution (`getOriginAwareTransportEstimate` / `SafeGroundEstimateService`) moves to display + explicit duration/trip-mode filtering; "Travel time unavailable" is the honest display state when it returns nothing. "Any" duration runs no duration filter.
5. Retire `transportOptions` presence reads once counts are stable; then clean the legacy values (demote to display-only provenance or delete).
6. Ship per-region batches (Kanto → Kansai → Tohoku → rest), each with the harness output attached.

Ownership: KAI-63 owns the schema/flag/validators and the resolver flip (steps 1, 3, 4); KAI-12/KAI-87 own the evidence audit per region (step 2/6). No PR should bulk-edit `transportOptions` directly.

---

## 5. Product recommendation — Explore mode semantics (explicit answers)

1. **Local Train should mean:** "this destination is **reachable** from the selected origin by a conventional-rail trip" — a **reachability/route claim** backed by topology + route/access evidence, not "the place has a station". It must require the same corridor/access-evidence bar as Shinkansen (fixes D3/D6). Duration is a **separate display fact**: a reachable destination with unknown duration stays train-eligible and shows "Travel time unavailable"; it is never excluded for lacking a duration.
2. **Shinkansen should mean:** "the trunk of this trip is Shinkansen plus an explicitly modelled last-mile leg (mode, time, fare)" — the gateway model (KAI-28). Never "the city has a Shinkansen station", never a bare prefecture claim. Same duration rule as Local Train: reachability decides eligibility; duration is display + explicit duration filtering only.
3. **Mode filters should require an origin.** Without one, the current filter is silently inert (D4) — a filter that does nothing is a lie. Recommended: keep chips visible but disabled with an inline "set your origin to filter by transport" state, or auto-show the origin picker on selection. This also kills the current "no-origin shows everything" trap. (Eligibility is an origin-route claim, so an origin is a prerequisite for mode filtering.)
4. **"Any" duration imposes no hidden cap, and duration never gates mode eligibility.** The 14 h envelope belongs exclusively to an explicit Day-trip mode selection; the Day-trip toggle is the user's opt-in to duration filtering. With "Any" selected, a reachable destination of any trip length stays in results (its duration row may read "Travel time unavailable"). Recommended: remove `matchesPersonalizedDayTripDuration` from the mode-selection path entirely; run duration/feasibility evaluation only when the user explicitly picks a duration or trip mode.
5. **Personal Car and Rental Car should become one "Car" filter now.** They are identical in every code path and dataset; two chips with identical results mislead. Keep `carOwnership` as a personalization input (it already only hides chips), and split the filters again **only** when per-destination rental availability / island rental access / one-way feasibility data exists (D11).
6. **Ferry should remain non-selectable until multimodal journeys exist.** A ferry filter today would either exclude everything (300 km catchment, day-trip cap) or misrepresent rail-less ferry trips. Keep ferry as a trip feature (badges, details rows, weekend/ALL_PUBLIC_MODES fallback) and introduce the chip together with the rail→port→ferry access-leg model (D10, KAI-27/28). Do not ship a half-ferry chip.

---

## 6. Reclassification of proposed work

### A. Immediate correctness bugs (fix first; P0)

- **D1** — URL transport-state validation (ferry/junk modes; "Any transport" mislabel; ferry chip or rejection). _KAI-63._
- **D7a / D7b** — flight estimator: nearest in-zone airport fallback; zone-filter candidates before the limit-3 truncation (KOJ from Fukuoka). _KAI-63 logic + KAI-12 data._

### B. Resolver/product-semantic changes (P1)

- **D3** — unified eligibility gate (retire the presence gate; canonical access facts). _KAI-63._
- **D4** — decouple reachability from duration: mode eligibility = topology ∧ route/access evidence only (no duration requirement); duration resolution moves to display + explicit duration/trip-mode filtering; "any" imposes no 14 h cap; unknown-duration destinations stay eligible and show "Travel time unavailable". _KAI-63._
- **D11** — merge Personal/Rental into one Car filter (product decision). _KAI-63._
- **D10e** — ferry chip decision deferred to the multimodal model. _KAI-63 product._

### C. Verified registry expansion (P1, data)

- **D5** — Shinkansen hubs/rows: Utsunomiya, Takasaki, Shin-Yamaguchi, Nishi-Kyushu; Kanazawa/Toyama wiring + `municipalityId`s; optional intra-zone rows. _KAI-12._
- **D6** — train corridors from non-hub origin prefectures (kanagawa→kyoto/osaka/aichi/shizuoka/nagano/tochigi/gunma/chiba/saitama/ibaraki/miyagi, …) with sourceUrl/checkedAt. _KAI-12._
- **D8** — HND→SDJ (+ provenance). _KAI-12._
- **D10a/b** — sakurajima zone-pair row; hokkaido/yakushima/amami/okinawa-main ferry services. _KAI-27._

### D. Destination-data cleanup (P1/P2, data)

- **D2** — metadata repopulation through the canonical access-fact path (never bulk backfill; per-region evidence audits). _KAI-87 + KAI-12 evidence._
- **D9** — zone assignment for the 14 unknown-zone records (Miyajima cluster, Amami, 7 new collection islands). _KAI-28._
- **D12** — remove fabricated island transport values; revisit the `okinawa-main` `train` localMode (Yui Rail). _KAI-87._
- **D13** — validators: key membership, rail-less-zone rules, value sanity. _KAI-63/KAI-87._

### E. Longer-term multimodal modelling (P2)

- **D10c/d** — rail→port→ferry access legs; origin-port catchment rework; seasonal ferry surfacing. _KAI-27/28._
- **D14** — access-leg fares and gateway-specific fares (endpoint fare no longer attached to catchment trips). _KAI-28._
- **D11-future** — rental-availability model (island rentals, one-way feasibility) if the split is ever reintroduced. _New ticket._

---

## H/I. Contradictions and geography (updated, f468a26d)

**Contradictions:** authorization layer 49; **full gate 151** — dominated by `shinkansen=true train=false` (Kansai/Tohoku/Kyushu/Aichi via corridors while conventional rail is unprovable from a Kanagawa origin; D6). Same representative rows as revision 1 plus the new collection records (e.g. abeno-harukas, akiu-onsen). No confirmed false-positive coverage; `nabana-no-sato` (Mie, via Nagoya hub) is a valid gateway case, not a defect.

**Full-gate geography (Yokohama origin):**

| Region   | Total | Train | Shinkansen | Car | Flight |
| -------- | ----- | ----- | ---------- | --- | ------ |
| Kanto    | 281   | 244   | 3          | 43  | 0      |
| Chubu    | 118   | 16    | 31         | 9   | 0      |
| Kansai   | 144   | 0     | 53         | 0   | 0      |
| Chugoku  | 76    | 0     | 6          | 0   | 29     |
| Tohoku   | 102   | 0     | 44         | 0   | 0      |
| Shikoku  | 63    | 0     | 0          | 0   | 49     |
| Kyushu   | 131   | 0     | 15         | 0   | 96     |
| Hokkaido | 40    | 0     | 0          | 0   | 21     |
| Okinawa  | 28    | 0     | 0          | 0   | 19     |

Prefectures with **zero non-bus visibility from a Tokyo-area origin:** Wakayama 18/18, Yamaguchi 13/13, Fukui 6/6 (Tottori has 1 flight, Toyama 2 shinkansen, Mie 1 shinkansen — all new records). Per-prefecture table in the harness output (`fullgate-geography.test.ts`).

**Destination-type:** city 120/124 train · 35 car; wards 23/23 train · **0/23 car**; museum 131/141 train · 32 car; `(none)` 141/154 train · 79 car; island 2/10 train · 2/10 car · 1/10 flight · 1/10 ferry (auth layer, Yokohama). New collection records are overwhelmingly nature/historic/`(none)`-kind with sparse car/train metadata.

---

## J. Priority recap (corrected)

- **P0 (immediate correctness):** D1, D7a, D7b — all KAI-63-scoped logic; small and self-contained.
- **P1 (semantics + registry):** D3, D4, D11, D10e (KAI-63 product/resolver); D5, D6, D8 (KAI-12); D10a/b (KAI-27); D9 (KAI-28).
- **P2 (data + long-term):** D2, D12, D13 (KAI-87/KAI-63 validators); D10c/d, D14, D11-future (KAI-27/28 + new).

---

## Final statement (corrected)

- **Baseline:** origin/main @ f468a26d (983 records). The original 800-record audit was run on a stale checkout and is withdrawn; every count above was reproduced against f468a26d in a clean worktree.
- **Modes fully audited:** Local train, Shinkansen, Personal car, Rental car, Ferry, Air (plus stray `walk` keys — not a mode).
- **Destinations screened:** 983/983, per mode per origin (5 origins + no-origin); 14 manually traced clusters.
- **Current counts:** catalogue 983; unfiltered 983; Yokohama full gate train 260 · shinkansen 152 · car 52 · rental 52 · flight 214 · ferry 0 (authorization layer 711 / 229 / 281 / 281 / 279 / 3).
- **Root causes:** D2 legacy gate, D4 estimate-collapse, D5/D6 registry gaps, D9 island zones, D11 car identity, D10 ferry model, D1 state defect.
- **Confirmed defects:** 3 code/state (D1, D7a, D7b) + 2 data inconsistencies (D10a, D12); 14 root-cause families total (D1–D14).
- **Genuine data gaps:** 190 empty / 218 train / 609 car metadata records; 641 Shinkansen routes; train corridors from non-hub origins; HND→SDJ; 4 ferry zone-pair services; 14 unknown-zone records.
- **First fix:** **D1** — validate/scope the URL transport state (ferry/junk `mode` with zero visible chips and an "Any transport" label). KAI-63-scoped, small, and the only change that makes filters visibly lie.

---

# Phase 2 — Implementation Status (2026-08-13)

**Status of the D-item backlog after the KAI-63 implementation phase.** Six PRs (#164, #168–#172); measured on integration trees (origin/main @ 21f6b3ae + the KAI-63 branches merged cleanly — no conflicts; #164 re-verified against the full six-branch stack on origin/main @ c836b364). Note: origin/main advanced to c836b364 (KAI-87 PRs #165–#167, catalogue dedup 983→978); #171 and #164 were rebased onto it; all six are mergeable with green CI.

## Implemented (by PR)

| PR   | Branch                                      | D-items              | Change                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #168 | fix/kai-63-flight-airport-fallback          | D7a, D7b             | Flight eligibility prefers in-zone airports (zone-filter before the limit-3 truncation; KOJ restored from Fukuoka).                                                                                                                                                                                                             |
| #169 | fix/kai-63-single-car-filter                | D11                  | One Explore Car chip; the underlying mode follows the user's car-ownership preference — rental (fee-inclusive budget) when the profile says rental, otherwise personal `my_car` (tolls/fuel only), with `all`/unknown deliberately falling back to `my_car`. No `mode=car` URL contract; URL keeps `mode=my_car`/`mode=rental`. |
| #170 | fix/kai-63-duration-independent-eligibility | D4                   | Duration evidence decoupled from mode eligibility: "Any" duration = reachability only; day-trip envelope applies only under an explicit duration/trip-mode selection.                                                                                                                                                           |
| #171 | data/kai-63-island-transport-validators     | D12, D13 (part)      | KAI-87's catalogue merges absorbed most of the phase-1 island cleanup (their ferry-only values are canonical); this PR's data change is the remaining fabricated `car: 240` on sado-island, plus the truthfulness validators (canonical keys, rail-less island rules, car-excluded zones, same-zone localAccessModes contract). |
| #172 | data/kai-63-corridor-coverage               | D5 (part), D6 (part) | 4 Shinkansen hubs (Utsunomiya, Takasaki, Shin-Yamaguchi, Shin-Tosu) + 4 corridor rows + 3 wirings within the 30 km access catchment; 3 verified Kanagawa train corridors (kanagawa→aichi/kyoto/osaka, navitime/yahoo sources).                                                                                                  |

Final-head state after review: #168 body corrected to the null-when-no-in-zone-airport semantics; #169 pins the ownership-driven mode mapping and rental-vs-personal budget split; #170 mirrors Explore's duration gate (explicit `tripMode=day_trip` applies the day-trip envelope even with duration `any`; absent both → reachability only) with three pipeline-level regression cases; #171 scopes `V-LOCAL-ACCESS` to the same-zone contract (a record's `localAccessModes` can never grant a mode its zone lacks; cross-zone `transportOptions` claims are not policed) and corrects the sado record (the rebase onto c836b364 also regenerated 10 generated files to align KAI-87's stale outputs with their own 978-record index); #172 updates the day-trip ranking pin to acknowledge verified Tochigi Shinkansen coverage (Utsunomiya ranks #1–2 from a Kanagawa origin) and adds semantic corridor/hub tests.

(PR #164 — D1 URL transport-state validation — from the earlier phase was rebased onto the finalized transport state; it remains compatible with the single Car-chip contract and is mergeable.)

## Final integrated counts (Yokohama origin, "Any" duration = post-D4 eligibility)

Measured on the integration tree via `getValidModes` (the Explore "Any" gate):

| Mode          | Before (f468a26d full gate) | After (integrated)                                                           |
| ------------- | --------------------------- | ---------------------------------------------------------------------------- |
| train         | 260                         | **709** (metadata-present + corridor; D6 rows add Kyoto/Osaka/Nagoya)        |
| shinkansen    | 152                         | **234** (D5 hubs/wirings; Nikko/Ashikaga remain outside the 30 km catchment) |
| car (unified) | 52 / 52                     | **281** (D4: no duration cap)                                                |
| flight        | 214                         | **308** (D7 in-zone preference)                                              |
| ferry         | 0                           | **3** (unchanged; no ferry chip, day-trip-impossible from Yokohama)          |

Other origins (integrated): Osaka train 709 · shinkansen 312 · car 281 · flight 125 · ferry 2; Fukuoka train 631 · shinkansen 319 · car 233 · flight 518 · ferry 27; Sapporo train 577 · shinkansen 0 · car 1 · flight 612 · ferry 0; Takamatsu train 611 · shinkansen 0 · car 275 · flight 303 · ferry 2.

## Remaining (not implemented this phase)

- **D2** — legacy `transportOptions` presence gate migration to canonical access facts (KAI-87/KAI-12 evidence audit; no bulk backfill).
- **D3** — full unified eligibility gate (partially addressed by D4; the presence gate still exists).
- **D5** — Nishi-Kyushu hub; Kanazawa/Toyama `municipalityId` wiring; intra-zone Shinkansen rows.
- **D6** — train corridors from other non-hub origin prefectures (saitama/chiba/ibaraki/miyagi/…).
- **D8** — HND→SDJ arrival routes (all 102 Tohoku records still flight-invisible from Tokyo).
- **D9** — 14 unknown-zone records (Miyajima ×6, Amami, Rishiri-Rebun-Sarobetsu, Kerama, Iki-Tsushima, Koshikijima, Shodoshima, Inujima, Ogijima).
- **D10** — ferry model: sakurajima zone-pair row; hokkaido/yakushima/amami/okinawa-main services; rail→port→ferry legs; seasonal surfacing; ferry chip decision.
- **D13** — remaining validator families (value sanity for estimated minutes, fare provenance).
- **D14** — gateway fare provenance (corridor-endpoint fare on catchment trips).
- **Access-leg model** (KAI-28) — required for Nikko/Ashikaga Shinkansen access (34–40 km from hubs, outside the 30 km catchment) and for multimodal ferry trips.

## Verification

- `npm run verify:pr` green on final heads: #164 (152 files / 1972 tests), #168 (150 files / 1947 tests), #169 (1946), #170 (1945), #172 (1946+). #171 gates green: sync-destination-details, check:catalog-sync, validate-destinations (0 errors), check:catalog-ci, transport-truthfulness tests.
- CI: all jobs green on final heads for all six PRs (#164, #168–#172), including E2E.
- Integration tree: all six branches merge cleanly onto the base (21f6b3ae and, for the rebased pair, c836b364); no cross-branch conflicts; combined critical suites green.
