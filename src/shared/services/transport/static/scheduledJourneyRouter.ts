/**
 * KAI-292A — pure direct scheduled-journey routing over the C2 graph.
 *
 * This is deliberately only one scheduled service with zero transfers. The
 * graph is indexed once per query, exact stop ids are required, and every
 * successful result is normalized into the canonical Journey contract.
 */

import type {
  Journey,
  JourneyEndpoint,
  JourneyProvenance,
} from "@/shared/types/journey";
import { journeyHandoffCapabilityForMode } from "../JourneyHandoff";
import {
  isGtfsServiceActiveOnDate,
  isRealGtfsServiceDate,
  type GtfsServiceDateEvaluation,
} from "./gtfsScheduleImporter";
import type {
  NormalizedTransitGraph,
  TransitCoverageReport,
  TransitOperator,
  TransitRoute,
  TransitScheduledService,
  TransitScheduledStopTime,
  TransitServiceCalendar,
  TransitStop,
  TransitProvider,
  TransitRouteMode,
} from "./transitGraphTypes";
import type { TransportMode } from "../types";

export const GTFS_DIRECT_JOURNEY_SOURCE = "gtfs_scheduled_timetable" as const;

export interface RouteDirectScheduledJourneyInput {
  readonly graph: NormalizedTransitGraph;
  /** C2 coverage is separate from the graph so partial source scope is visible. */
  readonly coverage?: TransitCoverageReport;
  readonly originStopId: string;
  readonly destinationStopId: string;
  readonly serviceDate: string;
  /** Absolute GTFS service-day seconds; no ambient clock or date conversion. */
  readonly earliestDepartureServiceSeconds: number;
}

export type ScheduledJourneyNoMatchReason =
  | "origin_equals_destination"
  | "origin_stop_absent"
  | "destination_stop_absent"
  | "destination_before_origin"
  | "no_direct_service"
  | "inactive_service"
  | "departure_window_miss"
  | "missing_origin_departure"
  | "missing_destination_arrival";

export type ScheduledJourneyInconclusiveReason =
  | "invalid_service_date"
  | "invalid_earliest_departure"
  | "unsupported_coverage"
  | "partial_timetable"
  | "chronology_invalid"
  | "ambiguous_stop_pair"
  | "broken_graph_reference"
  | "pickup_prohibited"
  | "dropoff_prohibited"
  | "unsupported_pickup_dropoff"
  | "unsupported_route_mode";

export interface ScheduledJourneyEvidence {
  readonly source: typeof GTFS_DIRECT_JOURNEY_SOURCE;
  readonly provider: "gtfs" | "gtfs-jp";
  readonly serviceDate: string;
  readonly calendarReason: GtfsServiceDateEvaluation["reason"];
  readonly calendarId: string;
  readonly providerCalendarId: string;
  /** Normalized C2 scheduled-service id. */
  readonly serviceId: string;
  readonly providerServiceId: string;
  /** Normalized C1 route id and exact provider route identity. */
  readonly routeId: string;
  readonly providerRouteId: string;
  readonly patternId: string;
  readonly operatorId: string;
  readonly providerOperatorId: string;
  readonly routeName: string | null;
  readonly scheduledDepartureServiceSeconds: number;
  readonly scheduledArrivalServiceSeconds: number;
  readonly durationServiceSeconds: number;
  readonly scheduledDepartureTime: string;
  readonly scheduledArrivalTime: string;
  readonly transferCount: 0;
  readonly coverageState: "imported";
  readonly topologyCoverageState: "imported";
  readonly datasetId: string;
  readonly contentHash: string;
  readonly sourceType: NormalizedTransitGraph["datasetVersion"]["sourceType"];
  readonly completeness: NormalizedTransitGraph["datasetVersion"]["completeness"];
  readonly retrievedAt: string;
  readonly checkedAt: string;
  readonly boardingRequiresArrangement: boolean;
  readonly alightingRequiresArrangement: boolean;
}

