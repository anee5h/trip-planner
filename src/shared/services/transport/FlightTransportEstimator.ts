import airportsData from "../../data/airports.json";
import flightRoutesData from "../../data/flight-estimates.json";
import { TRANSPORT_CONFIG } from "../../config/transportConfig";
import type { Destination } from "../../types/destination";
import type { TransportZoneId } from "../../types/transportTopology";
import { getBestEstimateBetween, getDistanceKm } from "./TransportEstimator";
import {
  getAirportZone,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "./TransportTopologyService";
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
/**
 * Maximum distance from an origin to a candidate departure airport. Beyond
 * this the airport is not the origin's gateway: island origins without a
 * local airport must not gain a flight via a far-away airport fallback.
 */
const ORIGIN_AIRPORT_CATCHMENT_KM = 250;

export function findNearestAirports(
  coords: { lat: number; lng: number },
  limit: number = TRANSPORT_CONFIG.candidateAirportLimit,
  zoneFilter?: TransportZoneId,
): Airport[] {
  const cacheKey = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}:${limit}:${zoneFilter ?? "any"}`;
  if (candidateCache.has(cacheKey)) {
    return candidateCache.get(cacheKey)!;
  }

  // The zone filter is applied BEFORE the limit: an out-of-zone airport must
  // never consume a candidate slot and push an in-zone airport out (KAI-63
  // D7b), or the origin's own gateway would silently disappear.
  const withinCatchment = airports
    .filter(
      (airport) => !zoneFilter || getAirportZone(airport.code) === zoneFilter,
    )
    .map((airport) => ({
      airport,
      distanceKm: getDistanceKm(
        coords.lat,
        coords.lng,
        airport.coordinates.lat,
        airport.coordinates.lng,
      ),
    }))
    .filter((candidate) => candidate.distanceKm <= ORIGIN_AIRPORT_CATCHMENT_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const result = withinCatchment.slice(0, limit).map((c) => c.airport);
  candidateCache.set(cacheKey, result);
  return result;
}

/**
 * Finds the destination's primary arrival airport.
 *
 * Among airports within the 250 km catchment, the nearest airport whose
 * transport zone matches the destination's resolved zone is preferred
 * (KAI-63 D7a): the globally nearest airport may sit in a neighbouring zone
 * (e.g. Fukuoka for northern Yamaguchi, or Naha for the Amami islands), and
 * arriving there would require an unmodelled cross-zone access leg. When no
 * in-zone airport is within the catchment, no arrival airport exists.
 */
export function findArrivalAirport(dest: Destination): Airport | null {
  if (!dest.coordinates) return null;

  const destinationZoneId = resolveDestinationTransportZone(dest);

  const withinCatchment = [...airports]
    .map((airport) => ({
      airport,
      distanceKm: getDistanceKm(
        dest.coordinates!.lat,
        dest.coordinates!.lng,
        airport.coordinates.lat,
        airport.coordinates.lng,
      ),
    }))
    .filter((candidate) => candidate.distanceKm <= 250)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (destinationZoneId !== "unknown") {
    const inZone = withinCatchment.find(
      (candidate) =>
        getAirportZone(candidate.airport.code) === destinationZoneId,
    );
    if (inZone) return inZone.airport;
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
 * True when the route operates on the given date. Without a travel date the
 * route is evaluated conservatively: a seasonal route is treated as
 * unavailable (same policy as ferry operating periods). Absent
 * operatingPeriods means year-round.
 */
export function isFlightRouteOperating(
  route: FlightRoute,
  travelDate?: Date,
): boolean {
  // Year-round route: operating regardless of whether a date is supplied.
  if (!route.operatingPeriods?.length) return true;
  // Seasonal route with no travel date: conservatively unavailable. A
  // seasonal route must never be presented as available just because no
  // date is known (KAI-12: unknown stays unknown; no-date ≠ year-round).
  if (!travelDate) return false;
  const mm = String(travelDate.getMonth() + 1).padStart(2, "0");
  const dd = String(travelDate.getDate()).padStart(2, "0");
  const md = `${mm}-${dd}`;
  return route.operatingPeriods.some(({ from, to }) => {
    if (from <= to) return md >= from && md <= to;
    // Wraps a year boundary, e.g. 12-20 → 01-05.
    return md >= from || md <= to;
  });
}

/**
 * Calculates door-to-door flight estimate for a destination.
 */
export function getFlightTransportEstimate(
  dest: Destination,
  homeCoords: { lat: number; lng: number } = DEFAULT_TOKYO_COORDS,
  travelDate?: Date,
): TransportEstimate | null {
  if (!dest.coordinates) return null;

  const arrAirport = findArrivalAirport(dest);
  if (!arrAirport) {
    return null;
  }

  // Destination access must use an airport in the destination's transport
  // zone. An airport in another zone (e.g. Takamatsu for Naoshima) would
  // require an explicitly modelled ferry access leg; without one the flight
  // is not a complete route.
  const destinationZoneId = resolveDestinationTransportZone(dest);
  const arrivalZoneId = getAirportZone(arrAirport.code);
  if (
    destinationZoneId === "unknown" ||
    !arrivalZoneId ||
    arrivalZoneId !== destinationZoneId
  ) {
    return null;
  }

  // Origin access must use an airport in the origin's transport zone. A
  // departure airport in another zone (e.g. Osaka for Naoshima) would
  // require a modelled access leg; without one the generic straight-line
  // origin access would cross water. The zone filter is applied inside
  // findNearestAirports BEFORE the candidate limit, so out-of-zone airports
  // cannot consume slots and drop the origin's own in-zone gateway (KAI-63
  // D7b: from Fukuoka, Tsushima must not crowd out Kagoshima).
  const originZoneId = resolveOriginTransportZone({ coordinates: homeCoords });
  const candidateDepAirports =
    originZoneId === "unknown"
      ? []
      : findNearestAirports(
          homeCoords,
          TRANSPORT_CONFIG.candidateAirportLimit,
          originZoneId,
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
    costUnavailable: boolean;
  } | null = null;

  for (const depAirport of candidateDepAirports) {
    if (depAirport.code === arrAirport.code) continue; // Same airport

    const route = getFlightRoute(depAirport.code, arrAirport.code);
    if (!route) continue;
    if (!isFlightRouteOperating(route, travelDate)) continue;

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

    // No verified fare: never fabricate a flight cost. Access-leg costs are
    // not a flight price either, so the total cost is marked unavailable.
    const costUnavailable = route.fare === null;
    const minCost = costUnavailable
      ? 0
      : originAccess.costRange[0] + route.fare![0] + destAccess.costRange[0];
    const maxCost = costUnavailable
      ? 0
      : originAccess.costRange[1] + route.fare![1] + destAccess.costRange[1];

    if (!bestOption || minTime < bestOption.totalTimeRange[0]) {
      bestOption = {
        depAirport,
        route,
        originAccess,
        destAccess,
        totalTimeRange: [minTime, maxTime],
        totalCostRange: [minCost, maxCost],
        costUnavailable,
      };
    }
  }

  if (!bestOption) {
    return null;
  }

  // Route existence and zone gateway already proved connectivity. Distance
  // is used only after connectivity: to compare door-to-door times for the
  // `recommended` flag, never to authorize or suppress the route.
  const groundEstimate = getBestEstimateBetween(homeLoc, destLoc);

  return {
    mode: "flight",
    label: "Flight",
    available: true,
    recommended: bestOption.totalTimeRange[0] < groundEstimate.timeRange[0],
    timeRange: bestOption.totalTimeRange,
    costUnavailable: bestOption.costUnavailable,
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
