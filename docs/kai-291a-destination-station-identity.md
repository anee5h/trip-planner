# KAI-291A — destination → exact ODPT arrival-station identity (pilot)

Coverage and semantic audit for a deterministic **destination → exact ODPT
arrival-station** anchor registry over the **TokyoMetro + Toei** pilot.

**Status: audit only. The registry is NOT production-ready and no consumer exists.**
This branch carries the final anchorability policy and its evidence.

## 1. The final policy, in precedence order

```
1. explicit/canonical exact station evidence
       -> stronger evidence path; the geographic gate is irrelevant
       zero targets -> continue to the semantic/geographic policy
       2+ distinct targets -> ambiguous, never a pick
       exactly 1 target AND exactly 1 matching exact station identity in the
         reviewed pilot index -> canonical_explicit_station (production-ready)
       exactly 1 target but NO matching exact station in the pilot index
         -> hold_for_review (canonical_station_not_in_pilot_index),
            with NO geographic fallback
       duplicate pilot-index records for the same exact identity -> ambiguous
2. kind in {city, ward, town, village, district, historic_town}
       -> not_anchorable_by_geography (administrative_or_locality_kind)
3. role === "hub"          -> not_anchorable_by_geography (hub_role)
4. role === "standalone"   -> not_anchorable_by_geography (standalone_regional_role)
5. role === "poi"          -> anchorable, even when kind is null
6. role === null && kind === null
       -> hold_for_review (destination_semantics_unclassified)
7. role === null + known non-administrative kind -> anchorable
8. any other role          -> hold_for_review (unknown_or_legacy_role)
```

Only then, for anchorable destinations, the fixed 500 m geographic rule:
`0 → unavailable`, `1 → geographic_unique_candidate`, `>1 → ambiguous`.

One tolerance truth: the classifier passes 500 m explicitly as `maxDistanceMeters`
on every shared-resolver call, so the resolver and the reporting helper can never
disagree about the radius. The production/audit policy remains fixed at 500 m.

Rule 2 is role-independent and outranks rules 3–8, so a drifted role can never
rescue an administrative-kind record. No closest-wins, station complexes are never
collapsed, and the radius is neither enlarged nor tuned.

### Why `standalone` is excluded

`standalone` marks a region-scale record whose coordinate is a representative point
of an area, not a visitor entrance. When such a record had exactly one station in
range, geography resolved an "arrival station" the record does not support — the same
class of defect the ward anchors showed, arriving through a different role. Exclusion
is a positive semantic decision, and 381 records fall under it.

### `not_anchorable_by_geography` is not `not_anchorable`

It forbids **deriving** an anchor from an area's representative coordinates. It does
not declare the destination permanently incapable: rule 1 explicit evidence may still
anchor it. Nothing about "less anchorable" or "partially anchorable" exists — the
outcome is binary plus hold.

## 2. The six-status partition (mutually exclusive, exhaustive)

| Status | Destinations |
| --- | --- |
| `geographic_unique_candidate` | **7** |
| `ambiguous` | 13 |
| `unavailable` | 370 |
| `coordinates_absent` | 0 |
| `not_anchorable_by_geography` | **592** |
| `hold_for_review` | **148** |
| **Sum** | **1130** |

With zero canonical mappings today, the six sum to exactly **1130** = the catalogue size; in the general case `six + canonical === catalogue size`.

`canonical_explicit_station` is **0** and is reported *outside* this partition. Rule 1
takes a record out of the geographic rule entirely, so counting a canonical anchor as
a geographic finding would misreport its evidence. Because that bucket is empty today,
the six geographic statuses still sum to the catalogue size; if a record ever gains
canonical evidence, the six drop by one and
`six + canonical === catalogue size` still holds (a test asserts the general form
against the real catalogue).

Canonical targets fail closed through the shared exact-identity semantics
(`resolveOdptStationIdentity` with `odptId`): a target anchors only on exactly one
matching record in the reviewed pilot index. An unverifiable target — absent, or
syntactically ODPT yet outside TokyoMetro + Toei — holds as
`canonical_station_not_in_pilot_index` and never falls back to geography, since the
explicit mapping states where the destination belongs. A proven target still outranks
the hub/admin exclusions.

**Production-ready anchor totals:** geographic **7** + canonical **0** = **7**.

Not anchorable, by reason:

| Reason | Destinations |
| --- | --- |
| `standalone_regional_role` | 381 |
| `administrative_or_locality_kind` | 208 |
| `hub_role` | 3 |
| **Total** | **592** |

Held, by reason:

| Reason | Destinations |
| --- | --- |
| `unknown_or_legacy_role` | 99 |
| `destination_semantics_unclassified` | 49 |
| **Total** | **148** |

`destinationsWithoutCoordinates = 1`, retained as a deliberately **overlapping**
diagnostic: the gate runs first, so a coordinate-less hub is counted as
`not_anchorable_by_geography`, and counting coordinate absence only through its own
status would report 0.

The geographic rule therefore actually ran on **390** destinations; the candidate
distribution over those is `0 → 370`, `1 → 7`, `2 → 5`, `3 → 4`, `4+ → 4`.