export type ScheduledJourneyRouteResult =
  | {
      readonly kind: "verified";
      readonly journey: Journey;
      readonly evidence: ScheduledJourneyEvidence;
      readonly durationSeconds: number;
    }
  | {
      readonly kind: "no_match";
      readonly reason: ScheduledJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: ScheduledJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

interface IndexedGraph {
  readonly stops: ReadonlyMap<string, TransitStop>;
  readonly operators: ReadonlyMap<string, TransitOperator>;
  readonly routes: ReadonlyMap<string, TransitRoute>;
  readonly calendars: ReadonlyMap<string, TransitServiceCalendar>;
  readonly services: ReadonlyMap<string, TransitScheduledService>;
  readonly factsByService: ReadonlyMap<
    string,
    readonly TransitScheduledStopTime[]
  >;
  readonly serviceIdsByStop: ReadonlyMap<string, ReadonlySet<string>>;
}

interface ValidatedService {
  readonly service: TransitScheduledService;
  readonly calendar: TransitServiceCalendar;
  readonly calendarEvaluation: GtfsServiceDateEvaluation;
  readonly route: TransitRoute;
  readonly operator: TransitOperator;
  readonly facts: readonly TransitScheduledStopTime[];
  readonly mode: TransportMode;
  readonly routeName: string | null;
}

interface ValidPair {
  readonly origin: TransitScheduledStopTime;
  readonly destination: TransitScheduledStopTime;
  readonly departureSeconds: number;
  readonly arrivalSeconds: number;
  readonly durationSeconds: number;
  readonly boardingRequiresArrangement: boolean;
  readonly alightingRequiresArrangement: boolean;
}

type EndpointRequirement =
  "regular" | "prohibited" | "requires_arrangement" | "unsupported";

type CandidateOutcome =
  | { readonly kind: "valid"; readonly pair: ValidPair }
  | {
      readonly kind: "no_match";
      readonly reason: ScheduledJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: ScheduledJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function noMatch(
  reason: ScheduledJourneyNoMatchReason,
  notes: readonly string[] = [],
): Extract<CandidateOutcome, { readonly kind: "no_match" }> {
  return { kind: "no_match", reason, notes };
}

function inconclusive(
  reason: ScheduledJourneyInconclusiveReason,
  notes: readonly string[] = [],
): Extract<CandidateOutcome, { readonly kind: "inconclusive" }> {
  return { kind: "inconclusive", reason, notes };
}

function mapMode(mode: TransitRouteMode): TransportMode | null {
  switch (mode) {
    case "rail":
      return "train";
    case "bus":
      return "bus";
    case "ferry":
      return "ferry";
    default:
      return null;
  }
}

function routeName(route: TransitRoute): string | null {
  const semantics = route.sourceSemantics;
  if ("shortName" in semantics && semantics.shortName !== null) {
    return semantics.shortName;
  }
  if ("longName" in semantics && semantics.longName !== null) {
    return semantics.longName;
  }
  return null;
}

function stopName(stop: TransitStop): string | undefined {
  for (const language of ["ja", "en"]) {
    const name = stop.names[language]?.trim();
    if (name) return name;
  }
  const key = Object.keys(stop.names).sort(lexical)[0];
  const name = key === undefined ? undefined : stop.names[key]?.trim();
  return name || undefined;
}

function stopEndpoint(stop: TransitStop): JourneyEndpoint {
  const name = stopName(stop);
  return {
    kind: "station",
    id: stop.id,
    anchorKey: stop.id,
    ...(name !== undefined ? { name } : {}),
    ...(stop.coordinates !== null ? { coordinates: stop.coordinates } : {}),
  };
}

function formatServiceSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function unknownSafeCost(): Journey["legs"][number]["cost"] {
  return {
    currency: "JPY",
    representation: null,
    state: "unknown",
    evidence: "unknown",
    scope: "unknown",
    completeness: "unknown",
    basis: "unknown",
  };
}

function indexUnique<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): Map<string, T> | null {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) return null;
    result.set(key, value);
  }
  return result;
}

