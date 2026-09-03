import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  getTripDays,
  getTripNights,
  type TripDuration,
} from "@/shared/types/tripDuration";
import { getPlannerBudgetLimit } from "@/features/home/services/PlannerBudgetPolicy";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import {
  ALL_PUBLIC_MODES,
  resolveTransportSelection,
} from "@/features/home/services/TransportResolver";
import { runRecommendationPipeline } from "../RecommendationPipeline";
import { getBestOneWayTravelMinutes } from "../TripDurationService";
import type { RecommendationContext } from "../RecommendationContext";

const catalogue = destinationsIndex as unknown as Destination[];
const tokyoStation = { lat: 35.6812, lng: 139.7671 };
const durations: TripDuration[] = [
  "shortOuting",
  "halfDay",
  "fullDay",
  "2d1n",
  "3d2n",
];
const transportSelections = [
  ["public transport", "none", true],
  ["personal car", "my_car", false],
  ["rental car", "rental", false],
] as const;

function context(
  duration: TripDuration,
  carMode: "none" | "my_car" | "rental",
  publicTransport: boolean,
): RecommendationContext {
  const selection = resolveTransportSelection(
    publicTransport,
    carMode,
    ALL_PUBLIC_MODES,
  );
  return {
    vibe: "any",
    budgetTier: "standard",
    budget: getPlannerBudgetLimit("standard", 2, duration),
    carMode: selection.carMode,
    publicModes: selection.publicModes,
    partySize: 2,
    visitedIds: [],
    homeStationCoords: tokyoStation,
    originZoneId: "mainland-honshu",
    tripDuration: duration,
  };
}

describe("KAI-262 recommendation transport matrix", () => {
  it("does not manufacture car travel evidence from legacy transport options", () => {
    const ashikaga = catalogue.find(
      (destination) => destination.id === "ashikaga-city",
    );
    expect(ashikaga).toBeDefined();
    const selected = context("2d1n", "my_car", false);

    expect(
      getBestOneWayTravelMinutes(ashikaga!, selected, ["my_car"]),
    ).toBeUndefined();
    expect(
      getBestOneWayTravelMinutes(ashikaga!, selected, ["car"]),
    ).toBeUndefined();
  });

  it.each([
    ["2d1n", 2, 1],
    ["3d2n", 3, 2],
  ] as const)(
    "preserves canonical day/night semantics for %s",
    (duration, days, nights) => {
      expect(getTripDays(duration)).toBe(days);
      expect(getTripNights(duration)).toBe(nights);
    },
  );

  it.each([
    ["fullDay", 0, 0, [0, 0]],
    ["2d1n", 1, 10_000, [10_000, 22_000]],
    ["3d2n", 2, 10_000, [20_000, 44_000]],
  ] as const)(
    "uses canonical accommodation nights for %s without party/day double multiplication",
    (duration, nights, perNight, accommodationRange) => {
      const destination = catalogue.find(
        (item) => item.id === "aizuwakamatsu-city",
      )!;
      for (const mode of ["my_car", "car"] as const) {
        const result = calculateTripEstimate({
          dest: destination,
          mode,
          partySize: 2,
          homeCoords: tokyoStation,
          duration,
          includeOriginTravel: true,
          budgetTier: "standard",
        });
        const accommodation = result.components.find(
          (item) => item.evidence.scope === "accommodation",
        );

        expect(result.accommodation).toEqual({
          perNight,
          nights,
        });
        expect(accommodation?.cost).toEqual({
          kind: "bounded",
          min: accommodationRange[0],
          max: accommodationRange[1],
        });
      }
    },
  );

  it.each(
    durations.flatMap((duration) =>
      transportSelections.map(
        ([label, carMode, publicTransport]) =>
          [duration, label, carMode, publicTransport] as const,
      ),
    ),
  )(
    "%s returns eligible recommendations for %s",
    (duration, _label, carMode, publicTransport) => {
      const results = runRecommendationPipeline(
        catalogue,
        context(duration, carMode, publicTransport),
      );

      if (carMode !== "none") {
        expect(results).toEqual([]);
        return;
      }
      expect(results.length).toBeGreaterThan(0);
    },
  );
});
