import type { Destination } from "@/shared/types/destination";
import type { PriceRange } from "@/shared/types/planner";

export type MatchReasonType =
  | "Budget"
  | "Weather"
  | "Transport"
  | "Suitability"
  | "Seasonal"
  | "Distance"
  | "Interest"
  | "Editorial"
  | "General";

export type RecommendationReasonCode =
  | "budgetGreatValue"
  | "budgetWithin"
  | "transportFastTrain"
  | "transportEasyDrive"
  | "transportShinkansen"
  | "transportFerry"
  | "interestFood"
  | "interestNature"
  | "interestHistory"
  | "interestArt"
  | "interestSea"
  | "interestCool"
  | "interestThemepark"
  | "weatherRainFriendly"
  | "weatherCoolRetreat"
  | "weatherWinterComfort"
  | "editorialReviewPending"
  | "generalHighlyRated"
  | "generalSolidMatch";

export interface MatchReason {
  type: MatchReasonType;
  code: RecommendationReasonCode;
  params?: Record<string, number | string>;
  title: string;
  description?: string;
}

export interface RecommendationMatch {
  confidence: number;
  reasons: MatchReason[];
  matchedPreferences: string[];
  unmatchedPreferences: string[];
  summary?: string;
}

export interface ScoredDestination extends Destination {
  score: number;
  match: RecommendationMatch;
  bestTransportMode?: string;
  estimatedCostRange?: PriceRange;
  estimatedCostTransportIncluded?: boolean;
}

export interface RecommendationStageResult {
  eligible: boolean;
  estimatedCost?: number;
  estimatedCostRange?: PriceRange;
  estimatedCostTransportIncluded?: boolean;
  bestTransportMode?: string;
  scoreContributions: Record<string, number>;
  confidence: number;
  reasons: MatchReason[];
}
export interface PipelineRecommendation extends ScoredDestination {
  pipeline: RecommendationStageResult;
}
