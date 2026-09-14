import crosswalkFile from "@/shared/data/scheduled-transit-endpoint-crosswalk.json";
import { makeTransitEntityId } from "./transitEntityId";
import type { ScheduledTransitDataset } from "./scheduledTransitDataset";
import type { TransitProvider } from "./transitGraphTypes";

export type ScheduledTransitEndpointKind = "origin" | "destination";

export interface ScheduledTransitEndpointQuery {
  readonly kind: ScheduledTransitEndpointKind;
  /** Existing stable Meguruto product identity; never a display name. */
  readonly productId: string;
}

export interface ScheduledTransitCrosswalkProvenance {
  readonly kind: "explicit_crosswalk";
  readonly evidenceId: string;
  readonly statement: string;
  readonly sourceUrl: string;
  readonly checkedAt: string;
}

export interface ScheduledTransitCrosswalkEntry {
  readonly mappingId: string;
  readonly endpoint: ScheduledTransitEndpointQuery;
  readonly datasetId: string;
  readonly provider: TransitProvider;
  readonly identityNamespace: string;
  readonly providerStopId: string;
  readonly providerStationCode?: string;
  readonly normalizedStopId: string;
  readonly provenance: ScheduledTransitCrosswalkProvenance;
}

interface CrosswalkFile {
  readonly schemaVersion: number;
  readonly mappings: readonly ScheduledTransitCrosswalkEntry[];
}

export const SCHEDULED_TRANSIT_CROSSWALK_SCHEMA_VERSION = 1;

export const SCHEDULED_TRANSIT_CROSSWALK = crosswalkFile as CrosswalkFile;

export type ScheduledTransitEndpointResolution =
  | {
      readonly kind: "resolved";
      readonly endpoint: ScheduledTransitEndpointQuery;
      readonly mappingId: string;
      readonly normalizedStopId: string;
      readonly providerStopId: string;
      readonly provider: TransitProvider;
      readonly identityNamespace: string;
      readonly provenance: ScheduledTransitCrosswalkProvenance;
    }
  | {
      readonly kind: "unmapped";
      readonly endpoint: ScheduledTransitEndpointQuery;
      readonly reason: "no_explicit_crosswalk";
    }
  | {
      readonly kind: "ambiguous";
      readonly endpoint: ScheduledTransitEndpointQuery;
      readonly mappingIds: readonly string[];
      readonly reason: "multiple_explicit_crosswalks";
    }
  | {
      readonly kind: "invalid_query";
      readonly endpoint: ScheduledTransitEndpointQuery;
      readonly reason:
        "empty_product_id" | "unsupported_endpoint_kind" | "invalid_crosswalk";
    };

function invalidEndpoint(
  endpoint: ScheduledTransitEndpointQuery,
  reason:
    "empty_product_id" | "unsupported_endpoint_kind" | "invalid_crosswalk",
): ScheduledTransitEndpointResolution {
  return { kind: "invalid_query", endpoint, reason };
}

function validKind(value: unknown): value is ScheduledTransitEndpointKind {
  return value === "origin" || value === "destination";
}

function validProductId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function validProvider(value: unknown): value is TransitProvider {
  return value === "odpt" || value === "gtfs" || value === "gtfs-jp";
}

function validCrosswalkEntry(
  value: unknown,
): value is ScheduledTransitCrosswalkEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  const endpoint = entry.endpoint;
  const provenance = entry.provenance;
  if (
    typeof endpoint !== "object" ||
    endpoint === null ||
    Array.isArray(endpoint) ||
    typeof provenance !== "object" ||
    provenance === null ||
    Array.isArray(provenance)
  ) {
    return false;
  }
  const endpointRecord = endpoint as Record<string, unknown>;
  const provenanceRecord = provenance as Record<string, unknown>;
  return (
    validProductId(entry.mappingId) &&
    validKind(endpointRecord.kind) &&
    validProductId(endpointRecord.productId) &&
    validProductId(entry.datasetId) &&
    validProvider(entry.provider) &&
    validProductId(entry.identityNamespace) &&
    validProductId(entry.providerStopId) &&
    validProductId(entry.normalizedStopId) &&
    provenanceRecord.kind === "explicit_crosswalk" &&
    validProductId(provenanceRecord.evidenceId) &&
    validProductId(provenanceRecord.statement) &&
    validProductId(provenanceRecord.sourceUrl) &&
    validProductId(provenanceRecord.checkedAt)
  );
}

