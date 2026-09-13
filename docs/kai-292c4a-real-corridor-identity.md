# KAI-292C4A — real corridor identity audit

## Result

**Blocked: no real Meguruto origin → destination scheduled-transit corridor is
currently evidenced.** The audit is data-driven and still returns the concrete
blocker: current C2 crosswalk entries are the two non-catalogue Sakata pilot
identities, while the C4A identity-evidence file contains no reviewed product
origin identity.

Run the deterministic audit with:

```bash
npm run audit:kai-292c4a
```

It reads:

- `src/shared/data/destinations-index.json` for stable catalogue destination IDs;
- `src/shared/data/scheduled-transit-endpoint-crosswalk.json` for explicit exact
  endpoint mappings;
- `qa/kai-292c4a/real-corridor-identity-evidence.json` for reviewed product
  origin identities; and
- the registered normalized dataset descriptors and their assets.

The audit does not infer an identity from a display name, coordinates, nearest
stop, parent station, route membership, or fuzzy match. `realCorridors` is a
computed `RealCorridor[]`, not a permanently empty type.

## Current evidence

| Evidence | Observed result |
| --- | --- |
| Canonical catalogue | 1,130 records; 1,130 unique stable destination IDs |
| Explicit catalogue destination crosswalk entries | 0 |
| Reviewed product origin identities | 0 |
| Registered normalized scheduled-transit datasets | 1: `sakata-runrunbus` |
| Valid registered normalized assets | 1: `public/data/transit/sakata-runrunbus.json` |
| Sakata normalized graph | 252 stops, 6 routes, 49 scheduled services, 1,961 scheduled stop-time facts |
| Unregistered deployable transit assets | 0 |
| Crosswalk entries | 2, both non-catalogue boundary-pilot product IDs |
| Real corridors returned | 0 |

The existing crosswalk entries remain C2 boundary proof only:

- `kai-292c2-pilot-origin-sakata-100-01` → GTFS `100_01`;
- `kai-292c2-pilot-destination-sakata-17-01` → GTFS `17_01`.

Their IDs are deliberately not Meguruto product identities. The valid Sakata
artifact proves that normalized scheduled-transit data exists; it does not
prove a current Meguruto origin or catalogue destination corridor.

## Candidate acceptance contract

For every candidate pair, the audit requires all of the following:

1. a reviewed, stable product origin identity (`identityKind: "product"`,
   `identityStability: "stable_product_id"`, and `reviewStatus: "reviewed"`) in
   `real-corridor-identity-evidence.json`;
2. a destination mapping whose exact `productId` is present in the current
   catalogue;
3. exactly one explicit exact mapping for each endpoint;
4. the same registered dataset ID, provider, and identity namespace on both
   mappings;
5. a valid registered asset whose graph stop, canonical normalized ID, stop
   provenance, provider, dataset, and namespace all agree with both mappings;
6. imported topology/timetable coverage with scheduled services and stop-time
   facts; and
7. direct or exactly-one-transfer supported scheduled corridor topology. A
   transfer path requires one sufficient, exact, unambiguous, trusted explicit
   transfer rule from the normalized graph.

A candidate that fails any gate is reported in `candidateBlockers` and is not
returned in `realCorridors`. Unregistered assets, invalid registered assets,
wrong provider/dataset/namespace, ambiguous mappings, graph/provenance errors,
missing timetable coverage, two-transfer-only structures, and inconclusive,
ambiguous, or untrusted transfer evidence remain blocked. The structural result
does not construct or claim a runtime `Journey`: C4A has no authoritative
service date or departure time, so runtime verification remains
`not_evaluated`.

Future reviewed data can change the result by adding an origin identity to the
identity-evidence file and adding exact origin/destination mappings to the
crosswalk. The audit logic does not need to change. Sakata pilot IDs must remain
non-product identities; they must not be relabelled as catalogue coverage.

## KAI-291A reviewed anchors

The audit reports the seven reviewed TokyoMetro/Toei geographic anchors from
`qa/kai-291/destination-station-anchors.json` as:

| Destination | Reviewed station identity | Operator |
| --- | --- | --- |
| `shinjuku-gyo-en` | `odpt.Station:TokyoMetro.Marunouchi.ShinjukuGyoemmae` | TokyoMetro |
| `teamlab-borderless-azabudai` | `odpt.Station:TokyoMetro.Hibiya.Kamiyacho` | TokyoMetro |
| `ueno-park` | `odpt.Station:TokyoMetro.Ginza.Ueno` | TokyoMetro |
| `hamarikyu-gardens` | `odpt.Station:Toei.Oedo.Shiodome` | Toei |
| `sumida-hokusai-museum` | `odpt.Station:Toei.Oedo.Ryogoku` | Toei |
| `ryogoku-kokugikan-sumo-museum` | `odpt.Station:Toei.Oedo.Ryogoku` | Toei |
| `sugamo-jizo-dori` | `odpt.Station:Toei.Mita.Sugamo` | Toei |

These are reviewed geographic station candidates, not C2 production crosswalks.
They are therefore marked `reviewed_insufficient_for_corridor`, with
`productionCrosswalk: false`. They do **not** prove station-to-POI access, so
`stationToPoiAccess` remains `unproven`. No anchor is promoted into
`realCorridors` without the C4A identity, exact mapping, registered dataset,
graph/provenance, and timetable gates above.

## Concrete blockers

1. **`missing_catalogue_destination_crosswalk`** — no exact crosswalk maps any
   current catalogue destination ID to a normalized stop.
2. **`missing_canonical_origin_identity`** — the current origin evidence has no
   reviewed canonical product identity; the origin flow's station label and
   coordinates are not identity evidence.
3. **`pilot_only_normalized_evidence`** — the only valid registered asset is the
   bounded Sakata RunRunBus pilot, whose crosswalk product IDs are explicitly
   non-catalogue pilot identities.

This is an identity prerequisite/blocker result, not a claim of real Sakata
product coverage.

## Validation surface

The focused tests cover:

- the current blocker and non-product Sakata pilot treatment;
- synthetic future valid-candidate discovery by changing only data files;
- wrong dataset, provider, and identity namespace rejection;
- direct, exactly-one-transfer, two-transfer-only, and transfer-evidence
  coverage decisions;
- missing direct or exactly-one-transfer scheduled-support rejection;
- reporting of all seven KAI-291A anchors as insufficient evidence; and
- no name, coordinate, nearest, or geographic-anchor fallback.
