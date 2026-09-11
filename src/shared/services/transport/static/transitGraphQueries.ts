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
  TransitStop,
} from "./transitGraphTypes";

/** Stop by internal id (`odpt:station:…`), or null. */
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
 * Stops of a route in provider order. Empty when the route is unknown or
 * carries no ordered memberships.
 */
export function getOrderedStopsForRoute(
  graph: NormalizedTransitGraph,
  routeId: string,
): TransitStop[] {
  const memberships = graph.routeStops
    .filter((membership) => membership.routeId === routeId)
    .sort((a, b) => a.order - b.order);
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
