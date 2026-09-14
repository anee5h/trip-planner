import type {
  TransitDatasetCompleteness,
  TransitProvider,
  TransitSourceType,
} from "./transitGraphTypes";

/** Version of the serialized graph + coverage runtime envelope. */
export const SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION = "kai-292c2-v1";

export const SCHEDULED_TRANSIT_DATASET_KEYS = [
  "sakata-runrunbus",
  "odpt-tokyometro-ginza-a501-b515",
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

export const ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET: ScheduledTransitDatasetDescriptor =
  {
    key: "odpt-tokyometro-ginza-a501-b515",
    assetUrl: "/data/transit/odpt-tokyometro-ginza-a501.json",
    artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
    provider: "odpt",
    identityNamespace: "odpt",
    datasetId: "odpt-tokyometro-ginza-a501-b515-v1",
    schemaVersion: "kai-291b1-v2",
    expectedContentHash:
      "d305f2551cdb84eb999019c7df6ac2cbea712d06118115a243124e6b7f1cc9fa",
    expectedCoverageHash:
      "a37145c7ee8f2a9e40eea6fb4319489896b7b7f30811fe1adc0e28c5398b54c0",
    sourceType: "data_dump",
    completeness: "complete_provider_dump",
  };

export const SCHEDULED_TRANSIT_DATASETS: Readonly<
  Record<ScheduledTransitDatasetKey, ScheduledTransitDatasetDescriptor>
> = {
  "sakata-runrunbus": SAKATA_RUNRUNBUS_DATASET,
  "odpt-tokyometro-ginza-a501-b515": ODPT_TOKYOMETRO_GINZA_A501_B515_DATASET,
};

export function getScheduledTransitDatasetDescriptor(
  key: ScheduledTransitDatasetKey,
): ScheduledTransitDatasetDescriptor {
  return SCHEDULED_TRANSIT_DATASETS[key];
}
