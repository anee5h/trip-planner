import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { recommendationConfidenceScorer } from "../RecommendationConfidenceScorer";

describe("RecommendationConfidenceScorer Unit Tests", () => {
  const mockFullDestination: Destination = {
    id: "hakone-onsen",
    name: "Hakone Onsen",
    englishName: "Hakone Onsen",
    prefecture: "Kanagawa",
    region: "Kanto",
    areaId: "hakone",
    description: "Famous hot spring town.",
    englishDescription: "Famous hot spring town.",
    category: "nature",
    tags: ["onsen", "mountains"],
    officialWebsite: "https://www.hakone.or.jp/",
    source: {
      websiteUrl: "https://www.hakone.or.jp/",
      verifiedAt: "2026-01-15",
    },
    costEstimates: {
      solo: 12000,
      couple: 22000,
      family: 38000,
    },
    accessInfo: "Odakyu Romancecar from Shinjuku",
  } as unknown as Destination;

  const mockMinimalDestination: Destination = {
    id: "minimal-place",
    name: "Minimal Place",
    englishName: "Minimal Place",
    prefecture: "Tokyo",
    region: "Kanto",
    areaId: "tokyo",
  } as unknown as Destination;

  it("should return identical deterministic confidence for identical inputs", () => {
    const res1 = recommendationConfidenceScorer.calculateConfidence(
      mockFullDestination,
      { hasWeatherData: true, hasTransportData: true, hasBudgetData: true },
    );
    const res2 = recommendationConfidenceScorer.calculateConfidence(
      mockFullDestination,
      { hasWeatherData: true, hasTransportData: true, hasBudgetData: true },
    );

    expect(res1.overallConfidence).toBe(res2.overallConfidence);
    expect(res1.confidenceBand).toBe(res2.confidenceBand);
    expect(res1.confidenceBand).toBe("HIGH");
  });

  it("should lower confidence predictably when weather or transport data is missing", () => {
    const fullRes = recommendationConfidenceScorer.calculateConfidence(
      mockFullDestination,
      { hasWeatherData: true, hasTransportData: true },
    );
    const missingRes = recommendationConfidenceScorer.calculateConfidence(
      mockFullDestination,
      { hasWeatherData: false, hasTransportData: false },
    );

    expect(missingRes.overallConfidence).toBeLessThan(
      fullRes.overallConfidence,
    );
  });

  it("should handle malformed or null destination inputs gracefully with fallback confidence", () => {
    const res = recommendationConfidenceScorer.calculateConfidence(
      null as unknown as Destination,
    );

    expect(res.dataConfidence).toBe(0.3);
    expect(res.recommendationConfidence).toBe(0.3);
    expect(res.confidenceBand).toBe("LOW");
  });

  it("should correctly classify confidence bands (HIGH, MEDIUM, LOW)", () => {
    const highRes = recommendationConfidenceScorer.calculateConfidence(
      mockFullDestination,
      { hasWeatherData: true, hasTransportData: true, hasBudgetData: true },
    );
    expect(highRes.confidenceBand).toBe("HIGH");

    const lowRes = recommendationConfidenceScorer.calculateConfidence(
      mockMinimalDestination,
      { hasWeatherData: false },
    );
    expect(lowRes.confidenceBand).toBe("LOW");
  });
});
