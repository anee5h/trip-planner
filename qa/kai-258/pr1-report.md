# KAI-258A — Nagano P0 anchor/depth

## PR metadata

- Issue: KAI-258
- Branch: `data/kai-258a-nagano-p0-anchor-depth`
- Base: `main` at `85ef67400d3952c57f772b7bfcf3701e91452451`
- Commit: `c8d6402f6c8d10acfee008e8a3759ff5399c4c2e`
- Pull request: [#294](https://github.com/anee5h/trip-planner/pull/294)
- Merge status: **STOPPED — not merged**

## Scope

This PR is limited to the Nagano P0 candidate set. It adds first-class records only where the pre-mutation matrix found no canonical equivalent, and enriches existing hub rails without replacing canonical IDs or creating duplicate shells.

### Added (13)

| ID                               | Identity                                                    | Disposition | Relationship                                           |
| -------------------------------- | ----------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| `zenkoji-temple`                 | Zenko-ji Temple / 善光寺                                    | ADD         | POI child of `nagano-city`                             |
| `jigokudani-monkey-park`         | Jigokudani Monkey Park / 地獄谷野猿公苑                     | ADD         | Standalone, `Nagano:yamanouchi`                        |
| `togakushi-shrine`               | Togakushi Shrine / 戸隠神社                                 | ADD         | POI child of `nagano-city`                             |
| `kumoba-pond`                    | Kumoba Pond / 雲場池                                        | ADD         | POI child of `karuizawa-town`                          |
| `kyu-karuizawa-ginza`            | Kyu-Karuizawa Ginza / 旧軽井沢銀座                          | ADD         | POI child of `karuizawa-town`                          |
| `harunire-terrace`               | Harunire Terrace / ハルニレテラス                           | ADD         | POI child of `karuizawa-town`                          |
| `happo-pond`                     | Happo Pond / 八方池                                         | ADD         | POI child of `hakuba-village`                          |
| `hakuba-iwatake-mountain-resort` | Hakuba Iwatake Mountain Resort / 白馬岩岳マウンテンリゾート | ADD         | POI child of `hakuba-village`                          |
| `tsugaike-nature-park`           | Tsugaike Nature Park / 栂池自然園                           | ADD         | Standalone, `Nagano:otari`                             |
| `daio-wasabi-farm`               | Daio Wasabi Farm / 大王わさび農場                           | ADD         | Standalone, `Nagano:azumino`                           |
| `senjojiki-cirque`               | Senjojiki Cirque / 千畳敷カール                             | ADD         | Standalone, `Nagano:komagane`                          |
| `suwa-taisha`                    | Suwa Taisha / 諏訪大社                                      | ADD         | Multi-site standalone; no guessed parent               |
| `obuse-town`                     | Obuse Town / 小布施町                                       | ADD         | New hub, `Nagano:obuse`; P1 children reserved for PR 3 |

Every new record includes EN/JA content, aliases, official evidence, coordinate reference, canonical Commons image provenance, explicit admission state, explicit unavailable local-transport state where no fare was verified, and no fabricated opening hours, seasonality, costs, or origin travel times.

## Enrichment / relationship fixes

- `nagano-city`: featured `zenkoji-temple`, `togakushi-shrine`.
- `karuizawa-town`: featured `kumoba-pond`, `kyu-karuizawa-ginza`, `harunire-terrace`; description/highlights now expose the town as a real hub rather than a shell.
- `hakuba-village`: featured `happo-pond`, `hakuba-iwatake-mountain-resort`; description/highlights now expose concrete Hakuba depth.
- `suwa-taisha` remains unparented because the four-shrine proposition is multi-site; no false single-municipality edge was created.
- `tsugaike-nature-park` remains outside Hakuba Village because its municipality is `Nagano:otari`.
- KAI-257 relationship regression coverage now asserts the canonical Karuizawa children and still rejects peer fallback.

## Deferred / rejected decisions

- No Nagano P0 candidate was rejected after evidence review.
- No P0 candidate was deferred: all 13 were either a new canonical POI/hub or an explicit independent multi-site destination.
- Nagano P1 candidates remain deferred to KAI-258C pending their own evidence/duplicate review.
- Gunma P0/P1 candidates remain deferred to KAI-258B/D; KAI-177 overlap was read and is reconciled in the pre-mutation matrix but is not silently implemented here.

## Evidence and QA artifacts

- `qa/kai-258/pre-mutation-matrix.md` records the full current-catalogue sweep, aliases, description-only mentions, ADD decisions, relationships, and P1 deferrals.
- Primary identity sources are operator, municipal, prefectural, or official tourism pages; image sources are explicit Wikimedia Commons file pages with license/attribution metadata.
- The authoring script is `scripts/kai-258a-nagano-p0.ts`; it is collision-guarded and idempotent.
- Generated details, lite index, metadata, relationship index, KAI-89 audit, and model report are synchronized outputs.

## Before / after counts

| Measure                            | Before | After |       Delta |
| ---------------------------------- | -----: | ----: | ----------: |
| Total catalogue records            |  1,057 | 1,070 |         +13 |
| Nagano records                     |     20 |    33 |         +13 |
| Nagano City featured child POIs    |      0 |     2 |          +2 |
| Karuizawa Town featured child POIs |      0 |     3 |          +3 |
| Hakuba Village featured child POIs |      0 |     2 |          +2 |
| Obuse Town hub child POIs          |    n/a |     0 | P1 reserved |
| Recommendation-eligible records    |  1,056 | 1,069 |         +13 |

## Verification

- Authoring script: passed; second run reported 0 new records and preserved the intended identities.
- Targeted regression/data tests: **52 passed**.
- `npx tsc -b --noEmit`: passed.
- `npm run lint`: passed with pre-existing repository warnings only.
- `npm run format:check`: passed.
- `npm run validate:i18n`: passed (774 keys, 0 placeholder mismatches).
- `npm run check:branding`: passed (482 public files).
- `npm run validate:images:changed`: passed (16 changed destinations, 0 issues).
- `npm run validate:catalog-fast`: passed (0 errors; accepted repository warnings only).
- `npm run check:catalog-ci`: passed; warning baseline unchanged and generated files idempotent.
- `npm run check:catalog-sync`: passed; second generation produced zero diff.
- `npm run derive:destination-models -- --check`: passed.
- `npm run audit:kai-219`: passed with all 1,070 records explicit for admission/local transport after this PR's state authoring.
- Full Vitest suite and production build: to be filled after final pre-push run.

## Explicit boundary

This PR does not implement Gunma, Nagano P1, KAI-177's out-of-scope Maebashi/Kiryu work, any merge, or unrelated cleanup/refactoring.
