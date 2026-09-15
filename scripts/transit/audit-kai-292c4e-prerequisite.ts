#!/usr/bin/env node
/**
 * KAI-292C4E — prerequisite audit for the first real scheduled-transit corridor.
 *
 * This is a credential-free, repository-evidence audit. It does not call ODPT,
 * does not use the old direct-Journey primitive, and does not promote a KAI-291A
 * geographic anchor into the C4A production crosswalk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  SCHEDULED_TRANSIT_CROSSWALK_SCHEMA_VERSION,
  type ScheduledTransitCrosswalkEntry,
} from "../../src/shared/services/transport/static/scheduledTransitEndpoint";
import {
  KAI_292C4H_DATASET_KEY,
  KAI_292C4H_DESTINATION_PRODUCT_ID,
  KAI_292C4H_EARLIEST_DEPARTURE_TIME,
  KAI_292C4H_EVIDENCE_ID,
  KAI_292C4H_ORIGIN_PRODUCT_ID,
  KAI_292C4H_RUNTIME_PROOF_PATH,
  KAI_292C4H_RUNTIME_PROOF_SCHEMA_VERSION,
  KAI_292C4H_SERVICE_DATE,
} from "./audit-kai-292c4h-runtime-proof";
import { auditRealMegurutoCorridor } from "./audit-kai-292c4a-real-corridor";
import {
  SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
  SCHEDULED_TRANSIT_DATASETS,
  type ScheduledTransitDatasetDescriptor,
} from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import {
  ScheduledTransitDatasetError,
  validateScheduledTransitDataset,
  type ScheduledTransitDataset,
  type ScheduledTransitDatasetArtifact,
} from "../../src/shared/services/transport/static/scheduledTransitDataset";

const CATALOGUE_PATH = "src/shared/data/destinations-index.json";
const ANCHOR_PATH = "qa/kai-291/destination-station-anchors.json";
const COVERAGE_PATH = "qa/kai-290/odpt-coverage.json";
const IDENTITY_EVIDENCE_PATH =
  "qa/kai-292c4g/toei-oedo-shinjuku-nishiguchi-origin-evidence.json";
const CROSSWALK_PATH =
  "src/shared/data/scheduled-transit-endpoint-crosswalk.json";
const DATASET_REGISTRY_PATH =
  "src/shared/services/transport/static/scheduledTransitDatasetRegistry.ts";
const DATASET_LOADER_PATH =
  "src/shared/services/transport/static/scheduledTransitDataset.ts";
const ODPT_CORE_PATH = "functions/api/odpt-core.js";
const ODPT_JOURNEY_PATH =
  "src/shared/services/transport/OdptDirectJourneyService.ts";
const ODPT_JOURNEY_BUILDER_PATH =
  "src/shared/services/transport/odptDirectJourney.ts";
const ODPT_TOPOLOGY_IMPORTER_PATH =
  "src/shared/services/transport/static/odptRailTopologyImporter.ts";
const GTFS_SCHEDULE_IMPORTER_PATH =
  "src/shared/services/transport/static/gtfsScheduleImporter.ts";
const C3_PATH = "docs/kai-292c3-scheduled-routing-temporal-contract.md";
const REPORT_PATH = "qa/kai-292c4e/real-corridor-prerequisite-audit.json";
const DATASET_SOURCE_PATHS: Readonly<Record<string, string>> = {
  "sakata-runrunbus": "public/data/transit/sakata-runrunbus.json",
  "toei-oedo-gtfs-20260314":
    "src/shared/data/transit/toei-oedo-gtfs-20260314.json",
};

export const KAI_292C4E_ANCHOR_IDS = [
  "shinjuku-gyo-en",
  "teamlab-borderless-azabudai",
  "ueno-park",
  "hamarikyu-gardens",
  "sumida-hokusai-museum",
  "ryogoku-kokugikan-sumo-museum",
  "sugamo-jizo-dori",
] as const;

export const KAI_292C4E_AUDIT_SCHEMA_VERSION = "kai-292c4e-v1" as const;

type JsonRecord = Record<string, unknown>;

type AnchorId = (typeof KAI_292C4E_ANCHOR_IDS)[number];

interface Kai292C4EOdptBroadTimetableProbe {
  readonly operator: string;
  readonly scope: JsonRecord;
  readonly state: string;
  readonly detail: string | null;
  readonly recordCount: number | null;
}

interface Kai292C4EOdptExactTrainProbe {
  readonly operator: string;
  readonly trainIdentity: string;
  readonly state: string;
  readonly recordCount: number;
}

interface Kai292C4EExactEndpointIdentityPair {
  readonly originProductId: string;
  readonly destinationProductId: string;
  readonly originMappingId: string;
  readonly destinationMappingId: string;
  readonly datasetId: string;
  readonly provider: string;
  readonly identityNamespace: string;
}

type CorridorReadinessBlockerCode =
  | "missing_canonical_product_origin_identity"
  | "missing_catalogue_destination_crosswalk"
  | "station_to_destination_access_not_exactly_bound"
  | "odpt_timetable_not_representable_in_trusted_c2"
  | "missing_direct_or_one_transfer_scheduled_support";

type C2BoundaryReason =
  | "no_registered_odpt_scheduled_dataset"
  | "registered_odpt_dataset_not_loadable"
  | "registered_odpt_dataset_not_production_eligible"
  | "registered_odpt_scheduled_dataset"
  | "registered_trusted_scheduled_dataset";

type OdptEvidenceSummary =
  | "provider_response_too_large"
  | "records"
  | "empty"
  | "unknown"
  | "inconclusive";

type C4DBlockerCode =
  | "no_authoritative_service_date_or_departure_time"
  | "runtime_journey_verification_not_evaluated";

export interface Kai292C4ERuntimeProofEvidence {
  readonly status: "verified_controlled_runtime" | "absent" | "invalid";
  readonly source: typeof KAI_292C4H_RUNTIME_PROOF_PATH;
  readonly reason: string | null;
  readonly corridor: {
    readonly originProductId: string;
    readonly destinationProductId: string;
    readonly direction: "outbound";
    readonly datasetKey: string;
    readonly datasetId: string;
  } | null;
  readonly temporal: {
    readonly source: "controlled_internal_test_fixture";
    readonly serviceDate: string;
    readonly earliestDepartureTime: string;
    readonly earliestDepartureServiceSeconds: number;
  } | null;
  readonly journey: {
    readonly selected: "direct";
    readonly transferCount: 0;
    readonly serviceId: string;
    readonly providerServiceId: string;
    readonly routeId: string;
    readonly providerRouteId: string;
    readonly providerOperatorId: string;
    readonly originStopId: string;
    readonly destinationStopId: string;
    readonly actualDepartureServiceSeconds: number;
    readonly actualArrivalServiceSeconds: number;
    readonly durationSeconds: number;
  } | null;
  readonly c4b: {
    readonly kind: "scheduled_journey";
    readonly evidence: "verified";
    readonly transferCount: 0;
    readonly durationSeconds: number;
  } | null;
  readonly c4c: {
    readonly kind: "verified_scheduled_journey";
    readonly source: "scheduled";
    readonly selected: "direct";
  } | null;
}

export interface Kai292C4EOriginIdentityEvidence {
  readonly identityKind: string;
  readonly identityStability: string;
  readonly reviewStatus: string;
  readonly productId?: string;
  readonly evidenceId?: string;
  readonly statement?: string;
  readonly sourceUrl?: string;
  readonly checkedAt?: string;
}

export type Kai292C4EDatasetDescriptor = Omit<
  ScheduledTransitDatasetDescriptor,
  "key"
> & {
  readonly key: string;
};

/** Test-only in-memory artifact input; never a production registry source. */
export interface Kai292C4ESyntheticScheduledTransitArtifact {
  readonly key: string;
  readonly artifact: ScheduledTransitDatasetArtifact;
}

export interface Kai292C4EAuditOptions {
  /** Test-only generated C4H proof override; production reads the committed artifact. */
  readonly runtimeProof?: unknown;
  readonly originIdentities?: readonly Kai292C4EOriginIdentityEvidence[];
  readonly scheduledTransitDatasets?: readonly Kai292C4EDatasetDescriptor[];
  readonly scheduledTransitArtifacts?: readonly Kai292C4ESyntheticScheduledTransitArtifact[];
  /** Test-only KAI-290 evidence override; production reads the committed file. */
  readonly odptCoverage?: unknown;
  /** Test-only crosswalk override; production reads the committed file. */
  readonly scheduledTransitCrosswalkMappings?: readonly ScheduledTransitCrosswalkEntry[];
}

interface Kai292C4EC2RegistryState {
  readonly canEnterTrustedC2: boolean;
  readonly registeredDatasetKeys: readonly string[];
  readonly registeredProviders: readonly string[];
  readonly artifactValidOdptDatasetKeys: readonly string[];
  readonly productionEligibleOdptDatasetKeys: readonly string[];
  readonly reason: C2BoundaryReason;
}

