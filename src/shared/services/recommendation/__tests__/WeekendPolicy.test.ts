import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  evaluateWeekendTravelFit,
  evaluateWeekendCapacity,
  evaluateWeekendCandidate,
  weekendTravelScoreDelta,
  WEEKEND_SCORING,
} from "../WeekendPolicy";
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
    totalTripHours: 1,
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 0,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    ...overrides,
    id: overrides.id,
  } as unknown as Destination;
}

function context(
  overrides: Partial<RecommendationContext> = {},
): RecommendationContext {
  return {
    budget: 50000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    visitedIds: [],
    ...overrides,
  };
}

// ── Travel Fit Tests ─────────────────────────────────────────────────────────

describe("evaluateWeekendTravelFit", () => {
  it("0 and 180 minutes → strong, eligible", () => {
    expect(evaluateWeekendTravelFit(0)).toEqual({
      eligible: true,
      band: "strong",
      oneWayMinutes: 0,
    });
    expect(evaluateWeekendTravelFit(180)).toEqual({
      eligible: true,
      band: "strong",
      oneWayMinutes: 180,
    });
  });

  it("181 → acceptable, eligible", () => {
    expect(evaluateWeekendTravelFit(181)).toEqual({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 181,
    });
  });

  it("300 → acceptable, eligible", () => {
    expect(evaluateWeekendTravelFit(300)).toEqual({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 300,
    });
  });

  it("301 → weak, eligible", () => {
    expect(evaluateWeekendTravelFit(301)).toEqual({
      eligible: true,
      band: "weak",
      oneWayMinutes: 301,
    });
  });

  it("420 → weak, eligible", () => {
    expect(evaluateWeekendTravelFit(420)).toEqual({
      eligible: true,
      band: "weak",
      oneWayMinutes: 420,
    });
  });

  it("421 → ineligible, band weak", () => {
    expect(evaluateWeekendTravelFit(421)).toEqual({
      eligible: false,
      band: "weak",
      oneWayMinutes: 421,
    });
  });

  it("undefined → unknown, eligible, no oneWayMinutes", () => {
    expect(evaluateWeekendTravelFit(undefined)).toEqual({
      eligible: true,
      band: "unknown",
    });
  });
});

// ── Travel Score Delta Tests ─────────────────────────────────────────────────

describe("weekendTravelScoreDelta", () => {
  it("strong band → TRAVEL_STRONG_BONUS (10)", () => {
    expect(
      weekendTravelScoreDelta({
        eligible: true,
        band: "strong",
        oneWayMinutes: 100,
      }),
    ).toBe(10);
  });

  it("unknown band → 0", () => {
    expect(weekendTravelScoreDelta({ eligible: true, band: "unknown" })).toBe(
      0,
    );
  });

  it("acceptable band: monotonic decreasing", () => {
    // formula: 10 - ((mins - 180)/120)*14
    // at 181: 10 - (1/120)*14 ≈ 9.8833
    // at 300: 10 - (120/120)*14 = -4
    const d181 = weekendTravelScoreDelta({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 181,
    });
    const d300 = weekendTravelScoreDelta({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 300,
    });
    expect(d181).toBeGreaterThan(d300);
    expect(d181).toBeCloseTo(9.8833, 2);
    expect(d300).toBeCloseTo(-4, 5);
  });

  it("weak band: monotonic decreasing", () => {
    // formula: -12 - ((mins - 300)/120)*18
    // at 301: -12 - (1/120)*18 = -12.15
    // at 420: -12 - (120/120)*18 = -30
    const d301 = weekendTravelScoreDelta({
      eligible: true,
      band: "weak",
      oneWayMinutes: 301,
    });
    const d420 = weekendTravelScoreDelta({
      eligible: true,
      band: "weak",
      oneWayMinutes: 420,
    });
    expect(d301).toBeGreaterThan(d420);
    expect(d301).toBeCloseTo(-12.15, 2);
    expect(d420).toBeCloseTo(-30, 5);
  });
});

// ── Capacity Tests ───────────────────────────────────────────────────────────

