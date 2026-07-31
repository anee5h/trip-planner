import { generateUUID } from "@/shared/utils/uuid";
import { ANALYTICS_SCHEMA_VERSION } from "./RecommendationAnalyticsTypes";
import type {
  AnyRecommendationAnalyticsEvent,
  BaseAnalyticsEvent,
  PlanningToolAnalyticsEvent,
} from "./RecommendationAnalyticsTypes";
import { telemetryPipeline } from "./RecommendationTelemetryPipeline";

const OPT_OUT_STORAGE_KEY = "tabimap_analytics_opt_out";
const SESSION_ID_STORAGE_KEY = "tabimap_analytics_session_id";
const EVENT_QUEUE_STORAGE_KEY = "tabimap_analytics_event_queue";
const DEDUP_WINDOW_MS = 2000;
const MAX_QUEUE_SIZE = 200;

class RecommendationAnalyticsService {
  private eventQueue: AnyRecommendationAnalyticsEvent[] = [];
  private recentEvents: Map<string, number> = new Map();
  private isOptedOut: boolean = false;
  private sessionId: string = "";

  constructor() {
    this.initSession();
    this.initOptOut();
    this.loadQueue();
  }

  private initSession(): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        let sid = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
        if (!sid) {
          sid = generateUUID();
          sessionStorage.setItem(SESSION_ID_STORAGE_KEY, sid);
        }
        this.sessionId = sid;
      } else {
        this.sessionId = generateUUID();
      }
    } catch {
      this.sessionId = generateUUID();
    }
  }

  private initOptOut(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        this.isOptedOut = localStorage.getItem(OPT_OUT_STORAGE_KEY) === "true";
      }
    } catch {
      this.isOptedOut = false;
    }
  }

  private loadQueue(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = localStorage.getItem(EVENT_QUEUE_STORAGE_KEY);
        if (raw) {
          this.eventQueue = JSON.parse(raw);
        }
      }
    } catch {
      this.eventQueue = [];
    }
  }

  private saveQueue(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(
          EVENT_QUEUE_STORAGE_KEY,
          JSON.stringify(this.eventQueue.slice(-MAX_QUEUE_SIZE)),
        );
      }
    } catch {
      // Fail silent
    }
  }

  public getOptOut(): boolean {
    return this.isOptedOut;
  }

  public setOptOut(optOut: boolean): void {
    this.isOptedOut = optOut;
    if (optOut) {
      telemetryPipeline.purge();
      this.clearQueue();
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(OPT_OUT_STORAGE_KEY, String(optOut));
      }
    } catch {
      // Fail silent
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getQueue(): AnyRecommendationAnalyticsEvent[] {
    return [...this.eventQueue];
  }

  public clearQueue(): void {
    this.eventQueue = [];
    this.saveQueue();
  }

  public resetForTesting(): void {
    this.recentEvents.clear();
    this.clearQueue();
    telemetryPipeline.purge();
    this.isOptedOut = false;
  }

  private isDuplicate(dedupKey: string): boolean {
    const now = Date.now();
    const lastSeen = this.recentEvents.get(dedupKey);
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
      return true;
    }
    this.recentEvents.set(dedupKey, now);

    if (this.recentEvents.size > 200) {
      for (const [k, ts] of this.recentEvents.entries()) {
        if (now - ts > DEDUP_WINDOW_MS) {
          this.recentEvents.delete(k);
        }
      }
    }

    return false;
  }

  private createBaseEvent(
    eventType: AnyRecommendationAnalyticsEvent["eventType"],
    locale: "en" | "ja" = "en",
  ): BaseAnalyticsEvent {
    return {
      eventId: generateUUID(),
      eventType,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      timestamp: Date.now(),
      locale,
      sessionId: this.sessionId,
    };
  }

  public emitEvent(event: AnyRecommendationAnalyticsEvent): boolean {
    if (this.isOptedOut) {
      return false;
    }

    try {
      const destId =
        (event as { destinationId?: string }).destinationId ||
        (event as { destinationIds?: string[] }).destinationIds?.join(",") ||
        "";
      const dedupKey = `${event.eventType}:${destId}:${(event as { reasonCode?: string }).reasonCode || ""}:${(event as { isHelpful?: boolean }).isHelpful ?? ""}:${(event as { planType?: string }).planType || ""}`;

      if (this.isDuplicate(dedupKey)) {
        return false;
      }

      this.eventQueue.push(event);
      if (this.eventQueue.length > MAX_QUEUE_SIZE) {
        this.eventQueue.shift();
      }
      this.saveQueue();
      telemetryPipeline.enqueue(event);
      return true;
    } catch {
      return false;
    }
  }

  public trackImpression(
    destinationIds: string[],
    confidenceBand?: "HIGH" | "MEDIUM" | "LOW",
    reasonCodes?: string[],
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("recommendation_impression", locale);
    return this.emitEvent({
      ...base,
      eventType: "recommendation_impression",
      destinationIds,
      confidenceBand,
      reasonCodes,
    });
  }

  public trackNoResult(
    criteriaCount?: number,
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("no_result_impression", locale);
    return this.emitEvent({
      ...base,
      eventType: "no_result_impression",
      criteriaCount,
    });
  }

  public trackFallback(
    fallbackReason: string,
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("fallback_impression", locale);
    return this.emitEvent({
      ...base,
      eventType: "fallback_impression",
      fallbackReason,
    });
  }

  public trackFeedback(
    destinationId: string,
    isHelpful: boolean,
    reasonCodes?: string[],
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("recommendation_feedback", locale);
    return this.emitEvent({
      ...base,
      eventType: "recommendation_feedback",
      destinationId,
      isHelpful,
      reasonCodes,
    });
  }

  public trackClick(
    destinationId: string,
    position?: number,
    score?: number,
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("recommendation_click", locale);
    return this.emitEvent({
      ...base,
      eventType: "recommendation_click",
      destinationId,
      position,
      score,
    });
  }

  public trackSave(
    destinationId: string,
    isSaved: boolean,
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("recommendation_save", locale);
    return this.emitEvent({
      ...base,
      eventType: "recommendation_save",
      destinationId,
      isSaved,
    });
  }

  public trackCompare(
    destinationId: string,
    isCompared: boolean,
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("recommendation_compare", locale);
    return this.emitEvent({
      ...base,
      eventType: "recommendation_compare",
      destinationId,
      isCompared,
    });
  }

  public trackDismiss(
    destinationId: string,
    reasonCodes?: string[],
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("recommendation_dismiss", locale);
    return this.emitEvent({
      ...base,
      eventType: "recommendation_dismiss",
      destinationId,
      reasonCodes,
    });
  }

  public trackReasonCodeFeedback(
    destinationId: string,
    reasonCode: string,
    isHelpful: boolean,
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent("reason_code_feedback", locale);
    return this.emitEvent({
      ...base,
      eventType: "reason_code_feedback",
      destinationId,
      reasonCode,
      isHelpful,
    });
  }

  public trackPlanningToolEvent(
    eventType: PlanningToolAnalyticsEvent["eventType"],
    destinationId: string,
    details?: {
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
    },
    locale: "en" | "ja" = "en",
  ): boolean {
    const base = this.createBaseEvent(eventType, locale);
    return this.emitEvent({
      ...base,
      eventType,
      destinationId,
      source: "destination_details",
      ...details,
    });
  }
}

export const recommendationAnalytics = new RecommendationAnalyticsService();
