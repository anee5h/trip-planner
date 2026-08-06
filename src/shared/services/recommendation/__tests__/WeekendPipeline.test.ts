import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { RecommendationContext } from "../RecommendationContext";

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

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
    expect(weekend!.travelFit.band).toBe("nearby");
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

  it("ranks 2 good-weather days above 1 good + 1 stormy for the same destination", () => {
    const d = dest({
      id: "weather-compare",
      transportOptions: { train: 90 },
      indoorPercent: 30,
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const clearCtx = ctx({
      tripMode: "weekend_2d1n",
      weather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "cloudy" },
        ],
      },
    });
    const stormyCtx = ctx({
      tripMode: "weekend_2d1n",
      weather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "stormy" },
        ],
      },
    });

    const clearResults = runRecommendationPipeline([d], clearCtx);
    const stormyResults = runRecommendationPipeline([d], stormyCtx);

    expect(clearResults).toHaveLength(1);
    expect(stormyResults).toHaveLength(1);

    const clearScore = clearResults[0].score;
    const stormyScore = stormyResults[0].score;
    expect(clearScore).toBeGreaterThan(stormyScore);
  });

  it("indoor-heavy destination penalized less than outdoor-heavy for identical stormy weather", () => {
    const indoorDest = dest({
      id: "indoor-heavy",
      transportOptions: { train: 90 },
      indoorPercent: 85,
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const outdoorDest = dest({
      id: "outdoor-heavy",
      transportOptions: { train: 90 },
      indoorPercent: 10,
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const stormyCtx = ctx({
      tripMode: "weekend_2d1n",
      weather: {
        days: [
          { date: "2026-08-05", condition: "stormy" },
          { date: "2026-08-06", condition: "rainy" },
        ],
      },
    });

    const indoorResults = runRecommendationPipeline([indoorDest], stormyCtx);
    const outdoorResults = runRecommendationPipeline([outdoorDest], stormyCtx);

    expect(indoorResults).toHaveLength(1);
    expect(outdoorResults).toHaveLength(1);

    const indoorWeatherScore =
      indoorResults[0].pipeline.scoreContributions.weekendWeather;
    const outdoorWeatherScore =
      outdoorResults[0].pipeline.scoreContributions.weekendWeather;
    // Indoor-heavy should have a less negative weather contribution
    expect(indoorWeatherScore).toBeGreaterThan(outdoorWeatherScore);
  });
});

// ── Weekend transport-excluded reason ────────────────────────────────────────

describe("runRecommendationPipeline — weekend transport excluded reason", () => {
  // Real production fixture: Ishigaki from Fukuoka has a verified flight route
  // (FUK→ISG) whose fare is unverified (costUnavailable), so the pipeline must
  // retain the candidate but mark transport excluded — never zero-cost.
  it("appends weekendTransportExcluded when transport cost is genuinely unavailable", () => {
    const ishigaki = byId.get("ishigaki-city")!;
    const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
    const budgetEst = getEstimatedBudgetRange(
      ishigaki,
      "flight",
      2,
      "standard",
      ishigaki.totalTripHours,
      FUKUOKA,
    );
    expect(budgetEst.transportIncluded).toBe(false);

    const results = runRecommendationPipeline([ishigaki], {
      vibe: "any",
      budget: 500000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: FUKUOKA,
      originZoneId: "mainland-kyushu",
      tripMode: "weekend_2d1n",
    });

    expect(results.map((r) => r.id)).toContain("ishigaki-city");
    const result = results[0];
    expect(result.estimatedCostTransportIncluded).toBe(false);
    expect(result.weekend?.estimatedCostTransportIncluded).toBe(false);
    const codes = result.match.reasons.map((r) => r.code);
    expect(codes).toContain("weekendTransportExcluded");
  });
});

describe("visit-duration matching (origin-invariant)", () => {
  it.skip("a 2-hour destination matches shortOuting from any origin", () => {
    const d = dest({
      id: "2h-dest",
      recommendedVisitHours: { min: 1.5, max: 2.5 },
      transportOptions: { train: 60 },
    });
    // Tokyo origin
    const tokyoResult = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "shortOuting",
        homeStationCoords: { lat: 35.6812, lng: 139.7671 },
      }),
    );
    expect(tokyoResult).toHaveLength(1);
    // Osaka origin
    const osakaResult = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "shortOuting",
        homeStationCoords: { lat: 34.6937, lng: 135.5023 },
      }),
    );
    expect(osakaResult).toHaveLength(1);
    // No origin
    const noOriginResult = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "shortOuting",
        homeStationCoords: undefined,
      }),
    );
    expect(noOriginResult).toHaveLength(1);
  });

  it("halfDay returns results matching the visit-time band", () => {
    const d = dest({
      id: "half-day-dest",
      recommendedVisitHours: { min: 3, max: 5 },
      transportOptions: { train: 60 },
    });
    const result = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "halfDay",
        homeStationCoords: { lat: 35.6812, lng: 139.7671 },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("fullDay returns results matching the visit-time band", () => {
    const d = dest({
      id: "full-day-dest",
      recommendedVisitHours: { min: 6, max: 8 },
      transportOptions: { train: 90 },
    });
    const result = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "fullDay",
        homeStationCoords: { lat: 35.6812, lng: 139.7671 },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("missing visit duration stays under Any but not specific filters", () => {
    const d = dest({
      id: "no-visit",
      recommendedVisitHours: undefined,
      totalTripHours: 6,
      transportOptions: { train: 40 },
    });
    const anyResult = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "any",
        homeStationCoords: { lat: 35.6812, lng: 139.7671 },
      }),
    );
    expect(anyResult).toHaveLength(1);
    const halfDayResult = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "halfDay",
        homeStationCoords: { lat: 35.6812, lng: 139.7671 },
      }),
    );
    expect(halfDayResult).toHaveLength(0);
  });
});