/**
 * Resolves only an explicit, dataset-scoped identity mapping. Names,
 * coordinates, proximity, parent stations, route membership, and free text do
 * not participate in this function.
 */
export function resolveScheduledTransitEndpoint(input: {
  readonly dataset: ScheduledTransitDataset;
  readonly endpoint: ScheduledTransitEndpointQuery;
  readonly crosswalk?: readonly ScheduledTransitCrosswalkEntry[];
}): ScheduledTransitEndpointResolution {
  const { dataset, endpoint } = input;
  if (!validKind(endpoint.kind)) {
    return invalidEndpoint(endpoint, "unsupported_endpoint_kind");
  }
  if (!validProductId(endpoint.productId)) {
    return invalidEndpoint(endpoint, "empty_product_id");
  }

  const crosswalk = input.crosswalk ?? SCHEDULED_TRANSIT_CROSSWALK.mappings;
  if (
    input.crosswalk === undefined &&
    SCHEDULED_TRANSIT_CROSSWALK.schemaVersion !==
      SCHEDULED_TRANSIT_CROSSWALK_SCHEMA_VERSION
  ) {
    return invalidEndpoint(endpoint, "invalid_crosswalk");
  }
  if (!crosswalk.every(validCrosswalkEntry)) {
    return invalidEndpoint(endpoint, "invalid_crosswalk");
  }
  const mappingIds = new Set<string>();
  for (const entry of crosswalk) {
    if (mappingIds.has(entry.mappingId)) {
      return invalidEndpoint(endpoint, "invalid_crosswalk");
    }
    mappingIds.add(entry.mappingId);
  }

  const mappings = crosswalk.filter(
    (entry) =>
      entry.endpoint.kind === endpoint.kind &&
      entry.endpoint.productId === endpoint.productId &&
      entry.datasetId === dataset.metadata.datasetId &&
      entry.provider === dataset.metadata.provider &&
      entry.identityNamespace === dataset.metadata.identityNamespace,
  );
  if (mappings.length === 0) {
    return {
      kind: "unmapped",
      endpoint,
      reason: "no_explicit_crosswalk",
    };
  }
  if (mappings.length > 1) {
    return {
      kind: "ambiguous",
      endpoint,
      mappingIds: mappings.map((entry) => entry.mappingId).sort(),
      reason: "multiple_explicit_crosswalks",
    };
  }

  const mapping = mappings[0];
  if (mapping === undefined) {
    return invalidEndpoint(endpoint, "invalid_crosswalk");
  }
  const stop = dataset.graph.stops.find(
    (candidate) => candidate.id === mapping.normalizedStopId,
  );
  if (
    stop === undefined ||
    stop.provider !== mapping.provider ||
    stop.providerStopId !== mapping.providerStopId ||
    stop.provenance.identityNamespace !== mapping.identityNamespace ||
    stop.provenance.datasetId !== mapping.datasetId ||
    mapping.normalizedStopId !==
      makeTransitEntityId(
        mapping.provider,
        "stop",
        mapping.identityNamespace,
        mapping.providerStopId,
      )
  ) {
    return invalidEndpoint(endpoint, "invalid_crosswalk");
  }
  return {
    kind: "resolved",
    endpoint,
    mappingId: mapping.mappingId,
    normalizedStopId: mapping.normalizedStopId,
    providerStopId: mapping.providerStopId,
    provider: mapping.provider,
    identityNamespace: mapping.identityNamespace,
    provenance: mapping.provenance,
  };
}
