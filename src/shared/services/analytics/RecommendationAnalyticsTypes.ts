export const ANALYTICS_SCHEMA_VERSION = "1.0";

export type RecommendationEventType =
  | "recommendation_feedback"
  | "recommendation_click"
  | "recommendation_save"
  | "recommendation_compare"
  | "recommendation_dismiss"
  | "reason_code_feedback";

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

export type AnyRecommendationAnalyticsEvent =
  | RecommendationFeedbackEvent
  | RecommendationClickEvent
  | RecommendationSaveEvent
  | RecommendationCompareEvent
  | RecommendationDismissEvent
  | ReasonCodeFeedbackEvent;
