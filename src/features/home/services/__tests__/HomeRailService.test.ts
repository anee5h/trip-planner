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
}));

vi.mock("@/shared/services/transport/SafeGroundEstimateService", () => ({
  getSafeGroundEstimate: safeEstimate,
}));

vi.mock("@/shared/services/recommendation/RecommendationScorer", () => ({
  getValidModes: vi.fn(() => ["train"]),
}));

import {
  DAY_TRIP_RAILS,
  WEEKEND_RAILS,
  getHomepageRailConfig,
  getSeasonalDiscoveryDestinations,
  getUnder60Destinations,
  getUnexploredNearbyDestinations,
  getWeekendGetawayDestinations,
  getWorthLongerJourneyDestinations,
  orderRecentlyViewedDestinations,
  softDeduplicateRail,
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
  tripMode: "day_trip" as const,
  visitedIds: [],
};

describe("homepage rail configuration", () => {
  it("uses one five-rail day-trip hierarchy for half and full day", () => {
    expect(getHomepageRailConfig("day_trip", "halfDay")).toEqual(
      DAY_TRIP_RAILS,
    );
    expect(getHomepageRailConfig("day_trip", "fullDay")).toEqual(
      DAY_TRIP_RAILS,
    );
    expect(DAY_TRIP_RAILS).not.toContain("weekendGetaways");
  });

  it("uses the weekend hierarchy only for 2D1N", () => {
    expect(getHomepageRailConfig("weekend_2d1n", "weekend")).toEqual(
      WEEKEND_RAILS,
    );
    expect(WEEKEND_RAILS).toContain("weekendGetaways");
    expect(WEEKEND_RAILS).not.toContain("under60");
    expect(WEEKEND_RAILS).not.toContain("nearby");
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
        weekend: {
          travelFit: { eligible: true, band: "strong", oneWayMinutes: 180 },
          capacity: { eligible: true },
        } as ScoredDestination["weekend"],
      }),
      destination("long", 9, {
        weekend: {
          travelFit: { eligible: true, band: "weak", oneWayMinutes: 300 },
          capacity: { eligible: true },
        } as ScoredDestination["weekend"],
      }),
      destination("acceptable", 8, {
        weekend: {
          travelFit: { eligible: true, band: "acceptable", oneWayMinutes: 270 },
          capacity: { eligible: true },
        } as ScoredDestination["weekend"],
      }),
      destination("local", 100, {
        weekend: {
          travelFit: { eligible: true, band: "local", oneWayMinutes: 45 },
          capacity: { eligible: true },
        } as ScoredDestination["weekend"],
      }),
      destination("reachOnly", 100),
      destination("notEnough", 100, {
        weekend: {
          travelFit: { eligible: true, band: "acceptable", oneWayMinutes: 200 },
          capacity: { eligible: false },
        } as ScoredDestination["weekend"],
      }),
    ];

    expect(
      getWeekendGetawayDestinations(candidates).map(({ id }) => id),
    ).toEqual(["strong", "acceptable"]);
    expect(
      getWorthLongerJourneyDestinations(candidates).map(({ id }) => id),
    ).toEqual(["long", "acceptable"]);
  });

  it("ranks a stronger 250-minute journey above a weaker 400-minute journey", () => {
    const candidates = [
      destination("farther-but-weaker", 10, {
        weekend: {
          travelFit: { eligible: true, band: "weak", oneWayMinutes: 400 },
          capacity: { eligible: true },
        } as ScoredDestination["weekend"],
      }),
      destination("closer-but-stronger", 90, {
        weekend: {
          travelFit: { eligible: true, band: "acceptable", oneWayMinutes: 250 },
          capacity: { eligible: true },
        } as ScoredDestination["weekend"],
      }),
    ];

    expect(
      getWorthLongerJourneyDestinations(candidates).map(({ id }) => id),
    ).toEqual(["closer-but-stronger", "farther-but-weaker"]);
  });
});

