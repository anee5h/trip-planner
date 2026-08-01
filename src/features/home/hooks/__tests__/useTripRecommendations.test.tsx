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

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  getRecommendations.mockClear();
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
    },
  });
  return null;
}

describe("useTripRecommendations", () => {
  it("uses draft hard constraints for roulette while loosening only vibe", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));

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
});
