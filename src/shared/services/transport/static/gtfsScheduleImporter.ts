/**
 * KAI-291C2 — bounded GTFS/GTFS-JP service calendars and schedules.
 *
 * This module extends the C1 normalized graph with static service-date and
 * scheduled stop facts. It is pure after callers provide decoded tables: no
 * network, clock, timezone guessing, interpolation, Journey, or routing.
 */

import { contentHashOf } from "./odptRailTopologyImporter";
import {
  gtfsPatternIdFor,
  gtfsRouteStopsForSemanticHash,
  importGtfsTopology,
  type GtfsImportMetadata,
  type GtfsImportResult,
  type GtfsProvider,
} from "./gtfsTopologyImporter";
import { makeTransitEntityId } from "./transitEntityId";
import type {
  GtfsCalendarBase,
  GtfsCalendarException,
  GtfsCalendarSourceSemantics,
  GtfsJpCalendarSourceSemantics,
  GtfsJpScheduledServiceSourceSemantics,
  GtfsJpScheduledStopTimeSourceSemantics,
  GtfsScheduledServiceSourceSemantics,
  GtfsScheduledStopTimeSourceSemantics,
  NormalizedTransitGraph,
  TransitCoverageEntry,
  TransitCoverageReport,
  TransitProvenance,
  TransitScheduledService,
  TransitScheduledStopTime,
  TransitServiceCalendar,
} from "./transitGraphTypes";
import type { GtfsFeedTables, GtfsTableRow } from "./gtfsTypes";

export type GtfsScheduleMetadata = GtfsImportMetadata;

export type GtfsScheduleImportErrorCode =
  | "invalid_calendar_record"
  | "invalid_calendar_flag"
  | "invalid_calendar_date"
  | "invalid_calendar_range"
  | "duplicate_calendar_service"
  | "invalid_exception_type"
  | "duplicate_calendar_exception"
  | "unknown_service_reference"
  | "invalid_time"
  | "invalid_timepoint"
  | "missing_required_time"
  | "invalid_time_order"
  | "invalid_time_chronology"
  | "topology_schedule_mismatch";

export class GtfsScheduleImportError extends Error {
  readonly code: GtfsScheduleImportErrorCode;

  constructor(code: GtfsScheduleImportErrorCode, message: string) {
    super(`gtfs-schedule[${code}]: ${message}`);
    this.name = "GtfsScheduleImportError";
    this.code = code;
  }
}

export interface GtfsServiceDateEvaluation {
  readonly date: string;
  readonly active: boolean;
  readonly reason:
    | "exception_added"
    | "exception_removed"
    | "base_weekday"
    | "base_inactive_weekday"
    | "outside_base_range"
    | "exception_only_no_match";
}

export interface GtfsScheduleImportResult {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
  readonly topology: GtfsImportResult;
}

const WEEKDAY_FIELDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type WeekdayField = (typeof WEEKDAY_FIELDS)[number];

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function requiredString(
  row: GtfsTableRow,
  field: string,
  code: GtfsScheduleImportErrorCode,
): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new GtfsScheduleImportError(
      code,
      `${field} must be a non-empty string.`,
    );
  }
  return value;
}

function optionalString(row: GtfsTableRow, field: string): string | null {
  const value = row[field];
  return value === undefined || value.length === 0 ? null : value;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateParts(
  value: string,
  field: string,
): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (match === null) {
    throw new GtfsScheduleImportError(
      "invalid_calendar_date",
      `${field} must be a real Gregorian YYYYMMDD date.`,
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new GtfsScheduleImportError(
      "invalid_calendar_date",
      `${field} is not a real Gregorian YYYYMMDD date.`,
    );
  }
  return { year, month, day };
}

function compactDateFromInput(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new GtfsScheduleImportError(
      "invalid_calendar_date",
      "service date must use strict YYYY-MM-DD form.",
    );
  }
  const compact = `${match[1]}${match[2]}${match[3]}`;
  parseDateParts(compact, "service date");
  return compact;
}

