/**
 * KAI-292C4A — audit the smallest real Meguruto scheduled-transit corridor.
 *
 * This is an identity audit, not a route finder. It reads explicit identity
 * evidence, the current catalogue/crosswalk, and registered normalized assets.
 * A corridor is returned only when both endpoint mappings resolve into the
 * same registered dataset scope and have direct or exactly-one-transfer
 * supported scheduled corridor coverage.
 * Names, coordinates, nearest-stop rules, and fuzzy matching are deliberately
 * outside the audit.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  resolveScheduledTransitEndpoint,
  SCHEDULED_TRANSIT_CROSSWALK_SCHEMA_VERSION,
  type ScheduledTransitCrosswalkEntry,
} from "../../src/shared/services/transport/static/scheduledTransitEndpoint";
import {
  ScheduledTransitDatasetError,
  validateScheduledTransitDataset,
  type ScheduledTransitDataset,
} from "../../src/shared/services/transport/static/scheduledTransitDataset";
import {
  buildIndex,
  type IndexedGraph,
} from "../../src/shared/services/transport/static/scheduledJourneyRouter";
import {
  SCHEDULED_TRANSIT_DATASETS,
  type ScheduledTransitDatasetDescriptor,
  type ScheduledTransitDatasetKey,
} from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import { GTFS_TRANSFER_SCHEMA_VERSION } from "../../src/shared/services/transport/static/gtfsTransferImporter";
import { MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS } from "../../src/shared/services/transport/static/oneTransferScheduledJourneyRouter";
import {
  resolveApplicableTransfers,
  type ApplicableTransferResult,
} from "../../src/shared/services/transport/static/transitGraphQueries";
import type {
  TransitProvider,
  TransitScheduledService,
  TransitScheduledStopTime,
  TransitTransfer,
} from "../../src/shared/services/transport/static/transitGraphTypes";

const CATALOGUE_RELATIVE_PATH = "src/shared/data/destinations-index.json";
const CROSSWALK_RELATIVE_PATH =
  "src/shared/data/scheduled-transit-endpoint-crosswalk.json";
const IDENTITY_EVIDENCE_RELATIVE_PATH =
  "qa/kai-292c4a/real-corridor-identity-evidence.json";
const REVIEWED_ANCHORS_RELATIVE_PATH =
  "qa/kai-291/destination-station-anchors.json";
const TRANSIT_ASSET_RELATIVE_PATH = "public/data/transit";

export const REAL_CORRIDOR_AUDIT_SCHEMA_VERSION = "kai-292c4a-v4";

export type RealCorridorAuditStatus =
  "blocked_no_real_catalogue_corridor" | "real_corridor_evidenced";

export type RealCorridorCandidateBlockerCode =
  | "missing_exact_origin_mapping"
  | "ambiguous_exact_origin_mapping"
  | "ambiguous_exact_destination_mapping"
  | "unregistered_dataset_scope"
  | "dataset_scope_mismatch"
  | "invalid_registered_dataset"
  | "graph_stop_provenance_invalid"
  | "missing_scheduled_timetable";

export type ScheduledRoutingCoverageBlockReason =
  | "missing_scheduled_timetable"
  | "no_direct_or_one_transfer_supported_topology"
  | "transfer_evidence_missing"
  | "transfer_evidence_ambiguous"
  | "transfer_evidence_inconclusive"
  | "transfer_evidence_untrusted"
  | "broken_graph_reference";

export interface ScheduledRoutingCoverageSupport {
  readonly kind: "supported";
  readonly topology: "direct" | "exactly_one_transfer";
  readonly transferCount: 0 | 1;
  readonly scheduledServiceCount: number;
  readonly scheduledStopTimeCount: number;
  readonly directServiceIds: readonly string[];
  readonly transfer?: {
    readonly fromStopId: string;
    readonly toStopId: string;
    readonly firstServiceId: string;
    readonly secondServiceId: string;
    readonly transferBasis:
      "provider_transfer_rule" | "meguruto_same_stop_policy";
    readonly ruleId?: string;
    readonly transferType?: number;
  };
}

export type ScheduledRoutingCoverageResult =
  | ScheduledRoutingCoverageSupport
  | {
      readonly kind: "blocked";
      readonly reason: ScheduledRoutingCoverageBlockReason;
    };

export interface RealCorridorBlocker {
  readonly code:
    | "missing_catalogue_destination_crosswalk"
    | "missing_canonical_origin_identity"
    | "pilot_only_normalized_evidence";
  readonly statement: string;
  readonly evidence: readonly string[];
}

export interface RealCorridorCandidateBlocker {
  readonly code: RealCorridorCandidateBlockerCode;
  readonly originProductId: string;
  readonly destinationProductId: string;
  readonly mappingIds: readonly string[];
  readonly statement: string;
  readonly scheduledRoutingReason?: ScheduledRoutingCoverageBlockReason;
}

export interface RealCorridor {
  readonly origin: {
    readonly productId: string;
    readonly mappingId: string;
    readonly normalizedStopId: string;
    readonly providerStopId: string;
  };
  readonly destination: {
    readonly productId: string;
    readonly mappingId: string;
    readonly normalizedStopId: string;
    readonly providerStopId: string;
  };
  readonly dataset: {
    readonly key: string;
    readonly datasetId: string;
    readonly provider: string;
    readonly identityNamespace: string;
  };
  readonly timetable: {
    readonly scheduledServiceCount: number;
    readonly scheduledStopTimeCount: number;
  };
  readonly scheduledRouting: ScheduledRoutingCoverageSupport;
  readonly runtimeVerification: {
    readonly status: "not_evaluated";
    readonly reason: "no_authoritative_service_date_or_departure_time";
  };
}

export interface RealCorridorAudit {
  readonly schemaVersion: typeof REAL_CORRIDOR_AUDIT_SCHEMA_VERSION;
  readonly status: RealCorridorAuditStatus;
  readonly catalogue: {
    readonly source: string;
    readonly destinationCount: number;
    readonly uniqueDestinationIdCount: number;
    readonly destinationMappings: readonly string[];
  };
  readonly normalizedEvidence: {
    readonly assetDirectory: string;
    readonly registeredDatasetKeys: readonly string[];
    readonly validRegisteredDatasetKeys: readonly string[];
    readonly datasets: readonly DatasetEvidence[];
    readonly unregisteredAssetUrls: readonly string[];
  };
  readonly crosswalk: {
    readonly source: string;
    readonly mappingCount: number;
    readonly catalogueProductMappings: readonly string[];
    readonly nonCatalogueMappingIds: readonly string[];
  };
  readonly originIdentity: {
    readonly source: string;
    readonly status:
      | "missing_canonical_product_identity"
      | "reviewed_product_identity_present";
    readonly reviewedProductIds: readonly string[];
    readonly invalidEvidenceCount: number;
    readonly statement: string;
  };
  readonly reviewedAnchors: {
    readonly source: string;
    readonly status: "reviewed_insufficient_for_corridor";
    readonly productionCrosswalk: false;
    readonly stationToPoiAccess: "unproven";
    readonly anchors: readonly ReviewedAnchor[];
  };
  readonly realCorridors: readonly RealCorridor[];
  readonly candidateBlockers: readonly RealCorridorCandidateBlocker[];
  readonly blockers: readonly RealCorridorBlocker[];
}

interface DatasetEvidence {
  readonly key: ScheduledTransitDatasetKey;
  readonly assetUrl: string;
  readonly provider: string;
  readonly datasetId: string;
  readonly identityNamespace: string;
  readonly state: "valid" | "missing" | "invalid";
  readonly graphCounts?: Readonly<Record<string, number>>;
  readonly errorCode?: string;
}

interface DatasetAudit {
  readonly evidence: DatasetEvidence;
  readonly dataset?: ScheduledTransitDataset;
}

interface CatalogueRecord {
  readonly id: string;
}

interface ProductOriginIdentity {
  readonly productId: string;
  readonly evidenceId: string;
  readonly statement: string;
  readonly sourceUrl: string;
  readonly checkedAt: string;
}

interface IdentityEvidenceFile {
  readonly schemaVersion: number;
  readonly originIdentities: readonly ProductOriginIdentity[];
  readonly invalidEvidenceCount: number;
}

interface ReviewedAnchor {
  readonly destinationId: string;
  readonly stationIdentity: string;
  readonly operator: string;
}

interface CrosswalkFile {
  readonly schemaVersion: number;
  readonly mappings: readonly ScheduledTransitCrosswalkEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function validProvider(value: unknown): value is TransitProvider {
  return value === "odpt" || value === "gtfs" || value === "gtfs-jp";
}

function readJson(rootDir: string, relativePath: string): unknown {
  return JSON.parse(
    readFileSync(resolve(rootDir, relativePath), "utf8"),
  ) as unknown;
}

function readCatalogue(rootDir: string): readonly CatalogueRecord[] {
  const value = readJson(rootDir, CATALOGUE_RELATIVE_PATH);
  if (!Array.isArray(value)) {
    throw new Error("catalogue must be an array");
  }
  return value.map((record, index) => {
    if (!isRecord(record) || !nonEmptyString(record.id)) {
      throw new Error(`catalogue record ${index} has no stable id`);
    }
    return { id: record.id };
  });
}

function validCrosswalkEntry(
  value: unknown,
): value is ScheduledTransitCrosswalkEntry {
  if (
    !isRecord(value) ||
    !isRecord(value.endpoint) ||
    !isRecord(value.provenance)
  ) {
    return false;
  }
  return (
    nonEmptyString(value.mappingId) &&
    (value.endpoint.kind === "origin" ||
      value.endpoint.kind === "destination") &&
    nonEmptyString(value.endpoint.productId) &&
    nonEmptyString(value.datasetId) &&
    validProvider(value.provider) &&
    nonEmptyString(value.identityNamespace) &&
    nonEmptyString(value.providerStopId) &&
    nonEmptyString(value.normalizedStopId) &&
    value.provenance.kind === "explicit_crosswalk" &&
    nonEmptyString(value.provenance.evidenceId) &&
    nonEmptyString(value.provenance.statement) &&
    nonEmptyString(value.provenance.sourceUrl) &&
    nonEmptyString(value.provenance.checkedAt)
  );
}

function readCrosswalk(rootDir: string): CrosswalkFile {
  const value = readJson(rootDir, CROSSWALK_RELATIVE_PATH);
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEDULED_TRANSIT_CROSSWALK_SCHEMA_VERSION
  ) {
    throw new Error("scheduled-transit crosswalk has an unsupported schema");
  }
  if (
    !Array.isArray(value.mappings) ||
    !value.mappings.every(validCrosswalkEntry)
  ) {
    throw new Error("scheduled-transit crosswalk contains an invalid mapping");
  }
  return {
    schemaVersion: value.schemaVersion,
    mappings: value.mappings,
  };
}

function readIdentityEvidence(rootDir: string): IdentityEvidenceFile {
  const value = readJson(rootDir, IDENTITY_EVIDENCE_RELATIVE_PATH);
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.originIdentities)
  ) {
    throw new Error(
      "real-corridor identity evidence has an unsupported schema",
    );
  }

  const identities: ProductOriginIdentity[] = [];
  const seenProductIds = new Set<string>();
  let invalidEvidenceCount = 0;
  for (const candidate of value.originIdentities) {
    if (
      !isRecord(candidate) ||
      candidate.identityKind !== "product" ||
      candidate.identityStability !== "stable_product_id" ||
      candidate.reviewStatus !== "reviewed" ||
      !nonEmptyString(candidate.productId) ||
      candidate.productId.startsWith("kai-292c2-pilot-") ||
      !nonEmptyString(candidate.evidenceId) ||
      !nonEmptyString(candidate.statement) ||
      !nonEmptyString(candidate.sourceUrl) ||
      !nonEmptyString(candidate.checkedAt)
    ) {
      invalidEvidenceCount += 1;
      continue;
    }
    if (seenProductIds.has(candidate.productId)) {
      invalidEvidenceCount += 1;
      continue;
    }
    seenProductIds.add(candidate.productId);
    identities.push({
      productId: candidate.productId,
      evidenceId: candidate.evidenceId,
      statement: candidate.statement,
      sourceUrl: candidate.sourceUrl,
      checkedAt: candidate.checkedAt,
    });
  }
  return {
    schemaVersion: value.schemaVersion,
    originIdentities: identities,
    invalidEvidenceCount,
  };
}

function readReviewedAnchors(rootDir: string): readonly ReviewedAnchor[] {
  const value = readJson(rootDir, REVIEWED_ANCHORS_RELATIVE_PATH);
  if (!isRecord(value) || !Array.isArray(value.anchors)) {
    throw new Error("KAI-291A reviewed anchor evidence has an invalid shape");
  }
  return value.anchors.map((anchor, index) => {
    if (
      !isRecord(anchor) ||
      !nonEmptyString(anchor.destinationId) ||
      !nonEmptyString(anchor.odptStationId) ||
      !nonEmptyString(anchor.operator) ||
      anchor.proposedOutcome !== "geographic_unique_candidate"
    ) {
      throw new Error(`KAI-291A anchor ${index} is invalid`);
    }
    return {
      destinationId: anchor.destinationId,
      stationIdentity: anchor.odptStationId,
      operator: anchor.operator,
    };
  });
}

function registeredDatasetEntries(): readonly [
  ScheduledTransitDatasetKey,
  ScheduledTransitDatasetDescriptor,
][] {
  return Object.keys(SCHEDULED_TRANSIT_DATASETS)
    .sort()
    .map((key) => {
      const typedKey = key as ScheduledTransitDatasetKey;
      return [typedKey, SCHEDULED_TRANSIT_DATASETS[typedKey]] as const;
    });
}

function auditRegisteredDataset(
  rootDir: string,
  key: ScheduledTransitDatasetKey,
  descriptor: ScheduledTransitDatasetDescriptor,
): DatasetAudit {
  const assetUrl = descriptor.assetUrl;
  const assetPath = resolve(rootDir, "public", assetUrl.replace(/^\/+/, ""));
  const base = {
    key,
    assetUrl,
    provider: descriptor.provider,
    datasetId: descriptor.datasetId,
    identityNamespace: descriptor.identityNamespace,
  };
  if (!existsSync(assetPath)) {
    return { evidence: { ...base, state: "missing" } };
  }
  try {
    const artifact = JSON.parse(readFileSync(assetPath, "utf8")) as unknown;
    const dataset = validateScheduledTransitDataset(artifact, descriptor);
    return {
      evidence: {
        ...base,
        state: "valid",
        graphCounts: {
          operators: dataset.graph.operators.length,
          stops: dataset.graph.stops.length,
          routes: dataset.graph.routes.length,
          routeStops: dataset.graph.routeStops.length,
          calendars: dataset.graph.calendars.length,
          scheduledServices: dataset.graph.scheduledServices?.length ?? 0,
          scheduledStopTimes: dataset.graph.scheduledStopTimes?.length ?? 0,
          transfers: dataset.graph.transfers.length,
          fares: dataset.graph.fares.length,
        },
      },
      dataset,
    };
  } catch (error: unknown) {
    return {
      evidence: {
        ...base,
        state: "invalid",
        errorCode:
          error instanceof ScheduledTransitDatasetError
            ? error.code
            : "invalid_artifact",
      },
    };
  }
}

function listUnregisteredTransitAssets(
  rootDir: string,
  registeredAssetUrls: ReadonlySet<string>,
): readonly string[] {
  const directory = resolve(rootDir, TRANSIT_ASSET_RELATIVE_PATH);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `/data/transit/${entry.name}`)
    .filter((assetUrl) => !registeredAssetUrls.has(assetUrl))
    .sort();
}

function crosswalkMappingIds(
  mappings: readonly ScheduledTransitCrosswalkEntry[],
  catalogueIds: ReadonlySet<string>,
  kind?: ScheduledTransitCrosswalkEntry["endpoint"]["kind"],
): string[] {
  return mappings
    .filter(
      (mapping) =>
        (kind === undefined || mapping.endpoint.kind === kind) &&
        catalogueIds.has(mapping.endpoint.productId),
    )
    .map((mapping) => mapping.mappingId)
    .sort();
}

function scopeKey(mapping: ScheduledTransitCrosswalkEntry): string {
  return `${mapping.datasetId}|${mapping.provider}|${mapping.identityNamespace}`;
}

function candidateBlocker(
  code: RealCorridorCandidateBlockerCode,
  originProductId: string,
  destinationProductId: string,
  mappings: readonly ScheduledTransitCrosswalkEntry[],
  statement: string,
  scheduledRoutingReason?: ScheduledRoutingCoverageBlockReason,
): RealCorridorCandidateBlocker {
  return {
    code,
    originProductId,
    destinationProductId,
    mappingIds: mappings.map((mapping) => mapping.mappingId).sort(),
    statement,
    ...(scheduledRoutingReason === undefined ? {} : { scheduledRoutingReason }),
  };
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function provenanceMatches(
  provenance: {
    readonly provider: TransitProvider;
    readonly datasetId: string;
    readonly identityNamespace: string;
  },
  dataset: ScheduledTransitDataset,
): boolean {
  return (
    provenance.provider === dataset.metadata.provider &&
    provenance.datasetId === dataset.metadata.datasetId &&
    provenance.identityNamespace === dataset.metadata.identityNamespace
  );
}

function serviceFacts(
  index: IndexedGraph,
  serviceId: string,
): readonly TransitScheduledStopTime[] {
  return [...(index.factsByService.get(serviceId) ?? [])].sort(
    (left, right) =>
      left.order - right.order || lexical(left.stopId, right.stopId),
  );
}

function structurallyValidService(
  dataset: ScheduledTransitDataset,
  index: IndexedGraph,
  service: TransitScheduledService,
): boolean {
  const route = index.routes.get(service.routeId);
  const calendar = index.calendars.get(service.calendarId);
  const operator =
    route === undefined ? undefined : index.operators.get(route.operatorId);
  if (
    route === undefined ||
    calendar === undefined ||
    operator === undefined ||
    service.provider !== dataset.metadata.provider ||
    route.provider !== service.provider ||
    calendar.provider !== service.provider ||
    operator.provider !== service.provider ||
    !provenanceMatches(service.provenance, dataset) ||
    !provenanceMatches(route.provenance, dataset) ||
    !provenanceMatches(calendar.provenance, dataset) ||
    !provenanceMatches(operator.provenance, dataset)
  ) {
    return false;
  }
  const pattern = route.sourceSemantics.patterns.find(
    (candidate) => candidate.patternId === service.patternId,
  );
  if (
    route.sourceSemantics.provider !== service.provider ||
    service.sourceSemantics.provider !== service.provider ||
    pattern === undefined ||
    !pattern.tripIds.includes(service.providerServiceId)
  ) {
    return false;
  }

  const facts = serviceFacts(index, service.id);
  if (facts.length < 2) return false;
  const memberships = dataset.graph.routeStops
    .filter(
      (membership) =>
        membership.routeId === route.id &&
        (membership.patternId ?? "") === service.patternId,
    )
    .sort(
      (left, right) =>
        left.order - right.order || lexical(left.stopId, right.stopId),
    );
  if (memberships.length !== facts.length) return false;

  const seenOrders = new Set<number>();
  for (const [indexInService, fact] of facts.entries()) {
    const stop = index.stops.get(fact.stopId);
    if (
      fact.provider !== service.provider ||
      fact.patternId !== service.patternId ||
      fact.order !== indexInService + 1 ||
      seenOrders.has(fact.order) ||
      stop === undefined ||
      stop.provider !== fact.provider ||
      !provenanceMatches(fact.provenance, dataset) ||
      !provenanceMatches(stop.provenance, dataset) ||
      fact.sourceSemantics.provider !== fact.provider ||
      fact.arrivalServiceSeconds === null ||
      fact.departureServiceSeconds === null ||
      !Number.isSafeInteger(fact.arrivalServiceSeconds) ||
      !Number.isSafeInteger(fact.departureServiceSeconds) ||
      fact.arrivalServiceSeconds < 0 ||
      fact.departureServiceSeconds < 0 ||
      memberships[indexInService]?.order !== fact.order ||
      memberships[indexInService]?.stopId !== fact.stopId
    ) {
      return false;
    }
    seenOrders.add(fact.order);
  }
  return true;
}

function serviceCoverage(
  dataset: ScheduledTransitDataset,
  index: IndexedGraph,
  service: TransitScheduledService,
): {
  readonly timetableImported: boolean;
  readonly transferRulesImported: boolean;
  readonly sameStopPolicyEvidenceSufficient: boolean;
} | null {
  const route = index.routes.get(service.routeId);
  const operator =
    route === undefined ? undefined : index.operators.get(route.operatorId);
  if (route === undefined || operator === undefined) return null;
  const entries = dataset.coverage.entries.filter(
    (entry) =>
      entry.provider === service.provider &&
      entry.operator === operator.providerOperatorId &&
      entry.mode === route.mode &&
      entry.datasetId === dataset.metadata.datasetId,
  );
  if (entries.length !== 1) return null;
  const entry = entries[0];
  if (entry === undefined) return null;
  return {
    timetableImported:
      entry.topology === "imported" && entry.timetable === "imported",
    transferRulesImported: entry.transfers === "imported",
    sameStopPolicyEvidenceSufficient:
      entry.transfers === "imported" ||
      (entry.transfers === "not_imported_in_this_slice" &&
        dataset.graph.datasetVersion.schemaVersion ===
          GTFS_TRANSFER_SCHEMA_VERSION &&
        dataset.graph.datasetVersion.completeness === "complete_provider_dump"),
  };
}

function endpointFact(
  facts: readonly TransitScheduledStopTime[],
  stopId: string,
): TransitScheduledStopTime | null {
  const matches = facts.filter((fact) => fact.stopId === stopId);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function hasOrderedSegment(
  facts: readonly TransitScheduledStopTime[],
  fromStopId: string,
  toStopId: string,
): boolean {
  const from = endpointFact(facts, fromStopId);
  const to = endpointFact(facts, toStopId);
  return from !== null && to !== null && from.order < to.order;
}

function transferEvidenceStructurallyValid(
  transfer: TransitTransfer,
  dataset: ScheduledTransitDataset,
): boolean {
  return (
    transfer.provider === dataset.metadata.provider &&
    transfer.sourceSemantics.provider === transfer.provider &&
    transfer.sourceSemantics.transferType >= 0 &&
    transfer.sourceSemantics.transferType <= 5 &&
    Number.isInteger(transfer.sourceSemantics.transferType) &&
    transfer.fromStopId !== null &&
    transfer.toStopId !== null &&
    provenanceMatches(transfer.provenance, dataset)
  );
}

function validMinimumTransferSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function blockedCoverage(
  reason: ScheduledRoutingCoverageBlockReason,
): ScheduledRoutingCoverageResult {
  return { kind: "blocked", reason };
}

/**
 * Assess static scheduled-routing support without selecting a service date,
 * departure, or runtime Journey. Direct service or exactly one transfer is
 * inspected; one transfer is supported by either an explicit valid provider
 * rule or the exact-same-normalized-stop Meguruto policy. No general route
 * search or inferred transfer is performed.
 */
