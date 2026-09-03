import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type {
  AsyncCarRouteProvider,
  CarRouteRequest,
  CarRouteResult,
  CarRoundTripRoute,
} from "@/shared/services/transport/CarRouteProvider";
import {
  acquireCarRoutes,
  CAR_ROUTE_ENRICHMENT_LIMIT,
} from "../carRouteAcquisition";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import {
  DEFAULT_CAR_ASSUMPTION_PROVENANCE,
  DEFAULT_FUEL_ECONOMY_KM_PER_L,
  DEFAULT_FUEL_PRICE_JPY_PER_L,
} from "@/shared/services/transport/carCostV2";
import type { RecommendationContext } from "../RecommendationContext";

const catalogue = destinationsIndex as unknown as Destination[];
const tokyoHome = { lat: 35.6812, lng: 139.7671 };
const karuizawa = catalogue.find((d) => d.id === "karuizawa-town")!;
const awaji = catalogue.find((d) => d.id === "awaji-farm-park-england-hill")!;
const chibaShrine = catalogue.find((d) => d.id === "chiba-shrine")!;

let providerCallCount = 0;

function fixtureAsyncProvider(): AsyncCarRouteProvider {
  return {
    async route(request: CarRouteRequest): Promise<CarRouteResult> {
      providerCallCount += 1;
      const anchorEndpoint = request.origin.accessAnchorId
        ? request.origin
        : request.destination.accessAnchorId
          ? request.destination
          : undefined;
      return {
        availability: "available",
        origin: request.origin.coordinates,
        originEndpoint: request.origin,
        destination: request.destination,
        accessAnchor: anchorEndpoint,
        provider: "test-route-provider",
        direction: request.direction,
        retrievedAt: "2026-09-03T00:00:00.000Z",
        distanceKm: request.direction === "outbound" ? 61 : 63,
        durationMinutes: request.direction === "outbound" ? 84 : 90,
        toll: { state: "unknown", basis: "unspecified" },
        confidence: "verified",
        completeness: "complete",
      };
    },
  };
}

function context(
  overrides: Partial<RecommendationContext> = {},
): RecommendationContext {
  return {
    vibe: "any",
    budget: 100000,
    budgetTier: "standard",
    carMode: "my_car",
    publicModes: ["train", "shinkansen", "bus"],
    partySize: 2,
    visitedIds: [],
    homeStationCoords: tokyoHome,
    originZoneId: "mainland-honshu",
    tripDuration: "2d1n",
    ...overrides,
  };
}

function carOptions(partySize: number) {
  return {
    partySize,
    fuelEconomyKmPerL: DEFAULT_FUEL_ECONOMY_KM_PER_L,
    fuelPriceJPYPerL: DEFAULT_FUEL_PRICE_JPY_PER_L,
    parkingCostJPY: [1000, 1500] as [number, number],
    assumptionProvenance: DEFAULT_CAR_ASSUMPTION_PROVENANCE,
  };
}

function roundTripRoute(
  result: CarRouteResult,
  returnResult: CarRouteResult,
): CarRoundTripRoute {
  return { outbound: result, returnRoute: returnResult };
}

