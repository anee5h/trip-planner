import { describe, it, expect } from "vitest";
import {
  createRecommendationMatch,
  getPrimaryDisplayReason,
} from "../RecommendationExplainability";
import type { MatchReason } from "../RecommendationTypes";
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
  budgetBreakdown: { transport: 1000, tickets: 1000, food: 3000, cafe: 1500 },
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
  recommendedVisitHours: { min: 1, max: 3 },
  totalTripHours: 4,
  walkingMin: 30,
  walkingSunMin: 15,
  walkingShadeMin: 15,
  indoorPercent: 80,
  crowd: { weekday: 1, weekend: 2, holiday: 3 },
  season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
} as unknown as Destination;

describe("RecommendationExplainability Unit Tests", () => {
  it("selects a specific interest over an earlier budget reason without reordering reasons", () => {
    const reasons: MatchReason[] = [
      {
        type: "Budget",
        code: "budgetWithin",
        title: "Within Budget",
      },
      {
        type: "Interest",
        code: "interestNature",
        title: "Nature Escape",
      },
    ];

    expect(getPrimaryDisplayReason(reasons)?.code).toBe("interestNature");
    expect(reasons.map((reason) => reason.code)).toEqual([
      "budgetWithin",
      "interestNature",
    ]);
  });

  it("keeps the weekend weather, travel, capacity, ready priority", () => {
    const reasons: MatchReason[] = [
      {
        type: "Budget",
        code: "budgetWithin",
        title: "Within Budget",
      },
      {
        type: "Weekend",
        code: "weekendCapacityStrong",
        title: "Plenty to Do",
      },
      {
        type: "Weekend",
        code: "weekendWeatherDayRain",
        title: "Indoor Options Available",
      },
    ];

    expect(getPrimaryDisplayReason(reasons, { weekend: true })?.code).toBe(
      "weekendWeatherDayRain",
    );
  });

  it("generates match object with budget and train transport explanations", () => {
    const context = {
      tripType: "any",
      budget: 15000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
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
        destinationWeather: {
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

  it("does not claim 'Highly recommended' or rating-derived reasons for unverified ratings", () => {
    // baseDest has overall 8.5 but NO ratingMetadata: with a minimal context
    // (no budget/transport reasons) the general reason must degrade to the
    // neutral Solid Match and the editorial-review disclosure must fire
    // (REC-002). Rating-derived interest/weather reasons must not fire.
    const minimalContext = {
      tripType: "food",
      budget: 0,
      carMode: "none",
      publicModes: [],
      partySize: 1,
      visitedIds: [],
    };
    const match = createRecommendationMatch(
      {
        ...baseDest,
        ratings: { ...baseDest.ratings, overall: 9.5, food: 9.6 },
      },
      minimalContext,
      85,
    );

    expect(
      match.reasons.some((reason) => reason.code === "generalHighlyRated"),
    ).toBe(false);
    expect(
      match.reasons.some((reason) => reason.code === "generalSolidMatch"),
    ).toBe(true);
    expect(match.reasons.some((reason) => reason.code === "interestFood")).toBe(
      false,
    );
    expect(
      match.reasons.some((reason) => reason.code === "editorialReviewPending"),
    ).toBe(true);
  });

  it("keeps rating-derived reasons for verified (high/medium-confidence) ratings", () => {
    const verifiedDest = {
      ...baseDest,
      ratings: { ...baseDest.ratings, overall: 9.5, food: 9.6 },
      ratingMetadata: {
        rubricVersion: 2,
        method: "manual" as const,
        confidence: "high" as const,
      },
    };
    const minimalContext = {
      tripType: "food",
      budget: 0,
      carMode: "none",
      publicModes: [],
      partySize: 1,
      visitedIds: [],
    };
    const match = createRecommendationMatch(verifiedDest, minimalContext, 85);

    expect(match.reasons.some((reason) => reason.code === "interestFood")).toBe(
      true,
    );
    expect(
      match.reasons.some((reason) => reason.code === "editorialReviewPending"),
    ).toBe(false);
  });

  it("emits generalHighlyRated only for verified overall >= 8.5", () => {
    const minimalContext = {
      tripType: "any",
      budget: 0,
      carMode: "none",
      publicModes: [],
      partySize: 1,
      visitedIds: [],
    };
    const unverified = createRecommendationMatch(
      { ...baseDest, ratings: { ...baseDest.ratings, overall: 9.5 } },
      minimalContext,
      85,
    );
    expect(
      unverified.reasons.some((reason) => reason.code === "generalHighlyRated"),
    ).toBe(false);
    expect(
      unverified.reasons.some((reason) => reason.code === "generalSolidMatch"),
    ).toBe(true);

    const verified = createRecommendationMatch(
      {
        ...baseDest,
        ratings: { ...baseDest.ratings, overall: 9.5 },
        ratingMetadata: {
          rubricVersion: 2,
          method: "manual",
          confidence: "high" as const,
        },
      },
      minimalContext,
      85,
    );
    expect(
      verified.reasons.some((reason) => reason.code === "generalHighlyRated"),
    ).toBe(true);
  });
});
