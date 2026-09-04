import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { runRecommendationPipeline } from "@/shared/services/recommendation/RecommendationPipeline";
import type { RecommendationContext } from "@/shared/services/recommendation/RecommendationContext";
import {
  DEFAULT_CAR_ASSUMPTION_PROVENANCE,
  DEFAULT_FUEL_ECONOMY_KM_PER_L,
  DEFAULT_FUEL_PRICE_JPY_PER_L,
} from "@/shared/services/transport/carCostV2";
import { getRoutableCarAccessAnchors } from "../CarAccessService";
import type {
  CarRouteEndpoint,
  CarRouteResult,
  CarRoundTripRoute,
} from "../CarRouteProvider";
import {
  getCarOutageFallbackEstimate,
  CAR_ROUTE_OUTAGE_FALLBACK_SOURCE,
  resetCarRouteFallbackCounters,
  snapshotCarRouteFallbackCounters,
} from "../carRouteOutageFallback";

const all = destinationsIndex as unknown as Destination[];
const byId = new Map(all.map((d) => [d.id, d]));
const yomiuriland = byId.get("yomiuriland")!;
const karuizawa = byId.get("karuizawa-town")!;
const tokyoStation = byId.get("tokyo-station-chiyoda")!;
const kamakura = byId.get("kamakura-city")!; // promoted by the safe first wave; used by earlier fixtures
void kamakura;
const ginzanOnsen = byId.get("ginzan-onsen-yamagata")!;

const HOME = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station
const HOME_ZONE = "mainland-honshu" as const;

function bareErrorRoute(errorCode: string): CarRouteResult {
  return {
    availability: "error",
    origin: HOME,
    provider: "test-provider",
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode,
  } as CarRouteResult;
}

/** Well-formed pair shaped like the real HTTP boundary output: the error
 * result still carries the requested anchor/route endpoints, so the shared
 * per-destination guard accepts it (helping classification) while the
 * canonical availability stays error/no_route. */
function identityPair(
  destination: Destination,
  availability: "error" | "no_route",
  errorCode: string,
): CarRoundTripRoute {
  const anchor = getRoutableCarAccessAnchors(destination)[0]!;
  const anchorEndpoint: CarRouteEndpoint = {
    id: anchor.id,
    label: anchor.label,
    kind: anchor.kind,
    coordinates: anchor.coordinates!,
    ...(anchor.sourceUrls ? { sourceUrls: anchor.sourceUrls } : {}),
  };
  const originEndpoint: CarRouteEndpoint = {
    id: "origin",
    label: "Trip origin",
    kind: "origin",
    coordinates: HOME,
  };
  const base = {
    origin: HOME,
    provider: "test-provider",
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode,
  };
  return {
    outbound: {
      ...base,
      availability,
      originEndpoint,
      destination: anchorEndpoint,
      accessAnchor: anchorEndpoint,
      direction: "outbound",
    },
    returnRoute: {
      ...base,
      availability,
      origin: anchor.coordinates!,
      originEndpoint: anchorEndpoint,
      destination: originEndpoint,
      accessAnchor: anchorEndpoint,
      direction: "return",
    },
  } as unknown as CarRoundTripRoute;
}

function availablePair(destination: Destination): CarRoundTripRoute {
  const pair = identityPair(destination, "error", "quota_exceeded");
  return {
    outbound: {
      ...(pair.outbound as CarRouteResult),
      availability: "available",
      distanceKm: 24.6,
      durationMinutes: 40,
      confidence: "verified",
      completeness: "complete",
      toll: { state: "unknown", basis: "unspecified" },
    },
    returnRoute: {
      ...(pair.returnRoute as CarRouteResult),
      availability: "available",
      distanceKm: 23.9,
      durationMinutes: 38,
      confidence: "verified",
      completeness: "complete",
      toll: { state: "unknown", basis: "unspecified" },
    },
  } as unknown as CarRoundTripRoute;
}

