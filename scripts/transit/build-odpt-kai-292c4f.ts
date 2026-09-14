#!/usr/bin/env node
/**
 * KAI-292C4F — regenerate the pinned normalized ODPT scheduled artifact.
 *
 * The source file is a small, credential-free set of normalized responses
 * captured through Meguruto's existing `/api/odpt` boundary. It declares a
 * complete scope of one exact TokyoMetro Ginza train identity and its returned
 * calendar variants; it does not claim whole-line timetable completeness.
 *
 * No network, clock, credential, or product endpoint is used here.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importOdptScheduledDataset,
  type OdptScheduledDatasetInput,
  type OdptScheduledDatasetImportMetadata,
} from "../../src/shared/services/transport/static/odptScheduledDatasetImporter";
import { SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION } from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import type { ScheduledTransitDatasetArtifact } from "../../src/shared/services/transport/static/scheduledTransitDataset";
import {
  sha256Hex,
  stableStringify,
} from "../../src/shared/services/transport/static/contentHash";

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE_PATH = resolve(
  here,
  "../../qa/kai-292c4f/odpt-ginza-a501-source.json",
);
export const OUTPUT_PATH = resolve(
  here,
  "../../public/data/transit/odpt-tokyometro-ginza-a501.json",
);

export const ODPT_GINZA_A501_METADATA: OdptScheduledDatasetImportMetadata = {
  provider: "odpt",
  schemaVersion: "kai-291b1-v2",
  datasetId: "odpt-tokyometro-ginza-a501-v1",
  identityNamespace: "odpt",
  sourceDescriptor:
    "ODPT exact-scope dump: TokyoMetro Ginza railway + odpt.Train:TokyoMetro.Ginza.A501 + returned Weekday/SaturdayHoliday variants; complete for this declared scope only",
  sourceType: "data_dump",
  retrievedAt: "2026-09-14T06:14:22.314Z",
  checkedAt: "2026-09-14T06:14:22.314Z",
  issuedAt: null,
  validUntil: null,
  completeness: "complete_provider_dump",
};

function loadInput(): OdptScheduledDatasetInput {
  const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as {
    readonly schemaVersion?: unknown;
    readonly credentialIncluded?: unknown;
    readonly records?: unknown;
    readonly scope?: { readonly train?: unknown };
  };
  if (source.schemaVersion !== 1 || source.credentialIncluded !== false) {
    throw new Error(
      "C4F source evidence manifest is not trusted or credential-free.",
    );
  }
  if (source.scope?.train !== "odpt.Train:TokyoMetro.Ginza.A501") {
    throw new Error("C4F source evidence train scope changed unexpectedly.");
  }
  const records = source.records;
  if (
    typeof records !== "object" ||
    records === null ||
    Array.isArray(records)
  ) {
    throw new Error("C4F source evidence records must be an object.");
  }
  const typed = records as Record<string, unknown>;
  return {
    operators: typed.operators as OdptScheduledDatasetInput["operators"],
    stations: typed.stations as OdptScheduledDatasetInput["stations"],
    railways: typed.railways as OdptScheduledDatasetInput["railways"],
    calendars: typed.calendars as OdptScheduledDatasetInput["calendars"],
    trainTimetables:
      typed.trainTimetables as OdptScheduledDatasetInput["trainTimetables"],
    declaredTrainIdentity: "odpt.Train:TokyoMetro.Ginza.A501",
  };
}

export function buildArtifact(): ScheduledTransitDatasetArtifact {
  const { graph, coverage } = importOdptScheduledDataset(
    loadInput(),
    ODPT_GINZA_A501_METADATA,
  );
  return {
    artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
    metadata: {
      ...ODPT_GINZA_A501_METADATA,
      issuedAt: ODPT_GINZA_A501_METADATA.issuedAt ?? null,
      validUntil: ODPT_GINZA_A501_METADATA.validUntil ?? null,
      datasetHash: graph.datasetVersion.contentHash,
      coverageHash: sha256Hex(stableStringify(coverage)),
    },
    graph,
    coverage,
  };
}

async function main(): Promise<void> {
  const artifact = buildArtifact();
  const { format } = await import("prettier");
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    await format(`${JSON.stringify(artifact, null, 2)}\n`, { parser: "json" }),
    "utf8",
  );
  process.stdout.write(
    `wrote ${OUTPUT_PATH}\n` +
      `  operators=${artifact.graph.operators.length} ` +
      `stops=${artifact.graph.stops.length} ` +
      `routes=${artifact.graph.routes.length} ` +
      `routeStops=${artifact.graph.routeStops.length} ` +
      `calendars=${artifact.graph.calendars.length} ` +
      `services=${artifact.graph.scheduledServices?.length ?? 0} ` +
      `stopTimes=${artifact.graph.scheduledStopTimes?.length ?? 0}\n` +
      `  contentHash=${artifact.metadata.datasetHash}\n` +
      `  coverageHash=${artifact.metadata.coverageHash}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
