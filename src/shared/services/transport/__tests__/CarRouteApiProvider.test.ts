import { afterEach, describe, expect, it, vi } from "vitest";
import type { CarRouteRequest } from "../CarRouteProvider";
import {
  CarRouteApiProvider,
  clearCarRouteApiCache,
} from "../CarRouteApiProvider";

const origin = {
  id: "origin",
  label: "Trip origin",
  kind: "origin" as const,
  coordinates: { lat: 35.6812, lng: 139.7671 },
};
const anchor = {
  id: "karuizawa-old-new-area-parking",
  label: "Karuizawa parking",
  kind: "official_parking" as const,
  accessAnchorId: "karuizawa-old-new-area-parking",
  coordinates: { lat: 36.357333, lng: 138.633287 },
};
const otherAnchor = {
  ...anchor,
  id: "hakone-official-parking",
  accessAnchorId: "hakone-official-parking",
  coordinates: { lat: 35.2307, lng: 139.1021 },
};

function request(overrides: Partial<CarRouteRequest> = {}): CarRouteRequest {
  return {
    origin,
    destination: anchor,
    direction: "outbound",
    ...overrides,
  };
}

function canonicalBody(overrides: Record<string, unknown> = {}) {
  return {
    availability: "available",
    origin: { lat: 35.6812, lng: 139.7671 },
    originEndpoint: {
      id: "origin",
      label: "Trip origin",
      kind: "origin",
      coordinates: origin.coordinates,
    },
    destination: {
      id: anchor.id,
      label: anchor.label,
      kind: "official_parking",
      coordinates: anchor.coordinates,
    },
    provider: "openrouteservice",
    direction: "outbound",
    retrievedAt: "2026-09-03T00:00:00.000Z",
    distanceKm: 166,
    durationMinutes: 150,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "verified",
    completeness: "complete",
    ...overrides,
  };
}

type FetchMock = (url: string, init?: RequestInit) => Promise<Response>;

function fetchMockFor(
  responder: FetchMock,
): ReturnType<typeof vi.fn<FetchMock>> {
  return vi.fn<FetchMock>(responder);
}

afterEach(() => {
  clearCarRouteApiCache();
});

describe("CarRouteApiProvider", () => {
  it("posts only coordinates + target identity to the server endpoint", async () => {
    const fetchMock = fetchMockFor(
      async () =>
        new Response(JSON.stringify(canonicalBody()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const provider = new CarRouteApiProvider({ fetchImpl: fetchMock });
    const result = await provider.route(request());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("/api/car-route");
    expect(JSON.parse(call[1]?.body as string)).toEqual({
      origin: { lat: 35.6812, lng: 139.7671 },
      target: {
        lat: 36.357333,
        lng: 138.633287,
        id: anchor.id,
        label: anchor.label,
      },
      direction: "outbound",
    });
    expect(result).toMatchObject({
      availability: "available",
      provider: "openrouteservice",
      distanceKm: 166,
      durationMinutes: 150,
    });
  });

  it("serves repeat identical requests from the bounded cache without refetching", async () => {
    const fetchMock = fetchMockFor(
      async () =>
        new Response(JSON.stringify(canonicalBody()), { status: 200 }),
    );
    const provider = new CarRouteApiProvider({ fetchImpl: fetchMock });
    await provider.route(request());
    await provider.route(request());
    await provider.route(request());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never reuses a route across destinations (cache key includes anchor id)", async () => {
    const fetchMock = fetchMockFor(
      async () =>
        new Response(JSON.stringify(canonicalBody()), { status: 200 }),
    );
    const provider = new CarRouteApiProvider({ fetchImpl: fetchMock });
    await provider.route(request());
    await provider.route(request({ destination: otherAnchor }));
    await provider.route(request({ direction: "return" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps server failure codes to canonical error results", async () => {
    const fetchMock = fetchMockFor(
      async () =>
        new Response(
          JSON.stringify({
            availability: "error",
            errorCode: "provider_not_configured",
            provider: "openrouteservice",
            direction: "outbound",
            origin: { lat: 35.6812, lng: 139.7671 },
            toll: { state: "unknown", basis: "unspecified" },
            confidence: "unknown",
            completeness: "unknown",
          }),
          { status: 200 },
        ),
    );
    const provider = new CarRouteApiProvider({ fetchImpl: fetchMock });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "provider_not_configured",
      confidence: "unknown",
    });
  });

  it("maps HTTP 429 to quota_exceeded", async () => {
    const fetchMock = fetchMockFor(
      async () =>
        new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
        }),
    );
    const provider = new CarRouteApiProvider({ fetchImpl: fetchMock });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "quota_exceeded",
    });
  });

  it("fails closed on network errors with canonical error semantics", async () => {
    const fetchMock = fetchMockFor(async () => {
      throw new Error("offline");
    });
    const provider = new CarRouteApiProvider({ fetchImpl: fetchMock });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "network_error",
      provider: "car-route-api",
    });
  });
});
