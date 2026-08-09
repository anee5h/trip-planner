import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  getSafeGroundEstimate,
  type SafeGroundEstimateContext,
} from "@/shared/services/transport/SafeGroundEstimateService";
import type { TravelDurationEstimate } from "@/shared/services/transport/OriginAwareTransportService";

export type LocalDisplayEstimate = Extract<
  TravelDurationEstimate,
  { evidence: "estimated" }
>;

export interface LocalDisplayEstimateContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  homeStationTransportZoneId?: TransportZoneId;
  carMode?: string;
  publicModes?: string[];
  allDestinations?: readonly Destination[];
}

/**
 * Presentation-only adapter for the shared bounded ground estimator. Mode
 * authorization remains canonical; only the duration is approximate. The
 * recommendation feasibility service calls the same lower-level estimator.
 */
export function getSafeDisplayEstimate(
  destination: Destination,
  context: LocalDisplayEstimateContext,
): LocalDisplayEstimate | null {
  const { homeStationCoords, homeStationTransportZoneId } = context;
  if (!homeStationCoords) return null;

  const authorizedModes = getValidModes(
    destination,
    context.carMode ?? "none",
    context.publicModes ?? ["train", "shinkansen", "bus", "flight", "ferry"],
    homeStationCoords,
    undefined,
    homeStationTransportZoneId,
  );

  const safeContext: SafeGroundEstimateContext = {
    homeStationCoords,
    homeStationTransportZoneId,
    authorizedModes,
    allDestinations: context.allDestinations,
  };
  return getSafeGroundEstimate(destination, safeContext);
}

// Backward-compat alias
export { getSafeDisplayEstimate as getLocalDiscoveryDisplayEstimate };
