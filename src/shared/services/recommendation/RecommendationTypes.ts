import type { Destination } from "@/shared/types/destination";

export type MatchReasonType =
  | "Budget"
  | "Weather"
  | "Transport"
  | "Suitability"
  | "Seasonal"
  | "Distance"
  | "Interest"
  | "General";

export interface MatchReason {
  type: MatchReasonType;
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
}

export interface RecommendationStageResult {
  eligible: boolean;
  estimatedCost?: number;
  bestTransportMode?: string;
  scoreContributions: Record<string, number>;
  confidence: number;
  reasons: MatchReason[];
}

export interface PipelineRecommendation extends ScoredDestination {
  pipeline: RecommendationStageResult;
}
