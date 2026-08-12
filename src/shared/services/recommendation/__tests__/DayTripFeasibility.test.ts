import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import {
  getEstimatedBudgetRange,
  getTransportCost,
} from "@/shared/services/budget/BudgetService";
import {
  getDayTripTravelDurationEvidence,
  estimateDayTripDuration,
} from "../TripDurationService";
import {
  getRecommendations,
  getValidModes,
  scoreForCatalog,
} from "../RecommendationService";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import { getSafeGroundEstimate } from "@/shared/services/transport/SafeGroundEstimateService";
import { getDistance } from "@/shared/utils/distance";

const catalog = getDestinationList("en") as Destination[];
const NAKAYAMA = { lat: 35.514745, lng: 139.539692 };
const SHIN_YOKOHAMA = { lat: 35.5073, lng: 139.6172 };
const SHIBUYA_CURRENT_LOCATION = { lat: 35.6595, lng: 139.7005 };
const CHIBA = { lat: 35.6131, lng: 140.1133 };
const SAPPORO = { lat: 43.0687, lng: 141.3508 };
const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const TAKAMATSU = { lat: 34.3519, lng: 134.0467 };
const ALL_PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const DISTANT_IDS = new Set([
  "aomori-city",
  "yamagata-city",
  "akita-city",
  "kyoto-city",
]);

function contextFor(
  coordinates: { lat: number; lng: number },
  tripDuration: "shortOuting" | "halfDay",
) {
  return {
    budget: 40000,
    budgetTier: "standard" as const,
    carMode: "none",
    publicModes: ALL_PUBLIC_MODES,
    partySize: 2,
    visitedIds: [],
    homeStationCoords: coordinates,
    originZoneId: resolveOriginTransportZone({ coordinates }),
    tripDuration,
    tripMode: "day_trip" as const,
  };
}

function evidenceFor(
  result: Destination,
  context: ReturnType<typeof contextFor>,
) {
  const modes = getValidModes(
    result,
    context.carMode,
    context.publicModes,
    context.homeStationCoords,
    context.budgetTier,
    context.originZoneId,
  );
  return getDayTripTravelDurationEvidence(result, context, modes);
}

type RecommendationResult = ReturnType<typeof getRecommendations>[number];

function hasCanonicalIntercityEvidence(result: RecommendationResult): boolean {
  const estimate = result.transportEstimate;
  return Boolean(
    estimate &&
    (estimate.evidence === "verified" ||
      ("corridorEvidence" in estimate &&
        estimate.corridorEvidence === "verified")),
  );
}

