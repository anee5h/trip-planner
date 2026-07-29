import { describe, expect, it } from "vitest";
import { estimateTripDuration } from "./TripDurationService";
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
  it("uses visit time when origin is unavailable", () => {
    const estimate = estimateTripDuration(
      destination,
      { homeStationCoords: null } as never,
      ["train"],
    );

    expect(estimate?.totalRangeHours).toEqual([3, 4]);
    expect(estimate?.band).toBe("halfDay");
  });

  it("adds round-trip travel and buffers from the origin", () => {
    const estimate = estimateTripDuration(
      destination,
      { homeStationCoords: { lat: 34.4, lng: 132.45 } } as never,
      ["train"],
    );

    expect(estimate?.totalRangeHours[0]).toBeCloseTo(4.6667, 2);
    expect(estimate?.mode).toBe("train");
  });
});