describe("soft homepage deduplication", () => {
  it("deduplicates the full ranked pool before applying the ten-card cap", () => {
    const candidates = Array.from({ length: 20 }, (_, index) =>
      destination(
        index < 10 ? `used-${index}` : `unused-${index - 10}`,
        index < 10 ? 100 : 97,
        {
          season: { spring: 8, summer: 5, autumn: 5, winter: 5 },
          bestMonths: [4],
          weekend: {
            travelFit: {
              eligible: true,
              band: "acceptable",
              oneWayMinutes: 250,
            },
            capacity: { eligible: true },
          } as ScoredDestination["weekend"],
        },
      ),
    );
    const nearbyCandidates = candidates.map((candidate, index) => ({
      ...candidate,
      id: `nearby-${candidate.id}`,
      coordinates: { lat: 35.68 + index * 0.001, lng: 139.76 },
    }));
    type TestRankedDestination = Destination & { score?: number };
    const selectors: Array<
      [() => TestRankedDestination[], TestRankedDestination[]]
    > = [
      [
        () => getSeasonalDiscoveryDestinations(candidates, "2026-04-01"),
        candidates,
      ],
      [() => getUnder60Destinations(candidates, dayContext), candidates],
      [
        () => getUnexploredNearbyDestinations(nearbyCandidates, dayContext),
        nearbyCandidates,
      ],
      [() => getWeekendGetawayDestinations(candidates), candidates],
      [() => getWorthLongerJourneyDestinations(candidates), candidates],
    ];

    selectors.forEach(([select, pool]) => {
      const rankedPool = select();
      const usedIds = new Set(pool.slice(0, 10).map(({ id }) => id));
      const expectedUnusedIds = pool.slice(10).map(({ id }) => id);
      expect(rankedPool).toHaveLength(20);
      const selected = softDeduplicateRail(rankedPool, usedIds);
      expect(selected.map(({ id }) => id)).toEqual(expectedUnusedIds);
      expect(selected).toHaveLength(10);
    });
  });

  it("prefers an equivalent unused candidate but keeps a materially stronger used one", () => {
    const candidates = [destination("used", 100), destination("unused", 99)];
    expect(
      softDeduplicateRail(candidates, new Set(["used"])).map(({ id }) => id),
    ).toEqual(["unused", "used"]);
    expect(
      softDeduplicateRail(
        [destination("used", 100), destination("unused", 80)],
        new Set(["used"]),
      ).map(({ id }) => id),
    ).toEqual(["used", "unused"]);
  });

  it("uses displayed Continue Exploring IDs before seasonal deduplication", () => {
    const continueExploring = orderRecentlyViewedDestinations([
      destination("A", 100),
      destination("B", 99),
      destination("C", 98),
    ]);
    expect(continueExploring.map(({ id }) => id)).toEqual(["A", "B", "C"]);

    const usedIds = new Set(continueExploring.map(({ id }) => id));
    const seasonalPool = [
      destination("A", 100),
      destination("B", 99),
      destination("C", 98),
      destination("D", 98),
      destination("E", 97),
      destination("F", 96),
    ];
    const selected = softDeduplicateRail(seasonalPool, usedIds);

    expect(selected.map(({ id }) => id)).toEqual([
      "D",
      "E",
      "F",
      "A",
      "B",
      "C",
    ]);
    expect(selected).toHaveLength(6);

    const materiallyStronger = softDeduplicateRail(
      [destination("A", 100), destination("D", 80)],
      new Set(["A"]),
    );
    expect(materiallyStronger.map(({ id }) => id)).toEqual(["A", "D"]);
    expect(materiallyStronger).toHaveLength(2);
  });

  it("keeps a nearer used candidate over a farther unused nearby alternative", () => {
    const candidates = [destination("near-used"), destination("far-unused")];

    expect(
      softDeduplicateRail(
        candidates,
        new Set(["near-used"]),
        10,
        (candidate) => (candidate.id === "near-used" ? 0 : -10),
        0,
      ).map(({ id }) => id),
    ).toEqual(["near-used", "far-unused"]);
  });

  it("never returns more than ten cards or pads a short rail", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      destination(`destination-${index}`, 100 - index),
    );
    expect(softDeduplicateRail(candidates, new Set())).toHaveLength(10);
    expect(softDeduplicateRail(candidates.slice(0, 2), new Set())).toHaveLength(
      2,
    );
  });
});
