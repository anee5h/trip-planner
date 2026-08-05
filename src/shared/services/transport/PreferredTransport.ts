import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "./types";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";
import { getFerryTransportEstimate } from "./FerryTransportEstimator";

export interface PreferredTransport {
  mode: string;
  timeRange: [number, number];
  estimatedBudget: number;
}

/**
 * Finds the shortest door-to-door journey among the travel methods a visitor
 * has enabled. The returned budget always belongs to that same transport
 * mode, and eligibility is topology/route-authorized — an unauthorized Train
 * is never chosen as a fallback.
 */
export function getFastestPreferredTransport(
  destination: Destination,
  carMode?: string,
  publicModes?: string[],
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  originZoneId?: TransportZoneId,
  ferryTemporal?: FerryTemporalContext,
): PreferredTransport | null {
  const candidates = getValidModes(
    destination,
    carMode ?? "none",
    publicModes ?? [],
    homeCoords,
    undefined,
    originZoneId,
    ferryTemporal,
  )
    .map((mode) => {
      const timeRange =
        mode === "flight"
          ? getFlightTransportEstimate(destination, homeCoords)?.timeRange
          : mode === "ferry"
            ? getFerryTransportEstimate(destination, homeCoords, ferryTemporal)
                ?.timeRange
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
          originZoneId,
          ferryTemporal,
        ),
      };
    })
    .filter((candidate): candidate is PreferredTransport => candidate !== null);

  if (candidates.length === 0) return null;

  return candidates.reduce((fastest, candidate) =>
    candidate.timeRange[0] < fastest.timeRange[0] ? candidate : fastest,
  );
}
