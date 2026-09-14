#!/usr/bin/env node
/**
 * KAI-292C4F — build the pinned Toei Oedo scheduled artifact.
 *
 * The source feed is downloaded from ODPT's public CC BY 4.0 resource outside
 * the repository. This script consumes a filtered, decoded GTFS table object
 * and only writes the canonical Meguruto artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import {
  importGtfsSchedule,
  type GtfsScheduleMetadata,
} from "../../src/shared/services/transport/static/gtfsScheduleImporter";
import {
  sha256Hex,
  stableStringify,
} from "../../src/shared/services/transport/static/contentHash";
import { SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION } from "../../src/shared/services/transport/static/scheduledTransitDatasetRegistry";
import { parseGtfsFeed, readBoundedGtfsZip } from "./gtfsFeedReader";
import type { ScheduledTransitDatasetArtifact } from "../../src/shared/services/transport/static/scheduledTransitDataset";
import type {
  GtfsFeedTables,
  GtfsTableRow,
} from "../../src/shared/services/transport/static/gtfsTypes";
import { scheduledTransitContentHash } from "../../src/shared/services/transport/static/scheduledTransitSemanticHash";

const SOURCE_PATH = process.env.TOEI_GTFS_SOURCE_ZIP;
const MANIFEST_PATH = join(
  process.cwd(),
  "qa/kai-292c4f/toei-oedo-source-manifest.json",
);
const OUTPUT_PATH = join(
  process.cwd(),
  "public/data/transit/toei-oedo-gtfs-20260314.json",
);

export const TOEI_OEDO_METADATA: GtfsScheduleMetadata = {
  provider: "gtfs",
  datasetId: "toei-oedo-gtfs-20260314",
  identityNamespace: "toei-gtfs",
  sourceDescriptor:
    "ODPT CKAN Toei Train GTFS (Toei-Train-GTFS.zip), filtered to route_id=4 (Toei Oedo Line), feed_version=20260314; CC BY 4.0; transformed into Meguruto's canonical scheduled graph",
  sourceType: "data_dump",
  retrievedAt: "2026-09-14T09:00:39.429Z",
  checkedAt: "2026-09-14T09:00:39.429Z",
  issuedAt: null,
  validUntil: "2026-12-31T23:59:59+09:00",
  completeness: "complete_provider_dump",
};

function sourceField(
  row: GtfsTableRow,
  field: string,
  context: string,
): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context}.${field} must be a non-empty string.`);
  }
  return value;
}

function filterToeiOedoScope(input: GtfsFeedTables): GtfsFeedTables {
  const routeRows = input.routes.filter((row) => row.route_id === "4");
  if (routeRows.length !== 1) {
    throw new Error(
      `expected exactly one Toei Oedo route_id=4, found ${routeRows.length}.`,
    );
  }
  const routeIds = new Set(
    routeRows.map((row) => sourceField(row, "route_id", "routes")),
  );
  const tripRows = input.trips.filter((row) =>
    routeIds.has(row.route_id ?? ""),
  );
  if (tripRows.length === 0) throw new Error("Oedo route has no trips.");
  const tripIds = new Set(
    tripRows.map((row) => sourceField(row, "trip_id", "trips")),
  );
  const stopTimeRows = input.stopTimes.filter((row) =>
    tripIds.has(row.trip_id ?? ""),
  );
  if (stopTimeRows.length === 0)
    throw new Error("Oedo trips have no stop_times.");
  const stopIds = new Set(
    stopTimeRows.map((row) => sourceField(row, "stop_id", "stop_times")),
  );
  const stops = input.stops.filter((row) => stopIds.has(row.stop_id ?? ""));
  if (stops.length !== stopIds.size) {
    throw new Error("Oedo stop_times reference a stop missing from stops.txt.");
  }
  const serviceIds = new Set(
    tripRows.map((row) => sourceField(row, "service_id", "trips")),
  );
  const calendar = input.calendar?.filter((row) =>
    serviceIds.has(row.service_id ?? ""),
  );
  const calendarDates = input.calendarDates?.filter((row) =>
    serviceIds.has(row.service_id ?? ""),
  );
  const calendarCoverage = new Set([
    ...(calendar ?? []).map((row) =>
      sourceField(row, "service_id", "calendar"),
    ),
    ...(calendarDates ?? []).map((row) =>
      sourceField(row, "service_id", "calendar_dates"),
    ),
  ]);
  if ([...serviceIds].some((serviceId) => !calendarCoverage.has(serviceId))) {
    throw new Error(
      "Oedo trips reference a service missing from calendar data.",
    );
  }
  const agencyIds = new Set(
    routeRows.map((row) => sourceField(row, "agency_id", "routes")),
  );
  const agency = input.agency.filter((row) =>
    agencyIds.has(row.agency_id ?? ""),
  );
  if (agency.length !== agencyIds.size) {
    throw new Error("Oedo routes reference an agency missing from agency.txt.");
  }
  const transfers = input.transfers?.filter((row) => {
    const stopReferences = [row.from_stop_id, row.to_stop_id].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
    const routeReferences = [row.from_route_id, row.to_route_id].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
    const tripReferences = [row.from_trip_id, row.to_trip_id].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
    const relevant =
      stopReferences.some((value) => stopIds.has(value)) ||
      routeReferences.some((value) => routeIds.has(value)) ||
      tripReferences.some((value) => tripIds.has(value));
    if (!relevant) return false;
    if (
      stopReferences.some((value) => !stopIds.has(value)) ||
      routeReferences.some((value) => !routeIds.has(value)) ||
      tripReferences.some((value) => !tripIds.has(value))
    ) {
      throw new Error("a relevant Oedo transfer references a filtered record.");
    }
    return true;
  });
  return {
    ...input,
    agency,
    stops,
    routes: routeRows,
    trips: tripRows,
    stopTimes: stopTimeRows,
    calendar,
    calendarDates,
    routesJp: input.routesJp?.filter(
      (row) => row.route_id === undefined || routeIds.has(row.route_id),
    ),
    transfers,
  };
}

function readSource(manifest: {
  readonly source?: {
    readonly sourceFilename?: unknown;
    readonly sourceZipSha256?: unknown;
  };
  readonly filteredCounts?: Record<string, unknown>;
  readonly sourceCounts?: Record<string, unknown>;
}): GtfsFeedTables {
  if (SOURCE_PATH === undefined || SOURCE_PATH.length === 0) {
    throw new Error("TOEI_GTFS_SOURCE_ZIP must name the immutable source ZIP.");
  }
  const sourceBytes = readFileSync(SOURCE_PATH);
  const sourceFilename = SOURCE_PATH.split(/[\\/]/).pop();
  if (manifest.source?.sourceFilename !== sourceFilename) {
    throw new Error("Toei source filename does not match the manifest.");
  }
  const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
  if (manifest.source?.sourceZipSha256 !== sourceHash) {
    throw new Error("Toei source ZIP hash does not match the manifest.");
  }
  const decoded = parseGtfsFeed(readBoundedGtfsZip(sourceBytes));
  const sourceCounts: Record<string, number> = {
    agency: decoded.agency.length,
    stops: decoded.stops.length,
    routes: decoded.routes.length,
    trips: decoded.trips.length,
    stopTimes: decoded.stopTimes.length,
    calendar: decoded.calendar?.length ?? 0,
    calendarDates: decoded.calendarDates?.length ?? 0,
    feedInfo: decoded.feedInfo?.length ?? 0,
    transfers: decoded.transfers?.length ?? 0,
  };
  for (const [key, count] of Object.entries(sourceCounts)) {
    if (manifest.sourceCounts?.[key] !== count) {
      throw new Error(
        `manifest sourceCounts.${key} does not match source-derived count.`,
      );
    }
  }
  const filtered = filterToeiOedoScope(decoded);
  const counts: Record<string, number> = {
    agency: filtered.agency.length,
    stops: filtered.stops.length,
    routes: filtered.routes.length,
    trips: filtered.trips.length,
    stopTimes: filtered.stopTimes.length,
    calendar: filtered.calendar?.length ?? 0,
    calendarDates: filtered.calendarDates?.length ?? 0,
    feedInfo: filtered.feedInfo?.length ?? 0,
  };
  for (const [key, count] of Object.entries(counts)) {
    if (manifest.filteredCounts?.[key] !== count) {
      throw new Error(
        `manifest filteredCounts.${key} does not match source-derived count.`,
      );
    }
  }
  console.log(
    JSON.stringify({
      sourceFilename,
      sourceHash,
      sourceCounts,
      filteredCounts: counts,
    }),
  );
  return filtered;
}

function main(): void {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    readonly declaredScope?: { readonly routeId?: unknown };
  };
  if (manifest.declaredScope?.routeId !== "4") {
    throw new Error("Toei source manifest is not scoped to route_id=4.");
  }
  const imported = importGtfsSchedule(readSource(manifest), TOEI_OEDO_METADATA);
  const contentHash = scheduledTransitContentHash(imported.graph);
  const graph = {
    ...imported.graph,
    datasetVersion: { ...imported.graph.datasetVersion, contentHash },
  };
  const coverageHash = sha256Hex(stableStringify(imported.coverage));
  const artifact: ScheduledTransitDatasetArtifact = {
    artifactSchemaVersion: SCHEDULED_TRANSIT_ARTIFACT_SCHEMA_VERSION,
    metadata: {
      ...TOEI_OEDO_METADATA,
      schemaVersion: imported.graph.datasetVersion.schemaVersion,
      issuedAt: TOEI_OEDO_METADATA.issuedAt ?? null,
      validUntil: TOEI_OEDO_METADATA.validUntil ?? null,
      datasetHash: contentHash,
      coverageHash,
    },
    graph,
    coverage: imported.coverage,
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    let existing: string;
    try {
      existing = readFileSync(OUTPUT_PATH, "utf8");
    } catch {
      throw new Error(`missing generated artifact ${OUTPUT_PATH}.`);
    }
    if (existing !== serialized) {
      throw new Error(`generated artifact is stale: ${OUTPUT_PATH}.`);
    }
    console.log(`checked ${OUTPUT_PATH}`);
  } else {
    writeFileSync(OUTPUT_PATH, serialized, "utf8");
    console.log(`wrote ${OUTPUT_PATH}`);
  }
  console.log(
    JSON.stringify({
      operators: artifact.graph.operators.length,
      stops: artifact.graph.stops.length,
      routes: artifact.graph.routes.length,
      routeStops: artifact.graph.routeStops.length,
      calendars: artifact.graph.calendars.length,
      scheduledServices: artifact.graph.scheduledServices?.length ?? 0,
      scheduledStopTimes: artifact.graph.scheduledStopTimes?.length ?? 0,
      contentHash: artifact.metadata.datasetHash,
      coverageHash: artifact.metadata.coverageHash,
    }),
  );
}

if (
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("build-kai-292c4f-toei.ts")
) {
  main();
}
