import { describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";
import enCommon from "@/i18n/resources/en/common.json";
import jaCommon from "@/i18n/resources/ja/common.json";

const { estimate, safeEstimate } = vi.hoisted(() => ({
  estimate: vi.fn((destination: Destination) => {
    const ranges: Record<string, [number, number] | null> = {
      fast: [20, 40],
      medium: [90, 120],
      slow: [61, 80],
      distant: [181, 220],
      "coordinate-near": [90, 100],
      "coordinate-far": [20, 30],
      unknown: null,
      "local-fallback": null,
    };
    const timeRange = Object.hasOwn(ranges, destination.id)
      ? ranges[destination.id]
      : destination.id.startsWith("nearby-")
        ? ([61, 80] as [number, number])
        : [30, 50];
    if (!timeRange) return null;
    return {
      mode: "train" as const,
      timeRange,
      source: "verified_ground_route" as const,
      evidence: "verified" as const,
    };
  }),
  safeEstimate: vi.fn((destination: Destination) => {
    if (destination.id !== "local-fallback") return null;
    return {
      mode: "train" as const,
      timeRange: [10, 20] as [number, number],
      source: "calculated_local_display" as const,
      evidence: "estimated" as const,
    };
  }),
}));

vi.mock("@/shared/services/transport/OriginAwareTransportService", () => ({
  getOriginAwareTransportEstimate: estimate,
  getTravelDecisionSemantics: vi.fn(() => "reliable"),
}));

vi.mock("@/shared/services/transport/SafeGroundEstimateService", () => ({
  getSafeGroundEstimate: safeEstimate,
}));

vi.mock("@/shared/services/recommendation/RecommendationScorer", () => ({
  getValidModes: vi.fn(() => ["train"]),
}));

import {
  DAY_TRIP_RAILS,
  OVERNIGHT_RAILS,
  getHomepageRailConfig,
  getSeasonalDiscoveryDestinations,
  getUnder60Destinations,
  getUnexploredNearbyDestinations,
  getOvernightGetawayDestinations,
  getWorthLongerJourneyDestinations,
} from "../HomeRailService";

function destination(
  id: string,
  score = 0,
  extra: Partial<ScoredDestination> = {},
): ScoredDestination {
  return {
    id,
    name: id,
    score,
    season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
    bestMonths: [],
    bestSeason: "",
    ...extra,
  } as unknown as ScoredDestination;
}

const dayContext = {
  homeStationCoords: { lat: 35.68, lng: 139.76 },
  carMode: "none",
  publicModes: ["train"],
  tripDuration: "fullDay" as const,
  visitedIds: [],
};

describe("homepage rail configuration", () => {
  it("uses one five-rail day-trip hierarchy for half and full day", () => {
    expect(getHomepageRailConfig("halfDay")).toEqual(DAY_TRIP_RAILS);
    expect(getHomepageRailConfig("fullDay")).toEqual(DAY_TRIP_RAILS);
    expect(DAY_TRIP_RAILS).not.toContain("weekendGetaways");
  });

  it("uses the weekend hierarchy only for 2D1N", () => {
    expect(getHomepageRailConfig("2d1n")).toEqual(OVERNIGHT_RAILS);
    expect(OVERNIGHT_RAILS).toContain("overnightGetaways");
    expect(OVERNIGHT_RAILS).not.toContain("under60");
    expect(OVERNIGHT_RAILS).not.toContain("nearby");
  });

  it("keeps seasonal titles and rail navigation labels localized", () => {
    expect(enCommon.home.seasonalTitles).toEqual({
      spring: "Best places to visit this spring",
      summer: "Best places to visit this summer",
      autumn: "Best places to visit this autumn",
      winter: "Best places to visit this winter",
    });
    expect(jaCommon.home.seasonalTitles).toEqual({
      spring: "この春に訪れたい場所",
      summer: "この夏に訪れたい場所",
      autumn: "この秋に訪れたい場所",
      winter: "この冬に訪れたい場所",
    });
    expect(enCommon.home.previousRail).toBeTruthy();
    expect(jaCommon.home.nextRail).toBeTruthy();
  });
});

describe("homepage discovery eligibility", () => {
  it("excludes All-Year-only records without meaningful current-season evidence", () => {
    const results = getSeasonalDiscoveryDestinations(
      [
        destination("all-year-only", 100, {
          season: undefined,
          bestMonths: [],
          bestSeason: "All Year",
        }),
      ],
      "2026-04-01",
    );

    expect(results).toEqual([]);
  });

  it("keeps real current-season evidence and unknown-method exclusions", () => {
    const results = getSeasonalDiscoveryDestinations(
      [
        destination("real-season", 1, {
          season: { spring: 8, summer: 5, autumn: 5, winter: 5 },
          bestMonths: [],
          bestSeason: "All Year",
        }),
        destination("unknown-season", 100, {
          season: { spring: 10, summer: 5, autumn: 5, winter: 5 },
          bestMonths: [3, 4],
          seasonMetadata: { method: "unknown" },
        } as unknown as Partial<ScoredDestination>),
      ],
      "2026-04-01",
    );

    expect(results.map(({ id }) => id)).toEqual(["real-season"]);
  });

  it("accepts explicit current-season metadata without treating All Year as evidence", () => {
    const results = getSeasonalDiscoveryDestinations(
      [
        destination("explicit-season", 0, {
          season: undefined,
          bestMonths: [],
          bestSeason: "All Year",
          bestSeasons: ["Spring"],
        } as unknown as Partial<ScoredDestination>),
      ],
      "2026-04-01",
    );

    expect(results.map(({ id }) => id)).toEqual(["explicit-season"]);
  });

  it("ranks seasonal evidence instead of alphabetical IDs or tag slicing", () => {
    const results = getSeasonalDiscoveryDestinations(
      [
        destination("alpha", 100, {
          season: { spring: 6, summer: 5, autumn: 5, winter: 5 },
        }),
        destination("zeta", 1, {
          season: { spring: 9, summer: 5, autumn: 5, winter: 5 },
          bestMonths: [3, 4],
        }),
      ],
      "2026-04-01",
    );

    expect(results.map(({ id }) => id)).toEqual(["zeta", "alpha"]);
  });

  it("uses canonical origin estimates, rejects unknown/over-limit times, and excludes visited places", () => {
    const candidates = [
      destination("slow", 0, {
        coordinates: { lat: 35.7, lng: 139.8 },
      }),
      destination("fast"),
      destination("unknown"),
      destination("medium", 0, {
        coordinates: { lat: 35.72, lng: 139.82 },
      }),
      destination("distant"),
    ];
    const context = { ...dayContext, visitedIds: ["fast"] };

    expect(
      getUnder60Destinations(candidates, dayContext).map(({ id }) => id),
    ).toEqual(["fast"]);
    expect(
      getUnexploredNearbyDestinations(candidates, context).map(({ id }) => id),
    ).toEqual(["slow", "medium"]);
    expect(estimate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "medium" }),
      expect.objectContaining({
        homeStationCoords: dayContext.homeStationCoords,
      }),
      ["train"],
    );
  });

  it("uses the shared bounded origin estimate for local discovery", () => {
    const candidates = [
      destination("distant"),
      destination("local-fallback", 0, {
        coordinates: { lat: 35.68, lng: 139.76 },
      }),
    ];

    expect(
      getUnder60Destinations(candidates, dayContext).map(({ id }) => id),
    ).toEqual(["local-fallback"]);
    expect(
      getUnexploredNearbyDestinations(candidates, dayContext).map(
        ({ id }) => id,
      ),
    ).toEqual(["local-fallback"]);
    expect(safeEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "local-fallback" }),
      expect.objectContaining({
        homeStationCoords: dayContext.homeStationCoords,
      }),
    );
  });

  it("reuses origin evidence when under-60 and nearby rails inspect one place", () => {
    const candidate = destination("fast", 0, {
      coordinates: { lat: 35.681, lng: 139.761 },
    });
    const estimateCache = new Map();
    estimate.mockClear();

    expect(
      getUnder60Destinations([candidate], { ...dayContext, estimateCache }),
    ).toEqual([candidate]);
    expect(
      getUnexploredNearbyDestinations([candidate], {
        ...dayContext,
        estimateCache,
      }),
    ).toEqual([candidate]);
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  it("orders nearby destinations by origin coordinates, not travel-band order", () => {
    const candidates = [
      destination("coordinate-missing", 100),
      destination("coordinate-far", 100, {
        coordinates: { lat: 35.75, lng: 139.9 },
      }),
      destination("coordinate-near", 1, {
        coordinates: { lat: 35.681, lng: 139.761 },
      }),
    ];

    expect(
      getUnexploredNearbyDestinations(candidates, dayContext).map(
        ({ id }) => id,
      ),
    ).toEqual(["coordinate-near", "coordinate-far"]);
  });

  it("requires weekend fit and destination capacity, then separates longer journeys", () => {
    const candidates = [
      destination("strong", 10, {
        overnight: {
          travelFit: { eligible: true, band: "strong", oneWayMinutes: 180 },
          capacity: { eligible: true },
        } as ScoredDestination["overnight"],
      }),
      destination("long", 9, {
        overnight: {
          travelFit: { eligible: true, band: "weak", oneWayMinutes: 300 },
          capacity: { eligible: true },
        } as ScoredDestination["overnight"],
      }),
      destination("acceptable", 8, {
        overnight: {
          travelFit: { eligible: true, band: "acceptable", oneWayMinutes: 270 },
          capacity: { eligible: true },
        } as ScoredDestination["overnight"],
      }),
      destination("local", 100, {
        overnight: {
          travelFit: { eligible: true, band: "local", oneWayMinutes: 45 },
          capacity: { eligible: true },
        } as ScoredDestination["overnight"],
      }),
      destination("reachOnly", 100),
      destination("notEnough", 100, {
        overnight: {
          travelFit: { eligible: true, band: "acceptable", oneWayMinutes: 200 },
          capacity: { eligible: false },
        } as ScoredDestination["overnight"],
      }),
    ];

    expect(
      getOvernightGetawayDestinations(candidates).map(({ id }) => id),
    ).toEqual(["strong", "acceptable"]);
    expect(
      getWorthLongerJourneyDestinations(candidates).map(({ id }) => id),
    ).toEqual(["long", "acceptable"]);
  });

  it("ranks a stronger 250-minute journey above a weaker 400-minute journey", () => {
    const candidates = [
      destination("farther-but-weaker", 10, {
        overnight: {
          travelFit: { eligible: true, band: "weak", oneWayMinutes: 400 },
          capacity: { eligible: true },
        } as ScoredDestination["overnight"],
      }),
      destination("closer-but-stronger", 90, {
        overnight: {
          travelFit: { eligible: true, band: "acceptable", oneWayMinutes: 250 },
          capacity: { eligible: true },
        } as ScoredDestination["overnight"],
      }),
    ];

    expect(
      getWorthLongerJourneyDestinations(candidates).map(({ id }) => id),
    ).toEqual(["closer-but-stronger", "farther-but-weaker"]);
  });
});
