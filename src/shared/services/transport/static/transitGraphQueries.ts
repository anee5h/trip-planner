/**
 * KAI-291B1 — tiny static query contract over the normalized transit graph.
 *
 * Read-only lookups that prove the model is usable. Deliberately NOT routing:
 * no shortest path, no transfers, no timetable search, no departure selection,
 * no scoring. Those belong to KAI-292 or later KAI-291 slices.
 *
 * Pure functions only: no I/O, no clock.
 */

import type {
  NormalizedTransitGraph,
  TransitRoute,
  TransitScheduledService,
  TransitScheduledStopTime,
  TransitStop,
  TransitTransfer,
} from "./transitGraphTypes";
import {
  isGtfsServiceActiveOnDate,
  type GtfsServiceDateEvaluation,
} from "./gtfsScheduleImporter";

/** Stop by internal id (`provider:stop:namespace:providerId`), or null. */
export function getStop(
  graph: NormalizedTransitGraph,
  stopId: string,
): TransitStop | null {
  return graph.stops.find((stop) => stop.id === stopId) ?? null;
}

/** Route by internal id (`odpt:route:…`), or null. */
export function getRoute(
  graph: NormalizedTransitGraph,
  routeId: string,
): TransitRoute | null {
  return graph.routes.find((route) => route.id === routeId) ?? null;
}

/**
 * Stops of a route in provider order. A route with multiple provider patterns
 * returns no flattened answer; callers must select a pattern explicitly.
 */
export function getOrderedStopsForRoute(
  graph: NormalizedTransitGraph,
  routeId: string,
): TransitStop[] {
  const patterns = new Set(
    graph.routeStops
      .filter((membership) => membership.routeId === routeId)
      .map((membership) => membership.patternId ?? ""),
  );
  if (patterns.size !== 1) return [];
  return getOrderedStopsForRoutePattern(graph, routeId, [...patterns][0] ?? "");
}

/** Stops of one explicitly selected ordered route pattern. */
export function getOrderedStopsForRoutePattern(
  graph: NormalizedTransitGraph,
  routeId: string,
  patternId: string,
): TransitStop[] {
  const memberships = graph.routeStops
    .filter(
      (membership) =>
        membership.routeId === routeId &&
        (membership.patternId ?? "") === patternId,
    )
    .sort(
      (a, b) =>
        a.order - b.order ||
        (a.stopId < b.stopId ? -1 : a.stopId > b.stopId ? 1 : 0),
    );
  const byId = new Map(graph.stops.map((stop) => [stop.id, stop]));
  const out: TransitStop[] = [];
  for (const membership of memberships) {
    const stop = byId.get(membership.stopId);
    if (stop !== undefined) out.push(stop);
  }
  return out;
}

