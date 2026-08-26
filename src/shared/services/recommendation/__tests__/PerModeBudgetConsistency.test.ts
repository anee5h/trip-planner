import { describe, expect, it, vi } from "vitest";
import { calculateScore } from "../RecommendationScorer";
import { createRecommendationMatch } from "../RecommendationExplainability";
import { getTransportCost } from "@/shared/services/budget/BudgetService";
import type { Destination } from "@/shared/types/destination";

const { budgetCalls } = vi.hoisted(() => ({
  budgetCalls: [] as unknown[][],
}));

vi.mock("@/shared/services/budget/BudgetService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/shared/services/budget/BudgetService")
    >();
  return {
    ...actual,
    getEstimatedBudgetRange: (
      ...args: Parameters<typeof actual.getEstimatedBudgetRange>
    ) => {
      budgetCalls.push(args);
      return actual.getEstimatedBudgetRange(...args);
    },
  };
});

const OSAKA = { lat: 34.6937, lng: 135.5023 };

const twoModeDest = {
  id: "kyoto-two-mode",
  name: "Kyoto Two Mode",
  prefecture: "Kyoto",
  region: "Kansai",
  municipalityId: "Kyoto:kyoto",
  categories: ["History"],
  tags: ["History"],
  heroImage: "",
  gallery: [],
  highlights: ["History"],
  budgetMin: 5000,
  budgetRecommended: 10000,
  budgetMax: 15000,
  budgetBreakdown: { transport: 1000, tickets: 2000, food: 1500, cafe: 500 },
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
  coordinates: { lat: 35.0116, lng: 135.7681 },
  transportOptions: { train: 60, shinkansen: 30 },
  recommendedVisitHours: { min: 4, max: 4 },
  totalTripHours: 8,
  walkingMin: 30,
  walkingSunMin: 15,
  walkingShadeMin: 15,
  indoorPercent: 50,
  crowd: { weekday: 2, weekend: 4, holiday: 5 },
  season: { spring: 5, summer: 3, autumn: 4, winter: 2 },
} as unknown as Destination;

function context() {
  return {
    tripType: "any",
    budget: 200000,
    carMode: "none",
    publicModes: ["train", "shinkansen"],
    partySize: 1,
    currentWeatherCondition: "any",
    visitedIds: [],
    homeStationCoords: OSAKA,
    originZoneId: "mainland-honshu" as const,
    budgetTier: "standard" as const,
  };
}

function modeDurationsFromCalls(): string[] {
  return budgetCalls.map((args) => args[1] as string);
}

describe("per-mode budget consistency", () => {
  it("scoring prices every mode with its own duration, never a shared all-mode total", () => {
    budgetCalls.length = 0;
    const scoreResult = calculateScore(twoModeDest, context());

    const modes = modeDurationsFromCalls();
    expect(modes).toContain("train");
    expect(modes).toContain("shinkansen");
    expect(scoreResult.bestMode).toBeTruthy();
    for (const args of budgetCalls) {
      // KAI-50: no explicit duration argument is passed; the budget service
      // derives exactly the requested mode's duration internally.
      expect(args.length).toBeLessThanOrEqual(6);
      expect(typeof args[4]).not.toBe("number");
    }
  });

  it("explainability prices the same per-mode budget contract", () => {
    budgetCalls.length = 0;
    createRecommendationMatch(twoModeDest, context(), 85);

    const modes = modeDurationsFromCalls();
    expect(modes).toContain("train");
    expect(modes).toContain("shinkansen");
    for (const args of budgetCalls) {
      expect(args.length).toBeLessThanOrEqual(6);
      expect(typeof args[4]).not.toBe("number");
    }
  });
});

describe("car ownership budget semantics (KAI-63 D11)", () => {
  const carDest = {
    id: "car-ownership-dest",
    name: "Car Ownership Dest",
    prefecture: "Kanagawa",
    region: "Kanto",
    categories: [],
    tags: [],
    heroImage: "",
    gallery: [],
    highlights: [],
    budgetMin: 3000,
    budgetRecommended: 5000,
    budgetMax: 10000,
    transportOptions: { car: 60, my_car: 60 },
    totalTripHours: 8,
    // KAI-216: car/my_car costs exist ONLY via an explicit verified
    // transportFares vehicle total (round trip per car). The old
    // drive-min→km→toll heuristic is removed. Rental (car) is priced higher
    // than personal (my_car) vehicle totals.
    transportFares: { car: 12000, my_car: 6000 },
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 50,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
    coordinates: { lat: 35.5, lng: 139.6 },
  } as unknown as Destination;

  it("rental car prices include the rental fee; personal car does not", () => {
    // Same car trip, same explicit 8 h mode duration: the single Car chip
    // maps to "rental" (fee included) or "my_car" (tolls/fuel only) via the
    // user's carOwnership preference — the two budget models must differ.
    const rental = getTransportCost(carDest, "car", 2, undefined, undefined, 8);
    const personal = getTransportCost(
      carDest,
      "my_car",
      2,
      undefined,
      undefined,
      8,
    );
    expect(rental).not.toBeNull();
    expect(personal).not.toBeNull();
    expect(rental!).toBeGreaterThan(personal!);
  });
});
