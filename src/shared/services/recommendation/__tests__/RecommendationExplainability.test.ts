import { describe, it, expect } from "vitest";
import { createRecommendationMatch } from "../RecommendationExplainability";
import type { Destination } from "@/shared/types/destination";

const baseDest = {
  id: "test",
  name: "Hakone Onsen",
  prefecture: "Kanagawa",
  region: "Kanto",
  description: "Beautiful scenic hot springs",
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
    couple: 8.0,
    relaxation: 8.0,
    food: 5,
    value: 5,
    summer: 5,
    winter: 5,
    rain: 5,
    photography: 5,
    uniqueness: 5,
  },
  bestSeason: "Spring",
  coordinates: { lat: 35.2323, lng: 139.1069 },
  transportOptions: { train: 45 },
  totalTripHours: 4,
  walkingMin: 30,
  walkingSunMin: 15,
  walkingShadeMin: 15,
  indoorPercent: 80,
  crowd: { weekday: 1, weekend: 2, holiday: 3 },
  season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
} as unknown as Destination;

describe("RecommendationExplainability Unit Tests", () => {
  it("generates match object with budget and train transport explanations", () => {
    const context = {
      tripType: "any",
      budget: 15000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
    };
    const match = createRecommendationMatch(baseDest, context, 85);
    expect(match.confidence).toBe(71);
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(match.reasons[0].title).toBe("Great Value");
    expect(match.reasons[1].title).toBe("Fast Train Access");
  });

  it("explains weather from the current recommendation context", () => {
    const match = createRecommendationMatch(
      baseDest,
      {
        tripType: "any",
        budget: 15000,
        carMode: "none",
        publicModes: ["train"],
        partySize: 1,
        visitedIds: [],
        weather: {
          actual: { condition: "rainy", temperatureC: 18 },
          preferred: "rainy",
        },
      },
      85,
    );

    expect(
      match.reasons.some((reason) => reason.code === "weatherRainFriendly"),
    ).toBe(true);
    expect(match.matchedPreferences).toContain("weather");
  });
});
