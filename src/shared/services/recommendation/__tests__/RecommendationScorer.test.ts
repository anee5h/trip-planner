import { describe, it, expect } from "vitest";
import { calculateConfidence, calculateScore } from "../RecommendationScorer";
import { normalizeWeatherDescription } from "../RecommendationContext";
import type { Destination } from "@/shared/types/destination";

const mockDest = {
  id: "test-dest",
  name: "Test Destination",
  prefecture: "Tokyo",
  region: "Kanto",
  description: "A lovely test place",
  categories: ["Onsen"],
  tags: ["Onsen"],
  heroImage: "",
  gallery: [],
  highlights: [],
  budgetMin: 5000,
  budgetRecommended: 10000,
  budgetMax: 15000,
  ratings: {
    overall: 8.5,
    food: 8.0,
    couple: 7.5,
    value: 8.0,
    summer: 5.0,
    winter: 5.0,
    rain: 5.0,
    photography: 8.0,
    relaxation: 8.0,
    uniqueness: 8.0,
  },
  bestSeason: "Spring",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  transportOptions: { train: 60 },
  totalTripHours: 4,
  walkingMin: 30,
  walkingSunMin: 15,
  walkingShadeMin: 15,
  indoorPercent: 50,
  crowd: { weekday: 2, weekend: 4, holiday: 5 },
  season: { spring: 5, summer: 3, autumn: 4, winter: 2 },
} as unknown as Destination;

describe("RecommendationScorer Unit Tests", () => {
  it("computes confidence score bound between 15 and 99", () => {
    expect(calculateConfidence(-100)).toBe(15);
    expect(calculateConfidence(1000)).toBe(99);
    expect(calculateConfidence(60)).toBe(50);
  });

  it("calculates score with default context options", () => {
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
    };
    const res = calculateScore(mockDest, context);
    expect(res.score).toBeGreaterThan(0);
    expect(res.bestMode).toBe("train");
  });

  it("applies +25 boost for thumbs up and -1000 penalty for thumbs down", () => {
    const baseContext = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
    };
    const baseScore = calculateScore(mockDest, baseContext).score;

    const upScore = calculateScore(mockDest, {
      ...baseContext,
      userRatings: { "test-dest": "up" },
    }).score;
    expect(upScore).toBe(baseScore + 25);

    const downScore = calculateScore(mockDest, {
      ...baseContext,
      userRatings: { "test-dest": "down" },
    }).score;
    expect(downScore).toBe(baseScore - 1000);
  });

  it("keeps confidence monotonic and bounded across score bands", () => {
    const scores = [-100, 0, 60, 120, 240];
    const confidences = scores.map(calculateConfidence);

    expect(confidences).toEqual([15, 15, 50, 99, 99]);
    expect(confidences).toEqual([...confidences].sort((a, b) => a - b));
  });

  it("normalizes forecast descriptions and keeps preferred weather independent", () => {
    expect(normalizeWeatherDescription("Light drizzle")).toBe("rainy");
    expect(normalizeWeatherDescription("Thunderstorm")).toBe("stormy");

    const base = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      visitedIds: [],
      weather: {
        actual: { condition: "rainy" as const, temperatureC: 18 },
        preferred: "any" as const,
      },
    };
    const rainyPreference = calculateScore(
      {
        ...mockDest,
        comfort: { heatTolerance: 5, rainFriendly: 9, walkingIntensity: 5 },
      },
      {
        ...base,
        weather: { ...base.weather, preferred: "rainy" },
      },
    ).score;
    const noPreference = calculateScore(mockDest, base).score;
    expect(rainyPreference).not.toBe(noPreference);
  });
});