const fallbackContext = {
  homeStationCoords: HOME,
  homeStationTransportZoneId: HOME_ZONE,
};

function evidenceWith(
  destination: Destination,
  pairs: Record<string, CarRoundTripRoute>,
  modes = ["my_car"],
) {
  return getTravelDurationEvidence(
    destination,
    {
      homeStationCoords: HOME,
      carRoutes: pairs,
    },
    modes,
  );
}

describe("car outage fallback policy", () => {
  it("provider success wins and never falls back", () => {
    resetCarRouteFallbackCounters();
    const fallback = getCarOutageFallbackEstimate(
      yomiuriland,
      fallbackContext,
      availablePair(yomiuriland).outbound,
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().provider_success).toBe(1);
  });

  it.each([
    ["quota_exceeded", "fallback_quota"],
    ["network_error", "fallback_network"],
    ["timeout", "fallback_timeout"],
    ["provider_not_configured", "fallback_not_configured"],
    ["provider_http_502", "fallback_5xx"],
  ] as const)(
    "temporary failure %s degrades to a labeled rough estimate (counter %s)",
    (failureCode, counter) => {
      resetCarRouteFallbackCounters();
      const fallback = getCarOutageFallbackEstimate(
        yomiuriland,
        fallbackContext,
        bareErrorRoute(failureCode),
      );
      expect(fallback).not.toBeNull();
      expect(fallback!.source).toBe(CAR_ROUTE_OUTAGE_FALLBACK_SOURCE);
      expect(fallback!.evidence).toBe("estimated");
      expect(fallback!.failureCode).toBe(failureCode);
      expect(fallback!.mode).toBe("car");
      const [min, max] = fallback!.timeRange;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
      // The fallback carries NO canonical distance/fuel/toll truth.
      expect("distanceKm" in fallback!).toBe(false);
      expect("toll" in fallback!).toBe(false);
      expect(snapshotCarRouteFallbackCounters()[counter]).toBe(1);
    },
  );

  it("no_route is authoritative and blocks the fallback", () => {
    resetCarRouteFallbackCounters();
    const fallback = getCarOutageFallbackEstimate(
      yomiuriland,
      fallbackContext,
      { ...bareErrorRoute("unroutable"), availability: "no_route" },
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().blocked_no_route).toBe(1);
  });

  it("explicitly restricted access never estimates", () => {
    resetCarRouteFallbackCounters();
    const restricted = {
      ...yomiuriland,
      carAccess: {
        ...yomiuriland.carAccess,
        state: "restricted",
        eligibility: "restricted",
        anchors: [],
      },
    } as unknown as Destination;
    const fallback = getCarOutageFallbackEstimate(
      restricted,
      fallbackContext,
      bareErrorRoute("quota_exceeded"),
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().blocked_restricted).toBe(1);
  });

  it("ferry-required island destinations never estimate", () => {
    resetCarRouteFallbackCounters();
    const island = {
      ...yomiuriland,
      coordinates: { lat: 24.7833, lng: 125.3258 }, // Miyako Island
    } as unknown as Destination;
    const fallback = getCarOutageFallbackEstimate(
      island,
      fallbackContext,
      bareErrorRoute("quota_exceeded"),
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().blocked_unknown).toBe(1);
  });

  it("unknown car access never estimates (no resolvable anchors)", () => {
    resetCarRouteFallbackCounters();
    // Endpoint-sensitive POI stays unknown (never promoted): no anchors,
    // no fallback estimate.
    const fallback = getCarOutageFallbackEstimate(
      ginzanOnsen,
      fallbackContext,
      bareErrorRoute("quota_exceeded"),
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().blocked_unknown).toBe(1);
  });

  it("authorization failures stay hard failures", () => {
    resetCarRouteFallbackCounters();
    const fallback = getCarOutageFallbackEstimate(
      yomiuriland,
      fallbackContext,
      bareErrorRoute("provider_authorization_error"),
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().blocked_authorization).toBe(1);
  });

  it("validation failures stay hard failures", () => {
    resetCarRouteFallbackCounters();
    const fallback = getCarOutageFallbackEstimate(
      yomiuriland,
      fallbackContext,
      bareErrorRoute("provider_http_400"),
    );
    expect(fallback).toBeNull();
    expect(snapshotCarRouteFallbackCounters().blocked_validation).toBe(1);
  });

  it("fallback never leaks across destinations", () => {
    resetCarRouteFallbackCounters();
    // Karuizawa is 140+ km away: the bounded estimator refuses to fabricate
    // a long estimate, and the failure evidence is scoped per destination.
    const forKaruizawa = getCarOutageFallbackEstimate(
      karuizawa,
      fallbackContext,
      bareErrorRoute("quota_exceeded"),
    );
    const forYomiuriland = getCarOutageFallbackEstimate(
      yomiuriland,
      fallbackContext,
      bareErrorRoute("quota_exceeded"),
    );
    expect(forKaruizawa).toBeNull();
    expect(forYomiuriland).not.toBeNull();
  });
});

