# KAI-258B — Gunma P0 anchor/depth

## Evidence / duplicate / overlap matrix

The Gunma P0 matrix was completed against the post-KAI-258A catalogue and reconciled with the fully read KAI-177 issue before mutation. KAI-177 has six overlapping Gunma P0 identities; those shared P0 surfaces are implemented here so the stack has one canonical owner. No unrelated KAI-177 work is copied into this PR.

| Candidate                                    | Current catalogue evidence                                                   | Decision | Canonical relationship                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| Yubatake / 湯畑                              | Only nested in `gunma-kusatsu-onsen` and `kusatsu-town` prose/highlights     | ADD      | child of `kusatsu-town`                                     |
| Sainokawara Park / 西の河原公園              | Only nested in the same Kusatsu aggregate prose                              | ADD      | child of `kusatsu-town`                                     |
| Mount Tanigawa / 谷川岳                      | Only Minakami prose mentions Tanigawa Ropeway; operator identity is distinct | ADD      | child of `minakami-town`; related to Takaragawa             |
| Takaragawa Onsen Osenkaku / 宝川温泉 汪泉閣  | No record, alias, or direct mention                                          | ADD      | child of `minakami-town`; related to Mount Tanigawa         |
| Lake Haruna / 榛名湖                         | Ikaho prose mentions Mount Haruna, not the lake identity                     | ADD      | standalone `Gunma:takasaki`; related to Haruna Shrine       |
| Haruna Shrine / 榛名神社                     | No record or alias                                                           | ADD      | standalone `Gunma:takasaki`; related to Lake Haruna         |
| Lake Okushima / 奥四万湖                     | Only nested as a Shima Onsen highlight                                       | ADD      | standalone `Gunma:nakanojo`; related to `gunma-shima-onsen` |
| Fukiware Falls / 吹割の滝                    | No record or alias                                                           | ADD      | standalone `Gunma:numata`                                   |
| Usui Third Bridge / 碓氷第三橋梁（めがね橋） | No record; qualified identity avoids the existing Nagasaki Megane Bridge     | ADD      | standalone `Gunma:annaka`                                   |
| Shorinzan Darumaji / 少林山達磨寺            | No record or alias                                                           | ADD      | standalone `Gunma:takasaki`                                 |
| Onioshidashi Park / 鬼押出し園               | No record; distinct from Kusatsu                                             | ADD      | standalone `Gunma:tsumagoi`                                 |

KAI-177 overlap ownership: Mount Tanigawa, Lake Haruna, Haruna Shrine, Fukiware Falls, Usui Third Bridge, and Shorinzan Darumaji. KAI-258-only P0 additions: Yubatake, Sainokawara Park, Takaragawa Onsen Osenkaku, Lake Okushima, and Onioshidashi Park.

## Enrichment / relationship fixes

- `kusatsu-yubatake` and `sainokawara-park` use parent links to `kusatsu-town`, preserving the existing hub's frozen Wikipedia input while deepening the hub through canonical children.
- `mt-tanigawa` and `takaragawa-onsen` use parent links to `minakami-town`; their reciprocal relation links preserve the shared outing without mutating the hub record.
- `lake-okushima` links to `gunma-shima-onsen` from the new record without falsely making the existing onsen record its parent.
- Lake Haruna and Haruna Shrine are reciprocal related records, not parent/child records, because no Takasaki hub exists.
- The Yubatake map anchor is kept inside the OSM feature bounds but offset from the existing aggregate's rounded coordinate, avoiding a false duplicate-coordinate warning.
- No generic `meganebashi` ID was used; the Annaka record is qualified as `usui-third-bridge`.

## Deferred / rejected decisions

- No Gunma P0 identity was rejected after evidence review.
- Netsunoyu, Ikaho Stone Steps, and Kajika Bridge remain **ENRICH** candidates for the existing Kusatsu/Ikaho records or a later sibling decision; no duplicate shells were created in this P0 PR.
- Lake Shima, Byakue Dai-Kannon, Mt. Myogi, Myogi Shrine, Usui Pass Railway Heritage Park, Oigami Onsen, Manza Onsen, Mt. Akagi, Lake Onuma, Akagi Shrine, and Watarase Keikoku Railway remain deferred to KAI-258D.
- Existing unrelated `nearbyDestinationIds` on Kusatsu and Minakami were not repaired here; that is a separate relationship-fix scope.
- No merge was performed.

## PR metadata

- Issue: KAI-258
- Branch: `data/kai-258b-gunma-p0-anchor-depth`
- Base branch: `data/kai-258a-nagano-p0-anchor-depth`
- Base head: `ce51de8bd0bd664207727e4afbc7c31cb88b8bf4`
- Commit: `1de540b605df5c01d8592287d9896c7121726dd5`
- Pull request: to be filled after push/open
- Merge status: **STOPPED — not merged**

## Before / after counts

| Measure                                        | Before (PR1 head) | After | Delta |
| ---------------------------------------------- | ----------------: | ----: | ----: |
| Total catalogue records                        |             1,070 | 1,081 |   +11 |
| Gunma records                                  |                10 |    21 |   +11 |
| Existing Kusatsu featured children (preserved) |                 1 |     1 |     0 |
| Parent-linked Kusatsu P0 children              |                 0 |     2 |    +2 |
| Parent-linked Minakami P0 children             |                 0 |     2 |    +2 |
| Lake Okushima related IDs                      |                 0 |     1 |    +1 |
| Recommendation-eligible records                |             1,069 | 1,080 |   +11 |

## Verification

- Read-only KAI-177 overlap reconciliation completed before Gunma mutation.
- `scripts/kai-258b-gunma-p0.ts`: passed; repeated run reports zero new records and preserves identities/relationships.
- `npm run validate:catalog-fast`: passed, 0 errors.
- `npm run validate-relationships`: passed, 0 errors; existing municipality warnings only.
- `npm run validate:images:changed`: passed, 30 changed destinations in cumulative stack scope, 0 issues.
- `npm run check:catalog-ci`: passed with no new warning identity.
- `npm run check:catalog-sync`: passed; second generation produced zero diff.
- `npm run derive:destination-models -- --check`: passed.
- `npm run audit:kai-89-structured-templates`: passed with no structural errors.
- Targeted Gunma/catalogue tests: 135 passed across 11 files.
- Full Vitest suite: 271 files passed; 3,273 passed and 2 skipped tests.
- `npm run build`: passed; 1,081 canonical destinations indexed and 2,166 SEO outputs generated.
- PWA-focused E2E against the PR2 production preview: 19 lazy-catalogue/homepage tests passed on mobile, plus 27 data-safety tests passed on mobile and 27 on desktop (73 total).

## Scope boundary

This PR does not implement Nagano P1, Gunma P1/secondary depth, the unrelated KAI-177 remainder, broad nearby-link cleanup, or any merge.
