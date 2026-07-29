import type { Destination } from "@/shared/types/destination";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import {
  getDistance,
  getDynamicTransportOptions,
} from "@/shared/utils/distance";
import {
  matchesTripDuration,
  type RecommendationContext,
} from "./RecommendationContext";
import { createRecommendationMatch } from "./RecommendationExplainability";
import {
  calculateConfidence,
  calculateScore,
  getValidModes,
} from "./RecommendationScorer";
import type { PipelineRecommendation } from "./RecommendationTypes";

export function buildRecommendationCandidate(
  destination: Destination,
  context: RecommendationContext,
): Destination {
  if (!context.homeStationCoords || !destination.coordinates) {
    return destination;
  }

  const distanceKm = getDistance(
    context.homeStationCoords.lat,
    context.homeStationCoords.lng,
    destination.coordinates.lat,
    destination.coordinates.lng,
  );
  const dynamicOptions = getDynamicTransportOptions(
    distanceKm,
    Boolean(destination.transportOptions?.shinkansen),
  );

  return {
    ...destination,
    transportOptions: {
      ...destination.transportOptions,
      ...Object.fromEntries(
        Object.entries(dynamicOptions).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    },
  };
}

/**
 * Phase 1 pipeline contract. The existing ranking remains the baseline while
 * later phases can improve individual stages without changing callers.
 */
export function runRecommendationPipeline(
  destinations: Destination[],
  context: RecommendationContext,
): PipelineRecommendation[] {
  const candidates = destinations.map((destination) =>
    buildRecommendationCandidate(destination, context),
  );
  const eligible = candidates.filter((destination) => {
    if (!destination.id || context.visitedIds.includes(destination.id))
      return false;
    if (!matchesTripDuration(destination.totalTripHours, context.tripDuration))
      return false;
    const modes = getValidModes(
      destination,
      context.carMode,
      context.publicModes,
      context.homeStationCoords || undefined,
    );
    if (modes.length === 0) return false;
    const lowestCost = Math.min(
      ...modes.map((mode) =>
        getAdjustedBudget(
          destination,
          mode,
          context.partySize,
          context.homeStationCoords || undefined,
        ),
      ),
    );
    return lowestCost <= context.budget * 1.2;
  });

  const scored = eligible.map((candidate) => {
    const scoreResult = calculateScore(candidate, context);
    const match = createRecommendationMatch(
      candidate,
      context,
      scoreResult.score,
    );
    const estimatedCost = getAdjustedBudget(
      candidate,
      scoreResult.bestMode || "train",
      context.partySize,
      context.homeStationCoords || undefined,
    );
    return {
      ...candidate,
      score: scoreResult.score,
      match,
      bestTransportMode: scoreResult.bestMode,
      pipeline: {
        eligible: true,
        estimatedCost,
        bestTransportMode: scoreResult.bestMode,
        scoreContributions: {
          total: scoreResult.score,
          transport: scoreResult.bestModeScore,
        },
        confidence: calculateConfidence(scoreResult.score),
        reasons: match.reasons,
      },
    } as PipelineRecommendation;
  });

  // Diversification is intentionally stable/no-op in Phase 1 to preserve current output.
  return scored.sort((a, b) => b.score - a.score);
}