describe("evaluateWeekendCapacity", () => {
  it("hub with children summing to exactly 480 min → eligible, sufficient", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 2 } });
    const children = [
      dest({
        id: "c1",
        recommendedVisitHours: { min: 1, max: 4 },
        relationships: { parentDestinationId: "hub" },
      }),
      dest({
        id: "c2",
        recommendedVisitHours: { min: 1, max: 4 },
        relationships: { parentDestinationId: "hub" },
      }),
    ];
    // children sum = 4*60 + 4*60 = 480
    const result = evaluateWeekendCapacity(hub, [hub, ...children]);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("sufficient");
    expect(result.activityMinutes).toBe(480);
    expect(result.eligiblePlaceCount).toBe(2);
  });

  it("hub with children summing to 479 min → insufficient", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 2 } });
    const children = [
      dest({
        id: "c1",
        recommendedVisitHours: { min: 1, max: 4 },
        relationships: { parentDestinationId: "hub" },
      }),
      dest({
        id: "c2",
        recommendedVisitHours: { min: 1, max: 3.983 },
        relationships: { parentDestinationId: "hub" },
      }),
    ];
    const result = evaluateWeekendCapacity(hub, [hub, ...children]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("insufficient");
  });

  it("child with missing recommendedVisitHours contributes 0", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 2 } });
    const children = [
      dest({
        id: "c1",
        recommendedVisitHours: { min: 1, max: 3 },
        relationships: { parentDestinationId: "hub" },
      }),
      dest({ id: "c2", relationships: { parentDestinationId: "hub" } }), // no recommendedVisitHours
    ];
    // children sum = 180 + 0 = 180 < 480
    const result = evaluateWeekendCapacity(hub, [hub, ...children]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("insufficient");
    expect(result.activityMinutes).toBe(180);
  });

  it("hub own 480 with no children → eligible, count 1", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 8 } });
    const result = evaluateWeekendCapacity(hub, [hub]);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("sufficient");
    expect(result.activityMinutes).toBe(480);
    expect(result.eligiblePlaceCount).toBe(1);
  });

  it("hub own 600 + children sum 300 → minutes 600 (max rule)", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 10 } });
    const children = [
      dest({
        id: "c1",
        recommendedVisitHours: { min: 1, max: 2.5 },
        relationships: { parentDestinationId: "hub" },
      }),
      dest({
        id: "c2",
        recommendedVisitHours: { min: 1, max: 2.5 },
        relationships: { parentDestinationId: "hub" },
      }),
    ];
    // own = 600, children sum = 300
    // max(600, 300) = 600, eligiblePlaceCount = 1 (childrenSum < own)
    const result = evaluateWeekendCapacity(hub, [hub, ...children]);
    expect(result.eligible).toBe(true);
    expect(result.activityMinutes).toBe(600);
    expect(result.eligiblePlaceCount).toBe(1);
  });

  it("standalone own 480 → eligible", () => {
    const d = dest({
      id: "standalone",
      recommendedVisitHours: { min: 1, max: 8 },
    });
    const result = evaluateWeekendCapacity(d, [d]);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("sufficient");
    expect(result.activityMinutes).toBe(480);
    expect(result.eligiblePlaceCount).toBe(1);
  });

  it("standalone own 90 → insufficient", () => {
    const d = dest({
      id: "small",
      recommendedVisitHours: { min: 1, max: 1.5 },
    });
    const result = evaluateWeekendCapacity(d, [d]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("insufficient");
    expect(result.activityMinutes).toBe(90);
    expect(result.eligiblePlaceCount).toBe(1);
  });

  it("missing data (recommendedVisitHours undefined) → 0 minutes, unknown, ineligible", () => {
    const d = dest({ id: "no-data" });
    const result = evaluateWeekendCapacity(d, [d]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("unknown");
    expect(result.activityMinutes).toBe(0);
    expect(result.eligiblePlaceCount).toBe(0);
  });

  it("child not in pool → not counted", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 1 } });
    // Child exists but not in pool
    const result = evaluateWeekendCapacity(hub, [hub]);
    // own = 60, no children in pool → 60 < 480
    expect(result.eligible).toBe(false);
    expect(result.activityMinutes).toBe(60);
  });

  it("hub with children, childrenSum >= own → minutes = childrenSum, count = children.length", () => {
    const hub = dest({ id: "hub", recommendedVisitHours: { min: 1, max: 1 } });
    const children = [
      dest({
        id: "c1",
        recommendedVisitHours: { min: 1, max: 6 },
        relationships: { parentDestinationId: "hub" },
      }),
      dest({
        id: "c2",
        recommendedVisitHours: { min: 1, max: 6 },
        relationships: { parentDestinationId: "hub" },
      }),
    ];
    // childrenSum = 720, own = 60, max = 720, count = 2
    const result = evaluateWeekendCapacity(hub, [hub, ...children]);
    expect(result.eligible).toBe(true);
    expect(result.activityMinutes).toBe(720);
    expect(result.eligiblePlaceCount).toBe(2);
  });
});

