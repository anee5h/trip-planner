import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "./types";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getOriginAwareTransportEstimate } from "./OriginAwareTransportService";

export interface PreferredTransport {
  mode: string;
  timeRange: [number, number];
  estimatedBudget: number;
}

/**
 * Finds the fastest verified origin-aware journey among the travel methods a
 * visitor has enabled. The returned budget always belongs to that same
 * transport mode, and eligibility is topology/route-authorized. Without a
 * verified origin-aware duration the candidate is not returned — cards never
 * display unprovenanced `transportOptions` times as personalized claims.
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
  const modes = getValidModes(
    destination,
    carMode ?? "none",
    publicModes ?? [],
    homeCoords,
    undefined,
    originZoneId,
    ferryTemporal,
  );
  const estimate = getOriginAwareTransportEstimate(
    destination,
    { homeStationCoords: homeCoords, ferryTemporal },
    modes,
  );
  if (!estimate) return null;

  return {
    mode: estimate.mode,
    timeRange: estimate.timeRange,
    estimatedBudget: getAdjustedBudget(
      destination,
      estimate.mode,
      partySize,
      homeCoords,
      originZoneId,
      ferryTemporal,
    ),
  };
}
