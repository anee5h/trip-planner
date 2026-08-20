/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import type { Destination } from "@/shared/types/destination";
import { deriveTripDates, travelDateToDate } from "../TravelConditions";
import { isTripDatesTransportEligible } from "../TravelConditions";
import { getValidModes } from "../RecommendationScorer";
import { evaluateSeasonalSuitability } from "../SeasonalSuitabilityService";
import { runRecommendationPipeline } from "../RecommendationPipeline";

/**
 * KAI-42: the CLOSED-ferry path pinned with explicitly-restricted fixture
 * data. The REAL Tomogashima record is now year-round (normal Mar–Dec,
 * winter operation Jan–Feb), so the suspension semantics that used to ride
 * on real data are tested here against the old 03-01..11-30 window — the
 * trip-level outbound/return logic (isTripDatesTransportEligible) and the
 * seasonal-closure scoring stay covered without freezing stale data into
 * the dataset.
 */
vi.mock("../../../data/ferry-estimates.json", () => {
  const raw = JSON.parse(
    fs.readFileSync(
      `${process.cwd()}/src/shared/data/ferry-estimates.json`,
      "utf8",
    ),
  ) as { services: Array<Record<string, unknown>> };
  return {
    default: {
      ...raw,
      services: raw.services.map((s) =>
        s.id === "tomogashima-kisen"
          ? { ...s, operatingPeriods: [{ from: "03-01", to: "11-30" }] }
          : s,
      ),
    },
  };
});

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

describe("seasonal rules — closed ferry (restricted fixture data)", () => {
  it("a seasonal ferry closure contributes evidence and a penalty, never an eligibility signal", () => {
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
    expect(closed.scoreDelta).toBeLessThan(0);
  });

  it("Tomogashima Nov 30–Dec 1 is ineligible because the return ferry is suspended", () => {
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
    // Outbound (Day 1) is in season, so the ferry is still authorized...
    expect(modes).toEqual(["ferry"]);
    // ...but the return leg (Day 2) is suspended: the trip is ineligible.
    expect(
      isTripDatesTransportEligible(dest, modes, WAKAYAMA_COORDS, dates),
    ).toBe(false);
  });

  it("Tomogashima Dec 1–2 is ineligible (outbound suspended)", () => {
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
    expect(modes).toEqual([]);
  });

  it("a December day trip is ineligible when the ferry is closed", () => {
    const dest = ferryOnlyDestination();
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
    expect(winterModes).toEqual([]);
    expect(
      isTripDatesTransportEligible(dest, ["ferry"], WAKAYAMA_COORDS, winter),
    ).toBe(false);
  });

  it("the recommendation pipeline rejects a 2D1N trip whose return leg is suspended", () => {
    const dest = ferryOnlyDestination();
    const runWeekend = (day1: string) =>
      runRecommendationPipeline([dest], {
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
        travelDates: deriveTripDates(day1, "weekend_2d1n"),
      });
    // Both legs inside the window: recommended.
    expect(runWeekend("2026-11-29").some((r) => r.id === dest.id)).toBe(true);
    // Day 2 (Dec 1) suspended: rejected.
    expect(runWeekend("2026-11-30").some((r) => r.id === dest.id)).toBe(false);
  });
});