export function assessScheduledRoutingCoverage(
  dataset: ScheduledTransitDataset,
  originStopId: string,
  destinationStopId: string,
): ScheduledRoutingCoverageResult {
  const scheduledServices = dataset.graph.scheduledServices ?? [];
  const scheduledStopTimes = dataset.graph.scheduledStopTimes ?? [];
  if (
    scheduledServices.length === 0 ||
    scheduledStopTimes.length === 0 ||
    dataset.graph.stops.length === 0
  ) {
    return blockedCoverage("missing_scheduled_timetable");
  }

  let index: IndexedGraph | null;
  try {
    index = buildIndex(dataset.graph);
  } catch {
    index = null;
  }
  if (
    index === null ||
    !index.stops.has(originStopId) ||
    !index.stops.has(destinationStopId)
  ) {
    return blockedCoverage("broken_graph_reference");
  }

  const structurallyValidServices = scheduledServices
    .filter((service) => {
      try {
        return structurallyValidService(dataset, index, service);
      } catch {
        return false;
      }
    })
    .sort((left, right) => lexical(left.id, right.id));
  const directServiceIds: string[] = [];
  const usableServices = new Map<
    string,
    {
      readonly service: TransitScheduledService;
      readonly facts: readonly TransitScheduledStopTime[];
      readonly transferRulesImported: boolean;
      readonly sameStopPolicyEvidenceSufficient: boolean;
    }
  >();
  let sawUntrustedSchedule = false;
  for (const service of structurallyValidServices) {
    const coverage = serviceCoverage(dataset, index, service);
    if (coverage === null || !coverage.timetableImported) {
      sawUntrustedSchedule = true;
      continue;
    }
    const facts = serviceFacts(index, service.id);
    usableServices.set(service.id, {
      service,
      facts,
      transferRulesImported: coverage.transferRulesImported,
      sameStopPolicyEvidenceSufficient:
        coverage.sameStopPolicyEvidenceSufficient,
    });
    if (hasOrderedSegment(facts, originStopId, destinationStopId)) {
      directServiceIds.push(service.id);
    }
  }

  if (directServiceIds.length > 0) {
    return {
      kind: "supported",
      topology: "direct",
      transferCount: 0,
      scheduledServiceCount: scheduledServices.length,
      scheduledStopTimeCount: scheduledStopTimes.length,
      directServiceIds: directServiceIds.sort(lexical),
    };
  }
  if (sawUntrustedSchedule && usableServices.size === 0) {
    return blockedCoverage("missing_scheduled_timetable");
  }

  const transferPairs = [
    ...new Set(
      dataset.graph.transfers
        .filter(
          (transfer) =>
            transfer.fromStopId !== null && transfer.toStopId !== null,
        )
        .map((transfer) => `${transfer.fromStopId}\u0000${transfer.toStopId}`),
    ),
  ]
    .map((key) => {
      const [fromStopId, toStopId] = key.split("\u0000");
      return { fromStopId: fromStopId ?? "", toStopId: toStopId ?? "" };
    })
    .sort(
      (left, right) =>
        lexical(left.fromStopId, right.fromStopId) ||
        lexical(left.toStopId, right.toStopId),
    );
  const oneTransferCandidates: ScheduledRoutingCoverageSupport[] = [];
  let sawTransferEvidenceMissing = transferPairs.length === 0;
  let sawTransferEvidenceAmbiguous = false;
  let sawTransferEvidenceInconclusive = false;
  let sawTransferEvidenceUntrusted = false;

  for (const first of usableServices.values()) {
    const originFact = endpointFact(first.facts, originStopId);
    if (originFact === null) continue;
    const firstLaterFacts = first.facts.filter(
      (fact) => fact.order > originFact.order,
    );
    for (const firstFact of firstLaterFacts) {
      const transferPairCandidates = [
        ...transferPairs.map((transferPair) => ({
          ...transferPair,
          allowSameStopPolicy: false,
        })),
        {
          fromStopId: firstFact.stopId,
          toStopId: firstFact.stopId,
          allowSameStopPolicy: true,
        },
      ];
      for (const transferPair of transferPairCandidates) {
        for (const second of usableServices.values()) {
          if (second.service.id === first.service.id) continue;
          const destinationFact = endpointFact(second.facts, destinationStopId);
          const transferToFact = endpointFact(
            second.facts,
            transferPair.toStopId,
          );
          if (
            destinationFact === null ||
            transferToFact === null ||
            transferToFact.order >= destinationFact.order
          ) {
            continue;
          }
          let query: ApplicableTransferResult;
          try {
            query = resolveApplicableTransfers(dataset.graph, {
              fromStopId: firstFact.stopId,
              toStopId: transferToFact.stopId,
              incomingRouteId: first.service.routeId,
              outgoingRouteId: second.service.routeId,
              incomingServiceId: first.service.id,
              outgoingServiceId: second.service.id,
            });
          } catch {
            sawTransferEvidenceInconclusive = true;
            continue;
          }
          if (query.status === "invalid_query") {
            sawTransferEvidenceInconclusive = true;
            continue;
          }
          if (query.transfers.length > 1) {
            sawTransferEvidenceAmbiguous = true;
            continue;
          }
          const transfer = query.transfers[0];
          if (transfer === undefined) {
            if (!transferPair.allowSameStopPolicy) continue;
            if (firstFact.stopId !== transferToFact.stopId) {
              sawTransferEvidenceInconclusive = true;
              continue;
            }
            if (
              !first.sameStopPolicyEvidenceSufficient ||
              !second.sameStopPolicyEvidenceSufficient
            ) {
              sawTransferEvidenceUntrusted = true;
              continue;
            }
            const transferWaitSeconds =
              (transferToFact.departureServiceSeconds ?? Number.NaN) -
              (firstFact.arrivalServiceSeconds ?? Number.NaN);
            if (
              !Number.isSafeInteger(transferWaitSeconds) ||
              transferWaitSeconds < MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS
            ) {
              continue;
            }
            oneTransferCandidates.push({
              kind: "supported",
              topology: "exactly_one_transfer",
              transferCount: 1,
              scheduledServiceCount: scheduledServices.length,
              scheduledStopTimeCount: scheduledStopTimes.length,
              directServiceIds: [],
              transfer: {
                fromStopId: firstFact.stopId,
                toStopId: transferToFact.stopId,
                firstServiceId: first.service.id,
                secondServiceId: second.service.id,
                transferBasis: "meguruto_same_stop_policy",
              },
            });
            continue;
          }
          if (!first.transferRulesImported || !second.transferRulesImported) {
            sawTransferEvidenceUntrusted = true;
            continue;
          }
          let structurallyValid = false;
          try {
            structurallyValid = transferEvidenceStructurallyValid(
              transfer,
              dataset,
            );
          } catch {
            structurallyValid = false;
          }
          if (!structurallyValid) {
            sawTransferEvidenceInconclusive = true;
            continue;
          }
          const transferWaitSeconds =
            (transferToFact.departureServiceSeconds ?? Number.NaN) -
            (firstFact.arrivalServiceSeconds ?? Number.NaN);
          const transferType = transfer.sourceSemantics.transferType;
          if (transferType === 3 || transferType === 4 || transferType === 5) {
            sawTransferEvidenceInconclusive = true;
            continue;
          }
          const rawMinimumTransferSeconds: unknown =
            transfer.minimumTransferSeconds;
          const minimumTransferSeconds =
            rawMinimumTransferSeconds === null
              ? null
              : validMinimumTransferSeconds(rawMinimumTransferSeconds)
                ? rawMinimumTransferSeconds
                : undefined;
          if (
            rawMinimumTransferSeconds !== null &&
            minimumTransferSeconds === undefined
          ) {
            sawTransferEvidenceInconclusive = true;
            continue;
          }
          if (
            !Number.isSafeInteger(transferWaitSeconds) ||
            transferWaitSeconds < 0
          ) {
            sawTransferEvidenceInconclusive = true;
            continue;
          }
          let transferBasis:
            "provider_transfer_rule" | "meguruto_same_stop_policy" =
            "provider_transfer_rule";
          if (transferType === 2) {
            if (minimumTransferSeconds === null) {
              sawTransferEvidenceInconclusive = true;
              continue;
            }
            if (transferWaitSeconds < minimumTransferSeconds) continue;
          } else if (transferType === 0 && minimumTransferSeconds !== null) {
            if (transferWaitSeconds < minimumTransferSeconds) continue;
          } else if (transferType === 0) {
            if (firstFact.stopId !== transferToFact.stopId) {
              sawTransferEvidenceInconclusive = true;
              continue;
            }
            if (transferWaitSeconds < MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS) {
              continue;
            }
            transferBasis = "meguruto_same_stop_policy";
          }
          oneTransferCandidates.push({
            kind: "supported",
            topology: "exactly_one_transfer",
            transferCount: 1,
            scheduledServiceCount: scheduledServices.length,
            scheduledStopTimeCount: scheduledStopTimes.length,
            directServiceIds: [],
            transfer: {
              fromStopId: firstFact.stopId,
              toStopId: transferToFact.stopId,
              firstServiceId: first.service.id,
              secondServiceId: second.service.id,
              transferBasis,
              ruleId: transfer.id,
              transferType,
            },
          });
        }
      }
    }
  }

  oneTransferCandidates.sort((left, right) => {
    const leftTransfer = left.transfer;
    const rightTransfer = right.transfer;
    if (leftTransfer === undefined || rightTransfer === undefined) return 0;
    return (
      lexical(leftTransfer.firstServiceId, rightTransfer.firstServiceId) ||
      lexical(leftTransfer.secondServiceId, rightTransfer.secondServiceId) ||
      lexical(leftTransfer.fromStopId, rightTransfer.fromStopId) ||
      lexical(leftTransfer.toStopId, rightTransfer.toStopId) ||
      lexical(leftTransfer.ruleId ?? "", rightTransfer.ruleId ?? "")
    );
  });
  const selected = oneTransferCandidates[0];
  if (selected !== undefined) return selected;
  if (sawTransferEvidenceUntrusted) {
    return blockedCoverage("transfer_evidence_untrusted");
  }
  if (sawTransferEvidenceAmbiguous) {
    return blockedCoverage("transfer_evidence_ambiguous");
  }
  if (sawTransferEvidenceInconclusive) {
    return blockedCoverage("transfer_evidence_inconclusive");
  }
  if (sawTransferEvidenceMissing) {
    return blockedCoverage("transfer_evidence_missing");
  }
  return blockedCoverage("no_direct_or_one_transfer_supported_topology");
}

