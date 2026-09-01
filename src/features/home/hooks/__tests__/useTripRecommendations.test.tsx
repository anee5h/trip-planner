/** @vitest-environment jsdom */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTripRecommendations } from "../useTripRecommendations";

const { getRecommendations } = vi.hoisted(() => ({
  getRecommendations: vi.fn<(...args: unknown[]) => unknown[]>(() => []),
}));

vi.mock("@/shared/services/recommendation/RecommendationService", () => ({
  getRecommendations,
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({ destinationRatings: { down: "down" } }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let latestRoulette: ReturnType<typeof useTripRecommendations> | undefined;
const CURRENT_LOCATION = { lat: 35.6595, lng: 139.7005 };

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  getRecommendations.mockClear();
  latestRoulette = undefined;
});

function Harness() {
  useTripRecommendations({
    allDestinations: [],
    vibe: "art",
    budget: 40_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    tripDuration: "fullDay",
    homeStationCoords: CURRENT_LOCATION,
    isVisited: () => false,
    rouletteConstraints: {
      budget: 10_000,
      carMode: "rental",
      publicModes: [],
      partySize: 3,
      budgetTier: "economy",
      tripDuration: "halfDay",
    },
  });
  return null;
}

function FallbackHarness() {
  latestRoulette = useTripRecommendations({
    allDestinations: [],
    vibe: "art",
    budget: 40_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    tripDuration: "fullDay",
    homeStationCoords: CURRENT_LOCATION,
    isVisited: () => false,
    rouletteConstraints: {
      budget: 10_000,
      carMode: "rental",
      publicModes: [],
      partySize: 3,
      budgetTier: "economy",
      tripDuration: "halfDay",
    },
  });
  return null;
}

function WeekendHarness() {
  latestRoulette = useTripRecommendations({
    allDestinations: [],
    vibe: "nature",
    budget: 95_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    homeStationCoords: CURRENT_LOCATION,
    isVisited: () => false,
    rouletteConstraints: {
      budget: 80_000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      budgetTier: "standard",
      tripDuration: "2d1n",
    },
    tripDuration: "2d1n",
  });
  return null;
}

function DisabledRouletteHarness() {
  latestRoulette = useTripRecommendations({
    allDestinations: [],
    vibe: "art",
    budget: 40_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    tripDuration: "fullDay",
    homeStationCoords: CURRENT_LOCATION,
    isVisited: () => false,
    rouletteEnabled: false,
  });
  return null;
}

describe("useTripRecommendations", () => {
  it("does not expand the roulette pool until it is enabled", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<DisabledRouletteHarness />));

    expect(latestRoulette?.rouletteCandidates).toEqual([]);
    expect(latestRoulette?.rouletteExpansion).toBe("exact");
    expect(getRecommendations).toHaveBeenCalledTimes(1);
  });

  it("uses draft hard constraints for roulette while loosening only vibe", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));

    const mainContext = getRecommendations.mock.calls[0]?.[1];
    expect(mainContext).toMatchObject({
      vibe: "art",
      tripDuration: "fullDay",
    });

    const rouletteContext = getRecommendations.mock.calls[1]?.[1];
    expect(rouletteContext).toMatchObject({
      vibe: "any",
      budget: 10_000,
      carMode: "rental",
      publicModes: [],
      partySize: 3,
      budgetTier: "economy",
      tripDuration: "halfDay",
      userRatings: { down: "down" },
      destinationWeather: { preferred: "any" },
    });
  });

  it("origin forecast conditions never reach destination scoring contexts", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));

    expect(getRecommendations.mock.calls.length).toBeGreaterThan(0);
    for (const [, context] of getRecommendations.mock.calls) {
      const weather = (context as { destinationWeather?: object })
        .destinationWeather;
      expect(weather).toEqual({ preferred: "any" });
      expect(weather).not.toHaveProperty("actual");
      expect(weather).not.toHaveProperty("days");
    }
  });

  it("passes temporary current-location coordinates through the normal recommendation context", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));

    for (const [, context] of getRecommendations.mock.calls) {
      expect(context).toMatchObject({ homeStationCoords: CURRENT_LOCATION });
    }
  });

  it("expands roulette only after a small exact pool and caps the fallback pool", () => {
    getRecommendations.mockImplementation((_, context: any) => {
      if (context.vibe !== "any") return [];
      if (context.budget === 10_000) {
        return Array.from(
          { length: context.tripDuration === "halfDay" ? 2 : 1 },
          (_, index) => ({ id: `${context.tripDuration}-${index}` }),
        );
      }
      return Array.from({ length: 24 }, (_, index) => ({
        id: `expanded-${index}`,
      }));
    });

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<FallbackHarness />));

    expect(latestRoulette?.rouletteExpansion).toBe("budget");
    expect(latestRoulette?.rouletteCandidates).toHaveLength(20);
    const rouletteContexts = getRecommendations.mock.calls
      .map(([, context]) => context as { vibe?: string; budget?: number })
      .filter((context) => context.vibe === "any");
    expect(rouletteContexts.some((context) => context.budget === 12_000)).toBe(
      true,
    );
  });

  it("passes canonical overnight duration into recommendation contexts", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<WeekendHarness />));

    const mainContext = getRecommendations.mock.calls[0]?.[1];
    expect(mainContext).toMatchObject({ tripDuration: "2d1n" });

    const rouletteContexts = getRecommendations.mock.calls
      .slice(1)
      .map(([, context]) => context as { tripDuration?: string; vibe?: string })
      .filter((context) => context.vibe === "any");

    expect(rouletteContexts.length).toBeGreaterThan(0);
    expect(
      rouletteContexts.every(
        (context) =>
          context.tripDuration === "2d1n" || context.tripDuration === "3d2n",
      ),
    ).toBe(true);
  });

  it("overnight roulette does not expand into day durations", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<WeekendHarness />));

    const rouletteContexts = getRecommendations.mock.calls
      .slice(1)
      .map(([, context]) => context as { tripDuration?: string; vibe?: string })
      .filter((context) => context.vibe === "any");

    expect(rouletteContexts.length).toBeGreaterThan(0);
    expect(
      rouletteContexts.every(
        (ctx) => ctx.tripDuration === "2d1n" || ctx.tripDuration === "3d2n",
      ),
    ).toBe(true);
  });
});
