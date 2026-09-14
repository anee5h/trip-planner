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

import { auditRealMegurutoCorridor } from "./audit-kai-292c4a-real-corridor";
import {
  SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
  SCHEDULED_TRANSIT_DATASETS,
  type ScheduledTransitDatasetDescriptor,
} from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import {
  ScheduledTransitDatasetError,
  validateScheduledTransitDataset,
} from "../../src/shared/services/transport/static/scheduledTransitDataset";

const CATALOGUE_PATH = "src/shared/data/destinations-index.json";
const ANCHOR_PATH = "qa/kai-291/destination-station-anchors.json";
const COVERAGE_PATH = "qa/kai-290/odpt-coverage.json";
const IDENTITY_EVIDENCE_PATH =
  "qa/kai-292c4a/real-corridor-identity-evidence.json";
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

type CorridorReadinessBlockerCode =
  | "missing_canonical_product_origin_identity"
  | "missing_catalogue_destination_crosswalk"
  | "station_to_destination_access_not_exactly_bound"
  | "odpt_timetable_not_representable_in_trusted_c2"
  | "missing_direct_or_one_transfer_scheduled_support";

type C2BoundaryReason =
  | "no_registered_odpt_scheduled_dataset"
  | "registered_odpt_dataset_not_loadable"
  | "registered_odpt_scheduled_dataset";

type C4DBlockerCode =
  | "no_authoritative_service_date_or_departure_time"
  | "runtime_journey_verification_not_evaluated";

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

export interface Kai292C4EAuditOptions {
  readonly originIdentities?: readonly Kai292C4EOriginIdentityEvidence[];
  readonly scheduledTransitDatasets?: readonly Kai292C4EDatasetDescriptor[];
}