export interface Kai292C4EAnchorFinding {
  readonly destinationId: AnchorId;
  readonly catalogue: {
    readonly status: "present";
    readonly productId: string;
    readonly name: string;
    readonly role: string | null;
    readonly kind: string | null;
    readonly source: typeof CATALOGUE_PATH;
  };
  readonly reviewedStation: {
    readonly status: "reviewed_geographic_anchor";
    readonly provider: "odpt";
    readonly stationId: string;
    readonly operator: string;
    readonly railway: string;
    readonly evidencePath: "geographic_unique_candidate";
    readonly source: typeof ANCHOR_PATH;
    readonly productionCrosswalk: false;
  };
  readonly stationToDestinationAccess:
    | {
        readonly status: "source_backed_station_label_only";
        readonly exactStationIdentityBound: false;
        readonly sourceUrls: readonly string[];
        readonly statement: string;
        readonly missingPrerequisite: "exact_identity_bound_access_evidence";
      }
    | {
        readonly status: "unavailable";
        readonly exactStationIdentityBound: false;
        readonly sourceUrls: readonly string[];
        readonly statement: string;
        readonly missingPrerequisite: "reviewed_station_to_destination_access_evidence";
      };
  readonly providerOperator: {
    readonly provider: "odpt";
    readonly operator: string;
    readonly railway: string;
    readonly source: typeof ANCHOR_PATH;
    readonly identityPreserved: true;
  };
  readonly odptTimetableEvidence: {
    readonly source: typeof COVERAGE_PATH;
    readonly boundary: "https://meguruto.app/api/odpt";
    readonly operatorPilotStatus: "included" | "not_included" | "inconclusive";
    readonly operatorEvidenceScope: "operator_sample_only";
    readonly exactStationTimetableStatus: "not_evidenced" | "sampled";
    readonly exactStationIdentity: string;
    readonly exactStationSampled: boolean;
    readonly exactTrainTimetableStatus: "not_evidenced_for_anchor";
    readonly credentialSafeStaticClaim: true;
  };
  readonly c2ScheduledTransitDataset: {
    readonly canEnterTrustedC2: boolean;
    readonly artifactValid: boolean;
    readonly productionScheduledDatasetEligible: boolean;
    readonly registeredDatasetKeys: readonly string[];
    readonly registeredProviders: readonly string[];
    readonly reason: C2BoundaryReason;
    readonly registrySource: typeof DATASET_REGISTRY_PATH;
    readonly loaderSource: typeof DATASET_LOADER_PATH;
  };
  readonly exactProductSafeOriginOptions: readonly string[];
  readonly missingPrerequisites: readonly string[];
  readonly productionCrosswalk: false;
  readonly scheduledSupport: "blocked";
}

export interface Kai292C4EBlocker {
  readonly code: CorridorReadinessBlockerCode;
  readonly statement: string;
  readonly evidence: readonly string[];
}

export interface Kai292C4EC4DBlocker {
  readonly code: C4DBlockerCode;
  readonly statement: string;
  readonly evidence: readonly string[];
}

