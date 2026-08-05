import type { Destination } from "../../types/destination";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";
import { getFerryTransportEstimate } from "./FerryTransportEstimator";
import type {
  FerryTemporalContext,
  Location,
  TransportEstimate,
  TransportMode,
} from "./types";

export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates ground transportation between any two generic locations for a specific mode.
 */
export function estimateBetween(
  from: Location,
  to: Location,
  mode: TransportMode,
): TransportEstimate {
  const distanceKm = getDistanceKm(
    from.coordinates.lat,
    from.coordinates.lng,
    to.coordinates.lat,
    to.coordinates.lng,
  );

  let avgSpeedKmH = 75;
  let baseMinutes = 15;
  let costPerKm = 22;
  let baseCost = 400;
  let label = "Train";

  if (mode === "car" || mode === "my_car") {
    avgSpeedKmH = 65;
    baseMinutes = 10;
    costPerKm = 18;
    baseCost = 300;
    label = mode === "my_car" ? "Personal Car" : "Rental Car";
  } else if (mode === "bus") {
    avgSpeedKmH = 50;
    baseMinutes = 20;
    costPerKm = 12;
    baseCost = 200;
    label = "Highway Bus";
  } else if (mode === "shinkansen") {
    avgSpeedKmH = 180;
    baseMinutes = 25;
    costPerKm = 32;
    baseCost = 800;
    label = "Shinkansen";
  }

  const travelMinutes = Math.round(
    baseMinutes + (distanceKm / avgSpeedKmH) * 60,
  );
  const minMinutes = Math.max(10, Math.round(travelMinutes * 0.9));
  const maxMinutes = Math.max(minMinutes + 5, Math.round(travelMinutes * 1.15));

  const totalCost = Math.round(baseCost + distanceKm * costPerKm);
  const minCost = Math.max(200, Math.round(totalCost * 0.9));
  const maxCost = Math.max(minCost + 100, Math.round(totalCost * 1.2));

  return {
    mode,
    label,
    available: true,
    recommended: false,
    timeRange: [minMinutes, maxMinutes],
    costRange: [minCost, maxCost],
    source: "calculated",
  };
}

/**
 * Returns the best/recommended ground transport estimate between two locations.
 */
export function getBestEstimateBetween(
  from: Location,
  to: Location,
): TransportEstimate {
  const train = estimateBetween(from, to, "train");
  const car = estimateBetween(from, to, "car");

  // Prefer train if faster or equal
  if (train.timeRange[0] <= car.timeRange[0]) {
    return { ...train, recommended: true };
  }
  return { ...car, recommended: true };
}

const DEFAULT_TOKYO_STATION: Location = {
  name: "Tokyo Station",
  coordinates: { lat: 35.6812, lng: 139.7671 },
};

/**
 * Unified entry point returning all valid pre-sorted transport estimates for a destination.
 */
export function getTransportEstimates(
  destination: Destination,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): TransportEstimate[] {
  if (!destination.coordinates) {
    return [];
  }

  const homeLocation: Location = homeCoords
    ? { coordinates: homeCoords }
    : DEFAULT_TOKYO_STATION;

  const destLocation: Location = {
    name: destination.name,
    coordinates: {
      lat: destination.coordinates.lat,
      lng: destination.coordinates.lng,
    },
  };

  const results: TransportEstimate[] = [];

  // 1. Train / Ground estimate
  const trainEstimate = getBestEstimateBetween(homeLocation, destLocation);
  trainEstimate.recommended = true;
  results.push(trainEstimate);

  // 2. Car estimate
  const carEstimate = estimateBetween(homeLocation, destLocation, "car");
  results.push(carEstimate);

  // 3. Flight estimate (if applicable)
  const flightEstimate = getFlightTransportEstimate(
    destination,
    homeLocation.coordinates,
  );
  if (flightEstimate && flightEstimate.available) {
    results.push(flightEstimate);
  }

  // 4. Ferry estimate (if applicable)
  const ferryEstimate = getFerryTransportEstimate(
    destination,
    homeLocation.coordinates,
    ferryTemporal,
  );
  if (ferryEstimate && ferryEstimate.available) {
    results.push(ferryEstimate);
  }

  // Sort by minimum travel time
  results.sort((a, b) => a.timeRange[0] - b.timeRange[0]);

  return results;
}
