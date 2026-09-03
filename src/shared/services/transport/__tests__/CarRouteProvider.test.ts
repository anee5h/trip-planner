import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinations from "@/shared/data/destinations-index.json";
import { getCarAccess } from "../CarAccessService";
import { buildCarJourney } from "../CarJourneyBuilder";
import type { CarAccessAnchor } from "@/shared/types/carAccess";
import {
  createFixtureCarRouteProvider,
  getCarRoundTripRoute,
  getCarRoundTripRouteAsync,
  type CarRouteEndpoint,
  type CarRouteRequest,
  type CarRouteResult,
} from "../CarRouteProvider";

const origin = { lat: 35.44, lng: 139.64 };
const firstAnchor: CarAccessAnchor = {
  id: "first-parking",
  label: "First parking",
  kind: "official_parking",
  coordinates: { lat: 36.34, lng: 138.59 },
  sourceUrls: ["https://example.test/first-parking"],
};
const fallbackAnchor: CarAccessAnchor = {
  id: "fallback-parking",
  label: "Fallback parking",
  kind: "official_parking",
  coordinates: { lat: 36.35, lng: 138.6 },
  sourceUrls: ["https://example.test/fallback-parking"],
};
const destination = {
  id: "fixture-destination",
  name: "Fixture destination",
  coordinates: { lat: 36.36, lng: 138.61 },
  carAccess: {
    state: "parking_walk",
    eligibility: "eligible",
    anchors: [firstAnchor, fallbackAnchor],
    evidence: "fixture",
    sourceUrls: ["https://example.test/access"],
  },
} as unknown as Destination;

function route(
  anchor: CarAccessAnchor,
  direction: "outbound" | "return",
  overrides: Partial<CarRouteResult> = {},
): CarRouteResult {
  const accessEndpoint: CarRouteEndpoint = {
    id: anchor.id,
    label: anchor.label,
    coordinates: anchor.coordinates!,
    accessAnchorId: anchor.id,
    sourceUrls: anchor.sourceUrls,
  };
  const homeEndpoint: CarRouteEndpoint = {
    id: "origin",
    label: "Trip origin",
    coordinates: origin,
  };
  return {
    availability: "available",
    origin: direction === "outbound" ? origin : anchor.coordinates!,
    destination: direction === "outbound" ? accessEndpoint : homeEndpoint,
    accessAnchor: accessEndpoint,
    provider: "fixture-provider",
    direction,
    retrievedAt: "2026-09-03T00:00:00Z",
    distanceKm: direction === "outbound" ? 100 : 112,
    durationMinutes: direction === "outbound" ? 120 : 128,
    toll: {
      state: "priced",
      amountJPY: direction === "outbound" ? 4000 : 4300,
      basis: "ETC",
    },
    confidence: "verified",
    completeness: "complete",
    ...overrides,
  };
}

