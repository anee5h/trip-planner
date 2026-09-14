import { contentHashOf } from "./odptRailTopologyImporter";
import { gtfsRouteStopsForSemanticHash } from "./gtfsTopologyImporter";
import { makeTransitEntityId } from "./transitEntityId";
import { sha256Hex, stableStringify } from "./contentHash";
import {
  getScheduledTransitDatasetDescriptor,
  type ScheduledTransitDatasetDescriptor,
  type ScheduledTransitDatasetKey,
} from "./scheduledTransitDatasetRegistry";
import type {
  NormalizedTransitGraph,
  TransitDatasetVersion,
  TransitCoverageReport,
} from "./transitGraphTypes";

export type ScheduledTransitDatasetMetadata = Pick<
  TransitDatasetVersion,
  | "provider"
  | "datasetId"
  | "sourceType"
  | "sourceDescriptor"
  | "retrievedAt"
  | "checkedAt"
  | "issuedAt"
  | "validUntil"
  | "schemaVersion"
  | "completeness"
> & {
  /** Alias for the existing graph datasetVersion.contentHash. */
  readonly datasetHash: TransitDatasetVersion["contentHash"];
  /** Hash of the exact serialized coverage report in this envelope. */
  readonly coverageHash: string;
  /** Stable feed scope used by every normalized entity identity. */
  readonly identityNamespace: string;
};

export interface ScheduledTransitDatasetArtifact {
  readonly artifactSchemaVersion: string;
  readonly metadata: ScheduledTransitDatasetMetadata;
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
}

export type ScheduledTransitDataset = ScheduledTransitDatasetArtifact;

export type ScheduledTransitDatasetErrorCode =
  | "invalid_artifact"
  | "schema_mismatch"
  | "dataset_mismatch"
  | "hash_mismatch"
  | "coverage_mismatch"
  | "namespace_mismatch"
  | "network_failure";

export class ScheduledTransitDatasetError extends Error {
  readonly code: ScheduledTransitDatasetErrorCode;

  constructor(code: ScheduledTransitDatasetErrorCode, message: string) {
    super(`scheduled-transit-dataset[${code}]: ${message}`);
    this.name = "ScheduledTransitDatasetError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function invalid(message: string): never {
  throw new ScheduledTransitDatasetError("invalid_artifact", message);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${field} must be an object.`);
  return value;
}

function requireArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${field} must be an array.`);
  return value;
}

function requireString(
  value: unknown,
  field: string,
  code: ScheduledTransitDatasetErrorCode = "invalid_artifact",
): string {
  if (!isNonEmptyString(value)) {
    throw new ScheduledTransitDatasetError(code, `${field} must be non-empty.`);
  }
  return value;
}

function requireHash(
  value: unknown,
  field: string,
  code: ScheduledTransitDatasetErrorCode = "invalid_artifact",
): string {
  if (!isSha256(value)) {
    throw new ScheduledTransitDatasetError(
      code,
      `${field} must be a lowercase SHA-256 hex digest.`,
    );
  }
  return value;
}

function graphShape(value: unknown): NormalizedTransitGraph {
  const graph = requireRecord(value, "graph");
  requireRecord(graph.datasetVersion, "graph.datasetVersion");
  for (const field of [
    "operators",
    "stops",
    "routes",
    "routeStops",
    "calendars",
    "transfers",
    "fares",
  ]) {
    requireArray(graph[field], `graph.${field}`);
  }
  for (const field of ["scheduledServices", "scheduledStopTimes"]) {
    if (graph[field] !== undefined)
      requireArray(graph[field], `graph.${field}`);
  }
  return graph as unknown as NormalizedTransitGraph;
}

function coverageShape(value: unknown): TransitCoverageReport {
  const coverage = requireRecord(value, "coverage");
  requireString(coverage.datasetId, "coverage.datasetId");
  requireString(coverage.schemaVersion, "coverage.schemaVersion");
  const entries = requireArray(coverage.entries, "coverage.entries");
  if (entries.length === 0) invalid("coverage.entries must not be empty.");
  for (const [index, entry] of entries.entries()) {
    const record = requireRecord(entry, `coverage.entries[${index}]`);
    requireString(record.provider, `coverage.entries[${index}].provider`);
    requireString(record.operator, `coverage.entries[${index}].operator`);
    requireString(record.mode, `coverage.entries[${index}].mode`);
    requireString(record.datasetId, `coverage.entries[${index}].datasetId`);
    if (!Array.isArray(record.notes)) {
      invalid(`coverage.entries[${index}].notes must be an array.`);
    }
  }
  return coverage as unknown as TransitCoverageReport;
}