export interface Kai292C4EReport {
  readonly schemaVersion: typeof KAI_292C4E_AUDIT_SCHEMA_VERSION;
  readonly status: "blocked_prerequisite" | "prerequisites_satisfied";
  readonly generatedBy: string;
  readonly scope: {
    readonly ticket: "KAI-292C4E";
    readonly outcome: "Outcome B — reusable prerequisite/blocker report";
    readonly networkCalls: 0;
    readonly credentialRead: false;
    readonly credentialEmitted: false;
  };
  readonly anchors: readonly Kai292C4EAnchorFinding[];
  readonly exactEndpointIdentityPairs: readonly Kai292C4EExactEndpointIdentityPair[];
  readonly ranking: readonly {
    readonly rank: number;
    readonly destinationId: AnchorId;
    readonly infrastructureGapScore: number;
    readonly tier: "Tier 1" | "Tier 2";
    readonly tieGroup: string;
    readonly tieBreakOrder: number;
    readonly reason: string;
  }[];
  readonly odptBoundary: {
    readonly source: typeof COVERAGE_PATH;
    readonly boundary: "https://meguruto.app/api/odpt";
    readonly liveResultReplayed: false;
    readonly credentialExposed: false;
    readonly authenticatedAuditClaim: "available_as_committed_static_evidence_only";
    readonly measuredPilotOperators: readonly string[];
    readonly reviewedStationEvidence: "qa/kai-291/pilot-station-index.json";
    readonly broadTimetableResult: OdptEvidenceSummary;
    readonly exactTrainProbeResult: OdptEvidenceSummary;
    readonly broadTrainTimetableProbes: readonly Kai292C4EOdptBroadTimetableProbe[];
    readonly exactTrainIdentityProbes: readonly Kai292C4EOdptExactTrainProbe[];
    readonly caveat: string;
    readonly oldDirectJourney: {
      readonly source: typeof ODPT_JOURNEY_PATH;
      readonly builderSource: typeof ODPT_JOURNEY_BUILDER_PATH;
      readonly status: "capability_only_not_called";
      readonly connectedToC4E: false;
      readonly connectedToC4C: false;
    };
    readonly inspectedProviderNormalizer: typeof ODPT_CORE_PATH;
  };
  readonly c2Boundary: {
    readonly registeredDatasetKeys: readonly string[];
    readonly registeredProviders: readonly string[];
    readonly artifactValidOdptDatasetKeys: readonly string[];
    readonly productionEligibleOdptDatasetKeys: readonly string[];
    readonly odptEvidenceCanEnterTrustedDataset: boolean;
    readonly reason: C2BoundaryReason;
    readonly importerBoundary: {
      readonly odptTopologyImporter: "normalized_topology_capability_only";
      readonly odptTopologyImporterSource: typeof ODPT_TOPOLOGY_IMPORTER_PATH;
      readonly gtfsScheduleImporter: "current_scheduled_dataset_path";
      readonly gtfsScheduleImporterSource: typeof GTFS_SCHEDULE_IMPORTER_PATH;
    };
    readonly registrySource: typeof DATASET_REGISTRY_PATH;
    readonly loaderSource: typeof DATASET_LOADER_PATH;
    readonly crosswalkSource: typeof CROSSWALK_PATH;
  };
  readonly origin: {
    readonly status: "missing_canonical_product_identity" | "available";
    readonly source: typeof IDENTITY_EVIDENCE_PATH;
    readonly reviewedProductIds: readonly string[];
    readonly exactProductOriginOptions: readonly string[];
    readonly freeTextLabelAndCoordinates: "insufficient";
    readonly rejectedOptions: readonly {
      readonly kind:
        | "free_text_label_and_coordinates"
        | "nearest_station"
        | "geographic_anchor"
        | "sakata_pilot_identity"
        | "old_odpt_direct_journey_input";
      readonly status: "rejected";
      readonly reason: string;
    }[];
    readonly missingPrerequisite:
      "reviewed_stable_product_origin_identity" | null;
  };
  readonly gates: readonly {
    readonly gate:
      | "real_meguruto_origin"
      | "real_catalogue_destination"
      | "explicit_reviewed_station_destination_access"
      | "exact_transit_identities"
      | "production_loadable_scheduled_dataset"
      | "direct_or_one_transfer_structural_support";
    readonly satisfied: boolean;
    readonly statement: string;
  }[];
  readonly corridorReadinessBlockers: readonly Kai292C4EBlocker[];
  readonly c4dBlockers: readonly Kai292C4EC4DBlocker[];
  readonly runtimeProof: Kai292C4ERuntimeProofEvidence;
  readonly blockers: readonly Kai292C4EBlocker[];
  readonly c4a: {
    readonly corridorCount: number;
    readonly status: string;
    readonly inheritedBlockers: readonly string[];
    readonly crosswalkChanged: false;
  };
  readonly promotedAnchorCount: 0;
  readonly identityResolutionPolicy: {
    readonly nameFallback: false;
    readonly coordinateFallback: false;
    readonly nearestFallback: false;
    readonly geographicAnchorPromotion: false;
  };
  readonly c4d: {
    readonly status: "blocked" | "controlled_runtime_proof_verified";
    readonly reason:
      | "c4e_prerequisites_not_satisfied"
      | "runtime_evidence_absent"
      | "controlled_runtime_proof_only";
    readonly blockers: readonly Kai292C4EC4DBlocker[];
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function readJson(rootDir: string, relativePath: string): unknown {
  return JSON.parse(
    readFileSync(resolve(rootDir, relativePath), "utf8"),
  ) as unknown;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (!nonEmpty(value)) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function catalogueRecords(rootDir: string): readonly JsonRecord[] {
  return requireArray(readJson(rootDir, CATALOGUE_PATH), CATALOGUE_PATH).map(
    (value, index) => requireRecord(value, `${CATALOGUE_PATH}[${index}]`),
  );
}

function anchorRecords(rootDir: string): readonly JsonRecord[] {
  const root = requireRecord(readJson(rootDir, ANCHOR_PATH), ANCHOR_PATH);
  return requireArray(root.anchors, `${ANCHOR_PATH}.anchors`).map(
    (value, index) => requireRecord(value, `${ANCHOR_PATH}.anchors[${index}]`),
  );
}

function coverageRoot(rootDir: string, providedCoverage?: unknown): JsonRecord {
  return requireRecord(
    providedCoverage ?? readJson(rootDir, COVERAGE_PATH),
    COVERAGE_PATH,
  );
}

function sourceUrls(value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.sourceUrls)) return [];
  return value.sourceUrls.filter(nonEmpty).sort();
}

function c2Descriptors(
  options: Kai292C4EAuditOptions,
): readonly Kai292C4EDatasetDescriptor[] {
  const descriptors =
    options.scheduledTransitDatasets ??
    Object.values(SCHEDULED_TRANSIT_DATASETS);
  return [...descriptors].sort((left, right) =>
    String(left.key ?? "").localeCompare(String(right.key ?? "")),
  );
}

function validDescriptor(value: unknown): value is Kai292C4EDatasetDescriptor {
  if (!isRecord(value)) return false;
  return (
    nonEmpty(value.key) &&
    nonEmpty(value.assetUrl) &&
    value.artifactSchemaVersion === SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION &&
    (value.provider === "odpt" ||
      value.provider === "gtfs" ||
      value.provider === "gtfs-jp") &&
    nonEmpty(value.identityNamespace) &&
    nonEmpty(value.datasetId) &&
    nonEmpty(value.schemaVersion) &&
    nonEmpty(value.expectedContentHash) &&
    nonEmpty(value.expectedCoverageHash) &&
    nonEmpty(value.sourceType) &&
    nonEmpty(value.completeness)
  );
}

function productionScheduledDatasetEligible(
  dataset: ScheduledTransitDataset,
): boolean {
  const { graph, metadata, coverage } = dataset;
  if (
    metadata.provider !== graph.datasetVersion.provider ||
    metadata.sourceType !== "data_dump" ||
    graph.datasetVersion.sourceType !== "data_dump" ||
    metadata.completeness !== "complete_provider_dump" ||
    graph.datasetVersion.completeness !== "complete_provider_dump"
  ) {
    return false;
  }
  const scheduledServices = graph.scheduledServices;
  const scheduledStopTimes = graph.scheduledStopTimes;
  if (
    graph.operators.length === 0 ||
    graph.stops.length === 0 ||
    graph.routes.length === 0 ||
    graph.routeStops.length === 0 ||
    graph.calendars.length === 0 ||
    scheduledServices === undefined ||
    scheduledServices.length === 0 ||
    scheduledStopTimes === undefined ||
    scheduledStopTimes.length === 0
  ) {
    return false;
  }
  const importedCoverageScopes = new Set(
    coverage.entries
      .filter(
        (entry) =>
          entry.provider === metadata.provider &&
          entry.datasetId === metadata.datasetId &&
          entry.topology === "imported" &&
          entry.timetable === "imported",
      )
      .map((entry) => `${entry.operator}|${entry.mode}`),
  );
  return graph.routes.every((route) => {
    const operator = graph.operators.find(
      (candidate) => candidate.id === route.operatorId,
    );
    return (
      operator !== undefined &&
      importedCoverageScopes.has(`${operator.providerOperatorId}|${route.mode}`)
    );
  });
}

interface C2ArtifactAudit {
  readonly key: string;
  readonly dataset?: ScheduledTransitDataset;
}

function c2RegistryState(
  rootDir: string,
  descriptors: readonly Kai292C4EDatasetDescriptor[],
  syntheticArtifacts: readonly Kai292C4ESyntheticScheduledTransitArtifact[] = [],
): Kai292C4EC2RegistryState {
  const registeredDatasetKeys = descriptors
    .map(({ key }) => key)
    .filter(nonEmpty)
    .sort();
  const registeredProviders = [
    ...new Set(descriptors.map(({ provider }) => provider).filter(nonEmpty)),
  ].sort();
  const odptDescriptors = descriptors.filter(
    ({ provider, upstreamSource }) =>
      provider === "odpt" || upstreamSource === "odpt",
  );
  const syntheticArtifactsByKey = new Map(
    syntheticArtifacts.map(({ key, artifact }) => [key, artifact] as const),
  );
  const artifactAudits: readonly C2ArtifactAudit[] = odptDescriptors.map(
    (descriptor) => {
      const rawDescriptor: unknown = descriptor;
      if (!validDescriptor(rawDescriptor)) {
        return { key: String(descriptor.key ?? "") };
      }
      let artifact: unknown;
      const syntheticArtifact = syntheticArtifactsByKey.get(descriptor.key);
      if (syntheticArtifact !== undefined) {
        artifact = syntheticArtifact;
      } else {
        const sourcePath = DATASET_SOURCE_PATHS[descriptor.key];
        if (sourcePath === undefined) return { key: descriptor.key };
        const sourceFile = resolve(rootDir, sourcePath);
        if (!existsSync(sourceFile)) return { key: descriptor.key };
        try {
          artifact = JSON.parse(readFileSync(sourceFile, "utf8")) as unknown;
        } catch {
          return { key: descriptor.key };
        }
      }
      try {
        return {
          key: descriptor.key,
          dataset: validateScheduledTransitDataset(
            artifact,
            descriptor as ScheduledTransitDatasetDescriptor,
          ),
        };
      } catch (error: unknown) {
        if (error instanceof ScheduledTransitDatasetError) {
          return { key: descriptor.key };
        }
        return { key: descriptor.key };
      }
    },
  );
  const artifactValidOdptDatasetKeys = artifactAudits
    .filter(({ dataset }) => dataset !== undefined)
    .map(({ key }) => key)
    .sort();
  const productionEligibleOdptDatasetKeys = artifactAudits
    .filter(
      ({ dataset }) =>
        dataset !== undefined && productionScheduledDatasetEligible(dataset),
    )
    .map(({ key }) => key)
    .sort();
  const hasNonOdptTrustedDescriptor = descriptors.some(
    ({ provider }) => provider !== "odpt",
  );
  const reason: C2BoundaryReason =
    odptDescriptors.length === 0
      ? "no_registered_odpt_scheduled_dataset"
      : productionEligibleOdptDatasetKeys.length > 0
        ? hasNonOdptTrustedDescriptor
          ? "registered_trusted_scheduled_dataset"
          : "registered_odpt_scheduled_dataset"
        : artifactValidOdptDatasetKeys.length > 0
          ? "registered_odpt_dataset_not_production_eligible"
          : "registered_odpt_dataset_not_loadable";
  return {
    canEnterTrustedC2: productionEligibleOdptDatasetKeys.length > 0,
    registeredDatasetKeys,
    registeredProviders,
    artifactValidOdptDatasetKeys,
    productionEligibleOdptDatasetKeys,
    reason,
  };
}

function c2MissingPrerequisite(
  c2State: Kai292C4EC2RegistryState,
): string | null {
  if (c2State.canEnterTrustedC2) return null;
  return c2State.artifactValidOdptDatasetKeys.length > 0
    ? "production_scheduled_dataset_eligibility"
    : "registered_odpt_scheduled_dataset_artifact";
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
    nonEmpty(value.mappingId) &&
    (value.endpoint.kind === "origin" ||
      value.endpoint.kind === "destination") &&
    nonEmpty(value.endpoint.productId) &&
    nonEmpty(value.datasetId) &&
    (value.provider === "odpt" ||
      value.provider === "gtfs" ||
      value.provider === "gtfs-jp") &&
    nonEmpty(value.identityNamespace) &&
    nonEmpty(value.providerStopId) &&
    nonEmpty(value.normalizedStopId) &&
    value.provenance.kind === "explicit_crosswalk" &&
    nonEmpty(value.provenance.evidenceId) &&
    nonEmpty(value.provenance.statement) &&
    nonEmpty(value.provenance.sourceUrl) &&
    nonEmpty(value.provenance.checkedAt)
  );
}

function crosswalkMappings(
  rootDir: string,
  providedMappings?: readonly ScheduledTransitCrosswalkEntry[],
): readonly ScheduledTransitCrosswalkEntry[] {
  if (providedMappings !== undefined) {
    if (!providedMappings.every(validCrosswalkEntry)) {
      throw new Error(
        "injected scheduled-transit crosswalk contains an invalid mapping",
      );
    }
    return [...providedMappings];
  }
  const root = requireRecord(readJson(rootDir, CROSSWALK_PATH), CROSSWALK_PATH);
  if (root.schemaVersion !== SCHEDULED_TRANSIT_CROSSWALK_SCHEMA_VERSION) {
    throw new Error("scheduled-transit crosswalk has an unsupported schema");
  }
  const mappings = requireArray(root.mappings, `${CROSSWALK_PATH}.mappings`);
  if (!mappings.every(validCrosswalkEntry)) {
    throw new Error("scheduled-transit crosswalk contains an invalid mapping");
  }
  return mappings as readonly ScheduledTransitCrosswalkEntry[];
}

