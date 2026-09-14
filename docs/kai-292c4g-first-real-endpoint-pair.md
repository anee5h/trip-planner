# KAI-292C4G — first real ODPT product endpoint pair

## Pair

The first product-safe origin is the explicit station-selection identity
`tokyo-metro-ginza-asakusa`, bound to exact
`odpt.Station:TokyoMetro.Ginza.Asakusa` in the C4F dataset. It is not a free
text origin, coordinate, nearest-station result, or inferred user location.

The destination is the existing catalogue product `ueno-park`. Its exact
station mapping is `odpt.Station:TokyoMetro.Ginza.Ueno` in the same dataset.

The pair is therefore:

`tokyo-metro-ginza-asakusa` → `ueno-park`

using Tokyo Metro Ginza train identity `odpt.Train:TokyoMetro.Ginza.A501`.
The A501 timetable runs from Asakusa through Ueno, so the C4A structural
corridor is direct and does not require an inferred transfer.

## Exact destination-access binding

`qa/kai-292c4g/ueno-park-station-access-evidence.json` records the reviewed
access relation and its identity binding:

1. The Tokyo Metropolitan Park Association source states access from Ueno
   Station.
2. The Tokyo Metro operator source identifies Ueno as Ginza station G-16.
3. The C4F ODPT graph contains the exact provider station identity
   `odpt.Station:TokyoMetro.Ginza.Ueno`, station code `G-16`, operator
   `odpt.Operator:TokyoMetro`, and railway
   `odpt.Railway:TokyoMetro.Ginza`.

The binding is made by exact provider station code and railway. Display-name,
coordinate, nearest-station, and fuzzy matching are explicitly rejected.

## Crosswalk and audit result

`src/shared/data/scheduled-transit-endpoint-crosswalk.json` adds exactly two
ODPT mappings for this pair. The existing Sakata pilot mappings remain in the
file but are not catalogue product identities and are not promoted.

The generated C4A report is
`qa/kai-292c4g/real-corridor-audit.json`:

- `status: real_corridor_evidenced`;
- `realCorridors: 1`;
- topology: `direct`;
- transfer count: `0`;
- scheduled services: `2`;
- scheduled stop-times: `38`;
- runtime verification: `not_evaluated`.

C4E now sees the exact pair and the C4F dataset, while the global seven-anchor
report remains conservative because six other anchors still lack exact access
bindings. C4H is responsible for the controlled temporal input and actual
Journey routing.
