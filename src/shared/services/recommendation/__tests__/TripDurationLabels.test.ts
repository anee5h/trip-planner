import { describe, expect, it } from "vitest";
import {
  formatTripDurationLabel,
  type TripDurationEstimate,
} from "../TripDurationService";

function estimate(band: TripDurationEstimate["band"]): TripDurationEstimate {
  return {
    visitRangeHours: [2, 6],
    totalRangeHours: [8, 10],
    representativeHours: 9.4,
    band,
    travelEvidence: "estimated",
  };
}

describe("formatTripDurationLabel", () => {
  it("uses short scan-friendly English labels without hours or brackets", () => {
    expect(formatTripDurationLabel(estimate("shortOuting"), "en")).toBe(
      "Short outing",
    );
    expect(formatTripDurationLabel(estimate("halfDay"), "en")).toBe("Half day");
    expect(formatTripDurationLabel(estimate("fullDay"), "en")).toBe("Full day");
    expect(formatTripDurationLabel(estimate("2d1n"), "en")).toBe(
      "2 days / 1 night",
    );
    expect(formatTripDurationLabel(estimate("3d2n"), "en")).toBe(
      "3 days / 2 nights",
    );
  });

  it("uses short scan-friendly Japanese labels without hours or brackets", () => {
    expect(formatTripDurationLabel(estimate("shortOuting"), "ja")).toBe(
      "短時間",
    );
    expect(formatTripDurationLabel(estimate("halfDay"), "ja")).toBe("半日");
    expect(formatTripDurationLabel(estimate("fullDay"), "ja")).toBe("1日");
    expect(formatTripDurationLabel(estimate("2d1n"), "ja")).toBe("2日間・1泊");
    expect(formatTripDurationLabel(estimate("3d2n"), "ja")).toBe("3日間・2泊");
  });
});