function metadataShape(value: unknown): ScheduledTransitDatasetMetadata {
  const metadata = requireRecord(value, "metadata");
  for (const field of [
    "provider",
    "datasetId",
    "sourceType",
    "sourceDescriptor",
    "retrievedAt",
    "checkedAt",
    "schemaVersion",
    "completeness",
    "identityNamespace",
  ]) {
    requireString(metadata[field], `metadata.${field}`);
  }
  requireHash(metadata.datasetHash, "metadata.datasetHash");
  requireHash(metadata.coverageHash, "metadata.coverageHash");
  for (const field of ["issuedAt", "validUntil"]) {
    if (metadata[field] !== null && !isNonEmptyString(metadata[field])) {
      invalid(`metadata.${field} must be null or a non-empty string.`);
    }
  }
  return metadata as unknown as ScheduledTransitDatasetMetadata;
}

function assertMetadataMatchesGraph(
  metadata: ScheduledTransitDatasetMetadata,
  graph: NormalizedTransitGraph,
): void {
  const version = graph.datasetVersion;
  for (const field of [
    "provider",
    "datasetId",
    "sourceType",
    "sourceDescriptor",
    "retrievedAt",
    "checkedAt",
    "issuedAt",
    "validUntil",
    "schemaVersion",
    "completeness",
  ] as const) {
    if (metadata[field] !== version[field]) {
      throw new ScheduledTransitDatasetError(
        "dataset_mismatch",
        `metadata.${field} disagrees with graph.datasetVersion.${field}.`,
      );
    }
  }
  if (metadata.datasetHash !== version.contentHash) {
    throw new ScheduledTransitDatasetError(
      "hash_mismatch",
      "metadata.datasetHash disagrees with graph.datasetVersion.contentHash.",
    );
  }
}

function assertEntityProvenance(
  graph: NormalizedTransitGraph,
  metadata: ScheduledTransitDatasetMetadata,
): void {
  const entities = [
    ...graph.operators,
    ...graph.stops,
    ...graph.routes,
    ...graph.routeStops,
    ...graph.calendars,
    ...(graph.scheduledServices ?? []),
    ...(graph.scheduledStopTimes ?? []),
    ...graph.transfers,
    ...graph.fares,
  ] as readonly Record<string, unknown>[];
  for (const [index, entity] of entities.entries()) {
    const provenance = entity.provenance;
    if (!isRecord(provenance)) {
      invalid(`graph entity ${index} has no provenance object.`);
    }
    if (
      provenance.provider !== metadata.provider ||
      ("provider" in entity && entity.provider !== metadata.provider)
    ) {
      throw new ScheduledTransitDatasetError(
        "namespace_mismatch",
        `graph entity ${index} has provider ${JSON.stringify(
          "provider" in entity ? entity.provider : provenance.provider,
        )}.`,
      );
    }
    const sourceSemantics = entity.sourceSemantics;
    if (
      isRecord(sourceSemantics) &&
      sourceSemantics.provider !== metadata.provider
    ) {
      throw new ScheduledTransitDatasetError(
        "namespace_mismatch",
        `graph entity ${index} has mismatched source semantics provider.`,
      );
    }
    if (provenance.identityNamespace !== metadata.identityNamespace) {
      throw new ScheduledTransitDatasetError(
        "namespace_mismatch",
        `graph entity ${index} has a different identity namespace.`,
      );
    }
    if (provenance.datasetId !== metadata.datasetId) {
      throw new ScheduledTransitDatasetError(
        "dataset_mismatch",
        `graph entity ${index} has a different provenance datasetId.`,
      );
    }
    requireString(provenance.providerId, `graph entity ${index}.providerId`);
    requireString(
      provenance.sourceResourceType,
      `graph entity ${index}.sourceResourceType`,
    );
  }

  for (const [index, stop] of graph.stops.entries()) {
    if (
      stop.id !==
      makeTransitEntityId(
        metadata.provider,
        "stop",
        metadata.identityNamespace,
        stop.providerStopId,
      )
    ) {
      throw new ScheduledTransitDatasetError(
        "namespace_mismatch",
        `graph.stops[${index}] is not the canonical namespaced stop identity.`,
      );
    }
  }
}

function assertCoverageMatches(
  metadata: ScheduledTransitDatasetMetadata,
  graph: NormalizedTransitGraph,
  coverage: TransitCoverageReport,
): void {
  if (coverage.datasetId !== metadata.datasetId) {
    throw new ScheduledTransitDatasetError(
      "coverage_mismatch",
      "coverage.datasetId disagrees with the graph dataset.",
    );
  }
  if (coverage.schemaVersion !== metadata.schemaVersion) {
    throw new ScheduledTransitDatasetError(
      "schema_mismatch",
      "coverage.schemaVersion disagrees with metadata.schemaVersion.",
    );
  }
  for (const entry of coverage.entries) {
    if (
      entry.provider !== metadata.provider ||
      entry.datasetId !== graph.datasetVersion.datasetId
    ) {
      throw new ScheduledTransitDatasetError(
        "coverage_mismatch",
        "coverage entry belongs to a different provider or dataset.",
      );
    }
  }
}

