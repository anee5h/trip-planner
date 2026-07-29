import type { Destination } from "@/shared/types/destination";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import {
  getDistance,
  getDynamicTransportOptions,
} from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import {
  estimateTripDuration,
  matchesTripDurationEstimate,
} from "./TripDurationService";
import { createRecommendationMatch } from "./RecommendationExplainability";
import {
  calculateConfidence,
  calculateScore,
  getValidModes,
} from "./RecommendationScorer";
import type { PipelineRecommendation } from "./RecommendationTypes";

export function buildRecommendationCandidate(
  destination: Destination,
  context: Pick<RecommendationContext, "homeStationCoords">,
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
          ([mode, value]) =>
            value !== undefined &&
            destination.transportOptions?.[
              mode as keyof typeof destination.transportOptions
            ] !== undefined,
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
    const modes = getValidModes(
      destination,
      context.carMode,
      context.publicModes,
      context.homeStationCoords || undefined,
    );
    if (modes.length === 0) return false;
    if (
      !matchesTripDurationEstimate(
        estimateTripDuration(destination, context, modes),
        context.tripDuration,
      )
    )
      return false;
    const lowestCost = Math.min(
      ...modes.map(
        (mode) =>
          getEstimatedBudgetRange(
            destination,
            mode,
            context.partySize,
            context.diningStyle,
            estimateTripDuration(destination, context, modes)
              ?.representativeHours,
            context.homeStationCoords || undefined,
          )[1],
      ),
    );
    return lowestCost <= context.budget;
  });

  const scored = eligible.map((candidate) => {
    const scoreResult = calculateScore(candidate, context);
    const match = createRecommendationMatch(
      candidate,
      context,
      scoreResult.score,
    );
    const durationEstimate = estimateTripDuration(
      candidate,
      context,
      getValidModes(
        candidate,
        context.carMode,
        context.publicModes,
        context.homeStationCoords || undefined,
      ),
    );
    const estimatedCostRange = getEstimatedBudgetRange(
      candidate,
      scoreResult.bestMode || "train",
      context.partySize,
      context.diningStyle,
      durationEstimate?.representativeHours,
      context.homeStationCoords || undefined,
    );
    return {
      ...candidate,
      score: scoreResult.score,
      match,
      bestTransportMode: scoreResult.bestMode,
      estimatedCostRange,
      pipeline: {
        eligible: true,
        estimatedCost: estimatedCostRange[0],
        estimatedCostRange,
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
