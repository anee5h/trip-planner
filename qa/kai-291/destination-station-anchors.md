# KAI-291A — destination → exact ODPT arrival-station identity coverage

Geographic anchor registry for the **TokyoMetro + Toei** pilot, built with the
existing `odptStationIdentity` geographic evidence path.

- Tolerance (fixed, reused from the existing resolver default): **500 m**
- Destinations evaluated: **1130**

## Status partition (mutually exclusive, exhaustive)

| Status                        | Destinations |
| ----------------------------- | ------------ |
| `geographic_unique_candidate` | 7            |
| `ambiguous`                   | 13           |
| `unavailable`                 | 370          |
| `coordinates_absent`          | 0            |
| `not_anchorable_by_geography` | 592          |
| `hold_for_review`             | 148          |
| **Sum**                       | **1130**     |

The six statuses sum to **1130**. `canonical_explicit_station` is empty, so this equals the catalogue size.

`canonical_explicit_station` sits OUTSIDE the geographic partition by design:
rule 1 removes such a record from the geographic rule entirely, so counting it
as a geographic finding would misreport its evidence.

## Production-ready anchor totals

| Measure                                                  | Count |
| -------------------------------------------------------- | ----- |
| `geographic_unique_candidate` (geographic anchors)       | 7     |
| `canonical_explicit_station` (explicit evidence, rule 1) | 0     |
| **Production-ready anchors**                             | **7** |

## Exclusions and holds

| Measure                                                               | Count |
| --------------------------------------------------------------------- | ----- |
| `not_anchorable_by_geography`                                         | 592   |
| `hold_for_review`                                                     | 148   |
| Destinations without coordinates (any status, overlapping diagnostic) | 1     |

### not_anchorable_by_geography by reason

| Reason                            | Destinations |
| --------------------------------- | ------------ |
| `administrative_or_locality_kind` | 208          |
| `hub_role`                        | 3            |
| `standalone_regional_role`        | 381          |

### hold_for_review by reason

| Reason                               | Destinations |
| ------------------------------------ | ------------ |
| `destination_semantics_unclassified` | 49           |
| `unknown_or_legacy_role`             | 99           |

Held records are excluded from `anchors`, the geographic anchor count,
`anchorsByOperator`, `anchorsByRailway`, the production-ready total and the
candidate distribution. They are retained only as observational metadata.

## Candidate-count distribution (geographic rule only)

| Candidates | Destinations |
| ---------- | ------------ |
| 0          | 370          |
| 1          | 7            |
| 2          | 5            |
| 3          | 4            |
| 4+         | 4            |

## Anchors by operator

| Operator                 | Anchors |
| ------------------------ | ------- |
| odpt.Operator:Toei       | 4       |
| odpt.Operator:TokyoMetro | 3       |

## Anchors by railway

| Railway                            | Anchors |
| ---------------------------------- | ------- |
| odpt.Railway:Toei.Mita             | 1       |
| odpt.Railway:Toei.Oedo             | 3       |
| odpt.Railway:TokyoMetro.Ginza      | 1       |
| odpt.Railway:TokyoMetro.Hibiya     | 1       |
| odpt.Railway:TokyoMetro.Marunouchi | 1       |

## Distance, destination → its unique anchor

- min **247.2 m** · median **378.8 m** · max **488.3 m**
- <50 m: 0 · 50–100 m: 0 · 100–250 m: 1 · 250–500 m: 6

## Review of every unique geographic candidate

Every destination geography resolves to exactly one station, **including those
the policy excludes or holds**, so nothing disappears from the audit. Selection
is by observed candidate count, never by destination id.

