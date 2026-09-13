#!/usr/bin/env node
/**
 * KAI-292C2 — deterministic local publisher for the bounded Sakata artifact.
 *
 * The source ZIP is intentionally ignored local evidence. This command reads
 * it, runs the existing C1/C2/D1 import gates, and writes one coherent public
 * graph + coverage + metadata envelope. It never downloads a feed.
 *
 * Run locally:
 *   npx tsx scripts/transit/generate-kai-292c2-sakata-dataset.ts
 *   npx tsx scripts/transit/generate-kai-292c2-sakata-dataset.ts --check
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { parseGtfsFeed, readBoundedGtfsZip } from "./gtfsFeedReader";
import { readBoundedLocalGtfsFile } from "./readBoundedLocalGtfsFile";
import {
  importGtfsSchedule,
  type GtfsScheduleMetadata,
} from "../../src/shared/services/transport/static/gtfsScheduleImporter";
import { importGtfsTransfers } from "../../src/shared/services/transport/static/gtfsTransferImporter";
import {
  SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
  SAKATA_RUNRUNBUS_DATASET,
} from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import type { ScheduledTransitDatasetArtifact } from "../../src/shared/services/transport/static/scheduledTransitDataset";
import {
  sha256Hex,
  stableStringify,
} from "../../src/shared/services/transport/static/contentHash";

export const SAKATA_FEED_PATH =
  ".cache/transit/gtfs/sakata-20260401/sakata_gtfs_jp_20260401.zip";
export const SAKATA_SOURCE_URL =
  "https://www.city.sakata.lg.jp/shisei/opendata/opendata_busu.html";
export const SAKATA_DATASET_ID = "gtfs-jp-sakata-runrunbus-20260401";
export const SAKATA_IDENTITY_NAMESPACE = "gtfs:sakata-runrunbus";
export const SAKATA_RETRIEVED_AT = "2026-09-13T00:00:00.000Z";
export const SAKATA_CHECKED_AT = "2026-09-13T00:00:00.000Z";
export const SAKATA_ARTIFACT_PATH = "public/data/transit/sakata-runrunbus.json";

const METADATA: GtfsScheduleMetadata = {
  provider: "gtfs",
  datasetId: SAKATA_DATASET_ID,
  identityNamespace: SAKATA_IDENTITY_NAMESPACE,
  sourceDescriptor: `official Sakata City GTFS-JP open data: ${SAKATA_SOURCE_URL}`,
  sourceType: "data_dump",
  retrievedAt: SAKATA_RETRIEVED_AT,
  checkedAt: SAKATA_CHECKED_AT,
  completeness: "complete_provider_dump",
};

export function buildSakataArtifact(): ScheduledTransitDatasetArtifact {
  const sourcePath = resolve(process.cwd(), SAKATA_FEED_PATH);
  if (!existsSync(sourcePath)) {
    throw new Error(`missing local Sakata feed: ${SAKATA_FEED_PATH}`);
  }
  const bytes = readBoundedLocalGtfsFile(sourcePath);
  const tables = parseGtfsFeed(readBoundedGtfsZip(bytes));
  const schedule = importGtfsSchedule(tables, METADATA);
  const transfers = importGtfsTransfers(
    schedule,
    tables,
    METADATA,
    schedule.coverage,
  );
  const graph = transfers.graph;
  if (
    graph.datasetVersion.contentHash !==
    SAKATA_RUNRUNBUS_DATASET.expectedContentHash
  ) {
    throw new Error(
      `unexpected Sakata semantic hash: ${graph.datasetVersion.contentHash}`,
    );
  }
  const coverageHash = sha256Hex(stableStringify(transfers.coverage));
  if (coverageHash !== SAKATA_RUNRUNBUS_DATASET.expectedCoverageHash) {
    throw new Error(`unexpected Sakata coverage hash: ${coverageHash}`);
  }
  return {
    artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
    metadata: {
      provider: graph.datasetVersion.provider,
      datasetId: graph.datasetVersion.datasetId,
      sourceType: graph.datasetVersion.sourceType,
      sourceDescriptor: graph.datasetVersion.sourceDescriptor,
      retrievedAt: graph.datasetVersion.retrievedAt,
      checkedAt: graph.datasetVersion.checkedAt,
      issuedAt: graph.datasetVersion.issuedAt,
      validUntil: graph.datasetVersion.validUntil,
      schemaVersion: graph.datasetVersion.schemaVersion,
      completeness: graph.datasetVersion.completeness,
      datasetHash: graph.datasetVersion.contentHash,
      coverageHash,
      identityNamespace: SAKATA_IDENTITY_NAMESPACE,
    },
    graph,
    coverage: transfers.coverage,
  };
}

export function serializeSakataArtifact(
  artifact: ScheduledTransitDatasetArtifact,
): string {
  // Minified JSON keeps the lazy static payload small; the source ZIP and
  // deterministic generator remain the inspectable build inputs.
  return `${JSON.stringify(artifact)}\n`;
}

const artifact = serializeSakataArtifact(buildSakataArtifact());
const outputPath = resolve(process.cwd(), SAKATA_ARTIFACT_PATH);
if (process.argv.includes("--check")) {
  if (!existsSync(outputPath)) {
    throw new Error(`missing generated artifact: ${SAKATA_ARTIFACT_PATH}`);
  }
  const existing = readFileSync(outputPath, "utf8");
  if (existing !== artifact) {
    throw new Error(`generated artifact is stale: ${SAKATA_ARTIFACT_PATH}`);
  }
  console.log(
    JSON.stringify({
      status: "fresh",
      path: SAKATA_ARTIFACT_PATH,
      bytes: Buffer.byteLength(artifact),
      gzipBytes: "not measured by this deterministic check",
    }),
  );
} else {
  mkdirSync(resolve(process.cwd(), "public/data/transit"), { recursive: true });
  writeFileSync(outputPath, artifact);
  console.log(
    JSON.stringify({
      status: "written",
      path: SAKATA_ARTIFACT_PATH,
      bytes: Buffer.byteLength(artifact),
      datasetHash: SAKATA_RUNRUNBUS_DATASET.expectedContentHash,
      coverageHash: SAKATA_RUNRUNBUS_DATASET.expectedCoverageHash,
    }),
  );
}