function buildIndex(graph: NormalizedTransitGraph): IndexedGraph | null {
  const stops = indexUnique(graph.stops, (stop) => stop.id);
  const operators = indexUnique(graph.operators, (operator) => operator.id);
  const routes = indexUnique(graph.routes, (route) => route.id);
  const calendars = indexUnique(graph.calendars, (calendar) => calendar.id);
  const services = indexUnique(
    graph.scheduledServices ?? [],
    (service) => service.id,
  );
  if (
    stops === null ||
    operators === null ||
    routes === null ||
    calendars === null ||
    services === null
  ) {
    return null;
  }
  const providerServiceIds = new Set<string>();
  for (const service of services.values()) {
    if (providerServiceIds.has(service.providerServiceId)) return null;
    providerServiceIds.add(service.providerServiceId);
  }

  const facts = new Map<string, TransitScheduledStopTime[]>();
  const serviceIdsByStop = new Map<string, Set<string>>();
  for (const fact of graph.scheduledStopTimes ?? []) {
    const serviceFacts = facts.get(fact.serviceId) ?? [];
    serviceFacts.push(fact);
    facts.set(fact.serviceId, serviceFacts);
    const stopServices = serviceIdsByStop.get(fact.stopId) ?? new Set<string>();
    stopServices.add(fact.serviceId);
    serviceIdsByStop.set(fact.stopId, stopServices);
  }
  for (const serviceFacts of facts.values()) {
    serviceFacts.sort(
      (left, right) =>
        left.order - right.order || lexical(left.stopId, right.stopId),
    );
  }

  return {
    stops,
    operators,
    routes,
    calendars,
    services,
    factsByService: facts,
    serviceIdsByStop,
  };
}

function datasetCoverageReason(
  graph: NormalizedTransitGraph,
  coverage: TransitCoverageReport | undefined,
): ScheduledJourneyInconclusiveReason | null {
  if (
    coverage === undefined ||
    coverage.datasetId !== graph.datasetVersion.datasetId
  ) {
    return "unsupported_coverage";
  }
  if (
    graph.datasetVersion.completeness === "fixture_subset" ||
    graph.datasetVersion.completeness === "bounded_subset"
  ) {
    return "partial_timetable";
  }
  if (graph.datasetVersion.completeness !== "complete_provider_dump") {
    return "unsupported_coverage";
  }
  return null;
}

function coverageReason(
  graph: NormalizedTransitGraph,
  coverage: TransitCoverageReport | undefined,
  route: TransitRoute,
  operator: TransitOperator,
  index: IndexedGraph,
): ScheduledJourneyInconclusiveReason | null {
  const datasetReason = datasetCoverageReason(graph, coverage);
  if (datasetReason !== null) return datasetReason;
  if (coverage === undefined) return "unsupported_coverage";

  const routeSemantics = route.sourceSemantics;
  if (
    routeSemantics === undefined ||
    routeSemantics === null ||
    typeof routeSemantics !== "object" ||
    !("patterns" in routeSemantics) ||
    !Array.isArray(routeSemantics.patterns)
  ) {
    return "broken_graph_reference";
  }
  const expectedTripIds = new Set(
    routeSemantics.patterns.flatMap((pattern) => pattern.tripIds),
  );
  const routeServices = [...index.services.values()].filter(
    (service) => service.routeId === route.id,
  );
  if (
    routeServices.length === 0 ||
    routeServices.some(
      (service) => !expectedTripIds.has(service.providerServiceId),
    ) ||
    [...expectedTripIds].some(
      (providerServiceId) =>
        !routeServices.some(
          (service) => service.providerServiceId === providerServiceId,
        ),
    ) ||
    routeServices.some((service) =>
      (index.factsByService.get(service.id) ?? []).some(
        (fact) =>
          fact.arrivalServiceSeconds === null ||
          fact.departureServiceSeconds === null,
      ),
    )
  ) {
    return "partial_timetable";
  }
  const matchingEntries = coverage.entries.filter(
    (candidate) =>
      candidate.provider === route.provider &&
      candidate.operator === operator.providerOperatorId &&
      candidate.mode === route.mode,
  );
  if (matchingEntries.length !== 1) return "unsupported_coverage";
  const entry = matchingEntries[0];
  if (
    entry === undefined ||
    entry.datasetId !== graph.datasetVersion.datasetId
  ) {
    return "unsupported_coverage";
  }
  if (entry.topology !== "imported" || entry.timetable !== "imported") {
    return entry.topology === "partial" || entry.timetable === "partial"
      ? "partial_timetable"
      : "unsupported_coverage";
  }
  return null;
}

