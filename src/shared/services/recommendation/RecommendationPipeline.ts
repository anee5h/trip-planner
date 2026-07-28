import type { Destination } from "@/shared/types/destination";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import {
  getDistance,
  getDynamicTransportOptions,
} from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import { createRecommendationMatch } from "./RecommendationExplainability";
import {
  calculateConfidence,
  calculateScore,
  getValidModes,
} from "./RecommendationScorer";
import type { PipelineRecommendation } from "./RecommendationTypes";

/**
 * Phase 1 pipeline contract. The existing ranking remains the baseline while
 * later phases can improve individual stages without changing callers.
 */
export function runRecommendationPipeline(
  destinations: Destination[],
  context: RecommendationContext,
): PipelineRecommendation[] {
  const eligible = destinations.filter((destination) => {
    if (!destination.id || context.visitedIds.includes(destination.id))
      return false;
    const modes = getValidModes(
      destination,
      context.carMode,
      context.publicModes,
    );
    if (modes.length === 0) return false;
    const lowestCost = Math.min(
      ...modes.map((mode) =>
        getAdjustedBudget(destination, mode, context.partySize),
      ),
    );
    return lowestCost <= context.budget * 1.2;
  });

  const scored = eligible.map((destination) => {
    // Cost estimation stage: use distance-aware transport when an origin exists.
    const candidate = { ...destination };
    if (context.homeStationCoords && candidate.coordinates) {
      const distanceKm = getDistance(
        context.homeStationCoords.lat,
        context.homeStationCoords.lng,
        candidate.coordinates.lat,
        candidate.coordinates.lng,
      );
      candidate.transportOptions = getDynamicTransportOptions(
        distanceKm,
        Boolean(destination.transportOptions?.shinkansen),
      );
    }

    // Weather suitability and scoring are currently calculated by the shared scorer.
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
    );
    return {
      ...destination,
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
