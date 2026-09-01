/**
 * @deprecated Compatibility facade for pre-KAI-260 imports.
 *
 * All runtime cost arithmetic lives in `tripEstimateEngine`. The old function
 * name remains as an alias so integrations can migrate without a flag day.
 */
export {
  calculateTripEstimate as calculateTripCost,
  evaluateAffordability,
} from "./tripEstimateEngine";
export type { TripEstimateContext as TripCostContext } from "./tripEstimateEngine";
export type { TripDuration } from "@/shared/types/tripDuration";
export {
  TripEstimateEngine,
  calculateTripEstimate,
  getEstimateRange,
  estimateQualityLabel,
} from "./tripEstimateEngine";
export type {
  TripEstimateContext,
  TripEstimateResult,
  EstimateQuality,
  EvidenceCompleteness,
} from "./tripEstimateEngine";