| Destination                                       | EN / JA                                                               | role   | kind   | ODPT station                                          | d (m) | classification          | outcome                       | reason                             |
| ------------------------------------------------- | --------------------------------------------------------------------- | ------ | ------ | ----------------------------------------------------- | ----- | ----------------------- | ----------------------------- | ---------------------------------- |
| `hamarikyu-gardens`                               | Hamarikyu Gardens / 浜離宮恩賜庭園                                    | poi    | garden | `odpt.Station:Toei.Oedo.Shiodome`                     | 488   | point/site-like         | `geographic_unique_candidate` | (none)                             |
| `itabashi-city`                                   | Itabashi City / 板橋区                                                | hub    | ward   | `odpt.Station:Toei.Mita.ItabashiKuyakushomae`         | n/a   | administrative/regional | `not_anchorable_by_geography` | administrative_or_locality_kind    |
| `koto-city`                                       | Koto City / 江東区                                                    | hub    | ward   | `odpt.Station:TokyoMetro.Tozai.Toyocho`               | n/a   | administrative/regional | `not_anchorable_by_geography` | administrative_or_locality_kind    |
| `meguro-city`                                     | Meguro City / 目黒区                                                  | hub    | ward   | `odpt.Station:TokyoMetro.Hibiya.NakaMeguro`           | n/a   | administrative/regional | `not_anchorable_by_geography` | administrative_or_locality_kind    |
| `nakano-city`                                     | Nakano City / 中野区                                                  | hub    | ward   | `odpt.Station:TokyoMetro.Tozai.Nakano`                | n/a   | administrative/regional | `not_anchorable_by_geography` | administrative_or_locality_kind    |
| `nerima-city`                                     | Nerima City / 練馬区                                                  | hub    | ward   | `odpt.Station:Toei.Oedo.Nerima`                       | n/a   | administrative/regional | `not_anchorable_by_geography` | administrative_or_locality_kind    |
| `ryogoku-kokugikan-sumo-museum`                   | Ryogoku Kokugikan and Sumo Museum / 両国国技館・相撲博物館            | poi    | museum | `odpt.Station:Toei.Oedo.Ryogoku`                      | 377   | point/site-like         | `geographic_unique_candidate` | (none)                             |
| `shinjuku-gyo-en`                                 | Shinjuku Gyo-en / 新宿御苑                                            | poi    | park   | `odpt.Station:TokyoMetro.Marunouchi.ShinjukuGyoemmae` | 379   | point/site-like         | `geographic_unique_candidate` | (none)                             |
| `sugamo-jizo-dori`                                | Sugamo Jizo-dori / 巣鴨地蔵通り商店街                                 | poi    | street | `odpt.Station:Toei.Mita.Sugamo`                       | 247   | point/site-like         | `geographic_unique_candidate` | (none)                             |
| `suginami-city`                                   | Suginami City / 杉並区                                                | hub    | ward   | `odpt.Station:TokyoMetro.Marunouchi.MinamiAsagaya`    | n/a   | administrative/regional | `not_anchorable_by_geography` | administrative_or_locality_kind    |
| `sumida-hokusai-museum`                           | The Sumida Hokusai Museum / すみだ北斎美術館                          | poi    | museum | `odpt.Station:Toei.Oedo.Ryogoku`                      | 282   | point/site-like         | `geographic_unique_candidate` | (none)                             |
| `takanawa-gateway-minato`                         | Takanawa Gateway / 高輪ゲートウェイ                                   | (none) | (none) | `odpt.Station:Toei.Asakusa.Sengakuji`                 | n/a   | requires_review         | `hold_for_review`             | destination_semantics_unclassified |
| `teamlab-borderless-azabudai`                     | teamLab Borderless / チームラボボーダレス（麻布台ヒルズ）             | poi    | museum | `odpt.Station:TokyoMetro.Hibiya.Kamiyacho`            | 424   | point/site-like         | `geographic_unique_candidate` | (none)                             |
| `tokyo-metropolitan-government-building-shinjuku` | Tokyo Metropolitan Government Building Observatories / 東京都庁展望室 | (none) | (none) | `odpt.Station:Toei.Oedo.Tochomae`                     | n/a   | requires_review         | `hold_for_review`             | destination_semantics_unclassified |
| `ueno-park`                                       | Ueno Park / 上野恩賜公園                                              | poi    | park   | `odpt.Station:TokyoMetro.Ginza.Ueno`                  | 410   | point/site-like         | `geographic_unique_candidate` | (none)                             |