function findExactEndpointIdentityPairs(
  mappings: readonly ScheduledTransitCrosswalkEntry[],
  catalogueIds: ReadonlySet<string>,
  reviewedProductIds: readonly string[],
  registeredDatasetScopes: ReadonlySet<string>,
): readonly Kai292C4EExactEndpointIdentityPair[] {
  const pairs: Kai292C4EExactEndpointIdentityPair[] = [];
  const destinationsByProduct = new Map<
    string,
    ScheduledTransitCrosswalkEntry[]
  >();
  for (const mapping of mappings) {
    if (
      mapping.endpoint.kind !== "destination" ||
      !catalogueIds.has(mapping.endpoint.productId)
    ) {
      continue;
    }
    const entries = destinationsByProduct.get(mapping.endpoint.productId) ?? [];
    entries.push(mapping);
    destinationsByProduct.set(mapping.endpoint.productId, entries);
  }
  for (const originProductId of reviewedProductIds) {
    const originMappings = mappings.filter(
      (mapping) =>
        mapping.endpoint.kind === "origin" &&
        mapping.endpoint.productId === originProductId,
    );
    if (originMappings.length !== 1) continue;
    const originMapping = originMappings[0];
    if (originMapping === undefined) continue;
    for (const [
      destinationProductId,
      destinationMappings,
    ] of destinationsByProduct) {
      if (destinationMappings.length !== 1) continue;
      const destinationMapping = destinationMappings[0];
      if (
        destinationMapping === undefined ||
        `${originMapping.datasetId}|${originMapping.provider}|${originMapping.identityNamespace}` !==
          `${destinationMapping.datasetId}|${destinationMapping.provider}|${destinationMapping.identityNamespace}`
      ) {
        continue;
      }
      const scope = `${originMapping.datasetId}|${originMapping.provider}|${originMapping.identityNamespace}`;
      if (!registeredDatasetScopes.has(scope)) continue;
      pairs.push({
        originProductId,
        destinationProductId,
        originMappingId: originMapping.mappingId,
        destinationMappingId: destinationMapping.mappingId,
        datasetId: originMapping.datasetId,
        provider: originMapping.provider,
        identityNamespace: originMapping.identityNamespace,
      });
    }
  }
  return pairs.sort(
    (left, right) =>
      left.originProductId.localeCompare(right.originProductId) ||
      left.destinationProductId.localeCompare(right.destinationProductId),
  );
}

function includedPilotOperator(
  coverage: JsonRecord,
  operator: string,
): "included" | "not_included" | "inconclusive" {
  const scope = requireRecord(
    coverage.pilotScope,
    `${COVERAGE_PATH}.pilotScope`,
  );
  const included = requireArray(
    scope.included,
    `${COVERAGE_PATH}.pilotScope.included`,
  );
  const excluded = requireArray(
    scope.excluded,
    `${COVERAGE_PATH}.pilotScope.excluded`,
  );
  if (
    included.some((entry) => isRecord(entry) && entry.operator === operator)
  ) {
    return "included";
  }
  if (
    excluded.some((entry) => isRecord(entry) && entry.operator === operator)
  ) {
    return "not_included";
  }
  return "inconclusive";
}

function sampledStationIds(
  coverage: JsonRecord,
  operator: string,
): readonly string[] {
  const operators = requireArray(
    coverage.operators,
    `${COVERAGE_PATH}.operators`,
  );
  const operatorRecord = operators.find(
    (entry) => isRecord(entry) && entry.operator === operator,
  );
  if (!isRecord(operatorRecord)) return [];
  const timetable = requireRecord(
    operatorRecord.timetable,
    `${COVERAGE_PATH}.operators[].timetable`,
  );
  const stationTimetable = requireRecord(
    timetable.stationTimetable,
    `${COVERAGE_PATH}.operators[].timetable.stationTimetable`,
  );
  const results = requireArray(
    stationTimetable.results,
    `${COVERAGE_PATH}.operators[].timetable.stationTimetable.results`,
  );
  return results
    .map((entry) => {
      if (!isRecord(entry) || !isRecord(entry.scope)) return null;
      return typeof entry.scope.station === "string"
        ? entry.scope.station
        : null;
    })
    .filter((value): value is string => value !== null)
    .sort();
}

