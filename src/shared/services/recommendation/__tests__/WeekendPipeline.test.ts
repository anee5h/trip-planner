import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import type { RecommendationContext } from "../RecommendationContext";

// ── Helpers ──────────────────────────────────────────────────────────────────

type DestOverrides = Omit<Partial<Destination>, "ratings"> & {
  id: string;
  ratings?: Partial<Destination["ratings"]>;
};

function dest(overrides: DestOverrides): Destination {
  return {
    name: overrides.name ?? overrides.id,
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "",
    description: "",
    highlights: [],
    budgetRecommended: 5000,
    budgetMin: 3000,
    budgetMax: 10000,
    transportOptions: {},
    totalTripHours: 4,
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 50,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
    ...overrides,
    id: overrides.id,
  } as unknown as Destination;
}

const tokyoHome = { lat: 35.6812, lng: 139.7671 };

function ctx(
  overrides: Partial<RecommendationContext> = {},
): RecommendationContext {
  return {
    budget: 50000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    visitedIds: [],
    homeStationCoords: tokyoHome,
    ...overrides,
  };
}

// ── Day-trip parity ──────────────────────────────────────────────────────────

describe("runRecommendationPipeline — day-trip parity", () => {
  const d1 = dest({
    id: "d1",
    transportOptions: { train: 40 },
    recommendedVisitHours: { min: 2, max: 3 },
    ratings: { overall: 4.5, food: 4.5, summer: 5, winter: 5 },
  });

  const d2 = dest({
    id: "d2",
    transportOptions: { train: 60 },
    recommendedVisitHours: { min: 1, max: 2 },
    ratings: { overall: 4.0, food: 4.0, summer: 5, winter: 5 },
  });

  it("tripMode undefined vs 'day_trip' → identical scores, order, reasons", () => {
    const ctxDefault = ctx({ tripMode: undefined });
    const ctxDayTrip = ctx({ tripMode: "day_trip" });

    const resDefault = runRecommendationPipeline([d1, d2], ctxDefault);
    const resDayTrip = runRecommendationPipeline([d1, d2], ctxDayTrip);

    expect(resDefault.length).toBe(resDayTrip.length);
    for (let i = 0; i < resDefault.length; i++) {
      expect(resDefault[i].id).toBe(resDayTrip[i].id);
      expect(resDefault[i].score).toBe(resDayTrip[i].score);
      expect(resDefault[i].match.reasons.length).toBe(
        resDayTrip[i].match.reasons.length,
      );
    }
  });
});

// ── Weekend mode ─────────────────────────────────────────────────────────────