describe("CarRouteProvider", () => {
  it("normalizes promise-based providers across both directions", async () => {
    const syncProvider = createFixtureCarRouteProvider([
      route(firstAnchor, "outbound"),
      route(firstAnchor, "return"),
    ]);
    const provider = {
      route: async (request: CarRouteRequest) => syncProvider.route(request),
    };

    const result = await getCarRoundTripRouteAsync(
      provider,
      destination,
      origin,
    );

    expect(result.outbound.direction).toBe("outbound");
    expect(result.returnRoute.direction).toBe("return");
    expect(result.outbound.accessAnchor?.id).toBe(firstAnchor.id);
    expect(result.returnRoute.accessAnchor?.id).toBe(firstAnchor.id);
  });

  it("keeps outbound and return route facts independent", () => {
    const provider = createFixtureCarRouteProvider([
      route(firstAnchor, "outbound"),
      route(firstAnchor, "return"),
    ]);
    const result = getCarRoundTripRoute(provider, destination, origin);
    expect(result.outbound.distanceKm).toBe(100);
    expect(result.returnRoute.distanceKm).toBe(112);
    expect(result.outbound.durationMinutes).not.toBe(
      result.returnRoute.durationMinutes,
    );
  });

  it("does not combine outbound and return routes from different anchors", () => {
    const provider = {
      route(request: CarRouteRequest): CarRouteResult {
        return route(
          request.direction === "outbound" ? firstAnchor : fallbackAnchor,
          request.direction,
        );
      },
    };
    const result = getCarRoundTripRoute(provider, destination, origin);

    expect(result.outbound.availability).toBe("unknown");
    expect(result.returnRoute.availability).toBe("available");
    expect(result.outbound.accessAnchor?.id).not.toBe(
      result.returnRoute.accessAnchor?.id,
    );
  });

  it("catches synchronous provider failures and preserves unknown evidence", () => {
    const result = getCarRoundTripRoute(
      {
        route() {
          throw new Error("network unavailable");
        },
      },
      destination,
      origin,
    );

    expect(result.outbound.availability).toBe("unknown");
    expect(result.outbound.errorCode).toBe("provider_error");
    expect(result.returnRoute.errorCode).toBe("provider_error");
  });

  it("uses verified fallback routes instead of unknown-confidence routes", () => {
    const provider = createFixtureCarRouteProvider([
      route(firstAnchor, "outbound", { confidence: "unknown" }),
      route(firstAnchor, "return", { confidence: "unknown" }),
      route(fallbackAnchor, "outbound"),
      route(fallbackAnchor, "return"),
    ]);
    const result = getCarRoundTripRoute(provider, destination, origin);

    expect(result.outbound.accessAnchor?.id).toBe(fallbackAnchor.id);
    expect(result.returnRoute.accessAnchor?.id).toBe(fallbackAnchor.id);
    expect(result.outbound.confidence).toBe("verified");
  });

  it("uses an alternate ordered access anchor when the first has no route", () => {
    const provider = createFixtureCarRouteProvider([
      route(fallbackAnchor, "outbound"),
      route(fallbackAnchor, "return"),
    ]);
    const result = getCarRoundTripRoute(provider, destination, origin);
    expect(result.outbound.destination?.id).toBe("fallback-parking");
    expect(result.returnRoute.destination?.id).toBe("origin");
    expect(result.returnRoute.accessAnchor?.id).toBe("fallback-parking");
  });

  it("preserves provider failure and does not synthesize a route", () => {
    const provider = createFixtureCarRouteProvider([]);
    const result = getCarRoundTripRoute(provider, destination, origin);
    expect(result.outbound.availability).toBe("unknown");
    expect(result.outbound.distanceKm).toBeUndefined();
    expect(result.outbound.errorCode).toBe("fixture_route_missing");
  });

  it("does not route restricted or seasonal access", () => {
    const refusalByState: Record<string, "restricted" | "unavailable"> = {
      restricted: "restricted",
      seasonal: "restricted",
      unavailable: "unavailable",
    };
    for (const state of ["restricted", "seasonal", "unavailable"] as const) {
      const restrictedDestination = {
        ...destination,
        carAccess: {
          ...destination.carAccess,
          state,
          eligibility: refusalByState[state],
        },
      } as unknown as Destination;
      const calls: CarRouteRequest[] = [];
      const result = getCarRoundTripRoute(
        {
          route(request) {
            calls.push(request);
            return route(firstAnchor, request.direction);
          },
        },
        restrictedDestination,
        origin,
      );
      expect(calls).toHaveLength(0);
      expect(result.outbound.errorCode).toBe(`access_${state}`);
      expect(result.returnRoute.errorCode).toBe(`access_${state}`);
    }
  });

  it("uses the canonical Karuizawa registry anchor rather than the centroid", () => {
    const karuizawa = (destinations as Destination[]).find(
      (item) => item.id === "karuizawa-town",
    )!;
    const anchor = getCarAccess(karuizawa).anchors[0];
    expect(anchor?.id).toBe("karuizawa-old-new-area-parking");
    expect(anchor?.coordinates).toEqual({ lat: 36.357333, lng: 138.633287 });
    const result = getCarRoundTripRoute(
      createFixtureCarRouteProvider([
        route(anchor!, "outbound"),
        route(anchor!, "return"),
      ]),
      karuizawa,
      origin,
    );
    expect(result.outbound.destination?.id).toBe(anchor?.id);
    expect(result.outbound.destination?.coordinates).not.toEqual(
      karuizawa.coordinates,
    );
  });

  it("rejects available provider results with mismatched endpoint metadata", () => {
    const provider = {
      route(request: CarRouteRequest): CarRouteResult {
        return route(firstAnchor, request.direction, {
          destination: {
            id: "wrong-anchor",
            label: "Wrong anchor",
            coordinates: { lat: 0, lng: 0 },
          },
        });
      },
    };
    const result = getCarRoundTripRoute(provider, destination, origin);
    expect(result.outbound.availability).toBe("unknown");
    expect(result.outbound.errorCode).toBe("invalid_provider_route");
    expect(result.returnRoute.availability).toBe("unknown");
  });

  it("rejects available provider results with mismatched origin scope", () => {
    const provider = {
      route(request: CarRouteRequest): CarRouteResult {
        return route(firstAnchor, request.direction, {
          originEndpoint: {
            id: "wrong-origin",
            label: "Wrong origin",
            coordinates: request.origin.coordinates,
          },
        });
      },
    };
    const result = getCarRoundTripRoute(provider, destination, origin);
    expect(result.outbound.availability).toBe("unknown");
    expect(result.outbound.errorCode).toBe("invalid_provider_route");
  });

  it("rejects an access-anchor identity that does not match the requested anchor", () => {
    const provider = {
      route(request: CarRouteRequest): CarRouteResult {
        return route(firstAnchor, request.direction, {
          accessAnchor: {
            id: "wrong-anchor",
            label: "Wrong anchor",
            coordinates: firstAnchor.coordinates!,
          },
        });
      },
    };
    const result = getCarRoundTripRoute(provider, destination, origin);
    expect(result.outbound.availability).toBe("unknown");
    expect(result.outbound.errorCode).toBe("invalid_provider_route");
  });

  it("preserves unknown route confidence and the selected personal-car mode", () => {
    const journey = buildCarJourney(
      destination,
      origin,
      {
        outbound: route(firstAnchor, "outbound", { confidence: "unknown" }),
        returnRoute: route(firstAnchor, "return", { confidence: "unknown" }),
      },
      undefined,
      "my_car",
    );
    expect(journey).not.toBeNull();
    expect(journey!.legs.every((leg) => leg.mode === "my_car")).toBe(true);
    expect(journey!.legs[0].duration.evidence).toBe("unknown");
    expect(journey!.confidence).toBe("unknown");
    expect(journey!.provenance.duration).toBe("unknown");
  });

  it("rejects a round trip whose legs use different anchors", () => {
    const journey = buildCarJourney(
      destination,
      origin,
      {
        outbound: route(firstAnchor, "outbound"),
        returnRoute: route(fallbackAnchor, "return"),
      },
      undefined,
      "my_car",
    );

    expect(journey).toBeNull();
  });

  it("keeps unknown toll state separate from a free road", () => {
    const unknown = route(firstAnchor, "outbound", {
      toll: { state: "unknown", basis: "unspecified" },
    });
    const free = route(firstAnchor, "return", {
      toll: { state: "free", basis: "unspecified" },
    });
    expect(unknown.toll.state).toBe("unknown");
    expect(free.toll.state).toBe("free");
  });
});
