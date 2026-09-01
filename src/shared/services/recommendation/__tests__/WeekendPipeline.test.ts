import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import { TOKYO_WARDS_GROUP_ID } from "../TokyoWardsConsolidation";
import {
  getEstimatedBudgetRange,
  getTransportCost,
} from "@/shared/services/budget/BudgetService";
import { calculateTripCost } from "@/shared/services/budget/tripCostEngine";
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
    // Default prefecture sits on a short verified corridor from the default
    // tokyoHome origin (tokyo ↔ kanagawa train [50, 90]); tests that
    // exercise the no-duration gate override it.
    prefecture: "Kanagawa",
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
const shibuyaCurrentLocation = { lat: 35.6595, lng: 139.7005 };

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

  it("canonical duration defaults are equivalent to explicit any", () => {
    const ctxDefault = ctx({ tripDuration: undefined });
    const ctxAny = ctx({ tripDuration: "any" });

    const resDefault = runRecommendationPipeline([d1, d2], ctxDefault);
    const resAny = runRecommendationPipeline([d1, d2], ctxAny);

    expect(resDefault.length).toBe(resAny.length);
    for (let i = 0; i < resDefault.length; i++) {
      expect(resDefault[i].id).toBe(resAny[i].id);
      expect(resDefault[i].score).toBe(resAny[i].score);
      expect(resDefault[i].match.reasons.length).toBe(
        resAny[i].match.reasons.length,
      );
    }
    // KAI-63 D4: parity holds only because both candidates satisfy the
    // day-trip envelope (verified short corridor + visit band). The two
    // inputs diverge when the envelope excludes a candidate — see the
    // duration-gate contract tests below.
  });
});

// ── Duration-gate contract (KAI-63 D4) ───────────────────────────────────────

describe("runRecommendationPipeline — duration-gate contract", () => {
  // Wakayama has train authorization from the tokyoHome origin (same-zone
  // topology + transportOptions key) but no corridor row and no ≤120 km
  // safe-ground estimate: travel-duration evidence is unknown and no visit
  // band is published, so the day-trip envelope's "any" branch must reject
  // it while pure reachability keeps it.
  const unknownDuration = dest({
    id: "unknown-duration",
    prefecture: "Wakayama",
    transportOptions: { train: 60 },
    coordinates: { lat: 34.2, lng: 135.2 },
  });

  it("no explicit trip mode + duration 'any' ⇒ reachability only (unknown duration stays eligible)", () => {
    const res = runRecommendationPipeline(
      [unknownDuration],
      ctx({ tripDuration: "any" }),
    );
    expect(res.some((r) => r.id === "unknown-duration")).toBe(true);
  });

  it("explicit duration (halfDay) ⇒ that duration applies", () => {
    const res = runRecommendationPipeline(
      [unknownDuration],
      ctx({ tripDuration: "halfDay" }),
    );
    expect(res.some((r) => r.id === "unknown-duration")).toBe(false);
  });
});

// ── Weekend mode ─────────────────────────────────────────────────────────────