interface Kai292C4EC2RegistryState {
  readonly canEnterTrustedC2: boolean;
  readonly registeredDatasetKeys: readonly string[];
  readonly registeredProviders: readonly string[];
  readonly reason: C2BoundaryReason;
  readonly loadableOdptDatasetKeys: readonly string[];
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
    readonly broadTimetableResult: "provider_response_too_large";
    readonly exactTrainProbeResult: "records";
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
    readonly status: "blocked";
    readonly reason:
      "c4e_prerequisites_not_satisfied" | "runtime_evidence_absent";
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

function coverageRoot(rootDir: string): JsonRecord {
  return requireRecord(readJson(rootDir, COVERAGE_PATH), COVERAGE_PATH);
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

function c2RegistryState(
  rootDir: string,
  descriptors: readonly Kai292C4EDatasetDescriptor[],
): Kai292C4EC2RegistryState {
  const registeredDatasetKeys = descriptors
    .map(({ key }) => key)
    .filter(nonEmpty)
    .sort();
  const registeredProviders = [
    ...new Set(descriptors.map(({ provider }) => provider).filter(nonEmpty)),
  ].sort();
  const odptDescriptors = descriptors.filter(
    ({ provider }) => provider === "odpt",
  );
  const loadableOdptDatasetKeys = odptDescriptors
    .filter((descriptor) => {
      if (!validDescriptor(descriptor)) return false;
      const assetPath = resolve(
        rootDir,
        "public",
        descriptor.assetUrl.replace(/^\/+/, ""),
      );
      if (!existsSync(assetPath)) return false;
      try {
        const artifact = JSON.parse(readFileSync(assetPath, "utf8")) as unknown;
        validateScheduledTransitDataset(
          artifact,
          descriptor as ScheduledTransitDatasetDescriptor,
        );
        return true;
      } catch (error: unknown) {
        if (error instanceof ScheduledTransitDatasetError) return false;
        return false;
      }
    })
    .map(({ key }) => key)
    .sort();
  const reason: C2BoundaryReason =
    odptDescriptors.length === 0
      ? "no_registered_odpt_scheduled_dataset"
      : loadableOdptDatasetKeys.length > 0
        ? "registered_odpt_scheduled_dataset"
        : "registered_odpt_dataset_not_loadable";
  return {
    canEnterTrustedC2: loadableOdptDatasetKeys.length > 0,
    registeredDatasetKeys,
    registeredProviders,
    reason,
    loadableOdptDatasetKeys,
  };
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

function timetableProbeFacts(coverage: JsonRecord): {
  readonly measuredPilotOperators: readonly string[];
  readonly broadTimetableResult: "provider_response_too_large";
  readonly exactTrainProbeResult: "records";
} {
  const pilot = requireRecord(
    coverage.pilotScope,
    `${COVERAGE_PATH}.pilotScope`,
  );
  const included = requireArray(
    pilot.included,
    `${COVERAGE_PATH}.pilotScope.included`,
  );
  const measuredPilotOperators = included
    .map((entry) =>
      isRecord(entry) && typeof entry.operator === "string"
        ? entry.operator
        : null,
    )
    .filter((value): value is string => value !== null)
    .sort();
  return {
    measuredPilotOperators,
    broadTimetableResult: "provider_response_too_large",
    exactTrainProbeResult: "records",
  };
}

function stationAccess(
  catalogue: JsonRecord,
  stationId: string,
): Kai292C4EAnchorFinding["stationToDestinationAccess"] {
  const neutralStatement =
    "No reviewed station-to-destination access evidence is bound to the exact ODPT station identity.";
  const localTransport = catalogue.localTransport;
  if (isRecord(localTransport) && localTransport.kind === "verified_walking") {
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
): Kai292C4EAnchorFinding {
  const stationId = requireString(anchor.odptStationId, `${id}.odptStationId`);
  const operator = requireString(anchor.operator, `${id}.operator`);
  const railway = requireString(anchor.railway, `${id}.railway`);
  if (anchor.proposedOutcome !== "geographic_unique_candidate") {
    throw new Error(`${id} is not a reviewed geographic_unique_candidate`);
  }
  const pilotStatus = includedPilotOperator(coverage, operator);
  const sampled = sampledStationIds(coverage, operator);
  const access = stationAccess(catalogue, stationId);
  const missingPrerequisites = [
    "reviewed_stable_product_origin_identity",
    "explicit_catalogue_destination_crosswalk",
    ...(access.exactStationIdentityBound ? [] : [access.missingPrerequisite]),
    "registered_odpt_scheduled_dataset_artifact",
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
    .map((entry) => entry.productId as string)
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
        : "An ODPT descriptor is registered, but no descriptor-backed loadable and provenance-validated ODPT scheduled artifact is available to enter trusted C2.";
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

function buildC4DBlockers(): readonly Kai292C4EC4DBlocker[] {
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
  const coverage = coverageRoot(rootDir);
  const descriptors = c2Descriptors(options);
  const c2State = c2RegistryState(rootDir, descriptors);
  const c4a = auditRealMegurutoCorridor(rootDir);
  const anchors = KAI_292C4E_ANCHOR_IDS.map((id) => {
    const catalogue = byId.get(id);
    const anchor = anchorsById.get(id);
    if (catalogue === undefined || anchor === undefined) {
      throw new Error(`required KAI-291A anchor ${id} is missing`);
    }
    return anchorFinding(id, catalogue, anchor, coverage, c2State);
  });
  const pilotFacts = timetableProbeFacts(coverage);
  const reviewedProductIds = checkedIdentityEvidence(
    rootDir,
    options.originIdentities,
  );
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
      satisfied: anchors.every(
        ({ stationToDestinationAccess }) =>
          stationToDestinationAccess.exactStationIdentityBound,
      ),
      statement:
        "No requested anchor has access evidence bound to its exact ODPT station identity.",
    },
    {
      gate: "exact_transit_identities",
      satisfied: c4a.crosswalk.catalogueProductMappings.length > 0,
      statement:
        c4a.crosswalk.catalogueProductMappings.length > 0
          ? "At least one exact catalogue endpoint crosswalk is present."
          : "Reviewed destination station identities exist, but no exact product endpoint crosswalk exists for either endpoint pair.",
    },
    {
      gate: "production_loadable_scheduled_dataset",
      satisfied: c2State.canEnterTrustedC2,
      statement:
        c2State.reason === "no_registered_odpt_scheduled_dataset"
          ? "The current registry has no ODPT scheduled dataset descriptor/artifact; Sakata is not product coverage."
          : c2State.reason === "registered_odpt_dataset_not_loadable"
            ? "An ODPT descriptor is registered, but its required artifact/loadability evidence is not valid."
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
  const c4dBlockers = buildC4DBlockers();
  const status = gates.every(({ satisfied }) => satisfied)
    ? "prerequisites_satisfied"
    : "blocked_prerequisite";

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
      status: "blocked",
      reason:
        status === "blocked_prerequisite"
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
