import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { buildHomeDiscoveryRails } from "../DeferredDiscoveryRails";

function destination(id: string, score: number, season: number): Destination {
  return {
    id,
    name: id,
    prefecture: "Tokyo",
    region: "Kanto",
    categories: ["Nature"],
    tags: ["Nature"],
    coordinates: { lat: 35.68, lng: 139.76 },
    season: { summer: season },
    bestMonths: [8],
    bestSeason: "Summer",
    score,
  } as unknown as Destination;
}

describe("buildHomeDiscoveryRails", () => {
  it("keeps deterministic seasonal order and excludes earlier IDs", () => {
    const result = buildHomeDiscoveryRails({
      allDestinations: [],
      recommendedDestinations: [
        destination("top-match", 100, 10),
        destination("seasonal-high", 80, 10),
        destination("seasonal-low", 70, 8),
      ],
      topMatchIds: ["top-match"],
      recentlyViewedDestinations: [],
      bucketListDisplayedIds: [],
      homeStationCoords: null,
      carMode: "none",
      publicModes: [],
      visitedIds: [],
      tripDuration: "fullDay",
      seasonalReferenceDate: new Date("2026-08-01T12:00:00"),
    });

    expect(result.seasonal.map(({ id }) => id)).toEqual([
      "seasonal-high",
      "seasonal-low",
    ]);
    expect(result.under60).toEqual([]);
    expect(result.nearby).toEqual([]);
    expect(result.overnightGetaways).toEqual([]);
    expect(result.longerJourney).toEqual([]);
  });

  it("preserves weekend rail order while applying strict shared deduplication", () => {
    const result = buildHomeDiscoveryRails({
      allDestinations: [],
      tripDuration: "2d1n",
      recommendedDestinations: [
        destination("top-match", 100, 10),
        {
          ...destination("weekend-high", 90, 10),
          overnight: {
            travelFit: { eligible: true, band: "strong", oneWayMinutes: 90 },
            capacity: { eligible: true },
          },
        } as unknown as Destination,
        {
          ...destination("longer", 80, 10),
          overnight: {
            travelFit: { eligible: true, band: "strong", oneWayMinutes: 240 },
            capacity: { eligible: true },
          },
        } as unknown as Destination,
      ],
      topMatchIds: ["top-match"],
      recentlyViewedDestinations: [],
      bucketListDisplayedIds: [],
      homeStationCoords: null,
      carMode: "none",
      publicModes: [],
      visitedIds: [],
      seasonalReferenceDate: new Date("2026-08-01T12:00:00"),
    });

    expect(result.overnightGetaways.map(({ id }) => id)).toEqual([
      "weekend-high",
      "longer",
    ]);
    expect(result.seasonal.map(({ id }) => id)).toEqual([]);
    expect(result.longerJourney.map(({ id }) => id)).toEqual([]);
  });

  it("does not use full-catalogue candidates to fill a sparse nearby rail", () => {
    const result = buildHomeDiscoveryRails({
      allDestinations: [],
      recommendedDestinations: [destination("top-match", 100, 10)],
      topMatchIds: ["top-match"],
      recentlyViewedDestinations: [],
      bucketListDisplayedIds: [],
      homeStationCoords: { lat: 35.68, lng: 139.76 },
      carMode: "none",
      publicModes: [],
      visitedIds: [],
      tripDuration: "fullDay",
      seasonalReferenceDate: new Date("2026-08-01T12:00:00"),
    });

    expect(result.nearby.map(({ id }) => id)).toEqual([]);
  });
});