describe("runRecommendationPipeline — weekend mode", () => {
  it("excludes destinations without a verified origin-aware duration", () => {
    // Prefecture without any registered corridor → no origin-aware duration,
    // so the candidate is excluded from personalized weekend matching even
    // with ample capacity. Travel-band boundaries live in WeekendPolicy.
    const noCorridor = dest({
      id: "no-corridor",
      role: "hub",
      prefecture: "Kagawa",
      transportOptions: { train: 421 },
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min → sufficient capacity
    });
    const corridor = dest({
      id: "corridor",
      role: "hub",
      transportOptions: { train: 180 },
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const results = runRecommendationPipeline(
      [noCorridor, corridor],
      ctx({ tripDuration: "2d1n" }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("no-corridor");
    expect(ids).toContain("corridor");
  });

  it("includes destinations on a verified corridor", () => {
    const edge = dest({
      id: "edge",
      role: "hub",
      transportOptions: { train: 420 },
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const results = runRecommendationPipeline(
      [edge],
      ctx({ tripDuration: "2d1n", budget: 100000 }),
    );
    expect(results.map((r) => r.id)).toContain("edge");
  });

  it("excludes destination with capacity < 480 but includes >= 480 (hub + children)", () => {
    const hub = dest({
      id: "hub",
      role: "hub",
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
      ctx({ tripDuration: "2d1n" }),
    );
    expect(results.map((r) => r.id)).toContain("hub");

    // hub alone in pool: own 120 < 480 → ineligible
    const resultsAlone = runRecommendationPipeline(
      [hub],
      ctx({ tripDuration: "2d1n" }),
    );
    expect(resultsAlone.map((r) => r.id)).not.toContain("hub");
  });

  it("standalone destination with capacity >= 480 included", () => {
    const solo = dest({
      id: "solo",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 9 }, // 540 min
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [solo],
      ctx({ tripDuration: "2d1n" }),
    );
    expect(results.map((r) => r.id)).toContain("solo");
  });

  it("standalone destination with capacity < 480 excluded", () => {
    const small = dest({
      id: "small",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 2 }, // 120 min
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [small],
      ctx({ tripDuration: "2d1n" }),
    );
    expect(results.map((r) => r.id)).not.toContain("small");
  });

  it("excludes destination capacity that only satisfies a 2D1N trip from 3D2N", () => {
    const area = dest({
      id: "two-day-capacity-only",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 8 }, // 480 minutes
      transportOptions: { train: 90 },
    });

    const twoDayResults = runRecommendationPipeline(
      [area],
      ctx({ tripDuration: "2d1n", budget: 1_000_000 }),
    );
    const threeDayResults = runRecommendationPipeline(
      [area],
      ctx({ tripDuration: "3d2n", budget: 1_000_000 }),
    );

    expect(twoDayResults.map((result) => result.id)).toContain(area.id);
    expect(threeDayResults.map((result) => result.id)).not.toContain(area.id);
  });

  it("origin forecast conditions never change destination ranking (weekend)", () => {
    const d = dest({
      id: "origin-weather-neutral",
      role: "hub",
      transportOptions: { train: 90 },
      indoorPercent: 30,
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const makeCtx = () =>
      ctx({
        tripDuration: "2d1n",
        travelDates: { day1: "2026-08-05", day2: "2026-08-06" },
        // KAI-130: origin forecastMap removed from scoring — deterministic seasonal.
        ferryTemporal: { travelDate: new Date(2026, 7, 5, 12) },
        destinationWeather: { preferred: "any" },
      });

    const rainy = runRecommendationPipeline([d], makeCtx());
    const clear = runRecommendationPipeline([d], makeCtx());

    expect(rainy).toHaveLength(1);
    expect(clear).toHaveLength(1);
    // Ranking is identical: origin conditions never score destinations.
    expect(rainy[0].score).toBe(clear[0].score);
    // Weekend weather score stays zero without destination forecast.
    expect(rainy[0].pipeline.scoreContributions.weekendWeather).toBe(0);
    expect(clear[0].pipeline.scoreContributions.weekendWeather).toBe(0);
    // No destination weather days are stored from origin data.
    expect(rainy[0].overnight!.weatherDays).toEqual([]);
    // No weekendWeather* destination reason is generated from origin weather.
    const codes = rainy[0].match.reasons.map((r) => r.code);
    expect(codes.some((c) => c.startsWith("weekendWeather"))).toBe(false);
    // KAI-130: date-source is now DETERMINISTIC — the origin forecast is
    // no longer passed to scoring, so no forecast-range label can appear;
    // the explicit date evaluates via catalogue evidence only (which may
    // be seasonal or unknown depending on the destination's evidence).
    expect(codes).not.toContain("conditionForecastRange");
    expect(codes).not.toContain("conditionForecastDay");
  });

  it("origin forecast temperature never changes day-trip ranking", () => {
    const d = dest({
      id: "origin-temp-neutral",
      transportOptions: { train: 40 },
      recommendedVisitHours: { min: 8, max: 9 },
    });
    const makeCtx = () =>
      ctx({
        tripDuration: "fullDay",
        travelDates: { day1: "2026-08-05" },
        // KAI-130: origin forecastMap removed from scoring.
      });

    const cold = runRecommendationPipeline([d], makeCtx());
    const hot = runRecommendationPipeline([d], makeCtx());
    expect(cold[0].score).toBe(hot[0].score);
    expect(cold[0].match.reasons.length).toBe(hot[0].match.reasons.length);
  });

  it("origin forecast rain vs clear leaves roulette-equivalent pools identical", () => {
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
    const makeCtx = () =>
      ctx({
        travelDates: { day1: "2026-08-05" },
        // KAI-130: origin forecastMap removed from scoring.
      });

    const rainyPool = runRecommendationPipeline([d1, d2], makeCtx());
    const clearPool = runRecommendationPipeline([d1, d2], makeCtx());
    expect(rainyPool.map((r) => r.id)).toEqual(clearPool.map((r) => r.id));
    expect(rainyPool.map((r) => r.score)).toEqual(
      clearPool.map((r) => r.score),
    );
  });

  it("attaches weekend metadata to results", () => {
    const d = dest({
      id: "d",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "2d1n",
        destinationWeather: {
          days: [
            { date: "2026-08-05", condition: "clear" },
            { date: "2026-08-06", condition: "cloudy" },
          ],
        },
      }),
    );

    expect(results).toHaveLength(1);
    const weekend = results[0].overnight;
    expect(weekend).toBeDefined();
    expect(weekend!.travelFit.band).toBe("nearby");
    expect(weekend!.capacity.activityMinutes).toBe(600);
    expect(weekend!.weatherDays).toHaveLength(2);
  });

  it("day-trip results have no weekend metadata", () => {
    const d = dest({
      id: "d",
      transportOptions: { train: 40 },
      recommendedVisitHours: { min: 2, max: 3 },
    });

    const results = runRecommendationPipeline([d], ctx());
    expect(results).toHaveLength(1);
    expect(results[0].overnight).toBeUndefined();
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
        destinationWeather: {
          days: [{ date: "2026-08-05", condition: "clear" }],
        },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].overnight).toBeUndefined();
  });

  it("weekend result includes weekendTripReady reason", () => {
    const d = dest({
      id: "d",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({ tripDuration: "2d1n" }),
    );
    expect(results).toHaveLength(1);
    const codes = results[0].match.reasons.map((r) => r.code);
    expect(codes).toContain("weekendTripReady");
  });

  it("weekend scoring contributions appear in pipeline", () => {
    const d = dest({
      id: "d",
      role: "hub",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });

    const results = runRecommendationPipeline(
      [d],
      ctx({ tripDuration: "2d1n" }),
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
      role: "hub",
      transportOptions: { train: 90 },
      indoorPercent: 30,
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const clearCtx = ctx({
      tripDuration: "2d1n",
      destinationWeather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "cloudy" },
        ],
      },
    });
    const stormyCtx = ctx({
      tripDuration: "2d1n",
      destinationWeather: {
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
      role: "hub",
      transportOptions: { train: 90 },
      indoorPercent: 85,
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const outdoorDest = dest({
      id: "outdoor-heavy",
      role: "hub",
      transportOptions: { train: 90 },
      indoorPercent: 10,
      recommendedVisitHours: { min: 1, max: 10 },
    });

    const stormyCtx = ctx({
      tripDuration: "2d1n",
      destinationWeather: {
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
  // Real production fixture: Ishigaki from Fukuoka has a flight route whose
  // fare is not source-backed. KAI-260 supplies a broad model estimate so the
  // candidate remains priced without a zero-cost claim.
  it("includes a modeled transport range when the fare is unavailable", () => {
    const ishigaki = byId.get("ishigaki-city")!;
    const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
    const budgetEst = getEstimatedBudgetRange(
      ishigaki,
      "flight",
      2,
      "standard",
      FUKUOKA,
    );
    expect(budgetEst.transportIncluded).toBe(true);

    const results = runRecommendationPipeline([ishigaki], {
      vibe: "any",
      budget: 500000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: FUKUOKA,
      originZoneId: "mainland-kyushu",
      tripDuration: "2d1n",
    });

    expect(results.map((r) => r.id)).toContain("ishigaki-city");
    const result = results[0];
    expect(result.estimatedCostTransportIncluded).toBe(true);
    expect(result.overnight?.estimatedCostTransportIncluded).toBe(true);
    const codes = result.match.reasons.map((r) => r.code);
    expect(codes).not.toContain("weekendTransportExcluded");
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
      role: "hub",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });
    const twoDayResult = runRecommendationPipeline(
      [d],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        destinationWeather: {
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
        tripDuration: "2d1n",
        budget: 200000,
        destinationWeather: {
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

  it("Osaka City base + Osaka City destination excluded in 2D1N; Fukuoka kept", () => {
    const results = runRecommendationPipeline(
      [byId.get("osaka-city")!, byId.get("fukuoka-city")!],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        publicModes: ["train", "shinkansen"],
        homeStationCoords: OSAKA,
      }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("osaka-city");
    expect(ids).toContain("fukuoka-city");
  });

  it("Shinjuku base + Shinjuku Ward excluded in 2D1N; Nikko kept", () => {
    const results = runRecommendationPipeline(
      [byId.get("shinjuku-city")!, byId.get("nikko-city")!],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        publicModes: ["train", "shinkansen"],
        homeStationCoords: SHINJUKU,
      }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("shinjuku-city");
    expect(ids).toContain("nikko-city");
  });

  it("Shinjuku base + Shibuya Ward is too near for an overnight trip", () => {
    const results = runRecommendationPipeline(
      [byId.get("shinjuku-city")!, byId.get("shibuya-city")!],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        homeStationCoords: SHINJUKU,
      }),
    );
    expect(results.map((r) => r.id)).not.toContain("shibuya-city");
  });

  it("Shinjuku base + Taito Ward is too near for an overnight trip", () => {
    const results = runRecommendationPipeline(
      [byId.get("shinjuku-city")!, byId.get("taito-city")!],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        homeStationCoords: SHINJUKU,
      }),
    );
    expect(results.map((r) => r.id)).not.toContain("taito-city");
  });

  it("day trip unaffected: Osaka City present from Osaka base", () => {
    const results = runRecommendationPipeline(
      [byId.get("osaka-city")!, byId.get("kyoto-city")!],
      ctx({
        tripDuration: "fullDay",
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
        tripDuration: undefined,
        budget: 200000,
        homeStationCoords: OSAKA,
      }),
    );
    expect(results.map((r) => r.id)).toContain("osaka-city");
  });

  it("full catalogue, Osaka base: no Osaka:osaka results, Fukuoka present", () => {
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
        tripDuration: "2d1n",
      },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      // The virtual Tokyo 23 Wards group is not a catalogue record.
      if (r.id === TOKYO_WARDS_GROUP_ID) continue;
      expect(byId.get(r.id)!.municipalityId).not.toBe("Osaka:osaka");
    }
    expect(results.map((r) => r.id)).toContain("fukuoka-city");
    expect(results.map((r) => r.id)).not.toContain("kyoto-city");
  });

  it("full catalogue, Shinjuku base: local wards absent and Nikko present", () => {
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
        tripDuration: "2d1n",
      },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(byId.get(r.id)!.municipalityId).not.toBe("Tokyo:shinjuku");
    }
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("shibuya-city");
    expect(ids).not.toContain("taito-city");
    expect(ids).toContain("nikko-city");
  });

  it("Chiba weekend ranking suppresses ordinary Tokyo rail results", () => {
    const CHIBA = { lat: 35.6131, lng: 140.1133 };
    const results = runRecommendationPipeline(
      destinationsIndex as Destination[],
      {
        vibe: "any",
        budget: 95000,
        budgetTier: "standard",
        carMode: "none",
        publicModes: ["train", "shinkansen", "bus", "flight", "ferry"],
        partySize: 2,
        visitedIds: [],
        homeStationCoords: CHIBA,
        tripDuration: "2d1n",
      },
    );
    const topThreeIds = results.slice(0, 3).map((r) => r.id);

    expect(results.length).toBeGreaterThan(0);
    expect(topThreeIds).not.toContain("shibuya-city");
    expect(topThreeIds).not.toContain("adachi-city");
    expect(topThreeIds).not.toContain("tokyo-station-chiyoda");
    expect(results[0].overnight?.travelFit.oneWayMinutes).toBeGreaterThan(90);
    // Chiba is within the Tokyo-area Shinkansen origin catchment. The top
    // result may therefore be a verified Tokyo-endpoint corridor destination
    // rather than the former prefecture-only Hakodate result. KAI-87 PR4
    // season corrections legitimately rank Mount Fuji (verified bus
    // corridor, summer-top) above the Shinkansen-verified Karuizawa.
    const topEstimate = results[0].transportEstimate;
    expect(["shinkansen", "bus"]).toContain(topEstimate?.mode);
    expect(
      topEstimate && "corridorEvidence" in topEstimate
        ? topEstimate.corridorEvidence
        : undefined,
    ).toBe("verified");
  });
});

// ── Hub-first weekend results ────────────────────────────────────────────────

describe("runRecommendationPipeline — hub-first weekend results", () => {
  const OSAKA = { lat: 34.7025, lng: 135.4959 };

  it("explicit hubs return as primary trip areas with metadata", () => {
    const results = runRecommendationPipeline(
      [byId.get("osaka-city")!, byId.get("fukuoka-city")!],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        publicModes: ["train", "shinkansen"],
        homeStationCoords: OSAKA,
      }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("osaka-city"); // origin-local
    expect(ids).toContain("fukuoka-city");
    const fukuoka = results.find((r) => r.id === "fukuoka-city")!;
    expect(fukuoka.overnight?.areaKind).toBe("trip_area");
    // Place counts come from the actual pool: no children in this two-record
    // pool, so the count is 0 (full-catalogue runs assert real counts).
    expect(fukuoka.overnight?.placeCount).toBe(0);
  });

  it("eligible child POI is suppressed when its parent hub is eligible", () => {
    const child = dest({
      id: "fukuoka-child-poi",
      role: "poi",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      relationships: { parentDestinationId: "fukuoka-city" },
      transportOptions: { train: 230 },
      recommendedVisitHours: { min: 1, max: 8 }, // 480 min — would pass alone
    });
    const results = runRecommendationPipeline(
      [byId.get("fukuoka-city")!, child],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        publicModes: ["train", "shinkansen"],
        homeStationCoords: OSAKA,
      }),
    );
    expect(results.map((r) => r.id)).toEqual(["fukuoka-city"]);
    expect(results[0].overnight?.placeCount).toBe(1);
  });

  it("standalone museum with enough own capacity is not a primary result", () => {
    const museum = dest({
      id: "big-museum",
      role: "standalone",
      kind: "museum",
      transportOptions: { train: 180 },
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min — would pass alone
    });
    const results = runRecommendationPipeline(
      [museum],
      ctx({ tripDuration: "2d1n", budget: 200000 }),
    );
    expect(results).toEqual([]);
  });

  it("child POI of an ineligible parent is not promoted", () => {
    const orphanPoi = dest({
      id: "orphan-poi",
      role: "poi",
      relationships: { parentDestinationId: "not-in-pool-hub" },
      transportOptions: { train: 120 },
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min
    });
    const results = runRecommendationPipeline(
      [orphanPoi],
      ctx({ tripDuration: "2d1n", budget: 200000 }),
    );
    expect(results).toEqual([]);
  });

  it("coherent non-city area (Kamikochi) qualifies as standalone_area", () => {
    const results = runRecommendationPipeline(
      [byId.get("nagano-kamikochi")!],
      ctx({ tripDuration: "2d1n", budget: 200000 }),
    );
    expect(results.map((r) => r.id)).toContain("nagano-kamikochi");
    expect(results[0].overnight?.areaKind).toBe("standalone_area");
  });

  it("full catalogue Tokyo/Osaka/Fukuoka return only trip-area results", () => {
    const homes = [
      { lat: 35.6812, lng: 139.7671 },
      OSAKA,
      { lat: 33.5902, lng: 130.4017 },
    ];
    for (const home of homes) {
      const results = runRecommendationPipeline(
        destinationsIndex as Destination[],
        {
          vibe: "any",
          budget: 500000,
          carMode: "none",
          publicModes: ["train", "shinkansen"],
          partySize: 2,
          visitedIds: [],
          homeStationCoords: home,
          tripDuration: "2d1n",
        },
      );
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.overnight?.areaKind).not.toBe("poi");
        // The virtual Tokyo 23 Wards group is not a catalogue record.
        if (r.id === TOKYO_WARDS_GROUP_ID) continue;
        const dest = byId.get(r.id)!;
        expect(dest.role === "hub" || dest.role === "standalone").toBe(true);
      }
    }
  });

  it("explicit-origin candidate with unknown travel duration is excluded", () => {
    const noRoute = dest({
      id: "no-route",
      role: "hub",
      transportOptions: {},
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const results = runRecommendationPipeline(
      [noRoute],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        homeStationCoords: tokyoHome,
      }),
    );
    expect(results).toEqual([]);
  });

  it("keeps unknown weekend routes excluded for a temporary current origin", () => {
    const noRoute = dest({
      id: "current-no-route",
      role: "hub",
      prefecture: "Kagawa",
      transportOptions: { train: 240 },
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const results = runRecommendationPipeline(
      [noRoute],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        homeStationCoords: shibuyaCurrentLocation,
      }),
    );

    expect(results).toEqual([]);
  });

  it("day-trip and Any browsing keep ordinary POI results", () => {
    const museum = dest({
      id: "museum-daytrip",
      role: "standalone",
      kind: "museum",
      transportOptions: { train: 40 },
      recommendedVisitHours: { min: 2, max: 3 },
    });
    const results = runRecommendationPipeline([museum], ctx());
    expect(results.map((r) => r.id)).toContain("museum-daytrip");
  });
});

// ── False trip-area classification regressions ───────────────────────────────

describe("runRecommendationPipeline — positive area classification", () => {
  it("Ghibli Museum (standalone, no kind) is not a primary 2D1N trip area", () => {
    const results = runRecommendationPipeline(
      [byId.get("ghibli-museum")!],
      ctx({ tripDuration: "2d1n", budget: 200000 }),
    );
    expect(results.map((r) => r.id)).not.toContain("ghibli-museum");
  });

  it("standalone with an unknown kind stays a POI even with corridor + capacity", () => {
    const animeMuseum = dest({
      id: "anime-museum",
      role: "standalone",
      kind: "anime" as never,
      transportOptions: { train: 40 },
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min
    });
    const results = runRecommendationPipeline(
      [animeMuseum],
      ctx({ tripDuration: "2d1n", budget: 200000 }),
    );
    expect(results).toEqual([]);
  });

  it("city, ward and town hubs remain eligible trip areas", () => {
    const city = dest({
      id: "city-hub",
      role: "hub",
      kind: "city",
      transportOptions: { train: 60 },
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const ward = dest({
      id: "ward-hub",
      role: "hub",
      kind: "ward",
      transportOptions: { train: 60 },
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const town = dest({
      id: "town-hub",
      role: "hub",
      kind: "town",
      transportOptions: { train: 60 },
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const results = runRecommendationPipeline(
      [city, ward, town],
      ctx({ tripDuration: "2d1n", budget: 200000 }),
    );
    const ids = results.map((r) => r.id);
    expect(ids).toContain("city-hub");
    expect(ids).toContain("ward-hub");
    expect(ids).toContain("town-hub");
  });
});

// ── Card consistency ─────────────────────────────────────────────────────────

describe("runRecommendationPipeline — estimate consistency", () => {
  it("ranking, display, and budget use the same origin-aware duration", () => {
    const fukuoka = byId.get("fukuoka-city")!;
    const OSAKA = { lat: 34.7025, lng: 135.4959 };
    const results = runRecommendationPipeline(
      [fukuoka],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        publicModes: ["train", "shinkansen"],
        homeStationCoords: OSAKA,
      }),
    );
    expect(results).toHaveLength(1);
    const result = results[0];

    // Display estimate.
    const estimate = result.transportEstimate!;
    expect(estimate.mode).toBe("shinkansen");
    // osaka↔fukuoka corridor [140,240] + bounded access from Umeda to
    // Shin-Osaka and from Fukuoka city to Hakata.
    expect(estimate.timeRange).toEqual([167, 284]);

    // Ranking duration: midpoint of the same estimate.
    const mid = Math.round((estimate.timeRange[0] + estimate.timeRange[1]) / 2);
    expect(result.overnight?.travelFit.oneWayMinutes).toBe(mid);

    // Budget duration: same estimate via the origin-aware cost path. The
    // verified corridor fare (osaka→fukuoka reserved ¥15,520–16,020 —
    // Sakura/Kodama → Nozomi/Mizuho reserved, FARE_POLICY §2) takes
    // precedence over the heuristic (FARE_POLICY §0/§2).
    const budgetCost = getTransportCost(fukuoka, estimate.mode, 2, OSAKA);
    expect(budgetCost).not.toBeNull();
    const verifiedAvg = Math.round((15520 + 16020) / 2);
    expect(budgetCost).toBe(Math.floor(verifiedAvg * 2 * 2));
  });

  it.each(["hakodate-city", "fukuoka-city"])(
    "uses the displayed verified flight for %s budget status",
    (destinationId) => {
      const destination = byId.get(destinationId)!;
      const results = runRecommendationPipeline(
        [destination],
        ctx({
          tripDuration: "2d1n",
          budget: 200000,
          publicModes: ["train", "shinkansen", "flight"],
        }),
      );
      expect(results).toHaveLength(1);

      const result = results[0];
      expect(result.transportEstimate?.mode).toBe("flight");
      const flightBudget = getEstimatedBudgetRange(
        destination,
        "flight",
        2,
        "standard",
        tokyoHome,
      );
      expect(flightBudget.transportIncluded).toBe(true);
      expect(result.estimatedCostTransportIncluded).toBe(true);
      // KAI-217B: the card range is the CANONICAL engine total (food/cafe/
      // parking/5% excluded), not the legacy food-inclusive range. A
      // weekend_2d1n result without an accommodation allowance is partial
      // → the card shows no range (honest: incomplete evidence).
      const engineResult = calculateTripCost({
        dest: destination,
        mode: "flight",
        partySize: 2,
        homeCoords: tokyoHome,
        duration: "2d1n",
      });
      if (engineResult.completeness === "complete" && engineResult.total) {
        expect(result.estimatedCostRange).toEqual([
          engineResult.total.min,
          engineResult.total.max,
        ]);
      } else {
        expect(result.estimatedCostRange).toBeUndefined();
      }
      expect(result.match.reasons.map((reason) => reason.code)).not.toContain(
        "weekendTransportExcluded",
      );
    },
  );

  it("includes a modeled range when the displayed flight fare is null", () => {
    const destination = byId.get("ishigaki-city")!;
    const results = runRecommendationPipeline(
      [destination],
      ctx({
        tripDuration: "2d1n",
        budget: 200000,
        publicModes: ["flight"],
        homeStationCoords: { lat: 33.5902, lng: 130.4017 },
        originZoneId: "mainland-kyushu",
      }),
    );
    expect(results).toHaveLength(1);

    const result = results[0];
    expect(result.transportEstimate?.mode).toBe("flight");
    expect(result.estimatedCostTransportIncluded).toBe(true);
    expect(result.match.reasons.map((reason) => reason.code)).not.toContain(
      "weekendTransportExcluded",
    );
  });
});
