/** @vitest-environment jsdom */
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { useTripRecommendations } from "../useTripRecommendations";
import {
  clearCarRouteCacheForTest,
  createCarRouteApiProvider,
} from "@/shared/services/transport/CarRouteApiProvider";
import { getRoutableCarAccessAnchors } from "@/shared/services/transport/CarAccessService";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import {
  resetCarRouteIntentCounters,
  snapshotCarRouteIntentCounters,
} from "@/shared/services/recommendation/carRouteAcquisition";

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({ destinationRatings: {} }),
}));

const all = destinationsIndex as unknown as Destination[];
// Discovery surfaces run over the full catalogue; the reduced set keeps the
// test fast while still exercising real scoring and estimate generation.
const carRelevantOnly = all
  .filter((d) => getRoutableCarAccessAnchors(d).length > 0)
  .slice(0, 120);
const HOME = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushUntil(condition: () => boolean, timeoutMs = 8000) {
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

function fetchMockFor(responder: (body: any) => unknown) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify(responder(body)), { status: 200 });
  });
}

const baseProps = {
  vibe: "any",
  budget: 50000,
  carMode: "my_car" as string,
  publicModes: [] as string[],
  partySize: 2,
  budgetTier: "standard" as const,
  tripDuration: "fullDay" as const,
  homeStationCoords: HOME,
  homeStationTransportZoneId: "mainland-honshu" as const,
  preferredWeather: "any" as const,
  isVisited: () => false,
} as const;

const discoveryContext = {
  vibe: "any",
  budget: 50000,
  carMode: "my_car",
  publicModes: [] as string[],
  partySize: 2,
  budgetTier: "standard",
  visitedIds: [] as string[],
  homeStationCoords: HOME,
  originZoneId: "mainland-honshu",
  tripDuration: "fullDay",
};

describe("KAI-226 intent-triggered ORS policy (discovery = zero calls)", () => {
  beforeEach(() => {
    clearCarRouteCacheForTest();
    resetCarRouteIntentCounters();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("HOME discovery with car selected makes ZERO car-route provider calls", async () => {
    const fetchMock = fetchMockFor(canonicalBody);
    vi.stubGlobal("fetch", fetchMock);
    const probe = mountProbe(() =>
      useTripRecommendations({
        ...baseProps,
        allDestinations: carRelevantOnly,
      }),
    );
    await flushUntil(
      () => (probe.current?.recommendedDestinations?.length ?? 0) > 0,
    );
    const carRouteCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/car-route"),
    );
    // The former acquisition effect issued up to 10 calls here: now none.
    expect(carRouteCalls.length).toBe(0);
    expect(snapshotCarRouteIntentCounters().discovery_estimate).toBeGreaterThan(
      0,
    );
    // Deterministic (estimated) estimates drive the rail.
    const estimates = (probe.current?.recommendedDestinations ?? [])
      .map((r) => r.transportEstimate)
      .filter(Boolean);
    expect(estimates.length).toBeGreaterThan(0);
    probe.unmount();
  });

  it("recommendation / rail generation produces car recommendations WITHOUT any provider route", () => {
    const fetchMock = fetchMockFor(canonicalBody);
    vi.stubGlobal("fetch", fetchMock);
    const results = getRecommendations(
      carRelevantOnly,
      discoveryContext as never,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some(
        (r) =>
          r.bestTransportMode === "my_car" ||
          r.transportEstimate?.mode === "car" ||
          r.transportEstimate?.mode === "my_car",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/car-route"),
      ).length,
    ).toBe(0);
  });

  it("cached verified routes are reused on discovery with zero NEW provider calls", async () => {
    const fetchMock = fetchMockFor(canonicalBody);
    vi.stubGlobal("fetch", fetchMock);
    // Simulate a prior detail visit: fill the SHARED cache for the first
    // surfaced car candidate.
    const base = getRecommendations(carRelevantOnly, discoveryContext as never);
    const first = base[0];
    const destination = carRelevantOnly.find((d) => d.id === first.id)!;
    const provider = createCarRouteApiProvider();
    for (const anchor of getRoutableCarAccessAnchors(destination)) {
      await provider.route(
        routeRequest(destination, anchor.id, HOME, "outbound"),
      );
      await provider.route(
        routeRequest(destination, anchor.id, HOME, "return"),
      );
    }
    const callsAfterFill = fetchMock.mock.calls.length;
    expect(callsAfterFill).toBeGreaterThan(0);

    const probe = mountProbe(() =>
      useTripRecommendations({
        ...baseProps,
        allDestinations: carRelevantOnly,
      }),
    );
    await flushUntil(
      () => (probe.current?.recommendedDestinations?.length ?? 0) > 0,
    );
    // Cache reuse: no NEW provider calls at all.
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFill);
    expect(snapshotCarRouteIntentCounters().cache_hit).toBeGreaterThan(0);
    probe.unmount();
  });

  it("acquisition is reachable ONLY from intent surfaces (call-site inventory)", () => {
    const srcRoot = join(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "..",
      "..",
      "..",
      "..",
    );
    const allowed = new Set([
      "carRouteAcquisition.ts",
      "useDestinationCarRouteRefinement.ts",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.includes("__tests__") || entry.name.startsWith("."))
            continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/(test|spec)\./.test(entry.name)) continue;
        const content = readFileSync(full, "utf8");
        if (content.includes("acquireCarRoutes") && !allowed.has(entry.name)) {
          offenders.push(entry.name);
        }
      }
    };
    walk(join(srcRoot, "src"));
    expect(offenders).toEqual([]);
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
