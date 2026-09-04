// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  routeCar,
  validateCarRouteRequest,
  ORS_DRIVING_CAR_URL,
} from "./car-route-core.js";

const BODY = {
  origin: { lat: 35.514745, lng: 139.539692 },
  target: {
    lat: 35.232,
    lng: 139.106,
    id: "hakone-official-parking",
    label: "Hakone official parking",
  },
  direction: "outbound",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ENV = { OPENROUTESERVICE_API_KEY: "fixture-key" };
const NOW = () => "2026-09-03T00:00:00.000Z";

describe("validateCarRouteRequest", () => {
  it("accepts a minimal valid request", () => {
    expect(validateCarRouteRequest(BODY)).toEqual({ ok: true, body: BODY });
  });

  it("accepts optional departureAt", () => {
    expect(
      validateCarRouteRequest({
        ...BODY,
        departureAt: "2026-09-05T09:00:00.000Z",
      }).ok,
    ).toBe(true);
  });

  it.each([
    ["missing body", null],
    ["invalid origin", { ...BODY, origin: { lat: 95, lng: 139 } }],
    ["missing target id", { ...BODY, target: { lat: 35, lng: 139, id: "" } }],
    ["invalid direction", { ...BODY, direction: "sideways" }],
    ["invalid departure", { ...BODY, departureAt: "not-a-date" }],
    ["extra provider field", { ...BODY, providerUrl: "https://evil" }],
  ])("rejects %s", (_label, body) => {
    expect(validateCarRouteRequest(body).ok).toBe(false);
  });
});

describe("routeCar canonical mapping", () => {
  it("returns provider_not_configured when no key is present", async () => {
    const result = await routeCar(BODY, {}, undefined, NOW);
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "provider_not_configured",
      provider: "openrouteservice",
      direction: "outbound",
    });
    expect(result.toll).toEqual({ state: "unknown", basis: "unspecified" });
  });

  it("normalizes a successful ORS response (outbound, anchor-targeted)", async () => {
    const fetchMock = async (url, init) => {
      expect(url).toBe(ORS_DRIVING_CAR_URL);
      const body = JSON.parse(init.body);
      expect(body.coordinates).toEqual([
        [139.539692, 35.514745],
        [139.106, 35.232],
      ]);
      return jsonResponse({
        routes: [{ summary: { distance: 123456, duration: 7890 } }],
      });
    };
    const result = await routeCar(BODY, ENV, fetchMock, NOW);
    expect(result).toMatchObject({
      availability: "available",
      direction: "outbound",
      distanceKm: 123.456,
      durationMinutes: 131.5,
      confidence: "verified",
      completeness: "complete",
      retrievedAt: "2026-09-03T00:00:00.000Z",
      destination: {
        id: "hakone-official-parking",
        kind: "documented_endpoint",
      },
    });
  });

  it("reverses endpoints for an independent return route", async () => {
    const returnBody = { ...BODY, direction: "return" };
    const fetchMock = async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.coordinates).toEqual([
        [139.106, 35.232],
        [139.539692, 35.514745],
      ]);
      return jsonResponse({
        routes: [{ summary: { distance: 90000, duration: 6000 } }],
      });
    };
    const result = await routeCar(returnBody, ENV, fetchMock, NOW);
    expect(result).toMatchObject({
      availability: "available",
      direction: "return",
      origin: { lat: 35.232, lng: 139.106 },
      destination: { id: "origin", kind: "origin" },
      distanceKm: 90,
      durationMinutes: 100,
    });
  });

  it.each([
    [
      "quota",
      429,
      { error: { message: "rate limit" } },
      "quota_exceeded",
      "error",
    ],
    [
      "authorization",
      403,
      { error: { message: "forbidden" } },
      "provider_authorization_error",
      "error",
    ],
    [
      "quota 403 body",
      403,
      { error: "Quota exceeded" },
      "quota_exceeded",
      "error",
    ],
    [
      "unroutable 400",
      400,
      { error: { code: 2010, message: "Could not find a routable point" } },
      "unroutable",
      "no_route",
    ],
    [
      "not found",
      404,
      { error: { message: "missing" } },
      "unroutable",
      "no_route",
    ],
    [
      "server error",
      502,
      { error: { message: "boom" } },
      "provider_http_502",
      "error",
    ],
  ])(
    "classifies %s",
    async (_label, status, payload, errorCode, availability) => {
      const fetchMock = async () => jsonResponse(payload, status);
      const result = await routeCar(BODY, ENV, fetchMock, NOW);
      expect(result).toMatchObject({ availability, errorCode });
    },
  );

  it("classifies quota even when the error body is not JSON", async () => {
    const fetchMock = async () => new Response("rate limit", { status: 429 });
    const result = await routeCar(BODY, ENV, fetchMock, NOW);
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "quota_exceeded",
    });
  });

  it("classifies network failures", async () => {
    const fetchMock = async () => {
      throw new Error("down");
    };
    const result = await routeCar(BODY, ENV, fetchMock, NOW);
    expect(result).toMatchObject({
      availability: "error",
      errorCode: "network_error",
    });
  });

  it("classifies an empty route list as unroutable", async () => {
    const fetchMock = async () => jsonResponse({ routes: [] });
    const result = await routeCar(BODY, ENV, fetchMock, NOW);
    expect(result).toMatchObject({
      availability: "no_route",
      errorCode: "unroutable",
    });
  });

  it.each([
    [
      "malformed distance",
      { routes: [{ summary: { distance: "x", duration: 60 } }] },
      "malformed_distance",
    ],
    [
      "malformed duration",
      { routes: [{ summary: { distance: 100, duration: null } }] },
      "malformed_duration",
    ],
    ["malformed envelope", { routes: [{}] }, "invalid_provider_response"],
  ])("rejects %s", async (_label, payload, errorCode) => {
    const fetchMock = async () => jsonResponse(payload);
    const result = await routeCar(BODY, ENV, fetchMock, NOW);
    expect(result).toMatchObject({ availability: "error", errorCode });
  });

  it("never accepts a provider URL from the client", async () => {
    const crafted = { ...BODY, providerUrl: "https://evil.example/route" };
    expect(validateCarRouteRequest(crafted).ok).toBe(false);
    const result = await routeCar(
      crafted,
      ENV,
      async () => {
        throw new Error("should not be called");
      },
      NOW,
    );
    expect(result.errorCode).toContain("invalid_request");
  });
});
