import { beforeEach, describe, expect, it } from "vitest";
import { recommendationAnalytics } from "../RecommendationAnalyticsService";
import { ANALYTICS_SCHEMA_VERSION } from "../RecommendationAnalyticsTypes";

describe("RecommendationAnalyticsService Unit Tests", () => {
  beforeEach(() => {
    recommendationAnalytics.resetForTesting();
  });

  it("should record recommendation feedback event with schema version 1.0", () => {
    const emitted = recommendationAnalytics.trackFeedback("hakone", true, [
      "WEATHER_MATCH",
    ]);
    expect(emitted).toBe(true);

    const queue = recommendationAnalytics.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].eventType).toBe("recommendation_feedback");
    expect(queue[0].schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION);
    expect(queue[0].sessionId).toBeDefined();
    expect((queue[0] as any).destinationId).toBe("hakone");
    expect((queue[0] as any).isHelpful).toBe(true);
    expect((queue[0] as any).reasonCodes).toEqual(["WEATHER_MATCH"]);
  });

  it("should record click, save, compare, and dismiss events", () => {
    recommendationAnalytics.trackClick("nikko", 1, 85);
    recommendationAnalytics.trackSave("kamakura", true);
    recommendationAnalytics.trackCompare("hakone", true);
    recommendationAnalytics.trackDismiss("tokyo-skytree", ["BUDGET_FIT"]);

    const queue = recommendationAnalytics.getQueue();
    expect(queue.length).toBe(4);
    expect(queue[0].eventType).toBe("recommendation_click");
    expect(queue[1].eventType).toBe("recommendation_save");
    expect(queue[2].eventType).toBe("recommendation_compare");
    expect(queue[3].eventType).toBe("recommendation_dismiss");
  });

  it("should prevent duplicate rapid events for the same action", () => {
    const first = recommendationAnalytics.trackFeedback("hakone", true);
    const duplicate = recommendationAnalytics.trackFeedback("hakone", true);

    expect(first).toBe(true);
    expect(duplicate).toBe(false);
    expect(recommendationAnalytics.getQueue().length).toBe(1);
  });

  it("should respect opt-out preference", () => {
    recommendationAnalytics.setOptOut(true);
    expect(recommendationAnalytics.getOptOut()).toBe(true);

    const emitted = recommendationAnalytics.trackFeedback("hakone", true);
    expect(emitted).toBe(false);
    expect(recommendationAnalytics.getQueue().length).toBe(0);
  });

  it("should contain zero PII in event payloads", () => {
    recommendationAnalytics.trackFeedback("kyoto", false);
    const event = recommendationAnalytics.getQueue()[0];

    expect(event).not.toHaveProperty("email");
    expect(event).not.toHaveProperty("userId");
    expect(event).not.toHaveProperty("ip");
    expect(event.sessionId).toBeDefined();
  });
});