Outcomes: **geographic_unique_candidate** 7 · **hold_for_review** 2 · **not_anchorable_by_geography** 6

## Role schema drift

`role` is read straight from `destination.role`, so every observed value is
reported. A defined role carries no implication that missing `kind` is
suspicious — `poi` is anchorable regardless of kind (rule 5).

| role        | records | defined role?  | with missing kind | kind distribution                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------- | -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| poi         | 407     | yes            | 29                | (none):29, aquarium:7, beach:4, bridge:1, castle:12, cliff:1, cruise:2, cultural:1, district:20, entertainment:1, event:1, garden:21, historic:6, island:2, lake:2, market:8, memorial:2, mixed:6, monument:2, mountain:5, museum:112, natural:6, nature:13, observation:1, onsen:10, park:32, shopping:6, shrine:27, station:1, street:9, temple:36, theme_park:3, tower:7, viewpoint:5, waterfall:1, zoo:5 |
| standalone  | 400     | yes            | 52                | (none):52, amusement_park:2, aquarium:2, beach:2, bridge:8, cape:1, castle:59, city:4, cruise:2, cultural:1, district:1, garden:3, historic:10, historic_town:6, island:7, lake:8, market:1, monument:1, mountain:15, museum:11, natural:3, nature:125, onsen:20, park:16, rock_formation:1, shrine:14, street:2, temple:6, theme_park:3, tower:1, town:5, viewpoint:1, village:3, waterfall:3, zoo:1        |
| hub         | 164     | yes            | 3                 | (none):3, city:121, district:1, town:15, village:1, ward:23                                                                                                                                                                                                                                                                                                                                                  |
| destination | 107     | **no (drift)** | 18                | (none):18, aquarium:2, beach:3, castle:2, cemetery:1, cliff:1, district:1, garden:3, historic_town:7, island:2, lake:1, market:3, museum:26, nature:1, park:3, rock_formation:1, shrine:4, station:1, street:1, temple:19, theme_park:1, tower:1, viewpoint:5                                                                                                                                                |
| (none)      | 52      | yes            | 49                | (none):49, island:1, museum:2                                                                                                                                                                                                                                                                                                                                                                                |

## Semantic matrix (role × kind, whole catalogue)

