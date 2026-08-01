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

function coordinatesWithinOneKm(
  a: PipelineRecommendation,
  b: PipelineRecommendation,
) {
  if (!a.coordinates || !b.coordinates) return false;
  return (
    getDistance(
      a.coordinates.lat,
      a.coordinates.lng,
      b.coordinates.lat,
      b.coordinates.lng,
    ) < 1
  );
}

export function diversifyRecommendations(
  recommendations: PipelineRecommendation[],
): PipelineRecommendation[] {
  const remaining = [...recommendations].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const selected: PipelineRecommendation[] = [];

  // ponytail: O(n²) is deliberate for a sub-1k catalogue; add spatial indexes only if profiling requires it.
  const visibleLimit = Math.min(20, remaining.length);
  while (remaining.length > 0 && selected.length < visibleLimit) {
    let bestIndex = -1;
    let bestAdjustedScore = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const parentId = candidate.relationships?.parentDestinationId;
      const conflictsWithHub = selected.some(
        (place) =>
          place.id === parentId ||
          place.relationships?.parentDestinationId === candidate.id,
      );
      if (conflictsWithHub) continue;

      const adjustedScore =
        candidate.score -
        Math.min(
          30,
          Math.max(
            0,
            ...selected.map((place) => {
              const sameArea =
                candidate.areaId && candidate.areaId === place.areaId ? 18 : 0;
              const sameParent =
                parentId &&
                parentId === place.relationships?.parentDestinationId
                  ? 8
                  : 0;
              const sameCategory =
                candidate.categories[0] &&
                candidate.categories[0] === place.categories[0]
                  ? 6
                  : 0;
              return (
                sameArea +
                sameParent +
                sameCategory +
                (coordinatesWithinOneKm(candidate, place) ? 8 : 0)
              );
            }),
          ),
        );

      if (
        adjustedScore > bestAdjustedScore ||
        (adjustedScore === bestAdjustedScore &&
          (bestIndex < 0 ||
            candidate.id.localeCompare(remaining[bestIndex].id) < 0))
      ) {
        bestIndex = index;
        bestAdjustedScore = adjustedScore;
      }
    }

    if (bestIndex < 0) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return [
    ...selected,
    ...remaining.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
  ];
}

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
      context.budgetTier,
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
            context.budgetTier,
            estimateTripDuration(destination, context, modes)
              ?.representativeHours,
            context.homeStationCoords || undefined,
          )[1],
      ),
    );
    return context.budgetTier === "luxury" || lowestCost <= context.budget;
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
        context.budgetTier,
      ),
    );
    const estimatedCostRange = getEstimatedBudgetRange(
      candidate,
      scoreResult.bestMode || "train",
      context.partySize,
      context.budgetTier,
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

  return diversifyRecommendations(scored);
}
