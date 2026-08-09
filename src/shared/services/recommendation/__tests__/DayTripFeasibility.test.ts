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
import { getRecommendations, getValidModes } from "../RecommendationService";
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

describe("day-trip travel evidence", () => {
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
    "keeps %s short-outing recommendations populated with same-zone local travel",
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
            resolveDestinationTransportZone(result) === context.originZoneId &&
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
          resolveDestinationTransportZone(result) === "mainland-shikoku" &&
          getDistance(
            TAKAMATSU.lat,
            TAKAMATSU.lng,
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

    expect(nearbySameZone).toHaveLength(9);
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