| role        | kind           | total | w/ coords | 0   | 1   | 2   | 3   | 4+  | unique cand. | anchorable | not anchorable | hold |
| ----------- | -------------- | ----- | --------- | --- | --- | --- | --- | --- | ------------ | ---------- | -------------- | ---- |
| standalone  | nature         | 125   | 125       | 125 | 0   | 0   | 0   | 0   | 0            | 0          | 125            | 0    |
| hub         | city           | 121   | 121       | 121 | 0   | 0   | 0   | 0   | 0            | 0          | 121            | 0    |
| poi         | museum         | 112   | 112       | 104 | 3   | 2   | 1   | 2   | 3            | 112        | 0              | 0    |
| standalone  | castle         | 59    | 59        | 59  | 0   | 0   | 0   | 0   | 0            | 0          | 59             | 0    |
| standalone  | (none)         | 52    | 52        | 52  | 0   | 0   | 0   | 0   | 0            | 0          | 52             | 0    |
| (none)      | (none)         | 49    | 49        | 36  | 2   | 5   | 5   | 1   | 2            | 0          | 0              | 49   |
| poi         | temple         | 36    | 36        | 35  | 0   | 0   | 1   | 0   | 0            | 36         | 0              | 0    |
| poi         | park           | 32    | 32        | 30  | 2   | 0   | 0   | 0   | 2            | 32         | 0              | 0    |
| poi         | (none)         | 29    | 29        | 29  | 0   | 0   | 0   | 0   | 0            | 29         | 0              | 0    |
| poi         | shrine         | 27    | 27        | 27  | 0   | 0   | 0   | 0   | 0            | 27         | 0              | 0    |
| destination | museum         | 26    | 26        | 26  | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 26   |
| hub         | ward           | 23    | 23        | 6   | 6   | 3   | 3   | 5   | 6            | 0          | 23             | 0    |
| poi         | garden         | 21    | 21        | 19  | 1   | 1   | 0   | 0   | 1            | 21         | 0              | 0    |
| poi         | district       | 20    | 20        | 15  | 0   | 1   | 2   | 2   | 0            | 0          | 20             | 0    |
| standalone  | onsen          | 20    | 20        | 20  | 0   | 0   | 0   | 0   | 0            | 0          | 20             | 0    |
| destination | temple         | 19    | 19        | 19  | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 19   |
| destination | (none)         | 18    | 18        | 18  | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 18   |
| standalone  | park           | 16    | 16        | 16  | 0   | 0   | 0   | 0   | 0            | 0          | 16             | 0    |
| hub         | town           | 15    | 15        | 15  | 0   | 0   | 0   | 0   | 0            | 0          | 15             | 0    |
| standalone  | mountain       | 15    | 15        | 15  | 0   | 0   | 0   | 0   | 0            | 0          | 15             | 0    |
| standalone  | shrine         | 14    | 14        | 14  | 0   | 0   | 0   | 0   | 0            | 0          | 14             | 0    |
| poi         | nature         | 13    | 13        | 13  | 0   | 0   | 0   | 0   | 0            | 13         | 0              | 0    |
| poi         | castle         | 12    | 12        | 12  | 0   | 0   | 0   | 0   | 0            | 12         | 0              | 0    |
| standalone  | museum         | 11    | 11        | 11  | 0   | 0   | 0   | 0   | 0            | 0          | 11             | 0    |
| poi         | onsen          | 10    | 10        | 10  | 0   | 0   | 0   | 0   | 0            | 10         | 0              | 0    |
| standalone  | historic       | 10    | 10        | 10  | 0   | 0   | 0   | 0   | 0            | 0          | 10             | 0    |
| poi         | street         | 9     | 9         | 7   | 1   | 1   | 0   | 0   | 1            | 9          | 0              | 0    |
| poi         | market         | 8     | 8         | 7   | 0   | 0   | 1   | 0   | 0            | 8          | 0              | 0    |
| standalone  | bridge         | 8     | 8         | 8   | 0   | 0   | 0   | 0   | 0            | 0          | 8              | 0    |
| standalone  | lake           | 8     | 8         | 8   | 0   | 0   | 0   | 0   | 0            | 0          | 8              | 0    |
| destination | historic_town  | 7     | 7         | 7   | 0   | 0   | 0   | 0   | 0            | 0          | 7              | 0    |
| poi         | aquarium       | 7     | 7         | 6   | 0   | 0   | 1   | 0   | 0            | 7          | 0              | 0    |
| poi         | tower          | 7     | 7         | 7   | 0   | 0   | 0   | 0   | 0            | 7          | 0              | 0    |
| standalone  | island         | 7     | 7         | 7   | 0   | 0   | 0   | 0   | 0            | 0          | 7              | 0    |
| poi         | historic       | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              | 0    |
| poi         | mixed          | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              | 0    |
| poi         | natural        | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              | 0    |
| poi         | shopping       | 6     | 6         | 4   | 0   | 0   | 0   | 2   | 0            | 6          | 0              | 0    |
| standalone  | historic_town  | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 0          | 6              | 0    |
| standalone  | temple         | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 0          | 6              | 0    |
| destination | viewpoint      | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 5    |
| poi         | mountain       | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              | 0    |
| poi         | viewpoint      | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              | 0    |
| poi         | zoo            | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              | 0    |
| standalone  | town           | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 0          | 5              | 0    |
| destination | shrine         | 4     | 4         | 4   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 4    |
| poi         | beach          | 4     | 4         | 4   | 0   | 0   | 0   | 0   | 0            | 4          | 0              | 0    |
| standalone  | city           | 4     | 4         | 4   | 0   | 0   | 0   | 0   | 0            | 0          | 4              | 0    |
| destination | beach          | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 3    |
| destination | garden         | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 3    |
| destination | market         | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 3    |
| destination | park           | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 3    |
| hub         | (none)         | 3     | 3         | 2   | 0   | 0   | 1   | 0   | 0            | 0          | 3              | 0    |
| poi         | theme_park     | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              | 0    |
| standalone  | garden         | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 3              | 0    |
| standalone  | natural        | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 3              | 0    |
| standalone  | theme_park     | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 3              | 0    |
| standalone  | village        | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 3              | 0    |
| standalone  | waterfall      | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 3              | 0    |
| destination | aquarium       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 2    |
| destination | castle         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 2    |
| destination | island         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 2    |
| (none)      | museum         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              | 0    |
| poi         | cruise         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              | 0    |
| poi         | island         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              | 0    |
| poi         | lake           | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              | 0    |
| poi         | memorial       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              | 0    |
| poi         | monument       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              | 0    |
| standalone  | amusement_park | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 2              | 0    |
| standalone  | aquarium       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 2              | 0    |
| standalone  | beach          | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 2              | 0    |
| standalone  | cruise         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 2              | 0    |
| standalone  | street         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 0          | 2              | 0    |
| destination | cemetery       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | cliff          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | district       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| destination | lake           | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | nature         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | rock_formation | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | station        | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | street         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | theme_park     | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| destination | tower          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 0              | 1    |
| hub         | district       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| hub         | village        | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| (none)      | island         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | bridge         | 1     | 1         | 0   | 0   | 1   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | cliff          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | cultural       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | entertainment  | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | event          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | observation    | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | station        | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| poi         | waterfall      | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              | 0    |
| standalone  | cape           | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | cultural       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | district       | 1     | 0         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | market         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | monument       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | rock_formation | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | tower          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | viewpoint      | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |
| standalone  | zoo            | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              | 0    |

