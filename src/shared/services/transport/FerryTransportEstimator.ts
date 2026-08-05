import ferryData from "../../data/ferry-estimates.json";
import { getBestEstimateBetween, getDistanceKm } from "./TransportEstimator";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "./TransportTopologyService";
import type { Destination } from "../../types/destination";
import type {
  FerryPort,
  FerryRoute,
  Location,
  TransportEstimate,
} from "./types";

const ports: FerryPort[] = ferryData.ports;
// JSON arrays are inferred as number[], cast to tuple explicitly.
const routes: FerryRoute[] = (
  ferryData.routes as Array<{
    fromPort: string;
    toPort: string;
    operator: string;
    passengerService: boolean;
    durationMinutes: [number, number];
    fare: [number, number] | null;
    fareStatus?: string;
    sourceUrl?: string;
    fareSourceUrl?: string;
    checkedAt?: string;
    notes?: string;
  }>
).map((r) => ({
  ...r,
  fare: r.fare as [number, number] | null,
})) as FerryRoute[];

/** Maximum km from an origin to a candidate departure port. */
const ORIGIN_PORT_CATCHMENT_KM = 300;

const portById = new Map<string, FerryPort>();
for (const p of ports) portById.set(p.id, p);

/**
 * Finds candidate departure ports within catchment of the origin.
 * Only returns ports in the same transport zone as the origin.
 */
export function findNearestFerryPort(
  coords: { lat: number; lng: number },
  originZoneId: string,
): FerryPort | null {
  let best: { port: FerryPort; distKm: number } | null = null;

  for (const port of ports) {
    if (port.zoneId !== originZoneId) continue;
    const distKm = getDistanceKm(
      coords.lat,
      coords.lng,
      port.coordinates.lat,
      port.coordinates.lng,
    );
    if (distKm > ORIGIN_PORT_CATCHMENT_KM) continue;
    if (!best || distKm < best.distKm) {
      best = { port, distKm };
    }
  }

  return best?.port ?? null;
}

/**
 * Finds the arrival port for a destination.
 * The arrival port must be in the destination's transport zone.
 */
export function findArrivalFerryPort(dest: Destination): FerryPort | null {
  if (!dest.coordinates) return null;
  const destinationZoneId = resolveDestinationTransportZone(dest);
  if (destinationZoneId === "unknown") return null;

  let best: { port: FerryPort; distKm: number } | null = null;

  for (const port of ports) {
    if (port.zoneId !== destinationZoneId) continue;
    const distKm = getDistanceKm(
      dest.coordinates.lat,
      dest.coordinates.lng,
      port.coordinates.lat,
      port.coordinates.lng,
    );
    if (!best || distKm < best.distKm) {
      best = { port, distKm };
    }
  }

  return best?.port ?? null;
}

/**
 * Bidirectional ferry route lookup.
 */
export function getFerryRoute(
  fromPortId: string,
  toPortId: string,
): FerryRoute | null {
  const match = routes.find(
    (r) =>
      r.passengerService === true &&
      ((r.fromPort === fromPortId && r.toPort === toPortId) ||
        (r.fromPort === toPortId && r.toPort === fromPortId)),
  );
  return match || null;
}

/**
 * Calculates door-to-door ferry estimate for a destination.
 * Returns null when no verified passenger ferry route connects the origin
 * and destination zones, or when duration/fare are both unavailable.
 */
export function getFerryTransportEstimate(
  dest: Destination,
  homeCoords?: { lat: number; lng: number },
): TransportEstimate | null {
  if (!dest.coordinates || !homeCoords) return null;

  // Resolve origin zone from coords
  const originZoneId = resolveOriginTransportZone({ coordinates: homeCoords });
  if (originZoneId === "unknown") return null;

  const destinationZoneId = resolveDestinationTransportZone(dest);
  if (destinationZoneId === "unknown") return null;

  // Same zone — no ferry needed
  if (originZoneId === destinationZoneId) return null;

  // Find arrival port in destination's zone
  const arrPort = findArrivalFerryPort(dest);
  if (!arrPort) return null;

  // Find the nearest departure port in the origin's zone
  const depPort = findNearestFerryPort(homeCoords, originZoneId);
  if (!depPort) return null;

  // Look up a verified passenger route between those ports
  const route = getFerryRoute(depPort.id, arrPort.id);
  if (!route) return null;

  // Must have at least duration to be selectable
  if (!route.durationMinutes) return null;

  const depLoc: Location = {
    name: depPort.name,
    coordinates: depPort.coordinates,
  };
  const arrLoc: Location = {
    name: arrPort.name,
    coordinates: arrPort.coordinates,
  };
  const homeLoc: Location = { coordinates: homeCoords };
  const destLoc: Location = {
    name: dest.name,
    coordinates: { lat: dest.coordinates.lat, lng: dest.coordinates.lng },
  };

  const originAccess = getBestEstimateBetween(homeLoc, depLoc);
  const destAccess = getBestEstimateBetween(arrLoc, destLoc);

  // Buffer for check-in, boarding, unloading: 30 min for ferries
  const FERRY_BUFFER_MINUTES = 30;

  const minTime =
    originAccess.timeRange[0] +
    FERRY_BUFFER_MINUTES +
    route.durationMinutes[0] +
    destAccess.timeRange[0];
  const maxTime =
    originAccess.timeRange[1] +
    FERRY_BUFFER_MINUTES +
    route.durationMinutes[1] +
    destAccess.timeRange[1];

  const costUnavailable = route.fare === null;
  const minCost = costUnavailable
    ? 0
    : originAccess.costRange[0] + route.fare![0] + destAccess.costRange[0];
  const maxCost = costUnavailable
    ? 0
    : originAccess.costRange[1] + route.fare![1] + destAccess.costRange[1];

  // Compare with ground (if any) for recommended flag
  const groundEstimate = getBestEstimateBetween(homeLoc, destLoc);

  return {
    mode: "ferry",
    label: "Ferry",
    available: true,
    recommended: minTime < groundEstimate.timeRange[0],
    timeRange: [minTime, maxTime],
    costUnavailable,
    costRange: [minCost, maxCost],
    source: "dataset",
    details: {
      departurePortName: depPort.name,
      arrivalPortName: arrPort.name,
      operator: route.operator,
      originAccessTimeRange: originAccess.timeRange,
      destAccessTimeRange: destAccess.timeRange,
      ferryNotes: route.notes,
    },
  };
}