describe("KAI-226 runtime route acquisition", () => {
  it("acquires outbound+return routes and feeds the canonical Journey/budget pipeline", async () => {
    providerCallCount = 0;
    const routes = await acquireCarRoutes(
      [karuizawa, awaji],
      {
        carMode: "my_car",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      fixtureAsyncProvider(),
    );

    expect(Object.keys(routes).sort()).toEqual([karuizawa.id, awaji.id].sort());
    expect(providerCallCount).toBe(4); // 2 destinations × outbound + return

    const karuizawaRoute = routes[karuizawa.id];
    expect(karuizawaRoute.outbound.provider).toBe("test-route-provider");
    expect(karuizawaRoute.outbound.direction).toBe("outbound");
    expect(karuizawaRoute.outbound.distanceKm).toBe(61);
    expect(karuizawaRoute.returnRoute.direction).toBe("return");
    expect(karuizawaRoute.returnRoute.distanceKm).toBe(63);
    // Route is scoped to the Karuizawa anchor.
    expect(karuizawaRoute.outbound.accessAnchor?.id).toContain("karuizawa");

    // The pipeline consumes the acquired routes per destination.
    const results = runRecommendationPipeline([karuizawa, awaji], {
      ...context(),
      carRoutes: routes,
      carCostOptions: carOptions(2),
    });
    expect(results.map((r) => r.id)).toContain(karuizawa.id);

    // Canonical engine: provider-backed duration + bounded known subtotal
    // (fuel + parking survive; toll unknown keeps total incomplete).
    const engine = calculateTripEstimate({
      dest: karuizawa,
      mode: "my_car",
      partySize: 2,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: karuizawaRoute,
      carCostOptions: carOptions(2),
    });
    expect(engine.journey).toBeDefined();
    expect(engine.journey!.legs[0].duration.minutes).toEqual([84, 84]);
    expect(engine.journey!.legs[1].duration.minutes).toEqual([90, 90]);
    expect(engine.journey!.legs[0].routeMetadata?.routeDistanceKm).toBe(61);
    const origin = engine.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    expect(origin?.knownCost).toBeDefined();
    expect(
      engine.missingComponents.some((m) => m.scope === "origin_travel"),
    ).toBe(true);
  });

  it("never leaks destination A's route into destination B", async () => {
    providerCallCount = 0;
    const routes = await acquireCarRoutes(
      [karuizawa],
      {
        carMode: "my_car",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      fixtureAsyncProvider(),
    );
    expect(Object.keys(routes)).toEqual([karuizawa.id]);

    // B has no route of its own; A's route must be rejected for B even when
    // the map is present (guard matches destination + anchor scope).
    const engineB = calculateTripEstimate({
      dest: chibaShrine,
      mode: "my_car",
      partySize: 2,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: routes[karuizawa.id],
      carCostOptions: carOptions(2),
    });
    expect(engineB.journey).toBeUndefined();
    const originB = engineB.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    expect(originB?.cost.kind).toBe("unavailable");
    expect(originB?.knownCost).toBeUndefined();
  });

  it("does not double vehicle costs for two travellers in one car", async () => {
    const routes = await acquireCarRoutes(
      [karuizawa],
      {
        carMode: "my_car",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      fixtureAsyncProvider(),
    );
    const route = routes[karuizawa.id];

    const one = calculateTripEstimate({
      dest: karuizawa,
      mode: "my_car",
      partySize: 1,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: route,
      carCostOptions: carOptions(1),
    });
    const two = calculateTripEstimate({
      dest: karuizawa,
      mode: "my_car",
      partySize: 2,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: route,
      carCostOptions: carOptions(2),
    });
    const originOne = one.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    const originTwo = two.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    expect(originOne?.knownCost).toEqual(originTwo?.knownCost);

    // 11 travellers → 3 vehicles → known subtotal scales with vehicles only.
    const eleven = calculateTripEstimate({
      dest: karuizawa,
      mode: "my_car",
      partySize: 11,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: route,
      carCostOptions: carOptions(11),
    });
    const originEleven = eleven.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    expect(originEleven!.knownCost!.min).toBeGreaterThan(
      originTwo!.knownCost!.min * 2,
    );
  });

  it("fails closed when the provider is unavailable and keeps non-car modes usable", async () => {
    const unavailableProvider: AsyncCarRouteProvider = {
      async route(request: CarRouteRequest): Promise<CarRouteResult> {
        return {
          availability: "error",
          origin: request.origin.coordinates,
          originEndpoint: request.origin,
          destination: request.destination,
          accessAnchor: request.destination.accessAnchorId
            ? request.destination
            : request.origin,
          provider: "car-route-api",
          direction: request.direction,
          toll: { state: "unknown", basis: "unspecified" },
          confidence: "unknown",
          completeness: "unknown",
          errorCode: "provider_not_configured",
        };
      },
    };
    const routes = await acquireCarRoutes(
      [karuizawa],
      {
        carMode: "my_car",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      unavailableProvider,
    );
    expect(routes[karuizawa.id].outbound.errorCode).toBe(
      "provider_not_configured",
    );

    // Car canonical facts stay unknown, but the shinkansen corridor output is
    // untouched: the destination remains recommended through non-car modes.
    const results = runRecommendationPipeline([karuizawa], {
      ...context(),
      carRoutes: routes,
    });
    expect(results.map((r) => r.id)).toContain(karuizawa.id);
    const engine = calculateTripEstimate({
      dest: karuizawa,
      mode: "my_car",
      partySize: 2,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: routes[karuizawa.id],
      carCostOptions: carOptions(2),
    });
    // The unavailable pair still builds a canonical journey, but every fact
    // is explicitly degraded: no duration, no distance evidence.
    expect(engine.journey).toBeDefined();
    expect(engine.journey?.availability).toBe("unknown");
    expect(engine.journey?.legs[0].duration.minutes).toBeUndefined();
    expect(
      engine.journey?.legs[0].routeMetadata?.routeDistanceKm,
    ).toBeUndefined();
    const origin = engine.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    expect(origin?.knownCost).toBeUndefined();
  });

  it("never acquires routes for explicitly restricted destinations", async () => {
    const restricted = {
      ...karuizawa,
      id: "restricted-fixture",
      carAccess: {
        state: "restricted",
        eligibility: "restricted",
        anchors: [],
        evidence: "official",
        sourceUrls: [],
        reason: "Private-car access prohibited.",
      },
      transportOptions: { car: 40 },
    } as Destination;

    const routes = await acquireCarRoutes(
      [restricted],
      {
        carMode: "my_car",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      fixtureAsyncProvider(),
    );
    // A route provider could geometrically reach the coordinates, but the
    // explicit restriction must never be overridden.
    expect(routes[restricted.id]).toBeUndefined();
    const modes =
      await import("@/shared/services/recommendation/RecommendationScorer");
    expect(
      modes.getValidModes(restricted, "my_car", [], tokyoHome),
    ).not.toContain("my_car");
  });

  it("bounds route acquisition to the configured shortlist", async () => {
    providerCallCount = 0;
    const lotsOfDestinations = catalogue.slice(0, 400);
    await acquireCarRoutes(
      lotsOfDestinations,
      {
        carMode: "rental",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      fixtureAsyncProvider(),
    );
    expect(CAR_ROUTE_ENRICHMENT_LIMIT).toBe(5);
    expect(providerCallCount).toBeLessThanOrEqual(
      CAR_ROUTE_ENRICHMENT_LIMIT * 2,
    );
  });

  it("keeps recommendation surfaces on the same canonical car facts", async () => {
    const routes = await acquireCarRoutes(
      [karuizawa],
      {
        carMode: "my_car",
        publicModes: [],
        homeStationCoords: tokyoHome,
        originZoneId: "mainland-honshu",
      },
      fixtureAsyncProvider(),
    );
    const results = runRecommendationPipeline([karuizawa, chibaShrine], {
      ...context(),
      publicModes: [],
      carRoutes: routes,
      carCostOptions: carOptions(2),
    });
    const karuizawaResult = results.find((r) => r.id === karuizawa.id);
    expect(karuizawaResult).toBeDefined();

    // With only the car mode selected, the card's transport estimate MUST
    // come from the canonical route evidence — never recomputed Haversine.
    const estimate = karuizawaResult!.transportEstimate;
    expect(estimate?.mode).toBe("my_car");
    expect(estimate?.evidence).toBe("verified");
    expect(estimate?.timeRange).toEqual([84, 84]);
    // No surface recomputes car values from Haversine: the route provider
    // minutes are the single canonical source. Destination B without a route
    // stays route-less even on the same pipeline run.
    const chibaEngine = calculateTripEstimate({
      dest: chibaShrine,
      mode: "my_car",
      partySize: 2,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carCostOptions: carOptions(2),
    });
    expect(chibaEngine.journey).toBeUndefined();
  });

  it("car route provider results never leak across destinations in the round trip", () => {
    // Direct boundary check: a route pair built for A is rejected for B with
    // a different anchor even when force-fed through the single-route form.
    const route = roundTripRoute(
      {
        availability: "available",
        origin: tokyoHome,
        originEndpoint: {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: tokyoHome,
        },
        destination: {
          id: "karuizawa-old-new-area-parking",
          label: "Karuizawa parking",
          kind: "official_parking",
          accessAnchorId: "karuizawa-old-new-area-parking",
          coordinates: { lat: 36.357333, lng: 138.633287 },
        },
        accessAnchor: {
          id: "karuizawa-old-new-area-parking",
          label: "Karuizawa parking",
          kind: "official_parking",
          accessAnchorId: "karuizawa-old-new-area-parking",
          coordinates: { lat: 36.357333, lng: 138.633287 },
        },
        provider: "test-route-provider",
        direction: "outbound",
        retrievedAt: "2026-09-03T00:00:00.000Z",
        distanceKm: 61,
        durationMinutes: 84,
        toll: { state: "unknown", basis: "unspecified" },
        confidence: "verified",
        completeness: "complete",
      },
      {
        availability: "available",
        origin: { lat: 36.357333, lng: 138.633287 },
        originEndpoint: {
          id: "karuizawa-old-new-area-parking",
          label: "Karuizawa parking",
          kind: "official_parking",
          accessAnchorId: "karuizawa-old-new-area-parking",
          coordinates: { lat: 36.357333, lng: 138.633287 },
        },
        destination: {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: tokyoHome,
        },
        accessAnchor: {
          id: "karuizawa-old-new-area-parking",
          label: "Karuizawa parking",
          kind: "official_parking",
          accessAnchorId: "karuizawa-old-new-area-parking",
          coordinates: { lat: 36.357333, lng: 138.633287 },
        },
        provider: "test-route-provider",
        direction: "return",
        retrievedAt: "2026-09-03T00:00:00.000Z",
        distanceKm: 63,
        durationMinutes: 90,
        toll: { state: "unknown", basis: "unspecified" },
        confidence: "verified",
        completeness: "complete",
      },
    );
    const awajiEngine = calculateTripEstimate({
      dest: awaji,
      mode: "my_car",
      partySize: 2,
      homeCoords: tokyoHome,
      duration: "2d1n",
      includeOriginTravel: true,
      carRoute: route,
      carCostOptions: carOptions(2),
    });
    expect(awajiEngine.journey).toBeUndefined();
  });
});
