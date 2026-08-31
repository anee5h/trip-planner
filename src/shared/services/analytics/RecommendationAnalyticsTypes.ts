export const ANALYTICS_SCHEMA_VERSION = "1.0";

export type RecommendationEventType =
  | "recommendation_feedback"
  | "recommendation_click"
  | "recommendation_save"
  | "recommendation_compare"
  | "recommendation_dismiss"
  | "reason_code_feedback"
  | "recommendation_impression"
  | "no_result_impression"
  | "fallback_impression"
  | "day_plan_creation_started"
  | "day_plan_generated"
  | "day_plan_regenerated"
  | "day_plan_saved"
  | "day_plan_start_over"
  | "day_plan_preferences_opened"
  | "cost_breakdown_opened"
  | "signup_cta_impression"
  | "signup_cta_click"
  | "signup_started"
  | "signup_completed";

export type SignupSource = "header" | "auth_modal";
export type SignupAuthProvider = "email" | "google" | "twitter" | "line";

export interface BaseAnalyticsEvent {
  eventId: string;
  eventType: RecommendationEventType;
  schemaVersion: string;
  timestamp: number;
  locale: "en" | "ja";
  sessionId: string;
}

export interface RecommendationFeedbackEvent extends BaseAnalyticsEvent {
  eventType: "recommendation_feedback";
  destinationId: string;
  isHelpful: boolean;
  reasonCodes?: string[];
}

export interface RecommendationClickEvent extends BaseAnalyticsEvent {
  eventType: "recommendation_click";
  destinationId: string;
  position?: number;
  score?: number;
}

export interface RecommendationSaveEvent extends BaseAnalyticsEvent {
  eventType: "recommendation_save";
  destinationId: string;
  isSaved: boolean;
}

export interface RecommendationCompareEvent extends BaseAnalyticsEvent {
  eventType: "recommendation_compare";
  destinationId: string;
  isCompared: boolean;
}

export interface RecommendationDismissEvent extends BaseAnalyticsEvent {
  eventType: "recommendation_dismiss";
  destinationId: string;
  reasonCodes?: string[];
}

export interface ReasonCodeFeedbackEvent extends BaseAnalyticsEvent {
  eventType: "reason_code_feedback";
  destinationId: string;
  reasonCode: string;
  isHelpful: boolean;
}

export interface RecommendationImpressionEvent extends BaseAnalyticsEvent {
  eventType: "recommendation_impression";
  destinationIds: string[];
  confidenceBand?: "HIGH" | "MEDIUM" | "LOW";
  reasonCodes?: string[];
}

export interface NoResultImpressionEvent extends BaseAnalyticsEvent {
  eventType: "no_result_impression";
  criteriaCount?: number;
}

export interface FallbackImpressionEvent extends BaseAnalyticsEvent {
  eventType: "fallback_impression";
  fallbackReason: string;
}

export interface PlanningToolAnalyticsEvent extends BaseAnalyticsEvent {
  eventType:
    | "day_plan_creation_started"
    | "day_plan_generated"
    | "day_plan_regenerated"
    | "day_plan_saved"
    | "day_plan_start_over"
    | "day_plan_preferences_opened"
    | "cost_breakdown_opened";
  destinationId: string;
  planType?: "half_day" | "full_day";
  durationMode?: string;
  pace?: "relaxed" | "balanced" | "packed";
  partySize?: number;
  generatedStopCount?: number;
  generatedDurationMinutes?: number;
  primaryRole?: "poi" | "hub";
  availableMinutes?: number;
  startTime?: string;
  returnMode?: "anchor" | "nearest_station" | "none";
  source: "destination_details";
}

export interface SignupCtaImpressionEvent extends BaseAnalyticsEvent {
  eventType: "signup_cta_impression";
  source: "header";
}

export interface SignupCtaClickEvent extends BaseAnalyticsEvent {
  eventType: "signup_cta_click";
  source: "header";
}

export interface SignupStartedEvent extends BaseAnalyticsEvent {
  eventType: "signup_started";
  source: SignupSource;
}

export interface SignupCompletedEvent extends BaseAnalyticsEvent {
  eventType: "signup_completed";
  source: SignupSource;
  authProvider: SignupAuthProvider;
}

export type AnyRecommendationAnalyticsEvent =
  | RecommendationFeedbackEvent
  | RecommendationClickEvent
  | RecommendationSaveEvent
  | RecommendationCompareEvent
  | RecommendationDismissEvent
  | ReasonCodeFeedbackEvent
  | RecommendationImpressionEvent
  | NoResultImpressionEvent
  | FallbackImpressionEvent
  | PlanningToolAnalyticsEvent
  | SignupCtaImpressionEvent
  | SignupCtaClickEvent
  | SignupStartedEvent
  | SignupCompletedEvent;