describe("day-trip travel evidence", () => {
  it("propagates bounded catchment evidence while retaining corridor provenance", () => {
    const nara = catalog.find((destination) => destination.id === "nara-city")!;
    const context = contextFor({ lat: 35.6812, lng: 139.7671 }, "halfDay");
    const travel = getDayTripTravelDurationEvidence(nara, context, ["bus"]);

    expect(travel.evidence).toBe("estimated");
    expect(travel.estimate?.evidence).toBe("estimated");
    expect("corridorEvidence" in (travel.estimate ?? {})).toBe(true);
    const corridorEvidence =
      travel.estimate && "corridorEvidence" in travel.estimate
        ? travel.estimate.corridorEvidence
        : undefined;
    expect(corridorEvidence).toBe("verified");
  });

  it("does not recommend unknown travel for Nakayama Day Trip + Any", () => {
    const source = catalog.find(
      (destination) => destination.id === "yokohama-city",
    )!;
    const unknownTravelCandidate = {
      ...source,
      id: "unknown-travel-day-trip-any",
      coordinates: undefined,
      recommendedVisitHours: { min: 1, max: 2 },
      transportOptions: { train: 30 },
    } as Destination;

    const results = getRecommendations([unknownTravelCandidate], {
      ...contextFor(NAKAYAMA, "halfDay"),
      tripDuration: "any",
    });

    expect(results).toHaveLength(0);
  });

  it("uses the selected transport controls for eligibility and Recommended ordering", () => {
    const allPublic = {
      ...contextFor(NAKAYAMA, "halfDay"),
      tripDuration: "any" as const,
      publicModes: ALL_PUBLIC_MODES,
    };
    const trainOnly = { ...allPublic, publicModes: ["train"] };
    const trainAndShinkansen = {
      ...allPublic,
      publicModes: ["train", "shinkansen"],
    };
    const shinkansenOnly = {
      ...catalog.find((destination) => destination.id === "akita-city")!,
      // Clear legacy metadata: only the canonical tokyo↔akita shinkansen
      // corridor may authorize this destination from the Nakayama origin.
      transportOptions: {},
    } as Destination;
    const tokyoStation = catalog.find(
      (destination) => destination.id === "tokyo-station-chiyoda",
    )!;
    const odawara = catalog.find(
      (destination) => destination.id === "odawara-city",
    )!;
    const harryPotter = catalog.find(
      (destination) => destination.id === "harry-potter-studio",
    )!;

    expect(
      getValidModes(
        shinkansenOnly,
        "none",
        allPublic.publicModes,
        NAKAYAMA,
        "standard",
        allPublic.originZoneId,
      ),
    ).toEqual(["shinkansen"]);
    expect(
      getValidModes(
        shinkansenOnly,
        "none",
        trainOnly.publicModes,
        NAKAYAMA,
        "standard",
        trainOnly.originZoneId,
      ),
    ).toEqual([]);
    expect(
      getValidModes(
        tokyoStation,
        "none",
        [],
        NAKAYAMA,
        "standard",
        allPublic.originZoneId,
      ),
    ).toEqual([]);
    expect(
      getValidModes(
        tokyoStation,
        "rental",
        [],
        NAKAYAMA,
        "standard",
        allPublic.originZoneId,
      ),
    ).toContain("car");

    // Odawara is ~54 km from the origin and has no canonical Shinkansen
    // arrival (no hub within the 30 km arrival catchment), so enabling more
    // modes must not fabricate a faster journey for it. Harry Potter (Tokyo)
    // is closer and stays the higher-scoring candidate in both selections.
    expect(scoreForCatalog(odawara, allPublic)).toBeLessThan(
      scoreForCatalog(harryPotter, allPublic),
    );
    expect(scoreForCatalog(odawara, trainAndShinkansen)).toBeLessThan(
      scoreForCatalog(harryPotter, trainAndShinkansen),
    );
    expect(scoreForCatalog(odawara, trainOnly)).toBeLessThan(
      scoreForCatalog(harryPotter, trainOnly),
    );
  });

  it.each([
    ["Nakayama", NAKAYAMA],
    ["Shin-Yokohama", SHIN_YOKOHAMA],
    ["Shibuya current location", SHIBUYA_CURRENT_LOCATION],
  ])(
    "keeps %s short-outing results populated with bounded local travel",
    (_label, origin) => {
      const context = contextFor(origin, "shortOuting");
      const results = getRecommendations(catalog, context);

      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some(
          (result) => result.transportEstimate?.evidence === "estimated",
        ),
      ).toBe(true);
      expect(
        results.slice(0, 10).every((result) => {
          if (!result.coordinates) return false;
          return (
            getDistance(
              origin.lat,
              origin.lng,
              result.coordinates.lat,
              result.coordinates.lng,
            ) <= 120
          );
        }),
      ).toBe(true);
      expect(
        results.every(
          (result) => evidenceFor(result, context).evidence !== "unknown",
        ),
      ).toBe(true);
    },
  );

  it("keeps Chiba short- and half-day results populated without distant leakage", () => {
    for (const tripDuration of ["shortOuting", "halfDay"] as const) {
      const context = contextFor(CHIBA, tripDuration);
      const results = getRecommendations(catalog, context);

      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some(
          (result) => result.transportEstimate?.evidence === "verified",
        ),
      ).toBe(true);
      expect(results.every((result) => !DISTANT_IDS.has(result.id))).toBe(true);
      expect(
        results.every(
          (result) => evidenceFor(result, context).evidence !== "unknown",
        ),
      ).toBe(true);
    }
  });

  it.each([
    ["Sapporo", SAPPORO],
    ["Fukuoka", FUKUOKA],
  ])(
    "keeps %s short-outing recommendations populated with local or verified intercity travel",
    (_label, origin) => {
      const context = contextFor(origin, "shortOuting");
      const results = getRecommendations(catalog, context);

      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some(
          (result) => result.transportEstimate?.evidence === "estimated",
        ),
      ).toBe(true);
      expect(
        results.slice(0, 10).every((result) => {
          if (!result.coordinates) return false;
          const local =
            resolveDestinationTransportZone(result) === context.originZoneId &&
            getDistance(
              origin.lat,
              origin.lng,
              result.coordinates.lat,
              result.coordinates.lng,
            ) <= 120;
          return local || hasCanonicalIntercityEvidence(result);
        }),
      ).toBe(true);
      expect(
        results.every(
          (result) => evidenceFor(result, context).evidence !== "unknown",
        ),
      ).toBe(true);
    },
  );

  it("keeps Takamatsu half-day recommendations populated with same-zone local travel", () => {
    const context = {
      ...contextFor(TAKAMATSU, "halfDay"),
      publicModes: ["train", "bus"],
    };
    const results = getRecommendations(catalog, context);

    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some(
        (result) => result.transportEstimate?.evidence === "estimated",
      ),
    ).toBe(true);
    expect(
      results.slice(0, 10).every((result) => {
        if (!result.coordinates) return false;
        return (
          (resolveDestinationTransportZone(result) === "mainland-shikoku" &&
            getDistance(
              TAKAMATSU.lat,
              TAKAMATSU.lng,
              result.coordinates.lat,
              result.coordinates.lng,
            ) <= 120) ||
          hasCanonicalIntercityEvidence(result)
        );
      }),
    ).toBe(true);
    expect(
      results.every(
        (result) => evidenceFor(result, context).evidence !== "unknown",
      ),
    ).toBe(true);
  });

  it("keeps Takamatsu's nearby catalogue entries eligible for bounded local ground evidence", () => {
    const context = contextFor(TAKAMATSU, "halfDay");
    const nearbySameZone = catalog.filter((result) => {
      if (!result.coordinates) return false;
      return (
        resolveDestinationTransportZone(result) === context.originZoneId &&
        getDistance(
          TAKAMATSU.lat,
          TAKAMATSU.lng,
          result.coordinates.lat,
          result.coordinates.lng,
        ) <= 120
      );
    });

    // KAI-31: Takamatsu's Shikoku cluster was expanded with source-backed
    // POIs (gardens, castle, art museum, Naruto/Tokushima/Kochi/Marugame/
    // Miyoshi entries) inside the same mainland-shikoku zone, so the
    // bounded set grew from 9 to 35. The point of this test is the
    // evidence state, not the exact inventory; keep it deterministic.
    expect(nearbySameZone).toHaveLength(36);
    expect(
      nearbySameZone.every(
        (result) =>
          evidenceFor(result, context).evidence === "estimated" &&
          resolveDestinationTransportZone(result) === "mainland-shikoku",
      ),
    ).toBe(true);
  });

  it("keeps conservative padding on estimated day-trip feasibility", () => {
    const local = {
      ...catalog.find((destination) => destination.id === "yokohama-city")!,
      id: "synthetic-local-yokohama",
      recommendedVisitHours: { min: 1, max: 2 },
      transportOptions: { train: 30 },
    } as Destination;
    const context = {
      homeStationCoords: NAKAYAMA,
      originZoneId: "mainland-honshu" as const,
      availableTimeHours: 4,
    };
    const travel = getDayTripTravelDurationEvidence(local, context, ["train"]);
    const estimate = estimateDayTripDuration(local, context, ["train"]);

    expect(travel.evidence).toBe("estimated");
    expect(estimate?.travelEvidence).toBe("estimated");
    expect(estimate?.feasibilityTravelMinutes).toBe(
      travel.estimate!.timeRange[1] + 30,
    );
  });

  it("never estimates train or car feasibility for an island, even with nearby coordinates", () => {
    const source = catalog.find(
      (destination) => destination.id === "ogasawara-islands-tokyo",
    )!;
    const islandWithMisleadingCoordinates = {
      ...source,
      coordinates: NAKAYAMA,
      transportZoneId: "ogasawara" as const,
      kind: "island" as const,
      transportOptions: { train: 45, car: 60 },
    } as Destination;

    const evidence = getDayTripTravelDurationEvidence(
      islandWithMisleadingCoordinates,
      { homeStationCoords: NAKAYAMA, originZoneId: "mainland-honshu" },
      ["train", "car"],
    );
    const directEstimate = getSafeGroundEstimate(
      islandWithMisleadingCoordinates,
      {
        homeStationCoords: NAKAYAMA,
        homeStationTransportZoneId: "mainland-honshu",
        authorizedModes: ["train", "car"],
      },
    );

    expect(evidence.evidence).toBe("unknown");
    expect(evidence.estimate).toBeUndefined();
    expect(directEstimate).toBeNull();
  });

  it("keeps real Ogasawara travel unknown instead of using same-distance ground estimation", () => {
    const ogasawara = catalog.find(
      (destination) => destination.id === "ogasawara-islands-tokyo",
    )!;
    const context = {
      homeStationCoords: NAKAYAMA,
      originZoneId: resolveOriginTransportZone({ coordinates: NAKAYAMA }),
    };
    const evidence = getDayTripTravelDurationEvidence(ogasawara, context, [
      "train",
      "car",
    ]);

    expect(evidence.evidence).toBe("unknown");
    expect(evidence.estimate).toBeUndefined();
    expect(
      getSafeGroundEstimate(ogasawara, {
        homeStationCoords: NAKAYAMA,
        homeStationTransportZoneId: context.originZoneId,
        authorizedModes: ["train", "car"],
      }),
    ).toBeNull();
  });

  it("does not estimate across major land zones from misleading nearby coordinates", () => {
    const crossZone = {
      ...catalog.find((destination) => destination.id === "yokohama-city")!,
      coordinates: SAPPORO,
      transportZoneId: "mainland-honshu" as const,
      transportOptions: { train: 30, car: 40 },
    } as Destination;
    const context = {
      homeStationCoords: SAPPORO,
      originZoneId: "hokkaido" as const,
    };

    const evidence = getDayTripTravelDurationEvidence(crossZone, context, [
      "train",
      "car",
    ]);

    expect(evidence.evidence).toBe("unknown");
    expect(evidence.estimate).toBeUndefined();
    expect(
      getSafeGroundEstimate(crossZone, {
        homeStationCoords: SAPPORO,
        homeStationTransportZoneId: "hokkaido",
        authorizedModes: ["train", "car"],
      }),
    ).toBeNull();
  });

  it("never uses estimated travel for fares or budget calculations", () => {
    const local = {
      ...catalog.find((destination) => destination.id === "yokohama-city")!,
      id: "synthetic-budget-local-yokohama",
      recommendedVisitHours: { min: 1, max: 2 },
      transportOptions: { train: 30 },
      transportFares: undefined,
    } as Destination;
    const evidence = getDayTripTravelDurationEvidence(
      local,
      { homeStationCoords: NAKAYAMA, originZoneId: "mainland-honshu" },
      ["train"],
    );
    const budget = getEstimatedBudgetRange(
      local,
      "train",
      2,
      "standard",
      NAKAYAMA,
    );

    expect(evidence.evidence).toBe("estimated");
    expect(getTransportCost(local, "train", 2, NAKAYAMA)).toBeNull();
    expect(budget.transportIncluded).toBe(false);
    expect(budget.durationIncluded).toBe(false);
    expect(budget.range).toBeNull();
  });
});

