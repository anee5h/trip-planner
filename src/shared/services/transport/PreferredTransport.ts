import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "./types";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  getOriginAwareTransportEstimate,
  type TravelDurationEvidence,
} from "./OriginAwareTransportService";

export interface PreferredTransport {
  mode: string;
  timeRange: [number, number];
  estimatedBudget: number | null;
  /** Canonical traveller-facing range for this selected mode. */
  estimatedBudgetRange: [number, number] | null;
  evidence: TravelDurationEvidence;
  corridorEvidence?: "verified";
}

/**
 * Finds the fastest canonical origin-aware journey among the travel methods a
 * visitor has enabled. Catchment access remains bounded/estimated, and the
 * returned budget always belongs to that same transport mode. Eligibility is
 * topology/route-authorized; cards never display unprovenanced
 * `transportOptions` times as personalized claims.
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

  const estimateResult = calculateTripEstimate({
    dest: destination,
    mode: estimate.mode,
    partySize,
    homeCoords,
    duration: "fullDay",
    ferryTemporal,
  });
  const estimatedBudgetRange = estimateResult.total
    ? ([estimateResult.total.min, estimateResult.total.max] as [number, number])
    : null;

  return {
    mode: estimate.mode,
    timeRange: estimate.timeRange,
    evidence: estimate.evidence,
    corridorEvidence: estimate.corridorEvidence,
    estimatedBudgetRange,
    // Compatibility ceiling only; new callers must use estimatedBudgetRange.
    estimatedBudget: estimatedBudgetRange?.[1] ?? null,
  };
}