function endpointRequirement(
  value: string | null | undefined,
): EndpointRequirement {
  if (value === null || value === "0") return "regular";
  if (value === "1") return "prohibited";
  if (value === "2" || value === "3") return "requires_arrangement";
  return "unsupported";
}

function validateFacts(
  graph: NormalizedTransitGraph,
  index: IndexedGraph,
  service: TransitScheduledService,
  route: TransitRoute,
  facts: readonly TransitScheduledStopTime[],
): ScheduledJourneyInconclusiveReason | null {
  if (facts.length < 2) return "broken_graph_reference";
  const routeSemantics = route.sourceSemantics;
  if (
    routeSemantics === undefined ||
    routeSemantics === null ||
    typeof routeSemantics !== "object" ||
    route.provider !== service.provider ||
    routeSemantics.provider !== service.provider ||
    !("patterns" in routeSemantics) ||
    !Array.isArray(routeSemantics.patterns)
  ) {
    return "broken_graph_reference";
  }
  const pattern = routeSemantics.patterns.find(
    (candidate) => candidate.patternId === service.patternId,
  );
  if (
    pattern === undefined ||
    !pattern.tripIds.includes(service.providerServiceId)
  ) {
    return "broken_graph_reference";
  }

  const seenOrders = new Set<number>();
  let previousTime: number | null = null;
  for (let factIndex = 0; factIndex < facts.length; factIndex += 1) {
    const fact = facts[factIndex];
    const stop = index.stops.get(fact.stopId);
    if (
      fact.provider !== service.provider ||
      fact.patternId !== service.patternId ||
      !Number.isSafeInteger(fact.order) ||
      fact.order < 1 ||
      fact.order !== factIndex + 1 ||
      seenOrders.has(fact.order) ||
      stop === undefined ||
      stop.provider !== fact.provider
    ) {
      return "broken_graph_reference";
    }
    seenOrders.add(fact.order);
    const semantics = fact.sourceSemantics;
    if (
      semantics === undefined ||
      semantics === null ||
      typeof semantics !== "object" ||
      semantics.provider !== fact.provider
    ) {
      return "broken_graph_reference";
    }
    for (const value of [
      fact.arrivalServiceSeconds,
      fact.departureServiceSeconds,
    ]) {
      if (value === null) continue;
      if (!Number.isSafeInteger(value) || value < 0) {
        return "broken_graph_reference";
      }
      if (previousTime !== null && value < previousTime) {
        return "chronology_invalid";
      }
      previousTime = value;
    }
    if (
      fact.arrivalServiceSeconds !== null &&
      fact.departureServiceSeconds !== null &&
      fact.arrivalServiceSeconds > fact.departureServiceSeconds
    ) {
      return "chronology_invalid";
    }
  }

  const memberships = graph.routeStops
    .filter(
      (membership) =>
        membership.routeId === route.id &&
        (membership.patternId ?? "") === service.patternId,
    )
    .sort(
      (left, right) =>
        left.order - right.order || lexical(left.stopId, right.stopId),
    );
  if (memberships.length !== facts.length) return "broken_graph_reference";
  const samePattern = facts.every(
    (fact, index) =>
      memberships[index]?.order === fact.order &&
      memberships[index]?.stopId === fact.stopId,
  );
  return samePattern ? null : "broken_graph_reference";
}