describe("travel evidence integration (outage vs recovery)", () => {
  it("quota outage degrades day-trip evidence to a rough estimate", () => {
    resetCarRouteFallbackCounters();
    const evidence = evidenceWith(yomiuriland, {
      yomiuriland: identityPair(yomiuriland, "error", "quota_exceeded"),
    });
    expect(evidence.evidence).toBe("estimated");
    expect(evidence.estimate?.source).toBe(CAR_ROUTE_OUTAGE_FALLBACK_SOURCE);
    expect(evidence.estimate?.timeRange[0]).toBeGreaterThan(0);
    expect(snapshotCarRouteFallbackCounters().fallback_quota).toBeGreaterThan(
      0,
    );
  });

  it("provider recovery replaces the fallback automatically", () => {
    resetCarRouteFallbackCounters();
    const evidence = evidenceWith(yomiuriland, {
      yomiuriland: availablePair(yomiuriland),
    });
    expect(evidence.evidence).toBe("verified");
    expect(evidence.estimate?.source).not.toBe(
      CAR_ROUTE_OUTAGE_FALLBACK_SOURCE,
    );
    expect(evidence.estimate?.timeRange[0]).toBe(40);
    expect(evidence.journey?.availability).toBe("available");
    expect(evidence.journey?.legs.length ?? 0).toBeGreaterThan(0);
  });

  it("no_route removes the car estimate entirely (no fabricated travel time)", () => {
    resetCarRouteFallbackCounters();
    const evidence = evidenceWith(yomiuriland, {
      yomiuriland: identityPair(yomiuriland, "no_route", "unroutable"),
    });
    expect(evidence.evidence).toBe("unknown");
    expect(evidence.estimate).toBeUndefined();
    expect(snapshotCarRouteFallbackCounters().blocked_no_route).toBeGreaterThan(
      0,
    );
  });

  it("provider-backed route always beats the fallback for the same destination", () => {
    resetCarRouteFallbackCounters();
    // Same destination: first an outage, then the provider recovers.
    const outage = evidenceWith(yomiuriland, {
      yomiuriland: identityPair(yomiuriland, "error", "quota_exceeded"),
    });
    expect(outage.estimate?.source).toBe(CAR_ROUTE_OUTAGE_FALLBACK_SOURCE);
    const recovered = evidenceWith(yomiuriland, {
      yomiuriland: availablePair(yomiuriland),
    });
    expect(recovered.evidence).toBe("verified");
    expect(recovered.estimate?.timeRange[0]).toBe(40);
    expect(snapshotCarRouteFallbackCounters().provider_success).toBeGreaterThan(
      0,
    );
  });

  it("cross-destination isolation: another destination's failure never estimates this one", () => {
    resetCarRouteFallbackCounters();
    // karuizawa's pair is a quota failure; yomiuriland has NO route pair at
    // all — its evidence cannot inherit karuizawa's failure.
    const evidence = evidenceWith(yomiuriland, {
      karuizawa: identityPair(karuizawa, "error", "quota_exceeded"),
    });
    expect(evidence.evidence).toBe("estimated"); // generic bounded estimate
    expect(evidence.estimate?.source).not.toBe(
      CAR_ROUTE_OUTAGE_FALLBACK_SOURCE,
    );
  });
});