function weekdayIndex(parts: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}): number {
  const table = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const adjustedYear = parts.year - (parts.month < 3 ? 1 : 0);
  return (
    (adjustedYear +
      Math.floor(adjustedYear / 4) -
      Math.floor(adjustedYear / 100) +
      Math.floor(adjustedYear / 400) +
      table[parts.month - 1] +
      parts.day) %
    7
  );
}

function parseFlag(
  row: GtfsTableRow,
  field: WeekdayField,
  serviceId: string,
): 0 | 1 {
  const value = row[field];
  if (value === "0") return 0;
  if (value === "1") return 1;
  throw new GtfsScheduleImportError(
    "invalid_calendar_flag",
    `calendar service ${serviceId} field ${field} must be 0 or 1.`,
  );
}

function scheduleProvenance(
  providerId: string,
  sourceResourceType: string,
  metadata: GtfsScheduleMetadata,
): TransitProvenance {
  return {
    provider: metadata.provider,
    identityNamespace: metadata.identityNamespace,
    providerId,
    sourceResourceType,
    datasetId: metadata.datasetId,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
  };
}

function gtfsCalendarSource(
  provider: GtfsProvider,
  base: GtfsCalendarBase | null,
  exceptions: readonly GtfsCalendarException[],
): GtfsCalendarSourceSemantics | GtfsJpCalendarSourceSemantics {
  return { provider, base, exceptions };
}

function buildCalendars(
  input: GtfsFeedTables,
  metadata: GtfsScheduleMetadata,
): Map<string, TransitServiceCalendar> {
  const bases = new Map<string, GtfsCalendarBase>();
  for (const row of input.calendar ?? []) {
    const serviceId = requiredString(
      row,
      "service_id",
      "invalid_calendar_record",
    );
    if (bases.has(serviceId)) {
      throw new GtfsScheduleImportError(
        "duplicate_calendar_service",
        `calendar repeats service_id ${serviceId}.`,
      );
    }
    const flags = Object.fromEntries(
      WEEKDAY_FIELDS.map((field) => [field, parseFlag(row, field, serviceId)]),
    ) as Record<WeekdayField, 0 | 1>;
    const startDate = requiredString(
      row,
      "start_date",
      "invalid_calendar_record",
    );
    const endDate = requiredString(row, "end_date", "invalid_calendar_record");
    parseDateParts(startDate, `calendar ${serviceId}.start_date`);
    parseDateParts(endDate, `calendar ${serviceId}.end_date`);
    if (startDate > endDate) {
      throw new GtfsScheduleImportError(
        "invalid_calendar_range",
        `calendar ${serviceId} ends before it starts.`,
      );
    }
    bases.set(serviceId, {
      ...flags,
      startDate,
      endDate,
    });
  }

  const exceptions = new Map<string, GtfsCalendarException[]>();
  const seenExceptions = new Set<string>();
  for (const row of input.calendarDates ?? []) {
    const serviceId = requiredString(
      row,
      "service_id",
      "invalid_calendar_record",
    );
    const date = requiredString(row, "date", "invalid_calendar_record");
    parseDateParts(date, `calendar_dates ${serviceId}.date`);
    const exceptionType = row.exception_type;
    if (exceptionType !== "1" && exceptionType !== "2") {
      throw new GtfsScheduleImportError(
        "invalid_exception_type",
        `calendar_dates ${serviceId}/${date} exception_type must be 1 or 2.`,
      );
    }
    const key = `${serviceId}\u0000${date}`;
    if (seenExceptions.has(key)) {
      throw new GtfsScheduleImportError(
        "duplicate_calendar_exception",
        `calendar_dates repeats service_id/date ${serviceId}/${date}.`,
      );
    }
    seenExceptions.add(key);
    const list = exceptions.get(serviceId) ?? [];
    list.push({
      date,
      exceptionType: exceptionType === "1" ? "added" : "removed",
    });
    exceptions.set(serviceId, list);
  }

  const serviceIds = new Set([...bases.keys(), ...exceptions.keys()]);
  const result = new Map<string, TransitServiceCalendar>();
  for (const serviceId of [...serviceIds].sort(lexical)) {
    const exceptionList = [...(exceptions.get(serviceId) ?? [])].sort((a, b) =>
      lexical(a.date, b.date),
    );
    const id = makeTransitEntityId(
      metadata.provider,
      "calendar",
      metadata.identityNamespace,
      serviceId,
    );
    result.set(serviceId, {
      id,
      provider: metadata.provider,
      providerCalendarId: serviceId,
      sourceSemantics: gtfsCalendarSource(
        metadata.provider,
        bases.get(serviceId) ?? null,
        exceptionList,
      ),
      provenance: scheduleProvenance(serviceId, "gtfs:calendar", metadata),
    });
  }
  return result;
}

