# KAI-291B1 — normalized static transit graph foundation

Provider-agnostic STATIC transit model that later ODPT and GTFS/GTFS-JP
imports both target. This slice is **not the router** and connects to
nothing: no Journey, no TripDuration, no recommendation, no fares UI.

```
provider dataset
    ↓
provider-specific parser (here: ODPT rail)
    ↓
normalized Meguruto transit graph   ← B1 builds this
    ↓
coverage/provenance registry        ← B1 founds this
```

Later: normalized graph → KAI-292 journey routing.

## Product boundary

The transit graph exists to improve **recommendation, feasibility,
approximate cost, and confidence**. It is NOT a new navigation product:
no turn-by-turn, no live departures, no navigation UI.

## What B1 establishes

- **A. Normalized graph contract** —
  `src/shared/services/transport/static/transitGraphTypes.ts`
- **B. Deterministic ODPT rail topology importer** —
  `.../static/odptRailTopologyImporter.ts`
- **C. Committed realistic fixture** —
  `.../static/__tests__/fixtures/odptRailTopologyFixture.json`
- **D. Golden + idempotence tests** — golden JSON plus the regen CLI
  `scripts/transit/import-odpt-rail-topology.ts`
- **E. Provenance/version model** — per-entity provenance references plus
  `TransitDatasetVersion` with content hash
- **F. Coverage-registry foundation** — `TransitCoverageReport`, one entry
  per (provider, operator, rail) scope

## Normalized model

| Entity | Key semantics |
|---|---|
| `TransitDatasetVersion` | provider, datasetId, sourceType, sourceDescriptor, retrievedAt/checkedAt (explicit input), issuedAt/validUntil (provider-declared only), schemaVersion, contentHash |
| `TransitOperator` | internal id + exact provider operator id + open-ended names + provenance |
| `TransitStop` | internal id + exact provider stop id, station/bus_stop, nullable coordinates, operator ids, open-ended names, station code (metadata, not identity) |
| `TransitRoute` | internal id + exact provider route id, operator id, mode, names, direction evidence |
| `TransitRouteStop` | route id + stop id + provider order (`odpt:index`), provider order preserved |
| `TransitServiceCalendar` | exact provider calendar id, base/specific kind, raw day/duration passthrough |
| `TransitTransfer` | **reserved, empty** — provider-defined only, never proximity-inferred |
| scheduled services / fares | **reserved, empty** — fares stay unknown-safe (missing is null, never 0) |

## Provider identity rules

- Internal ids are deterministic namespaced derivations of
  `provider + exact provider identity`, e.g.
  `odpt:station:odpt.Station:TokyoMetro.Ginza.Ueno`.
- Deterministic, reversible (strip the prefix), collision-resistant,
  independent of localized display names.
- **No merging**: the ODPT Shinjuku record and any future GTFS Shinjuku
  record remain distinct unless a deterministic crosswalk explicitly proves
  equivalence. That crosswalk is later work, not B1.
- **What is canonicalized**: id namespaces, collection ordering,
  serialization. **What is not**: display names (passed through open-ended,
  all languages), provider ordering, raw calendar values.

## Provenance model

Every entity carries a compact reference: provider, exact provider id,
source resource type, dataset id, and the explicitly supplied retrieval
timestamp. Raw provider records are NOT duplicated into entities. The
dataset version binds everything with a SHA-256 content hash over the
canonical serialization. No credentials anywhere.

## Deterministic import

Identical fixture bytes + identical explicit metadata → byte-identical
output. No `Date.now()`, no random UUIDs, no environment reads, no machine
paths. Semantically unordered collections sort by id; route-stop sequences
keep provider order. Proven by: golden byte-identity test, run-twice test,
shuffled-input test, content-hash test.

## Coverage states

Per scope: `imported`, `partial`, `unsupported`, `ambiguous_identity`,
`missing_timetable`, `missing_fare`, `not_imported_in_this_slice`,
`not_evaluated`. `unsupported`/`partial` are legitimate evidence states,
not exceptions — limitations are never collapsed into a Boolean
"supported". In B1, rail topology is `imported`; timetable and fare are
`not_imported_in_this_slice`; realtime is `not_evaluated`.

## Why fixture/offline only

B1 proves the **contract** before any network code exists. Ordinary ODPT
search results can be truncated, so completeness-oriented imports must
eventually use Data Dump resources — but the dump downloader, HTTP/301
handling, refresh, and last-known-good promotion belong in B2 and run
against this same importer. No live fetch here keeps the model review
independent of network-fetch security, and no claim is made that the
fixture represents complete Tokyo coverage.

## Validation (fail closed)

The importer rejects rather than repairs: route ordering an unknown
station, duplicate provider identities (even byte-identical), non-numeric
or duplicate `odpt:index`, operator/railway references outside the
imported scope, present-but-malformed coordinates. Legitimately missing
coordinates stay null; missing fares stay unknown.

## KAI-291A relationship

KAI-291A remains authoritative for destination → exact ODPT station
anchors; B1 neither rewrites nor consumes the seven anchors in runtime
code. A narrow contract test proves a KAI-291A identity string
(`odpt.Station:TokyoMetro.Ginza.Ueno`) is usable as-is as the normalized
graph's `providerStopId` — no conversion layer needed.

## Planned continuation (not implemented)

- **KAI-291B2** — ODPT Data Dump downloader / refresh / safe 301 handling /
  validation / last-known-good promotion, feeding this same importer
- **KAI-291C** — GTFS + GTFS-JP adapter targeting the same normalized model
- **KAI-291D** — timetable/calendar/stop_times/fare enrichment + coverage
  expansion, including ODPT bus evaluation where licensed/available
- **KAI-292** — timetable-aware journey routing over the normalized graph
