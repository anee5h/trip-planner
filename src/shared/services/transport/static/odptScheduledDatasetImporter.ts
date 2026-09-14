/**
 * KAI-292C4F — normalized ODPT scheduled-dataset bridge.
 *
 * This module consumes already-normalized, credential-free ODPT provider records
 * from the allow-listed `/api/odpt` boundary and produces the existing
 * NormalizedTransitGraph scheduled-service structures. It has no network access,
 * no runtime router, and no product endpoint assumptions.
 *
 * A dataset's completeness is supplied by the acquisition manifest. This module
 * never upgrades a bounded sample to complete_provider_dump. The C4F production
 * artifact declares one exact TokyoMetro train identity and its returned calendar
 * variants, so completeness is for that explicit scope only.
 */

import { isLegitimateRollover } from "../odptChronology";
import type {
  OdptCalendar,
  OdptOperator,
  OdptProvenance,
  OdptRailway,
  OdptStation,
  OdptTrainTimetable,
  OdptTrainTimetableObject,
} from "../OdptProvider";
import { contentHashOf } from "./odptRailTopologyImporter";
import { makeTransitEntityId } from "./transitEntityId";
import type {
  OdptRoutePatternSourceSemantics,
  OdptScheduledServiceSourceSemantics,
  OdptScheduledStopTimeSourceSemantics,
  NormalizedTransitGraph,
  TransitCoverageReport,
  TransitDatasetCompleteness,
  TransitDatasetVersion,
  TransitOperator,
  TransitProvenance,
  TransitRoute,
  TransitRouteStop,
  TransitScheduledService,
  TransitScheduledStopTime,
  TransitServiceCalendar,
  TransitStop,
  TransitSourceType,
} from "./transitGraphTypes";

export interface OdptScheduledDatasetImportMetadata {
  readonly provider: "odpt";
  readonly schemaVersion: string;
  readonly datasetId: string;
  readonly identityNamespace: string;
  readonly sourceDescriptor: string;
  readonly sourceType: TransitSourceType;
  readonly retrievedAt: string;
  readonly checkedAt: string;
  readonly issuedAt?: string | null;
  readonly validUntil?: string | null;
  readonly completeness: TransitDatasetCompleteness;
}

export interface OdptScheduledDatasetInput {
  readonly operators: readonly OdptOperator[];
  readonly stations: readonly OdptStation[];
  readonly railways: readonly OdptRailway[];
  readonly calendars: readonly OdptCalendar[];
  readonly trainTimetables: readonly OdptTrainTimetable[];
  /** The exact provider train identity whose returned records define the scope. */
  readonly declaredTrainIdentity: string;
}

export interface OdptScheduledDatasetImportResult {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
}

export type OdptScheduledDatasetImportErrorCode =
  | "invalid_metadata"
  | "empty_family"
  | "duplicate_identity"
  | "invalid_provenance"
  | "provider_mismatch"
  | "namespace_mismatch"
  | "unknown_operator_reference"
  | "unknown_railway_reference"
  | "unknown_station_reference"
  | "unknown_calendar_reference"
  | "invalid_station_order"
  | "invalid_schedule_time"
  | "invalid_schedule_order"
  | "invalid_schedule_reference"
  | "calendar_scope_mismatch"
  | "inconsistent_schedule";

export class OdptScheduledDatasetImportError extends Error {
  readonly code: OdptScheduledDatasetImportErrorCode;

  constructor(code: OdptScheduledDatasetImportErrorCode, message: string) {
    super(`odpt-scheduled-import[${code}]: ${message}`);
    this.name = "OdptScheduledDatasetImportError";
    this.code = code;
  }
}

function fail(
  code: OdptScheduledDatasetImportErrorCode,
  message: string,
): never {
  throw new OdptScheduledDatasetImportError(code, message);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueBy<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  family: string,
): Map<string, T> {
  if (values.length === 0) fail("empty_family", `${family} must not be empty.`);
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (!nonEmpty(key))
      fail("invalid_schedule_reference", `${family} has an empty identity.`);
    if (result.has(key))
      fail("duplicate_identity", `${family} repeats ${key}.`);
    result.set(key, value);
  }
  return result;
}