describe("runRecommendationPipeline — weekend mode", () => {
  it("excludes destination with one-way > 420 minutes", () => {
    const far = dest({
      id: "far",
      transportOptions: { train: 421 },
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min → sufficient capacity
    });
    const close = dest({
      id: "close",
      transportOptions: { train: 180 },
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const results = runRecommendationPipeline(
      [far, close],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("far");
    expect(ids).toContain("close");
  });

  it("includes destination at exactly 420 minutes", () => {
    const edge = dest({
      id: "edge",
      transportOptions: { train: 420 },
      recommendedVisitHours: { min: 1, max: 10 },
    });

    // Budget must admit the verified 420-minute round trip + full-day meals;
    // the travel-policy boundary itself is covered in WeekendPolicy.test.ts.
    const results = runRecommendationPipeline(
      [edge],
      ctx({ tripMode: "weekend_2d1n", budget: 100000 }),
    );
    expect(results.map((r) => r.id)).toContain("edge");
  });

  it("excludes destination with capacity < 480 but includes >= 480 (hub + children)", () => {
    const hub = dest({
      id: "hub",
      recommendedVisitHours: { min: 1, max: 2 }, // 120 min own
      transportOptions: { train: 90 },
    });
    const child = dest({
      id: "child",
      recommendedVisitHours: { min: 1, max: 8 }, // 480 min
      transportOptions: { train: 90 },
      relationships: { parentDestinationId: "hub" },
    });

    // hub + child in pool: childrenSum = 480 >= own 120 → minutes = 480, eligible
    const results = runRecommendationPipeline(
      [hub, child],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    expect(results.map((r) => r.id)).toContain("hub");

    // hub alone in pool: own 120 < 480 → ineligible
    const resultsAlone = runRecommendationPipeline(
      [hub],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    expect(resultsAlone.map((r) => r.id)).not.toContain("hub");
  });

  it("standalone destination with capacity >= 480 included", () => {
    const solo = dest({
      id: "solo",
      recommendedVisitHours: { min: 1, max: 9 }, // 540 min
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [solo],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    expect(results.map((r) => r.id)).toContain("solo");
  });

  it("standalone destination with capacity < 480 excluded", () => {
    const small = dest({
      id: "small",
      recommendedVisitHours: { min: 1, max: 2 }, // 120 min
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [small],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    expect(results.map((r) => r.id)).not.toContain("small");
  });

  it("attaches weekend metadata to results", () => {
    const d = dest({
      id: "d",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 20000,
        weather: {
          days: [
            { date: "2026-08-05", condition: "clear" },
            { date: "2026-08-06", condition: "cloudy" },
          ],
        },
      }),
    );

    expect(results).toHaveLength(1);
    const weekend = results[0].weekend;
    expect(weekend).toBeDefined();
    expect(weekend!.travelFit.band).toBe("strong");
    expect(weekend!.capacity.activityMinutes).toBe(600);
    expect(weekend!.weatherDays).toHaveLength(2);
    expect(weekend!.accommodationAllowance).toBe(20000);
  });

  it("day-trip results have no weekend metadata", () => {
    const d = dest({
      id: "d",
      transportOptions: { train: 40 },
      recommendedVisitHours: { min: 2, max: 3 },
    });

    const results = runRecommendationPipeline([d], ctx());
    expect(results).toHaveLength(1);
    expect(results[0].weekend).toBeUndefined();
  });

  it("day-trip unchanged with weekend-only context fields present", () => {
    const d = dest({
      id: "d",
      transportOptions: { train: 40 },
      recommendedVisitHours: { min: 2, max: 3 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({
        // weekend-specific fields
        accommodationAllowance: 15000,
        weather: {
          days: [{ date: "2026-08-05", condition: "clear" }],
        },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].weekend).toBeUndefined();
  });

  it("weekend result includes weekendTripReady reason", () => {
    const d = dest({
      id: "d",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    expect(results).toHaveLength(1);
    const codes = results[0].match.reasons.map((r) => r.code);
    expect(codes).toContain("weekendTripReady");
  });

  it("weekend scoring contributions appear in pipeline", () => {
    const d = dest({
      id: "d",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({ tripMode: "weekend_2d1n" }),
    );
    expect(results).toHaveLength(1);
    const contribs = results[0].pipeline.scoreContributions;
    expect(contribs).toHaveProperty("weekendTravel");
    expect(contribs).toHaveProperty("weekendCapacity");
    expect(contribs).toHaveProperty("weekendWeather");
    expect(contribs.total).toBeGreaterThan(0);
  });
});

// ── Weekend transport-excluded reason ────────────────────────────────────────

describe("runRecommendationPipeline — weekend transport excluded reason", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("appends weekendTransportExcluded when budgetResult.transportIncluded is false", async () => {
    // Use dynamic import so we can mock before the module loads
    const budget = await import("@/shared/services/budget/BudgetService");
    const spy = vi.spyOn(budget, "getEstimatedBudgetRange");
    spy.mockReturnValue({
      range: [5000, 8000],
      transportIncluded: false,
    });

    // Re-import the pipeline to pick up the mock
    const { runRecommendationPipeline: pipeline } =
      await import("../RecommendationPipeline");

    const d = dest({
      id: "d",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = pipeline([d], ctx({ tripMode: "weekend_2d1n" }));
    expect(results).toHaveLength(1);
    const codes = results[0].match.reasons.map((r) => r.code);
    expect(codes).toContain("weekendTransportExcluded");

    spy.mockRestore();
  });
});
