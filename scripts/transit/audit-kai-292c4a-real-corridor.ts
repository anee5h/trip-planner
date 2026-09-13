/**
 * KAI-292C4A — audit the smallest real Meguruto scheduled-transit corridor.
 *
 * This is an identity audit, not a route finder. It joins only stable catalogue
 * product IDs to the explicit scheduled-transit crosswalk and validates the
 * registered normalized assets. Names, coordinates, nearest-stop rules, and
 * fuzzy matching are deliberately outside the audit.
 *
 * The current result is expected to remain blocked until both a real catalogue
 * destination crosswalk and a canonical origin product identity are reviewed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  SCHEDULED_TRANSIT_CROSSWALK,
  type ScheduledTransitCrosswalkEntry,
} from "../../src/shared/services/transport/static/scheduledTransitEndpoint";
import {
  ScheduledTransitDatasetError,
  validateScheduledTransitDataset,
} from "../../src/shared/services/transport/static/scheduledTransitDataset";
import {
  SCHEDULED_TRANSIT_DATASETS,
  type ScheduledTransitDatasetKey,
} from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";

const CATALOGUE_RELATIVE_PATH = "src/shared/data/destinations-index.json";
const TRANSIT_ASSET_RELATIVE_PATH = "public/data/transit";
const ORIGIN_IDENTITY_SOURCE = "src/shared/components/StationInput.tsx";

export const REAL_CORRIDOR_AUDIT_SCHEMA_VERSION = "kai-292c4a-v1";

export type RealCorridorAuditStatus =
  "blocked_no_real_catalogue_corridor" | "real_corridor_evidenced";

export interface RealCorridorBlocker {
  readonly code:
    | "missing_catalogue_destination_crosswalk"
    | "missing_canonical_origin_identity"
    | "pilot_only_normalized_evidence";
  readonly statement: string;
  readonly evidence: readonly string[];
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
    readonly status: "missing_canonical_product_identity";
    readonly source: string;
    readonly statement: string;
  };
  readonly realCorridors: readonly [];
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

interface CatalogueRecord {
  readonly id: string;
}

function readCatalogue(rootDir: string): readonly CatalogueRecord[] {
  const value: unknown = JSON.parse(
    readFileSync(resolve(rootDir, CATALOGUE_RELATIVE_PATH), "utf8"),
  );
  if (!Array.isArray(value)) {
    throw new Error("catalogue must be an array");
  }
  return value.map((record, index) => {
    if (
      typeof record !== "object" ||
      record === null ||
      Array.isArray(record) ||
      typeof (record as Record<string, unknown>).id !== "string" ||
      (record as Record<string, unknown>).id.length === 0
    ) {
      throw new Error(`catalogue record ${index} has no stable id`);
    }
    return { id: (record as Record<string, string>).id };
  });
}

function registeredDatasetEntries(): readonly [
  ScheduledTransitDatasetKey,
  (typeof SCHEDULED_TRANSIT_DATASETS)[ScheduledTransitDatasetKey],
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
  descriptor: (typeof SCHEDULED_TRANSIT_DATASETS)[ScheduledTransitDatasetKey],
): DatasetEvidence {
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
    return { ...base, state: "missing" };
  }
  try {
    const artifact = JSON.parse(readFileSync(assetPath, "utf8")) as unknown;
    const dataset = validateScheduledTransitDataset(artifact, descriptor);
    return {
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
    };
  } catch (error: unknown) {
    return {
      ...base,
      state: "invalid",
      errorCode:
        error instanceof ScheduledTransitDatasetError
          ? error.code
          : "invalid_artifact",
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

/**
 * Reads the real catalogue and all registered deployable normalized assets.
 * A corridor is never inferred: without explicit identities this returns a
 * blocker result and an empty corridor list.
 */
export function auditRealMegurutoCorridor(
  rootDir = process.cwd(),
): RealCorridorAudit {
  const catalogue = readCatalogue(rootDir);
  const catalogueIds = new Set(catalogue.map((record) => record.id));
  if (catalogueIds.size !== catalogue.length) {
    throw new Error("catalogue contains duplicate destination ids");
  }

  const mappings = SCHEDULED_TRANSIT_CROSSWALK.mappings;
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
  const datasets = entries.map(([key, descriptor]) =>
    auditRegisteredDataset(rootDir, key, descriptor),
  );
  const validRegisteredDatasetKeys = datasets
    .filter((dataset) => dataset.state === "valid")
    .map((dataset) => dataset.key)
    .sort();
  const registeredAssetUrls = new Set(
    entries.map(([, descriptor]) => descriptor.assetUrl),
  );

  const blockers: RealCorridorBlocker[] = [];
  if (destinationMappings.length === 0) {
    blockers.push({
      code: "missing_catalogue_destination_crosswalk",
      statement: `No explicit scheduled-transit crosswalk maps a catalogue destination product ID (${catalogue.length} destinations audited).`,
      evidence: [
        CATALOGUE_RELATIVE_PATH,
        "src/shared/data/scheduled-transit-endpoint-crosswalk.json",
      ],
    });
  }
  blockers.push({
    code: "missing_canonical_origin_identity",
    statement:
      "The current origin flow stores a station label and coordinates, not a canonical Meguruto product identity or normalized scheduled-transit stop ID.",
    evidence: [
      ORIGIN_IDENTITY_SOURCE,
      "docs/kai-292c2-production-transit-boundary.md",
    ],
  });

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
        "src/shared/data/scheduled-transit-endpoint-crosswalk.json",
      ],
    });
  }

  return {
    schemaVersion: REAL_CORRIDOR_AUDIT_SCHEMA_VERSION,
    status:
      blockers.length === 0
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
      datasets,
      unregisteredAssetUrls: listUnregisteredTransitAssets(
        rootDir,
        registeredAssetUrls,
      ),
    },
    crosswalk: {
      source: "src/shared/data/scheduled-transit-endpoint-crosswalk.json",
      mappingCount: mappings.length,
      catalogueProductMappings,
      nonCatalogueMappingIds,
    },
    originIdentity: {
      status: "missing_canonical_product_identity",
      source: ORIGIN_IDENTITY_SOURCE,
      statement:
        "No canonical product identity is available for the current user-origin flow.",
    },
    realCorridors: [],
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
