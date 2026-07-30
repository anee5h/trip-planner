import type { Destination } from "@/shared/types/destination";
import type { CatchmentScope } from "./DayPlanGeneratorService";
import { getDistance } from "@/shared/utils/distance";

export interface TransitEstimationContext {
  curatedMinutes?: number;
  combinationMinutes?: number;
  areaDensity?: "dense_urban" | "suburban";
}

export interface TransitEstimateResult {
  usable: boolean;
  durationMinutes: number;
  source: "curated" | "combination" | "estimated";
  confidence: "verified" | "estimated";
  reason?: "outside_local_catchment" | "missing_coordinates";
}

export function hasCoordinates(
  destination: Destination,
): destination is Destination & {
  coordinates: { lat: number; lng: number };
} {
  return (
    Number.isFinite(destination.coordinates?.lat) &&
    Number.isFinite(destination.coordinates?.lng)
  );
}

export function estimateLocalTransitMinutes(
  from: Destination,
  to: Destination,
  scope: CatchmentScope = "nearby",
  context?: TransitEstimationContext,
): TransitEstimateResult {
  // 1. Same destination check
  if (from.id === to.id) {
    return {
      usable: true,
      durationMinutes: 0,
      source: "curated",
      confidence: "verified",
    };
  }

  const maxTransitMinutes = scope === "wider" ? 45 : 35;

  // 2. Curated precedence
  if (
    typeof context?.curatedMinutes === "number" &&
    context.curatedMinutes > 0
  ) {
    const rounded = Math.ceil(context.curatedMinutes / 5) * 5;
    if (rounded > maxTransitMinutes) {
      return {
        usable: false,
        durationMinutes: 0,
        source: "curated",
        confidence: "verified",
        reason: "outside_local_catchment",
      };
    }
    return {
      usable: true,
      durationMinutes: rounded,
      source: "curated",
      confidence: "verified",
    };
  }

  // 3. Combination precedence
  if (
    typeof context?.combinationMinutes === "number" &&
    context.combinationMinutes > 0
  ) {
    const rounded = Math.ceil(context.combinationMinutes / 5) * 5;
    if (rounded > maxTransitMinutes) {
      return {
        usable: false,
        durationMinutes: 0,
        source: "combination",
        confidence: "estimated",
        reason: "outside_local_catchment",
      };
    }
    return {
      usable: true,
      durationMinutes: rounded,
      source: "combination",
      confidence: "estimated",
    };
  }

  // 4. Coordinate validation
  if (!hasCoordinates(from) || !hasCoordinates(to)) {
    return {
      usable: false,
      durationMinutes: 0,
      source: "estimated",
      confidence: "estimated",
      reason: "missing_coordinates",
    };
  }

  // 4-parameter getDistance(lat1, lon1, lat2, lon2)
  const distKm = getDistance(
    from.coordinates.lat,
    from.coordinates.lng,
    to.coordinates.lat,
    to.coordinates.lng,
  );

  const maxRadiusKm =
    scope === "wider" ? 20 : context?.areaDensity === "suburban" ? 15 : 12;

  if (distKm > maxRadiusKm) {
    return {
      usable: false,
      durationMinutes: 0,
      source: "estimated",
      confidence: "estimated",
      reason: "outside_local_catchment",
    };
  }

  let estMins = 15;
  if (distKm <= 0.8) estMins = Math.max(8, Math.round(distKm * 12));
  else if (distKm <= 2.0) estMins = 15 + Math.round((distKm - 0.8) * 8);
  else if (distKm <= 5.0) estMins = 25 + Math.round((distKm - 2.0) * 4);
  else estMins = 35 + Math.round((distKm - 5.0) * 2);

  const durationMinutes = Math.ceil(estMins / 5) * 5;
  if (durationMinutes > maxTransitMinutes) {
    return {
      usable: false,
      durationMinutes: 0,
      source: "estimated",
      confidence: "estimated",
      reason: "outside_local_catchment",
    };
  }

  return {
    usable: true,
    durationMinutes,
    source: "estimated",
    confidence: "estimated",
  };
}