describe("weekend weather 2-day enforcement", () => {
  it("a third weather day has no effect on weekend scoring", () => {
    const d = dest({
      id: "weather-dest",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });
    const twoDayResult = runRecommendationPipeline(
      [d],
      ctx({
        tripMode: "weekend_2d1n",
        budget: 200000,
        weather: {
          days: [
            { date: "2026-08-05", condition: "clear" },
            { date: "2026-08-06", condition: "rainy" },
          ],
        },
      }),
    );
    const threeDayResult = runRecommendationPipeline(
      [d],
      ctx({
        tripMode: "weekend_2d1n",
        budget: 200000,
        weather: {
          days: [
            { date: "2026-08-05", condition: "clear" },
            { date: "2026-08-06", condition: "rainy" },
            { date: "2026-08-07", condition: "stormy" },
          ],
        },
      }),
    );
    expect(twoDayResult).toHaveLength(1);
    expect(threeDayResult).toHaveLength(1);
    // The third stormy day must not change the weather score
    expect(twoDayResult[0].estimatedCostRange).toEqual(
      threeDayResult[0].estimatedCostRange,
    );
  });
});

// ── Origin-local exclusion (real fixtures) ───────────────────────────────────

describe("runRecommendationPipeline — origin-local exclusion (real fixtures)", () => {
  const SHINJUKU = { lat: 35.6897, lng: 139.7006 };
  const OSAKA = { lat: 34.7025, lng: 135.4959 };

  // budget 200000 keeps the budget gate (pipeline lines 189-198) from
  // excluding candidates for unrelated reasons.

  it("Osaka City base + Osaka City destination excluded in 2D1N; Kyoto kept", () => {
    const results = runRecommendationPipeline(
      [byId.get("osaka-city")!, byId.get("kyoto-city")!],
      ctx({
        tripMode: "weekend_2d1n",
        budget: 200000,
        homeStationCoords: OSAKA,
      }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("osaka-city");
    expect(ids).toContain("kyoto-city");
  });

  it("Shinjuku base + Shinjuku Ward excluded in 2D1N; Shibuya kept", () => {
    const results = runRecommendationPipeline(
      [byId.get("shinjuku-city")!, byId.get("shibuya-city")!],
      ctx({
        tripMode: "weekend_2d1n",
        budget: 200000,
        homeStationCoords: SHINJUKU,
      }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("shinjuku-city");
    expect(ids).toContain("shibuya-city");
  });

  it("Shinjuku base + Shibuya Ward eligible (different municipality)", () => {
    const results = runRecommendationPipeline(
      [byId.get("shinjuku-city")!, byId.get("shibuya-city")!],
      ctx({
        tripMode: "weekend_2d1n",
        budget: 200000,
        homeStationCoords: SHINJUKU,
      }),
    );
    expect(results.map((r) => r.id)).toContain("shibuya-city");
  });

  it("Shinjuku base + Taito Ward eligible (different municipality)", () => {
    const results = runRecommendationPipeline(
      [byId.get("shinjuku-city")!, byId.get("taito-city")!],
      ctx({
        tripMode: "weekend_2d1n",
        budget: 200000,
        homeStationCoords: SHINJUKU,
      }),
    );
    expect(results.map((r) => r.id)).toContain("taito-city");
  });

  it("day trip unaffected: Osaka City present from Osaka base", () => {
    const results = runRecommendationPipeline(
      [byId.get("osaka-city")!, byId.get("kyoto-city")!],
      ctx({
        tripMode: "day_trip",
        budget: 200000,
        homeStationCoords: OSAKA,
      }),
    );
    expect(results.map((r) => r.id)).toContain("osaka-city");
  });

  it("undefined tripMode unaffected: Osaka City present from Osaka base", () => {
    const results = runRecommendationPipeline(
      [byId.get("osaka-city")!, byId.get("kyoto-city")!],
      ctx({
        tripMode: undefined,
        budget: 200000,
        homeStationCoords: OSAKA,
      }),
    );
    expect(results.map((r) => r.id)).toContain("osaka-city");
  });

  it("full catalogue, Osaka base: no Osaka:osaka results, kyoto-city present", () => {
    const results = runRecommendationPipeline(
      destinationsIndex as Destination[],
      {
        vibe: "any",
        budget: 500000,
        carMode: "none",
        publicModes: ["train", "shinkansen"],
        partySize: 2,
        visitedIds: [],
        homeStationCoords: OSAKA,
        tripMode: "weekend_2d1n",
        accommodationAllowance: 20000,
      },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(byId.get(r.id)!.municipalityId).not.toBe("Osaka:osaka");
    }
    expect(results.map((r) => r.id)).toContain("kyoto-city");
  });

  it("full catalogue, Shinjuku base: only Tokyo:shinjuku absent; other wards present", () => {
    const results = runRecommendationPipeline(
      destinationsIndex as Destination[],
      {
        vibe: "any",
        budget: 500000,
        carMode: "none",
        publicModes: ["train", "shinkansen"],
        partySize: 2,
        visitedIds: [],
        homeStationCoords: SHINJUKU,
        tripMode: "weekend_2d1n",
        accommodationAllowance: 20000,
      },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(byId.get(r.id)!.municipalityId).not.toBe("Tokyo:shinjuku");
    }
    const ids = results.map((r) => r.id);
    // A Shinjuku base excludes only the Shinjuku ward, never all 23 wards.
    expect(ids).toContain("shibuya-city");
    expect(ids).toContain("taito-city");
  });
});
