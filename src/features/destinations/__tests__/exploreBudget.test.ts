import { describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  resolveExploreBudgetEstimate,
  type ExploreBudgetContext,
} from "../exploreBudget";

const NAKAYAMA = { lat: 35.5147, lng: 139.5393 };
const ALL_PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];

function context(
  tripDuration: ExploreBudgetContext["duration"],
): ExploreBudgetContext {
  return {
    originCoords: NAKAYAMA,
    carMode: "none",
    publicModes: ALL_PUBLIC_MODES,
    partySize: 2,
    duration: tripDuration,
  };
}

describe("Explore shared budget estimate", () => {
  it("uses one eligible mode and the requested trip mode for the resolved range", () => {
    const destination = destinations.find((candidate) => {
      const modes = getValidModes(
        candidate,
        "none",
        ALL_PUBLIC_MODES,
        NAKAYAMA,
      );
      return modes.length >= 2;
    });
    expect(destination).toBeDefined();
    if (!destination) return;

    const validModes = getValidModes(
      destination,
      "none",
      ALL_PUBLIC_MODES,
      NAKAYAMA,
    );
    const day = resolveExploreBudgetEstimate(destination, context("fullDay"));
    const weekend = resolveExploreBudgetEstimate(destination, context("2d1n"));

    expect(day).not.toBeNull();
    expect(weekend).not.toBeNull();
    expect(validModes).toContain(day?.mode);
    expect(validModes).toContain(weekend?.mode);
    expect(day?.estimate.total?.max).toBe(
      Math.min(
        ...validModes.map(
          (mode) =>
            calculateTripEstimate({
              dest: destination,
              mode,
              partySize: 2,
              homeCoords: NAKAYAMA,
              duration: "fullDay",
            }).total!.max,
        ),
      ),
    );
    expect(weekend?.estimate.total?.max).toBeGreaterThan(
      day?.estimate.total?.max ?? 0,
    );
  });
});
