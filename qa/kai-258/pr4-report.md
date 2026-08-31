# KAI-258D — Gunma secondary depth and hub-depth integrity

## PR metadata

- Issue: KAI-258
- Branch: `data/kai-258d-gunma-p1-depth-integrity`
- Base branch: `data/kai-258c-nagano-p1-hub-completion`
- Base head: `88ed952fd20d58bd6c2522fc2f0fee0f810ccf68` (KAI-258C head)
- Commit: `to be filled after the verified commit`
- Pull request: `to be filled after push/open`
- Merge: **not performed**

## Candidate matrix

| Candidate                       | Decision | Current identity / relationship decision                                                                                                         |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Netsunoyu                       | DEFER    | Adjacent to Yubatake; current coarse coordinate grid would create a false duplicate without an independently verified finer anchor.              |
| Doai Station                    | ADD      | New Minakami railway-heritage POI; parent-linked to `minakami-town`.                                                                             |
| Ikaho Stone Steps               | ADD      | New Shibukawa historic-street destination; related to existing Ikaho onsen record.                                                               |
| Kajika Bridge                   | DEFER    | Official image exists, but its host is outside the repository image allowlist; no independent canonical Commons image was promoted in this pass. |
| Lake Shima                      | DEFER    | Official image exists, but its host is outside the repository image allowlist; no independent canonical Commons image was promoted in this pass. |
| Byakue Dai-Kannon               | DEFER    | Official image exists, but its host is outside the repository image allowlist; no independent canonical Commons image was promoted in this pass. |
| Mount Myogi                     | ADD      | New western-Gunma mountain destination; related to the broader Myogi-Arafune record and its shrine.                                              |
| Myogi Shrine                    | ADD      | New cultural destination; related to Mount Myogi, not a duplicate mountain shell.                                                                |
| Usui Pass Railway Heritage Park | ADD      | New Annaka railway-heritage destination.                                                                                                         |
| Oigami Onsen                    | ADD      | New Numata hot-spring destination; distinct from Kusatsu/Shima.                                                                                  |
| Manza Onsen                     | ADD      | New Tsumagoi highland hot-spring destination.                                                                                                    |
| Mount Akagi                     | ADD      | New Maebashi mountain destination; related to Lake Onuma and Akagi Shrine.                                                                       |
| Lake Onuma                      | ADD      | New concrete Mount Akagi nature destination; related to the mountain and shrine.                                                                 |
| Akagi Shrine                    | ADD      | New lakeside cultural destination; related to Mount Akagi and Lake Onuma.                                                                        |
| Watarase Keikoku Railway        | ADD      | New Kiryu-area railway-and-landscape destination.                                                                                                |

No candidate was rejected. The four DEFER decisions remain explicit and are not represented by shallow placeholder records.

## Mutations

- Promoted 11 secondary Gunma records with complete EN/JA copy, identity aliases, coordinates, official evidence, image provenance, explicit unknown cost/transport states, and deterministic model metadata.
- Preserved existing hub records rather than rewriting frozen Wikipedia-phase inputs. Parent/related links are carried by the new records.
- Removed the coarse-grid collision by deferring Netsunoyu and returned Yubatake to its KAI-258B canonical anchor.
- Preserved `obuse-town` as a verified hub without a misleading lifecycle/status mismatch while retaining its evidence and child links.
- Regenerated canonical detail files, lite/meta indexes, relationship index, and structured-template audit output.

## Before / after counts

| Metric                                            | Before (PR3 tip) | After | Delta |
| ------------------------------------------------- | ---------------: | ----: | ----: |
| Total canonical destinations                      |            1,096 | 1,107 |   +11 |
| Gunma destinations                                |               21 |    32 |   +11 |
| `placeType: destination` records                  |              933 |   944 |   +11 |
| Recommendation-eligible destination index entries |            1,095 | 1,106 |   +11 |
| Explicit budget-unknown records                   |              501 |   512 |   +11 |
| Minakami parent-linked secondary children         |                2 |     3 |    +1 |
| Akagi related destination records                 |                0 |     3 |    +3 |

## Verification

- Authoring script is idempotent: second run reports zero promoted records and leaves the catalogue stable.
- `npm run validate:catalog-fast`: passed, 0 errors.
- `npm run check:catalog-ci`: passed; 0 audit errors and no new warning identities.
- `npm run validate:images:changed`: passed, 56 checked, 0 issues.
- `npm run check:catalog-sync`: passed; generated output is byte-identical and idempotent.
- `npm run derive:destination-models -- --check`: passed.
- Japanese taxonomy coverage: passed.
- `npx tsc -b --noEmit`, `npm run lint`, `npm run format:check`: passed.
- Full Vitest suite: 271 files passed; 3,273 passed and 2 skipped tests.
- Production build and SEO check: 2,218 outputs generated and checked; 1,107 canonical destinations indexed.
- PWA-focused E2E against the PR4 production preview: 19 lazy-catalogue/homepage tests passed on mobile, plus 27 data-safety tests passed on mobile and 27 on desktop (73 total).

## Final stack audit

The final audit will verify exact ancestry `main → KAI-258A → KAI-258B → KAI-258C → KAI-258D`, exact remote heads, generated-file parity, relationship integrity, representative EN/JA recommendations, and that all four PRs remain open/unmerged.