// ── Weekend Candidate Evaluation Tests ───────────────────────────────────────

describe("evaluateWeekendCandidate", () => {
  it("strong travel + capacity strong + two clear days → scoreDelta 13", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min → strong capacity
      indoorPercent: 50,
      transportOptions: { train: 90 }, // strong travel
    });
    const ctx = context({
      weather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    expect(result.eligible).toBe(true);
    expect(result.travelFit.band).toBe("strong");
    expect(result.travelScore).toBe(WEEKEND_SCORING.TRAVEL_STRONG_BONUS);
    expect(result.capacityScore).toBe(WEEKEND_SCORING.CAPACITY_STRONG_BONUS);
    expect(result.weatherScore).toBe(0); // two clear days → 0
    expect(result.scoreDelta).toBe(
      WEEKEND_SCORING.TRAVEL_STRONG_BONUS +
        WEEKEND_SCORING.CAPACITY_STRONG_BONUS,
    );
  });

  it("weather stormy on 1 of 2 days for indoorPercent 0 → negative weatherScore", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 },
      indoorPercent: 0,
      transportOptions: { train: 90 },
    });
    const ctx = context({
      weather: {
        days: [
          { date: "2026-08-05", condition: "stormy" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    // stormy with indoorPercent 0: -(15 + (100/100)*20) + (0/100)*8 = -(15 + 20) = -35
    expect(result.weatherScore).toBeCloseTo(-35, 5);
    expect(result.scoreDelta).toBeLessThan(0);
  });

  it("capacity below 480 → ineligible", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 2 }, // 120 min
      transportOptions: { train: 90 },
    });
    const ctx = context({
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    expect(result.eligible).toBe(false);
    expect(result.capacity.eligible).toBe(false);
  });

  it("includes weekendTripReady reason when eligible", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });
    const ctx = context({
      weather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    expect(result.eligible).toBe(true);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain("weekendTripReady");
    expect(codes).toContain("weekendCapacityStrong");
    expect(codes).toContain("weekendTravelStrong");
    expect(codes).toContain("weekendWeatherGood");
  });

  it("includes stay allowance reason when accommodationAllowance > 0", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });
    const ctx = context({
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
      accommodationAllowance: 15000,
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    const stayReason = result.reasons.find(
      (r) => r.code === "weekendStayAllowance",
    );
    expect(stayReason).toBeDefined();
    expect(stayReason?.params?.amount).toBe(15000);
  });

  it("skips stay allowance reason when accommodationAllowance is 0", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { train: 90 },
    });
    const ctx = context({
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
      accommodationAllowance: 0,
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    const stayReason = result.reasons.find(
      (r) => r.code === "weekendStayAllowance",
    );
    expect(stayReason).toBeUndefined();
  });

  it("weather summary mixed → weekendWeatherDayRain reason with day param", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 },
      indoorPercent: 80, // high indoor → weather summary = "mixed"
      transportOptions: { train: 90 },
    });
    const ctx = context({
      weather: {
        days: [
          { date: "2026-08-05", condition: "rainy" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    const weatherReason = result.reasons.find(
      (r) => r.code === "weekendWeatherDayRain",
    );
    expect(weatherReason).toBeDefined();
    expect(weatherReason?.params?.day).toBe(1); // badDayIndices[0] + 1
  });

  it("weather summary poor → weekendWeatherPoorOutdoor reason", () => {
    const d = dest({
      id: "test",
      recommendedVisitHours: { min: 1, max: 10 },
      indoorPercent: 30, // low indoor → weather summary = "poor"
      transportOptions: { train: 90 },
    });
    const ctx = context({
      weather: {
        days: [
          { date: "2026-08-05", condition: "stormy" },
          { date: "2026-08-06", condition: "rainy" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    const weatherReason = result.reasons.find(
      (r) => r.code === "weekendWeatherPoorOutdoor",
    );
    expect(weatherReason).toBeDefined();
  });
});