function validateMetadata(metadata: OdptScheduledDatasetImportMetadata): void {
  if (
    metadata.provider !== "odpt" ||
    !nonEmpty(metadata.schemaVersion) ||
    !nonEmpty(metadata.datasetId) ||
    !nonEmpty(metadata.identityNamespace) ||
    !nonEmpty(metadata.sourceDescriptor) ||
    metadata.identityNamespace !== "odpt" ||
    metadata.sourceType !== "data_dump" ||
    !nonEmpty(metadata.retrievedAt) ||
    !nonEmpty(metadata.checkedAt)
  ) {
    fail(
      "invalid_metadata",
      "ODPT scheduled metadata is not production-shaped.",
    );
  }
  if (
    ![
      "fixture_subset",
      "bounded_subset",
      "complete_provider_dump",
      "unknown",
    ].includes(metadata.completeness)
  ) {
    fail("invalid_metadata", "ODPT scheduled completeness is unsupported.");
  }
}

function sourceProvenance(
  record: { readonly sameAs: string; readonly provenance: OdptProvenance },
  metadata: OdptScheduledDatasetImportMetadata,
  label: string,
): TransitProvenance {
  const source = record.provenance;
  if (
    source.provider !== "odpt" ||
    source.providerId !== record.sameAs ||
    source.coverage !== "unknown" ||
    !nonEmpty(source.sourceResource) ||
    !nonEmpty(source.sourceUrl) ||
    source.sourceUrl.includes("acl:consumerKey")
  ) {
    fail("invalid_provenance", `${label} has invalid ODPT provenance.`);
  }
  return {
    provider: "odpt",
    identityNamespace: metadata.identityNamespace,
    providerId: record.sameAs,
    sourceResourceType: source.sourceResource,
    datasetId: metadata.datasetId,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
    sourceUrl: source.sourceUrl,
  };
}

function exactRecordId(
  record: { readonly id: string; readonly sameAs: string },
  label: string,
): string {
  if (!nonEmpty(record.sameAs) || record.id !== record.sameAs) {
    fail("invalid_schedule_reference", `${label} must preserve sameAs as id.`);
  }
  return record.sameAs;
}

function routePatternId(routeId: string, trainIdentity: string): string {
  return makeTransitEntityId(
    "odpt",
    "pattern",
    "odpt",
    `${routeId}|${trainIdentity}`,
  );
}

