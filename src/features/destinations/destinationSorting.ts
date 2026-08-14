/**
 * destinationSorting — overall-score sorting for the Explore grid.
 *
 * KAI-89 rubric v2 contract: verified and estimated share ONE rubric scale,
 * but verified evidence must never be outranked by an estimate purely
 * because the estimate's number is higher. Sort is state-major
 * (verified > estimated > unavailable), then value descending within a
 * state, then id for determinism.
 */
import type { Destination } from "@/shared/types/destination";
import {
  getScorePresentation,
  type ScoreState,
} from "@/shared/services/recommendation/RecommendationScorer";

const STATE_RANK: Record<ScoreState, number> = {
  verified: 0,
  estimated: 1,
  unavailable: 2,
};

export function compareOverallScore(a: Destination, b: Destination): number {
  const sa = getScorePresentation(a);
  const sb = getScorePresentation(b);
  const rankA = STATE_RANK[sa.state];
  const rankB = STATE_RANK[sb.state];
  if (rankA !== rankB) return rankA - rankB;
  const valueA = sa.value ?? -1;
  const valueB = sb.value ?? -1;
  if (valueA !== valueB) return valueB - valueA;
  return a.id.localeCompare(b.id);
}
