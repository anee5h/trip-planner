# KAI-291A — destination → exact ODPT arrival-station identity coverage

Geographic anchor registry for the **TokyoMetro + Toei** pilot, built with the
existing `odptStationIdentity` geographic evidence path.

- Tolerance (fixed, reused from the existing resolver default): **500 m**
- Destinations evaluated: **1130**
- Unique geographic anchors: **9**
- Ambiguous (more than one station within tolerance): **24**
- Unavailable (no station within tolerance): **886**
- **Not anchorable by geography** (coordinates denote an area): **211**
- Coordinates absent (status): **0**
- Destinations without coordinates (any status, overlapping): **1**

The five statuses above partition all evaluated destinations (they sum to the
total). The coordinate diagnostic is deliberately overlapping, because the
anchorability gate runs first and would otherwise mask a coordinate-less hub.

## Candidate-count distribution (anchorable destinations)

| Candidates | Destinations |
| ---------- | ------------ |
| 0          | 886          |
| 1          | 9            |
| 2          | 10           |
| 3          | 9            |
| 4+         | 5            |

## Anchors by operator

| Operator                 | Anchors |
| ------------------------ | ------- |
| odpt.Operator:Toei       | 6       |
| odpt.Operator:TokyoMetro | 3       |

## Anchors by railway

| Railway                            | Anchors |
| ---------------------------------- | ------- |
| odpt.Railway:Toei.Asakusa          | 1       |
| odpt.Railway:Toei.Mita             | 1       |
| odpt.Railway:Toei.Oedo             | 4       |
| odpt.Railway:TokyoMetro.Ginza      | 1       |
| odpt.Railway:TokyoMetro.Hibiya     | 1       |
| odpt.Railway:TokyoMetro.Marunouchi | 1       |

## Distance, destination → its unique anchor

- min **142.6 m** · median **376.6 m** · max **488.3 m**
- <50 m: 0 · 50–100 m: 0 · 100–250 m: 2 · 250–500 m: 7

## Review of every unique geographic candidate

Every destination geography would resolve uniquely, **including the ones the
anchorability rule excludes**, so nothing disappears from the audit. Selection is
by observed candidate count, never by destination id.