function validateService(
  graph: NormalizedTransitGraph,
  index: IndexedGraph,
  service: TransitScheduledService,
  serviceDate: string,
):
  | ValidatedService
  | {
      readonly kind: "error";
      readonly reason: ScheduledJourneyInconclusiveReason;
      readonly notes: readonly string[];
    } {
  if (service.provider !== graph.datasetVersion.provider) {
    return { kind: "error", reason: "broken_graph_reference", notes: [] };
  }
  const serviceSemantics = service.sourceSemantics;
  if (
    serviceSemantics === undefined ||
    serviceSemantics === null ||
    typeof serviceSemantics !== "object" ||
    serviceSemantics.provider !== service.provider
  ) {
    return { kind: "error", reason: "broken_graph_reference", notes: [] };
  }
  const route = index.routes.get(service.routeId);
  const calendar = index.calendars.get(service.calendarId);
  if (route === undefined || calendar === undefined) {
    return { kind: "error", reason: "broken_graph_reference", notes: [] };
  }
  const operator = index.operators.get(route.operatorId);
  if (
    operator === undefined ||
    route.provider !== service.provider ||
    operator.provider !== service.provider ||
    calendar.provider !== service.provider
  ) {
    return { kind: "error", reason: "broken_graph_reference", notes: [] };
  }
  const mode = mapMode(route.mode);
  if (mode === null) {
    return { kind: "error", reason: "unsupported_route_mode", notes: [] };
  }
  const facts = index.factsByService.get(service.id) ?? [];
  const factsError = validateFacts(graph, index, service, route, facts);
  if (factsError !== null) {
    return { kind: "error", reason: factsError, notes: [] };
  }

  let calendarEvaluation: GtfsServiceDateEvaluation;
  try {
    calendarEvaluation = isGtfsServiceActiveOnDate(calendar, serviceDate);
  } catch {
    return { kind: "error", reason: "invalid_service_date", notes: [] };
  }
  return {
    service,
    calendar,
    calendarEvaluation,
    route,
    operator,
    facts,
    mode,
    routeName: routeName(route),
  };
}

function directPair(
  candidate: ValidatedService,
  originStopId: string,
  destinationStopId: string,
  earliestDepartureServiceSeconds: number,
): CandidateOutcome {
  const originFacts = candidate.facts.filter(
    (fact) => fact.stopId === originStopId,
  );
  const destinationFacts = candidate.facts.filter(
    (fact) => fact.stopId === destinationStopId,
  );
  if (originFacts.length === 0) return noMatch("origin_stop_absent");
  if (destinationFacts.length === 0) return noMatch("destination_stop_absent");

  const orderedPairs = originFacts.flatMap((origin) =>
    destinationFacts
      .filter((destination) => origin.order < destination.order)
      .map((destination) => ({ origin, destination })),
  );
  if (orderedPairs.length === 0) return noMatch("destination_before_origin");
  if (orderedPairs.length > 1) {
    return inconclusive("ambiguous_stop_pair", [
      `ordered_pairs:${orderedPairs.length}`,
    ]);
  }

  const pair = orderedPairs[0];
  if (pair === undefined) return noMatch("no_direct_service");

  const pickup = endpointRequirement(pair.origin.sourceSemantics.pickupType);
  if (pickup === "prohibited") return inconclusive("pickup_prohibited");
  if (pickup === "unsupported") {
    return inconclusive("unsupported_pickup_dropoff");
  }
  const dropoff = endpointRequirement(
    pair.destination.sourceSemantics.dropOffType,
  );
  if (dropoff === "prohibited") return inconclusive("dropoff_prohibited");
  if (dropoff === "unsupported") {
    return inconclusive("unsupported_pickup_dropoff");
  }

  if (pair.origin.departureServiceSeconds === null) {
    return noMatch("missing_origin_departure");
  }
  if (pair.destination.arrivalServiceSeconds === null) {
    return noMatch("missing_destination_arrival");
  }
  const departureSeconds = pair.origin.departureServiceSeconds;
  const arrivalSeconds = pair.destination.arrivalServiceSeconds;
  const durationSeconds = arrivalSeconds - departureSeconds;
  if (durationSeconds <= 0) return inconclusive("chronology_invalid");
  if (departureSeconds < earliestDepartureServiceSeconds) {
    return noMatch("departure_window_miss");
  }

  return {
    kind: "valid",
    pair: {
      origin: pair.origin,
      destination: pair.destination,
      departureSeconds,
      arrivalSeconds,
      durationSeconds,
      boardingRequiresArrangement: pickup === "requires_arrangement",
      alightingRequiresArrangement: dropoff === "requires_arrangement",
    },
  };
}