## 3. `hold_for_review` is a real status

Held records are **excluded** from `anchors[]`, `uniqueAnchors`,
`anchorsByOperator`, `anchorsByRailway`, `productionReadyAnchors` and the
candidate-count distribution. They are retained only in a separate
`holdForReviewDestinations` diagnostic section carrying their observed candidate
count. Tests assert the exclusion, not just the count.

## 4. The seven anchors

Operator split: TokyoMetro **3**, Toei **4**. Distance min **247.2 m**, median
**378.8 m**, max **488.3 m** (100–250 m: 1 · 250–500 m: 6).

| Destination | EN / JA | role / kind | ODPT station | d (m) |
| --- | --- | --- | --- | --- |
| `sugamo-jizo-dori` | Sugamo Jizo-dori / 巣鴨地蔵通り商店街 | poi / street | `Toei.Mita.Sugamo` | 247 |
| `sumida-hokusai-museum` | The Sumida Hokusai Museum / すみだ北斎美術館 | poi / museum | `Toei.Oedo.Ryogoku` | 282 |
| `ryogoku-kokugikan-sumo-museum` | Ryogoku Kokugikan and Sumo Museum / 両国国技館・相撲博物館 | poi / museum | `Toei.Oedo.Ryogoku` | 377 |
| `shinjuku-gyo-en` | Shinjuku Gyo-en / 新宿御苑 | poi / park | `TokyoMetro.Marunouchi.ShinjukuGyoemmae` | 379 |
| `ueno-park` | Ueno Park / 上野恩賜公園 | poi / park | `TokyoMetro.Ginza.Ueno` | 410 |
| `teamlab-borderless-azabudai` | teamLab Borderless / チームラボボーダレス（麻布台ヒルズ） | poi / museum | `TokyoMetro.Hibiya.Kamiyacho` | 424 |
| `hamarikyu-gardens` | Hamarikyu Gardens / 浜離宮恩賜庭園 | poi / garden | `Toei.Oedo.Shiodome` | 488 |

**All seven previously reviewed point anchors survived** — none was lost, and each now
satisfies the general rule (`role == "poi"`) rather than being accepted by
assumption. No destination id is special-cased: the audit source contains no
destination id, and a test re-runs `meguro-city` with point-like semantics to prove
it then anchors.

## 5. Review of every unique geographic candidate (15)

Selection is by observed candidate count, never by id; excluded and held records are
included so nothing disappears from the audit.

| Destination | role / kind | ODPT station | classification | outcome | reason |
| --- | --- | --- | --- | --- | --- |
| `hamarikyu-gardens` | poi / garden | `Toei.Oedo.Shiodome` | point/site-like | `geographic_unique_candidate` | — |
| `ryogoku-kokugikan-sumo-museum` | poi / museum | `Toei.Oedo.Ryogoku` | point/site-like | `geographic_unique_candidate` | — |
| `shinjuku-gyo-en` | poi / park | `TokyoMetro.Marunouchi.ShinjukuGyoemmae` | point/site-like | `geographic_unique_candidate` | — |
| `sugamo-jizo-dori` | poi / street | `Toei.Mita.Sugamo` | point/site-like | `geographic_unique_candidate` | — |
| `sumida-hokusai-museum` | poi / museum | `Toei.Oedo.Ryogoku` | point/site-like | `geographic_unique_candidate` | — |
| `teamlab-borderless-azabudai` | poi / museum | `TokyoMetro.Hibiya.Kamiyacho` | point/site-like | `geographic_unique_candidate` | — |
| `ueno-park` | poi / park | `TokyoMetro.Ginza.Ueno` | point/site-like | `geographic_unique_candidate` | — |
| `itabashi-city` | hub / ward | `Toei.Mita.ItabashiKuyakushomae` | administrative/regional | `not_anchorable_by_geography` | `administrative_or_locality_kind` |
| `koto-city` | hub / ward | `TokyoMetro.Tozai.Toyocho` | administrative/regional | `not_anchorable_by_geography` | `administrative_or_locality_kind` |
| `meguro-city` | hub / ward | `TokyoMetro.Hibiya.NakaMeguro` | administrative/regional | `not_anchorable_by_geography` | `administrative_or_locality_kind` |
| `nakano-city` | hub / ward | `TokyoMetro.Tozai.Nakano` | administrative/regional | `not_anchorable_by_geography` | `administrative_or_locality_kind` |
| `nerima-city` | hub / ward | `Toei.Oedo.Nerima` | administrative/regional | `not_anchorable_by_geography` | `administrative_or_locality_kind` |
| `suginami-city` | hub / ward | `TokyoMetro.Marunouchi.MinamiAsagaya` | administrative/regional | `not_anchorable_by_geography` | `administrative_or_locality_kind` |
| `takanawa-gateway-minato` | (none) / (none) | `Toei.Asakusa.Sengakuji` | requires_review | `hold_for_review` | `destination_semantics_unclassified` |
| `tokyo-metropolitan-government-building-shinjuku` | (none) / (none) | `Toei.Oedo.Tochomae` | requires_review | `hold_for_review` | `destination_semantics_unclassified` |

