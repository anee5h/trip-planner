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
    actualWeather: { desc: "Rain", temperatureC: 18 },
    vibe: "art",
    budget: 40_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    tripDuration: "fullDay",
    homeStationCoords: { lat: 35.68, lng: 139.76 },
    isVisited: () => false,
    rouletteConstraints: {
      budget: 10_000,
      carMode: "rental",
      publicModes: [],
      partySize: 3,
      budgetTier: "economy",
      tripDuration: "halfDay",
      tripMode: "day_trip",
      accommodationAllowance: 0,
    },
    tripMode: "day_trip",
    accommodationAllowance: 0,
  });
  return null;
}

function FallbackHarness() {
  latestRoulette = useTripRecommendations({
    allDestinations: [],
    actualWeather: { desc: "Rain", temperatureC: 18 },
    vibe: "art",
    budget: 40_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    tripDuration: "fullDay",
    homeStationCoords: { lat: 35.68, lng: 139.76 },
    isVisited: () => false,
    rouletteConstraints: {
      budget: 10_000,
      carMode: "rental",
      publicModes: [],
      partySize: 3,
      budgetTier: "economy",
      tripDuration: "halfDay",
      tripMode: "day_trip",
      accommodationAllowance: 0,
    },
    tripMode: "day_trip",
    accommodationAllowance: 0,
  });
  return null;
}

function WeekendHarness() {
  latestRoulette = useTripRecommendations({
    allDestinations: [],
    actualWeather: { desc: "Clear", temperatureC: 22 },
    vibe: "nature",
    budget: 95_000,
    carMode: "none",
    publicModes: ["train"],
    partySize: 2,
    budgetTier: "standard",
    tripDuration: "fullDay",
    homeStationCoords: { lat: 35.68, lng: 139.76 },
    isVisited: () => false,
    rouletteConstraints: {
      budget: 80_000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
      budgetTier: "standard",
      tripDuration: "fullDay",
      tripMode: "weekend_2d1n",
      accommodationAllowance: 15000,
    },
    tripMode: "weekend_2d1n",
    accommodationAllowance: 15000,
  });
  return null;
}

describe("useTripRecommendations", () => {
  it("uses draft hard constraints for roulette while loosening only vibe", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));

    const mainContext = getRecommendations.mock.calls[0]?.[1];
    expect(mainContext).toMatchObject({
      vibe: "art",
      tripMode: "day_trip",
      accommodationAllowance: 0,
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
      weather: { actual: { condition: "rainy", temperatureC: 18 } },
    });
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

  it("passes tripMode and accommodationAllowance into recommendation context for weekend mode", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<WeekendHarness />));

    const mainContext = getRecommendations.mock.calls[0]?.[1];
    expect(mainContext).toMatchObject({
      tripMode: "weekend_2d1n",
      accommodationAllowance: 15000,
    });

    // Roulette context should also carry tripMode and accommodationAllowance
    const rouletteContexts = getRecommendations.mock.calls
      .slice(1)
      .map(
        ([, context]) =>
          context as {
            tripMode?: string;
            accommodationAllowance?: number;
            vibe?: string;
          },
      )
      .filter((context) => context.vibe === "any");

    expect(rouletteContexts.length).toBeGreaterThan(0);
    for (const ctx of rouletteContexts) {
      expect(ctx.tripMode).toBe("weekend_2d1n");
      expect(ctx.accommodationAllowance).toBe(15000);
    }
  });

  it("weekend roulette does not perform adjacent day-trip duration expansion", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<WeekendHarness />));

    const rouletteContexts = getRecommendations.mock.calls
      .slice(1)
      .map(([, context]) => context as { tripDuration?: string; vibe?: string })
      .filter((context) => context.vibe === "any");

    expect(rouletteContexts.length).toBeGreaterThan(0);
    for (const ctx of rouletteContexts) {
      // Weekend mode evaluates exactly the selected duration — never the
      // adjacent day-trip bands.
      expect(ctx.tripDuration).toBe("fullDay");
    }
  });
});
