import { describe, expect, it } from "vitest";
import {
  estimateTripDuration,
  formatTripDurationLabel,
  getBand,
} from "./TripDurationService";
import type { Destination } from "@/shared/types/destination";

const destination = {
  id: "miyajima",
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

    expect(estimate?.totalRangeHours[0]).toBeCloseTo(4.6667, 2);
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
});
