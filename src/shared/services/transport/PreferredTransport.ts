import type { Destination } from "@/shared/types/destination";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";

export interface PreferredTransport {
  mode: string;
  timeRange: [number, number];
  estimatedBudget: number;
}

/**
 * Finds the shortest door-to-door journey among the travel methods a visitor
 * has enabled. The returned budget always belongs to that same transport mode.
 */
export function getFastestPreferredTransport(
  destination: Destination,
  carMode?: string,
  publicModes?: string[],
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
): PreferredTransport | null {
  const candidates = getValidModes(
    destination,
    carMode ?? "none",
    publicModes ?? [],
    homeCoords,
  )
    .map((mode) => {
      const timeRange =
        mode === "flight"
          ? getFlightTransportEstimate(destination, homeCoords)?.timeRange
          : (() => {
              const minutes =
                destination.transportOptions?.[
                  mode as keyof typeof destination.transportOptions
                ];
              return minutes === undefined
                ? undefined
                : ([minutes, minutes] as [number, number]);
            })();

      if (!timeRange) return null;
      return {
        mode,
        timeRange,
        estimatedBudget: getAdjustedBudget(
          destination,
          mode,
          partySize,
          homeCoords,
        ),
      };
    })
    .filter((candidate): candidate is PreferredTransport => candidate !== null);

  if (candidates.length === 0) return null;

  return candidates.reduce((fastest, candidate) =>
    candidate.timeRange[0] < fastest.timeRange[0] ? candidate : fastest,
  );
}
