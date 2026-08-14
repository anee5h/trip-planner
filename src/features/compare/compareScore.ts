/**
 * compareScore — shared "Best overall" resolution for the Compare page and
 * CompareModal. KAI-89 rubric v2 contract: an ESTIMATED score never wins
 * Best against verified score evidence purely because its number is higher;
 * only verified states compete for the badge (unavailable states never win).
 */
import type { Destination } from "@/shared/types/destination";
import { getScorePresentation } from "@/shared/services/recommendation/RecommendationScorer";

/** Index of the verified destination with the highest score, or null. */
export function bestVerifiedScoreIndex(
  destinations: Destination[],
): number | null {
  let bestIndex = -1;
  let bestValue = -1;
  destinations.forEach((d, i) => {
    const sp = getScorePresentation(d);
    if (sp.state !== "verified" || sp.value === null) return;
    if (bestIndex === -1 || sp.value > bestValue) {
      bestIndex = i;
      bestValue = sp.value;
    }
  });
  return bestIndex === -1 ? null : bestIndex;
}
