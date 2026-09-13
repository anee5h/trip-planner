/**
 * KAI-291D1 — bounded, local-only GTFS transfer evidence audit.
 *
 * The feeds are acquired outside this command and remain in the ignored
 * `.cache` directory. This script reads the bounded ZIP, imports C2 first,
 * then explicitly opts into D1. It never prints raw transfer rows.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  listBoundedGtfsZipEntryNames,
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "./gtfsFeedReader";
import { readBoundedLocalGtfsFile } from "./readBoundedLocalGtfsFile";
import {
  importGtfsSchedule,
  type GtfsScheduleMetadata,
} from "../../src/shared/services/transport/static/gtfsScheduleImporter";
import {
  GtfsTransferImportError,
  importGtfsTransfers,
} from "../../src/shared/services/transport/static/gtfsTransferImporter";

export const WAKASA_TRANSFER_FEED_PATH =
  ".cache/transit/gtfs/wakasa-bus/wakasa_bus.zip";
export const WAKASA_TRANSFER_FEED_URL =
  "https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/gtfs_jp_d/fil/wakasa_bus.zip";
export const WAKASA_TRANSFER_DATASET_ID = "gtfs-jp-wakasa-bus-20260401_A0001";
export const WAKASA_TRANSFER_IDENTITY_NAMESPACE = "gtfs:wakasa-bus";

export const SAKATA_TRANSFER_FEED_PATH =
  ".cache/transit/gtfs/sakata-20260401/sakata_gtfs_jp_20260401.zip";
export const SAKATA_TRANSFER_SOURCE_URL =
  "https://www.city.sakata.lg.jp/shisei/opendata/opendata_busu.html";
export const SAKATA_TRANSFER_LICENSE =
  "Creative Commons Attribution 4.0 International (CC BY 4.0)";
export const SAKATA_TRANSFER_DATASET_ID = "gtfs-jp-sakata-runrunbus-20260401";
export const SAKATA_TRANSFER_IDENTITY_NAMESPACE = "gtfs:sakata-runrunbus";

export const NON_EMPTY_TRANSFER_FEED_AUDIT_NOTE =
  "No suitable non-empty official Japanese transfers.txt feed was found in the bounded audit search; D1 transfer-row semantics are therefore validated synthetically, while Wakasa and Sakata validate real-feed absence/empty-file behavior.";

interface FeedConfig {
  readonly label: string;
  readonly format: "GTFS" | "GTFS-JP";
  readonly path: string;
  readonly sourceUrl: string;
  readonly license: string | null;
  readonly metadata: GtfsScheduleMetadata;
}

const FEEDS: readonly FeedConfig[] = [
  {
    label: "Wakasa",
    format: "GTFS-JP",
    path: WAKASA_TRANSFER_FEED_PATH,
    sourceUrl: WAKASA_TRANSFER_FEED_URL,
    license: null,
    metadata: {
      provider: "gtfs-jp",
      datasetId: WAKASA_TRANSFER_DATASET_ID,
      identityNamespace: WAKASA_TRANSFER_IDENTITY_NAMESPACE,
      sourceDescriptor: `official Fukui GTFS-JP feed: ${WAKASA_TRANSFER_FEED_URL}`,
      sourceType: "data_dump",
      retrievedAt: "2026-09-12T00:00:00.000Z",
      checkedAt: "2026-09-12T00:00:00.000Z",
      completeness: "complete_provider_dump",
    },
  },
  {
    label: "Sakata るんるんバス",
    format: "GTFS-JP",
    path: SAKATA_TRANSFER_FEED_PATH,
    sourceUrl: SAKATA_TRANSFER_SOURCE_URL,
    license: SAKATA_TRANSFER_LICENSE,
    metadata: {
      // The publisher labels this GTFS-JP, but the published ZIP has no
      // routes_jp.txt extension; consume the standard GTFS fields faithfully.
      provider: "gtfs",
      datasetId: SAKATA_TRANSFER_DATASET_ID,
      identityNamespace: SAKATA_TRANSFER_IDENTITY_NAMESPACE,
      sourceDescriptor: `official Sakata City GTFS-JP open data: ${SAKATA_TRANSFER_SOURCE_URL}`,
      sourceType: "data_dump",
      retrievedAt: "2026-09-13T00:00:00.000Z",
      checkedAt: "2026-09-13T00:00:00.000Z",
      completeness: "complete_provider_dump",
    },
  },
];

function hasValue(
  row: Readonly<Record<string, string>>,
  field: string,
): boolean {
  return row[field] !== undefined && row[field] !== "";
}

function transferTypeKey(row: Readonly<Record<string, string>>): string {
  const value = row.transfer_type;
  return value === undefined ? "<missing>" : value === "" ? "0" : value;
}

function ruleTypeCounts(
  rows: readonly Readonly<Record<string, string>>[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = transferTypeKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([first], [second]) =>
      first < second ? -1 : first > second ? 1 : 0,
    ),
  );
}

function transferRowSummary(
  rows: readonly Readonly<Record<string, string>>[],
): Record<string, unknown> {
  const stopPairs = new Set(
    rows
      .filter(
        (row) => hasValue(row, "from_stop_id") && hasValue(row, "to_stop_id"),
      )
      .map((row) => `${row.from_stop_id}\u0000${row.to_stop_id}`),
  );
  return {
    rowCount: rows.length,
    distinctStopPairCount: stopPairs.size,
    ruleTypeCounts: ruleTypeCounts(rows),
    routeScopedRowCount: rows.filter(
      (row) => hasValue(row, "from_route_id") || hasValue(row, "to_route_id"),
    ).length,
    tripScopedRowCount: rows.filter(
      (row) => hasValue(row, "from_trip_id") || hasValue(row, "to_trip_id"),
    ).length,
    explicitMinimumTransferSecondsRowCount: rows.filter((row) =>
      hasValue(row, "min_transfer_time"),
    ).length,
    prohibitedRowCount: rows.filter((row) => row.transfer_type === "3").length,
  };
}

function importErrorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof GtfsTransferImportError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

function auditFeed(config: FeedConfig): Record<string, unknown> {
  const absolutePath = resolve(process.cwd(), config.path);
  if (!existsSync(absolutePath)) {
    return {
      label: config.label,
      status: "local_cache_unavailable",
      path: config.path,
      sourceUrl: config.sourceUrl,
      license: config.license,
      note: "No local feed was audited; this is not a transfer result.",
    };
  }

  const bytes = readBoundedLocalGtfsFile(absolutePath);
  const entryNames = [...listBoundedGtfsZipEntryNames(bytes)].sort();
  const tables = parseGtfsFeed(readBoundedGtfsZip(bytes));
  const c2 = importGtfsSchedule(tables, config.metadata);
  const hasTransfersFile = entryNames.includes("transfers.txt");
  const transferRows = tables.transfers;

  let d1: ReturnType<typeof importGtfsTransfers> | null = null;
  let transferImportError: Record<string, unknown> | null = null;
  try {
    d1 = importGtfsTransfers(c2, tables, config.metadata);
  } catch (error) {
    transferImportError = importErrorSummary(error);
  }

  const noEvidenceMessage = `${config.label} has no explicit transfers.txt evidence`;
  const transferAudit =
    transferRows === undefined
      ? {
          status: "not_audited_no_file",
          evidence: noEvidenceMessage,
          importedCount: 0,
          rejectedCount: 0,
        }
      : {
          ...transferRowSummary(transferRows),
          status:
            d1 === null
              ? "rejected"
              : transferRows.length === 0
                ? "audited_empty_file"
                : "audited",
          ...(transferRows.length === 0
            ? {
                evidence:
                  "transfers.txt is present but contains zero data rows; this validates empty explicit-rule-set handling only.",
              }
            : {}),
          importedCount: d1?.importedTransferCount ?? 0,
          rejectedCount: d1 === null ? transferRows.length : 0,
          ...(transferImportError === null ? {} : { transferImportError }),
        };

  return {
    label: config.label,
    status:
      transferRows === undefined
        ? "no_explicit_transfer_file"
        : transferRows.length === 0
          ? "audited_empty_file"
          : "audited",
    format: config.format,
    datasetId: config.metadata.datasetId,
    feedVersion:
      tables.feedInfo?.map((row) => row.feed_version ?? "").filter(Boolean) ??
      [],
    sourceUrl: config.sourceUrl,
    license: config.license,
    path: config.path,
    zipBytes: bytes.length,
    containedFileNames: entryNames,
    transferFilePresent: hasTransfersFile,
    transferAudit,
    c2SemanticContentHash: c2.graph.datasetVersion.contentHash,
    d1TransferEnrichedSemanticHash:
      d1?.graph.datasetVersion.contentHash ?? null,
    d1TransferCoverage:
      d1?.coverage.entries.map((entry) => ({
        operator: entry.operator,
        mode: entry.mode,
        state: entry.transfers ?? "not_evaluated",
      })) ?? [],
    d1ImportError: transferImportError,
  };
}

export function auditGtfsTransferFeeds(): Record<string, unknown> {
  return {
    checkedDate: "2026-09-13",
    nonEmptyOfficialJapaneseTransferFeedFound: false,
    nonEmptyTransferFeedAuditNote: NON_EMPTY_TRANSFER_FEED_AUDIT_NOTE,
    feeds: FEEDS.map(auditFeed),
  };
}

process.stdout.write(`${JSON.stringify(auditGtfsTransferFeeds(), null, 2)}\n`);
