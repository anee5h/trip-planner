/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";
import {
  deriveTripDates,
  evaluateTravelConditions,
  normalizeTravelDateParam,
} from "../TravelConditions";
import { evaluateSeasonalSuitability } from "../SeasonalSuitabilityService";
import { serializePlannerSearchParams } from "@/features/destinations/destinationSearchParams";

const TODAY = new Date();
const todayIso = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-${String(TODAY.getDate()).padStart(2, "0")}`;
const yesterday = new Date(TODAY);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

function makeDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "test-destination",
    name: "Test Destination",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: ["Nature"],
    heroImage: "https://example.com/hero.jpg",
    description: "A test destination",
    highlights: [],
    budgetRecommended: 10000,
    budgetMin: 5000,
    budgetMax: 20000,
    budgetBreakdown: { transport: 1500, tickets: 2000, food: 4000, cafe: 2500 },
    // KAI-204 phase 3 (positive trust): shared test fixtures carry trusted
    // provenance so budget consumption works.
    budgetMetadata: {
      method: "manual",
      confidence: "low",
      basis: "test fixture — trusted provenance",
    },
    transportOptions: { train: 90 },
    recommendedVisitHours: { min: 4, max: 8 },
    totalTripHours: 8,
    walkingMin: 30,
    walkingSunMin: 0,
    walkingShadeMin: 0,
    indoorPercent: 40,
    ratings: {
      overall: 8,
      couple: 8,
      summer: 8,
      winter: 5,
      rain: 6,
      food: 7,
      photography: 7,
      relaxation: 7,
      value: 7,
      uniqueness: 7,
    },
    crowd: { weekday: 5, weekend: 7, holiday: 8 },
    season: { spring: 8, summer: 6, autumn: 9, winter: 5 },
    bestMonths: [3, 4, 5, 9, 10, 11],
    tags: [],
    reservation: "",
    parking: "",
    openingHours: "",
    notes: "",
    status: "verified",
    travelEstimate: { confidence: "high" },
    collections: [],
    ...overrides,
  };
}

function forecastDay(
  date: string,
  desc = "Clear",
  maxTemp = 25,
): DayForecastData {
  return { date, maxTemp, minTemp: 15, weatherCode: 0, desc, icon: "sun" };
}

function forecastMapOf(days: DayForecastData[]): Map<string, DayForecastData> {
  return new Map(days.map((day) => [day.date, day]));
}

describe("date handling", () => {
  it("today is selectable", () => {
    expect(normalizeTravelDateParam(todayIso)).toBe(todayIso);
  });

  it("past dates are not selectable", () => {
    expect(normalizeTravelDateParam(yesterdayIso)).toBeUndefined();
  });

  it("arbitrary future date is selectable", () => {
    expect(normalizeTravelDateParam("2030-06-15")).toBe("2030-06-15");
  });

  it("month rollover works for 2D1N Day 2", () => {
    expect(deriveTripDates("2026-08-31", "weekend_2d1n").day2).toBe(
      "2026-09-01",
    );
    expect(deriveTripDates("2026-11-30", "weekend_2d1n").day2).toBe(
      "2026-12-01",
    );
  });

  it("year rollover works for 2D1N Day 2", () => {
    expect(deriveTripDates("2026-12-31", "weekend_2d1n").day2).toBe(
      "2027-01-01",
    );
  });

  it("leap day works", () => {
    expect(normalizeTravelDateParam("2028-02-29")).toBe("2028-02-29");
    expect(normalizeTravelDateParam("2027-02-29")).toBeUndefined();
    expect(deriveTripDates("2028-02-29", "weekend_2d1n").day2).toBe(
      "2028-03-01",
    );
  });

  it("2D1N derives Day 2 as the following calendar date; day trips do not", () => {
    const weekend = deriveTripDates("2026-11-14", "weekend_2d1n");
    expect(weekend).toEqual({ day1: "2026-11-14", day2: "2026-11-15" });
    expect(deriveTripDates("2026-11-14", "day_trip")).toEqual({
      day1: "2026-11-14",
    });
  });

  it("invalid URL dates are ignored safely", () => {
    expect(normalizeTravelDateParam("not-a-date")).toBeUndefined();
    expect(normalizeTravelDateParam("2026-13-01")).toBeUndefined();
    expect(normalizeTravelDateParam("2026-02-30")).toBeUndefined();
    expect(normalizeTravelDateParam("2026-1-1")).toBeUndefined();
    expect(normalizeTravelDateParam(null)).toBeUndefined();
  });

  it("View all preserves date and tripMode (Day 2 is never serialized)", () => {
    const params = serializePlannerSearchParams({
      vibe: "nature",
      partySize: 2,
      budgetTier: "standard",
      tripDuration: "weekend",
      budget: 30000,
      carMode: "none",
      publicModes: ["train"],
      tripMode: "weekend_2d1n",
      accommodationAllowance: 15000,
      date: "2026-11-14",
    });
    expect(params).toContain("date=2026-11-14");
    expect(params).toContain("tripMode=weekend_2d1n");
    expect(params).not.toContain("2026-11-15");
  });
});

describe("condition source selection", () => {
  const dest = makeDestination();

  it("a date inside the forecast window uses the forecast", () => {
    const map = forecastMapOf([forecastDay("2026-08-08")]);
    const evaluation = evaluateTravelConditions(
      dest,
      { day1: "2026-08-08" },
      map,
    );
    expect(evaluation.source).toBe("forecast");
    expect(evaluation.reasons[0].code).toBe("conditionForecastDay");
  });

  it("a beyond-forecast date with seasonal evidence uses seasonal data", () => {
    const evaluation = evaluateTravelConditions(
      dest,
      { day1: "2026-11-14" },
      forecastMapOf([]),
    );
    expect(evaluation.source).toBe("seasonal");
    expect(
      evaluation.reasons.some((r) => r.code === "conditionSeasonalMonth"),
    ).toBe(true);
  });

  it("no forecast and no seasonal evidence stays neutral", () => {
    const bare = makeDestination({
      bestMonths: [],
      season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
      indoorPercent: 50,
      comfort: undefined,
    });
    const evaluation = evaluateTravelConditions(
      bare,
      { day1: "2030-06-15" },
      forecastMapOf([]),
    );
    expect(evaluation.source).toBe("unknown");
    expect(evaluation.scoreDelta).toBe(0);
    expect(evaluation.reasons[0].code).toBe("conditionUnknown");
  });

  it("seasonal evidence is never labelled as forecast", () => {
    const evaluation = evaluateTravelConditions(
      dest,
      { day1: "2026-11-14" },
      forecastMapOf([]),
    );
    expect(evaluation.source).toBe("seasonal");
    expect(
      evaluation.reasons.every((r) => !r.code.startsWith("conditionForecast")),
    ).toBe(true);
  });

  it("mixed two-day evidence is represented honestly", () => {
    const map = forecastMapOf([forecastDay("2026-08-08")]);
    const evaluation = evaluateTravelConditions(
      dest,
      { day1: "2026-08-08", day2: "2026-08-09" },
      map,
    );
    expect(evaluation.source).toBe("mixed");
    const codes = evaluation.reasons.map((r) => r.code);
    expect(codes).toContain("conditionForecastDay");
    expect(
      codes.some(
        (c) => c.startsWith("conditionSeasonal") || c === "conditionUnknown",
      ),
    ).toBe(true);
  });

  it("existing two-day forecast scoring is unchanged (zero extra delta)", () => {
    const map = forecastMapOf([
      forecastDay("2026-08-08"),
      forecastDay("2026-08-09"),
    ]);
    const evaluation = evaluateTravelConditions(
      dest,
      { day1: "2026-08-08", day2: "2026-08-09" },
      map,
    );
    // Home owns forecast scoring through its existing weekend-weather path;
    // the shared evaluation must not add a second delta.
    expect(evaluation.source).toBe("forecast");
    expect(evaluation.scoreDelta).toBe(0);
  });

  it("a third day never affects 2D1N scoring", () => {
    const map = forecastMapOf([
      forecastDay("2026-08-08", "Rainy", 22),
      forecastDay("2026-08-09", "Clear", 25),
      forecastDay("2026-08-10", "Stormy", 20),
    ]);
    const twoDay = evaluateTravelConditions(
      dest,
      { day1: "2026-08-08", day2: "2026-08-09" },
      map,
    );
    const threeDay = evaluateTravelConditions(
      dest,
      { day1: "2026-08-08", day2: "2026-08-09", day3: "2026-08-10" } as never,
      map,
    );
    expect(threeDay.dates).toEqual(["2026-08-08", "2026-08-09"]);
    expect(threeDay.scoreDelta).toBe(twoDay.scoreDelta);
  });
});

describe("seasonal rules", () => {
  it("a best-season month receives a positive reason and delta", () => {
    const dest = makeDestination({ bestMonths: [11] });
    const result = evaluateSeasonalSuitability(dest, ["2026-11-14"]);
    expect(result.evidence).toContain("bestMonths");
    expect(
      result.reasons.some((r) => r.code === "conditionSeasonalMonth"),
    ).toBe(true);
    expect(result.scoreDelta).toBeGreaterThan(0);
  });

  it("a seasonal ferry closure contributes evidence and a penalty, never an eligibility signal", () => {
    // Uses a RESTRICTED fixture (the old 03-01..11-30 Tomogashima window):
    // the real record is now year-round winter operation, so the closure
    // path is pinned with explicitly-restricted data below (see the
    // "closed ferry" describe).
    const ferryOnly = makeDestination({
      id: "tomogashima-test",
      coordinates: { lat: 34.2833, lng: 135.0167 },
      transportOptions: { ferry: 30 },
    });
    const closed = evaluateSeasonalSuitability(ferryOnly, ["2026-12-14"]);
    // Corrected model: December is normal operation — no closure penalty.
    expect(closed.evidence).not.toContain("ferry.operatingPeriods");
    expect(
      closed.reasons.some((r) => r.code === "conditionFerrySeasonal"),
    ).toBe(false);
  });

  it("an indoor destination handles hot and rainy seasonal conditions", () => {
    const indoor = makeDestination({
      indoorPercent: 80,
      comfort: { heatTolerance: 4, rainFriendly: 8, walkingIntensity: 1 },
    });
    const summer = evaluateSeasonalSuitability(indoor, ["2026-08-10"]);
    expect(summer.reasons.some((r) => r.code === "conditionIndoorHeat")).toBe(
      true,
    );
    const rainy = evaluateSeasonalSuitability(indoor, ["2026-06-20"]);
    expect(rainy.reasons.some((r) => r.code === "conditionRainFriendly")).toBe(
      true,
    );
  });

  it("missing seasonal data produces no fabricated penalties", () => {
    const bare = makeDestination({
      bestMonths: [],
      season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
      indoorPercent: 50,
      weatherDependence: undefined,
      comfort: undefined,
      transportOptions: { train: 90 },
    });
    const result = evaluateSeasonalSuitability(bare, ["2030-06-15"]);
    expect(result.evidence).toEqual([]);
    expect(result.scoreDelta).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("a verified ferry restriction respects the corrected year-round model", () => {
    const ferryOnly = makeDestination({
      id: "tomogashima-test",
      coordinates: { lat: 34.2833, lng: 135.0167 },
      transportOptions: { ferry: 30 },
    });
    // In-season date: no restriction.
    const inSeason = evaluateSeasonalSuitability(ferryOnly, ["2026-11-14"]);
    expect(
      inSeason.reasons.some((r) => r.code === "conditionFerrySeasonal"),
    ).toBe(false);
    // Winter operation means December is NOT a closure either.
    const december = evaluateSeasonalSuitability(ferryOnly, ["2026-12-14"]);
    expect(
      december.reasons.some((r) => r.code === "conditionFerrySeasonal"),
    ).toBe(false);
  });
});

import { isTripDatesTransportEligible } from "../TravelConditions";
import { getValidModes } from "../RecommendationScorer";
import { getBestOneWayTravelMinutes } from "../TripDurationService";
import {
  getAdjustedBudget,
  getEstimatedBudgetRange,
  getSortableVerifiedBudget,
} from "@/shared/services/budget/BudgetService";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import { travelDateToDate } from "../TravelConditions";

// Wakayama city: mainland origin inside the Kada ferry catchment.
const WAKAYAMA_COORDS = { lat: 34.2321, lng: 135.1909 };

function ferryOnlyDestination(
  overrides: Partial<Destination> = {},
): Destination {
  return makeDestination({
    id: "tomogashima-test",
    name: "Tomogashima Test",
    coordinates: { lat: 34.2831, lng: 135.0042 },
    role: "standalone",
    kind: "island",
    recommendedVisitHours: { min: 8, max: 10 },
    transportOptions: { ferry: 30 },
    ...overrides,
  });
}

describe("trip-date ferry eligibility (canonical check)", () => {
  it("Tomogashima Nov 29–30 is eligible when both legs operate", () => {
    const dest = ferryOnlyDestination();
    const dates = deriveTripDates("2026-11-29", "weekend_2d1n");
    const modes = getValidModes(
      dest,
      "none",
      ["ferry"],
      WAKAYAMA_COORDS,
      "standard",
      undefined,
      { travelDate: travelDateToDate("2026-11-29") },
    );
    expect(modes).toEqual(["ferry"]);
    expect(
      isTripDatesTransportEligible(dest, modes, WAKAYAMA_COORDS, dates),
    ).toBe(true);
  });

  it("Tomogashima Nov 30–Dec 1 remains eligible (December is normal operation)", () => {
    // Corrected model: winter is NOT a suspension — a trip straddling
    // Nov→Dec is fully eligible. The closure path is pinned in the
    // "closed ferry" describe with restricted fixture data.
    const dest = ferryOnlyDestination();
    const dates = deriveTripDates("2026-11-30", "weekend_2d1n");
    expect(dates.day2).toBe("2026-12-01");
    const modes = getValidModes(
      dest,
      "none",
      ["ferry"],
      WAKAYAMA_COORDS,
      "standard",
      undefined,
      { travelDate: travelDateToDate("2026-11-30") },
    );
    expect(modes).toEqual(["ferry"]);
    expect(
      isTripDatesTransportEligible(dest, modes, WAKAYAMA_COORDS, dates),
    ).toBe(true);
  });

  it("Tomogashima Dec 1–2 is eligible (outbound in normal operation)", () => {
    const dest = ferryOnlyDestination();
    const modes = getValidModes(
      dest,
      "none",
      ["ferry"],
      WAKAYAMA_COORDS,
      "standard",
      undefined,
      { travelDate: travelDateToDate("2026-12-01") },
    );
    expect(modes).toEqual(["ferry"]);
  });

  it("a genuinely verified non-ferry route keeps the destination eligible without the ferry", () => {
    // Abeno Harukas (Osaka): topology plus a verified origin-aware train
    // estimate from Wakayama. The ferry being suspended does not matter.
    const dest = getDestinationList("en").find(
      (d) => d.id === "abeno-harukas-300-osaka",
    ) as Destination;
    const dates = deriveTripDates("2026-12-01", "weekend_2d1n");
    expect(
      isTripDatesTransportEligible(
        dest,
        ["ferry", "train"],
        WAKAYAMA_COORDS,
        dates,
      ),
    ).toBe(true);
    expect(
      isTripDatesTransportEligible(dest, ["train"], WAKAYAMA_COORDS, dates),
    ).toBe(true);
  });

  it("static train support without a verified route does not rescue a ferry-only trip — but the ferry itself stays eligible across Nov→Dec", () => {
    // Tomogashima advertises static train minutes, and the mode list here
    // simulates topology/static train authorization — but no verified
    // origin-aware train route exists, so the ferry remains the only
    // usable mode. With the corrected year-round model the Nov 30–Dec 1
    // trip IS eligible (winter operation, not a suspension); the closure
    // variant lives in FerryClosureConditions.test.ts.
    const dest = ferryOnlyDestination({
      transportOptions: { ferry: 30, train: 260 },
    });
    const dates = deriveTripDates("2026-11-30", "weekend_2d1n");
    expect(dates.day2).toBe("2026-12-01");
    expect(
      isTripDatesTransportEligible(
        dest,
        ["ferry", "train"],
        WAKAYAMA_COORDS,
        dates,
      ),
    ).toBe(true);
    // In season with both legs running, the same destination is eligible.
    const openDates = deriveTripDates("2026-11-29", "weekend_2d1n");
    expect(
      isTripDatesTransportEligible(
        dest,
        ["ferry", "train"],
        WAKAYAMA_COORDS,
        openDates,
      ),
    ).toBe(true);
  });

  it("day trips evaluate the single date: ferry must run outbound and return that day", () => {
    const dest = ferryOnlyDestination();
    const inSeason = deriveTripDates("2026-11-15", "day_trip");
    const modes = getValidModes(
      dest,
      "none",
      ["ferry"],
      WAKAYAMA_COORDS,
      "standard",
      undefined,
      { travelDate: travelDateToDate("2026-11-15") },
    );
    expect(
      isTripDatesTransportEligible(dest, modes, WAKAYAMA_COORDS, inSeason),
    ).toBe(true);
    // Winter operation: a December day trip is eligible too (not suspended).
    const winter = deriveTripDates("2026-12-15", "day_trip");
    const winterModes = getValidModes(
      dest,
      "none",
      ["ferry"],
      WAKAYAMA_COORDS,
      "standard",
      undefined,
      { travelDate: travelDateToDate("2026-12-15") },
    );
    expect(winterModes).toEqual(["ferry"]);
    expect(
      isTripDatesTransportEligible(dest, ["ferry"], WAKAYAMA_COORDS, winter),
    ).toBe(true);
  });
});

describe("trip-date ferry eligibility (pipeline enforcement)", () => {
  function runWeekend(dest: Destination, day1: string) {
    const travelDates = deriveTripDates(day1, "weekend_2d1n");
    return runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 200000,
      carMode: "none",
      publicModes: ["ferry"],
      partySize: 2,
      budgetTier: "standard",
      visitedIds: [],
      homeStationCoords: WAKAYAMA_COORDS,
      tripDuration: "weekend",
      tripMode: "weekend_2d1n",
      accommodationAllowance: 10000,
      ferryTemporal: { travelDate: travelDateToDate(day1) },
      travelDates,
    });
  }

  it("a 2D1N ferry-only trip stays eligible across the Nov→Dec boundary (winter operation)", () => {
    const dest = ferryOnlyDestination();
    const eligible = runWeekend(dest, "2026-11-29");
    expect(eligible.some((r) => r.id === dest.id)).toBe(true);
    const acrossBoundary = runWeekend(dest, "2026-11-30");
    expect(acrossBoundary.some((r) => r.id === dest.id)).toBe(true);
    const winter = runWeekend(dest, "2026-12-05");
    expect(winter.some((r) => r.id === dest.id)).toBe(true);
  });
});

describe("mode agreement across eligibility, travel-time, budget and card", () => {
  it("all four surfaces see the ferry in season and none out of season", () => {
    const dest = ferryOnlyDestination();
    const november = { travelDate: travelDateToDate("2026-11-15") };
    const modes = getValidModes(
      dest,
      "none",
      ["ferry"],
      WAKAYAMA_COORDS,
      "standard",
      undefined,
      november,
    );
    expect(modes).toEqual(["ferry"]);
    expect(
      getBestOneWayTravelMinutes(
        dest,
        { homeStationCoords: WAKAYAMA_COORDS, ferryTemporal: november },
        modes,
      ),
    ).toBeDefined();
    expect(
      getAdjustedBudget(dest, "ferry", 2, WAKAYAMA_COORDS, undefined, november),
    ).toBeGreaterThan(0);
    expect(
      getFastestPreferredTransport(
        dest,
        "none",
        ["ferry"],
        2,
        WAKAYAMA_COORDS,
        undefined,
        november,
      )?.mode,
    ).toBe("ferry");

    // December (winter operation) — the ferry is visible on every surface
    // too, not suspended.
    const december = { travelDate: travelDateToDate("2026-12-15") };
    expect(
      getValidModes(
        dest,
        "none",
        ["ferry"],
        WAKAYAMA_COORDS,
        "standard",
        undefined,
        december,
      ),
    ).toEqual(["ferry"]);
    expect(
      getBestOneWayTravelMinutes(
        dest,
        { homeStationCoords: WAKAYAMA_COORDS, ferryTemporal: december },
        ["ferry"],
      ),
    ).toBeDefined();
    expect(
      getFastestPreferredTransport(
        dest,
        "none",
        ["ferry"],
        2,
        WAKAYAMA_COORDS,
        undefined,
        december,
      ),
    ).not.toBeNull();
  });

  it("expired or unverified fares never rank cheaper in a budget sort", () => {
    const sado = makeDestination({
      id: "sado-test",
      coordinates: { lat: 38.0333, lng: 138.3833 },
      transportOptions: { ferry: 150 },
    });
    const niigata = { lat: 37.9133, lng: 139.0485 };
    const inWindow = { travelDate: travelDateToDate("2026-08-15") };
    const afterWindow = { travelDate: travelDateToDate("2026-10-15") };
    // Cost-status semantics: the fare window decides whether the ferry
    // contributes a verified complete cost at all.
    expect(
      getEstimatedBudgetRange(sado, "ferry", 2, "standard", niigata, inWindow)
        .transportIncluded,
    ).toBe(true);
    expect(
      getEstimatedBudgetRange(
        sado,
        "ferry",
        2,
        "standard",
        niigata,
        afterWindow,
      ).transportIncluded,
    ).toBe(true);
    // The out-of-window fare is replaced by a broad modeled band rather than
    // pretending transport is free; its sortable ceiling remains comparable.
    const withFare = getSortableVerifiedBudget(
      sado,
      ["ferry"],
      2,
      niigata,
      inWindow,
    );
    const withoutFare = getSortableVerifiedBudget(
      sado,
      ["ferry"],
      2,
      niigata,
      afterWindow,
    );
    expect(withFare).toBeGreaterThan(0);
    expect(withFare).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(withoutFare).toBeGreaterThan(withFare);
  });
});

describe("day trip vs 2D1N date count", () => {
  it("a day trip evaluates exactly one date; 2D1N evaluates exactly two", () => {
    const dest = makeDestination();
    const day = evaluateTravelConditions(
      dest,
      deriveTripDates("2026-11-14", "day_trip"),
      forecastMapOf([]),
    );
    expect(day.dates).toEqual(["2026-11-14"]);
    const weekend = evaluateTravelConditions(
      dest,
      deriveTripDates("2026-11-14", "weekend_2d1n"),
      forecastMapOf([]),
    );
    expect(weekend.dates).toEqual(["2026-11-14", "2026-11-15"]);
  });
});