describe("sabotage regression: recommendation surface during outage and recovery", () => {
  function pipelineContext(
    overrides: Partial<RecommendationContext> = {},
  ): RecommendationContext {
    return {
      vibe: "any",
      budget: 100000,
      budgetTier: "standard",
      carMode: "my_car",
      publicModes: [],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: HOME,
      originZoneId: "mainland-honshu",
      tripDuration: "fullDay",
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

  it("ORS outage degrades car recommendations to rough estimates instead of vanishing", () => {
    resetCarRouteFallbackCounters();
    const outagePairs = {
      yomiuriland: identityPair(yomiuriland, "error", "quota_exceeded"),
      "tokyo-station-chiyoda": identityPair(
        tokyoStation,
        "error",
        "quota_exceeded",
      ),
    };
    const results = runRecommendationPipeline([yomiuriland, tokyoStation], {
      ...pipelineContext(),
      carRoutes: outagePairs,
      carCostOptions: carOptions(2),
    });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      // The travel-time surface still shows a clearly-labeled rough estimate.
      expect(result.transportEstimate?.source).toBe(
        CAR_ROUTE_OUTAGE_FALLBACK_SOURCE,
      );
      expect(result.transportEstimate?.evidence).toBe("estimated");
      // The budget surface stays partial: no fabricated fuel/toll truth
      // (the incomplete total is not displayed as a canonical range).
      expect(result.estimatedCostRange).toBeUndefined();
    }
    expect(snapshotCarRouteFallbackCounters().fallback_quota).toBeGreaterThan(
      0,
    );
  });

  it("provider recovery replaces the fallback with exact routed facts", () => {
    resetCarRouteFallbackCounters();
    const availablePairs = {
      yomiuriland: availablePair(yomiuriland),
      "tokyo-station-chiyoda": availablePair(tokyoStation),
    };
    const results = runRecommendationPipeline([yomiuriland, tokyoStation], {
      ...pipelineContext(),
      carRoutes: availablePairs,
      carCostOptions: carOptions(2),
    });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      // Verified provider facts replace the rough estimate.
      expect(result.transportEstimate?.evidence).toBe("verified");
      expect(result.transportEstimate?.source).not.toBe(
        CAR_ROUTE_OUTAGE_FALLBACK_SOURCE,
      );
      expect(result.transportEstimate?.timeRange[0]).toBe(40);
      // Budget stays partial where the provider itself has no truth: toll
      // unknown => the complete total is unavailable on the surface.
      expect(result.estimatedCostRange).toBeUndefined();
    }
    expect(snapshotCarRouteFallbackCounters().provider_success).toBeGreaterThan(
      0,
    );
  });
});

describe("budget stays partial during outage (no fake canonical truth)", () => {
  it("fallback never seeds fuel distance or tolls into the engine", () => {
    const engine = calculateTripEstimate({
      dest: yomiuriland,
      mode: "my_car",
      partySize: 2,
      homeCoords: HOME,
      includeOriginTravel: true,
      duration: "fullDay",
      carRoute: undefined,
    });
    // Without a provider route the engine remains partial: origin travel is
    // unavailable, tolls unknown, and no canonical distance exists.
    expect(
      engine.missingComponents.some((m) => m.scope === "origin_travel"),
    ).toBe(true);
    expect(engine.completeness).not.toBe("complete");
    expect(engine.total).toBeUndefined();
  });
});
