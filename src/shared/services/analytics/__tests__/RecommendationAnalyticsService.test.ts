import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("records the signup conversion funnel with stable safe dimensions", () => {
    recommendationAnalytics.trackSignupCtaImpression("header", "ja");
    recommendationAnalytics.trackSignupCtaClick("header", "ja");
    recommendationAnalytics.trackSignupStarted("header", "ja");
    recommendationAnalytics.trackSignupCompleted("email", "header", "ja");

    const queue = recommendationAnalytics.getQueue();
    expect(queue.map((event) => event.eventType)).toEqual([
      "signup_cta_impression",
      "signup_cta_click",
      "signup_started",
      "signup_completed",
    ]);
    expect(queue[0]).toMatchObject({
      source: "header",
      locale: "ja",
    });
    expect(queue[3]).toMatchObject({
      source: "header",
      authProvider: "email",
    });
  });

  it("does not repeat the header impression after a navigation remount", () => {
    expect(
      recommendationAnalytics.trackSignupCtaImpression("header", "en"),
    ).toBe(true);
    expect(
      recommendationAnalytics.trackSignupCtaImpression("header", "en"),
    ).toBe(false);
    expect(recommendationAnalytics.getQueue()).toHaveLength(1);
  });

  it("does not expose sensitive auth data in signup events", () => {
    recommendationAnalytics.trackSignupCompleted("email", "header");
    const event = recommendationAnalytics.getQueue()[0];

    expect(event).not.toHaveProperty("email");
    expect(event).not.toHaveProperty("password");
    expect(event).not.toHaveProperty("access_token");
    expect(event).not.toHaveProperty("refresh_token");
    expect(event).not.toHaveProperty("userId");
  });

  it("only completes a pending OAuth signup once an authenticated session arrives", () => {
    recommendationAnalytics.markPendingSignup("google", "auth_modal");

    expect(recommendationAnalytics.trackPendingSignupCompletion()).toBe(true);
    expect(recommendationAnalytics.trackPendingSignupCompletion()).toBe(false);
    expect(recommendationAnalytics.getQueue()).toHaveLength(1);
    expect(recommendationAnalytics.getQueue()[0]).toMatchObject({
      eventType: "signup_completed",
      source: "auth_modal",
      authProvider: "google",
    });
  });

  it("forwards only allowlisted signup dimensions to the existing GA4 helper", () => {
    const gtag = vi.fn();
    (window as Window & { gtag?: (...args: unknown[]) => void }).gtag = gtag;

    recommendationAnalytics.trackSignupCtaClick("header", "ja");

    expect(gtag).toHaveBeenCalledWith("event", "signup_cta_click", {
      locale: "ja",
      schema_version: ANALYTICS_SCHEMA_VERSION,
      source: "header",
    });
    expect(gtag.mock.calls[0][2]).not.toHaveProperty("sessionId");
    expect(gtag.mock.calls[0][2]).not.toHaveProperty("auth_payload");
    delete (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
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
