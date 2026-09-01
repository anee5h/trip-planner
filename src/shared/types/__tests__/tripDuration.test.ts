import { describe, expect, it } from "vitest";
import {
  HOME_TRIP_DURATION_OPTIONS,
  getTripDurationSemantics,
  normalizeExplorerTripDuration,
  normalizeHomepageTripDuration,
  normalizeTripDuration,
  type TripDuration,
} from "../tripDuration";

describe("canonical trip duration", () => {
  it.each([
    ["shortOuting", 1, 0, 4],
    ["halfDay", 1, 0, 7.5],
    ["fullDay", 1, 0, 14],
    ["2d1n", 2, 1, undefined],
    ["3d2n", 3, 2, undefined],
  ] as const)(
    "derives semantics for %s",
    (duration, days, nights, maxHours) => {
      expect(getTripDurationSemantics(duration as TripDuration)).toMatchObject({
        days,
        nights,
        ...(maxHours === undefined ? {} : { maxHours }),
      });
    },
  );

  it("exposes exactly the five planner choices", () => {
    expect(HOME_TRIP_DURATION_OPTIONS).toEqual([
      "shortOuting",
      "halfDay",
      "fullDay",
      "2d1n",
      "3d2n",
    ]);
  });

  it.each([
    ["weekend", "2d1n"],
    ["weekend_2d1n", "2d1n"],
    ["day_trip", "halfDay"],
    ["dayTrip", "fullDay"],
    ["3d2n", "3d2n"],
  ] as const)("migrates %s to %s", (legacy, expected) => {
    expect(normalizeTripDuration(legacy)).toBe(expected);
  });

  it("accepts future N-day/N-night overnight values without a new mode model", () => {
    expect(getTripDurationSemantics("4d3n")).toMatchObject({
      days: 4,
      nights: 3,
      isOvernight: true,
    });
  });

  it("keeps future overnight values internal to the generic model", () => {
    expect(normalizeHomepageTripDuration("4d3n")).toBeUndefined();
    expect(normalizeHomepageTripDuration("3d2n")).toBe("3d2n");
    expect(normalizeHomepageTripDuration("weekend_2d1n")).toBe("2d1n");
    expect(normalizeExplorerTripDuration("4d3n")).toBeUndefined();
    expect(normalizeExplorerTripDuration("any")).toBe("any");
  });
});