| Destination                                       | EN / JA                                                               | role   | kind   | ODPT station                                          | railway                            | d (m) | classification          | proposed outcome            |
| ------------------------------------------------- | --------------------------------------------------------------------- | ------ | ------ | ----------------------------------------------------- | ---------------------------------- | ----- | ----------------------- | --------------------------- |
| `hamarikyu-gardens`                               | Hamarikyu Gardens / 浜離宮恩賜庭園                                    | poi    | garden | `odpt.Station:Toei.Oedo.Shiodome`                     | odpt.Railway:Toei.Oedo             | 488   | point/site-like         | geographic_unique_candidate |
| `itabashi-city`                                   | Itabashi City / 板橋区                                                | hub    | ward   | `odpt.Station:Toei.Mita.ItabashiKuyakushomae`         | odpt.Railway:Toei.Mita             | 76    | administrative/regional | not_anchorable_by_geography |
| `koto-city`                                       | Koto City / 江東区                                                    | hub    | ward   | `odpt.Station:TokyoMetro.Tozai.Toyocho`               | odpt.Railway:TokyoMetro.Tozai      | 312   | administrative/regional | not_anchorable_by_geography |
| `meguro-city`                                     | Meguro City / 目黒区                                                  | hub    | ward   | `odpt.Station:TokyoMetro.Hibiya.NakaMeguro`           | odpt.Railway:TokyoMetro.Hibiya     | 296   | administrative/regional | not_anchorable_by_geography |
| `nakano-city`                                     | Nakano City / 中野区                                                  | hub    | ward   | `odpt.Station:TokyoMetro.Tozai.Nakano`                | odpt.Railway:TokyoMetro.Tozai      | 246   | administrative/regional | not_anchorable_by_geography |
| `nerima-city`                                     | Nerima City / 練馬区                                                  | hub    | ward   | `odpt.Station:Toei.Oedo.Nerima`                       | odpt.Railway:Toei.Oedo             | 342   | administrative/regional | not_anchorable_by_geography |
| `ryogoku-kokugikan-sumo-museum`                   | Ryogoku Kokugikan and Sumo Museum / 両国国技館・相撲博物館            | poi    | museum | `odpt.Station:Toei.Oedo.Ryogoku`                      | odpt.Railway:Toei.Oedo             | 377   | point/site-like         | geographic_unique_candidate |
| `shinjuku-gyo-en`                                 | Shinjuku Gyo-en / 新宿御苑                                            | poi    | park   | `odpt.Station:TokyoMetro.Marunouchi.ShinjukuGyoemmae` | odpt.Railway:TokyoMetro.Marunouchi | 379   | point/site-like         | geographic_unique_candidate |
| `sugamo-jizo-dori`                                | Sugamo Jizo-dori / 巣鴨地蔵通り商店街                                 | poi    | street | `odpt.Station:Toei.Mita.Sugamo`                       | odpt.Railway:Toei.Mita             | 247   | point/site-like         | geographic_unique_candidate |
| `suginami-city`                                   | Suginami City / 杉並区                                                | hub    | ward   | `odpt.Station:TokyoMetro.Marunouchi.MinamiAsagaya`    | odpt.Railway:TokyoMetro.Marunouchi | 75    | administrative/regional | not_anchorable_by_geography |
| `sumida-hokusai-museum`                           | The Sumida Hokusai Museum / すみだ北斎美術館                          | poi    | museum | `odpt.Station:Toei.Oedo.Ryogoku`                      | odpt.Railway:Toei.Oedo             | 282   | point/site-like         | geographic_unique_candidate |
| `takanawa-gateway-minato`                         | Takanawa Gateway / 高輪ゲートウェイ                                   | (none) | (none) | `odpt.Station:Toei.Asakusa.Sengakuji`                 | odpt.Railway:Toei.Asakusa          | 363   | requires_review         | hold_for_review             |
| `teamlab-borderless-azabudai`                     | teamLab Borderless / チームラボボーダレス（麻布台ヒルズ）             | poi    | museum | `odpt.Station:TokyoMetro.Hibiya.Kamiyacho`            | odpt.Railway:TokyoMetro.Hibiya     | 424   | point/site-like         | geographic_unique_candidate |
| `tokyo-metropolitan-government-building-shinjuku` | Tokyo Metropolitan Government Building Observatories / 東京都庁展望室 | (none) | (none) | `odpt.Station:Toei.Oedo.Tochomae`                     | odpt.Railway:Toei.Oedo             | 143   | requires_review         | hold_for_review             |
| `ueno-park`                                       | Ueno Park / 上野恩賜公園                                              | poi    | park   | `odpt.Station:TokyoMetro.Ginza.Ueno`                  | odpt.Railway:TokyoMetro.Ginza      | 410   | point/site-like         | geographic_unique_candidate |

Proposed outcomes: **geographic_unique_candidate** 7 · **hold_for_review** 2 · **not_anchorable_by_geography** 6

## Semantic matrix (role × kind, whole catalogue)

