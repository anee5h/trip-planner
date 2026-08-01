import { describe, it, expect } from "vitest";
import {
  getRecommendations,
  getValidModes,
  scoreForCatalog,
} from "./RecommendationService";
import { matchesTripDuration } from "./RecommendationContext";
import type { Destination } from "@/shared/types/destination";

const mockDestinations = [
  {
    id: "hakone-onsen",
    name: "Hakone Onsen",
    prefecture: "Kanagawa",
    region: "Kanto",
    description: "Relaxing hot spring town with scenic mountain views",
    categories: ["Onsen", "Relaxing"],
    tags: ["Onsen", "Mountains", "Relaxing"],
    heroImage: "https://example.com/hakone.jpg",
    gallery: [],
    highlights: ["Hot Springs"],
    budgetMin: 15000,
    budgetRecommended: 20000,
    budgetMax: 30000,
    ratings: {
      overall: 4.8,
      food: 4.7,
      couple: 4.5,
      value: 4.6,
      summer: 4.0,
      winter: 4.0,
      rain: 4.0,
      photography: 4.0,
      relaxation: 4.0,
      uniqueness: 4.0,
    },
    bestSeason: "Autumn",
    coordinates: { lat: 35.2323, lng: 139.1069 },
    transportOptions: {
      train: 85,
      car: 90,
      my_car: 90,
    },
    totalTripHours: 8,
    walkingMin: 30,
    walkingSunMin: 10,
    walkingShadeMin: 20,
    indoorPercent: 70,
    crowd: { weekday: 3, weekend: 4, holiday: 5 },
    season: { spring: 4, summer: 3, autumn: 5, winter: 5 },
  },
  {
    id: "kamakura-history",
    name: "Kamakura Temples",
    prefecture: "Kanagawa",
    region: "Kanto",
    description: "Historic coastal town known for its Great Buddha",
    categories: ["Historic", "Culture"],
    tags: ["Historic", "Temples", "Culture"],
    heroImage: "https://example.com/kamakura.jpg",
    gallery: [],
    highlights: ["Great Buddha"],
    budgetMin: 5000,
    budgetRecommended: 8000,
    budgetMax: 15000,
    ratings: {
      overall: 4.6,
      food: 4.5,
      couple: 4.8,
      value: 4.7,
      summer: 4.0,
      winter: 4.0,
      rain: 4.0,
      photography: 4.0,
      relaxation: 4.0,
      uniqueness: 4.0,
    },
    bestSeason: "Spring",
    coordinates: { lat: 35.319, lng: 139.5467 },
    transportOptions: {
      train: 55,
      car: 70,
      my_car: 70,
    },
    totalTripHours: 6,
    walkingMin: 40,
    walkingSunMin: 25,
    walkingShadeMin: 15,
    indoorPercent: 30,
    crowd: { weekday: 3, weekend: 5, holiday: 5 },
    season: { spring: 5, summer: 4, autumn: 5, winter: 3 },
  },
  {
    id: "fuji-climbing",
    name: "Mount Fuji Summit",
    prefecture: "Shizuoka",
    region: "Chubu",
    description: "Challenging mountain hike to the top of Japan",
    categories: ["Nature", "Adventure"],
    tags: ["Mountains", "Hiking", "Adventure"],
    heroImage: "https://example.com/fuji.jpg",
    gallery: [],
    highlights: ["Summit View"],
    budgetMin: 25000,
    budgetRecommended: 45000,
    budgetMax: 70000,
    ratings: {
      overall: 4.9,
      food: 3.8,
      couple: 3.5,
      value: 4.4,
      summer: 4.0,
      winter: 4.0,
      rain: 4.0,
      photography: 4.0,
      relaxation: 4.0,
      uniqueness: 4.0,
    },
    bestSeason: "Summer",
    coordinates: { lat: 35.3606, lng: 138.7274 },
    transportOptions: {
      bus: 150,
      shinkansen: 60,
    },
    totalTripHours: 12,
    walkingMin: 240,
    walkingSunMin: 200,
    walkingShadeMin: 40,
    indoorPercent: 5,
    crowd: { weekday: 4, weekend: 5, holiday: 5 },
    season: { spring: 1, summer: 5, autumn: 2, winter: 1 },
  },
] as unknown as Destination[];

