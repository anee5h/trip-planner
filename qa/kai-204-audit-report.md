# KAI-204 — origin-aware local fare coverage

Branch: `fix/kai-204-origin-aware-budget-coverage`

This report records the production-path audit and the verified implementation. No paid API, secret, catalogue row, or `budgetMetadata` value was changed.

## Root cause

The canonical path is:

`destination → getValidModes → getOriginAwareTransportEstimate → getEstimatedBudgetRange → getSortableVerifiedBudget`

Nakayama (`35.5147, 139.5393`) resolves to `mainland-honshu`, but its origin municipality confidence guard returns no municipality. The ground-route registry has no `kanagawa → kanagawa` local corridor, so train remains recommendation-eligible from `transportOptions` while the canonical budget estimator returned `null`. `SafeGroundEstimateService` already had a bounded same-zone duration, but it was display/day-trip evidence only and had no fare provenance.

The separate catalogue metric remains unchanged and is not conflated with trip-budget coverage:

| `budgetMetadata` method | Before | After |
| ----------------------- | -----: | ----: |
| manual                  |      6 |     6 |
| model                   |    112 |   112 |
| unknown                 |    470 |   470 |
| absent                  |    469 |   469 |
| invalid                 |      0 |     0 |
| total                   |   1057 |  1057 |

## Implementation

- Added `LocalBoundedFareEstimator.ts`.
- Applies only to conventional `train`, same resolved transport zone, coordinates present, and an authorized train mode (`transportOptions`), and straight-line distance `≤50 km`.
- Uses the existing same-mode `SafeGroundEstimateService` duration; it does not invent a station pair or route.
- Returns conservative one-way adult fare envelopes, not point fares:
  - `≤5 km`: ¥150–500
  - `≤15 km`: ¥200–800
  - `≤30 km`: ¥300–1,200
  - `≤50 km`: ¥450–1,800
- Provenance is explicit: `source=calculated_local_bounded_estimate`, `evidence=estimated`, `fareScope=local_bounded_estimate`, `fareVariability=range`, and audited operator source URLs.
- `getTransportFareScope` exposes the new scope. Affordability hard-passes accept `complete` or `local_bounded_estimate`; `corridor_only` still cannot hard-pass and is not hard-failed.
- `getSortableVerifiedBudget` keeps its existing finite sortable metric contract; unknown remains `PositiveInfinity`/unavailable.
- Destination Details now labels the new state in English and Japanese as `Local fare estimate (bounded)` / `近距離運賃の概算（範囲推定）`, rather than falsely saying intercity-only.
- Added cache hit/miss counters and a reset hook used only by the deterministic QA diagnostic. The origin context remains in the cache key, including coordinates, zone, date, season, and modes.

## Before/after production diagnostic

Command:

```bash
TSX_TSCONFIG_PATH=tsconfig.app.json \
  npx tsx scripts/qa/kai-204-budget-diagnostic.ts --json
```

Population: 1,056 recommendation-eligible destinations out of 1,057. Party size 2, standard tier, no travel date. `finiteSortable` is the existing finite trip-budget metric; `completeFareScopeFinite` is strict verified complete scope; `boundedCompleteFinite` includes the explicit local bounded scope.

| Origin         | Finite before | Finite after | Unknown before | Unknown after | Strict complete before→after | Bounded-complete after |
| -------------- | ------------: | -----------: | -------------: | ------------: | ---------------------------: | ---------------------: |
| Nakayama       |  260 (24.62%) | 352 (33.33%) |   796 (75.38%) |  704 (66.67%) |                      189→189 |                    281 |
| Tokyo Station  |  370 (35.04%) | 403 (38.16%) |   686 (64.96%) |  653 (61.84%) |                      199→199 |                    232 |
| Osaka          |  218 (20.64%) | 224 (21.21%) |   838 (79.36%) |  832 (78.79%) |                        30→30 |                     36 |
| Hakata/Fukuoka |  260 (24.62%) | 273 (25.85%) |   796 (75.38%) |  783 (74.15%) |                      209→209 |                    222 |
| Naha           |  257 (24.34%) | 257 (24.34%) |   799 (75.66%) |  799 (75.66%) |                      246→246 |                    246 |

Nakayama radius results:

| Radius  | Eligible | Before finite | After finite | After coverage |
| ------- | -------: | ------------: | -----------: | -------------: |
| ≤10 km  |        6 |             0 |            4 |         66.67% |
| ≤25 km  |      103 |             0 |           42 |         40.78% |
| ≤50 km  |      216 |             0 |           92 |         42.59% |
| ≤100 km |      287 |             8 |          100 |         34.84% |
| ≤250 km |      408 |            23 |          115 |         28.19% |

