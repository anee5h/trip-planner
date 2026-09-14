# KAI-292C4F — trusted ODPT scheduled dataset

## Scope decision

The first truthful bounded scope is **Tokyo Metro Ginza Railway + exact ODPT train
identity `odpt.Train:TokyoMetro.Ginza.A501`**, including every timetable variant
returned for that identity by the reviewed narrow request:

- `odpt.Calendar:Weekday`
- `odpt.Calendar:SaturdayHoliday`

The topology request returned all 19 station identities in
`odpt.Railway:TokyoMetro.Ginza.stationOrder`. This is not a claim that the
entire Ginza Line train roster has been downloaded. `complete_provider_dump`
means complete for the declared exact-train scope only.

## Acquisition evidence

`qa/kai-292c4f/odpt-ginza-a501-source.json` records the credential-free,
normalized responses captured through the existing `/api/odpt` boundary on
2026-09-14. The request set is bounded and deterministic:

- one exact operator request: 1 record;
- one exact railway request: 1 record;
- one railway-scoped station request: 19 records;
- two exact calendar requests: 1 record each;
- one exact train-timetable request: 2 records.

The source evidence contains no consumer key. Provider identities, railway and
station identities, train timetable identities, calendar identities, timetable
order, arrival/departure values, and source provenance are retained exactly.

## Normalization and trust boundary

`scripts/transit/build-odpt-kai-292c4f.ts` feeds the normalized evidence into
`importOdptScheduledDataset()`. The importer rejects missing or duplicate exact
identities, provider/railway/calendar reference mismatches, incomplete station
orders, unknown timetable stations, invalid times, non-monotonic timetable
orders, and inconsistent arrival/departure values. It emits the existing
`NormalizedTransitGraph` and `TransitCoverageReport`; routing does not use an
ODPT-specific shortcut.

The committed asset is:

`public/data/transit/odpt-tokyometro-ginza-a501.json`

It has non-empty operators, stops, routes, route-stops, calendars, scheduled
services, and scheduled stop-times, with imported topology and timetable
coverage and pinned content/coverage hashes. The registry uses the existing
loader and validates the descriptor hashes and provider namespace.

## Deliberate boundary

This PR does not add product endpoint identities, catalogue crosswalks, station
access evidence, UI changes, C4D, or Journey integration. C4E should therefore
clear only `odpt_timetable_not_representable_in_trusted_c2`; structural corridor
readiness remains blocked until the next stack layer supplies exact product
identities and mappings.
