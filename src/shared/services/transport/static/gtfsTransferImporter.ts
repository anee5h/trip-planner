/**
 * KAI-291D1 — bounded GTFS/GTFS-JP transfer evidence enrichment.
 *
 * This module is a separate opt-in boundary on top of C1/C2. It preserves
 * provider transfer rules and references; it does not search timetables or
 * route journeys.
 */

import { contentHashOf } from "./odptRailTopologyImporter";
import { stableStringify } from "./contentHash";
import {
  gtfsRouteInternalId,
  gtfsRouteStopsForSemanticHash,
  gtfsStopInternalId,
  type GtfsImportMetadata,
} from "./gtfsTopologyImporter";
import { makeTransitEntityId } from "./transitEntityId";
import type { GtfsFeedTables, GtfsTableRow } from "./gtfsTypes";
import type {
  GtfsTransferType,
  NormalizedTransitGraph,
  TransitCoverageEntry,
  TransitCoverageReport,
  TransitDatasetCompleteness,
  TransitProvenance,
  TransitRoute,
  TransitRouteMode,
  TransitScheduledService,
  TransitStop,
  TransitTransfer,
} from "./transitGraphTypes";
import { isOffsetAwareDatetime } from "./odptRailTopologyImporter";

export const GTFS_TRANSFER_SCHEMA_VERSION = "kai-291d1-v1";

export type GtfsTransferMetadata = GtfsImportMetadata;

export type GtfsTransferImportErrorCode =
  | "invalid_metadata"
  | "invalid_transfer_record"
  | "missing_transfer_reference"
  | "invalid_transfer_type"
  | "invalid_min_transfer_time"
  | "duplicate_transfer_identity"
  | "unknown_stop_reference"
  | "unknown_route_reference"
  | "unknown_trip_reference"
  | "trip_route_mismatch"
  | "invalid_linked_transfer_stop"
  | "ambiguous_transfer_rules"
  | "transfer_graph_mismatch";

export class GtfsTransferImportError extends Error {
  readonly code: GtfsTransferImportErrorCode;

  constructor(code: GtfsTransferImportErrorCode, message: string) {
    super(`gtfs-transfer[${code}]: ${message}`);
    this.name = "GtfsTransferImportError";
    this.code = code;
  }
}

export interface GtfsTransferImportBase {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
}

export interface GtfsTransferImportResult {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
  readonly importedTransferCount: number;
}

type ExistingGraph =
  | NormalizedTransitGraph
  | {
      readonly graph: NormalizedTransitGraph;
      readonly coverage: TransitCoverageReport;
    };

interface TransferScope {
  readonly fromStopId: string | null;
  readonly toStopId: string | null;
  readonly fromRouteId: string | null;
  readonly toRouteId: string | null;
  readonly fromServiceId: string | null;
  readonly toServiceId: string | null;
}

interface ResolvedStop {
  readonly normalized: TransitStop;
}

interface ResolvedRoute {
  readonly normalized: TransitRoute;
}

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function optionalString(row: GtfsTableRow, field: string): string | null {
  const value = row[field];
  if (value !== undefined && typeof value !== "string") {
    throw new GtfsTransferImportError(
      "invalid_transfer_record",
      `${field} must be a string when present.`,
    );
  }
  return value === undefined || value.length === 0 ? null : value;
}

function transferType(row: GtfsTableRow): GtfsTransferType {
  const value = row.transfer_type;
  if (typeof value !== "string") {
    throw new GtfsTransferImportError(
      "invalid_transfer_type",
      "transfer_type is required and must be a GTFS enum value.",
    );
  }
  if (value === "" || value === "0") return 0;
  if (value === "1") return 1;
  if (value === "2") return 2;
  if (value === "3") return 3;
  if (value === "4") return 4;
  if (value === "5") return 5;
  throw new GtfsTransferImportError(
    "invalid_transfer_type",
    `transfer_type must be 0 through 5, found ${JSON.stringify(value)}.`,
  );
}

