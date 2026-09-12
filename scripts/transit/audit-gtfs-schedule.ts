/**
 * KAI-291C2 — one bounded, local-only real GTFS-JP schedule audit.
 *
 * Acquisition is intentionally outside this script. It reads the existing
 * ignored Wakasa ZIP and never downloads or extracts a feed. No individual
 * timetable rows are printed.
 *
 * Run with:
 *   npx tsx scripts/transit/audit-gtfs-schedule.ts [local-zip-path]
 */
import { resolve } from "node:path";

import {
  listBoundedGtfsZipEntryNames,
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "./gtfsFeedReader";
import { readBoundedLocalGtfsFile } from "./readBoundedLocalGtfsFile";
import {
  importGtfsSchedule,
  isGtfsServiceActiveOnDate,
  parseGtfsServiceTime,
  type GtfsScheduleMetadata,
} from "../../src/shared/services/transport/static/gtfsScheduleImporter";

export const WAKASA_FEED_URL =
  "https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/gtfs_jp_d/fil/wakasa_bus.zip";
export const WAKASA_IDENTITY_NAMESPACE = "gtfs:wakasa-bus";
export const WAKASA_DATASET_ID = "gtfs-jp-wakasa-bus-20260401_A0001";

const DEFAULT_FEED_PATH = ".cache/transit/gtfs/wakasa-bus/wakasa_bus.zip";

function formatServiceSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function serviceDateAudit(
  graph: ReturnType<typeof importGtfsSchedule>["graph"],
  date: string,
): Record<string, unknown> {
  const activeServiceIds = graph.calendars
    .filter((calendar) => isGtfsServiceActiveOnDate(calendar, date).active)
    .map((calendar) => calendar.providerCalendarId)
    .sort();
  const activeCalendarIds = new Set(
    graph.calendars
      .filter((calendar) =>
        activeServiceIds.includes(calendar.providerCalendarId),
      )
      .map((calendar) => calendar.id),
  );
  const activeTripCount = (graph.scheduledServices ?? []).filter((service) =>
    activeCalendarIds.has(service.calendarId),
  ).length;
  return { date, activeServiceIds, activeTripCount };
}

export function auditGtfsScheduleZip(
  feedPath: string,
): Record<string, unknown> {
  const bytes = readBoundedLocalGtfsFile(feedPath);
  const metadata: GtfsScheduleMetadata = {
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
  const tables = parseGtfsFeed(readBoundedGtfsZip(bytes));
  const result = importGtfsSchedule(tables, metadata);
  const { graph, coverage, topology } = result;
  const facts = graph.scheduledStopTimes ?? [];
  const allRawTimes = facts.flatMap((fact) => {
    const semantics = fact.sourceSemantics;
    return [semantics.rawArrivalTime, semantics.rawDepartureTime].filter(
      (value): value is string => value !== null,
    );
  });
  const parsedTimes = allRawTimes.map((value) => parseGtfsServiceTime(value));
  const knownTimes = parsedTimes.filter(
    (value): value is number => value !== null,
  );
  const serviceIds = new Set([
    ...(tables.calendar ?? []).map((row) => row.service_id ?? ""),
    ...(tables.calendarDates ?? []).map((row) => row.service_id ?? ""),
  ]);
  const calendarSemantics = graph.calendars.map((calendar) =>
    calendar.sourceSemantics.provider === "gtfs" ||
    calendar.sourceSemantics.provider === "gtfs-jp"
      ? calendar.sourceSemantics
      : null,
  );
  const baseDates = calendarSemantics.flatMap((semantics) =>
    semantics?.base === null || semantics?.base === undefined
      ? []
      : [semantics.base.startDate, semantics.base.endDate],
  );
  const exceptionDates = calendarSemantics.flatMap(
    (semantics) =>
      semantics?.exceptions.map((exception) => exception.date) ?? [],
  );
  const fullyTimed = (graph.scheduledServices ?? []).filter((service) =>
    facts
      .filter((fact) => fact.serviceId === service.id)
      .every(
        (fact) =>
          fact.arrivalServiceSeconds !== null &&
          fact.departureServiceSeconds !== null,
      ),
  ).length;
  const partiallyTimed = (graph.scheduledServices ?? []).length - fullyTimed;
  const timetableCoverage =
    coverage.entries.length > 0 &&
    coverage.entries.every((entry) => entry.timetable === "imported")
      ? "imported"
      : "partial";
  const routesById = new Map(
    topology.graph.routes.map((route) => [route.id, route]),
  );
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
    routePatternClassification: topology.patternAudit.map((entry) => ({
      routeId: routesById.get(entry.routeId)?.providerRouteId ?? entry.routeId,
      classification: entry.classification,
      patternCount: entry.patternCount,
    })),
    calendarRowsCount: tables.calendar?.length ?? 0,
    calendarDatesRowsCount: tables.calendarDates?.length ?? 0,
    distinctServiceIdCount: serviceIds.size,
    scheduledServiceCount: graph.scheduledServices?.length ?? 0,
    scheduledStopFactCount: facts.length,
    earliestServiceDayTime: formatServiceSeconds(Math.min(...knownTimes)),
    latestServiceDayTime: formatServiceSeconds(Math.max(...knownTimes)),
    timesGreaterThan24Hours: knownTimes.filter((value) => value >= 24 * 3600)
      .length,
    serviceDateCoverageRange: {
      startDate: [...baseDates, ...exceptionDates].sort()[0] ?? null,
      endDate: [...baseDates, ...exceptionDates].sort().at(-1) ?? null,
    },
    exceptionAdditions: calendarSemantics.reduce(
      (count, semantics) =>
        count +
        (semantics?.exceptions.filter(
          (exception) => exception.exceptionType === "added",
        ).length ?? 0),
      0,
    ),
    exceptionRemovals: calendarSemantics.reduce(
      (count, semantics) =>
        count +
        (semantics?.exceptions.filter(
          (exception) => exception.exceptionType === "removed",
        ).length ?? 0),
      0,
    ),
    timedServiceCounts: {
      fullyTimed,
      partiallyTimed,
      rejectedOrUnsupported: 0,
    },
    timetableCoverageState: timetableCoverage,
    topologyCoverage: coverage.entries,
    fareCoverage: "not_imported_in_this_slice",
    realtimeCoverage: "not_evaluated",
    deterministicServiceDateAudit: [
      "2026-04-01",
      "2026-04-04",
      "2026-04-05",
      "2026-04-29",
      "2026-03-31",
    ].map((date) => serviceDateAudit(graph, date)),
    semanticContentHash: graph.datasetVersion.contentHash,
  };
}

const feedPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_FEED_PATH);
process.stdout.write(
  `${JSON.stringify(auditGtfsScheduleZip(feedPath), null, 2)}\n`,
);
