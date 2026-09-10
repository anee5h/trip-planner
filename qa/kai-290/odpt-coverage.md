# KAI-290 — ODPT operator coverage audit

Generated: 2026-09-10T09:58:35.878Z
Boundary: https://meguruto.app/api/odpt (the only endpoint contacted)
Requests: 33/40 (budget exhausted: no, rate-limit halted: no)

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

## Timetable and reference coverage

Probe states: `records` / `empty` are conclusive provider answers; `too_large` (response exceeded the boundary byte guard) and `error` are **unknown**, not empty.

- `calendar` (provider-wide): **records** — 174 record(s)

### odpt.Operator:JR-East

- probe scope (3 station sample): `odpt.Station:JR-East.ChuoSobuLocal.Tsudanuma`, `odpt.Station:JR-East.Keiyo.Tokyo`, `odpt.Station:JR-East.ChuoSobuLocal.Mitaka`
- railways probed: `odpt.Railway:JR-East.ChuoSobuLocal`, `odpt.Railway:JR-East.Keiyo`
- scoped results are evidence about those stations/railways only — **not** a whole-operator claim
- trainType: **empty** — 0 record(s) (provider returned a successful zero-record result)
- railDirection: **empty** — 0 record(s) (provider returned a successful zero-record result)
- stationTimetable: 3 probe(s) — empty×3
  - odpt.Station:JR-East.ChuoSobuLocal.Tsudanuma: **empty** — 0 record(s) (provider returned a successful zero-record result)
  - odpt.Station:JR-East.Keiyo.Tokyo: **empty** — 0 record(s) (provider returned a successful zero-record result)
  - odpt.Station:JR-East.ChuoSobuLocal.Mitaka: **empty** — 0 record(s) (provider returned a successful zero-record result)
- trainTimetable: 2 probe(s) — empty×2
  - odpt.Railway:JR-East.ChuoSobuLocal: **empty** — 0 record(s) (provider returned a successful zero-record result)
  - odpt.Railway:JR-East.Keiyo: **empty** — 0 record(s) (provider returned a successful zero-record result)
- coverage conclusively known: yes

### odpt.Operator:Toei

- probe scope (3 station sample): `odpt.Station:Toei.Mita.Hakusan`, `odpt.Station:Toei.Mita.NishiTakashimadaira`, `odpt.Station:Toei.Asakusa.HonjoAzumabashi`
- railways probed: `odpt.Railway:Toei.Mita`, `odpt.Railway:Toei.Asakusa`
- scoped results are evidence about those stations/railways only — **not** a whole-operator claim
- trainType: **records** — 8 record(s)
- railDirection: **records** — 3 record(s)
- stationTimetable: 3 probe(s) — records×3
  - odpt.Station:Toei.Mita.Hakusan: **records** — 4 record(s), 752 stop object(s), calendars: odpt.Calendar:SaturdayHoliday, odpt.Calendar:Weekday
  - odpt.Station:Toei.Mita.NishiTakashimadaira: **records** — 2 record(s), 355 stop object(s), calendars: odpt.Calendar:SaturdayHoliday, odpt.Calendar:Weekday
  - odpt.Station:Toei.Asakusa.HonjoAzumabashi: **records** — 4 record(s), 877 stop object(s), calendars: odpt.Calendar:SaturdayHoliday, odpt.Calendar:Weekday
- trainTimetable: 2 probe(s) — too_large×2 — **coverage unknown**
  - odpt.Railway:Toei.Mita: **too_large** (response exceeded the boundary byte guard; coverage unknown, not empty)
  - odpt.Railway:Toei.Asakusa: **too_large** (response exceeded the boundary byte guard; coverage unknown, not empty)
- trainIdentityProbe (`odpt.Train:Toei.Mita.535T`): **records** — 2 record(s), 25 ordered stop object(s), odpt.Station:Toei.Mita.ShirokaneTakanawa → odpt.Station:Toei.Mita.NishiTakashimadaira, needExtraFee: not supplied
- coverage conclusively known: no (6/8 conclusive)

### odpt.Operator:TokyoMetro

- probe scope (3 station sample): `odpt.Station:TokyoMetro.Marunouchi.Shinjuku`, `odpt.Station:TokyoMetro.Chiyoda.Yushima`, `odpt.Station:TokyoMetro.Chiyoda.KitaAyase`
- railways probed: `odpt.Railway:TokyoMetro.Marunouchi`, `odpt.Railway:TokyoMetro.Chiyoda`
- scoped results are evidence about those stations/railways only — **not** a whole-operator claim
- trainType: **records** — 12 record(s)
- railDirection: **records** — 17 record(s)
- stationTimetable: 3 probe(s) — records×3
  - odpt.Station:TokyoMetro.Marunouchi.Shinjuku: **records** — 4 record(s), 1060 stop object(s), calendars: odpt.Calendar:SaturdayHoliday, odpt.Calendar:Weekday
  - odpt.Station:TokyoMetro.Chiyoda.Yushima: **records** — 4 record(s), 914 stop object(s), calendars: odpt.Calendar:SaturdayHoliday, odpt.Calendar:Weekday
  - odpt.Station:TokyoMetro.Chiyoda.KitaAyase: **records** — 2 record(s), 235 stop object(s), calendars: odpt.Calendar:SaturdayHoliday, odpt.Calendar:Weekday
- trainTimetable: 2 probe(s) — too_large×2 — **coverage unknown**
  - odpt.Railway:TokyoMetro.Marunouchi: **too_large** (response exceeded the boundary byte guard; coverage unknown, not empty)
  - odpt.Railway:TokyoMetro.Chiyoda: **too_large** (response exceeded the boundary byte guard; coverage unknown, not empty)
- trainIdentityProbe (`odpt.Train:TokyoMetro.Marunouchi.B427`): **records** — 1 record(s), 18 ordered stop object(s), odpt.Station:TokyoMetro.Marunouchi.Shinjuku → odpt.Station:TokyoMetro.Marunouchi.Ikebukuro, needExtraFee: not supplied
- coverage conclusively known: no (6/8 conclusive)

## Timetable-backed pilot scope (derived from the measurements above)

- **Included**: `odpt.Operator:Toei`, `odpt.Operator:TokyoMetro`
- **Excluded**: `odpt.Operator:JR-East` — no_usable_timetable_data_in_audited_corpus

  > In the bounded authenticated production audit, no usable JR-East TrainType, RailDirection, StationTimetable, or TrainTimetable data was returned across the sampled major stations and railways. JR-East therefore cannot participate in the current ODPT timetable-backed pilot.

  Scoped to the audited corpus on purpose. ODPT search completeness is not guaranteed, so this is **observed zero coverage in our audited corpus**, not a claim about universal provider capability.

- Static enrichment may later supply station geography, stop ordering, topology and canonical mapping, but it does NOT provide timetable-backed journey duration while TrainTimetable/StationTimetable evidence is unavailable. Verified schedule duration for such operators may require a different authoritative source.
- Broad StationTimetable queries and whole-railway TrainTimetable queries can exceed the Meguruto boundary's 1 MB response guard; the boundary fails closed with provider_response_too_large. The cap is not raised to normalise broad runtime requests; narrow train-identity queries are the runtime direction.

## Provider-wide reference resources

- operator — available

## Checks

- Boundary-only contact: pass
- No credential in any response: pass
- Operators audited: 3
- Sample source URL (credential-free): https://api.odpt.org/api/v4/odpt:Station?odpt:operator=odpt.Operator%3AJR-East