function minimumTransferSeconds(row: GtfsTableRow): number | null {
  const value = optionalString(row, "min_transfer_time");
  if (value === null) return null;
  if (!/^\d+$/.test(value)) {
    throw new GtfsTransferImportError(
      "invalid_min_transfer_time",
      `min_transfer_time must be a non-negative integer, found ${JSON.stringify(value)}.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new GtfsTransferImportError(
      "invalid_min_transfer_time",
      "min_transfer_time is outside the safe integer range.",
    );
  }
  return parsed;
}

function validateMetadata(metadata: GtfsTransferMetadata): void {
  const invalid = (message: string): never => {
    throw new GtfsTransferImportError("invalid_metadata", message);
  };
  if (metadata.provider !== "gtfs" && metadata.provider !== "gtfs-jp") {
    invalid("provider must be gtfs or gtfs-jp.");
  }
  for (const [field, value] of [
    ["datasetId", metadata.datasetId],
    ["identityNamespace", metadata.identityNamespace],
    ["sourceDescriptor", metadata.sourceDescriptor],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      invalid(`${field} must be a non-empty string.`);
    }
  }
  if (!isOffsetAwareDatetime(metadata.retrievedAt)) {
    invalid("retrievedAt must be an offset-aware datetime.");
  }
  if (!isOffsetAwareDatetime(metadata.checkedAt)) {
    invalid("checkedAt must be an offset-aware datetime.");
  }
  for (const field of ["issuedAt", "validUntil"] as const) {
    const value = metadata[field];
    if (
      value !== undefined &&
      value !== null &&
      !isOffsetAwareDatetime(value)
    ) {
      invalid(`${field} must be an offset-aware datetime when present.`);
    }
  }
  if (
    ![
      "fixture_subset",
      "bounded_subset",
      "complete_provider_dump",
      "unknown",
    ].includes(metadata.completeness)
  ) {
    invalid("completeness is outside the normalized contract.");
  }
  if (
    metadata.completeness === "complete_provider_dump" &&
    metadata.sourceType !== "data_dump"
  ) {
    invalid("complete_provider_dump requires sourceType data_dump.");
  }
}

function graphOf(existing: ExistingGraph): {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport | undefined;
} {
  if ("graph" in existing) {
    return { graph: existing.graph, coverage: existing.coverage };
  }
  return { graph: existing, coverage: undefined };
}

function validateGraph(
  graph: NormalizedTransitGraph,
  metadata: GtfsTransferMetadata,
): void {
  if (graph.datasetVersion.provider !== metadata.provider) {
    throw new GtfsTransferImportError(
      "transfer_graph_mismatch",
      `graph provider ${graph.datasetVersion.provider} does not match ${metadata.provider}.`,
    );
  }
  const provenanceNamespaces = [
    ...graph.stops,
    ...graph.routes,
    ...(graph.scheduledServices ?? []),
  ].map((entity) => entity.provenance.identityNamespace);
  if (
    provenanceNamespaces.some(
      (namespace) => namespace !== metadata.identityNamespace,
    )
  ) {
    throw new GtfsTransferImportError(
      "transfer_graph_mismatch",
      "graph entity namespace does not match transfer metadata.",
    );
  }
}

function stopByProviderId(
  graph: NormalizedTransitGraph,
  metadata: GtfsTransferMetadata,
  providerId: string | null,
): ResolvedStop | null {
  if (providerId === null) return null;
  const expectedId = gtfsStopInternalId(
    metadata.provider,
    providerId,
    metadata.identityNamespace,
  );
  const normalized = graph.stops.find(
    (stop) =>
      stop.id === expectedId &&
      stop.provider === metadata.provider &&
      stop.providerStopId === providerId &&
      stop.provenance.identityNamespace === metadata.identityNamespace,
  );
  if (normalized === undefined) {
    throw new GtfsTransferImportError(
      "unknown_stop_reference",
      `transfers references unknown stop ${providerId}.`,
    );
  }
  return { normalized };
}

function routeByProviderId(
  graph: NormalizedTransitGraph,
  metadata: GtfsTransferMetadata,
  providerId: string | null,
): ResolvedRoute | null {
  if (providerId === null) return null;
  const expectedId = gtfsRouteInternalId(
    metadata.provider,
    providerId,
    metadata.identityNamespace,
  );
  const normalized = graph.routes.find(
    (route) =>
      route.id === expectedId &&
      route.provider === metadata.provider &&
      route.providerRouteId === providerId &&
      route.provenance.identityNamespace === metadata.identityNamespace,
  );
  if (normalized === undefined) {
    throw new GtfsTransferImportError(
      "unknown_route_reference",
      `transfers references unknown route ${providerId}.`,
    );
  }
  return { normalized };
}

function serviceByProviderId(
  graph: NormalizedTransitGraph,
  metadata: GtfsTransferMetadata,
  providerId: string | null,
): TransitScheduledService | null {
  if (providerId === null) return null;
  const expectedId = makeTransitEntityId(
    metadata.provider,
    "scheduled_service",
    metadata.identityNamespace,
    providerId,
  );
  const normalized = graph.scheduledServices?.find(
    (service) =>
      service.id === expectedId &&
      service.provider === metadata.provider &&
      service.providerServiceId === providerId &&
      service.provenance.identityNamespace === metadata.identityNamespace,
  );
  if (normalized === undefined) {
    throw new GtfsTransferImportError(
      "unknown_trip_reference",
      `transfers references unknown C2 scheduled service ${providerId}.`,
    );
  }
  return normalized;
}

function isStation(stop: TransitStop): boolean {
  const semantics = stop.sourceSemantics;
  return semantics !== undefined && semantics.locationType === 1
    ? true
    : stop.stopType === "station";
}

function transferIdentity(scope: TransferScope): string {
  // This is the current GTFS primary-key order. It deliberately excludes the
  // rule value: a second rule for the same key is a duplicate, not a winner.
  return stableStringify([
    scope.fromStopId,
    scope.toStopId,
    scope.fromServiceId,
    scope.toServiceId,
    scope.fromRouteId,
    scope.toRouteId,
  ]);
}

function transferSpecificity(scope: TransferScope): number {
  const fromTrip = scope.fromServiceId !== null;
  const toTrip = scope.toServiceId !== null;
  const fromRoute = scope.fromRouteId !== null;
  const toRoute = scope.toRouteId !== null;
  if (fromTrip && toTrip) return 6;
  if ((fromTrip && toRoute) || (fromRoute && toTrip)) return 5;
  if (fromTrip || toTrip) return 4;
  if (fromRoute && toRoute) return 3;
  if (fromRoute || toRoute) return 2;
  return 1;
}

function stopScopeIds(
  graph: NormalizedTransitGraph,
  stopId: string | null,
): ReadonlySet<string> | null {
  if (stopId === null) return null;
  const stop = graph.stops.find((candidate) => candidate.id === stopId);
  if (stop === undefined || !isStation(stop)) return new Set([stopId]);
  const childIds = graph.stops
    .filter((candidate) => {
      const semantics = candidate.sourceSemantics;
      return (
        candidate.id === stopId ||
        (semantics !== undefined &&
          semantics.locationType === 0 &&
          semantics.parentStation === stop.providerStopId)
      );
    })
    .map((candidate) => candidate.id);
  return new Set(childIds.length === 0 ? [stopId] : childIds);
}

function stopScopesOverlap(
  graph: NormalizedTransitGraph,
  a: string | null,
  b: string | null,
): boolean {
  const first = stopScopeIds(graph, a);
  const second = stopScopeIds(graph, b);
  if (first === null || second === null) return true;
  for (const id of first) if (second.has(id)) return true;
  return false;
}

function serviceRouteId(
  graph: NormalizedTransitGraph,
  serviceId: string,
): string | null {
  return (
    graph.scheduledServices?.find((service) => service.id === serviceId)
      ?.routeId ?? null
  );
}

function sideScopesOverlap(
  graph: NormalizedTransitGraph,
  firstServiceId: string | null,
  firstRouteId: string | null,
  secondServiceId: string | null,
  secondRouteId: string | null,
): boolean {
  if (firstServiceId !== null && secondServiceId !== null) {
    return firstServiceId === secondServiceId;
  }
  if (firstServiceId !== null) {
    return (
      secondRouteId === null ||
      serviceRouteId(graph, firstServiceId) === secondRouteId
    );
  }
  if (secondServiceId !== null) {
    return (
      firstRouteId === null ||
      serviceRouteId(graph, secondServiceId) === firstRouteId
    );
  }
  return firstRouteId === null || secondRouteId === null
    ? true
    : firstRouteId === secondRouteId;
}

function assertNoAmbiguousRules(
  graph: NormalizedTransitGraph,
  transfers: readonly TransitTransfer[],
): void {
  const scoped = transfers.map((transfer) => ({
    transfer,
    specificity: transferSpecificity({
      fromStopId: transfer.fromStopId,
      toStopId: transfer.toStopId,
      fromRouteId: transfer.fromRouteId,
      toRouteId: transfer.toRouteId,
      fromServiceId: transfer.fromServiceId,
      toServiceId: transfer.toServiceId,
    }),
  }));
  for (let firstIndex = 0; firstIndex < scoped.length; firstIndex++) {
    const first = scoped[firstIndex];
    if (first === undefined) continue;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < scoped.length;
      secondIndex++
    ) {
      const second = scoped[secondIndex];
      if (second === undefined || first.specificity !== second.specificity)
        continue;
      const firstTransfer = first.transfer;
      const secondTransfer = second.transfer;
      if (
        stopScopesOverlap(
          graph,
          firstTransfer.fromStopId,
          secondTransfer.fromStopId,
        ) &&
        stopScopesOverlap(
          graph,
          firstTransfer.toStopId,
          secondTransfer.toStopId,
        ) &&
        sideScopesOverlap(
          graph,
          firstTransfer.fromServiceId,
          firstTransfer.fromRouteId,
          secondTransfer.fromServiceId,
          secondTransfer.fromRouteId,
        ) &&
        sideScopesOverlap(
          graph,
          firstTransfer.toServiceId,
          firstTransfer.toRouteId,
          secondTransfer.toServiceId,
          secondTransfer.toRouteId,
        )
      ) {
        throw new GtfsTransferImportError(
          "ambiguous_transfer_rules",
          `transfer rules ${firstTransfer.id} and ${secondTransfer.id} have equal specificity and overlapping applicability.`,
        );
      }
    }
  }
}

function transferProvenance(
  providerId: string,
  metadata: GtfsTransferMetadata,
): TransitProvenance {
  return {
    provider: metadata.provider,
    identityNamespace: metadata.identityNamespace,
    providerId,
    sourceResourceType: "gtfs:transfer",
    datasetId: metadata.datasetId,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
  };
}

function normalizedTransfer(
  graph: NormalizedTransitGraph,
  row: GtfsTableRow,
  metadata: GtfsTransferMetadata,
): TransitTransfer {
  const type = transferType(row);
  const rawScope = {
    fromStopId: optionalString(row, "from_stop_id"),
    toStopId: optionalString(row, "to_stop_id"),
    fromRouteId: optionalString(row, "from_route_id"),
    toRouteId: optionalString(row, "to_route_id"),
    fromServiceId: optionalString(row, "from_trip_id"),
    toServiceId: optionalString(row, "to_trip_id"),
  } as const;
  if (
    (type <= 3 &&
      (rawScope.fromStopId === null || rawScope.toStopId === null)) ||
    (type >= 4 &&
      (rawScope.fromServiceId === null || rawScope.toServiceId === null))
  ) {
    throw new GtfsTransferImportError(
      "missing_transfer_reference",
      `transfer_type ${type} is missing a required stop or trip reference.`,
    );
  }

  const fromStop = stopByProviderId(graph, metadata, rawScope.fromStopId);
  const toStop = stopByProviderId(graph, metadata, rawScope.toStopId);
  if (type >= 4) {
    for (const [field, stop] of [
      ["from_stop_id", fromStop],
      ["to_stop_id", toStop],
    ] as const) {
      if (stop !== null && isStation(stop.normalized)) {
        throw new GtfsTransferImportError(
          "invalid_linked_transfer_stop",
          `${field} must reference a location_type=0 stop for transfer_type ${type}.`,
        );
      }
    }
  }
  const fromRoute = routeByProviderId(graph, metadata, rawScope.fromRouteId);
  const toRoute = routeByProviderId(graph, metadata, rawScope.toRouteId);
  const fromService = serviceByProviderId(
    graph,
    metadata,
    rawScope.fromServiceId,
  );
  const toService = serviceByProviderId(graph, metadata, rawScope.toServiceId);
  if (
    fromRoute !== null &&
    fromService !== null &&
    fromRoute.normalized.id !== fromService.routeId
  ) {
    throw new GtfsTransferImportError(
      "trip_route_mismatch",
      `from_trip_id ${rawScope.fromServiceId} does not belong to from_route_id ${rawScope.fromRouteId}.`,
    );
  }
  if (
    toRoute !== null &&
    toService !== null &&
    toRoute.normalized.id !== toService.routeId
  ) {
    throw new GtfsTransferImportError(
      "trip_route_mismatch",
      `to_trip_id ${rawScope.toServiceId} does not belong to to_route_id ${rawScope.toRouteId}.`,
    );
  }

  const scope: TransferScope = {
    fromStopId: fromStop?.normalized.id ?? null,
    toStopId: toStop?.normalized.id ?? null,
    fromRouteId: fromRoute?.normalized.id ?? null,
    toRouteId: toRoute?.normalized.id ?? null,
    fromServiceId: fromService?.id ?? null,
    toServiceId: toService?.id ?? null,
  };
  const key = transferIdentity(rawScope);
  const fields = {
    id: makeTransitEntityId(
      metadata.provider,
      "transfer",
      metadata.identityNamespace,
      key,
    ),
    fromStopId: scope.fromStopId,
    toStopId: scope.toStopId,
    fromRouteId: scope.fromRouteId,
    toRouteId: scope.toRouteId,
    fromServiceId: scope.fromServiceId,
    toServiceId: scope.toServiceId,
    minimumTransferSeconds: minimumTransferSeconds(row),
    provenance: transferProvenance(`transfers:${key}`, metadata),
  };
  return metadata.provider === "gtfs"
    ? {
        ...fields,
        provider: "gtfs",
        sourceSemantics: { provider: "gtfs", transferType: type },
      }
    : {
        ...fields,
        provider: "gtfs-jp",
        sourceSemantics: { provider: "gtfs-jp", transferType: type },
      };
}

function transferCoverageState(
  rows: readonly GtfsTableRow[] | undefined,
  completeness: TransitDatasetCompleteness,
): TransitCoverageEntry["transfers"] {
  if (rows === undefined) return "not_imported_in_this_slice";
  return completeness === "complete_provider_dump" ? "imported" : "partial";
}

function fallbackCoverage(
  graph: NormalizedTransitGraph,
  transferState: TransitCoverageEntry["transfers"],
): TransitCoverageReport {
  const groups = new Map<
    string,
    { operator: string; mode: TransitRouteMode }
  >();
  for (const route of graph.routes) {
    const operator = graph.operators.find(
      (candidate) => candidate.id === route.operatorId,
    );
    if (operator === undefined) continue;
    groups.set(`${operator.id}\u0000${route.mode}`, {
      operator: operator.providerOperatorId,
      mode: route.mode,
    });
  }
  const entries: TransitCoverageEntry[] = [...groups.values()]
    .sort((a, b) => lexical(a.operator, b.operator) || lexical(a.mode, b.mode))
    .map((group) => ({
      provider: graph.datasetVersion.provider,
      operator: group.operator,
      mode: group.mode,
      topology: "not_evaluated",
      timetable: "not_evaluated",
      transfers: transferState,
      fare: "not_imported_in_this_slice",
      realtime: "not_evaluated",
      datasetId: graph.datasetVersion.datasetId,
      notes: ["base coverage was not supplied to D1 enrichment"],
    }));
  return {
    datasetId: graph.datasetVersion.datasetId,
    schemaVersion: GTFS_TRANSFER_SCHEMA_VERSION,
    entries,
  };
}

function enrichCoverage(
  graph: NormalizedTransitGraph,
  baseCoverage: TransitCoverageReport | undefined,
  metadata: GtfsTransferMetadata,
  rows: readonly GtfsTableRow[] | undefined,
): TransitCoverageReport {
  const state = transferCoverageState(rows, metadata.completeness);
  const base = baseCoverage ?? fallbackCoverage(graph, state);
  return {
    ...base,
    datasetId: metadata.datasetId,
    schemaVersion: GTFS_TRANSFER_SCHEMA_VERSION,
    entries: base.entries.map((entry) => ({
      ...entry,
      transfers: state,
      datasetId: metadata.datasetId,
      notes:
        state === "partial"
          ? [...entry.notes, "transfer rows are from a non-complete feed"]
          : [...entry.notes],
    })),
  };
}

/** Enrich a C1/C2 graph with explicitly supplied GTFS transfer evidence. */
export function importGtfsTransfers(
  existing: ExistingGraph,
  input: GtfsFeedTables,
  metadata: GtfsTransferMetadata,
  suppliedCoverage?: TransitCoverageReport,
): GtfsTransferImportResult {
  validateMetadata(metadata);
  const { graph: baseGraph, coverage: baseCoverage } = graphOf(existing);
  validateGraph(baseGraph, metadata);
  if (input.transfers !== undefined && !Array.isArray(input.transfers)) {
    throw new GtfsTransferImportError(
      "invalid_transfer_record",
      "transfers must be an array when present.",
    );
  }
  const rows = input.transfers;
  const transfers: TransitTransfer[] = [];
  const seenIdentities = new Set<string>();
  for (const row of rows ?? []) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new GtfsTransferImportError(
        "invalid_transfer_record",
        "transfers contains a non-record row.",
      );
    }
    const normalized = normalizedTransfer(baseGraph, row, metadata);
    if (seenIdentities.has(normalized.id)) {
      throw new GtfsTransferImportError(
        "duplicate_transfer_identity",
        `transfers repeats primary-key identity ${normalized.id}.`,
      );
    }
    seenIdentities.add(normalized.id);
    transfers.push(normalized);
  }
  transfers.sort((a, b) => lexical(a.id, b.id));
  assertNoAmbiguousRules(baseGraph, transfers);

  const graphWithoutHash: NormalizedTransitGraph = {
    ...baseGraph,
    transfers,
  };
  const contentHash = contentHashOf({
    operators: graphWithoutHash.operators,
    stops: graphWithoutHash.stops,
    routes: graphWithoutHash.routes,
    routeStops: gtfsRouteStopsForSemanticHash(graphWithoutHash.routeStops),
    calendars: graphWithoutHash.calendars,
    scheduledServices: graphWithoutHash.scheduledServices,
    scheduledStopTimes: graphWithoutHash.scheduledStopTimes,
    transfers,
  });
  const graph: NormalizedTransitGraph = {
    ...graphWithoutHash,
    datasetVersion: {
      ...graphWithoutHash.datasetVersion,
      provider: metadata.provider,
      datasetId: metadata.datasetId,
      sourceType: metadata.sourceType,
      sourceDescriptor: metadata.sourceDescriptor,
      retrievedAt: metadata.retrievedAt,
      checkedAt: metadata.checkedAt,
      issuedAt: metadata.issuedAt ?? null,
      validUntil: metadata.validUntil ?? null,
      schemaVersion: GTFS_TRANSFER_SCHEMA_VERSION,
      completeness: metadata.completeness,
      contentHash,
    },
  };
  return {
    graph,
    coverage: enrichCoverage(
      graph,
      suppliedCoverage ?? baseCoverage,
      metadata,
      rows,
    ),
    importedTransferCount: transfers.length,
  };
}
