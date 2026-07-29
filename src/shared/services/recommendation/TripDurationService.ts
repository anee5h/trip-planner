import type { Destination } from "@/shared/types/destination";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import type {
  RecommendationContext,
  TripDuration,
} from "./RecommendationContext";

export interface TripDurationEstimate {
  visitRangeHours: [number, number];
  totalRangeHours: [number, number];
  representativeHours: number;
  band: TripDuration;
  mode?: string;
}

function getBand(hours: number): TripDuration {
  if (hours < 5) return "halfDay";
  if (hours <= 12) return "dayTrip";
  return "weekend";
}

export function estimateTripDuration(
  destination: Destination,
  context: RecommendationContext,
  modes: string[],
): TripDurationEstimate | null {
  const visitRange: [number, number] = destination.recommendedVisitHours
    ? [
        destination.recommendedVisitHours.min,
        destination.recommendedVisitHours.max,
      ]
    : [destination.totalTripHours, destination.totalTripHours];

  if (!context.homeStationCoords) {
    const representativeHours = (visitRange[0] + visitRange[1]) / 2;
    return {
      visitRangeHours: visitRange,
      totalRangeHours: visitRange,
      representativeHours,
      band: getBand(representativeHours),
    };
  }

  let bestTravelMinutes: number | undefined;
  let bestMode: string | undefined;
  for (const mode of modes) {
    let minutes =
      destination.transportOptions?.[
        mode as keyof typeof destination.transportOptions
      ];
    if (mode === "flight") {
      const estimate = getFlightTransportEstimate(
        destination,
        context.homeStationCoords || undefined,
      );
      minutes = estimate
        ? (estimate.timeRange[0] + estimate.timeRange[1]) / 2
        : undefined;
    }
    if (
      minutes !== undefined &&
      (bestTravelMinutes === undefined || minutes < bestTravelMinutes)
    ) {
      bestTravelMinutes = minutes;
      bestMode = mode;
    }
  }

  if (bestTravelMinutes === undefined) return null;
  const bufferHours =
    ((destination.travelBuffers?.transferMinutes ?? 0) +
      (destination.travelBuffers?.ferryMinutes ?? 0)) /
    60;
  const travelHours = (bestTravelMinutes * 2) / 60 + bufferHours;
  const totalRangeHours: [number, number] = [
    visitRange[0] + travelHours,
    visitRange[1] + travelHours,
  ];
  const representativeHours = (totalRangeHours[0] + totalRangeHours[1]) / 2;

  return {
    visitRangeHours: visitRange,
    totalRangeHours,
    representativeHours,
    band: getBand(representativeHours),
    mode: bestMode,
  };
}

export function matchesTripDurationEstimate(
  estimate: TripDurationEstimate | null,
  requested: TripDuration = "any",
) {
  return (
    requested === "any" || (estimate !== null && estimate.band === requested)
  );
}
