## Precise summary

- **Outcome:** Bus eligibility is now correct and explainable nationwide. Two
  root-cause bugs fixed (Iwakuni postcode zone mis-resolution; Naha zero-result
  bus availability), one latent night-only gate gap hardened, verified Okinawa
  bus data added, and a reproducible nationwide audit + regression suite
  (unit, jsdom, and Playwright) established.
- **User-visible changes:**
  - Naha postcode 900-8585 (and Okinawa City) Explore Bus results: **0 → 9**
    (Nago/Motobu/Onna destinations via the verified 111/117 高速バス; Naha-city
    POIs stay origin-local; mainland and outer islands stay 0 — island topology
    unchanged).
  - Iwakuni postcode/coordinate origins: Bus results **0 → 32** (was
    mis-resolved to Shikoku → zero bus reachable; now mainland-honshu, reaches
    the Hiroshima hub ~33 km — identical to station-origin results).
  - Destination detail: Kouri Island from Naha now shows a real bus estimate
    ("Travel Time Bus ~2h17m", intercity-fare-only note) instead of the
    route-known-but-unestimated copy.
- **Technical changes:**
  - `TransportTopologyService.ts`: new `YAMAGUCHI_HONSHU_EXCLUSION_BOX`
    (lat 33.8–34.2, lng 132.2–132.45 → mainland-honshu) checked before the
    shikoku box. The band is deliberately narrow in longitude so it can never
    swallow Ehime islands: its east edge (132.45) keeps every Matsuyama City
    Seto island (Nakajima ~33.97/132.61, Tsuwajima ~33.99/132.67, the Kutsuna
    group) out — they still resolve as mainland-shikoku. Only the Iwakuni
    landmass + Suo-Oshima (Yamaguchi) are overridden. (Review fix: the first
    revision's wider box would have mis-classified Nakajima/Ehime as Honshu;
    Nakajima + Tsuwajima regressions added.)
  - `TripDurationService.ts`: the `any`-duration gate for records without
    `recommendedVisitHours` now rejects night-only bus estimates (KAI-66 gate
    applies to every day-trip record).
  - `bus-routes.json`: +1 verified row `naha⇔nago` (111/117 高速バス,
    95–112 min, day; operator: Ryukyu Bus / Okinawa Bus / Naha Bus / Toyo Bus).
    Fare ¥2,420 那覇BT⇔名護BT fixed, sourced from the **current** official
    沖縄バス fare table (April 2024 revision, linked from the operator's
    令和6年4月1日 fare-change notice) — not a stale 2022 PDF.
  - `BusRouteEstimator.ts`: +`naha`/`nago` terminals; +`Okinawa:naha`/
    `Okinawa:nago` municipality wiring.
- **Data impact:** 1 new corridor row, 2 new terminals, 2 municipality
  mappings. No catalogue destination changes.
- **Recommendation/transport impact:** Bus eligibility changes only for
  Okinawa-local origins (0→9) and Iwakuni postcode origins (0→32); all other
  audited origins unchanged. No topology changes: no mainland bus to Okinawa,
  no island corridors, no generic fallbacks, no fabricated routes.
- **URL/persistence impact:** none.
- **Localization impact:** none (no user-facing strings changed).
- **Validation:** see below.
- **Known limitations:** local/airport-bus semantics remain KAI-67 (same-city
  POI asymmetry is a documented product tradeoff of the intercity-only model).
  Seto islands east of the Yamaguchi band (Kurahashi-jima, Onomichi/Imabari
  archipelago) keep the pre-existing shikoku-box resolution for coordinate
  origins — catalogue destinations are unaffected (prefecture metadata).

## Before/after Bus counts (audited example origins, main head, 983-dest catalogue)

| Origin | Before | After | Cause |
|---|---|---|---|
| Yokohama / Machida / Nakayama / Chiba | 10 | 10 | unchanged (QA numbers reproduced) |
| Fukushima | 23 | 23 | unchanged |
| Shinagawa | 13 | 13 | unchanged (QA "14" = coord choice) |
| Nagano | 31 | 31 | unchanged |
| Osaka | 49 | 49 | unchanged |
| Hiroshima | 91 | 91 | unchanged |
| **Iwakuni (postcode/coords)** | **0** | **32** | origin zone mis-resolution (station origins were already 32) |
| Hakata | 29 | 29 | unchanged |
| **Naha 900-8585** | **0** | **9** | missing Okinawa terminals/corridor |

The ticket's QA example counts were reproduced exactly on the main catalogue
(station origins): 10/23/31/49/91/32/29, and Naha postcode 900-8585 = 0 pre-fix
(9 post-fix). Every exclusion is classified by reason (topology exclusion /
terminal catchment / no verified corridor / highway-bus gap / local-bus gap /
origin-resolution issue / duration-fare evidence gap) in the committed audit:
`qa/kai-63/FINAL_BUS_AUDIT.md`, reproducible via `qa/kai-63/bus-audit.test.tsx`,
`bus-corridor-decomposition.test.ts` (all 35 origins), `bus-divergence.test.ts`.

## Linear

KAI-63

## Scope

### Included
- Full bus eligibility pipeline audit (origin resolution → corridor registry →
  Explore filtering), documented and committed in `qa/kai-63/`.
- Nationwide origin matrix (35 origins) with UI counts and exclusion-reason
  decomposition.
- Fixes: Iwakuni zone resolution (Ehime-island-safe), Okinawa terminals +
  verified corridor with current fare evidence, night-only `any`-gate
  hardening.
- Regression coverage: unit topology/estimate/authorization tests, jsdom
  Explore tests, and a real Playwright Bus-filter spec (Naha 900-8585,
  Iwakuni postcode, Nakayama/Yokohama stations, no mainland↔Okinawa cards).

### Not included
- KAI-67 highway/local/airport bus separation.
- Large-scale corridor expansion (scoped follow-up dataset listed in audit §6 —
  real, operator-verifiable routes; not fabricated here).
- Changes to the 14 destination-zone-unknown catalogue records.

## Validation

- [x] Unit + jsdom: transport topology, origin-aware estimates,
  TripDurationService, destination-detail transport, Explore bus eligibility,
  transport authorization, registry invariants, scripts/validators — green.
- [x] Full Vitest on PR base (main, 983-dest catalogue): **150 files,
  1939 passed, 1 skipped**.
- [x] Playwright (`npm run test:e2e` — existing repo setup): new
  `e2e/kai-63-bus-eligibility.spec.ts`, 4 tests × chromium desktop + mobile
  (Naha 9 / Iwakuni 32 / Nakayama 10 / Yokohama 10, no mainland↔Okinawa) —
  green locally; runs in the E2E CI job.
- [x] `npx tsc -b --noEmit`
- [x] `npm run lint`
- [x] `npm run format:check`
- [x] `npm run validate:i18n`, `npm run check:branding`
- [x] `npm run validate:catalog-fast`
- [x] `npm run build`

## Risks / rollback

- Small, additive data change (1 row) + two logic guards + one narrow box
  constant. Rollback = revert commit. No topology, RLS, or user-data impact.
- Boundary-box change risk mitigated by +7 honshu / +5 shikoku-negative tests
  (incl. Nakajima/Tsuwajima Ehime-island regressions).

## Follow-up

- Corridor expansion candidates with primary-source verification (audit §6).
- KAI-67 local/airport bus semantics.
- Coordinate-only zone resolution for the remaining Seto archipelago
  (Kurahashi-jima, Onomichi/Imabari islands) — pre-existing, documented.
