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
import {
  getBestOneWayTravelMinutes,
  getDayTripTravelDurationEvidence,
} from "../TripDurationService";
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
  it("legacy car candidates receive estimated display duration, never canonical route facts", () => {
    const ashikaga = catalogue.find(
      (destination) => destination.id === "ashikaga-city",
    );
    expect(ashikaga).toBeDefined();
    const selected = context("2d1n", "my_car", false);

    // Car candidates are back for CONSIDERATION (KAI-264 resolution model):
    // the bounded display estimate restores day-trip car planning, but it is
    // explicitly estimated and is never canonical road-route evidence.
    const minutes = getBestOneWayTravelMinutes(ashikaga!, selected, ["my_car"]);
    expect(minutes).toBeTypeOf("number");
    const evidence = getDayTripTravelDurationEvidence(ashikaga!, selected, [
      "my_car",
    ]);
    expect(evidence.evidence).toBe("estimated");
    expect(getBestOneWayTravelMinutes(ashikaga!, selected, ["car"])).toBeTypeOf(
      "number",
    );
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
        // KAI-264 resolution model: car candidates are eligible for
        // CONSIDERATION across every duration (bounded display estimates
        // restore day-trip planning). Canonical route facts remain absent
        // until KAI-226 runtime acquisition supplies them.
        expect(results.length).toBeGreaterThan(0);
        return;
      }
      expect(results.length).toBeGreaterThan(0);
    },
  );
});