The train-priced cohort changed as follows: Nakayama `0→92`, Tokyo `18→170`, Osaka `0→136`, Fukuoka `0→28`, Naha `5→5`. This is a priced estimate only when the explicit local model applies; unsupported islands, cross-zone trips, `localAccessUnestimated`, missing coordinates, trips beyond 50 km, missing visit duration, and missing on-site budget remain unknown.

Nakayama reason-class changes (overlapping diagnostic reasons, therefore percentages do not sum to 100):

| Reason                                | Before | After |
| ------------------------------------- | -----: | ----: |
| `LOCAL_METRO_PRICING_UNSUPPORTED`     |    464 |   254 |
| `ONSITE_BUDGET_COMPONENT_UNAVAILABLE` |    587 |   587 |
| `CORRIDOR_ONLY_FARE`                  |    150 |   150 |
| `COMPLETE_BUDGET_RANGE_UNAVAILABLE`   |    263 |   381 |
| `NO_VALID_MODE`                       |    157 |   157 |
| `TOPOLOGY_DATA_GAP`                   |      8 |     8 |
| `TRANSPORT_FARE_UNAVAILABLE`          |     64 |    64 |
| `MODE_SPECIFIC_DURATION_UNAVAILABLE`  |     40 |    40 |
| `GENUINE_UNKNOWN`                     |      1 |     1 |

The increase in `COMPLETE_BUDGET_RANGE_UNAVAILABLE` is honest: local transport is now known, exposing the remaining on-site/duration blockers rather than masking them as local fare failure.

## Direct benchmark examples

- Nakayama → Yokohama Zoorasia: canonical train `[15,20]` minutes, fare `¥150–500`, local bounded scope, budget scope local bounded; sortable budget is finite.
- Nakayama → Shin-Yokohama Ramen Museum: canonical train `[19,24]`, fare `¥200–800`, local bounded scope; finite budget remains distinct from catalogue `budgetMetadata`.
- Nakayama → Minato Mirai / Red Brick / Yamashita Park: local train fare is modeled, but the destination's unknown on-site budget remains unavailable; these are not fabricated as free or sortable.
- Naha/Okinawa and Ogasawara/island cases remain governed by topology and ferry/flight rules; no local rail fallback crosses an island/major-zone boundary.

## Cache/runtime evidence

After each origin, the diagnostic resets only the QA cache hook and records production cache stats:

| Origin   |  Hits | Misses | Entries |
| -------- | ----: | -----: | ------: |
| Nakayama | 7,302 |  3,324 |   3,324 |
| Tokyo    | 7,886 |  3,324 |   3,324 |
| Osaka    | 8,292 |  3,268 |   3,268 |
| Fukuoka  | 7,764 |  3,586 |   3,586 |
| Naha     | 1,638 |    800 |     800 |

The diagnostic is disk-fixture-only and completes successfully. The existing 4,096-entry cache bound remains in force; no stale-origin reuse is possible because origin coordinates and zone remain key material. Regression tests cover changing the origin context.

The production build completed with no new dependency. Current Vite output reports main JS 407.44 kB / 115.41 kB gzip and `DestinationDetails` 124.99 kB / 32.74 kB gzip; direct `gzip -n` measurements are 407,440 / 113,702 bytes and 124,998 / 32,436 bytes respectively. The model is a small source module and adds no catalogue payload.

## Verification

Passed:

- `npx vitest run ...` targeted transport, budget, recommendation, Home, and Destination Details tests.
- Full suite with bounded workers: **242 test files passed; 2,761 tests passed; 2 skipped**.
- `npx tsc -b --noEmit`
- `npm run lint` (existing repository warnings only; exit 0)
- `npm run build`
- Two post-fix diagnostic runs plus a third stats-enabled run; metrics were stable between runs.
- Repository validation gates: `validate:i18n`, `validate:localization`, `check:branding`, `validate:catalog-fast`, `check:catalog-ci`, `seo:check`, and `verify:pages-functions` all passed; catalogue QA retained 0 errors and 780 existing warnings.
- `npm run verify:pr` reached the full test stage but was flaky under its default parallel scheduler: separate runs timed out in unrelated 15-second Explore/Home/Recommended UI tests. The same failing files passed when rerun with `--maxWorkers=1`, and the full suite passed with `--maxWorkers=2` (242 files, 2,761 tests, 2 skipped).

The PR remains intentionally unmerged; exact-head CI and remote PR status are recorded after push.
