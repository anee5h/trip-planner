import type {
  TransitDatasetCompleteness,
  TransitProvider,
  TransitSourceType,
} from "./transitGraphTypes";

/** Version of the serialized graph + coverage runtime envelope. */
export const SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION = "kai-292c2-v1";

export const SCHEDULED_TRANSIT_DATASET_KEYS = [
  "sakata-runrunbus",
  "toei-oedo-gtfs-20260314",
] as const;
export type ScheduledTransitDatasetKey =
  (typeof SCHEDULED_TRANSIT_DATASET_KEYS)[number];

/**
 * Build-pinned expectations for one deployable scheduled-transit artifact.
 * The registry is deliberately separate from the artifact so a changed asset
 * cannot change its own expected hash at runtime.
 */
export interface ScheduledTransitDatasetDescriptor {
  readonly key: ScheduledTransitDatasetKey;
  readonly assetUrl: string;
  readonly artifactSchemaVersion: typeof SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION;
  readonly provider: TransitProvider;
  readonly identityNamespace: string;
  readonly datasetId: string;
  readonly schemaVersion: string;
  readonly expectedContentHash: string;
  readonly expectedCoverageHash: string;
  readonly sourceType: TransitSourceType;
  readonly completeness: TransitDatasetCompleteness;
  /** Upstream catalog for provider-neutral artifacts published through ODPT. */
  readonly upstreamSource?: "odpt";
}

export const SAKATA_RUNRUNBUS_DATASET: ScheduledTransitDatasetDescriptor = {
  key: "sakata-runrunbus",
  assetUrl: "/data/transit/sakata-runrunbus.json",
  artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
  provider: "gtfs",
  identityNamespace: "gtfs:sakata-runrunbus",
  datasetId: "gtfs-jp-sakata-runrunbus-20260401",
  schemaVersion: "kai-291d1-v1",
  expectedContentHash:
    "d0e79b7f9bef0d25f265a4fae98cb8917d4ea285657de76acf0e551aec44c0dd",
  expectedCoverageHash:
    "7c9383514ce77a2e8ee9c17ea9b3905c18a9d77f6510c57ee34dc0dc1595d49e",
  sourceType: "data_dump",
  completeness: "complete_provider_dump",
};

export const TOEI_OEDO_GTFS_DATASET: ScheduledTransitDatasetDescriptor = {
  key: "toei-oedo-gtfs-20260314",
  assetUrl: "/data/transit/toei-oedo-gtfs-20260314.json",
  artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
  provider: "gtfs",
  identityNamespace: "toei-gtfs",
  datasetId: "toei-oedo-gtfs-20260314",
  schemaVersion: "kai-291c1-v1",
  expectedContentHash:
    "2738fd823013ab7b02f90430024314d32f3cd7d035ef8b98ad764d62d94a683b",
  expectedCoverageHash:
    "53db6b7196286c3f84ea0d54abbd7b0e657cf2b1ef794f9803e9f0949d563766",
  sourceType: "data_dump",
  completeness: "complete_provider_dump",
  upstreamSource: "odpt",
};

export const SCHEDULED_TRANSIT_DATASETS: Readonly<
  Record<ScheduledTransitDatasetKey, ScheduledTransitDatasetDescriptor>
> = {
  "sakata-runrunbus": SAKATA_RUNRUNBUS_DATASET,
  "toei-oedo-gtfs-20260314": TOEI_OEDO_GTFS_DATASET,
};

export function getScheduledTransitDatasetDescriptor(
  key: ScheduledTransitDatasetKey,
): ScheduledTransitDatasetDescriptor {
  return SCHEDULED_TRANSIT_DATASETS[key];
}
