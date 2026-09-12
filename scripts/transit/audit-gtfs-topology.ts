/**
 * KAI-291C1 — one bounded, local-only real GTFS-JP topology audit.
 *
 * Acquisition is intentionally outside this script. Place a provider-downloaded
 * ZIP in the ignored .cache directory, then run this command. CI never calls
 * the network or depends on the live feed.
 *
 * Run with:
 *   npx tsx scripts/transit/audit-gtfs-topology.ts [local-zip-path]
 */
import { resolve } from "node:path";

import {
  listBoundedGtfsZipEntryNames,
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "./gtfsFeedReader";
import { readBoundedLocalGtfsFile } from "./readBoundedLocalGtfsFile";
import {
  importGtfsTopology,
  type GtfsImportMetadata,
} from "../../src/shared/services/transport/static/gtfsTopologyImporter";

export const WAKASA_FEED_URL =
  "https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/gtfs_jp_d/fil/wakasa_bus.zip";
export const WAKASA_IDENTITY_NAMESPACE = "gtfs:wakasa-bus";
export const WAKASA_DATASET_ID = "gtfs-jp-wakasa-bus-20260401_A0001";

const DEFAULT_FEED_PATH = ".cache/transit/gtfs/wakasa-bus/wakasa_bus.zip";

export function auditGtfsZip(feedPath: string): Record<string, unknown> {
  const bytes = readBoundedLocalGtfsFile(feedPath);
  const metadata: GtfsImportMetadata = {
    provider: "gtfs-jp",
    datasetId: WAKASA_DATASET_ID,
    identityNamespace: WAKASA_IDENTITY_NAMESPACE,
    sourceDescriptor: `official Fukui GTFS-JP feed: ${WAKASA_FEED_URL}`,
    sourceType: "data_dump",
    retrievedAt: "2026-09-12T00:00:00.000Z",
    checkedAt: "2026-09-12T00:00:00.000Z",
    completeness: "complete_provider_dump",
  };
  const entryNames = [...listBoundedGtfsZipEntryNames(bytes)].sort();
  const files = readBoundedGtfsZip(bytes);
  const tables = parseGtfsFeed(files);
  const { graph, coverage, patternAudit } = importGtfsTopology(
    tables,
    metadata,
  );
  const routesById = new Map(graph.routes.map((route) => [route.id, route]));
  return {
    provider: metadata.provider,
    feed: "wakasa_bus.zip",
    format: "GTFS-JP",
    sourceUrl: WAKASA_FEED_URL,
    zipBytes: bytes.length,
    containedFileNames: entryNames,
    agencyCount: tables.agency.length,
    stopCount: tables.stops.length,
    routeCount: tables.routes.length,
    tripCount: tables.trips.length,
    stopTimesCount: tables.stopTimes.length,
    routeTypesObserved: [
      ...new Set(tables.routes.map((row) => row.route_type ?? "")),
    ].sort(),
    routePatternClassification: patternAudit.map((entry) => ({
      routeId: routesById.get(entry.routeId)?.providerRouteId ?? entry.routeId,
      classification: entry.classification,
      patternCount: entry.patternCount,
    })),
    normalizedEntityCounts: {
      operators: graph.operators.length,
      stops: graph.stops.length,
      routes: graph.routes.length,
      routeStops: graph.routeStops.length,
      calendars: graph.calendars.length,
      transfers: graph.transfers.length,
      fares: graph.fares.length,
    },
    topologyCoverage: coverage.entries,
    topologyCoverageState:
      coverage.entries.length === 0
        ? "partial"
        : coverage.entries.every((entry) => entry.topology === "imported")
          ? "imported"
          : coverage.entries.some((entry) => entry.topology === "unsupported")
            ? "unsupported"
            : "partial",
    timetableCoverage: "not_imported_in_this_slice",
    fareCoverage: "not_imported_in_this_slice",
    realtimeCoverage: "not_evaluated",
    semanticContentHash: graph.datasetVersion.contentHash,
    unsupportedSemantics: [],
  };
}

const feedPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_FEED_PATH);
process.stdout.write(`${JSON.stringify(auditGtfsZip(feedPath), null, 2)}\n`);
