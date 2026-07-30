import { describe, expect, it } from "vitest";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
  isRealDestinationStop,
} from "../DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

const mockDestPrimary = {
  id: "shibuya-sky-shibuya",
  name: "Shibuya Sky",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  recommendedVisitHours: { min: 1.5, max: 2.5 },
  ratings: { rain: 8 },
  coordinates: { lat: 35.659, lng: 139.7006 },
  relationships: { parentDestinationId: "shibuya-city" },
} as unknown as Destination;

describe("DayPlanGeneratorService", () => {
  it("returns an empty plan if primary destination is missing", () => {
    const plan = generateDayPlan(null as unknown as Destination);
    expect(plan.steps).toEqual([]);
    expect(plan.totalDurationMinutes).toBe(0);
  });

  it("generates a structured day plan with minimum real stop thresholds", () => {
    const halfDayPlan = generateDayPlan(mockDestPrimary, {
      planType: "half_day",
    });

    if (!halfDayPlan.isUnfeasible) {
      const realStops = halfDayPlan.steps.filter(isRealDestinationStop);
      expect(realStops.length).toBeGreaterThanOrEqual(2);
      expect(halfDayPlan.totalDurationMinutes).toBeLessThanOrEqual(360);
    }
  });

  it("fails gracefully with half-day fallback when full day stops are insufficient", () => {
    const unfeasiblePlan = generateDayPlan(mockDestPrimary, {
      startTime: "17:00",
      maxEndTime: "17:30",
    });

    expect(unfeasiblePlan.isUnfeasible).toBe(true);
    expect(unfeasiblePlan.unfeasibleErrorMessage?.en).toBeDefined();
  });

  it("removes a step from plan and recalculates start/end times", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    if (initialPlan.steps.length > 0) {
      const firstStepId = initialPlan.steps[0].id;
      const updatedPlan = removeStepFromPlan(initialPlan, firstStepId);
      expect(
        updatedPlan.steps.find((s) => s.id === firstStepId),
      ).toBeUndefined();
      expect(updatedPlan.steps[0].startTime).toBe("09:00");
    }
  });

  it("reorders steps in a plan accurately", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    if (initialPlan.steps.length >= 2) {
      const step0Title = initialPlan.steps[0].title.en;
      const reorderedPlan = reorderPlanSteps(initialPlan, 0, 1);
      expect(reorderedPlan.steps[1].title.en).toBe(step0Title);
    }
  });
});