function probeRecordCount(
  value: unknown,
  label: string,
  allowMissing = true,
): number | null {
  if (value === undefined || value === null) {
    if (allowMissing) return null;
    throw new Error(`${label} is required`);
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function evidenceSummary(
  probes: readonly {
    readonly state: string;
    readonly detail: string | null;
    readonly recordCount: number | null;
  }[],
): OdptEvidenceSummary {
  if (probes.length === 0) return "unknown";
  if (
    probes.every(
      ({ state, detail }) =>
        state === "too_large" && detail === "provider_response_too_large",
    )
  ) {
    return "provider_response_too_large";
  }
  if (
    probes.every(
      ({ state, recordCount }) =>
        state === "records" && recordCount !== null && recordCount > 0,
    )
  ) {
    return "records";
  }
  if (
    probes.every(
      ({ state, recordCount }) => state === "empty" && recordCount === 0,
    )
  ) {
    return "empty";
  }
  if (probes.every(({ state }) => state === "unknown")) return "unknown";
  return "inconclusive";
}

function validateProbeAggregate(
  timetable: JsonRecord,
  results: readonly JsonRecord[],
  label: string,
): void {
  const probeCount = probeRecordCount(
    timetable.probeCount,
    `${label}.probeCount`,
    false,
  );
  if (probeCount !== results.length) {
    throw new Error(`${label}.probeCount disagrees with results length`);
  }
  const byState = requireRecord(timetable.byState, `${label}.byState`);
  const actualByState = new Map<string, number>();
  for (const result of results) {
    const state = requireString(result.state, `${label}.results[].state`);
    actualByState.set(state, (actualByState.get(state) ?? 0) + 1);
  }
  const declaredStates = new Map<string, number>();
  for (const [state, count] of Object.entries(byState)) {
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      throw new Error(
        `${label}.byState.${state} must be a non-negative safe integer`,
      );
    }
    declaredStates.set(state, count);
  }
  if (
    declaredStates.size !== actualByState.size ||
    [...actualByState].some(
      ([state, count]) => declaredStates.get(state) !== count,
    )
  ) {
    throw new Error(`${label}.byState disagrees with probe states`);
  }
  const conclusiveCount = probeRecordCount(
    timetable.conclusiveCount,
    `${label}.conclusiveCount`,
    false,
  );
  const actualConclusiveCount = results.filter(
    ({ state }) => state === "records" || state === "empty",
  ).length;
  if (conclusiveCount !== actualConclusiveCount) {
    throw new Error(`${label}.conclusiveCount disagrees with probe states`);
  }
  if (typeof timetable.coverageKnown !== "boolean") {
    throw new Error(`${label}.coverageKnown must be boolean`);
  }
}

function probeResourceState(
  probes: readonly {
    readonly state: string;
    readonly recordCount: number | null;
  }[],
): "records" | "empty" | "unknown" {
  if (
    probes.every(
      ({ state, recordCount }) =>
        state === "records" && recordCount !== null && recordCount > 0,
    )
  ) {
    return "records";
  }
  if (
    probes.every(
      ({ state, recordCount }) => state === "empty" && recordCount === 0,
    )
  ) {
    return "empty";
  }
  return "unknown";
}

function validateIncludedPilotEvidence(
  includedEntry: JsonRecord,
  operator: string,
  broadProbes: readonly Kai292C4EOdptBroadTimetableProbe[],
  exactProbe: Kai292C4EOdptExactTrainProbe,
): void {
  const evidence = requireRecord(
    includedEntry.evidence,
    `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence`,
  );
  if (
    probeRecordCount(
      evidence.trainTimetableProbes,
      `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence.trainTimetableProbes`,
      false,
    ) !== broadProbes.length ||
    probeRecordCount(
      evidence.trainTimetableWithRecords,
      `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence.trainTimetableWithRecords`,
      false,
    ) !== broadProbes.filter(({ state }) => state === "records").length
  ) {
    throw new Error(
      `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence disagrees with trainTimetable results`,
    );
  }
  const resourceCoverage = requireRecord(
    evidence.resourceCoverage,
    `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence.resourceCoverage`,
  );
  if (resourceCoverage.TrainTimetable !== probeResourceState(broadProbes)) {
    throw new Error(
      `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence.resourceCoverage.TrainTimetable disagrees with trainTimetable results`,
    );
  }
  if (evidence.trainIdentityProbeState !== exactProbe.state) {
    throw new Error(
      `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence.trainIdentityProbeState disagrees with trainIdentityProbe.state`,
    );
  }
  const exactCoverage =
    exactProbe.state === "records" && exactProbe.recordCount > 0
      ? "records"
      : "absent";
  if (evidence.trainIdentityProbeCoverage !== exactCoverage) {
    throw new Error(
      `${COVERAGE_PATH}.pilotScope.included[${operator}].evidence.trainIdentityProbeCoverage disagrees with trainIdentityProbe`,
    );
  }
}

function timetableProbeFacts(coverage: JsonRecord): {
  readonly measuredPilotOperators: readonly string[];
  readonly broadTimetableResult: OdptEvidenceSummary;
  readonly exactTrainProbeResult: OdptEvidenceSummary;
  readonly broadTrainTimetableProbes: readonly Kai292C4EOdptBroadTimetableProbe[];
  readonly exactTrainIdentityProbes: readonly Kai292C4EOdptExactTrainProbe[];
} {
  const pilot = requireRecord(
    coverage.pilotScope,
    `${COVERAGE_PATH}.pilotScope`,
  );
  const included = requireArray(
    pilot.included,
    `${COVERAGE_PATH}.pilotScope.included`,
  );
  const operators = requireArray(
    coverage.operators,
    `${COVERAGE_PATH}.operators`,
  );
  const includedRecords = included.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(
        `${COVERAGE_PATH}.pilotScope.included[${index}] must be an object`,
      );
    }
    return entry;
  });
  const measuredPilotOperators = includedRecords
    .map((entry, index) =>
      requireString(
        entry.operator,
        `${COVERAGE_PATH}.pilotScope.included[${index}].operator`,
      ),
    )
    .sort();
  if (new Set(measuredPilotOperators).size !== measuredPilotOperators.length) {
    throw new Error(
      `${COVERAGE_PATH}.pilotScope.included contains duplicate operators`,
    );
  }
  const broadTrainTimetableProbes: Kai292C4EOdptBroadTimetableProbe[] = [];
  const exactTrainIdentityProbes: Kai292C4EOdptExactTrainProbe[] = [];
  for (const operator of measuredPilotOperators) {
    const includedEntry = includedRecords.find(
      (entry) => entry.operator === operator,
    );
    if (includedEntry === undefined) {
      throw new Error(
        `${COVERAGE_PATH}.pilotScope.included is missing ${operator}`,
      );
    }
    const operatorRecord = operators.find(
      (entry) => isRecord(entry) && entry.operator === operator,
    );
    if (!isRecord(operatorRecord)) {
      throw new Error(`${COVERAGE_PATH}.operators is missing ${operator}`);
    }
    const timetable = requireRecord(
      operatorRecord.timetable,
      `${COVERAGE_PATH}.operators[${operator}].timetable`,
    );
    const trainTimetable = requireRecord(
      timetable.trainTimetable,
      `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable`,
    );
    const trainTimetableResults = requireArray(
      trainTimetable.results,
      `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results`,
    );
    if (trainTimetableResults.length === 0) {
      throw new Error(
        `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results must not be empty`,
      );
    }
    const trainTimetableResultRecords = trainTimetableResults.map(
      (result, index) =>
        requireRecord(
          result,
          `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results[${index}]`,
        ),
    );
    validateProbeAggregate(
      trainTimetable,
      trainTimetableResultRecords,
      `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable`,
    );
    for (const [index, record] of trainTimetableResultRecords.entries()) {
      const scope = requireRecord(
        record.scope,
        `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results[${index}].scope`,
      );
      if (Object.keys(scope).length === 0) {
        throw new Error(
          `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results[${index}].scope must not be empty`,
        );
      }
      const detail =
        record.detail === undefined || record.detail === null
          ? null
          : requireString(
              record.detail,
              `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results[${index}].detail`,
            );
      broadTrainTimetableProbes.push({
        operator,
        scope,
        state: requireString(
          record.state,
          `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results[${index}].state`,
        ),
        detail,
        recordCount: probeRecordCount(
          record.recordCount,
          `${COVERAGE_PATH}.operators[${operator}].timetable.trainTimetable.results[${index}].recordCount`,
        ),
      });
    }
    const exactProbe = requireRecord(
      timetable.trainIdentityProbe,
      `${COVERAGE_PATH}.operators[${operator}].timetable.trainIdentityProbe`,
    );
    const exactProbeFinding: Kai292C4EOdptExactTrainProbe = {
      operator,
      trainIdentity: requireString(
        exactProbe.trainIdentity,
        `${COVERAGE_PATH}.operators[${operator}].timetable.trainIdentityProbe.trainIdentity`,
      ),
      state: requireString(
        exactProbe.state,
        `${COVERAGE_PATH}.operators[${operator}].timetable.trainIdentityProbe.state`,
      ),
      recordCount: probeRecordCount(
        exactProbe.recordCount,
        `${COVERAGE_PATH}.operators[${operator}].timetable.trainIdentityProbe.recordCount`,
        false,
      ) as number,
    };
    exactTrainIdentityProbes.push(exactProbeFinding);
    validateIncludedPilotEvidence(
      includedEntry,
      operator,
      broadTrainTimetableProbes.filter(
        ({ operator: candidate }) => candidate === operator,
      ),
      exactProbeFinding,
    );
  }
  broadTrainTimetableProbes.sort(
    (left, right) =>
      left.operator.localeCompare(right.operator) ||
      JSON.stringify(left.scope).localeCompare(JSON.stringify(right.scope)),
  );
  exactTrainIdentityProbes.sort((left, right) =>
    left.operator.localeCompare(right.operator),
  );
  return {
    measuredPilotOperators,
    broadTimetableResult: evidenceSummary(broadTrainTimetableProbes),
    exactTrainProbeResult: evidenceSummary(
      exactTrainIdentityProbes.map(({ state, recordCount }) => ({
        state,
        recordCount,
        detail: null,
      })),
    ),
    broadTrainTimetableProbes,
    exactTrainIdentityProbes,
  };
}

function stationAccess(
  destinationId: AnchorId,
  catalogue: JsonRecord,
  stationId: string,
): Kai292C4EAnchorFinding["stationToDestinationAccess"] {
  const neutralStatement =
    "No reviewed station-to-destination access evidence is bound to the exact ODPT station identity.";
  const localTransport = catalogue.localTransport;
  if (
    destinationId === "ueno-park" &&
    isRecord(localTransport) &&
    localTransport.kind === "verified_walking"
  ) {
    const urls = sourceUrls(localTransport);
    return {
      status: "source_backed_station_label_only",
      exactStationIdentityBound: false,
      sourceUrls: urls,
      statement:
        typeof localTransport.walkingEvidence === "string"
          ? localTransport.walkingEvidence
          : `Source-backed walking evidence names a station but does not carry exact ODPT identity ${stationId}.`,
      missingPrerequisite: "exact_identity_bound_access_evidence",
    };
  }
  return {
    status: "unavailable",
    exactStationIdentityBound: false,
    sourceUrls: [],
    statement: neutralStatement,
    missingPrerequisite: "reviewed_station_to_destination_access_evidence",
  };
}

function anchorFinding(
  id: AnchorId,
  catalogue: JsonRecord,
  anchor: JsonRecord,
  coverage: JsonRecord,
  c2State: Kai292C4EC2RegistryState,
  reviewedProductIds: readonly string[],
): Kai292C4EAnchorFinding {
  const stationId = requireString(anchor.odptStationId, `${id}.odptStationId`);
  const operator = requireString(anchor.operator, `${id}.operator`);
  const railway = requireString(anchor.railway, `${id}.railway`);
  if (anchor.proposedOutcome !== "geographic_unique_candidate") {
    throw new Error(`${id} is not a reviewed geographic_unique_candidate`);
  }
  const pilotStatus = includedPilotOperator(coverage, operator);
  const sampled = sampledStationIds(coverage, operator);
  const access = stationAccess(id, catalogue, stationId);
  const c2Missing = c2MissingPrerequisite(c2State);
  const missingPrerequisites = [
    ...(reviewedProductIds.length === 0
      ? ["reviewed_stable_product_origin_identity"]
      : []),
    "explicit_catalogue_destination_crosswalk",
    ...(access.exactStationIdentityBound ? [] : [access.missingPrerequisite]),
    ...(c2Missing === null ? [] : [c2Missing]),
    "direct_or_one_transfer_scheduled_support",
  ];
  return {
    destinationId: id,
    catalogue: {
      status: "present",
      productId: requireString(catalogue.id, `${id}.id`),
      name: requireString(catalogue.name, `${id}.name`),
      role: typeof catalogue.role === "string" ? catalogue.role : null,
      kind: typeof catalogue.kind === "string" ? catalogue.kind : null,
      source: CATALOGUE_PATH,
    },
    reviewedStation: {
      status: "reviewed_geographic_anchor",
      provider: "odpt",
      stationId,
      operator,
      railway,
      evidencePath: "geographic_unique_candidate",
      source: ANCHOR_PATH,
      productionCrosswalk: false,
    },
    stationToDestinationAccess: access,
    providerOperator: {
      provider: "odpt",
      operator,
      railway,
      source: ANCHOR_PATH,
      identityPreserved: true,
    },
    odptTimetableEvidence: {
      source: COVERAGE_PATH,
      boundary: "https://meguruto.app/api/odpt",
      operatorPilotStatus: pilotStatus,
      operatorEvidenceScope: "operator_sample_only",
      exactStationTimetableStatus: sampled.includes(stationId)
        ? "sampled"
        : "not_evidenced",
      exactStationIdentity: stationId,
      exactStationSampled: sampled.includes(stationId),
      exactTrainTimetableStatus: "not_evidenced_for_anchor",
      credentialSafeStaticClaim: true,
    },
    c2ScheduledTransitDataset: {
      canEnterTrustedC2: c2State.canEnterTrustedC2,
      artifactValid: c2State.artifactValidOdptDatasetKeys.length > 0,
      productionScheduledDatasetEligible:
        c2State.productionEligibleOdptDatasetKeys.length > 0,
      registeredDatasetKeys: c2State.registeredDatasetKeys,
      registeredProviders: c2State.registeredProviders,
      reason: c2State.reason,
      registrySource: DATASET_REGISTRY_PATH,
      loaderSource: DATASET_LOADER_PATH,
    },
    exactProductSafeOriginOptions: [],
    missingPrerequisites,
    productionCrosswalk: false,
    scheduledSupport: "blocked",
  };
}

