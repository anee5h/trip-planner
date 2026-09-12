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
