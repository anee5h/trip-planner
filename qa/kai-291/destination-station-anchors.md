# KAI-291A — destination → exact ODPT arrival-station identity coverage

Geographic anchor registry for the **TokyoMetro + Toei** pilot, built with the
existing `odptStationIdentity` geographic evidence path.

- Tolerance (fixed, reused from the existing resolver default): **500 m**
- Destinations evaluated: **1130**
- Unique geographic anchors: **15**
- Ambiguous (more than one station within tolerance): **41**
- Unavailable (no station within tolerance): **1073**
- Coordinates absent: **1**

## Candidate-count distribution (stations within tolerance)

| Candidates | Destinations |
| ---------- | ------------ |
| 0          | 1073         |
| 1          | 15           |
| 2          | 14           |
| 3          | 15           |
| 4+         | 12           |

## Anchors by operator

| Operator                 | Anchors |
| ------------------------ | ------- |
| odpt.Operator:Toei       | 8       |
| odpt.Operator:TokyoMetro | 7       |

## Anchors by railway

| Railway                            | Anchors |
| ---------------------------------- | ------- |
| odpt.Railway:Toei.Asakusa          | 1       |
| odpt.Railway:Toei.Mita             | 2       |
| odpt.Railway:Toei.Oedo             | 5       |
| odpt.Railway:TokyoMetro.Ginza      | 1       |
| odpt.Railway:TokyoMetro.Hibiya     | 2       |
| odpt.Railway:TokyoMetro.Marunouchi | 2       |
| odpt.Railway:TokyoMetro.Tozai      | 2       |

## Distance, destination → its unique anchor

- min **74.7 m** · median **312.5 m** · max **488.3 m**
- <50 m: 0 · 50–100 m: 2 · 100–250 m: 3 · 250–500 m: 10

## Validation cohort (existing stronger access evidence)

Reported for comparison only — it never overrides geography.

| Verdict            | Records |
| ------------------ | ------- |
| agrees             | 1       |
| anchor_ambiguous   | 5       |
| anchor_unavailable | 23      |

## Semantic scope

An anchor's evidence path is `geographic_unique_candidate`. It means **only**
that under Meguruto's fixed geographic anchor policy exactly one pilot ODPT
station could be identified for this destination. It does **not** claim the
destination recommends that station, and it carries **no** claim about
station → POI access.
