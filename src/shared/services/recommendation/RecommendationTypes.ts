import type { ActualWeatherCondition } from "./RecommendationContext";
import type { Destination } from "@/shared/types/destination";
import type { PriceRange } from "@/shared/types/planner";
import type { WeekendTravelFit } from "./WeekendPolicy";
import type { WeekendCapacityResult } from "./WeekendPolicy";
import type { WeekendResultKind } from "./WeekendAreaPolicy";
import type { TravelDurationEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type { TokyoWardsGroupMetadata } from "./TokyoWardsConsolidation";

export type MatchReasonType =
  | "Budget"
  | "Weather"
  | "Transport"
  | "Suitability"
  | "Seasonal"
  | "Distance"
  | "Interest"
  | "Editorial"
  | "General"
  | "Weekend";

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
  | "generalSolidMatch"
  | "weekendTripReady"
  | "weekendCapacityStrong"
  | "weekendTravelStrong"
  | "weekendTravelAcceptable"
  | "weekendTravelWeak"
  | "weekendWeatherGood"
  | "weekendWeatherDayRain"
  | "weekendWeatherPoorOutdoor"
  | "weekendStayAllowance"
  | "weekendTransportExcluded"
  | "conditionForecastDay"
  | "conditionForecastRange"
  | "conditionSeasonalMonth"
  | "conditionSeasonalStrong"
  | "conditionSeasonalWeak"
  | "conditionIndoorHeat"
  | "conditionIndoorWinter"
  | "conditionOutdoorSummer"
  | "conditionOutdoorWinter"
  | "conditionRainFriendly"
  | "conditionRainExposed"
  | "conditionFerrySeasonal"
  | "conditionUnknown";

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

export interface WeekendRecommendationMetadata {
  travelFit: WeekendTravelFit;
  capacity: WeekendCapacityResult;
  weatherDays: {
    date: string;
    condition: ActualWeatherCondition;
    temperatureC?: number;
  }[];
  accommodationAllowance?: number;
  estimatedCostTransportIncluded: boolean;
  /** Hub-first classification of the primary weekend result. */
  areaKind?: WeekendResultKind;
  /** Unique published children contained by this trip area. */
  placeCount?: number;
}

export interface ScoredDestination extends Destination {
  score: number;
  match: RecommendationMatch;
  bestTransportMode?: string;
  estimatedCostRange?: PriceRange;
  estimatedCostTransportIncluded?: boolean;
  /** The shared origin-aware duration used by cards and roulette. */
  transportEstimate?: TravelDurationEstimate;
  /** Present only on the virtual Tokyo 23 Wards super-hub result. */
  wardGroup?: TokyoWardsGroupMetadata;
  weekend?: WeekendRecommendationMetadata;
  /**
   * Forecast/seasonal/unknown evaluation for the planned trip dates.
   * Present only when the context carries explicit travelDates.
   */
  condition?: import("./TravelConditions").TravelConditionEvaluation;
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