describe("RecommendationService Unit Tests", () => {
  const homeCoords = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station

  it("preserves canonical transport availability", () => {
    const results = getRecommendations(mockDestinations, {
      tripType: "any",
      budget: 50000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      currentWeatherCondition: "any",
      visitedIds: [],
      currentWeather: null,
      homeStationCoords: homeCoords,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain("hakone-onsen");
    expect(ids).toContain("kamakura-history");
    expect(ids).not.toContain("fuji-climbing");
  });

  it("returns recommendations for car-only searches with a budget tier", () => {
    const results = getRecommendations(mockDestinations, {
      tripType: "any",
      budget: 50_000,
      carMode: "rental",
      publicModes: [],
      partySize: 2,
      budgetTier: "standard",
      currentWeatherCondition: "any",
      visitedIds: [],
      currentWeather: null,
      homeStationCoords: homeCoords,
    });

    expect(results.map((result) => result.id)).toContain("hakone-onsen");
  });

  it("prioritizes rainy-friendly indoor/onsen destinations when weather is rainy", () => {
    const results = getRecommendations(mockDestinations, {
      tripType: "any",
      budget: 50000,
      carMode: "none",
      publicModes: ["train", "bus", "shinkansen"],
      partySize: 2,
      currentWeatherCondition: "Rainy",
      visitedIds: [],
      currentWeather: { temp: 18, desc: "Rainy" },
      homeStationCoords: homeCoords,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("hakone-onsen");
  });

  it("excludes destinations exceeding strict budget limits", () => {
    const results = getRecommendations(mockDestinations, {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train", "bus", "shinkansen"],
      partySize: 2,
      currentWeatherCondition: "any",
      visitedIds: [],
      currentWeather: null,
      homeStationCoords: homeCoords,
    });

    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("fuji-climbing");
    expect(
      results.every(
        (result) => (result.estimatedCostRange?.[1] ?? Infinity) <= 20000,
      ),
    ).toBe(true);
  });

  it("excludes already visited destination IDs when provided", () => {
    const results = getRecommendations(mockDestinations, {
      tripType: "any",
      budget: 100000,
      carMode: "none",
      publicModes: ["train", "bus", "shinkansen"],
      partySize: 2,
      currentWeatherCondition: "any",
      visitedIds: ["hakone-onsen"],
      currentWeather: null,
      homeStationCoords: homeCoords,
    });

    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("hakone-onsen");
  });

  it("filters destinations by the selected trip duration band", () => {
    const shortTrip = {
      ...mockDestinations[0],
      id: "short-trip",
      totalTripHours: 4,
    };
    const destinations = [...mockDestinations, shortTrip];
    const results = getRecommendations(destinations, {
      tripType: "any",
      budget: 100000,
      carMode: "none",
      publicModes: ["train", "bus", "shinkansen"],
      partySize: 2,
      currentWeatherCondition: "any",
      visitedIds: [],
      currentWeather: null,
      homeStationCoords: null,
      tripDuration: "halfDay",
    });

    expect(results.map((result) => result.id)).toContain("short-trip");
    expect(results.map((result) => result.id)).not.toContain("hakone-onsen");
    expect(matchesTripDuration(3, "shortOuting")).toBe(true);
    expect(matchesTripDuration(5, "halfDay")).toBe(true);
    expect(matchesTripDuration(8, "fullDay")).toBe(true);
    expect(matchesTripDuration(15, "weekend")).toBe(true);
  });

  it("correctly identifies valid transport modes with getValidModes", () => {
    const dest = mockDestinations[2]; // Mount Fuji (bus & shinkansen)
    const validModes = getValidModes(dest, "none", ["shinkansen"]);
    expect(validModes).toEqual(["shinkansen"]);

    const invalidModes = getValidModes(dest, "none", ["train"]);
    expect(invalidModes).toEqual([]);

    const economyModes = getValidModes(
      dest,
      "none",
      ["bus", "shinkansen"],
      undefined,
      "economy",
    );
    expect(economyModes).toEqual(["bus"]);
  });

  it("uses origin-aware transport when scoring the catalog", () => {
    const score = scoreForCatalog(mockDestinations[0], {
      tripType: "any",
      budget: 50000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: homeCoords,
    });

    expect(score).toBeGreaterThan(0);
  });

  it("does not invent unavailable origin-aware transport modes", () => {
    const results = getRecommendations([mockDestinations[2]], {
      tripType: "any",
      budget: 100000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: homeCoords,
    });

    expect(results).toEqual([]);
  });
});
