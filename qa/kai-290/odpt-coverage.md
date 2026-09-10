# KAI-290 — ODPT operator coverage audit

Generated: 2026-09-10T08:56:44.948Z
Boundary: https://meguruto.app/api/odpt (the only endpoint contacted)
Requests: 14/40 (budget exhausted: no, rate-limit halted: no)

> ODPT silently truncates broad search results at a system upper limit, so every
> `station` / `railway` count below is a LOWER BOUND, not an exact total.

## Per-operator coverage

| Operator                 | Stations | Station coords | Coord coverage | Railways | Railway stationOrder |
| ------------------------ | -------: | -------------: | -------------: | -------: | -------------------: |
| odpt.Operator:JR-East    |      134 |          0/134 |           0.0% |       24 |                 0/24 |
| odpt.Operator:Toei       |      149 |        149/149 |         100.0% |        6 |                  6/6 |
| odpt.Operator:TokyoMetro |      186 |        186/186 |         100.0% |       10 |                10/10 |

## Station coordinate gap

- odpt.Operator:JR-East: 0/134 stations carry coordinates (134 missing)

## Per-operator evidence detail

### odpt.Operator:JR-East

- connectingStation: 0/134 (0.0%)
- connectingRailway: 0/134 (0.0%)
- station stationCode: 0/134
- railway lineCode: 0/24
- railway direction fields: 0/24
- RailwayFare: skipped — no_fare_probe
- multilingual title languages observed (2): en, ja
- station dc:date: latest 2024-03-27T09:00:00+09:00 (2 distinct)
- station dct:valid: latest n/a

### odpt.Operator:Toei

- connectingStation: 73/149 (49.0%)
- connectingRailway: 73/149 (49.0%)
- station stationCode: 149/149
- railway lineCode: 6/6
- railway direction fields: 6/6
- RailwayFare: available (1 record)
  - probe pair: odpt.Station:Toei.Arakawa.Minowabashi → odpt.Station:Toei.Arakawa.ArakawaItchumae
- multilingual title languages observed (2): en, ja
- station dc:date: latest 2024-06-27T08:00:00+09:00 (3 distinct)
- station dct:valid: latest n/a

### odpt.Operator:TokyoMetro

- connectingStation: 129/186 (69.3%)
- connectingRailway: 129/186 (69.3%)
- station stationCode: 186/186
- railway lineCode: 10/10
- railway direction fields: 10/10
- RailwayFare: available (1 record)
  - probe pair: odpt.Station:TokyoMetro.Marunouchi.Ogikubo → odpt.Station:TokyoMetro.Marunouchi.MinamiAsagaya
- multilingual title languages observed (6): en, ja, ja-Hrkt, ko, zh-Hans, zh-Hant
- station dc:date: latest 2025-05-29T14:00:00+09:00 (4 distinct)
- station dct:valid: latest n/a

## Pending operations (not yet deployed)

- calendar — not available (pending deployment): unsupported_operation (HTTP 400) — pending deployment
- operator — not available (pending deployment): unsupported_operation (HTTP 400) — pending deployment
- train_type — not available (pending deployment): unsupported_operation (HTTP 400) — pending deployment
- rail_direction — not available (pending deployment): unsupported_operation (HTTP 400) — pending deployment
- station_timetable — not available (pending deployment): unsupported_operation (HTTP 400) — pending deployment
- train_timetable — not available (pending deployment): unsupported_operation (HTTP 400) — pending deployment

## Checks

- Boundary-only contact: pass
- No credential in any response: pass
- Operators audited: 3
- Sample source URL (credential-free): https://api.odpt.org/api/v4/odpt:Station?odpt:operator=odpt.Operator%3AJR-East
