import type { Destination } from "@/shared/types/destination";
import type { RecommendationContext } from "./RecommendationContext";
import type { ScoredDestination } from "./RecommendationTypes";
import { calculateScore, getValidModes } from "./RecommendationScorer";
import { createRecommendationMatch } from "./RecommendationExplainability";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import {
  getDistance,
  getDynamicTransportOptions,
} from "@/shared/utils/distance";

export { getValidModes };

export function getRecommendations(
  destinations: Destination[],
  context: RecommendationContext,
): ScoredDestination[] {
  const {
    visitedIds,
    homeStationCoords,
    carMode,
    publicModes,
    budget,
    partySize,
  } = context;

  return destinations
    .filter((destObj) => {
      if (!destObj.id || visitedIds.includes(destObj.id)) return false;

      const validModesForDest = getValidModes(destObj, carMode, publicModes);
      if (validModesForDest.length === 0) return false;

      // Strict budget filtering with 20% buffer for recommendations
      let lowestBudget = 999999;
      for (const m of validModesForDest) {
        const b = getAdjustedBudget(destObj, m, partySize);
        if (b < lowestBudget) lowestBudget = b;
      }
      if (lowestBudget > budget * 1.2) return false;

      return true;
    })
    .map((destObj) => {
      // Dynamic transport options override
      const dest = { ...destObj };
      if (homeStationCoords && dest.coordinates?.lat && dest.coordinates?.lng) {
        const distKm = getDistance(
          homeStationCoords.lat,
          homeStationCoords.lng,
          dest.coordinates.lat,
          dest.coordinates.lng,
        );
        const hasShinkansen = Boolean(destObj.transportOptions?.shinkansen);
        dest.transportOptions = getDynamicTransportOptions(
          distKm,
          hasShinkansen,
        );
      }

      const { score, bestMode } = calculateScore(dest, context);
      const match = createRecommendationMatch(dest, context, score);

      return {
        ...destObj,
        score,
        match,
        bestTransportMode: bestMode,
      } as ScoredDestination;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Score a single destination for catalog sorting (no filtering).
 *
 * Use this for the Destinations page "Recommended" sort. Unlike
 * getRecommendations(), this function never filters out destinations —
 * it only computes a score so the caller can sort. Filtering is handled
 * separately by the existing filter UI in Destinations.tsx.
 *
 * This ensures "Recommended" always shows the same destination count as
 * any other sort option.
 */
export function scoreForCatalog(
  dest: Destination,
  context: RecommendationContext,
): number {
  return calculateScore(dest, context).score;
}