function checkedIdentityEvidence(
  rootDir: string,
  providedIdentities?: readonly Kai292C4EOriginIdentityEvidence[],
): readonly string[] {
  const identities =
    providedIdentities ??
    requireArray(
      requireRecord(
        readJson(rootDir, IDENTITY_EVIDENCE_PATH),
        IDENTITY_EVIDENCE_PATH,
      ).originIdentities,
      `${IDENTITY_EVIDENCE_PATH}.originIdentities`,
    );
  return identities
    .filter(
      (entry) =>
        isRecord(entry) &&
        entry.identityKind === "product" &&
        entry.identityStability === "stable_product_id" &&
        entry.reviewStatus === "reviewed" &&
        nonEmpty(entry.productId),
    )
    .map((entry) => (entry as { readonly productId: string }).productId)
    .filter((productId) => !productId.startsWith("kai-292c2-pilot-"))
    .filter(
      (productId, index, productIds) => productIds.indexOf(productId) === index,
    )
    .sort();
}

function buildCorridorReadinessBlockers(
  gates: readonly Kai292C4EReport["gates"][number][],
  c2State: Kai292C4EC2RegistryState,
): readonly Kai292C4EBlocker[] {
  const gateSatisfied = (
    gate: Kai292C4EReport["gates"][number]["gate"],
  ): boolean =>
    gates.find((candidate) => candidate.gate === gate)?.satisfied ?? false;
  const blockers: Kai292C4EBlocker[] = [];
  if (!gateSatisfied("real_meguruto_origin")) {
    blockers.push({
      code: "missing_canonical_product_origin_identity",
      statement:
        "The current origin evidence contains no reviewed stable Meguruto product identity; free-text origin labels and coordinates are not a canonical transit endpoint.",
      evidence: [IDENTITY_EVIDENCE_PATH, CATALOGUE_PATH],
    });
  }
  if (!gateSatisfied("exact_transit_identities")) {
    blockers.push({
      code: "missing_catalogue_destination_crosswalk",
      statement:
        "No exact scheduled-transit crosswalk maps a current catalogue destination ID; the two existing mappings are non-product Sakata pilot IDs.",
      evidence: [CROSSWALK_PATH, CATALOGUE_PATH],
    });
  }
  if (!gateSatisfied("explicit_reviewed_station_destination_access")) {
    blockers.push({
      code: "station_to_destination_access_not_exactly_bound",
      statement:
        "KAI-291A geographic uniqueness is not station-to-destination access evidence. Ueno has a reviewed station-label walking statement without exact ODPT binding; the other six current catalogue records do not provide usable access evidence.",
      evidence: [ANCHOR_PATH, CATALOGUE_PATH],
    });
  }
  if (!gateSatisfied("production_loadable_scheduled_dataset")) {
    const datasetStatement =
      c2State.reason === "no_registered_odpt_scheduled_dataset"
        ? "TokyoMetro/Toei ODPT timetable observations are available only as bounded live-boundary audit evidence and old capability code; the current trusted C2 ScheduledTransitDataset registry has no ODPT scheduled artifact or descriptor."
        : c2State.reason === "registered_odpt_dataset_not_loadable"
          ? "An ODPT descriptor is registered, but no descriptor-backed valid ODPT scheduled artifact is available to enter trusted C2."
          : c2State.reason === "registered_odpt_dataset_not_production_eligible"
            ? "A descriptor-backed ODPT artifact is valid, but it is not production-suitable scheduled-routing evidence for trusted C2."
            : "An ODPT descriptor and production-suitable scheduled artifact are registered and loadable under the trusted C2 contract.";
    blockers.push({
      code: "odpt_timetable_not_representable_in_trusted_c2",
      statement: datasetStatement,
      evidence: [
        COVERAGE_PATH,
        ODPT_CORE_PATH,
        DATASET_REGISTRY_PATH,
        DATASET_LOADER_PATH,
      ],
    });
  }
  if (!gateSatisfied("direct_or_one_transfer_structural_support")) {
    blockers.push({
      code: "missing_direct_or_one_transfer_scheduled_support",
      statement:
        "No real product origin plus catalogue destination pair reaches the C2 direct/one-transfer structural support gate; the only currently loadable scheduled dataset is the non-product Sakata pilot.",
      evidence: [CROSSWALK_PATH, DATASET_REGISTRY_PATH],
    });
  }
  return blockers;
}

function emptyRuntimeProof(
  status: "absent" | "invalid",
  reason: string | null,
): Kai292C4ERuntimeProofEvidence {
  return {
    status,
    source: KAI_292C4H_RUNTIME_PROOF_PATH,
    reason,
    corridor: null,
    temporal: null,
    journey: null,
    c4b: null,
    c4c: null,
  };
}