/** Routes serving a stop, sorted by internal id. Empty when unknown. */
export function getRoutesForStop(
  graph: NormalizedTransitGraph,
  stopId: string,
): TransitRoute[] {
  const routeIds = new Set(
    graph.routeStops
      .filter((membership) => membership.stopId === stopId)
      .map((membership) => membership.routeId),
  );
  return graph.routes
    .filter((route) => routeIds.has(route.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * True when both stops share at least one route — static route membership
 * only. This deliberately says NOTHING about scheduled direct service, and
 * must never be read as journey evidence (KAI-292 owns journey semantics).
 */
export function shareStaticRouteMembership(
  graph: NormalizedTransitGraph,
  stopAId: string,
  stopBId: string,
): boolean {
  if (stopAId === stopBId) return false;
  const routesA = new Set(
    graph.routeStops
      .filter((membership) => membership.stopId === stopAId)
      .map((membership) => membership.routeId),
  );
  if (routesA.size === 0) return false;
  return graph.routeStops.some(
    (membership) =>
      membership.stopId === stopBId && routesA.has(membership.routeId),
  );
}

function isStationStop(stop: TransitStop): boolean {
  const semantics = stop.sourceSemantics;
  return semantics !== undefined && semantics.locationType === 1
    ? true
    : stop.stopType === "station";
}

/** Apply the GTFS station rule to its exact normalized child stops. */
function transferStopMatches(
  graph: NormalizedTransitGraph,
  ruleStopId: string | null,
  queryStopId: string,
): boolean {
  // A linked-trip rule may omit its stop fields in current GTFS. That is
  // retained as evidence, but it cannot be safely matched to an arbitrary
  // caller-supplied stop pair without a later endpoint-resolution policy.
  if (ruleStopId === null) return false;
  if (ruleStopId === queryStopId) return true;
  const ruleStop = getStop(graph, ruleStopId);
  const queryStop = getStop(graph, queryStopId);
  if (ruleStop === null || queryStop === null) return false;
  if (
    ruleStop.provider !== queryStop.provider ||
    ruleStop.provenance.identityNamespace !==
      queryStop.provenance.identityNamespace
  ) {
    return false;
  }
  const querySemantics = queryStop.sourceSemantics;
  return (
    isStationStop(ruleStop) &&
    querySemantics !== undefined &&
    querySemantics.locationType === 0 &&
    querySemantics.parentStation === ruleStop.providerStopId
  );
}

function transferIdOrder(a: TransitTransfer, b: TransitTransfer): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Transfer evidence whose origin scope includes one exact normalized stop. */
export function getTransfersFromStop(
  graph: NormalizedTransitGraph,
  stopId: string,
): TransitTransfer[] {
  return graph.transfers
    .filter(
      (transfer) =>
        transfer.fromStopId !== null &&
        transferStopMatches(graph, transfer.fromStopId, stopId),
    )
    .sort(transferIdOrder);
}

/** All explicit rules whose stop scopes include this ordered stop pair. */
export function getTransfersBetweenStops(
  graph: NormalizedTransitGraph,
  fromStopId: string,
  toStopId: string,
): TransitTransfer[] {
  return graph.transfers
    .filter(
      (transfer) =>
        transfer.fromStopId !== null &&
        transfer.toStopId !== null &&
        transferStopMatches(graph, transfer.fromStopId, fromStopId) &&
        transferStopMatches(graph, transfer.toStopId, toStopId),
    )
    .sort(transferIdOrder);
}

export interface TransitTransferApplicabilityQuery {
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly incomingRouteId?: string;
  readonly outgoingRouteId?: string;
  readonly incomingServiceId?: string;
  readonly outgoingServiceId?: string;
}

export type ApplicableTransferInvalidQueryReason =
  | "unknown_from_stop"
  | "unknown_to_stop"
  | "unknown_incoming_route"
  | "unknown_outgoing_route"
  | "unknown_incoming_service"
  | "unknown_outgoing_service"
  | "service_route_mismatch";

export type ApplicableTransferResult =
  | {
      readonly status: "resolved";
      readonly transfers: readonly TransitTransfer[];
    }
  | {
      readonly status: "invalid_query";
      readonly reason: ApplicableTransferInvalidQueryReason;
    };

function transferSpecificity(transfer: TransitTransfer): number {
  const fromTrip = transfer.fromServiceId !== null;
  const toTrip = transfer.toServiceId !== null;
  const fromRoute = transfer.fromRouteId !== null;
  const toRoute = transfer.toRouteId !== null;
  if (fromTrip && toTrip) return 6;
  if ((fromTrip && toRoute) || (fromRoute && toTrip)) return 5;
  if (fromTrip || toTrip) return 4;
  if (fromRoute && toRoute) return 3;
  if (fromRoute || toRoute) return 2;
  return 1;
}

function transferSideApplies(
  scopedServiceId: string | null,
  scopedRouteId: string | null,
  queryServiceId: string | undefined,
  queryRouteId: string | undefined,
): boolean {
  if (scopedServiceId !== null) {
    return (
      queryServiceId === scopedServiceId &&
      (scopedRouteId === null ||
        queryRouteId === undefined ||
        queryRouteId === scopedRouteId)
    );
  }
  if (scopedRouteId !== null) return queryRouteId === scopedRouteId;
  return true;
}

function applicabilityQueryInvalidReason(
  graph: NormalizedTransitGraph,
  query: TransitTransferApplicabilityQuery,
): ApplicableTransferInvalidQueryReason | null {
  if (getStop(graph, query.fromStopId) === null) return "unknown_from_stop";
  if (getStop(graph, query.toStopId) === null) return "unknown_to_stop";

  const incomingService =
    query.incomingServiceId === undefined
      ? null
      : getScheduledService(graph, query.incomingServiceId);
  if (query.incomingServiceId !== undefined && incomingService === null) {
    return "unknown_incoming_service";
  }
  if (
    query.incomingRouteId !== undefined &&
    getRoute(graph, query.incomingRouteId) === null
  ) {
    return "unknown_incoming_route";
  }
  if (
    incomingService !== null &&
    query.incomingRouteId !== undefined &&
    incomingService.routeId !== query.incomingRouteId
  ) {
    return "service_route_mismatch";
  }

  const outgoingService =
    query.outgoingServiceId === undefined
      ? null
      : getScheduledService(graph, query.outgoingServiceId);
  if (query.outgoingServiceId !== undefined && outgoingService === null) {
    return "unknown_outgoing_service";
  }
  if (
    query.outgoingRouteId !== undefined &&
    getRoute(graph, query.outgoingRouteId) === null
  ) {
    return "unknown_outgoing_route";
  }
  if (
    outgoingService !== null &&
    query.outgoingRouteId !== undefined &&
    outgoingService.routeId !== query.outgoingRouteId
  ) {
    return "service_route_mismatch";
  }
  return null;
}

/**
 * Resolve the GTFS-maximal applicable rules for one incoming/outgoing pair.
 * A valid query with no explicit rule is distinct from an invalid query.
 * More than one result is deliberately preserved when the feed contains an
 * equally specific tie; callers must treat that as ambiguous/fail closed.
 */
export function resolveApplicableTransfers(
  graph: NormalizedTransitGraph,
  query: TransitTransferApplicabilityQuery,
): ApplicableTransferResult {
  const invalidReason = applicabilityQueryInvalidReason(graph, query);
  if (invalidReason !== null) {
    return { status: "invalid_query", reason: invalidReason };
  }

  const incomingService =
    query.incomingServiceId === undefined
      ? null
      : getScheduledService(graph, query.incomingServiceId);
  const outgoingService =
    query.outgoingServiceId === undefined
      ? null
      : getScheduledService(graph, query.outgoingServiceId);
  const incomingRouteId = query.incomingRouteId ?? incomingService?.routeId;
  const outgoingRouteId = query.outgoingRouteId ?? outgoingService?.routeId;
  const applicable = graph.transfers
    .filter(
      (transfer) =>
        transferStopMatches(graph, transfer.fromStopId, query.fromStopId) &&
        transferStopMatches(graph, transfer.toStopId, query.toStopId) &&
        transferSideApplies(
          transfer.fromServiceId,
          transfer.fromRouteId,
          query.incomingServiceId,
          incomingRouteId,
        ) &&
        transferSideApplies(
          transfer.toServiceId,
          transfer.toRouteId,
          query.outgoingServiceId,
          outgoingRouteId,
        ),
    )
    .sort(
      (a, b) =>
        transferSpecificity(b) - transferSpecificity(a) ||
        transferIdOrder(a, b),
    );
  const maximum = applicable[0];
  if (maximum === undefined) return { status: "resolved", transfers: [] };
  const specificity = transferSpecificity(maximum);
  return {
    status: "resolved",
    transfers: applicable.filter(
      (transfer) => transferSpecificity(transfer) === specificity,
    ),
  };
}

/** Backward-named alias with the same discriminated result contract. */
export function getApplicableTransfers(
  graph: NormalizedTransitGraph,
  query: TransitTransferApplicabilityQuery,
): ApplicableTransferResult {
  return resolveApplicableTransfers(graph, query);
}

/** Scheduled service by normalized service id, or null. */
export function getScheduledService(
  graph: NormalizedTransitGraph,
  serviceId: string,
): TransitScheduledService | null {
  return (
    graph.scheduledServices?.find((service) => service.id === serviceId) ?? null
  );
}

/** Scheduled stop facts for one service, in canonical pattern order. */
export function getScheduledStopTimesForService(
  graph: NormalizedTransitGraph,
  serviceId: string,
): TransitScheduledStopTime[] {
  return (graph.scheduledStopTimes ?? [])
    .filter((stopTime) => stopTime.serviceId === serviceId)
    .sort(
      (a, b) =>
        a.order - b.order ||
        (a.stopId < b.stopId ? -1 : a.stopId > b.stopId ? 1 : 0),
    );
}

/** Evaluate one scheduled service's GTFS calendar on a strict service date. */
export function isScheduledServiceActiveOnDate(
  graph: NormalizedTransitGraph,
  serviceId: string,
  date: string,
): GtfsServiceDateEvaluation | null {
  const service = getScheduledService(graph, serviceId);
  if (service === null) return null;
  const calendar =
    graph.calendars.find((candidate) => candidate.id === service.calendarId) ??
    null;
  if (calendar === null) return null;
  return isGtfsServiceActiveOnDate(calendar, date);
}

/** Services active on one route pattern and date; no route search is performed. */
export function getActiveScheduledServicesForRoutePattern(
  graph: NormalizedTransitGraph,
  routeId: string,
  patternId: string,
  date: string,
): TransitScheduledService[] {
  return (graph.scheduledServices ?? [])
    .filter(
      (service) =>
        service.routeId === routeId && service.patternId === patternId,
    )
    .filter(
      (service) =>
        isScheduledServiceActiveOnDate(graph, service.id, date)?.active ===
        true,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
