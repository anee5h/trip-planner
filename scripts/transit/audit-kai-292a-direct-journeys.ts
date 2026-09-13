/**
 * KAI-292A — bounded, local-only direct-journey audit for the Wakasa feed.
 *
 * The ZIP is intentionally read from the ignored local cache. This command
 * never downloads, extracts, writes, or prints raw timetable snapshots.
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
  type GtfsScheduleImportResult,
  type GtfsScheduleMetadata,
} from "../../src/shared/services/transport/static/gtfsScheduleImporter";
import {
  routeDirectScheduledJourney,
  type ScheduledJourneyRouteResult,
} from "../../src/shared/services/transport/static/scheduledJourneyRouter";
import type {
  TransitScheduledService,
  TransitScheduledStopTime,
} from "../../src/shared/services/transport/static/transitGraphTypes";

export const WAKASA_DIRECT_FEED_PATH =
  ".cache/transit/gtfs/wakasa-bus/wakasa_bus.zip";
export const WAKASA_DIRECT_FEED_URL =
  "https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/gtfs_jp_d/fil/wakasa_bus.zip";
export const WAKASA_DIRECT_DATASET_ID = "gtfs-jp-wakasa-bus-20260401_A0001";
export const WAKASA_DIRECT_IDENTITY_NAMESPACE = "gtfs:wakasa-bus";
export const WAKASA_C2_CONTENT_HASH =
  "9dd4953f85c6ee3bd9675e332895825b1028cdd7f7fe395d375b1bdca9dc545a";

const FIXED_DATES = [
  "2026-04-01",
  "2026-04-04",
  "2026-04-05",
  "2026-04-29",
  "2026-03-31",
] as const;

const METADATA: GtfsScheduleMetadata = {
  provider: "gtfs-jp",
  datasetId: WAKASA_DIRECT_DATASET_ID,
  identityNamespace: WAKASA_DIRECT_IDENTITY_NAMESPACE,
  sourceDescriptor: `official Fukui GTFS-JP feed: ${WAKASA_DIRECT_FEED_URL}`,
  sourceType: "data_dump",
  retrievedAt: "2026-09-12T00:00:00.000Z",
  checkedAt: "2026-09-12T00:00:00.000Z",
  completeness: "complete_provider_dump",
};

interface DirectCase {
  readonly service: TransitScheduledService;
  readonly origin: TransitScheduledStopTime;
  readonly destination: TransitScheduledStopTime;
  readonly date: string;
  readonly result: Extract<
    ScheduledJourneyRouteResult,
    { readonly kind: "verified" }
  >;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function serviceFacts(
  result: GtfsScheduleImportResult,
  service: TransitScheduledService,
): TransitScheduledStopTime[] {
  return (result.graph.scheduledStopTimes ?? [])
    .filter((fact) => fact.serviceId === service.id)
    .sort(
      (left, right) =>
        left.order - right.order || lexical(left.stopId, right.stopId),
    );
}

function stopProviderId(
  result: GtfsScheduleImportResult,
  stopId: string,
): string {
  return (
    result.graph.stops.find((stop) => stop.id === stopId)?.providerStopId ??
    stopId
  );
}

function serviceCalendarEvaluation(
  result: GtfsScheduleImportResult,
  service: TransitScheduledService,
  date: string,
) {
  const calendar = result.graph.calendars.find(
    (candidate) => candidate.id === service.calendarId,
  );
  if (calendar === undefined) return null;
  return isGtfsServiceActiveOnDate(calendar, date);
}

function findDirectCase(
  result: GtfsScheduleImportResult,
  service: TransitScheduledService,
): DirectCase | null {
  const facts = serviceFacts(result, service);
  for (const date of FIXED_DATES) {
    const evaluation = serviceCalendarEvaluation(result, service, date);
    if (evaluation?.active !== true) continue;
    for (const origin of facts) {
      if (origin.departureServiceSeconds === null) continue;
      for (const destination of facts) {
        if (
          origin.order >= destination.order ||
          destination.arrivalServiceSeconds === null
        ) {
          continue;
        }
        const route = routeDirectScheduledJourney({
          graph: result.graph,
          coverage: result.coverage,
          originStopId: origin.stopId,
          destinationStopId: destination.stopId,
          serviceDate: date,
          earliestDepartureServiceSeconds: origin.departureServiceSeconds,
        });
        if (
          route.kind === "verified" &&
          route.evidence.providerServiceId === service.providerServiceId
        ) {
          return { service, origin, destination, date, result: route };
        }
      }
    }
  }
  return null;
}

function directCaseReport(
  result: GtfsScheduleImportResult,
  direct: DirectCase,
  label: string,
): Record<string, unknown> {
  const evidence = direct.result.evidence;
  return {
    label,
    service_id: direct.service.providerServiceId,
    origin_stop: stopProviderId(result, direct.origin.stopId),
    destination_stop: stopProviderId(result, direct.destination.stopId),
    service_date: evidence.serviceDate,
    departure_service_time: evidence.scheduledDepartureTime,
    arrival_service_time: evidence.scheduledArrivalTime,
    duration_seconds: evidence.durationServiceSeconds,
    duration_minutes: direct.result.journey.legs[0]?.duration.minutes ?? null,
    calendar_reason: evidence.calendarReason,
    selected_pattern: evidence.patternId,
    transfer_count: evidence.transferCount,
    coverage_state: evidence.coverageState,
    provider: evidence.provider,
    route_id: evidence.providerRouteId,
    operator: evidence.providerOperatorId,
  };
}

function resultSummary(
  result: GtfsScheduleImportResult,
  route: ScheduledJourneyRouteResult,
): Record<string, unknown> {
  if (route.kind === "verified") {
    return directCaseReport(
      result,
      {
        service: result.graph.scheduledServices!.find(
          (service) =>
            service.providerServiceId === route.evidence.providerServiceId,
        )!,
        origin: result.graph.scheduledStopTimes!.find(
          (fact) => fact.stopId === route.journey.origin.id,
        )!,
        destination: result.graph.scheduledStopTimes!.find(
          (fact) => fact.stopId === route.journey.destination.id,
        )!,
        date: route.evidence.serviceDate,
        result: route,
      },
      "threshold_result",
    );
  }
  return { kind: route.kind, reason: route.reason, notes: route.notes };
}

function exceptionCase(
  result: GtfsScheduleImportResult,
  directCases: readonly DirectCase[],
): Record<string, unknown> {
  const candidates = directCases
    .flatMap((direct) => {
      const calendar = result.graph.calendars.find(
        (candidate) => candidate.id === direct.service.calendarId,
      );
      if (
        calendar === undefined ||
        (calendar.sourceSemantics.provider !== "gtfs" &&
          calendar.sourceSemantics.provider !== "gtfs-jp")
      ) {
        return [];
      }
      return calendar.sourceSemantics.exceptions.map((exception) => ({
        direct,
        calendar,
        exception,
      }));
    })
    .sort(
      (left, right) =>
        lexical(left.exception.date, right.exception.date) ||
        lexical(
          left.direct.service.providerServiceId,
          right.direct.service.providerServiceId,
        ),
    );
  const selected = candidates.find((candidate) => {
    const date = `${candidate.exception.date.slice(0, 4)}-${candidate.exception.date.slice(4, 6)}-${candidate.exception.date.slice(6)}`;
    const semantics = candidate.calendar.sourceSemantics;
    if (semantics.provider !== "gtfs" && semantics.provider !== "gtfs-jp") {
      return false;
    }
    const withoutExceptions = isGtfsServiceActiveOnDate(
      {
        ...candidate.calendar,
        sourceSemantics: { ...semantics, exceptions: [] },
      },
      date,
    );
    const withException = isGtfsServiceActiveOnDate(candidate.calendar, date);
    return withoutExceptions.active !== withException.active;
  });
  if (selected === undefined) return { status: "not_found" };
  const date = `${selected.exception.date.slice(0, 4)}-${selected.exception.date.slice(4, 6)}-${selected.exception.date.slice(6)}`;
  const evaluation = isGtfsServiceActiveOnDate(selected.calendar, date);
  const threshold = selected.direct.origin.departureServiceSeconds;
  if (threshold === null)
    throw new Error("selected exception case has no departure");
  const route = routeDirectScheduledJourney({
    graph: result.graph,
    coverage: result.coverage,
    originStopId: selected.direct.origin.stopId,
    destinationStopId: selected.direct.destination.stopId,
    serviceDate: date,
    earliestDepartureServiceSeconds: threshold,
  });
  const expectedActive = selected.exception.exceptionType === "added";
  if (evaluation.active !== expectedActive) {
    throw new Error(
      `calendar exception ${selected.exception.exceptionType} did not resolve to ${expectedActive ? "active" : "inactive"}.`,
    );
  }
  if (expectedActive && route.kind !== "verified") {
    throw new Error(
      `calendar-added direct journey did not route: ${route.kind}:${route.reason}`,
    );
  }
  return {
    status: "found",
    service_id: selected.direct.service.providerServiceId,
    date,
    exception_type: selected.exception.exceptionType,
    calendar_reason: evaluation.reason,
    active: evaluation.active,
    result: resultSummary(result, route),
  };
}

function reverseCase(
  result: GtfsScheduleImportResult,
  directCases: readonly DirectCase[],
): Record<string, unknown> {
  const orientations = directCases.map((direct) => ({
    direct,
    first: direct.origin.stopId,
    last: direct.destination.stopId,
  }));
  for (const left of orientations) {
    for (const right of orientations) {
      if (
        left.direct.service.providerServiceId ===
          right.direct.service.providerServiceId ||
        left.first !== right.last ||
        left.last !== right.first
      ) {
        continue;
      }
      const threshold = right.direct.origin.departureServiceSeconds;
      if (threshold === null) continue;
      const route = routeDirectScheduledJourney({
        graph: result.graph,
        coverage: result.coverage,
        originStopId: right.direct.origin.stopId,
        destinationStopId: right.direct.destination.stopId,
        serviceDate: right.direct.date,
        earliestDepartureServiceSeconds: threshold,
      });
      if (
        route.kind !== "verified" ||
        route.evidence.providerServiceId !==
          right.direct.service.providerServiceId
      ) {
        throw new Error("reverse-direction direct query did not verify");
      }
      return {
        ...directCaseReport(result, right.direct, "reverse_direction"),
        router_query_kind: route.kind,
        router_query_service_id: route.evidence.providerServiceId,
      };
    }
  }
  return { status: "not_represented" };
}

function thresholdCase(
  result: GtfsScheduleImportResult,
  direct: DirectCase,
): Record<string, unknown> {
  const threshold = direct.result.evidence.scheduledDepartureServiceSeconds + 1;
  const route = routeDirectScheduledJourney({
    graph: result.graph,
    coverage: result.coverage,
    originStopId: direct.origin.stopId,
    destinationStopId: direct.destination.stopId,
    serviceDate: direct.date,
    earliestDepartureServiceSeconds: threshold,
  });
  if (route.kind !== "no_match" || route.reason !== "departure_window_miss") {
    throw new Error("departure threshold did not exclude the selected trip");
  }
  return {
    service_id: direct.service.providerServiceId,
    origin_stop: stopProviderId(result, direct.origin.stopId),
    destination_stop: stopProviderId(result, direct.destination.stopId),
    original_departure_service_time:
      direct.result.evidence.scheduledDepartureTime,
    threshold_service_seconds: threshold,
    result: resultSummary(result, route),
  };
}

export function auditKai292aWakasaDirectJourneys(
  feedPath: string,
): Record<string, unknown> {
  const bytes = readBoundedLocalGtfsFile(feedPath);
  const tables = parseGtfsFeed(readBoundedGtfsZip(bytes));
  const result = importGtfsSchedule(tables, METADATA);
  if (result.graph.datasetVersion.contentHash !== WAKASA_C2_CONTENT_HASH) {
    throw new Error(
      `Wakasa C2 content hash changed: expected ${WAKASA_C2_CONTENT_HASH}, got ${result.graph.datasetVersion.contentHash}`,
    );
  }
  const facts = result.graph.scheduledStopTimes ?? [];
  const services = [...(result.graph.scheduledServices ?? [])].sort((a, b) =>
    lexical(a.providerServiceId, b.providerServiceId),
  );
  const fullyTimed = services.filter((service) =>
    facts
      .filter((fact) => fact.serviceId === service.id)
      .every(
        (fact) =>
          fact.arrivalServiceSeconds !== null &&
          fact.departureServiceSeconds !== null,
      ),
  );
  const coverageImported =
    result.coverage.entries.length > 0 &&
    result.coverage.entries.every(
      (entry) =>
        entry.topology === "imported" && entry.timetable === "imported",
    );
  if (
    services.length !== 4 ||
    facts.length !== 120 ||
    fullyTimed.length !== 4 ||
    !coverageImported
  ) {
    throw new Error(
      `Wakasa C2 baseline changed: services=${services.length}, facts=${facts.length}, fullyTimed=${fullyTimed.length}, coverageImported=${coverageImported}`,
    );
  }

  const directCases = services
    .map((service) => findDirectCase(result, service))
    .filter((direct): direct is DirectCase => direct !== null);
  if (directCases.length !== services.length) {
    throw new Error(
      `Wakasa direct audit found ${directCases.length} direct services; expected ${services.length}.`,
    );
  }
  const ordinary = directCases.find(
    (direct) => direct.result.evidence.calendarReason === "base_weekday",
  );
  if (ordinary === undefined) {
    throw new Error("Wakasa direct audit found no ordinary base-weekday case.");
  }

  return {
    provider: "gtfs-jp",
    feed: "wakasa_bus.zip",
    sourceUrl: WAKASA_DIRECT_FEED_URL,
    zipBytes: bytes.length,
    containedFileCount: listBoundedGtfsZipEntryNames(bytes).size,
    semanticContentHash: result.graph.datasetVersion.contentHash,
    ordinaryActiveDirectJourney: directCaseReport(
      result,
      ordinary,
      "ordinary_active_direct",
    ),
    directJourneysFromScheduledServices: directCases
      .slice(0, 4)
      .map((direct, index) =>
        directCaseReport(result, direct, `scheduled_service_${index + 1}`),
      ),
    reverseDirection: reverseCase(result, directCases),
    calendarResolutionChange: exceptionCase(result, directCases),
    departureThreshold: thresholdCase(result, ordinary),
  };
}

const feedPath = resolve(
  process.cwd(),
  process.argv[2] ?? WAKASA_DIRECT_FEED_PATH,
);
process.stdout.write(
  `${JSON.stringify(auditKai292aWakasaDirectJourneys(feedPath), null, 2)}\n`,
);