## Validation cohort (existing stronger access evidence)

Reported for comparison only. Geographic anchorability is decided by
destination semantics and coordinate meaning, never by `localTransport`
availability.

| Verdict                      | Records |
| ---------------------------- | ------- |
| agreement                    | 1       |
| not_comparable_anchor_absent | 28      |

## The final policy, in precedence order

```
1. explicit/canonical exact station evidence
       -> stronger evidence path; geographic gate irrelevant
       (2+ competing canonical targets -> ambiguous, never a pick)
2. kind in {city, ward, town, village, district, historic_town}
       -> not_anchorable_by_geography (administrative_or_locality_kind)
3. role === "hub"          -> not_anchorable_by_geography (hub_role)
4. role === "standalone"   -> not_anchorable_by_geography (standalone_regional_role)
5. role === "poi"          -> anchorable, even when kind is null
6. role === null && kind === null
       -> hold_for_review (destination_semantics_unclassified)
7. role === null + known non-administrative kind -> anchorable
8. any other role           -> hold_for_review (unknown_or_legacy_role)
```

Then, only for anchorable destinations, the fixed 500 m rule:
`0 -> unavailable`, `1 -> geographic_unique_candidate`, `>1 -> ambiguous`.

No closest-wins. Station complexes are never collapsed. Nothing widens the
radius. `hold_for_review` is a real status, not a soft pass.

## Semantic scope

A `geographic_unique_candidate` anchor means **only** that under Meguruto's
fixed geographic anchor policy exactly one pilot ODPT station was identified
for that destination. It does not claim the destination recommends that
station, and it carries **no** claim about station → POI access.

`not_anchorable_by_geography` is **not** `not_anchorable`: it forbids deriving
an anchor from an area's representative coordinates, while rule 1 may still
anchor the same destination on explicit evidence.
