import { describe, expect, it } from "vitest";
import {
  estimateTripDuration,
  formatTripDurationLabel,
  getBand,
  getDerivedTripDurationHours,
  getDayTripAvailableTimeHours,
  getDayTripTravelEfficiency,
  getVisitBand,
  matchesPersonalizedDayTripDuration,
  matchesVisitDuration,
} from "./TripDurationService";
import type { Destination } from "@/shared/types/destination";

const destination = {
  id: "miyajima",
  prefecture: "Hiroshima",
  municipalityId: "Hiroshima:hatsukaichi",
  totalTripHours: 4,
  recommendedVisitHours: { min: 3, max: 4 },
  // KAI-87: fixture coordinates must stay outside the miyajima island box
  // (Miyajima island is now its own transport zone); Hiroshima city centre
  // keeps the fixture on mainland-honshu.
  coordinates: { lat: 34.3853, lng: 132.4553 },
  transportOptions: { train: 40, shinkansen: 240 },
  travelBuffers: { ferryMinutes: 20 },
} as unknown as Destination;

describe("TripDurationService", () => {
  it("classifies duration bands correctly", () => {
    expect(getBand(2.5)).toBe("shortOuting");
    expect(getBand(5)).toBe("halfDay");
    expect(getBand(10)).toBe("fullDay");
    expect(getBand(16)).toBe("weekend");
  });

  it("formats localized trip duration labels in English and Japanese", () => {
    const estShort = {
      representativeHours: 2.5,
      band: "shortOuting",
    } as never;
    const estHalf = { representativeHours: 6.0, band: "halfDay" } as never;
    const estFull = { representativeHours: 10.0, band: "fullDay" } as never;
    const estWeekend = { representativeHours: 18.0, band: "weekend" } as never;

    expect(formatTripDurationLabel(estShort, "en")).toBe("Short outing");
    expect(formatTripDurationLabel(estShort, "ja")).toBe("短時間");

    expect(formatTripDurationLabel(estHalf, "en")).toBe("Half day");
    expect(formatTripDurationLabel(estHalf, "ja")).toBe("半日");

    expect(formatTripDurationLabel(estFull, "en")).toBe("Full day");
    expect(formatTripDurationLabel(estFull, "ja")).toBe("1日");

    expect(formatTripDurationLabel(estWeekend, "en")).toBe("Weekend");
    expect(formatTripDurationLabel(estWeekend, "ja")).toBe("週末");
  });

  it("uses visit time when origin is unavailable", () => {
    const estimate = estimateTripDuration(
      destination,
      { homeStationCoords: null } as never,
      ["train"],
    );

    expect(estimate?.totalRangeHours).toEqual([3, 4]);
    expect(estimate?.band).toBe("shortOuting");
  });

  it("adds round-trip travel and buffers from the origin", () => {
    const estimate = estimateTripDuration(
      destination,
      { homeStationCoords: { lat: 34.4, lng: 132.45 } } as never,
      ["train"],
    );

    // Verified Hiroshima → Miyajima corridor [25, 50] min, midpoint 38:
    // round trip 76 min + 20 min ferry buffer over a 3 h visit.
    expect(estimate?.totalRangeHours[0]).toBeCloseTo(4.6, 2);
    expect(estimate?.mode).toBe("train");
    expect(estimate?.band).toBe("halfDay");
  });

  it("flags impossible destinations when min required time exceeds available time limit", () => {
    const estimate = estimateTripDuration(
      destination,
      {
        homeStationCoords: { lat: 34.4, lng: 132.45 },
        availableTimeHours: 3,
      } as never,
      ["train"],
    );

    expect(estimate?.isImpossible).toBe(true);
    expect(estimate?.isBorderline).toBe(false);
    expect(estimate?.warningMessage?.en).toContain(
      "Exceeds available time limit",
    );
    expect(estimate?.warningMessage?.ja).toContain("超えます");
  });

  it("flags borderline destinations when max visit time exceeds available time limit", () => {
    const estimate = estimateTripDuration(
      destination,
      {
        homeStationCoords: { lat: 34.4, lng: 132.45 },
        availableTimeHours: 5,
      } as never,
      ["train"],
    );

    expect(estimate?.isImpossible).toBe(false);
    expect(estimate?.isBorderline).toBe(true);
    expect(estimate?.warningMessage?.en).toContain("Tight schedule");
    expect(estimate?.warningMessage?.ja).toContain("時間がタイトです");
  });

  it("uses recommendedVisitHours and ignores legacy totalTripHours", () => {
    const modern = {
      ...destination,
      id: "modern-both",
      totalTripHours: 8,
    };
    const estimate = estimateTripDuration(
      modern,
      { homeStationCoords: null } as never,
      ["train"],
    );
    expect(estimate?.visitRangeHours).toEqual([3, 4]);
    expect(estimate?.totalRangeHours).toEqual([3, 4]);
    expect(estimate?.band).toBe("shortOuting");

    const staleLegacy = estimateTripDuration(
      { ...modern, totalTripHours: 99 },
      { homeStationCoords: null } as never,
      ["train"],
    );
    expect(staleLegacy?.visitRangeHours).toEqual([3, 4]);
    expect(staleLegacy?.totalRangeHours).toEqual([3, 4]);
    expect(staleLegacy?.band).toBe("shortOuting");
  });

  it("plans modern records without totalTripHours", () => {
    const modern = {
      ...destination,
      id: "modern-no-legacy",
      totalTripHours: undefined,
    };
    const estimate = estimateTripDuration(
      modern,
      { homeStationCoords: { lat: 34.4, lng: 132.45 } } as never,
      ["train"],
    );
    expect(estimate?.visitRangeHours).toEqual([3, 4]);
    expect(estimate?.totalRangeHours[0]).toBeGreaterThan(3);
    expect(estimate?.mode).toBe("train");
  });

  it("returns no estimate for legacy-only records instead of using ambiguous totalTripHours", () => {
    const legacyOnly = {
      ...destination,
      id: "legacy-only",
      recommendedVisitHours: undefined,
      totalTripHours: 6,
    } as unknown as Destination;
    expect(
      estimateTripDuration(legacyOnly, { homeStationCoords: null } as never, [
        "train",
      ]),
    ).toBeNull();
    expect(
      getDerivedTripDurationHours(
        legacyOnly,
        { homeStationCoords: null } as never,
        ["train"],
      ),
    ).toBeUndefined();
  });

  it("returns no estimate when all duration data is missing", () => {
    const missing = {
      ...destination,
      id: "missing-all",
      recommendedVisitHours: undefined,
      totalTripHours: undefined,
    } as unknown as Destination;
    expect(
      estimateTripDuration(missing, { homeStationCoords: null } as never, [
        "train",
      ]),
    ).toBeNull();
  });

  it("never adds transport on top of an origin-inclusive legacy value", () => {
    const legacyStyle = {
      ...destination,
      id: "legacy-style",
      recommendedVisitHours: { min: 1, max: 2 },
      totalTripHours: 6,
    };
    const estimate = estimateTripDuration(
      legacyStyle,
      { homeStationCoords: { lat: 34.4, lng: 132.45 } } as never,
      ["train"],
    );
    // Verified Hiroshima -> Miyajima corridor midpoint 38 min, round trip
    // 76 min + 20 min ferry buffer = 1.6 h over the canonical 1-2 h visit.
    expect(estimate?.visitRangeHours).toEqual([1, 2]);
    expect(estimate?.totalRangeHours[0]).toBeCloseTo(2.6, 2);
    expect(estimate?.totalRangeHours[1]).toBeCloseTo(3.6, 2);
    // The legacy 6 h value is never treated as visit time nor as a total
    // that travel is added onto.
    expect(estimate?.totalRangeHours[1]).not.toBeCloseTo(7.6, 2);
  });

  it("keeps the visit band independent of origin", () => {
    const dest = { ...destination, id: "origin-independent" };
    expect(getVisitBand(dest)).toBe("halfDay");
    expect(matchesVisitDuration(dest, "halfDay")).toBe(true);
    expect(matchesVisitDuration(dest, "shortOuting")).toBe(false);
  });

  it("uses canonical travel for personalized day-trip feasibility", () => {
    const feasibleTokyoCandidate = {
      ...destination,
      id: "tokyo-feasible-half-day",
      prefecture: "Kanagawa",
      municipalityId: undefined,
      recommendedVisitHours: { min: 3, max: 4 },
    };
    const infeasibleTokyoCandidate = {
      ...destination,
      id: "kyoto-infeasible-half-day",
      prefecture: "Kyoto",
      municipalityId: undefined,
      recommendedVisitHours: { min: 3, max: 4 },
    };
    const tokyo = { lat: 35.6812, lng: 139.7671 };
    const context = { homeStationCoords: tokyo } as never;

    expect(getDayTripAvailableTimeHours("shortOuting")).toBe(4);
    expect(getDayTripAvailableTimeHours("halfDay")).toBe(7.5);
    expect(getDayTripAvailableTimeHours("fullDay")).toBe(14);
    expect(getDayTripAvailableTimeHours("any")).toBe(14);
    expect(
      matchesPersonalizedDayTripDuration(
        feasibleTokyoCandidate,
        context,
        ["train"],
        "halfDay",
      ),
    ).toBe(true);
    expect(
      matchesPersonalizedDayTripDuration(
        infeasibleTokyoCandidate,
        context,
        ["shinkansen"],
        "halfDay",
      ),
    ).toBe(false);
  });

  it("keeps unknown travel neutral only without a personalized origin", () => {
    const unknownCandidate = {
      ...destination,
      id: "unknown-origin-half-day",
      prefecture: "Kanagawa",
      municipalityId: undefined,
      coordinates: undefined,
      transportOptions: { bus: 60 },
      recommendedVisitHours: { min: 3, max: 4 },
    };

    expect(
      matchesPersonalizedDayTripDuration(
        unknownCandidate,
        { homeStationCoords: null } as never,
        ["bus"],
        "halfDay",
      ),
    ).toBe(true);
    expect(
      matchesPersonalizedDayTripDuration(
        unknownCandidate,
        { homeStationCoords: null, originZoneId: "mainland-honshu" } as never,
        ["bus"],
        "halfDay",
      ),
    ).toBe(false);
  });

  it("night-only coach never passes the any-duration gate, even without visit hours", () => {
    // KAI-63: the no-visit-band "any" branch must not admit a night-only
    // highway coach into a same-day trip. Fukuoka from Tokyo is reachable
    // only by the night-only はかた号; a visit-hours-less Fukuoka record must
    // stay excluded. The same record in Osaka (day corridor exists) passes.
    const tokyo = { lat: 35.6812, lng: 139.7671 };
    const fukuokaNoVisit = {
      ...destination,
      id: "fukuoka-no-visit-hours",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      coordinates: { lat: 33.5902, lng: 130.4017 },
      recommendedVisitHours: undefined,
    };
    const osakaNoVisit = {
      ...destination,
      id: "osaka-no-visit-hours",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7025, lng: 135.4959 },
      recommendedVisitHours: undefined,
    };
    expect(
      matchesPersonalizedDayTripDuration(
        fukuokaNoVisit,
        { homeStationCoords: tokyo } as never,
        ["bus"],
        "any",
      ),
    ).toBe(false);
    expect(
      matchesPersonalizedDayTripDuration(
        osakaNoVisit,
        { homeStationCoords: tokyo } as never,
        ["bus"],
        "any",
      ),
    ).toBe(true);
  });

  it("changes only the total duration when origin travel changes", () => {
    const dest = { ...destination, id: "personalized-total" };
    const noOrigin = estimateTripDuration(
      dest,
      { homeStationCoords: null } as never,
      ["train"],
    );
    const withOrigin = estimateTripDuration(
      dest,
      { homeStationCoords: { lat: 34.4, lng: 132.45 } } as never,
      ["train"],
    );
    expect(noOrigin?.visitRangeHours).toEqual([3, 4]);
    expect(withOrigin?.visitRangeHours).toEqual([3, 4]);
    expect(withOrigin?.totalRangeHours[0]).toBeGreaterThan(
      noOrigin!.totalRangeHours[0],
    );
    expect(
      getDerivedTripDurationHours(dest, { homeStationCoords: null } as never, [
        "train",
      ]),
    ).toBe(3.5);
    expect(
      getDerivedTripDurationHours(
        dest,
        { homeStationCoords: { lat: 34.4, lng: 132.45 } } as never,
        ["train"],
      ),
    ).toBeCloseTo(5.1, 1);
  });

  it("derives mode-specific totals for train vs shinkansen", () => {
    // Station-level endpoints: Shin-Osaka origin, Kyoto Station destination.
    // Shinkansen [15,35] then genuinely beats the direct train [28,45] and
    // keeps the 4h visit under the 5h food-duration threshold.
    const osaka = { lat: 34.7335, lng: 135.5001 };
    const twoMode = {
      ...destination,
      id: "kyoto-two-mode",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 34.9858, lng: 135.7588 },
      recommendedVisitHours: { min: 4, max: 4 },
      travelBuffers: undefined,
    };

    const train = estimateTripDuration(
      twoMode,
      { homeStationCoords: osaka } as never,
      ["train"],
    );
    const shinkansen = estimateTripDuration(
      twoMode,
      { homeStationCoords: osaka } as never,
      ["shinkansen"],
    );

    expect(train).not.toBeNull();
    expect(shinkansen).not.toBeNull();
    expect(train!.visitRangeHours).toEqual(shinkansen!.visitRangeHours);
    // Verified Osaka -> Kyoto train midpoint 36.5 min vs shinkansen 25 min.
    // With a 4h visit, train crosses the 5h food-duration threshold while
    // shinkansen stays under it.
    expect(train!.totalRangeHours[0]).toBeGreaterThan(
      shinkansen!.totalRangeHours[0],
    );
    expect(train!.representativeHours).toBeGreaterThan(5);
    expect(shinkansen!.representativeHours).toBeLessThan(5);
  });

  it("bounds the smooth day-trip travel-efficiency contribution", () => {
    const efficiency = getDayTripTravelEfficiency(
      destination,
      {
        homeStationCoords: { lat: 34.4, lng: 132.45 },
        tripMode: "day_trip",
        tripDuration: "halfDay",
      } as never,
      "train",
    );

    expect(efficiency?.evidence).toBe("verified");
    expect(efficiency?.travelShare).toBeGreaterThan(0);
    expect(efficiency?.totalOutingHours).toBeGreaterThan(
      efficiency!.visitHours,
    );
    expect(efficiency?.availableTimeHours).toBe(7.5);
    expect(efficiency?.travelEnvelopeShare).toBeGreaterThan(0);
    expect(efficiency?.contribution).toBeLessThan(0);
    expect(efficiency?.contribution).toBeGreaterThan(-24);
  });

  it("does not add a visit-duration utilization penalty", () => {
    const origin = { lat: 34.4, lng: 132.45 };
    const shortVisit = getDayTripTravelEfficiency(
      { ...destination, recommendedVisitHours: { min: 2, max: 2 } },
      {
        homeStationCoords: origin,
        tripMode: "day_trip",
        tripDuration: "fullDay",
      } as never,
      "train",
    )!;
    const longVisit = getDayTripTravelEfficiency(
      { ...destination, recommendedVisitHours: { min: 8, max: 8 } },
      {
        homeStationCoords: origin,
        tripMode: "day_trip",
        tripDuration: "fullDay",
      } as never,
      "train",
    )!;

    expect(longVisit.travelHours).toBe(shortVisit.travelHours);
    expect(longVisit.travelEnvelopeShare).toBe(shortVisit.travelEnvelopeShare);
    expect(longVisit.contribution).toBeGreaterThan(shortVisit.contribution);
  });
});