function makeJourney(
  candidate: ValidatedService,
  pair: ValidPair,
  index: IndexedGraph,
  graph: NormalizedTransitGraph,
): { readonly journey: Journey; readonly evidence: ScheduledJourneyEvidence } {
  const origin = stopEndpoint(
    // The pair's stop ids were checked against this index before this function.
    index.stops.get(pair.origin.stopId)!,
  );
  const destination = stopEndpoint(index.stops.get(pair.destination.stopId)!);
  const checkedAt = graph.datasetVersion.checkedAt;
  const provenance: JourneyProvenance = {
    source: GTFS_DIRECT_JOURNEY_SOURCE,
    confidence: "high",
    duration: "verified",
    cost: "unknown",
    checkedAt,
  };
  const duration = {
    minutes: [pair.durationSeconds / 60, pair.durationSeconds / 60] as const,
    evidence: "verified" as const,
    source: GTFS_DIRECT_JOURNEY_SOURCE,
    checkedAt,
  };
  const journey: Journey = {
    kind: "journey",
    origin,
    destination,
    scope: "complete_journey",
    directionality: "one_way",
    completeness: "complete",
    externalHandoff: journeyHandoffCapabilityForMode(
      candidate.mode,
      "complete",
      "available",
    ),
    legs: [
      {
        mode: candidate.mode,
        direction: "one_way",
        origin,
        destination,
        duration,
        cost: unknownSafeCost(),
        availability: "available",
        confidence: "high",
        provenance,
        routeMetadata: {
          source: GTFS_DIRECT_JOURNEY_SOURCE,
          serviceName: candidate.routeName ?? undefined,
          operator: candidate.operator.providerOperatorId,
          reservationRequired:
            pair.boardingRequiresArrangement ||
            pair.alightingRequiresArrangement,
        },
      },
    ],
    availability: "available",
    confidence: "high",
    provenance,
  };
  const evidence: ScheduledJourneyEvidence = {
    source: GTFS_DIRECT_JOURNEY_SOURCE,
    provider: candidate.service.provider,
    serviceDate: candidate.calendarEvaluation.date,
    calendarReason: candidate.calendarEvaluation.reason,
    calendarId: candidate.calendar.id,
    providerCalendarId: candidate.calendar.providerCalendarId,
    serviceId: candidate.service.id,
    providerServiceId: candidate.service.providerServiceId,
    routeId: candidate.route.id,
    providerRouteId: candidate.route.providerRouteId,
    patternId: candidate.service.patternId,
    operatorId: candidate.operator.id,
    providerOperatorId: candidate.operator.providerOperatorId,
    routeName: candidate.routeName,
    scheduledDepartureServiceSeconds: pair.departureSeconds,
    scheduledArrivalServiceSeconds: pair.arrivalSeconds,
    durationServiceSeconds: pair.durationSeconds,
    scheduledDepartureTime: formatServiceSeconds(pair.departureSeconds),
    scheduledArrivalTime: formatServiceSeconds(pair.arrivalSeconds),
    transferCount: 0,
    coverageState: "imported",
    topologyCoverageState: "imported",
    datasetId: graph.datasetVersion.datasetId,
    contentHash: graph.datasetVersion.contentHash,
    sourceType: graph.datasetVersion.sourceType,
    completeness: graph.datasetVersion.completeness,
    retrievedAt: graph.datasetVersion.retrievedAt,
    checkedAt,
    boardingRequiresArrangement: pair.boardingRequiresArrangement,
    alightingRequiresArrangement: pair.alightingRequiresArrangement,
  };
  return { journey, evidence };
}

function aggregateNoMatch(
  outcomes: readonly CandidateOutcome[],
  sawInactive: boolean,
): ScheduledJourneyRouteResult {
  const firstInconclusive = outcomes.find(
    (outcome) => outcome.kind === "inconclusive",
  );
  if (firstInconclusive?.kind === "inconclusive") {
    return inconclusive(firstInconclusive.reason, firstInconclusive.notes);
  }
  const priority: readonly ScheduledJourneyNoMatchReason[] = [
    "missing_origin_departure",
    "missing_destination_arrival",
    "departure_window_miss",
    "destination_before_origin",
    "origin_stop_absent",
    "destination_stop_absent",
    "inactive_service",
    "no_direct_service",
  ];
  for (const reason of priority) {
    const outcome = outcomes.find(
      (candidate) =>
        candidate.kind === "no_match" && candidate.reason === reason,
    );
    if (outcome?.kind === "no_match") {
      return noMatch(outcome.reason, outcome.notes);
    }
  }
  return noMatch(sawInactive ? "inactive_service" : "no_direct_service");
}