| role        | kind           | total | w/ coords | 0   | 1   | 2   | 3   | 4+  | unique cand. | anchorable | not anchorable |
| ----------- | -------------- | ----- | --------- | --- | --- | --- | --- | --- | ------------ | ---------- | -------------- |
| standalone  | nature         | 125   | 125       | 125 | 0   | 0   | 0   | 0   | 0            | 125        | 0              |
| hub         | city           | 121   | 121       | 121 | 0   | 0   | 0   | 0   | 0            | 0          | 121            |
| poi         | museum         | 112   | 112       | 104 | 3   | 2   | 1   | 2   | 3            | 112        | 0              |
| standalone  | castle         | 59    | 59        | 59  | 0   | 0   | 0   | 0   | 0            | 59         | 0              |
| standalone  | (none)         | 52    | 52        | 52  | 0   | 0   | 0   | 0   | 0            | 52         | 0              |
| (none)      | (none)         | 49    | 49        | 36  | 2   | 5   | 5   | 1   | 2            | 49         | 0              |
| poi         | temple         | 36    | 36        | 35  | 0   | 0   | 1   | 0   | 0            | 36         | 0              |
| poi         | park           | 32    | 32        | 30  | 2   | 0   | 0   | 0   | 2            | 32         | 0              |
| poi         | (none)         | 29    | 29        | 29  | 0   | 0   | 0   | 0   | 0            | 29         | 0              |
| poi         | shrine         | 27    | 27        | 27  | 0   | 0   | 0   | 0   | 0            | 27         | 0              |
| destination | museum         | 26    | 26        | 26  | 0   | 0   | 0   | 0   | 0            | 26         | 0              |
| hub         | ward           | 23    | 23        | 6   | 6   | 3   | 3   | 5   | 6            | 0          | 23             |
| poi         | garden         | 21    | 21        | 19  | 1   | 1   | 0   | 0   | 1            | 21         | 0              |
| poi         | district       | 20    | 20        | 15  | 0   | 1   | 2   | 2   | 0            | 0          | 20             |
| standalone  | onsen          | 20    | 20        | 20  | 0   | 0   | 0   | 0   | 0            | 20         | 0              |
| destination | temple         | 19    | 19        | 19  | 0   | 0   | 0   | 0   | 0            | 19         | 0              |
| destination | (none)         | 18    | 18        | 18  | 0   | 0   | 0   | 0   | 0            | 18         | 0              |
| standalone  | park           | 16    | 16        | 16  | 0   | 0   | 0   | 0   | 0            | 16         | 0              |
| hub         | town           | 15    | 15        | 15  | 0   | 0   | 0   | 0   | 0            | 0          | 15             |
| standalone  | mountain       | 15    | 15        | 15  | 0   | 0   | 0   | 0   | 0            | 15         | 0              |
| standalone  | shrine         | 14    | 14        | 14  | 0   | 0   | 0   | 0   | 0            | 14         | 0              |
| poi         | nature         | 13    | 13        | 13  | 0   | 0   | 0   | 0   | 0            | 13         | 0              |
| poi         | castle         | 12    | 12        | 12  | 0   | 0   | 0   | 0   | 0            | 12         | 0              |
| standalone  | museum         | 11    | 11        | 11  | 0   | 0   | 0   | 0   | 0            | 11         | 0              |
| poi         | onsen          | 10    | 10        | 10  | 0   | 0   | 0   | 0   | 0            | 10         | 0              |
| standalone  | historic       | 10    | 10        | 10  | 0   | 0   | 0   | 0   | 0            | 10         | 0              |
| poi         | street         | 9     | 9         | 7   | 1   | 1   | 0   | 0   | 1            | 9          | 0              |
| poi         | market         | 8     | 8         | 7   | 0   | 0   | 1   | 0   | 0            | 8          | 0              |
| standalone  | bridge         | 8     | 8         | 8   | 0   | 0   | 0   | 0   | 0            | 8          | 0              |
| standalone  | lake           | 8     | 8         | 8   | 0   | 0   | 0   | 0   | 0            | 8          | 0              |
| destination | historic_town  | 7     | 7         | 7   | 0   | 0   | 0   | 0   | 0            | 0          | 7              |
| poi         | aquarium       | 7     | 7         | 6   | 0   | 0   | 1   | 0   | 0            | 7          | 0              |
| poi         | tower          | 7     | 7         | 7   | 0   | 0   | 0   | 0   | 0            | 7          | 0              |
| standalone  | island         | 7     | 7         | 7   | 0   | 0   | 0   | 0   | 0            | 7          | 0              |
| poi         | historic       | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              |
| poi         | mixed          | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              |
| poi         | natural        | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              |
| poi         | shopping       | 6     | 6         | 4   | 0   | 0   | 0   | 2   | 0            | 6          | 0              |
| standalone  | historic_town  | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 0          | 6              |
| standalone  | temple         | 6     | 6         | 6   | 0   | 0   | 0   | 0   | 0            | 6          | 0              |
| destination | viewpoint      | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              |
| poi         | mountain       | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              |
| poi         | viewpoint      | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              |
| poi         | zoo            | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 5          | 0              |
| standalone  | town           | 5     | 5         | 5   | 0   | 0   | 0   | 0   | 0            | 0          | 5              |
| destination | shrine         | 4     | 4         | 4   | 0   | 0   | 0   | 0   | 0            | 4          | 0              |
| poi         | beach          | 4     | 4         | 4   | 0   | 0   | 0   | 0   | 0            | 4          | 0              |
| standalone  | city           | 4     | 4         | 4   | 0   | 0   | 0   | 0   | 0            | 0          | 4              |
| destination | beach          | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| destination | garden         | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| destination | market         | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| destination | park           | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| hub         | (none)         | 3     | 3         | 2   | 0   | 0   | 1   | 0   | 0            | 0          | 3              |
| poi         | theme_park     | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| standalone  | garden         | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| standalone  | natural        | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| standalone  | theme_park     | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| standalone  | village        | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 0          | 3              |
| standalone  | waterfall      | 3     | 3         | 3   | 0   | 0   | 0   | 0   | 0            | 3          | 0              |
| destination | aquarium       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| destination | castle         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| destination | island         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| (none)      | museum         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| poi         | cruise         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| poi         | island         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| poi         | lake           | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| poi         | memorial       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| poi         | monument       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| standalone  | amusement_park | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| standalone  | aquarium       | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| standalone  | beach          | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| standalone  | cruise         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| standalone  | street         | 2     | 2         | 2   | 0   | 0   | 0   | 0   | 0            | 2          | 0              |
| destination | cemetery       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | cliff          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | district       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              |
| destination | lake           | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | nature         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | rock_formation | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | station        | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | street         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | theme_park     | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| destination | tower          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| hub         | district       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              |
| hub         | village        | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              |
| (none)      | island         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | bridge         | 1     | 1         | 0   | 0   | 1   | 0   | 0   | 0            | 1          | 0              |
| poi         | cliff          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | cultural       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | entertainment  | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | event          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | observation    | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | station        | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| poi         | waterfall      | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | cape           | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | cultural       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | district       | 1     | 0         | 1   | 0   | 0   | 0   | 0   | 0            | 0          | 1              |
| standalone  | market         | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | monument       | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | rock_formation | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | tower          | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | viewpoint      | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |
| standalone  | zoo            | 1     | 1         | 1   | 0   | 0   | 0   | 0   | 0            | 1          | 0              |

