import type { Destination } from "@/shared/types/destination";
import {
  calculateTripEstimate,
  type TripEstimateResult,
} from "@/shared/services/budget/tripEstimateEngine";
import { resolveCarRouteForDestination } from "@/shared/services/transport/CarRouteProvider";
import type { TripDuration } from "@/shared/types/tripDuration";
import type { RecommendationContext } from "./RecommendationContext";

/**
 * Canonical per-mode cost evidence for one recommendation candidate.
 * Consumers reuse these facts but keep eligibility, scoring, explanation, and
 * card-display policies separate.
 */
export type RecommendationBudgetEvidence = ReadonlyMap<
  string,
  TripEstimateResult
>;

export function calculateRecommendationBudgetEvidence(
  destination: Destination,
  context: RecommendationContext,
  modes: readonly string[],
  duration: TripDuration = context.tripDuration ?? "any",
): RecommendationBudgetEvidence {
  const evidence = new Map<string, TripEstimateResult>();
  for (const mode of modes) {
    evidence.set(
      mode,
      calculateRecommendationBudgetEstimate(
        destination,
        context,
        mode,
        duration,
      ),
    );
  }
  return evidence;
}

/** Build one normalized per-mode estimate when a consumer has no shared map. */
export function calculateRecommendationBudgetEstimate(
  destination: Destination,
  context: RecommendationContext,
  mode: string,
  duration: TripDuration = context.tripDuration ?? "any",
): TripEstimateResult {
  const homeCoords = context.homeStationCoords ?? undefined;
  return calculateTripEstimate({
    dest: destination,
    mode,
    partySize: context.partySize,
    homeCoords,
    includeOriginTravel: Boolean(homeCoords),
    duration,
    // Preserve the explicit caller tier; the engine owns its existing
    // default when absent. Never infer profile tier from the numeric cap.
    budgetTier: context.budgetTier,
    ferryTemporal: context.ferryTemporal,
    carRoute: resolveCarRouteForDestination(destination, context),
    carCostOptions: context.carCostOptions,
  });
}