/**
 * Select the earliest-arriving direct scheduled service at or after the
 * requested service-day threshold. Ties use earlier departure, then the exact
 * provider trip id, so graph/input ordering cannot affect the answer.
 */
export function routeDirectScheduledJourney(
  input: RouteDirectScheduledJourneyInput,
): ScheduledJourneyRouteResult {
  if (!isRealGtfsServiceDate(input.serviceDate)) {
    return inconclusive("invalid_service_date");
  }
  if (
    !Number.isSafeInteger(input.earliestDepartureServiceSeconds) ||
    input.earliestDepartureServiceSeconds < 0
  ) {
    return inconclusive("invalid_earliest_departure");
  }
  if (input.originStopId === input.destinationStopId) {
    return noMatch("origin_equals_destination");
  }

  const provider: TransitProvider = input.graph.datasetVersion.provider;
  if (provider !== "gtfs" && provider !== "gtfs-jp") {
    return inconclusive("unsupported_coverage");
  }
  if (
    input.graph.scheduledServices === undefined ||
    input.graph.scheduledStopTimes === undefined ||
    input.graph.scheduledServices.length === 0 ||
    input.graph.scheduledStopTimes.length === 0
  ) {
    return inconclusive("unsupported_coverage");
  }

  const datasetCoverage = datasetCoverageReason(input.graph, input.coverage);
  if (datasetCoverage !== null) return inconclusive(datasetCoverage);

  let index: IndexedGraph | null;
  try {
    index = buildIndex(input.graph);
  } catch {
    index = null;
  }
  if (index === null) return inconclusive("broken_graph_reference");
  if (!index.stops.has(input.originStopId)) {
    return noMatch("origin_stop_absent");
  }
  if (!index.stops.has(input.destinationStopId)) {
    return noMatch("destination_stop_absent");
  }

  const originServices = index.serviceIdsByStop.get(input.originStopId);
  const destinationServices = index.serviceIdsByStop.get(
    input.destinationStopId,
  );
  if (originServices === undefined || originServices.size === 0) {
    return noMatch("origin_stop_absent");
  }
  if (destinationServices === undefined || destinationServices.size === 0) {
    return noMatch("destination_stop_absent");
  }
  const serviceIds = [...originServices]
    .filter((serviceId) => destinationServices.has(serviceId))
    .sort(lexical);
  if (serviceIds.length === 0) {
    return noMatch("no_direct_service");
  }

  const outcomes: CandidateOutcome[] = [];
  const valid: Array<{
    readonly candidate: ValidatedService;
    readonly pair: ValidPair;
  }> = [];
  let sawInactive = false;
  for (const serviceId of serviceIds) {
    const service = index.services.get(serviceId);
    if (service === undefined) {
      return inconclusive("broken_graph_reference");
    }
    const candidate = validateService(
      input.graph,
      index,
      service,
      input.serviceDate,
    );
    if ("kind" in candidate) {
      return inconclusive(candidate.reason, candidate.notes);
    }
    if (!candidate.calendarEvaluation.active) {
      sawInactive = true;
      continue;
    }
    const outcome = directPair(
      candidate,
      input.originStopId,
      input.destinationStopId,
      input.earliestDepartureServiceSeconds,
    );
    outcomes.push(outcome);
    if (outcome.kind === "valid") {
      const coverage = coverageReason(
        input.graph,
        input.coverage,
        candidate.route,
        candidate.operator,
        index,
      );
      if (coverage !== null) return inconclusive(coverage);
      valid.push({ candidate, pair: outcome.pair });
    }
  }

  if (valid.length === 0) return aggregateNoMatch(outcomes, sawInactive);
  valid.sort(
    (left, right) =>
      left.pair.arrivalSeconds - right.pair.arrivalSeconds ||
      left.pair.departureSeconds - right.pair.departureSeconds ||
      lexical(
        left.candidate.service.providerServiceId,
        right.candidate.service.providerServiceId,
      ),
  );
  const selected = valid[0];
  if (selected === undefined) return noMatch("no_direct_service");
  const result = makeJourney(
    selected.candidate,
    selected.pair,
    index,
    input.graph,
  );
  return {
    kind: "verified",
    journey: result.journey,
    evidence: result.evidence,
    durationSeconds: selected.pair.durationSeconds,
  };
}