function runtimeProofEvidence(
  rootDir: string,
  providedProof?: unknown,
): Kai292C4ERuntimeProofEvidence {
  let raw: unknown = providedProof;
  if (raw === undefined) {
    if (!existsSync(resolve(rootDir, KAI_292C4H_RUNTIME_PROOF_PATH))) {
      return emptyRuntimeProof(
        "absent",
        "committed_runtime_proof_artifact_missing",
      );
    }
    try {
      raw = readJson(rootDir, KAI_292C4H_RUNTIME_PROOF_PATH);
    } catch (error: unknown) {
      return emptyRuntimeProof(
        "invalid",
        `runtime_proof_read_failed:${String(error)}`,
      );
    }
  }
  if (!isRecord(raw)) {
    return emptyRuntimeProof("invalid", "runtime_proof_not_an_object");
  }
  try {
    const corridor = requireRecord(raw.corridor, "runtimeProof.corridor");
    const temporal = requireRecord(raw.temporal, "runtimeProof.temporal");
    const journey = requireRecord(raw.journey, "runtimeProof.journey");
    const c4b = requireRecord(raw.c4b, "runtimeProof.c4b");
    const c4c = requireRecord(raw.c4c, "runtimeProof.c4c");
    const safety = requireRecord(raw.safety, "runtimeProof.safety");
    const safeInteger = (value: unknown, label: string): number => {
      if (!Number.isSafeInteger(value)) {
        throw new Error(`${label} must be a safe integer`);
      }
      return value as number;
    };
    if (
      corridor.direction !== "outbound" ||
      temporal.source !== "controlled_internal_test_fixture" ||
      temporal.timeZone !== "Asia/Tokyo" ||
      journey.kind !== "journey" ||
      journey.selected !== "direct" ||
      journey.legCount !== 1 ||
      journey.transferCount !== 0 ||
      journey.journeySource !== "gtfs_scheduled_timetable" ||
      c4b.kind !== "scheduled_journey" ||
      c4b.evidence !== "verified" ||
      c4b.transferCount !== 0 ||
      c4c.kind !== "verified_scheduled_journey" ||
      c4c.source !== "scheduled" ||
      c4c.selected !== "direct"
    ) {
      return emptyRuntimeProof(
        "invalid",
        "runtime_proof_literal_contract_mismatch",
      );
    }
    const corridorSummary = {
      originProductId: requireString(
        corridor.originProductId,
        "runtimeProof.corridor.originProductId",
      ),
      destinationProductId: requireString(
        corridor.destinationProductId,
        "runtimeProof.corridor.destinationProductId",
      ),
      direction: "outbound" as const,
      datasetKey: requireString(
        corridor.datasetKey,
        "runtimeProof.corridor.datasetKey",
      ),
      datasetId: requireString(
        corridor.datasetId,
        "runtimeProof.corridor.datasetId",
      ),
    };
    const temporalSummary = {
      source: "controlled_internal_test_fixture" as const,
      serviceDate: requireString(
        temporal.serviceDate,
        "runtimeProof.temporal.serviceDate",
      ),
      earliestDepartureTime: requireString(
        temporal.earliestDepartureTime,
        "runtimeProof.temporal.earliestDepartureTime",
      ),
      earliestDepartureServiceSeconds: safeInteger(
        temporal.earliestDepartureServiceSeconds,
        "runtimeProof.temporal.earliestDepartureServiceSeconds",
      ),
    };
    const journeySummary = {
      selected: "direct" as const,
      transferCount: 0 as const,
      serviceId: requireString(
        journey.serviceId,
        "runtimeProof.journey.serviceId",
      ),
      providerServiceId: requireString(
        journey.providerServiceId,
        "runtimeProof.journey.providerServiceId",
      ),
      routeId: requireString(journey.routeId, "runtimeProof.journey.routeId"),
      providerRouteId: requireString(
        journey.providerRouteId,
        "runtimeProof.journey.providerRouteId",
      ),
      providerOperatorId: requireString(
        journey.providerOperatorId,
        "runtimeProof.journey.providerOperatorId",
      ),
      originStopId: requireString(
        journey.originStopId,
        "runtimeProof.journey.originStopId",
      ),
      destinationStopId: requireString(
        journey.destinationStopId,
        "runtimeProof.journey.destinationStopId",
      ),
      actualDepartureServiceSeconds: safeInteger(
        journey.actualDepartureServiceSeconds,
        "runtimeProof.journey.actualDepartureServiceSeconds",
      ),
      actualArrivalServiceSeconds: safeInteger(
        journey.actualArrivalServiceSeconds,
        "runtimeProof.journey.actualArrivalServiceSeconds",
      ),
      durationSeconds: safeInteger(
        journey.durationSeconds,
        "runtimeProof.journey.durationSeconds",
      ),
    };
    const c4bSummary = {
      kind: "scheduled_journey" as const,
      evidence: "verified" as const,
      transferCount: 0 as const,
      durationSeconds: safeInteger(
        c4b.durationSeconds,
        "runtimeProof.c4b.durationSeconds",
      ),
    };
    const c4cSummary = {
      kind: "verified_scheduled_journey" as const,
      source: "scheduled" as const,
      selected: "direct" as const,
    };
    const valid =
      raw.schemaVersion === KAI_292C4H_RUNTIME_PROOF_SCHEMA_VERSION &&
      raw.status === "verified_controlled_runtime" &&
      raw.generatedBy === "scripts/transit/audit-kai-292c4h-runtime-proof.ts" &&
      corridorSummary.originProductId === KAI_292C4H_ORIGIN_PRODUCT_ID &&
      corridorSummary.destinationProductId ===
        KAI_292C4H_DESTINATION_PRODUCT_ID &&
      corridorSummary.direction === "outbound" &&
      corridorSummary.datasetKey === KAI_292C4H_DATASET_KEY &&
      corridorSummary.datasetId === KAI_292C4H_DATASET_KEY &&
      corridor.provider === "gtfs" &&
      corridor.identityNamespace === "toei-gtfs" &&
      temporalSummary.source === "controlled_internal_test_fixture" &&
      temporal.evidenceId === KAI_292C4H_EVIDENCE_ID &&
      temporalSummary.serviceDate === KAI_292C4H_SERVICE_DATE &&
      temporalSummary.earliestDepartureTime ===
        KAI_292C4H_EARLIEST_DEPARTURE_TIME &&
      temporalSummary.earliestDepartureServiceSeconds === 18_000 &&
      temporal.timeZone === "Asia/Tokyo" &&
      journey.kind === "journey" &&
      journeySummary.selected === "direct" &&
      journey.legCount === 1 &&
      journeySummary.transferCount === 0 &&
      journey.journeySource === "gtfs_scheduled_timetable" &&
      journeySummary.actualArrivalServiceSeconds >
        journeySummary.actualDepartureServiceSeconds &&
      journeySummary.durationSeconds ===
        journeySummary.actualArrivalServiceSeconds -
          journeySummary.actualDepartureServiceSeconds &&
      c4bSummary.kind === "scheduled_journey" &&
      c4bSummary.evidence === "verified" &&
      c4bSummary.transferCount === 0 &&
      c4bSummary.durationSeconds === journeySummary.durationSeconds &&
      c4cSummary.kind === "verified_scheduled_journey" &&
      c4cSummary.source === "scheduled" &&
      c4cSummary.selected === "direct" &&
      safety.productionBoundary === true &&
      safety.mockedJourney === false &&
      safety.syntheticTransitGraph === false &&
      safety.sakataSubstitute === false &&
      safety.returnTimeInvented === false;
    if (!valid) {
      return emptyRuntimeProof("invalid", "runtime_proof_contract_mismatch");
    }
    return {
      status: "verified_controlled_runtime",
      source: KAI_292C4H_RUNTIME_PROOF_PATH,
      reason: null,
      corridor: corridorSummary,
      temporal: temporalSummary,
      journey: journeySummary,
      c4b: c4bSummary,
      c4c: c4cSummary,
    };
  } catch (error: unknown) {
    return emptyRuntimeProof(
      "invalid",
      `runtime_proof_invalid:${String(error)}`,
    );
  }
}

function buildC4DBlockers(
  runtimeProof: Kai292C4ERuntimeProofEvidence,
): readonly Kai292C4EC4DBlocker[] {
  if (runtimeProof.status === "verified_controlled_runtime") {
    return [
      {
        code: "no_authoritative_service_date_or_departure_time",
        statement:
          "A controlled runtime Journey is verified for one corridor, but general product flows still do not supply authoritative scheduled service date and departure time inputs.",
        evidence: [C3_PATH, KAI_292C4H_RUNTIME_PROOF_PATH],
      },
    ];
  }
  return [
    {
      code: "no_authoritative_service_date_or_departure_time",
      statement:
        "C3 supplies a fail-closed temporal contract, but the current product flow does not supply an authoritative scheduled service date and departure time.",
      evidence: [C3_PATH],
    },
    {
      code: "runtime_journey_verification_not_evaluated",
      statement:
        "Runtime Journey verification is not evaluated from prerequisite gates alone; C4D remains blocked until authoritative runtime evidence is supplied.",
      evidence: [C3_PATH],
    },
  ];
}

function rankAnchors(
  anchors: readonly Kai292C4EAnchorFinding[],
): Kai292C4EReport["ranking"] {
  return [...anchors]
    .sort((left, right) => {
      const leftScore =
        left.stationToDestinationAccess.status ===
        "source_backed_station_label_only"
          ? 1
          : 2;
      const rightScore =
        right.stationToDestinationAccess.status ===
        "source_backed_station_label_only"
          ? 1
          : 2;
      return (
        leftScore - rightScore ||
        left.destinationId.localeCompare(right.destinationId)
      );
    })
    .map((anchor, index) => {
      const score =
        anchor.stationToDestinationAccess.status ===
        "source_backed_station_label_only"
          ? 1
          : 2;
      return {
        rank: score === 1 ? 1 : 2,
        destinationId: anchor.destinationId,
        infrastructureGapScore: score,
        tier: score === 1 ? "Tier 1" : "Tier 2",
        tieGroup: score === 1 ? "tier-1-gap-score-1" : "tier-2-gap-score-2",
        tieBreakOrder: index + 1,
        reason:
          score === 1
            ? "Lowest current gap: catalogue identity, reviewed ODPT station, and source-backed station-label access exist, but exact access binding, origin, C2 representation, and schedule proof are still missing."
            : "No reviewed station-to-destination access evidence is available in the current catalogue record; the shared origin, C2 representation, and schedule prerequisites are also missing.",
      };
    });
}

