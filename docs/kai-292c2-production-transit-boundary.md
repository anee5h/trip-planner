# KAI-292C2 — production scheduled-transit data boundary

## Audit before mutation

The repository already has one normalized graph contract in
`src/shared/services/transport/static/transitGraphTypes.ts`. The graph carries
provider, stable feed namespace, exact provider identities, provenance, dataset
metadata, and the KAI-291 semantic content hash. The existing builders are:

- `odptRailTopologyImporter.ts` for the normalized ODPT topology and semantic
  hashing;
- `gtfsTopologyImporter.ts` for GTFS/GTFS-JP topology;
- `gtfsScheduleImporter.ts` for service calendars and absolute service-day
  seconds;
- `gtfsTransferImporter.ts` for explicit `transfers.txt` evidence;
- `scheduledJourneyRouter.ts`,
  `oneTransferScheduledJourneyRouter.ts`, and
  `scheduledJourneyComposer.ts` for the unchanged direct, one-transfer, and
  composed routing kernels.

The current product path remains:

```text
recommendation / feasibility
  -> TripDurationService
  -> OriginAwareTransportService
  -> compatibility Journey
```

`Journey`, `JourneyBuilder`, and `JourneyEndpoints` already provide the
canonical multi-leg shape. `OriginAwareTransportEstimate` remains a single-mode
compatibility estimate and was not redesigned. The destination catalogue uses
stable destination IDs, but its station-related transport fields are not an
exact normalized GTFS identity bridge. The current origin flow stores a
station-like label and coordinates, not an exact normalized stop ID. The
existing KAI-291 station-anchor artifact is an ODPT audit artifact and is not
silently reused as a GTFS identity.

Before C2 there was no production loader for a normalized scheduled graph plus
matching coverage. Raw ODPT and GTFS/GTFS-JP data are local/import-script
inputs; `.cache/` is ignored and is not a deployable runtime source. The
existing generated-data convention is a plain `public/data` asset fetched by a
module-level lazy loader, as used by `PlaceCatalog.ts`.

The C1 readiness audit therefore remains accurate: production currently cannot
truthfully provide all of graph, matching coverage, exact origin stop ID, exact
destination stop ID, explicit service date, and explicit departure seconds.
C2 adds only the data and identity seam; it does not manufacture the missing
C3 temporal inputs.

## Chosen loading strategy

C2 publishes the bounded, already audited Sakata City GTFS-JP pilot as one
plain JSON asset:

```text
public/data/transit/sakata-runrunbus.json
```

The artifact contains exactly one coherent envelope:

```text
artifactSchemaVersion
metadata { dataset/version/source/hash/namespace }
graph
coverage
```

The browser does not import the graph as a JavaScript module. The loader fetches
it lazily, caches the in-flight and successful result at module scope, and
removes a rejected promise so a later call can retry. This preserves the
repository's existing runtime-asset convention and avoids placing the graph in
the application bootstrap bundle. The pilot measures 2,287,596 bytes of minified JSON
and 82,816 bytes gzip; the graph is not national. It is acceptable as a bounded
pilot but is not a justification for eagerly loading a national graph. Future
feeds can receive separate registry entries and assets, preserving namespace
boundaries.

The generator reads the ignored local feed only; it never downloads data. It
runs the existing GTFS schedule and transfer importers, pins fixed observation
metadata, verifies the known semantic and coverage hashes, and can check that
the committed asset is fresh. The artifact itself is deployable through the
existing Vite/Cloudflare Pages `public/` static-asset path.

## Dataset validation

`scheduledTransitDataset.ts` validates the complete unit at load time:

- artifact schema matches the pinned registry;
- metadata provider, feed namespace, dataset ID, normalized schema version,
  source type, and completeness match the pinned registry;
- graph dataset version and envelope metadata agree field-for-field;
- graph and coverage dataset IDs and schema versions agree;
- every coverage entry belongs to the same provider and dataset;
- every graph entity retains the expected provider, feed namespace, dataset ID,
  and inspectable provider identity;
- normalized stop IDs remain the exact namespaced IDs built by the existing
  `makeTransitEntityId` contract;
- the existing KAI-291 semantic graph hash is recomputed and must equal both
  `graph.datasetVersion.contentHash` and the pinned registry hash;
- the exact coverage report hash is recomputed and must equal metadata and the
  pinned registry.

Any disagreement throws a typed fail-closed error. The loader never accepts a
graph from one dataset and coverage from another, and it never lets an asset
redefine its own expected hash.

## Endpoint identity bridge

`scheduledTransitEndpoint.ts` defines one strict resolver over an explicit
crosswalk. Each entry contains:

```text
mappingId
endpoint { kind: origin | destination, productId }
datasetId
provider
identityNamespace
providerStopId
normalizedStopId
provenance { evidenceId, statement, sourceUrl, checkedAt }
```

`productId` is an existing stable product identity slot, not a display name.
The resolver filters by the loaded dataset's exact dataset/provider/namespace,
then returns `resolved`, `unmapped`, `ambiguous`, or `invalid_query`. It never
uses names, Japanese/English equality, coordinates, nearest-stop logic,
proximity, parent stations, route membership, or fuzzy matching.

The committed two-entry Sakata crosswalk is a C2 boundary-proof pilot:

- one explicit origin endpoint → provider `stop_id=100_01`;
- one explicit destination endpoint → provider `stop_id=17_01`.

Sakata is not currently a destination record in the Meguruto catalogue, and
Meguruto's current origin store does not expose a canonical station identity.
Therefore these two IDs are explicitly labelled boundary-pilot product
identities, not claims that live catalogue/user endpoints have already been
mapped. The bridge is ready for real catalogue/origin IDs only when an
explicit reviewed crosswalk is added. Current catalogue and user-origin
records remain unmapped rather than guessed.

The bounded audit reports 2 mapped and 2 unmapped endpoints, with 0 ambiguous
endpoints in the audited set. Negative tests construct conflicting mappings and
require `ambiguous`; they do not silently choose one. Two identical raw stop
IDs in different provider/feed namespaces remain different normalized
identities.

## Boundary proof

The service test loads the committed asset through the same lazy loader,
validates graph plus coverage, resolves the explicit origin and destination,
and passes only the returned exact normalized IDs to the existing
`routeBestScheduledJourney(...)` composer using a fixed test date and fixed
service-day departure seconds. It verifies the expected direct journey. This
is an internal seam test only.

No Home, Explore, destination, recommendation, feasibility, planner, UI,
`TripDurationService`, or `OriginAwareTransportService` integration is added.
A future C4 integration must preserve the canonical multi-leg Journey and must
not flatten `bus -> train` or another multi-leg result into the single-mode
`OriginAwareTransportEstimate`.

## Limitations and next slice

- The Sakata pilot is bounded, not nationwide.
- Its `transfers.txt` is empty; provider transfer rows remain synthetically
  validated by existing tests. The empty explicit-rule state is still valid
  transfer evidence and does not mean an invalid query.
- No current user-origin or destination catalogue record is automatically
  mapped.
- Explicit service date and departure time remain C3 responsibilities. C2
  introduces no 09:00 default, `Date.now()`, browser clock, implicit date, or
  arbitrary morning assumption.
- No recommendation, feasibility, planner, UI, fare, realtime, access/egress,
  nearest-stop, geospatial, or new routing capability is included.
