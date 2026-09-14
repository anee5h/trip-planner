import { contentHashOf } from "./odptRailTopologyImporter";
import { gtfsRouteStopsForSemanticHash } from "./gtfsTopologyImporter";
import type { NormalizedTransitGraph } from "./transitGraphTypes";

/** Compute the canonical scheduled-graph hash used by artifact validation. */
export function scheduledTransitContentHash(
  graph: Pick<
    NormalizedTransitGraph,
    | "operators"
    | "stops"
    | "routes"
    | "routeStops"
    | "calendars"
    | "scheduledServices"
    | "scheduledStopTimes"
    | "transfers"
  >,
): string {
  const gtfsRouteStops = graph.routes.every(
    (route) => route.provider === "gtfs" || route.provider === "gtfs-jp",
  );
  return contentHashOf({
    operators: graph.operators,
    stops: graph.stops,
    routes: graph.routes,
    routeStops: gtfsRouteStops
      ? gtfsRouteStopsForSemanticHash(graph.routeStops)
      : graph.routeStops,
    calendars: graph.calendars,
    scheduledServices: graph.scheduledServices,
    scheduledStopTimes: graph.scheduledStopTimes,
    transfers: graph.transfers,
  });
}
