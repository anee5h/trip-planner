import { describe, expect, it, vi } from "vitest";
import type { CarRouteRequest } from "../CarRouteProvider";
import { OpenRouteServiceCarRouteProvider } from "../OpenRouteServiceCarRouteProvider";

const origin = {
  id: "origin-nakayama",
  label: "Nakayama/Yokohama",
  kind: "origin" as const,
  coordinates: { lat: 35.514745, lng: 139.539692 },
};
const anchor = {
  id: "hakone-parking",
  label: "Hakone official parking",
  kind: "official_parking" as const,
  accessAnchorId: "hakone-parking",
  coordinates: { lat: 35.232, lng: 139.106 },
};

function request(
  direction: "outbound" | "return" = "outbound",
): CarRouteRequest {
  return direction === "outbound"
    ? { origin, destination: anchor, direction }
    : { origin: anchor, destination: origin, direction };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerFor(
  body: unknown,
  status = 200,
): {
  provider: OpenRouteServiceCarRouteProvider;
  fetchMock: ReturnType<typeof vi.fn>;
} {
  const fetchMock = vi.fn(async () => response(body, status));
  return {
    provider: new OpenRouteServiceCarRouteProvider({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
      now: () => "2026-09-03T00:00:00.000Z",
    }),
    fetchMock,
  };
}

describe("OpenRouteServiceCarRouteProvider", () => {
  it("normalizes routed distance and duration to the requested anchor", async () => {
    const { provider, fetchMock } = providerFor({
      routes: [{ summary: { distance: 123456, duration: 7890 } }],
    });

    const result = await provider.route(request());

    expect(result).toMatchObject({
      availability: "available",
      provider: "openrouteservice",
      origin: origin.coordinates,
      originEndpoint: origin,
      destination: anchor,
      accessAnchor: anchor,
      direction: "outbound",
      distanceKm: 123.456,
      durationMinutes: 131.5,
      confidence: "verified",
      completeness: "complete",
      retrievedAt: "2026-09-03T00:00:00.000Z",
      toll: { state: "unknown", basis: "unspecified" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.heigit.org/openrouteservice/v2/directions/driving-car/json",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          coordinates: [
            [origin.coordinates.lng, origin.coordinates.lat],
            [anchor.coordinates.lng, anchor.coordinates.lat],
          ],
          instructions: false,
        }),
      }),
    );
  });

  it("preserves reversed endpoints for an independent return route", async () => {
    const { provider, fetchMock } = providerFor({
      routes: [{ summary: { distance: 90000, duration: 6000 } }],
    });

    const result = await provider.route(request("return"));

    expect(result).toMatchObject({
      origin: anchor.coordinates,
      originEndpoint: anchor,
      destination: origin,
      accessAnchor: anchor,
      direction: "return",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      coordinates: [
        [anchor.coordinates.lng, anchor.coordinates.lat],
        [origin.coordinates.lng, origin.coordinates.lat],
      ],
      instructions: false,
    });
  });

  it("fails closed for invalid endpoint coordinates", async () => {
    const { provider, fetchMock } = providerFor({
      routes: [{ summary: { distance: 1, duration: 1 } }],
    });

    const result = await provider.route({
      ...request(),
      origin: { ...origin, coordinates: { lat: 95, lng: 139 } },
    });

    expect(result).toMatchObject({
      availability: "error",
      errorCode: "invalid_origin_coordinates",
      confidence: "unknown",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "malformed distance",
      { summary: { distance: "123", duration: 60 } },
      "malformed_distance",
    ],
    [
      "malformed duration",
      { summary: { distance: 123, duration: null } },
      "malformed_duration",
    ],
  ])("rejects %s", async (_label, body, errorCode) => {
    const { provider } = providerFor({ routes: [body] });
    const result = await provider.route(request());
    expect(result).toMatchObject({ availability: "error", errorCode });
  });

  it("distinguishes an unroutable response", async () => {
    const { provider } = providerFor(
      { error: { code: 2010, message: "Could not find a routable point" } },
      400,
    );
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "no_route",
      errorCode: "unroutable",
    });
  });

  it("distinguishes quota responses", async () => {
    const { provider } = providerFor({ error: { message: "rate limit" } }, 429);
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "quota_exceeded",
    });
  });

  it("classifies quota even when the provider body is not JSON", async () => {
    const fetchMock = vi.fn(
      async () => new Response("rate limit", { status: 429 }),
    );
    const provider = new OpenRouteServiceCarRouteProvider({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
    });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "quota_exceeded",
    });
  });

  it("classifies a malformed route envelope as invalid provider data", async () => {
    const { provider } = providerFor({ routes: [{}] });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "invalid_provider_response",
    });
  });

  it("distinguishes network failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const provider = new OpenRouteServiceCarRouteProvider({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
    });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "network_error",
    });
  });

  it("rejects a missing API key without making a request", async () => {
    const fetchMock = vi.fn(async () => response({}));
    const provider = new OpenRouteServiceCarRouteProvider({
      apiKey: "",
      fetchImpl: fetchMock,
    });
    const result = await provider.route(request());
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "provider_not_configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