/** Parse a GTFS service-day time into seconds without modulo-24 conversion. */
export function parseGtfsServiceTime(value: string): number | null {
  if (value.length === 0) return null;
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
  if (match === null || Number(match[1]) > 99) {
    throw new GtfsScheduleImportError(
      "invalid_time",
      `GTFS time ${JSON.stringify(value)} must be H:MM:SS or HH:MM:SS with hours 00-99.`,
    );
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Resolve one normalized GTFS/GTFS-JP calendar on a strict service date. */
export function isGtfsServiceActiveOnDate(
  calendar: TransitServiceCalendar,
  date: string,
): GtfsServiceDateEvaluation {
  const semantics = calendar.sourceSemantics;
  if (semantics.provider !== "gtfs" && semantics.provider !== "gtfs-jp") {
    throw new GtfsScheduleImportError(
      "invalid_calendar_record",
      "GTFS service-date evaluation requires a GTFS calendar branch.",
    );
  }
  const compactDate = compactDateFromInput(date);
  const exception = semantics.exceptions.find(
    (candidate) => candidate.date === compactDate,
  );
  if (exception?.exceptionType === "added") {
    return { date, active: true, reason: "exception_added" };
  }
  if (exception?.exceptionType === "removed") {
    return { date, active: false, reason: "exception_removed" };
  }
  const base = semantics.base;
  if (base === null) {
    return { date, active: false, reason: "exception_only_no_match" };
  }
  if (compactDate < base.startDate || compactDate > base.endDate) {
    return { date, active: false, reason: "outside_base_range" };
  }
  const weekdayIndexValue = weekdayIndex(parseDateParts(compactDate, "date"));
  const field =
    weekdayIndexValue === 0 ? "sunday" : WEEKDAY_FIELDS[weekdayIndexValue - 1];
  return base[field] === 1
    ? { date, active: true, reason: "base_weekday" }
    : { date, active: false, reason: "base_inactive_weekday" };
}

interface ParsedStopTime {
  readonly row: GtfsTableRow;
  readonly stopId: string;
  readonly rawSequence: number;
  readonly arrivalSeconds: number | null;
  readonly departureSeconds: number | null;
  readonly timepoint: 0 | 1 | null;
}

function parseStopSequence(row: GtfsTableRow, tripId: string): number {
  const value = requiredString(row, "stop_sequence", "invalid_time");
  if (!/^\d+$/.test(value)) {
    throw new GtfsScheduleImportError(
      "invalid_time",
      `trip ${tripId} has malformed stop_sequence ${value}.`,
    );
  }
  return Number(value);
}

function parseTimepoint(row: GtfsTableRow, tripId: string): 0 | 1 | null {
  const raw = optionalString(row, "timepoint");
  if (raw === null) return null;
  if (raw === "0") return 0;
  if (raw === "1") return 1;
  throw new GtfsScheduleImportError(
    "invalid_timepoint",
    `trip ${tripId} timepoint must be 0 or 1.`,
  );
}

function parseAndValidateTripTimes(
  tripId: string,
  rows: readonly GtfsTableRow[],
): readonly ParsedStopTime[] {
  const ordered = [...rows].sort(
    (a, b) => parseStopSequence(a, tripId) - parseStopSequence(b, tripId),
  );
  if (ordered.length < 2) {
    throw new GtfsScheduleImportError(
      "missing_required_time",
      `trip ${tripId} requires at least two stop_times rows.`,
    );
  }
  const parsed = ordered.map((row, index) => {
    const rawArrival = optionalString(row, "arrival_time");
    const rawDeparture = optionalString(row, "departure_time");
    const arrivalSeconds = parseGtfsServiceTime(rawArrival ?? "");
    const departureSeconds = parseGtfsServiceTime(rawDeparture ?? "");
    const timepoint = parseTimepoint(row, tripId);
    const effectiveTimepoint = timepoint ?? 1;
    if (
      (index === 0 || index === ordered.length - 1) &&
      arrivalSeconds === null
    ) {
      throw new GtfsScheduleImportError(
        "missing_required_time",
        `trip ${tripId} requires arrival_time at its first and last stops.`,
      );
    }
    if (
      effectiveTimepoint === 1 &&
      (arrivalSeconds === null || departureSeconds === null)
    ) {
      throw new GtfsScheduleImportError(
        "missing_required_time",
        `trip ${tripId} timepoint=1 requires arrival_time and departure_time.`,
      );
    }
    if (
      arrivalSeconds !== null &&
      departureSeconds !== null &&
      arrivalSeconds > departureSeconds
    ) {
      throw new GtfsScheduleImportError(
        "invalid_time_order",
        `trip ${tripId} has arrival_time after departure_time.`,
      );
    }
    return {
      row,
      stopId: requiredString(row, "stop_id", "invalid_time"),
      rawSequence: parseStopSequence(row, tripId),
      arrivalSeconds,
      departureSeconds,
      timepoint,
    };
  });
  let previousKnown: number | null = null;
  for (const entry of parsed) {
    for (const value of [entry.arrivalSeconds, entry.departureSeconds]) {
      if (value === null) continue;
      if (previousKnown !== null && value < previousKnown) {
        throw new GtfsScheduleImportError(
          "invalid_time_chronology",
          `trip ${tripId} has known scheduled time moving backward.`,
        );
      }
      previousKnown = value;
    }
  }
  return parsed;
}

function scheduledServiceSource(
  provider: "gtfs",
  row: GtfsTableRow,
): GtfsScheduledServiceSourceSemantics;
function scheduledServiceSource(
  provider: "gtfs-jp",
  row: GtfsTableRow,
): GtfsJpScheduledServiceSourceSemantics;
function scheduledServiceSource(
  provider: GtfsProvider,
  row: GtfsTableRow,
): GtfsScheduledServiceSourceSemantics | GtfsJpScheduledServiceSourceSemantics {
  const common = {
    tripHeadsign: optionalString(row, "trip_headsign"),
    directionId: optionalString(row, "direction_id"),
    blockId: optionalString(row, "block_id"),
  };
  return provider === "gtfs"
    ? { provider, ...common }
    : { provider, ...common };
}

function scheduledStopSource(
  provider: "gtfs",
  entry: ParsedStopTime,
): GtfsScheduledStopTimeSourceSemantics;
function scheduledStopSource(
  provider: "gtfs-jp",
  entry: ParsedStopTime,
): GtfsJpScheduledStopTimeSourceSemantics;
function scheduledStopSource(
  provider: GtfsProvider,
  entry: ParsedStopTime,
):
  | GtfsScheduledStopTimeSourceSemantics
  | GtfsJpScheduledStopTimeSourceSemantics {
  const common = {
    rawArrivalTime: optionalString(entry.row, "arrival_time"),
    rawDepartureTime: optionalString(entry.row, "departure_time"),
    rawStopSequence: entry.rawSequence,
    pickupType: optionalString(entry.row, "pickup_type"),
    dropOffType: optionalString(entry.row, "drop_off_type"),
    timepoint: entry.timepoint,
  };
  return provider === "gtfs"
    ? { provider, ...common }
    : { provider, ...common };
}

function scheduleStopTimesForHash(
  values: readonly TransitScheduledStopTime[],
): readonly TransitScheduledStopTime[] {
  return values.map((value) => {
    const provenance = {
      ...value.provenance,
      providerId: `${value.serviceId}:${value.order}`,
    };
    // Raw formatting and source row numbering are evidence, not schedule
    // semantics. Numeric service-day values and canonical order are hashed.
    if (value.provider === "gtfs") {
      return {
        ...value,
        sourceSemantics: {
          ...value.sourceSemantics,
          rawArrivalTime: null,
          rawDepartureTime: null,
          rawStopSequence: 0,
        },
        provenance,
      };
    }
    return {
      ...value,
      sourceSemantics: {
        ...value.sourceSemantics,
        rawArrivalTime: null,
        rawDepartureTime: null,
        rawStopSequence: 0,
      },
      provenance,
    };
  });
}

function buildScheduleCoverage(
  topology: GtfsImportResult,
  graph: NormalizedTransitGraph,
  servicesByRoute: ReadonlyMap<string, number>,
  partialRoutes: ReadonlySet<string>,
  metadata: GtfsScheduleMetadata,
): TransitCoverageReport {
  return {
    ...topology.coverage,
    entries: topology.coverage.entries.map((entry) => {
      const routes = graph.routes.filter(
        (route) =>
          route.provider === entry.provider &&
          route.mode === entry.mode &&
          graph.operators.find(
            (operator) =>
              operator.id === route.operatorId &&
              operator.providerOperatorId === entry.operator,
          ) !== undefined,
      );
      const incomplete = routes.filter(
        (route) =>
          (servicesByRoute.get(route.id) ?? 0) === 0 ||
          partialRoutes.has(route.id),
      );
      const notes = [...entry.notes];
      let timetable: TransitCoverageEntry["timetable"] = "imported";
      if (metadata.completeness !== "complete_provider_dump") {
        timetable = "partial";
        notes.push(
          `source is not a complete provider schedule (${metadata.completeness})`,
        );
      } else if (incomplete.length > 0) {
        timetable = "partial";
        notes.push(
          `scheduled facts are incomplete for routes: ${incomplete
            .map((route) => route.providerRouteId)
            .sort(lexical)
            .join(", ")}`,
        );
      }
      return { ...entry, timetable, notes };
    }),
  };
}

/** Import GTFS/GTFS-JP calendars and scheduled stop facts on top of C1. */
export function importGtfsSchedule(
  input: GtfsFeedTables,
  metadata: GtfsScheduleMetadata,
  suppliedTopology?: GtfsImportResult,
): GtfsScheduleImportResult {
  // Always validate the supplied schedule through C1. An optional topology
  // result exists only to test that an independently supplied C1 graph cannot
  // silently accept a divergent schedule pattern.
  const derivedTopology = importGtfsTopology(input, metadata);
  const topology = suppliedTopology ?? derivedTopology;
  const calendarsByServiceId = buildCalendars(input, metadata);
  const stopTimesByTrip = new Map<string, GtfsTableRow[]>();
  for (const row of input.stopTimes) {
    const tripId = requiredString(row, "trip_id", "invalid_time");
    const list = stopTimesByTrip.get(tripId) ?? [];
    list.push(row);
    stopTimesByTrip.set(tripId, list);
  }
  const routesByProviderId = new Map(
    topology.graph.routes.map((route) => [route.providerRouteId, route]),
  );
  const stopsByProviderId = new Map(
    topology.graph.stops.map((stop) => [stop.providerStopId, stop]),
  );
  const services: TransitScheduledService[] = [];
  const scheduledStopTimes: TransitScheduledStopTime[] = [];
  const servicesByRoute = new Map<string, number>();
  const partialRoutes = new Set<string>();

  for (const tripRow of input.trips) {
    const tripId = requiredString(tripRow, "trip_id", "invalid_time");
    const routeProviderId = requiredString(tripRow, "route_id", "invalid_time");
    const serviceProviderId = requiredString(
      tripRow,
      "service_id",
      "unknown_service_reference",
    );
    const calendar = calendarsByServiceId.get(serviceProviderId);
    if (calendar === undefined) {
      throw new GtfsScheduleImportError(
        "unknown_service_reference",
        `trip ${tripId} references unknown service_id ${serviceProviderId}.`,
      );
    }
    const route = routesByProviderId.get(routeProviderId);
    if (route === undefined) {
      throw new GtfsScheduleImportError(
        "topology_schedule_mismatch",
        `trip ${tripId} route ${routeProviderId} is absent from C1 topology.`,
      );
    }
    const parsed = parseAndValidateTripTimes(
      tripId,
      stopTimesByTrip.get(tripId) ?? [],
    );
    const stopIds = parsed.map((entry) => entry.stopId);
    const patternId = gtfsPatternIdFor(routeProviderId, stopIds);
    const routeSemantics = route.sourceSemantics;
    if (!(
      "patterns" in routeSemantics &&
      routeSemantics.patterns.some((pattern) => pattern.patternId === patternId)
    )) {
      throw new GtfsScheduleImportError(
        "topology_schedule_mismatch",
        `trip ${tripId} pattern ${patternId} is absent from C1 route topology.`,
      );
    }
    const serviceId = makeTransitEntityId(
      metadata.provider,
      "scheduled_service",
      metadata.identityNamespace,
      tripId,
    );
    const serviceFields = {
      id: serviceId,
      providerServiceId: tripId,
      routeId: route.id,
      patternId,
      calendarId: calendar.id,
      provenance: scheduleProvenance(
        tripId,
        "gtfs:scheduled_service",
        metadata,
      ),
    };
    services.push(
      metadata.provider === "gtfs"
        ? {
            ...serviceFields,
            provider: "gtfs",
            sourceSemantics: scheduledServiceSource("gtfs", tripRow),
          }
        : {
            ...serviceFields,
            provider: "gtfs-jp",
            sourceSemantics: scheduledServiceSource("gtfs-jp", tripRow),
          },
    );
    servicesByRoute.set(route.id, (servicesByRoute.get(route.id) ?? 0) + 1);
    for (const [index, entry] of parsed.entries()) {
      const stop = stopsByProviderId.get(entry.stopId);
      if (stop === undefined) {
        throw new GtfsScheduleImportError(
          "topology_schedule_mismatch",
          `trip ${tripId} stop ${entry.stopId} is absent from C1 topology.`,
        );
      }
      const stopTimeFields = {
        serviceId,
        stopId: stop.id,
        patternId,
        order: index + 1,
        arrivalServiceSeconds: entry.arrivalSeconds,
        departureServiceSeconds: entry.departureSeconds,
        provenance: scheduleProvenance(
          `${tripId}:${entry.rawSequence}`,
          "gtfs:stop_time",
          metadata,
        ),
      };
      scheduledStopTimes.push(
        metadata.provider === "gtfs"
          ? {
              ...stopTimeFields,
              provider: "gtfs",
              sourceSemantics: scheduledStopSource("gtfs", entry),
            }
          : {
              ...stopTimeFields,
              provider: "gtfs-jp",
              sourceSemantics: scheduledStopSource("gtfs-jp", entry),
            },
      );
    }
    if (
      parsed.some(
        (entry) =>
          entry.arrivalSeconds === null || entry.departureSeconds === null,
      )
    ) {
      partialRoutes.add(route.id);
    }
  }

  services.sort((a, b) => lexical(a.id, b.id));
  scheduledStopTimes.sort(
    (a, b) =>
      lexical(a.serviceId, b.serviceId) ||
      lexical(a.patternId, b.patternId) ||
      a.order - b.order ||
      lexical(a.stopId, b.stopId),
  );
  const calendars = [...calendarsByServiceId.values()].sort((a, b) =>
    lexical(a.id, b.id),
  );
  const graphWithoutHash: NormalizedTransitGraph = {
    ...topology.graph,
    calendars,
    scheduledServices: services,
    scheduledStopTimes,
  };
  const contentHash = contentHashOf({
    operators: graphWithoutHash.operators,
    stops: graphWithoutHash.stops,
    routes: graphWithoutHash.routes,
    routeStops: gtfsRouteStopsForSemanticHash(graphWithoutHash.routeStops),
    calendars,
    scheduledServices: services,
    scheduledStopTimes: scheduleStopTimesForHash(scheduledStopTimes),
  });
  const graph: NormalizedTransitGraph = {
    ...graphWithoutHash,
    datasetVersion: { ...graphWithoutHash.datasetVersion, contentHash },
  };
  return {
    graph,
    coverage: buildScheduleCoverage(
      topology,
      graph,
      servicesByRoute,
      partialRoutes,
      metadata,
    ),
    topology,
  };
}