function parseOdptTime(value: string, label: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (match === null)
    fail("invalid_schedule_time", `${label} is not HH:MM[:SS].`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    fail("invalid_schedule_time", `${label} is outside the ODPT clock range.`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function serviceDaySeconds(
  value: string | null,
  label: string,
  state: { rawSeconds: number | null; dayOffset: number },
): number | null {
  if (value === null) return null;
  const rawSeconds = parseOdptTime(value, label);
  if (state.rawSeconds !== null && rawSeconds < state.rawSeconds) {
    if (
      !isLegitimateRollover(
        Math.floor(state.rawSeconds / 60),
        Math.floor(rawSeconds / 60),
      ) ||
      state.dayOffset !== 0
    ) {
      fail(
        "inconsistent_schedule",
        `${label} moves backward without a proven midnight rollover.`,
      );
    }
    state.dayOffset = 1;
  }
  state.rawSeconds = rawSeconds;
  return rawSeconds + state.dayOffset * 24 * 60 * 60;
}

function stationForObject(
  object: OdptTrainTimetableObject,
  label: string,
): string {
  if (
    object.arrivalStation !== null &&
    object.departureStation !== null &&
    object.arrivalStation !== object.departureStation
  ) {
    fail(
      "inconsistent_schedule",
      `${label} arrival/departure stations disagree.`,
    );
  }
  const station = object.departureStation ?? object.arrivalStation;
  if (station === null)
    fail("invalid_schedule_reference", `${label} has no station.`);
  return station;
}

function graphOperator(
  record: OdptOperator,
  metadata: OdptScheduledDatasetImportMetadata,
): TransitOperator {
  const sameAs = exactRecordId(record, "operator");
  return {
    id: makeTransitEntityId(
      "odpt",
      "operator",
      metadata.identityNamespace,
      sameAs,
    ),
    provider: "odpt",
    providerOperatorId: sameAs,
    names: record.operatorTitle ?? {},
    provenance: sourceProvenance(record, metadata, `operator ${sameAs}`),
  };
}

function graphStop(
  record: OdptStation,
  metadata: OdptScheduledDatasetImportMetadata,
  operatorId: string,
): TransitStop {
  const sameAs = exactRecordId(record, `station ${record.sameAs}`);
  if (record.operator === null || record.railway === null) {
    fail(
      "invalid_schedule_reference",
      `station ${sameAs} lacks operator/railway identity.`,
    );
  }
  return {
    id: makeTransitEntityId("odpt", "stop", metadata.identityNamespace, sameAs),
    provider: "odpt",
    providerStopId: sameAs,
    stopType: "station",
    coordinates: record.coordinates,
    operatorIds: [operatorId],
    names: record.stationTitle ?? {},
    stationCode: record.stationCode,
    provenance: sourceProvenance(record, metadata, `station ${sameAs}`),
  };
}

/** Convert one exact normalized ODPT scope into the canonical C2 graph. */
export function importOdptScheduledDataset(
  input: OdptScheduledDatasetInput,
  metadata: OdptScheduledDatasetImportMetadata,
): OdptScheduledDatasetImportResult {
  validateMetadata(metadata);
  if (!nonEmpty(input.declaredTrainIdentity)) {
    fail("invalid_metadata", "declaredTrainIdentity must be non-empty.");
  }
  const operatorRecords = uniqueBy(
    input.operators,
    (record) => exactRecordId(record, "operator"),
    "operators",
  );
  const railwayRecords = uniqueBy(
    input.railways,
    (record) => exactRecordId(record, "railway"),
    "railways",
  );
  const stationRecords = uniqueBy(
    input.stations,
    (record) => exactRecordId(record, "station"),
    "stations",
  );
  const calendarRecords = uniqueBy(
    input.calendars,
    (record) => exactRecordId(record, "calendar"),
    "calendars",
  );
  const timetableRecords = uniqueBy(
    input.trainTimetables,
    (record) => exactRecordId(record, "train timetable"),
    "trainTimetables",
  );

  const operators = [...operatorRecords.values()].map((record) =>
    graphOperator(record, metadata),
  );
  const operatorByProviderId = new Map(
    operators.map(
      (operator) => [operator.providerOperatorId, operator] as const,
    ),
  );
  const railways = [...railwayRecords.values()];
  const routes: TransitRoute[] = [];
  const routeStops: TransitRouteStop[] = [];
  const routeByProviderId = new Map<string, TransitRoute>();
  const stationOrderByRoute = new Map<string, Map<string, number>>();

  for (const record of railways) {
    const railwayId = exactRecordId(record, "railway");
    if (record.operator === null) {
      fail(
        "unknown_operator_reference",
        `railway ${railwayId} lacks an operator.`,
      );
    }
    const operator = operatorByProviderId.get(record.operator);
    if (operator === undefined) {
      fail(
        "unknown_operator_reference",
        `railway ${railwayId} references ${record.operator}.`,
      );
    }
    if (record.stationOrder.length === 0) {
      fail(
        "invalid_station_order",
        `railway ${railwayId} has no stationOrder.`,
      );
    }
    const ordered = new Map<string, number>();
    for (const entry of record.stationOrder) {
      const providerStopId = entry.station;
      if (
        !nonEmpty(providerStopId) ||
        entry.index === null ||
        !Number.isSafeInteger(entry.index) ||
        entry.index < 1
      ) {
        fail(
          "invalid_station_order",
          `railway ${railwayId} has invalid stationOrder.`,
        );
      }
      const order = entry.index;
      if (
        ordered.has(providerStopId) ||
        [...ordered.values()].includes(order)
      ) {
        fail(
          "invalid_station_order",
          `railway ${railwayId} has duplicate stationOrder.`,
        );
      }
      if (!stationRecords.has(providerStopId)) {
        fail(
          "unknown_station_reference",
          `railway ${railwayId} orders ${providerStopId}.`,
        );
      }
      const station = stationRecords.get(providerStopId)!;
      if (
        station.operator !== record.operator ||
        station.railway !== railwayId
      ) {
        fail(
          "provider_mismatch",
          `station ${providerStopId} disagrees with railway ${railwayId}.`,
        );
      }
      ordered.set(providerStopId, order);
    }
    if (ordered.size !== stationRecords.size) {
      fail(
        "invalid_station_order",
        `railway ${railwayId} does not cover the declared station scope.`,
      );
    }
    const routeId = makeTransitEntityId(
      "odpt",
      "route",
      metadata.identityNamespace,
      railwayId,
    );
    const route: TransitRoute = {
      id: routeId,
      provider: "odpt",
      providerRouteId: railwayId,
      operatorId: operator.id,
      mode: "rail",
      names: record.railwayTitle ?? {},
      sourceSemantics: {
        provider: "odpt",
        ascendingDirectionId: record.ascendingRailDirection,
        descendingDirectionId: record.descendingRailDirection,
        patterns: [],
      },
      provenance: sourceProvenance(record, metadata, `railway ${railwayId}`),
    };
    routes.push(route);
    routeByProviderId.set(railwayId, route);
    stationOrderByRoute.set(railwayId, ordered);
  }

  const stops = [...stationRecords.values()].map((record) => {
    const operator = operatorByProviderId.get(record.operator ?? "");
    if (operator === undefined) {
      fail(
        "unknown_operator_reference",
        `station ${record.sameAs} references an unknown operator.`,
      );
    }
    if (!railwayRecords.has(record.railway ?? "")) {
      fail(
        "unknown_railway_reference",
        `station ${record.sameAs} references an unknown railway.`,
      );
    }
    return graphStop(record, metadata, operator.id);
  });
  const stopByProviderId = new Map(
    stops.map((stop) => [stop.providerStopId, stop] as const),
  );
  for (const [railwayId, ordered] of stationOrderByRoute) {
    const route = routeByProviderId.get(railwayId)!;
    for (const [stationId, order] of [...ordered.entries()].sort(
      (left, right) => left[1] - right[1],
    )) {
      const stop = stopByProviderId.get(stationId);
      if (stop === undefined)
        fail("unknown_station_reference", `station ${stationId} is absent.`);
      routeStops.push({
        routeId: route.id,
        stopId: stop.id,
        order,
        patternId: undefined,
        provenance: {
          ...sourceProvenance(
            railwayRecords.get(railwayId)!,
            metadata,
            `railway ${railwayId}`,
          ),
          providerId: stationId,
          sourceResourceType: "odpt:Railway.stationOrder",
        },
      });
    }
  }

  const calendars: TransitServiceCalendar[] = [...calendarRecords.values()].map(
    (record) => {
      const sameAs = exactRecordId(record, "calendar");
      return {
        id: makeTransitEntityId(
          "odpt",
          "calendar",
          metadata.identityNamespace,
          sameAs,
        ),
        provider: "odpt",
        providerCalendarId: sameAs,
        sourceSemantics: {
          provider: "odpt",
          kind: record.isSpecific ? "specific" : "base",
          day: record.day,
          duration: record.duration,
        },
        provenance: sourceProvenance(record, metadata, `calendar ${sameAs}`),
      };
    },
  );
  const calendarByProviderId = new Map(
    calendars.map(
      (calendar) => [calendar.providerCalendarId, calendar] as const,
    ),
  );

  const services: TransitScheduledService[] = [];
  const scheduledStopTimes: TransitScheduledStopTime[] = [];
  const patternServices = new Map<string, string[]>();
  const patternTripIds = new Map<string, string[]>();
  for (const record of [...timetableRecords.values()].sort((left, right) =>
    lexical(left.sameAs, right.sameAs),
  )) {
    const timetableId = exactRecordId(record, "train timetable");
    const providerRailwayId = record.railway;
    const providerCalendarId = record.calendar;
    if (
      record.train !== input.declaredTrainIdentity ||
      record.operator === null ||
      providerRailwayId === null ||
      providerCalendarId === null
    ) {
      fail(
        "calendar_scope_mismatch",
        `train timetable ${timetableId} falls outside the declared scope.`,
      );
    }
    const route = routeByProviderId.get(providerRailwayId);
    const calendar = calendarByProviderId.get(providerCalendarId);
    if (route === undefined)
      fail(
        "unknown_railway_reference",
        `timetable ${timetableId} references ${providerRailwayId}.`,
      );
    if (calendar === undefined)
      fail(
        "unknown_calendar_reference",
        `timetable ${timetableId} references ${providerCalendarId}.`,
      );
    const patternId = routePatternId(route.id, input.declaredTrainIdentity);
    const serviceId = makeTransitEntityId(
      "odpt",
      "scheduled_service",
      metadata.identityNamespace,
      timetableId,
    );
    const patternSemantics: OdptRoutePatternSourceSemantics = {
      patternId,
      tripIds: [...(patternTripIds.get(patternId) ?? []), timetableId],
      serviceIds: [...(patternServices.get(patternId) ?? []), serviceId],
    };
    patternTripIds.set(patternId, patternSemantics.tripIds as string[]);
    patternServices.set(patternId, patternSemantics.serviceIds as string[]);
    const serviceSemantics: OdptScheduledServiceSourceSemantics = {
      provider: "odpt",
      trainTimetableId: timetableId,
      trainIdentity: record.train,
      trainNumber: record.trainNumber,
      railDirection: record.railDirection,
      originStation: record.originStation,
      destinationStation: record.destinationStation,
      trainType: record.trainType,
      needExtraFee: record.needExtraFee,
    };
    const provenance = sourceProvenance(
      record,
      metadata,
      `train timetable ${timetableId}`,
    );
    services.push({
      id: serviceId,
      provider: "odpt",
      providerServiceId: timetableId,
      routeId: route.id,
      patternId,
      calendarId: calendar.id,
      sourceSemantics: serviceSemantics,
      provenance,
    });
    const routeOrder = stationOrderByRoute.get(providerRailwayId)!;
    const state = { rawSeconds: null as number | null, dayOffset: 0 };
    let previousRouteOrder: number | null = null;
    let direction: 1 | -1 | null = null;
    for (const [index, object] of record.objects.entries()) {
      const label = `${timetableId}.objects[${index}]`;
      const providerStopId = stationForObject(object, label);
      const stop = stopByProviderId.get(providerStopId);
      if (stop === undefined)
        fail(
          "unknown_station_reference",
          `${label} references ${providerStopId}.`,
        );
      const order = routeOrder.get(providerStopId);
      if (order === undefined)
        fail("unknown_station_reference", `${label} is outside route order.`);
      if (previousRouteOrder !== null && order !== previousRouteOrder) {
        const step = order > previousRouteOrder ? 1 : -1;
        if (direction === null) direction = step;
        if (direction !== step)
          fail("invalid_schedule_order", `${label} reverses route order.`);
      }
      previousRouteOrder = order;
      const arrivalServiceSeconds = serviceDaySeconds(
        object.arrivalTime,
        `${label}.arrivalTime`,
        state,
      );
      const departureServiceSeconds = serviceDaySeconds(
        object.departureTime,
        `${label}.departureTime`,
        state,
      );
      if (arrivalServiceSeconds === null && departureServiceSeconds === null) {
        fail(
          "invalid_schedule_time",
          `${label} has neither arrival nor departure time.`,
        );
      }
      if (
        arrivalServiceSeconds !== null &&
        departureServiceSeconds !== null &&
        arrivalServiceSeconds > departureServiceSeconds
      ) {
        fail("inconsistent_schedule", `${label} arrival is after departure.`);
      }
      const factSemantics: OdptScheduledStopTimeSourceSemantics = {
        provider: "odpt",
        trainTimetableId: timetableId,
        arrivalStation: object.arrivalStation,
        departureStation: object.departureStation,
        rawArrivalTime: object.arrivalTime,
        rawDepartureTime: object.departureTime,
      };
      scheduledStopTimes.push({
        serviceId,
        stopId: stop.id,
        patternId,
        order: index + 1,
        provider: "odpt",
        arrivalServiceSeconds,
        departureServiceSeconds,
        sourceSemantics: factSemantics,
        provenance: {
          ...provenance,
          providerId: `${timetableId}#${index + 1}`,
          sourceResourceType: "odpt:TrainTimetable.trainTimetableObject",
        },
      });
    }
    if (record.objects.length < 2)
      fail(
        "invalid_schedule_order",
        `${timetableId} must have at least two timetable objects.`,
      );
    const first =
      scheduledStopTimes[scheduledStopTimes.length - record.objects.length];
    const last = scheduledStopTimes[scheduledStopTimes.length - 1];
    if (
      first?.departureServiceSeconds === null ||
      last?.arrivalServiceSeconds === null
    ) {
      fail(
        "invalid_schedule_time",
        `${timetableId} lacks an origin departure or destination arrival.`,
      );
    }
  }

  const patternsByRoute = new Map<string, OdptRoutePatternSourceSemantics[]>();
  for (const route of routes) {
    const patternId = routePatternId(route.id, input.declaredTrainIdentity);
    const serviceIds = patternServices.get(patternId) ?? [];
    const tripIds = patternTripIds.get(patternId) ?? [];
    const patterns = patternsByRoute.get(route.id) ?? [];
    if (serviceIds.length > 0)
      patterns.push({ patternId, tripIds, serviceIds });
    patternsByRoute.set(route.id, patterns);
  }
  const finalRoutes = routes.map((route) => ({
    ...route,
    sourceSemantics: {
      ...route.sourceSemantics,
      patterns: patternsByRoute.get(route.id) ?? [],
    },
  }));
  const baseRouteStopsByRoute = new Map<string, TransitRouteStop[]>();
  for (const membership of routeStops) {
    const entries = baseRouteStopsByRoute.get(membership.routeId) ?? [];
    entries.push(membership);
    baseRouteStopsByRoute.set(membership.routeId, entries);
  }
  const finalRouteStops: TransitRouteStop[] = [];
  for (const route of finalRoutes) {
    const pattern = route.sourceSemantics.patterns?.[0];
    const service = services.find(
      (candidate) => candidate.routeId === route.id,
    );
    if (pattern === undefined || service === undefined) {
      fail(
        "inconsistent_schedule",
        `route ${route.id} has no declared schedule pattern.`,
      );
    }
    const baseByStop = new Map(
      (baseRouteStopsByRoute.get(route.id) ?? []).map(
        (membership) => [membership.stopId, membership] as const,
      ),
    );
    const serviceFacts = scheduledStopTimes
      .filter((fact) => fact.serviceId === service.id)
      .sort((left, right) => left.order - right.order);
    if (serviceFacts.length === 0) {
      fail(
        "inconsistent_schedule",
        `service ${service.providerServiceId} has no stop facts.`,
      );
    }
    for (const fact of serviceFacts) {
      const base = baseByStop.get(fact.stopId);
      if (base === undefined) {
        fail(
          "unknown_station_reference",
          `service ${service.providerServiceId} references an unlisted stop.`,
        );
      }
      finalRouteStops.push({
        ...base,
        order: fact.order,
        patternId: pattern.patternId,
      });
    }
  }
  const finalRouteStopsByRoute = new Map<string, TransitRouteStop[]>();
  for (const membership of finalRouteStops) {
    const entries = finalRouteStopsByRoute.get(membership.routeId) ?? [];
    entries.push(membership);
    finalRouteStopsByRoute.set(membership.routeId, entries);
  }
  for (const service of services) {
    const facts = scheduledStopTimes
      .filter((fact) => fact.serviceId === service.id)
      .sort((left, right) => left.order - right.order);
    const memberships = finalRouteStopsByRoute.get(service.routeId) ?? [];
    if (
      facts.length !== memberships.length ||
      facts.some((fact, index) => fact.stopId !== memberships[index]?.stopId)
    ) {
      fail(
        "inconsistent_schedule",
        `service ${service.providerServiceId} does not match route station order.`,
      );
    }
  }

  const sortedOperators = [...operators].sort((left, right) =>
    lexical(left.id, right.id),
  );
  const sortedStops = [...stops].sort((left, right) =>
    lexical(left.id, right.id),
  );
  const sortedRoutes = [...finalRoutes].sort((left, right) =>
    lexical(left.id, right.id),
  );
  const sortedCalendars = [...calendars].sort((left, right) =>
    lexical(left.id, right.id),
  );
  const sortedServices = [...services].sort((left, right) =>
    lexical(left.id, right.id),
  );
  const sortedFacts = [...scheduledStopTimes].sort(
    (left, right) =>
      lexical(left.serviceId, right.serviceId) || left.order - right.order,
  );
  const datasetVersion: TransitDatasetVersion = {
    provider: "odpt",
    datasetId: metadata.datasetId,
    sourceType: metadata.sourceType,
    sourceDescriptor: metadata.sourceDescriptor,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
    issuedAt: metadata.issuedAt ?? null,
    validUntil: metadata.validUntil ?? null,
    schemaVersion: metadata.schemaVersion,
    completeness: metadata.completeness,
    contentHash: "",
  };
  const graphWithoutHash: NormalizedTransitGraph = {
    datasetVersion,
    operators: sortedOperators,
    stops: sortedStops,
    routes: sortedRoutes,
    routeStops: finalRouteStops,
    calendars: sortedCalendars,
    scheduledServices: sortedServices,
    scheduledStopTimes: sortedFacts,
    transfers: [],
    fares: [],
  };
  const graph: NormalizedTransitGraph = {
    ...graphWithoutHash,
    datasetVersion: {
      ...datasetVersion,
      contentHash: contentHashOf({
        operators: graphWithoutHash.operators,
        stops: graphWithoutHash.stops,
        routes: graphWithoutHash.routes,
        routeStops: graphWithoutHash.routeStops,
        calendars: graphWithoutHash.calendars,
        scheduledServices: graphWithoutHash.scheduledServices,
        scheduledStopTimes: graphWithoutHash.scheduledStopTimes,
        transfers: graphWithoutHash.transfers,
      }),
    },
  };
  const coverageState =
    metadata.completeness === "complete_provider_dump" ? "imported" : "partial";
  const coverage: TransitCoverageReport = {
    datasetId: metadata.datasetId,
    schemaVersion: graph.datasetVersion.schemaVersion,
    entries: sortedRoutes.map((route) => {
      const operator = sortedOperators.find(
        (candidate) => candidate.id === route.operatorId,
      );
      if (operator === undefined)
        fail(
          "unknown_operator_reference",
          `route ${route.id} lacks an operator.`,
        );
      return {
        provider: "odpt" as const,
        operator: operator.providerOperatorId,
        mode: route.mode,
        topology: coverageState,
        timetable: coverageState,
        transfers: "not_evaluated" as const,
        fare: "not_evaluated" as const,
        realtime: "not_evaluated" as const,
        datasetId: metadata.datasetId,
        notes: [
          `complete only for exact train scope ${input.declaredTrainIdentity}`,
          "station timetable discovery was bounded and is not part of the routed graph",
        ],
      };
    }),
  };
  return { graph, coverage };
}