/**
 * Validates one serialized coherent unit. The descriptor is pinned in source,
 * not read from the artifact, so an asset cannot redefine its own trust.
 */
export function validateScheduledTransitDataset(
  value: unknown,
  descriptor?: ScheduledTransitDatasetDescriptor,
): ScheduledTransitDataset {
  const artifact = requireRecord(value, "artifact");
  const artifactSchemaVersion = requireString(
    artifact.artifactSchemaVersion,
    "artifactSchemaVersion",
  );
  const metadata = metadataShape(artifact.metadata);
  const graph = graphShape(artifact.graph);
  const coverage = coverageShape(artifact.coverage);

  if (descriptor !== undefined) {
    if (artifactSchemaVersion !== descriptor.artifactSchemaVersion) {
      throw new ScheduledTransitDatasetError(
        "schema_mismatch",
        `expected artifact schema ${descriptor.artifactSchemaVersion}, found ${artifactSchemaVersion}.`,
      );
    }
    for (const [field, expected] of [
      ["provider", descriptor.provider],
      ["identityNamespace", descriptor.identityNamespace],
      ["datasetId", descriptor.datasetId],
      ["schemaVersion", descriptor.schemaVersion],
      ["sourceType", descriptor.sourceType],
      ["completeness", descriptor.completeness],
    ] as const) {
      if (metadata[field] !== expected) {
        throw new ScheduledTransitDatasetError(
          field === "schemaVersion" ? "schema_mismatch" : "dataset_mismatch",
          `metadata.${field} does not match the pinned registry.`,
        );
      }
    }
    if (metadata.datasetHash !== descriptor.expectedContentHash) {
      throw new ScheduledTransitDatasetError(
        "hash_mismatch",
        "artifact dataset hash does not match the pinned registry.",
      );
    }
    if (metadata.coverageHash !== descriptor.expectedCoverageHash) {
      throw new ScheduledTransitDatasetError(
        "coverage_mismatch",
        "artifact coverage hash does not match the pinned registry.",
      );
    }
  }

  assertMetadataMatchesGraph(metadata, graph);
  assertCoverageMatches(metadata, graph, coverage);
  assertEntityProvenance(graph, metadata);

  const computedContentHash = contentHashOf({
    operators: graph.operators,
    stops: graph.stops,
    routes: graph.routes,
    routeStops:
      graph.datasetVersion.provider === "gtfs" ||
      graph.datasetVersion.provider === "gtfs-jp"
        ? gtfsRouteStopsForSemanticHash(graph.routeStops)
        : graph.routeStops,
    calendars: graph.calendars,
    scheduledServices: graph.scheduledServices,
    scheduledStopTimes: graph.scheduledStopTimes,
    transfers: graph.transfers,
  });
  if (computedContentHash !== metadata.datasetHash) {
    throw new ScheduledTransitDatasetError(
      "hash_mismatch",
      "normalized graph semantic hash does not match metadata.datasetHash.",
    );
  }
  const computedCoverageHash = sha256Hex(stableStringify(coverage));
  if (computedCoverageHash !== metadata.coverageHash) {
    throw new ScheduledTransitDatasetError(
      "coverage_mismatch",
      "coverage report hash does not match metadata.coverageHash.",
    );
  }

  return {
    artifactSchemaVersion,
    metadata,
    graph,
    coverage,
  };
}

const datasetPromises = new Map<
  ScheduledTransitDatasetKey,
  Promise<ScheduledTransitDataset>
>();

/**
 * Loads one registered dataset as a lazy plain asset. Concurrent and repeated
 * callers share the same promise/object; rejected loads are removed so a later
 * call can retry rather than permanently caching failure.
 */
export function loadScheduledTransitDataset(
  key: ScheduledTransitDatasetKey = "sakata-runrunbus",
): Promise<ScheduledTransitDataset> {
  const existing = datasetPromises.get(key);
  if (existing !== undefined) return existing;

  const descriptor = getScheduledTransitDatasetDescriptor(key);
  const promise = fetch(descriptor.assetUrl)
    .then((response) => {
      if (!response.ok) {
        throw new ScheduledTransitDatasetError(
          "network_failure",
          `HTTP ${response.status} fetching ${descriptor.assetUrl}.`,
        );
      }
      return response.json() as Promise<unknown>;
    })
    .then((value) => validateScheduledTransitDataset(value, descriptor))
    .catch((error: unknown) => {
      datasetPromises.delete(key);
      if (error instanceof ScheduledTransitDatasetError) throw error;
      throw new ScheduledTransitDatasetError(
        "network_failure",
        `failed to load ${descriptor.assetUrl}: ${String(error)}`,
      );
    });
  datasetPromises.set(key, promise);
  return promise;
}

/** Test-only cache reset; production consumers should share the module cache. */
export function resetScheduledTransitDatasetCache(): void {
  datasetPromises.clear();
}
