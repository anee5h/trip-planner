import { describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { getCanonicalTransportCost } from "../../transport/transportCostV2";
import { getTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";
import { runRecommendationPipeline } from "@/shared/services/recommendation/RecommendationPipeline";
import type { RecommendationContext } from "@/shared/services/recommendation/RecommendationContext";
import { getSafeGroundEstimate } from "../../transport/SafeGroundEstimateService";
import type { CarRoundTripRoute } from "../../transport/CarRouteProvider";

const destination = (destinations as Destination[]).find(
  (item) => item.id === "karuizawa-town",
)!;
const route: CarRoundTripRoute = {
  outbound: {
    availability: "available",
    origin: { lat: 35.44, lng: 139.64 },
    destination: {
      id: "karuizawa-old-new-area-parking",
      label: "Old/New Karuizawa parking",
      kind: "official_parking",
      coordinates: { lat: 36.35, lng: 138.59 },
      sourceUrls: ["https://www.openstreetmap.org/way/364599513"],
    },
    provider: "fixture-route-provider",
    direction: "outbound",
    distanceKm: 170,
    durationMinutes: 150,
    toll: { state: "priced", amountJPY: 4500, basis: "ETC" },
    confidence: "verified",
    completeness: "complete",
  },
  returnRoute: {
    availability: "available",
    origin: { lat: 35.44, lng: 139.64 },
    destination: {
      id: "karuizawa-old-new-area-parking",
      label: "Old/New Karuizawa parking",
      kind: "official_parking",
      coordinates: { lat: 36.35, lng: 138.59 },
      sourceUrls: ["https://www.openstreetmap.org/way/364599513"],
    },
    provider: "fixture-route-provider",
    direction: "return",
    distanceKm: 178,
    durationMinutes: 165,
    toll: { state: "priced", amountJPY: 4700, basis: "general" },
    confidence: "verified",
    completeness: "complete",
  },
};

const costOptions = {
  partySize: 2,
  vehicleCapacity: 5,
  fuelEconomyKmPerL: [10, 20] as [number, number],
  fuelPriceJPYPerL: [100, 200] as [number, number],
  parkingCostJPY: [500, 1000] as [number, number],
};

describe("TripEstimateEngine canonical car integration", () => {
  it("uses the same vehicle-scoped route cost in the engine and transport service", () => {
    const canonical = getCanonicalTransportCost(
      destination,
      "my_car",
      2,
      { lat: 35.44, lng: 139.64 },
      undefined,
      route,
      costOptions,
    );
    const result = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 2,
      homeCoords: { lat: 35.44, lng: 139.64 },
      duration: "fullDay",
      carRoute: route,
      carCostOptions: costOptions,
    });
    expect(canonical.cost).toEqual({ kind: "bounded", min: 11440, max: 17160 });
    expect(result.components[0].cost).toEqual(canonical.cost);
    expect(result.journey?.cost).toEqual({
      currency: "JPY",
      representation: canonical.cost,
      state: "known",
      evidence: "estimated",
      scope: "complete",
      completeness: "complete",
      basis: "round_trip",
      variability: "range",
      sourceUrls: ["https://www.openstreetmap.org/way/364599513"],
    });
    expect(result.journey?.legs).toHaveLength(2);
    expect(result.journey?.legs[0].direction).toBe("outbound");
    expect(result.journey?.legs[1].direction).toBe("return");
    expect(result.journey?.legs.every((leg) => leg.mode === "my_car")).toBe(
      true,
    );
  });

  it("uses canonical party size and rejects rental/personal option mismatches", () => {
    const canonical = getCanonicalTransportCost(
      destination,
      "my_car",
      2,
      { lat: 35.44, lng: 139.64 },
      undefined,
      route,
      costOptions,
    );
    const mismatchedParty = getCanonicalTransportCost(
      destination,
      "my_car",
      2,
      { lat: 35.44, lng: 139.64 },
      undefined,
      route,
      { ...costOptions, partySize: 99 },
    );
    expect(mismatchedParty.cost).toEqual(canonical.cost);

    const wrongModeOptions = getCanonicalTransportCost(
      destination,
      "car",
      2,
      { lat: 35.44, lng: 139.64 },
      undefined,
      route,
      costOptions,
    );
    expect(wrongModeOptions.cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
  });

  it("does not build a Journey when origin travel is explicitly excluded", () => {
    const result = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 2,
      homeCoords: { lat: 35.44, lng: 139.64 },
      duration: "fullDay",
      includeOriginTravel: false,
      carRoute: route,
      carCostOptions: costOptions,
    });
    expect(result.journey).toBeUndefined();
    expect(result.components[0].cost).toEqual({ kind: "not_applicable" });
  });

  it("uses routed duration across duration/Journey consumers", () => {
    const travel = getTravelDurationEvidence(
      destination,
      {
        homeStationCoords: { lat: 35.44, lng: 139.64 },
        carRoute: route,
      },
      ["my_car"],
    );
    expect(travel.evidence).toBe("verified");
    expect(travel.estimate?.timeRange).toEqual([150, 150]);
    expect(travel.journey?.legs).toHaveLength(2);
    expect(travel.journey?.legs[0].duration.minutes).toEqual([150, 150]);
    expect(travel.journey?.legs[1].duration.minutes).toEqual([165, 165]);
  });

  it("propagates identical car route semantics through recommendations", () => {
    const context: RecommendationContext = {
      budget: 1_000_000,
      budgetTier: "standard",
      carMode: "my_car",
      publicModes: [],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: { lat: 35.44, lng: 139.64 },
      originZoneId: "mainland-honshu",
      tripDuration: "fullDay",
      carRoute: route,
      carCostOptions: costOptions,
    };
    const results = runRecommendationPipeline([destination], context);
    expect(results).toHaveLength(1);
    expect(results[0].bestTransportMode).toBe("my_car");
    expect(results[0].transportEstimate?.timeRange).toEqual([150, 150]);
    const engine = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 2,
      homeCoords: { lat: 35.44, lng: 139.64 },
      duration: "fullDay",
      budgetTier: "standard",
      carRoute: route,
      carCostOptions: costOptions,
    });
    expect(results[0].estimatedCostRange).toEqual(
      engine.total ? [engine.total.min, engine.total.max] : undefined,
    );
    expect(results[0].estimatedCostTransportIncluded).toBe(true);
  });

  it("does not fall back to centroid or average-speed car time", () => {
    const travel = getTravelDurationEvidence(
      destination,
      { homeStationCoords: { lat: 35.44, lng: 139.64 } },
      ["car"],
    );
    expect(travel).toEqual({ evidence: "unknown" });
    expect(
      getSafeGroundEstimate(destination, {
        homeStationCoords: { lat: 35.44, lng: 139.64 },
        authorizedModes: ["car"],
      }),
    ).toBeNull();
  });

  it("keeps car budget unavailable when no route provider result exists", () => {
    const result = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 2,
      homeCoords: { lat: 35.44, lng: 139.64 },
      duration: "fullDay",
    });
    expect(result.components[0].cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
    expect(result.total).toBeUndefined();
  });
});
