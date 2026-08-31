# KAI-258C — Nagano secondary hub completion

## PR metadata

- Issue: KAI-258
- Branch: `data/kai-258c-nagano-p1-hub-completion`
- Base branch: `data/kai-258b-gunma-p0-anchor-depth`
- Base head: `f2cf9d3c5d0f92a888f5a1688cb74427c394bf74` (KAI-258B head)
- Commit: `88ed952fd20d58bd6c2522fc2f0fee0f810ccf68`
- Pull request: [#296](https://github.com/anee5h/trip-planner/pull/296)
- Merge status: **STOPPED — not merged**

## Evidence / duplicate / relationship matrix

The matrix was checked against the current post-KAI-258B catalogue. Existing hub shells were preserved; children use canonical parent links where a verified hub exists, and related links otherwise.

| Candidate                 | Decision                | Evidence / identity decision                                                                            |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Former Mikasa Hotel       | ADD + parent link       | Karuizawa Tourism Association; separate preserved hotel identity, not the Karuizawa Town shell.         |
| Kagami Pond               | ADD + related link      | Togakushi Tourism Association; distinct lake identity, related to Togakushi Shrine.                     |
| Shibu Onsen               | ADD                     | Official Shibu Onsen site; settlement identity is distinct from Shiga Kogen.                            |
| Shiga Kogen               | ADD                     | Official Shiga Kogen site; broad highland identity, not a Shibu Onsen duplicate.                        |
| Nakamachi/Nawate Streets  | ADD as one cluster      | Matsumoto Tourism Association; combined street-walk record avoids two shallow shells.                   |
| Utsukushigahara Highlands | ADD                     | Utsukushigahara Tourism Association; broad plateau record anchored to the mapped highland access point. |
| Anrakuji Temple           | ADD                     | Bessho Onsen Tourism Association; separate temple/pagoda identity.                                      |
| Kitamuki Kannon           | ADD                     | Bessho Onsen Tourism Association; related temple identity, not an Anrakuji duplicate.                   |
| Yanagimachi Street        | ADD                     | Ueda Tourism Association; separate historic-street identity.                                            |
| Kirigamine Highlands      | ADD                     | Suwa Tourism Association; distinct highland nature destination.                                         |
| Yashimagahara Wetland     | ADD                     | Shimosuwa Tourism Association; distinct wetland, related to Kirigamine.                                 |
| Lake Shirakaba            | ADD                     | Lake Shirakaba Tourism Association; separate lake/resort identity.                                      |
| Star Village Achi         | DEFER                   | No independently verified canonical image/coordinate package was promoted in this tranche.              |
| Hirugami Onsen            | ADD                     | Official Hirugami Onsen site; concrete southern-Nagano wellness anchor.                                 |
| Hokusai Museum            | ADD + Obuse parent link | Official museum site; distinct museum identity inside the Obuse hub.                                    |
| Gansho-in Temple          | ADD + Obuse parent link | Official temple site; separate cultural identity from Hokusai Museum.                                   |
| Nezame-no-Toko            | DEFER                   | Evidence package did not clear the canonical-image/provenance gate in this tranche.                     |
| Akasawa Forest            | DEFER                   | Evidence package did not clear the canonical-image/provenance gate in this tranche.                     |
| Kiso-Fukushima            | DEFER                   | Existing Kiso Valley record remains canonical; no separately verified secondary package was promoted.   |
| Nozawa Onsen              | DEFER                   | Evidence package did not clear the canonical-image/provenance gate in this tranche.                     |

No candidate was rejected; the five deferred candidates remain explicit follow-up scope rather than being represented by duplicate shells.

## Before / after counts

| Measure                          | Before | After | Delta |
| -------------------------------- | -----: | ----: | ----: |
| Total catalogue records          |  1,081 | 1,096 |   +15 |
| Nagano records                   |     33 |    48 |   +15 |
| Destination-place records        |    918 |   933 |   +15 |
| Recommendation-eligible records  |  1,080 | 1,095 |   +15 |
| Karuizawa parent-linked children |      3 |     4 |    +1 |
| Matsumoto parent-linked children |      1 |     3 |    +2 |
| Obuse parent-linked children     |      0 |     2 |    +2 |

## Validation

- Authoring script: idempotent; second run added 0 records.
- `npm run validate:catalog-fast`: passed with 0 errors.
- `npm run validate:images:changed`: passed; 45 changed destinations in cumulative stack, 0 errors/warnings.
- `npm run validate-relationships`: passed.
- `npm run check:catalog-ci`: passed.
- `npm run check:catalog-sync`: passed.
- `npm run derive:destination-models -- --check`: passed.
- `npm run audit:kai-89-structured-templates`: passed with no structural errors.
- Targeted catalogue/localization tests: 69 passed across 9 files.
- Full Vitest suite: 271 files passed; 3,273 passed and 2 skipped tests.
- Full production build and SEO check: passed (2,196 SEO outputs; 1,096 canonical destinations).

## Scope boundary

This PR contains only Nagano secondary-hub data, canonical generated outputs, directly required localization/count-fixture updates, and the evidence/verification report. No Gunma data is introduced here, and nothing is merged.