function evaluateMappedPair(input: {
  readonly originIdentity: ProductOriginIdentity;
  readonly originMapping: ScheduledTransitCrosswalkEntry;
  readonly destinationMapping: ScheduledTransitCrosswalkEntry;
  readonly allMappings: readonly ScheduledTransitCrosswalkEntry[];
  readonly datasetsByScope: ReadonlyMap<string, DatasetAudit>;
}):
  | { readonly kind: "valid"; readonly corridor: RealCorridor }
  | {
      readonly kind: "blocked";
      readonly blocker: RealCorridorCandidateBlocker;
    } {
  const {
    originIdentity,
    originMapping,
    destinationMapping,
    allMappings,
    datasetsByScope,
  } = input;
  const mappings = [originMapping, destinationMapping];
  const originScope = scopeKey(originMapping);
  const destinationScope = scopeKey(destinationMapping);
  const originDataset = datasetsByScope.get(originScope);
  const destinationDataset = datasetsByScope.get(destinationScope);

  if (originDataset === undefined || destinationDataset === undefined) {
    return {
      kind: "blocked",
      blocker: candidateBlocker(
        "unregistered_dataset_scope",
        originIdentity.productId,
        destinationMapping.endpoint.productId,
        mappings,
        "Both endpoint mappings must use the same provider, dataset, and identity namespace from the registered dataset registry.",
      ),
    };
  }
  if (originScope !== destinationScope) {
    return {
      kind: "blocked",
      blocker: candidateBlocker(
        "dataset_scope_mismatch",
        originIdentity.productId,
        destinationMapping.endpoint.productId,
        mappings,
        "Origin and destination mappings use different registered dataset/provider/identity namespaces.",
      ),
    };
  }
  if (
    originDataset.evidence.state !== "valid" ||
    originDataset.dataset === undefined
  ) {
    return {
      kind: "blocked",
      blocker: candidateBlocker(
        "invalid_registered_dataset",
        originIdentity.productId,
        destinationMapping.endpoint.productId,
        mappings,
        "The endpoint scope is registered, but its normalized dataset is missing or invalid.",
      ),
    };
  }

  const dataset = originDataset.dataset;
  const origin = resolveScheduledTransitEndpoint({
    dataset,
    endpoint: originMapping.endpoint,
    crosswalk: allMappings,
  });
  const destination = resolveScheduledTransitEndpoint({
    dataset,
    endpoint: destinationMapping.endpoint,
    crosswalk: allMappings,
  });
  if (origin.kind !== "resolved" || destination.kind !== "resolved") {
    return {
      kind: "blocked",
      blocker: candidateBlocker(
        "graph_stop_provenance_invalid",
        originIdentity.productId,
        destinationMapping.endpoint.productId,
        mappings,
        "Both exact crosswalk mappings must resolve to graph stops with matching provider, dataset, namespace, and provenance.",
      ),
    };
  }

  const scheduledRouting = assessScheduledRoutingCoverage(
    dataset,
    origin.normalizedStopId,
    destination.normalizedStopId,
  );
  if (scheduledRouting.kind !== "supported") {
    return {
      kind: "blocked",
      blocker: candidateBlocker(
        "missing_scheduled_timetable",
        originIdentity.productId,
        destinationMapping.endpoint.productId,
        mappings,
        `Both mapped stops must have direct or exactly-one-transfer supported scheduled corridor coverage (${scheduledRouting.reason}).`,
        scheduledRouting.reason,
      ),
    };
  }

  return {
    kind: "valid",
    corridor: {
      origin: {
        productId: originIdentity.productId,
        mappingId: origin.mappingId,
        normalizedStopId: origin.normalizedStopId,
        providerStopId: origin.providerStopId,
      },
      destination: {
        productId: destination.endpoint.productId,
        mappingId: destination.mappingId,
        normalizedStopId: destination.normalizedStopId,
        providerStopId: destination.providerStopId,
      },
      dataset: {
        key: originDataset.evidence.key,
        datasetId: dataset.metadata.datasetId,
        provider: dataset.metadata.provider,
        identityNamespace: dataset.metadata.identityNamespace,
      },
      timetable: {
        scheduledServiceCount: scheduledRouting.scheduledServiceCount,
        scheduledStopTimeCount: scheduledRouting.scheduledStopTimeCount,
      },
      scheduledRouting,
      runtimeVerification: {
        status: "not_evaluated",
        reason: "no_authoritative_service_date_or_departure_time",
      },
    },
  };
}

