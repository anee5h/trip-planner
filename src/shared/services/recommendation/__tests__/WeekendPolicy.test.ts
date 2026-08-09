import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinationsIndex from "@/shared/data/destinations-index.json";
import {
  evaluateWeekendTravelFit,
  evaluateWeekendCapacity,
  evaluateWeekendCandidate,
  hasOvernightWorthyWeekendSemantics,
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
    // Sits on a verified corridor from the test origin so travel fit is
    // evaluated (tokyo ↔ kanagawa train [50, 90]); tests exercising the
    // no-duration gate override it.
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

const catalogueById = new Map(
  (destinationsIndex as Destination[]).map((destination) => [
    destination.id,
    destination,
  ]),
);

// ── Travel Fit Tests ─────────────────────────────────────────────────────────

describe("evaluateWeekendTravelFit", () => {
  it("0 minutes → local, ineligible", () => {
    expect(evaluateWeekendTravelFit(0)).toEqual({
      eligible: false,
      band: "local",
      oneWayMinutes: 0,
    });
  });
  it("60 minutes → local, ineligible", () => {
    expect(evaluateWeekendTravelFit(60)).toEqual({
      eligible: false,
      band: "local",
      oneWayMinutes: 60,
    });
  });

  it("61 → nearby, eligible", () => {
    expect(evaluateWeekendTravelFit(61)).toEqual({
      eligible: true,
      band: "nearby",
      oneWayMinutes: 61,
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

  it("undefined → unknown, ineligible (no route)", () => {
    expect(evaluateWeekendTravelFit(undefined)).toEqual({
      eligible: false,
      band: "unknown",
    });
  });

  it("90 → nearby; 91 → normal; 120 → normal; 121 → strong", () => {
    expect(evaluateWeekendTravelFit(90)).toEqual({
      eligible: true,
      band: "nearby",
      oneWayMinutes: 90,
    });
    expect(evaluateWeekendTravelFit(91)).toEqual({
      eligible: true,
      band: "normal",
      oneWayMinutes: 91,
    });
    expect(evaluateWeekendTravelFit(120)).toEqual({
      eligible: true,
      band: "normal",
      oneWayMinutes: 120,
    });
    expect(evaluateWeekendTravelFit(121)).toEqual({
      eligible: true,
      band: "strong",
      oneWayMinutes: 121,
    });
  });

  it("240 → strong, eligible; 241 → acceptable, eligible", () => {
    expect(evaluateWeekendTravelFit(240)).toEqual({
      eligible: true,
      band: "strong",
      oneWayMinutes: 240,
    });
    expect(evaluateWeekendTravelFit(241)).toEqual({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 241,
    });
  });

  it("allows local travel only for explicit overnight-worthy semantics", () => {
    expect(evaluateWeekendTravelFit(60)).toMatchObject({
      eligible: false,
      band: "local",
    });
    expect(
      evaluateWeekendTravelFit(60, { overnightWorthy: true }),
    ).toMatchObject({
      eligible: true,
      band: "local",
    });

    const onsen = dest({
      id: "near-onsen",
      kind: "onsen",
      recommendedVisitHours: { min: 1, max: 10 },
    });
    const ordinaryCity = dest({
      id: "near-city",
      kind: "city",
      recommendedVisitHours: { min: 1, max: 10 },
    });
    expect(hasOvernightWorthyWeekendSemantics(onsen, [onsen])).toBe(true);
    expect(
      hasOvernightWorthyWeekendSemantics(ordinaryCity, [ordinaryCity]),
    ).toBe(false);

    const arima = catalogueById.get("arima-onsen");
    const kobe = catalogueById.get("kobe-city");
    expect(arima).toBeDefined();
    expect(kobe).toBeDefined();
    expect(hasOvernightWorthyWeekendSemantics(arima!, [arima!])).toBe(true);
    expect(hasOvernightWorthyWeekendSemantics(kobe!, [kobe!, arima!])).toBe(
      true,
    );
  });
});

// ── Travel Score Delta Tests ─────────────────────────────────────────────────

describe("weekendTravelScoreDelta", () => {
  it("strong peak → TRAVEL_STRONG_BONUS (9)", () => {
    expect(
      weekendTravelScoreDelta({
        eligible: true,
        band: "strong",
        oneWayMinutes: 180,
      }),
    ).toBe(WEEKEND_SCORING.TRAVEL_STRONG_BONUS);
    expect(WEEKEND_SCORING.TRAVEL_STRONG_BONUS).toBe(9);
  });

  it("unknown band → 0", () => {
    expect(weekendTravelScoreDelta({ eligible: true, band: "unknown" })).toBe(
      0,
    );
  });

  it("local band → TRAVEL_LOCAL_PENALTY (-20)", () => {
    expect(
      weekendTravelScoreDelta({
        eligible: false,
        band: "local",
        oneWayMinutes: 45,
      }),
    ).toBe(WEEKEND_SCORING.TRAVEL_LOCAL_PENALTY);
    expect(WEEKEND_SCORING.TRAVEL_LOCAL_PENALTY).toBe(-20);
  });

  it("nearby band tapers from strong penalty toward neutral", () => {
    const d61 = weekendTravelScoreDelta({
      eligible: true,
      band: "nearby",
      oneWayMinutes: 61,
    });
    const d90 = weekendTravelScoreDelta({
      eligible: true,
      band: "nearby",
      oneWayMinutes: 90,
    });
    const d91 = weekendTravelScoreDelta({
      eligible: true,
      band: "normal",
      oneWayMinutes: 91,
    });
    expect(d61).toBe(WEEKEND_SCORING.TRAVEL_NEARBY_PENALTY);
    expect(WEEKEND_SCORING.TRAVEL_NEARBY_PENALTY).toBe(-18);
    expect(d90).toBe(WEEKEND_SCORING.TRAVEL_NEARBY_EDGE_PENALTY);
    expect(d90).toBeCloseTo(-16, 5);
    expect(d91).toBe(WEEKEND_SCORING.TRAVEL_NORMAL_BASE);
    expect(Math.abs(d91 - d90)).toBeLessThan(3);
  });

  it("normal to strong boundary remains continuous", () => {
    const d120 = weekendTravelScoreDelta({
      eligible: true,
      band: "normal",
      oneWayMinutes: 120,
    });
    const d121 = weekendTravelScoreDelta({
      eligible: true,
      band: "strong",
      oneWayMinutes: 121,
    });
    expect(d120).toBe(WEEKEND_SCORING.TRAVEL_NORMAL_MAX);
    expect(d121).toBe(WEEKEND_SCORING.TRAVEL_STRONG_EDGE_BONUS);
    expect(Math.abs(d121 - d120)).toBeLessThan(1);
  });

  it("acceptable band: monotonic decreasing", () => {
    // formula: 5 - ((mins - 241)/59)*5
    // at 241: 5 - (0/59)*5 = 5
    // at 300: 5 - (59/59)*5 = 0
    const d241 = weekendTravelScoreDelta({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 241,
    });
    const d300 = weekendTravelScoreDelta({
      eligible: true,
      band: "acceptable",
      oneWayMinutes: 300,
    });
    expect(d241).toBeGreaterThan(d300);
    expect(d241).toBeCloseTo(5, 5);
    expect(d300).toBeCloseTo(0, 5);
  });

  it("weak band: monotonic decreasing", () => {
    // formula: 0 - ((mins - 301)/119)*15
    // at 301: 0 - (0/119)*15 = 0
    // at 420: 0 - (119/119)*15 = -15
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
    expect(d301).toBeCloseTo(0, 5);
    expect(d420).toBeCloseTo(-15, 5);
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
  it("strong travel + capacity strong + two clear days", () => {
    const d = dest({
      id: "test",
      prefecture: "Kyoto",
      recommendedVisitHours: { min: 1, max: 10 }, // 600 min → strong capacity
      indoorPercent: 50,
      transportOptions: { shinkansen: 180 },
    });
    const ctx = context({
      destinationWeather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      // tokyo ↔ kyoto shinkansen corridor [135, 220] → strong band
      publicModes: ["shinkansen"],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["shinkansen"]);
    expect(result.eligible).toBe(true);
    expect(result.travelFit.band).toBe("strong");
    expect(result.travelScore).toBeCloseTo(
      weekendTravelScoreDelta(result.travelFit),
      5,
    );
    expect(result.capacityScore).toBe(WEEKEND_SCORING.CAPACITY_STRONG_BONUS);
    expect(result.weatherScore).toBe(0); // two clear days → 0
    expect(result.scoreDelta).toBe(
      result.travelScore + WEEKEND_SCORING.CAPACITY_STRONG_BONUS,
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
      destinationWeather: {
        days: [
          { date: "2026-08-05", condition: "stormy" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
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
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    expect(result.eligible).toBe(false);
    expect(result.capacity.eligible).toBe(false);
  });

  it("includes weekendTripReady reason when eligible (strong) ", () => {
    const d = dest({
      id: "test",
      prefecture: "Kyoto",
      recommendedVisitHours: { min: 1, max: 10 },
      transportOptions: { shinkansen: 180 },
    });
    const ctx = context({
      destinationWeather: {
        days: [
          { date: "2026-08-05", condition: "clear" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["shinkansen"],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["shinkansen"]);
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
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
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
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
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
      destinationWeather: {
        days: [
          { date: "2026-08-05", condition: "rainy" },
          { date: "2026-08-06", condition: "clear" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
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
      destinationWeather: {
        days: [
          { date: "2026-08-05", condition: "stormy" },
          { date: "2026-08-06", condition: "rainy" },
        ],
      },
      publicModes: ["train"],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    });

    const result = evaluateWeekendCandidate(d, ctx, [d], ["train"]);
    const weatherReason = result.reasons.find(
      (r) => r.code === "weekendWeatherPoorOutdoor",
    );
    expect(weatherReason).toBeDefined();
  });

  it("origin-local destination excluded when municipality matches, kept otherwise", () => {
    const d = dest({
      id: "local",
      prefecture: "Tokyo",
      municipalityId: "Osaka:osaka",
      recommendedVisitHours: { min: 8, max: 12 }, // 720 min → strong capacity
      transportOptions: { train: 190 },
    });
    const ctx = context({
      publicModes: ["train"],
      homeStationCoords: { lat: 34.7, lng: 135.5 },
    });

    // Same municipality as the origin → excluded (not a getaway).
    const excluded = evaluateWeekendCandidate(
      d,
      ctx,
      [d],
      ["train"],
      "Osaka:osaka",
    );
    expect(excluded.eligible).toBe(false);

    // Undetermined origin municipality → safe fallback, retained.
    const kept = evaluateWeekendCandidate(d, ctx, [d], ["train"], undefined);
    expect(kept.eligible).toBe(true);
  });
});
