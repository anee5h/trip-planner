import type { Destination } from "@/shared/types/destination";
import type { RecommendationContext } from "./RecommendationContext";
import type { ScoredDestination } from "./RecommendationTypes";
import { calculateScore, getValidModes } from "./RecommendationScorer";
import {
  buildRecommendationCandidate,
  runRecommendationPipeline,
} from "./RecommendationPipeline";

export { getValidModes };

export function getRecommendations(
  destinations: Destination[],
  context: RecommendationContext,
): ScoredDestination[] {
  return runRecommendationPipeline(destinations, context);
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
  return calculateScore(buildRecommendationCandidate(dest, context), context)
    .score;
}