Outcomes: **7** `geographic_unique_candidate` · **6**
`not_anchorable_by_geography` · **2** `hold_for_review`.

Both previously held records remain held, by the general rule 6 (neither carries a
`role` or a `kind`, so nothing in the record states what its coordinate denotes).
`takanawa-gateway-minato` remains independently odd: the destination *is* a station
complex whose namesake station is outside the pilot operators, so geography resolves
it to a different station entirely.

The six wards are excluded by `kind` (rule 2) rather than by `role`, because the
administrative-kind reason is the more specific and accurate one.

## 6. Role schema drift — reported, not normalised

`role` is read straight from `destination.role`, so every observed value is reported.
Missing `kind` is **not** treated as suspicious: a defined role plus a missing kind is
fully decidable (`poi` anchors; `hub`/`standalone` do not). Only a missing role *and*
kind is undecidable.

| role | records | defined? | missing kind |
| --- | --- | --- | --- |
| `poi` | 407 | yes | 29 |
| `standalone` | 400 | yes | 52 |
| `hub` | 164 | yes | 3 |
| **`destination`** | **107** | **no — schema drift** | **18** |
| (none) | 52 | — | 49 |
| **Total** | **1130** | | 151 |

`destination` is **not** treated as `poi`. The two are distinct, and coercing it would
silently widen the anchor set, so all 107 records are held unless rule 2 already
excludes them by kind.

`role × kind` for the legacy role (sums to 107):

| kind | n | outcome |
| --- | --- | --- |
| `museum` | 26 | hold (`unknown_or_legacy_role`) |
| `temple` | 19 | hold |
| *(none)* | 18 | hold |
| `historic_town` | 7 | not anchorable (rule 2) |
| `viewpoint` | 5 | hold |
| `shrine` | 4 | hold |
| `beach`, `garden`, `market`, `park` | 3 each | hold |
| `aquarium`, `castle`, `island` | 2 each | hold |
| `cemetery`, `cliff`, `district`, `lake`, `nature`, `rock_formation`, `station`, `street`, `theme_park`, `tower` | 1 each | `district` not anchorable (rule 2); the rest hold |

(99 hold + 8 excluded by rule 2 = 107.)

### The 102 role-but-no-kind records

Of the 151 records with no `kind`, 49 have no role either (rule 6 hold) and **102**
carry a role but no kind:

| role | records | outcome under the final policy |
| --- | --- | --- |
| `standalone` | 52 | not anchorable (rule 4) |
| `poi` | 29 | **anchorable** (rule 5) |
| `destination` | 18 | hold (rule 8) |
| `hub` | 3 | not anchorable (rule 3) |

None of the 29 `poi`-without-kind records currently produces an anchor (no pilot
station in range), so the anchor count is unaffected — but they are anchorable by
policy, and that is the intended behaviour rather than an oversight.

## 7. Role × kind matrix

All 103 cells are in `qa/kai-291/destination-station-anchors.md` and the JSON artifact
with per-cell coordinate coverage, candidate distributions and all three gate
outcomes. The full JSON artifact also carries `statusPartition`,
`holdForReviewDestinations`, `roleDrift`, `anchorReviewTable` and `semanticMatrix`.

## 8. Validation cohort

The 29 records carrying stronger access evidence:

| Verdict | Records |
| --- | --- |
| `agreement` | 1 |
| `contradiction` | **0** |
| `not_comparable_anchor_absent` | 28 |

Zero contradictions, but a weak validator: 28 of 29 lie outside the pilot area, so they
are not comparable. `localTransport` availability does not decide geographic
anchorability — a test asserts that two records with identical semantics and opposite
evidence states classify identically.

## 9. Not done in this slice

No user-facing integration, no departure-time control, no origin-side resolution, no
transfers, no walking or feeder legs, no fares, no recommendation/ranking/feasibility
or budget change, no production caller, and no change to `src/` runtime behaviour.
The artifact records `networkCalls = 0` and `providerCalls = 0`: the classification
reuses the already-committed candidate evidence and made no live ODPT request.

## 10. Inputs and regeneration

- `qa/kai-291/pilot-station-index.json` — reviewed static evidence, 335 stations
  (186 TokyoMetro + 149 Toei), normalized and credential-free, retrieved once through
  `https://meguruto.app/api/odpt` with operator-narrowed `station` queries.
  `loadStationIndex()` proves the boundary fail-loud: `pilotOperators` must equal
  exactly `{TokyoMetro, Toei}`, every entry needs a non-empty `sameAs`, a pilot
  operator and a railway inside that operator's namespace, no `sameAs` may repeat,
  `stationCount`/`perOperatorCounts` must recompute exactly, and all 335 entries
  must be coordinate-bearing — otherwise no coverage is reported.
- `src/shared/data/destinations-index.json` — the catalogue.

```
npx tsx scripts/audit/kai-291a-destination-station-identity.ts
```

Deterministic and environment independent: identical inputs produce identical bytes
locally and in CI, with or without `GITHUB_SHA`. The generator emits
repository-formatted bytes so the committed artifacts satisfy the format gate and
regeneration reproduces them exactly.