describe("KAI-66 night-only bus day-trip gate", () => {
  const TOKYO_ORIGIN = { lat: 35.6812, lng: 139.7671 };

  it("night-only corridors cannot make a same-day day trip feasible", () => {
    // はかた号 (night) is Tokyo→Fukuoka's only registered bus corridor. The
    // duration-only model would call a 14h round trip "feasible"; the night
    // gate must keep it out of day-trip planning.
    const fukuoka = catalog.find(
      (destination) => destination.id === "canal-city-hakata",
    )!;
    const dayTrip = estimateDayTripDuration(
      fukuoka,
      {
        homeStationCoords: TOKYO_ORIGIN,
        originZoneId: "mainland-honshu",
        availableTimeHours: 14,
      },
      ["bus"],
    );
    expect(dayTrip).toBeNull();
  });

  it("night-only corridor still has a canonical estimate for generic browsing", () => {
    const fukuoka = catalog.find(
      (destination) => destination.id === "canal-city-hakata",
    )!;
    const evidence = getDayTripTravelDurationEvidence(
      fukuoka,
      { homeStationCoords: TOKYO_ORIGIN, originZoneId: "mainland-honshu" },
      ["bus"],
    );
    // The corridor exists (generic browsing and weekend one-way evaluation
    // may still use it) — only same-day feasibility is gated.
    expect(evidence.evidence).not.toBe("unknown");
    expect(evidence.estimate?.mode).toBe("bus");
    expect(
      evidence.estimate && "servicePeriod" in evidence.estimate
        ? evidence.estimate.servicePeriod
        : undefined,
    ).toBe("night");
  });

  it("day-split Sendai corridor keeps its day service day-trip eligible", () => {
    const sendai = catalog.find(
      (destination) => destination.id === "sendai-city",
    )!;
    const dayTrip = estimateDayTripDuration(
      sendai,
      {
        homeStationCoords: TOKYO_ORIGIN,
        originZoneId: "mainland-honshu",
        availableTimeHours: 14,
      },
      ["bus"],
    );
    // The day product (330–342 min) is selected and the night gate must not
    // have suppressed the corridor. (Sendai City's ~3h visit still makes the
    // full-day envelope tight — feasibility is visit-limited, not bus-gated.)
    expect(dayTrip).not.toBeNull();
    expect(dayTrip!.travelEstimate?.timeRange).toEqual([330, 342]);
    expect(dayTrip!.travelEvidence).toBe("verified");
  });
});
