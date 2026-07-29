import { beforeEach, describe, expect, it } from "vitest";
import { recommendationAnalytics } from "../RecommendationAnalyticsService";
import { computeQualityMetrics } from "../RecommendationQualityAnalytics";

describe("RecommendationQualityAnalytics Unit Tests", () => {
  beforeEach(() => {
    recommendationAnalytics.resetForTesting();
  });

  it("should compute correct CTR, save rate, and comparison rate", () => {
    recommendationAnalytics.trackImpression(
      ["hakone", "nikko", "kamakura"],
      "HIGH",
      ["WEATHER_MATCH"],
      "en",
    );
    recommendationAnalytics.trackClick("hakone", 1, 90, "en");
    recommendationAnalytics.trackSave("hakone", true, "en");
    recommendationAnalytics.trackCompare("nikko", true, "en");

    const report = computeQualityMetrics();

    expect(report.totalImpressions).toBe(3);
    expect(report.totalClicks).toBe(1);
    expect(report.totalSaves).toBe(1);
    expect(report.totalCompares).toBe(1);
    expect(report.clickThroughRate).toBe(33.3);
    expect(report.saveRate).toBe(33.3);
    expect(report.comparisonRate).toBe(33.3);
  });

  it("should track reason-code performance and feedback", () => {
    recommendationAnalytics.trackImpression(
      ["hakone"],
      "HIGH",
      ["BUDGET_FIT"],
      "en",
    );
    recommendationAnalytics.trackClick("hakone", 1, 80, "en");
    recommendationAnalytics.trackFeedback("hakone", true, ["BUDGET_FIT"], "en");

    const report = computeQualityMetrics();
    const budgetPerf = report.reasonCodePerformance["BUDGET_FIT"];

    expect(budgetPerf).toBeDefined();
    expect(budgetPerf.impressions).toBe(1);
    expect(budgetPerf.clicks).toBe(1);
    expect(budgetPerf.ctr).toBe(100);
    expect(budgetPerf.helpfulCount).toBe(1);
  });

  it("should categorize performance by confidence band (HIGH, MEDIUM, LOW)", () => {
    recommendationAnalytics.trackImpression(["hakone"], "HIGH", [], "en");
    recommendationAnalytics.trackImpression(["tokyo-skytree"], "LOW", [], "en");
    recommendationAnalytics.trackClick("hakone", 1, 95, "en");

    const report = computeQualityMetrics();

    expect(report.confidenceBandPerformance.HIGH.impressions).toBe(1);
    expect(report.confidenceBandPerformance.HIGH.clicks).toBe(1);
    expect(report.confidenceBandPerformance.HIGH.ctr).toBe(100);

    expect(report.confidenceBandPerformance.LOW.impressions).toBe(1);
    expect(report.confidenceBandPerformance.LOW.clicks).toBe(0);
    expect(report.confidenceBandPerformance.LOW.ctr).toBe(0);
  });

  it("should measure no-result and fallback frequencies", () => {
    recommendationAnalytics.trackNoResult(3, "en");
    recommendationAnalytics.trackFallback("no_weather_data", "ja");

    const report = computeQualityMetrics();

    expect(report.noResultCount).toBe(1);
    expect(report.fallbackCount).toBe(1);
  });

  it("should separate English and Japanese metrics", () => {
    recommendationAnalytics.trackImpression(["hakone"], "HIGH", [], "en");
    recommendationAnalytics.trackImpression(["nikko"], "HIGH", [], "ja");
    recommendationAnalytics.trackClick("nikko", 1, 80, "ja");

    const report = computeQualityMetrics();

    expect(report.localeBreakdown.en.impressions).toBe(1);
    expect(report.localeBreakdown.en.clicks).toBe(0);
    expect(report.localeBreakdown.en.ctr).toBe(0);

    expect(report.localeBreakdown.ja.impressions).toBe(1);
    expect(report.localeBreakdown.ja.clicks).toBe(1);
    expect(report.localeBreakdown.ja.ctr).toBe(100);
  });
});