export function buildKai292C4EPrerequisiteAudit(
  rootDir = process.cwd(),
  options: Kai292C4EAuditOptions = {},
): Kai292C4EReport {
  const records = catalogueRecords(rootDir);
  const byId = new Map(records.map((record) => [record.id, record]));
  const anchorsById = new Map(
    anchorRecords(rootDir).map((anchor) => [anchor.destinationId, anchor]),
  );
  const coverage = coverageRoot(rootDir, options.odptCoverage);
  const descriptors = c2Descriptors(options);
  const c2State = c2RegistryState(
    rootDir,
    descriptors,
    options.scheduledTransitArtifacts,
  );
  const c4a = auditRealMegurutoCorridor(rootDir);
  const reviewedProductIds = checkedIdentityEvidence(
    rootDir,
    options.originIdentities,
  );
  const crosswalk = crosswalkMappings(
    rootDir,
    options.scheduledTransitCrosswalkMappings,
  );
  const registeredDatasetScopes = new Set(
    descriptors
      .filter(validDescriptor)
      .map(
        ({ datasetId, provider, identityNamespace }) =>
          `${datasetId}|${provider}|${identityNamespace}`,
      ),
  );
  const exactEndpointIdentityPairs = findExactEndpointIdentityPairs(
    crosswalk,
    new Set(records.map(({ id }) => id).filter(nonEmpty)),
    reviewedProductIds,
    registeredDatasetScopes,
  );
  const anchors = KAI_292C4E_ANCHOR_IDS.map((id) => {
    const catalogue = byId.get(id);
    const anchor = anchorsById.get(id);
    if (catalogue === undefined || anchor === undefined) {
      throw new Error(`required KAI-291A anchor ${id} is missing`);
    }
    return anchorFinding(
      id,
      catalogue,
      anchor,
      coverage,
      c2State,
      reviewedProductIds,
    );
  });
  const pilotFacts = timetableProbeFacts(coverage);
  const gates: Kai292C4EReport["gates"] = [
    {
      gate: "real_meguruto_origin",
      satisfied: reviewedProductIds.length > 0,
      statement:
        reviewedProductIds.length > 0
          ? "A reviewed stable product origin identity is available for exact crosswalk evaluation."
          : "A reviewed stable product origin identity is required; none is currently present.",
    },
    {
      gate: "real_catalogue_destination",
      satisfied: anchors.every(
        ({ catalogue }) => catalogue.status === "present",
      ),
      statement:
        "All seven requested destination IDs are present in the current catalogue.",
    },
    {
      gate: "explicit_reviewed_station_destination_access",
      satisfied: c4a.realCorridors.length > 0,
      statement:
        c4a.realCorridors.length > 0
          ? "C4A has at least one exact reviewed station-to-destination access binding for a real product corridor."
          : "No reviewed station-to-destination access evidence is bound to an exact real product corridor.",
    },
    {
      gate: "exact_transit_identities",
      satisfied: exactEndpointIdentityPairs.length > 0,
      statement:
        exactEndpointIdentityPairs.length > 0
          ? "At least one reviewed origin and catalogue destination have compatible exact endpoint mappings in the same registered dataset scope."
          : "No compatible reviewed-origin and catalogue-destination exact endpoint pair exists in a registered dataset scope.",
    },
    {
      gate: "production_loadable_scheduled_dataset",
      satisfied: c2State.canEnterTrustedC2,
      statement:
        c2State.reason === "no_registered_odpt_scheduled_dataset"
          ? "The current registry has no ODPT scheduled dataset descriptor/artifact; Sakata is not product coverage."
          : c2State.reason === "registered_odpt_dataset_not_loadable"
            ? "An ODPT descriptor is registered, but its required artifact/loadability evidence is not valid."
            : c2State.reason ===
                "registered_odpt_dataset_not_production_eligible"
              ? "A descriptor-backed ODPT artifact is valid, but it is not production-suitable scheduled-routing evidence."
              : "A registered ODPT scheduled dataset is loadable under the trusted C2 contract.",
    },
    {
      gate: "direct_or_one_transfer_structural_support",
      satisfied: c4a.realCorridors.length > 0,
      statement:
        c4a.realCorridors.length > 0
          ? "C4A has at least one real product corridor with direct or one-transfer structural support."
          : "C4A has zero real product corridors and no supported direct/one-transfer pair to evaluate.",
    },
  ];
  const corridorReadinessBlockers = buildCorridorReadinessBlockers(
    gates,
    c2State,
  );
  const runtimeProof = runtimeProofEvidence(rootDir, options.runtimeProof);
  const c4dBlockers = buildC4DBlockers(runtimeProof);
  const status = gates.every(({ satisfied }) => satisfied)
    ? "prerequisites_satisfied"
    : "blocked_prerequisite";
  const controlledRuntimeProofVerified =
    status === "prerequisites_satisfied" &&
    runtimeProof.status === "verified_controlled_runtime";

  return {
    schemaVersion: KAI_292C4E_AUDIT_SCHEMA_VERSION,
    status,
    generatedBy: "scripts/transit/audit-kai-292c4e-prerequisite.ts",
    scope: {
      ticket: "KAI-292C4E",
      outcome: "Outcome B — reusable prerequisite/blocker report",
      networkCalls: 0,
      credentialRead: false,
      credentialEmitted: false,
    },
    anchors,
    exactEndpointIdentityPairs,
    ranking: rankAnchors(anchors),
    odptBoundary: {
      source: COVERAGE_PATH,
      boundary: "https://meguruto.app/api/odpt",
      liveResultReplayed: false,
      credentialExposed: false,
      authenticatedAuditClaim: "available_as_committed_static_evidence_only",
      measuredPilotOperators: pilotFacts.measuredPilotOperators,
      reviewedStationEvidence: "qa/kai-291/pilot-station-index.json",
      broadTimetableResult: pilotFacts.broadTimetableResult,
      exactTrainProbeResult: pilotFacts.exactTrainProbeResult,
      broadTrainTimetableProbes: pilotFacts.broadTrainTimetableProbes,
      exactTrainIdentityProbes: pilotFacts.exactTrainIdentityProbes,
      caveat:
        "The committed authenticated audit is scoped to its sampled stations/railways. It proves measured provider responses in that corpus, not universal operator or anchor-station coverage.",
      oldDirectJourney: {
        source: ODPT_JOURNEY_PATH,
        builderSource: ODPT_JOURNEY_BUILDER_PATH,
        status: "capability_only_not_called",
        connectedToC4E: false,
        connectedToC4C: false,
      },
      inspectedProviderNormalizer: ODPT_CORE_PATH,
    },
    c2Boundary: {
      registeredDatasetKeys: c2State.registeredDatasetKeys,
      registeredProviders: c2State.registeredProviders,
      artifactValidOdptDatasetKeys: c2State.artifactValidOdptDatasetKeys,
      productionEligibleOdptDatasetKeys:
        c2State.productionEligibleOdptDatasetKeys,
      odptEvidenceCanEnterTrustedDataset: c2State.canEnterTrustedC2,
      reason: c2State.reason,
      importerBoundary: {
        odptTopologyImporter: "normalized_topology_capability_only",
        odptTopologyImporterSource: ODPT_TOPOLOGY_IMPORTER_PATH,
        gtfsScheduleImporter: "current_scheduled_dataset_path",
        gtfsScheduleImporterSource: GTFS_SCHEDULE_IMPORTER_PATH,
      },
      registrySource: DATASET_REGISTRY_PATH,
      loaderSource: DATASET_LOADER_PATH,
      crosswalkSource: CROSSWALK_PATH,
    },
    origin: {
      status:
        reviewedProductIds.length === 0
          ? "missing_canonical_product_identity"
          : "available",
      source: IDENTITY_EVIDENCE_PATH,
      reviewedProductIds,
      exactProductOriginOptions: reviewedProductIds,
      freeTextLabelAndCoordinates: "insufficient",
      rejectedOptions: [
        {
          kind: "free_text_label_and_coordinates",
          status: "rejected",
          reason:
            "Current product input is not a stable provider/product identity.",
        },
        {
          kind: "nearest_station",
          status: "rejected",
          reason:
            "Nearest/proximity matching would infer an identity and is forbidden.",
        },
        {
          kind: "geographic_anchor",
          status: "rejected",
          reason:
            "KAI-291A destination geography is audit evidence only and is not an origin identity.",
        },
        {
          kind: "sakata_pilot_identity",
          status: "rejected",
          reason:
            "Sakata IDs are bounded C2 pilot identities, not Meguruto product coverage.",
        },
        {
          kind: "old_odpt_direct_journey_input",
          status: "rejected",
          reason:
            "Old ODPT Journey code is not a trusted C2 dataset and must not bypass the C2 boundary.",
        },
      ],
      missingPrerequisite:
        reviewedProductIds.length === 0
          ? "reviewed_stable_product_origin_identity"
          : null,
    },
    gates,
    corridorReadinessBlockers,
    c4dBlockers,
    runtimeProof,
    blockers: corridorReadinessBlockers,
    c4a: {
      corridorCount: c4a.realCorridors.length,
      status: c4a.status,
      inheritedBlockers: c4a.blockers.map(({ code }) => code),
      crosswalkChanged: false,
    },
    promotedAnchorCount: 0,
    identityResolutionPolicy: {
      nameFallback: false,
      coordinateFallback: false,
      nearestFallback: false,
      geographicAnchorPromotion: false,
    },
    c4d: {
      status: controlledRuntimeProofVerified
        ? "controlled_runtime_proof_verified"
        : "blocked",
      reason: controlledRuntimeProofVerified
        ? "controlled_runtime_proof_only"
        : status === "blocked_prerequisite"
          ? "c4e_prerequisites_not_satisfied"
          : "runtime_evidence_absent",
      blockers: c4dBlockers,
    },
  };
}

export function serializeKai292C4EReport(report: Kai292C4EReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function runCli(): void {
  const report = buildKai292C4EPrerequisiteAudit();
  const serialized = serializeKai292C4EReport(report);
  if (process.argv.includes("--write")) {
    mkdirSync(resolve(process.cwd(), "qa/kai-292c4e"), { recursive: true });
    writeFileSync(resolve(process.cwd(), REPORT_PATH), serialized, "utf8");
  }
  if (process.argv.includes("--check")) {
    const existingPath = resolve(process.cwd(), REPORT_PATH);
    if (!existsSync(existingPath)) {
      throw new Error(`missing generated report: ${REPORT_PATH}`);
    }
    const existing = readFileSync(existingPath, "utf8");
    let parsedExisting: unknown;
    try {
      parsedExisting = JSON.parse(existing) as unknown;
    } catch {
      throw new Error(`generated report is not valid JSON: ${REPORT_PATH}`);
    }
    if (JSON.stringify(parsedExisting) !== JSON.stringify(report)) {
      throw new Error(`generated report is stale: ${REPORT_PATH}`);
    }
  }
  process.stdout.write(serialized);
}

const invokedScript = process.argv[1];
if (
  invokedScript !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedScript)).href
) {
  runCli();
}
