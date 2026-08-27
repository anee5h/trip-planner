import { describe, expect, it, vi } from "vitest";
import { calculateScore } from "../RecommendationScorer";
import { createRecommendationMatch } from "../RecommendationExplainability";
import { getTransportCost } from "@/shared/services/budget/BudgetService";
import type { Destination } from "@/shared/types/destination";

const { engineCalls } = vi.hoisted(() => ({
  engineCalls: [] as unknown[][],
}));

vi.mock("@/shared/services/budget/tripCostEngine", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/shared/services/budget/tripCostEngine")
    >();
  return {
    ...actual,
    calculateTripCost: (
      ...args: Parameters<typeof actual.calculateTripCost>
    ) => {
      engineCalls.push(args);
      return actual.calculateTripCost(...args);
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

function modeCallsFromEngine(): string[] {
  // Each calculateTripCost call carries { mode } in args[0].
  return engineCalls
    .map((args) => (args[0] as { mode?: string }).mode)
    .filter((m): m is string => Boolean(m));
}

describe("per-mode budget consistency", () => {
  it("scoring prices every mode with its own duration, never a shared all-mode total", () => {
    engineCalls.length = 0;
    const scoreResult = calculateScore(twoModeDest, context());

    const modes = modeCallsFromEngine();
    expect(modes).toContain("train");
    expect(modes).toContain("shinkansen");
    expect(scoreResult.bestMode).toBeTruthy();
    // KAI-217B: the canonical engine prices each mode with its own
    // context (mode passed per call) — never a shared all-mode total.
    for (const args of engineCalls) {
      expect((args[0] as { mode?: string }).mode).toBeTruthy();
    }
  });

  it("explainability prices the same per-mode budget contract", () => {
    engineCalls.length = 0;
    createRecommendationMatch(twoModeDest, context(), 85);

    const modes = modeCallsFromEngine();
    expect(modes).toContain("train");
    expect(modes).toContain("shinkansen");
    for (const args of engineCalls) {
      expect((args[0] as { mode?: string }).mode).toBeTruthy();
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

  it("rental and personal car costs are UNAVAILABLE without an origin-specific car model (KAI-216 round-2)", () => {
    // KAI-216 round-2: a static destination-level car estimate has NO origin
    // identity and NO verified provenance — canonical unavailable for both
    // car and my_car (the engine stays partial) until an origin-specific
    // defensible car model exists. The rental-vs-personal differentiation
    // cannot be claimed from the static transportFares value.
    const rental = getTransportCost(carDest, "car", 2, undefined, undefined, 8);
    const personal = getTransportCost(
      carDest,
      "my_car",
      2,
      undefined,
      undefined,
      8,
    );
    expect(rental).toBeNull();
    expect(personal).toBeNull();
  });
});