/**
 * Reads current reviewed identity evidence and all registered deployable
 * normalized assets. A corridor is never inferred: it requires a reviewed
 * product origin identity, a catalogue destination, two exact mappings, one
 * registered dataset scope, graph/provenance validity, and direct or
 * exactly-one-transfer supported scheduled coverage. It does not construct a
 * runtime Journey because C4A has no authoritative service date/departure time.
 */
export function auditRealMegurutoCorridor(
  rootDir = process.cwd(),
): RealCorridorAudit {
  const catalogue = readCatalogue(rootDir);
  const catalogueIds = new Set(catalogue.map((record) => record.id));
  if (catalogueIds.size !== catalogue.length) {
    throw new Error("catalogue contains duplicate destination ids");
  }

  const crosswalk = readCrosswalk(rootDir);
  const mappings = crosswalk.mappings;
  const identityEvidence = readIdentityEvidence(rootDir);
  const reviewedAnchors = readReviewedAnchors(rootDir);
  const destinationMappings = crosswalkMappingIds(
    mappings,
    catalogueIds,
    "destination",
  );
  const catalogueProductMappings = crosswalkMappingIds(mappings, catalogueIds);
  const nonCatalogueMappingIds = mappings
    .filter((mapping) => !catalogueIds.has(mapping.endpoint.productId))
    .map((mapping) => mapping.mappingId)
    .sort();

  const entries = registeredDatasetEntries();
  const datasetAudits = entries.map(([key, descriptor]) =>
    auditRegisteredDataset(rootDir, key, descriptor),
  );
  const datasetsByScope = new Map(
    datasetAudits.map((audit) => {
      const scope = `${audit.evidence.datasetId}|${audit.evidence.provider}|${audit.evidence.identityNamespace}`;
      return [scope, audit] as const;
    }),
  );
  const validRegisteredDatasetKeys = datasetAudits
    .filter((dataset) => dataset.evidence.state === "valid")
    .map((dataset) => dataset.evidence.key)
    .sort();
  const registeredAssetUrls = new Set(
    entries.map(([, descriptor]) => descriptor.assetUrl),
  );

  const candidateBlockers: RealCorridorCandidateBlocker[] = [];
  const realCorridors: RealCorridor[] = [];
  const catalogueDestinationEntries = mappings.filter(
    (mapping) =>
      mapping.endpoint.kind === "destination" &&
      catalogueIds.has(mapping.endpoint.productId),
  );
  const catalogueDestinationGroups = new Map<
    string,
    ScheduledTransitCrosswalkEntry[]
  >();
  for (const mapping of catalogueDestinationEntries) {
    const productId = mapping.endpoint.productId;
    const existing = catalogueDestinationGroups.get(productId) ?? [];
    existing.push(mapping);
    catalogueDestinationGroups.set(productId, existing);
  }

  for (const originIdentity of identityEvidence.originIdentities) {
    const originMappings = mappings.filter(
      (mapping) =>
        mapping.endpoint.kind === "origin" &&
        mapping.endpoint.productId === originIdentity.productId,
    );
    for (const destinationMappingsForProduct of catalogueDestinationGroups.values()) {
      const destinationMapping = destinationMappingsForProduct[0];
      if (destinationMapping === undefined) continue;
      if (originMappings.length === 0) {
        candidateBlockers.push(
          candidateBlocker(
            "missing_exact_origin_mapping",
            originIdentity.productId,
            destinationMapping.endpoint.productId,
            destinationMappingsForProduct,
            "A reviewed product origin identity has no explicit exact origin crosswalk mapping.",
          ),
        );
        continue;
      }
      if (originMappings.length > 1) {
        candidateBlockers.push(
          candidateBlocker(
            "ambiguous_exact_origin_mapping",
            originIdentity.productId,
            destinationMapping.endpoint.productId,
            [...originMappings, ...destinationMappingsForProduct],
            "A reviewed product origin identity has multiple exact origin mappings; no mapping is selected.",
          ),
        );
        continue;
      }
      if (destinationMappingsForProduct.length > 1) {
        candidateBlockers.push(
          candidateBlocker(
            "ambiguous_exact_destination_mapping",
            originIdentity.productId,
            destinationMapping.endpoint.productId,
            [...originMappings, ...destinationMappingsForProduct],
            "A catalogue destination has multiple exact destination mappings; no mapping is selected.",
          ),
        );
        continue;
      }
      const originMapping = originMappings[0];
      if (originMapping === undefined) continue;
      const result = evaluateMappedPair({
        originIdentity,
        originMapping,
        destinationMapping,
        allMappings: mappings,
        datasetsByScope,
      });
      if (result.kind === "valid") realCorridors.push(result.corridor);
      else candidateBlockers.push(result.blocker);
    }
  }

  const blockers: RealCorridorBlocker[] = [];
  if (destinationMappings.length === 0) {
    blockers.push({
      code: "missing_catalogue_destination_crosswalk",
      statement: `No explicit scheduled-transit crosswalk maps a catalogue destination product ID (${catalogue.length} destinations audited).`,
      evidence: [CATALOGUE_RELATIVE_PATH, CROSSWALK_RELATIVE_PATH],
    });
  }
  if (identityEvidence.originIdentities.length === 0) {
    blockers.push({
      code: "missing_canonical_origin_identity",
      statement:
        "The current evidence file contains no reviewed canonical Meguruto product origin identity; station labels and coordinates are not identity evidence.",
      evidence: [IDENTITY_EVIDENCE_RELATIVE_PATH],
    });
  }

  const onlySakataEvidence =
    validRegisteredDatasetKeys.length > 0 &&
    validRegisteredDatasetKeys.every((key) => key === "sakata-runrunbus");
  if (onlySakataEvidence && catalogueProductMappings.length === 0) {
    blockers.push({
      code: "pilot_only_normalized_evidence",
      statement:
        "The only valid registered normalized dataset is the bounded Sakata RunRunBus pilot, and its crosswalk uses boundary-pilot product IDs rather than catalogue IDs.",
      evidence: [
        "src/shared/services/transport/static/scheduledTransitDatasetRegistry.ts",
        "public/data/transit/sakata-runrunbus.json",
        CROSSWALK_RELATIVE_PATH,
      ],
    });
  }

  return {
    schemaVersion: REAL_CORRIDOR_AUDIT_SCHEMA_VERSION,
    status:
      realCorridors.length > 0
        ? "real_corridor_evidenced"
        : "blocked_no_real_catalogue_corridor",
    catalogue: {
      source: CATALOGUE_RELATIVE_PATH,
      destinationCount: catalogue.length,
      uniqueDestinationIdCount: catalogueIds.size,
      destinationMappings,
    },
    normalizedEvidence: {
      assetDirectory: TRANSIT_ASSET_RELATIVE_PATH,
      registeredDatasetKeys: entries.map(([key]) => key),
      validRegisteredDatasetKeys,
      datasets: datasetAudits.map((audit) => audit.evidence),
      unregisteredAssetUrls: listUnregisteredTransitAssets(
        rootDir,
        registeredAssetUrls,
      ),
    },
    crosswalk: {
      source: CROSSWALK_RELATIVE_PATH,
      mappingCount: mappings.length,
      catalogueProductMappings,
      nonCatalogueMappingIds,
    },
    originIdentity: {
      source: IDENTITY_EVIDENCE_RELATIVE_PATH,
      status:
        identityEvidence.originIdentities.length === 0
          ? "missing_canonical_product_identity"
          : "reviewed_product_identity_present",
      reviewedProductIds: identityEvidence.originIdentities
        .map((identity) => identity.productId)
        .sort(),
      invalidEvidenceCount: identityEvidence.invalidEvidenceCount,
      statement:
        identityEvidence.originIdentities.length === 0
          ? "No reviewed product identity is available for the current user-origin flow."
          : "Reviewed product origin identities are eligible for exact crosswalk evaluation only.",
    },
    reviewedAnchors: {
      source: REVIEWED_ANCHORS_RELATIVE_PATH,
      status: "reviewed_insufficient_for_corridor",
      productionCrosswalk: false,
      stationToPoiAccess: "unproven",
      anchors: reviewedAnchors,
    },
    realCorridors,
    candidateBlockers,
    blockers,
  };
}

const invokedScript = process.argv[1];
if (
  invokedScript !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedScript)).href
) {
  process.stdout.write(
    `${JSON.stringify(auditRealMegurutoCorridor(), null, 2)}\n`,
  );
}
