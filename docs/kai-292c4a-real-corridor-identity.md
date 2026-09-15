# KAI-292C4A — real corridor identity audit

## Result

**Real corridor evidenced.** The audit is data-driven and currently returns exactly
one reviewed product corridor over the trusted Toei Oedo GTFS dataset:

- origin product: `toei-oedo-shinjuku-nishiguchi`;
- destination product: `hamarikyu-gardens`;
- origin stop: `gtfs:stop:toei-gtfs:402` (`E-01`);
- destination stop: `gtfs:stop:toei-gtfs:420` (`E-19`); and
- topology: direct scheduled support, with runtime verification
  `not_evaluated`.

Run the deterministic audit with:

```bash
npm run audit:kai-292c4a
```

It reads:

- `src/shared/data/destinations-index.json` for stable catalogue destination IDs;
- `src/shared/data/scheduled-transit-endpoint-crosswalk.json` for explicit exact
  endpoint mappings;
- `qa/kai-292c4g/toei-oedo-shinjuku-nishiguchi-origin-evidence.json` for the
  reviewed product origin and its exact dataset/stop identity;
- `qa/kai-292c4g/hamarikyu-gardens-shiodome-access-evidence.json` for the
  reviewed official station-to-destination binding; and
- the registered normalized dataset descriptors and their assets.

The audit does not infer an identity from a display name, coordinates, nearest
stop, parent station, route membership, or fuzzy match. `realCorridors` is a
computed `RealCorridor[]`, and the accepted C4G corridor is marked
`selection: "preferred"`.

## Current evidence

| Evidence | Observed result |
| --- | --- |
| Canonical catalogue | 1,130 records; 1,130 unique stable destination IDs |
| Explicit catalogue destination crosswalk entries | 1: `hamarikyu-gardens` |
| Reviewed product origin identities | 1: `toei-oedo-shinjuku-nishiguchi` |
| Registered normalized scheduled-transit datasets | 2: `sakata-runrunbus`, `toei-oedo-gtfs-20260314` |
| Valid registered normalized assets | 2, including `src/shared/data/transit/toei-oedo-gtfs-20260314.json` published as `/data/transit/toei-oedo-gtfs-20260314.json.gz` |
| Toei Oedo normalized graph | 38 stops, 1 route, 839 scheduled services, 30,323 scheduled stop-time facts |
| Unregistered deployable transit assets | 0 |
| Crosswalk entries | 4: 2 non-product Sakata pilot mappings and 2 Toei product mappings |
| Reviewed station-access evidence | 1 exact Hamarikyu Gardens → Shiodome binding |
| Real corridors returned | 1 preferred direct corridor |

The Sakata entries remain C2 boundary proof only:

- `kai-292c2-pilot-origin-sakata-100-01` → GTFS `100_01`;
- `kai-292c2-pilot-destination-sakata-17-01` → GTFS `17_01`.

Their IDs are deliberately not Meguruto product identities. Sakata does not
become product coverage merely because it is a valid normalized dataset.

## Accepted C4G corridor

The production crosswalk contains exactly two Toei mappings:

- `kai-292c4g-origin-toei-oedo-shinjuku-nishiguchi` → provider stop `402`,
  station code `E-01`;
- `kai-292c4g-destination-hamarikyu-gardens-shiodome` → provider stop `420`,
  station code `E-19`.

Both use dataset `toei-oedo-gtfs-20260314`, provider `gtfs`, and namespace
`toei-gtfs`. The official Hama-rikyu Gardens access page names “Toei O-edo Line
Shiodome Sta. E-19” and seven minutes on foot. The dedicated access evidence
binds that source statement to the exact GTFS stop identity and the mapping’s
provider station code; it does not use geographic proximity or a name join.

The reviewed origin evidence likewise carries the exact dataset, provider,
namespace, provider stop, normalized stop, and station code. Pair evaluation
rejects an origin evidence record whose exact metadata disagrees with its
crosswalk mapping. Access evaluation rejects a destination evidence record
whose exact metadata or station code disagrees with its crosswalk mapping.

The accepted corridor records one direct supported scheduled topology, 839
scheduled services, 30,323 scheduled stop-time facts, and runtime state
`not_evaluated`. C4A has no authoritative service date or departure time and
does not construct a runtime `Journey`.

## Candidate acceptance contract

For every candidate pair, the audit requires:

1. a reviewed stable product origin identity with exact dataset, provider,
   namespace, normalized stop, provider stop, and station code;
2. a destination mapping whose exact product ID is present in the catalogue;
3. exactly one explicit mapping for each endpoint;
4. the same registered dataset/provider/namespace scope on both mappings;
5. a dedicated reviewed station-access record whose exact scope, stop, and
   declared provider station code match the destination mapping;
6. a valid registered asset whose graph stop, canonical normalized ID, stop
   provenance, provider, dataset, and namespace agree with both mappings;
7. imported topology/timetable coverage with scheduled services and stop-time
   facts; and
8. direct or exactly-one-transfer supported scheduled corridor topology.

A candidate that fails any gate is reported in `candidateBlockers` and is not
returned in `realCorridors`. Unregistered assets, invalid registered assets,
wrong provider/dataset/namespace, ambiguous mappings, graph/provenance errors,
missing timetable coverage, and unsupported transfer evidence remain blocked.
Runtime verification remains `not_evaluated` until a later Journey slice supplies
authoritative temporal evidence.

## KAI-291A reviewed anchors

The seven reviewed TokyoMetro/Toei geographic anchors from
`qa/kai-291/destination-station-anchors.json` remain audit evidence only. They
are not rewritten as GTFS identities and are not promoted into the C4G product
crosswalk. In particular, the legacy ODPT Shiodome anchor and the C4G GTFS
Shiodome binding are separate provider identities; the latter is established by
the dedicated official access evidence and exact GTFS mapping.

## Validation surface

The focused tests cover:

- exact reviewed origin and destination resolution;
- official station-access evidence and exact station-code binding;
- wrong dataset, provider, and identity namespace rejection;
- duplicate origin and destination ambiguity;
- no name, coordinate, nearest, fuzzy, or geographic-anchor fallback;
- exactly two Toei production mappings and exactly one preferred corridor;
- direct scheduled service/stop-time evidence with runtime `not_evaluated`;
- C4E product-gate clearing while C4D runtime blockers remain; and
- Sakata pilot treatment as non-product evidence.
