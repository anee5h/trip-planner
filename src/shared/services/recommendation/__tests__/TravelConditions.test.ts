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
    transportOptions: { train: 90 },
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

  it("a seasonal ferry closure can make a ferry-only destination ineligible", () => {
    // Tomogashima: the only verified seasonal ferry runs 03-01..11-30.
    const ferryOnly = makeDestination({
      id: "tomogashima-test",
      coordinates: { lat: 34.2833, lng: 135.0167 },
      transportOptions: { ferry: 30 },
    });
    const closed = evaluateSeasonalSuitability(ferryOnly, ["2026-12-14"]);
    expect(closed.evidence).toContain("ferry.operatingPeriods");
    expect(
      closed.reasons.some((r) => r.code === "conditionFerrySeasonal"),
    ).toBe(true);
    expect(closed.eligible).toBe(false);
    expect(closed.scoreDelta).toBeLessThan(0);
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
    expect(result.eligible).toBe(true);
  });

  it("a verified ferry restriction respects the selected date", () => {
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
    expect(inSeason.eligible).toBe(true);
    // Out-of-season date: restriction applies.
    const outOfSeason = evaluateSeasonalSuitability(ferryOnly, ["2026-12-14"]);
    expect(
      outOfSeason.reasons.some((r) => r.code === "conditionFerrySeasonal"),
    ).toBe(true);
    expect(outOfSeason.eligible).toBe(false);
  });
});
