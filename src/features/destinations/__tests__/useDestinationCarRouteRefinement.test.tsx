/** @vitest-environment jsdom */
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { useDestinationCarRouteRefinement } from "../hooks/useDestinationCarRouteRefinement";
import {
  clearCarRouteCacheForTest,
  createCarRouteApiProvider,
  peekCachedCarRoundTrip,
} from "@/shared/services/transport/CarRouteApiProvider";
import { getRoutableCarAccessAnchors } from "@/shared/services/transport/CarAccessService";
import {
  resetCarRouteIntentCounters,
  snapshotCarRouteIntentCounters,
} from "@/shared/services/recommendation/carRouteAcquisition";

const all = destinationsIndex as unknown as Destination[];
const yomiuriland = all.find((d) => d.id === "yomiuriland")!;
const HOME = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushUntil(condition: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!condition()) {
    await act(async () => {
      await sleep(25);
    });
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
  }
}

function mountProbe<Result>(render: () => Result) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const result: { current: Result | undefined } = { current: undefined };
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    function Probe() {
      result.current = render();
      return null as ReactElement | null;
    }
    root!.render(<Probe />);
  });
  return {
    get current() {
      return result.current;
    },
    unmount() {
      act(() => root!.unmount());
      container.remove();
    },
  };
}

function canonicalBody(body: {
  origin: { lat: number; lng: number };
  target: { id: string; lat: number; lng: number };
  direction: string;
}) {
  return {
    availability: "available",
    origin: body.origin,
    destination: {
      id: body.target.id,
      label: body.target.id,
      coordinates: { lat: body.target.lat, lng: body.target.lng },
    },
    provider: "car-route-api",
    direction: body.direction,
    retrievedAt: new Date().toISOString(),
    distanceKm: body.direction === "outbound" ? 24.6 : 23.9,
    durationMinutes: body.direction === "outbound" ? 40 : 38,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "verified",
    completeness: "complete",
  };
}

function errorBody(body: {
  origin: { lat: number; lng: number };
  target: { id: string; lat: number; lng: number };
  direction: string;
}) {
  return {
    availability: "error",
    origin: body.origin,
    destination: {
      id: body.target.id,
      label: body.target.id,
      coordinates: { lat: body.target.lat, lng: body.target.lng },
    },
    provider: "car-route-api",
    direction: body.direction,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode: "quota_exceeded",
  };
}

function noRouteBody(body: {
  origin: { lat: number; lng: number };
  target: { id: string; lat: number; lng: number };
  direction: string;
}) {
  return {
    availability: "no_route",
    origin: body.origin,
    destination: {
      id: body.target.id,
      label: body.target.id,
      coordinates: { lat: body.target.lat, lng: body.target.lng },
    },
    provider: "car-route-api",
    direction: body.direction,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode: "unroutable",
  };
}

function fetchMockFor(responder: (body: any) => unknown) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify(responder(body)), { status: 200 });
  });
}

const baseOptions = {
  carMode: "my_car",
  homeStationCoords: HOME,
  homeStationTransportZoneId: "mainland-honshu",
} as const;

describe("destination car route refinement (intent-triggered ORS)", () => {
  beforeEach(() => {
    clearCarRouteCacheForTest();
    resetCarRouteIntentCounters();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders deterministically first; intent fires exactly one round-trip pair", async () => {
    const fetchMock = fetchMockFor(canonicalBody);
    vi.stubGlobal("fetch", fetchMock);
    const probe = mountProbe(() =>
      useDestinationCarRouteRefinement(yomiuriland, baseOptions),
    );
    // Intent fires exactly one round-trip pair (outbound + return), once.
    await flushUntil(() => probe.current?.status === "provider-backed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(probe.current?.routes?.outbound.availability).toBe("available");
    expect(probe.current?.routes?.outbound.durationMinutes).toBe(40);
    expect(snapshotCarRouteIntentCounters().detail_provider_success).toBe(1);
    probe.unmount();
  });

  it("quota_exceeded keeps the rough fallback (no fabricated provider facts)", async () => {
    const fetchMock = fetchMockFor(errorBody);
    vi.stubGlobal("fetch", fetchMock);
    const probe = mountProbe(() =>
      useDestinationCarRouteRefinement(yomiuriland, baseOptions),
    );
    await flushUntil(() => probe.current?.status === "fallback");
    expect(probe.current?.routes).toBeUndefined();
    expect(probe.current?.failureCode).toBe("quota_exceeded");
    expect(snapshotCarRouteIntentCounters().detail_provider_fallback).toBe(1);
    probe.unmount();
  });

  it("no_route makes the road journey unavailable; rough estimate cannot override", async () => {
    const fetchMock = fetchMockFor(noRouteBody);
    vi.stubGlobal("fetch", fetchMock);
    const probe = mountProbe(() =>
      useDestinationCarRouteRefinement(yomiuriland, baseOptions),
    );
    await flushUntil(() => probe.current?.status === "no_route");
    expect(probe.current?.routes?.outbound.availability).toBe("no_route");
    expect(snapshotCarRouteIntentCounters().detail_provider_no_route).toBe(1);
    probe.unmount();
  });

  it("an already-verified cached route is reused with zero NEW provider calls", async () => {
    const fetchMock = fetchMockFor(canonicalBody);
    vi.stubGlobal("fetch", fetchMock);
    // Fill the SHARED cache exactly like a previous detail visit.
    const provider = createCarRouteApiProvider();
    for (const anchor of getRoutableCarAccessAnchors(yomiuriland)) {
      await provider.route(
        routeRequest(yomiuriland, anchor.id, HOME, "outbound"),
      );
      await provider.route(
        routeRequest(yomiuriland, anchor.id, HOME, "return"),
      );
    }
    const callsAfterFill = fetchMock.mock.calls.length;
    expect(callsAfterFill).toBeGreaterThan(0);
    expect(
      peekCachedCarRoundTrip(
        yomiuriland,
        HOME,
        getRoutableCarAccessAnchors(yomiuriland).map((a) => a.id),
      ),
    ).toBeDefined();

    const probe = mountProbe(() =>
      useDestinationCarRouteRefinement(yomiuriland, baseOptions),
    );
    await flushUntil(() => probe.current?.status === "provider-backed");
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFill);
    expect(snapshotCarRouteIntentCounters().cache_hit).toBe(1);
    expect(snapshotCarRouteIntentCounters().detail_provider_success).toBe(0);
    probe.unmount();
  });

  it("never fires when car mode is not selected", async () => {
    const fetchMock = fetchMockFor(canonicalBody);
    vi.stubGlobal("fetch", fetchMock);
    const probe = mountProbe(() =>
      useDestinationCarRouteRefinement(yomiuriland, {
        ...baseOptions,
        carMode: "none",
      }),
    );
    expect(probe.current?.status).toBe("idle");
    expect(fetchMock).toHaveBeenCalledTimes(0);
    probe.unmount();
  });
});

function routeRequest(
  destination: Destination,
  anchorId: string,
  origin: { lat: number; lng: number },
  direction: "outbound" | "return",
) {
  const anchor = getRoutableCarAccessAnchors(destination).find(
    (a) => a.id === anchorId,
  )!;
  return {
    origin: {
      coordinates: origin,
      id: "origin",
      label: "Trip origin",
      kind: "origin",
    },
    destination: {
      id: anchor.id,
      label: anchor.id,
      coordinates: anchor.coordinates!,
      kind: anchor.kind,
    },
    direction,
  } as never;
}
