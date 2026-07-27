import airportsData from "../../data/airports.json";
import flightRoutesData from "../../data/flight-estimates.json";
import { TRANSPORT_CONFIG } from "../../config/transportConfig";
import type { Destination } from "../../types/destination";
import { getBestEstimateBetween, getDistanceKm } from "./TransportEstimator";
import type {
  Airport,
  FlightRoute,
  Location,
  TransportEstimate,
} from "./types";

const airports: Airport[] = airportsData.airports;
const routes: FlightRoute[] = flightRoutesData.routes as FlightRoute[];

// Lightweight in-memory cache for candidate airports by lat,lng
const candidateCache = new Map<string, Airport[]>();

/**
 * Finds nearest candidate departure airports based on geodesic distance.
 */
export function findNearestAirports(
  coords: { lat: number; lng: number },
  limit: number = TRANSPORT_CONFIG.candidateAirportLimit,
): Airport[] {
  const cacheKey = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}:${limit}`;
  if (candidateCache.has(cacheKey)) {
    return candidateCache.get(cacheKey)!;
  }

  const sorted = [...airports].sort((a, b) => {
    const distA = getDistanceKm(
      coords.lat,
      coords.lng,
      a.coordinates.lat,
      a.coordinates.lng,
    );
    const distB = getDistanceKm(
      coords.lat,
      coords.lng,
      b.coordinates.lat,
      b.coordinates.lng,
    );
    return distA - distB;
  });

  const result = sorted.slice(0, limit);
  candidateCache.set(cacheKey, result);
  return result;
}

/**
 * Finds the destination's primary arrival airport.
 */
export function findArrivalAirport(dest: Destination): Airport | null {
  if (!dest.coordinates) return null;

  const sorted = [...airports].sort((a, b) => {
    const distA = getDistanceKm(
      dest.coordinates!.lat,
      dest.coordinates!.lng,
      a.coordinates.lat,
      a.coordinates.lng,
    );
    const distB = getDistanceKm(
      dest.coordinates!.lat,
      dest.coordinates!.lng,
      b.coordinates.lat,
      b.coordinates.lng,
    );
    return distA - distB;
  });

  const nearest = sorted[0];
  const distanceKm = getDistanceKm(
    dest.coordinates.lat,
    dest.coordinates.lng,
    nearest.coordinates.lat,
    nearest.coordinates.lng,
  );

  // If destination is within 250 km of an airport, return it
  if (distanceKm <= 250) {
    return nearest;
  }

  return null;
}

/**
 * Bidirectional flight route lookup.
 */
export function getFlightRoute(
  fromCode: string,
  toCode: string,
): FlightRoute | null {
  const match = routes.find(
    (r) =>
      (r.from === fromCode && r.to === toCode) ||
      (r.from === toCode && r.to === fromCode),
  );
  return match || null;
}

const DEFAULT_TOKYO_COORDS = { lat: 35.6812, lng: 139.7671 };

/**
 * Calculates door-to-door flight estimate for a destination.
 */
export function getFlightTransportEstimate(
  dest: Destination,
  homeCoords: { lat: number; lng: number } = DEFAULT_TOKYO_COORDS,
): TransportEstimate | null {
  if (!dest.coordinates) return null;

  const arrAirport = findArrivalAirport(dest);
  if (!arrAirport) {
    return null;
  }

  const candidateDepAirports = findNearestAirports(
    homeCoords,
    TRANSPORT_CONFIG.candidateAirportLimit,
  );

  const homeLoc: Location = { coordinates: homeCoords };
  const destLoc: Location = {
    name: dest.name,
    coordinates: { lat: dest.coordinates.lat, lng: dest.coordinates.lng },
  };

  let bestOption: {
    depAirport: Airport;
    route: FlightRoute;
    originAccess: TransportEstimate;
    destAccess: TransportEstimate;
    totalTimeRange: [number, number];
    totalCostRange: [number, number];
  } | null = null;

  for (const depAirport of candidateDepAirports) {
    if (depAirport.code === arrAirport.code) continue; // Same airport

    const route = getFlightRoute(depAirport.code, arrAirport.code);
    if (!route) continue;

    const depLoc: Location = {
      name: depAirport.name,
      coordinates: depAirport.coordinates,
    };
    const arrLoc: Location = {
      name: arrAirport.name,
      coordinates: arrAirport.coordinates,
    };

    const originAccess = getBestEstimateBetween(homeLoc, depLoc);
    const destAccess = getBestEstimateBetween(arrLoc, destLoc);

    const minTime =
      originAccess.timeRange[0] +
      TRANSPORT_CONFIG.airportBufferMinutes +
      route.flightTime[0] +
      destAccess.timeRange[0];
    const maxTime =
      originAccess.timeRange[1] +
      TRANSPORT_CONFIG.airportBufferMinutes +
      route.flightTime[1] +
      destAccess.timeRange[1];

    const minCost =
      originAccess.costRange[0] + route.fare[0] + destAccess.costRange[0];
    const maxCost =
      originAccess.costRange[1] + route.fare[1] + destAccess.costRange[1];

    if (!bestOption || minTime < bestOption.totalTimeRange[0]) {
      bestOption = {
        depAirport,
        route,
        originAccess,
        destAccess,
        totalTimeRange: [minTime, maxTime],
        totalCostRange: [minCost, maxCost],
      };
    }
  }

  if (!bestOption) {
    return null;
  }

  // Filter out flight mode if train travel is short (< 240 min) AND destination is not air-primary/island
  const isIslandOrFar =
    dest.prefecture === "Okinawa" ||
    dest.prefecture === "Hokkaido" ||
    getDistanceKm(
      homeCoords.lat,
      homeCoords.lng,
      dest.coordinates.lat,
      dest.coordinates.lng,
    ) > 500;

  const groundEstimate = getBestEstimateBetween(homeLoc, destLoc);
  if (
    !isIslandOrFar &&
    groundEstimate.timeRange[0] < TRANSPORT_CONFIG.flightThresholdMinutes
  ) {
    return null;
  }

  return {
    mode: "flight",
    label: "Flight",
    available: true,
    recommended:
      isIslandOrFar ||
      bestOption.totalTimeRange[0] < groundEstimate.timeRange[0],
    timeRange: bestOption.totalTimeRange,
    costRange: bestOption.totalCostRange,
    source: "dataset",
    details: {
      departureAirportCode: bestOption.depAirport.code,
      departureAirportName: bestOption.depAirport.name,
      arrivalAirportCode: arrAirport.code,
      arrivalAirportName: arrAirport.name,
      originAccessTimeRange: bestOption.originAccess.timeRange,
      destAccessTimeRange: bestOption.destAccess.timeRange,
    },
  };
}
