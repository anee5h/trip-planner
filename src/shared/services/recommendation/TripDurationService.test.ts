import { describe, expect, it } from "vitest";
import {
  estimateTripDuration,
  formatTripDurationLabel,
  getBand,
  getDerivedTripDurationHours,
  getVisitBand,
  matchesVisitDuration,
} from "./TripDurationService";
import type { Destination } from "@/shared/types/destination";

const destination = {
  id: "miyajima",
  prefecture: "Hiroshima",
  municipalityId: "Hiroshima:hatsukaichi",
  totalTripHours: 4,
  recommendedVisitHours: { min: 3, max: 4 },
  coordinates: { lat: 34.2958, lng: 132.3197 },
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

    expect(formatTripDurationLabel(estShort, "en")).toBe("Short Outing (2.5h)");
    expect(formatTripDurationLabel(estShort, "ja")).toBe(
      "サクッと外出 (2.5時間)",
    );

    expect(formatTripDurationLabel(estHalf, "en")).toBe("Half-Day (6h)");
    expect(formatTripDurationLabel(estHalf, "ja")).toBe("半日日帰り (6時間)");

    expect(formatTripDurationLabel(estFull, "en")).toBe("Full-Day (10h)");
    expect(formatTripDurationLabel(estFull, "ja")).toBe("1日日帰り (10時間)");

    expect(formatTripDurationLabel(estWeekend, "en")).toBe("Weekend (18h)");
    expect(formatTripDurationLabel(estWeekend, "ja")).toBe(
      "1泊2日/週末 (18時間)",
    );
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
    const osaka = { lat: 34.6937, lng: 135.5023 };
    const twoMode = {
      ...destination,
      id: "kyoto-two-mode",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
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
});