## Validation cohort (existing stronger access evidence)

Reported for comparison only. Geographic **anchorability** is decided by
destination semantics and coordinate meaning, never by `localTransport`
availability.

| Verdict                      | Records |
| ---------------------------- | ------- |
| agreement                    | 1       |
| not_comparable_anchor_absent | 28      |

## Semantic scope

An anchor's evidence path is `geographic_unique_candidate`. It means **only**
that under Meguruto's fixed geographic anchor policy exactly one pilot ODPT
station could be identified for this destination. It does **not** claim the
destination recommends that station, and it carries **no** claim about
station → POI access.

`not_anchorable_by_geography` is **not** `not_anchorable`. It forbids deriving an
anchor from an area's representative coordinates; a stronger explicit evidence
path (canonical mapping, curated access station) may still anchor such a
destination later.

## Proposed production policy

The smallest deterministic rule the evidence supports:

```
if an explicit/canonical station anchor exists:
    use the stronger evidence path   (geographic derivation is not used)
else if not geographically anchorable:
    role === "hub"  ->  not_anchorable_by_geography (hub_role)
    kind in {city, ward, town, village, district, historic_town}
                     ->  not_anchorable_by_geography (administrative_or_locality_kind)
else:
    fixed 500 m rule
    0 candidates      ->  unavailable
    1 exact candidate ->  geographic_unique_candidate
    >1                ->  ambiguous
```

No closest-wins. Station complexes are never collapsed. Nothing widens the radius.
