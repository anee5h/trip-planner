import { describe, expect, it } from "vitest";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
} from "../DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

const mockDestPrimary = {
  id: "shibuya-sky",
  name: "Shibuya Sky",
  coordinates: { lat: 35.658, lng: 139.7016 },
  prefecture: "Tokyo",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  recommendedVisitHours: { min: 1.5, max: 2.5 },
  ratings: { rain: 8 },
} as unknown as Destination;

describe("DayPlanGeneratorService", () => {
  it("returns an empty plan if primary destination is missing", () => {
    const plan = generateDayPlan(null as unknown as Destination);
    expect(plan.steps).toEqual([]);
    expect(plan.totalDurationMinutes).toBe(0);
  });

  it("generates a structured day plan with options for half day and full day", () => {
    const halfDayPlan = generateDayPlan(mockDestPrimary, {
      planType: "half_day",
    });
    const fullDayPlan = generateDayPlan(mockDestPrimary, {
      planType: "full_day",
    });

    expect(halfDayPlan.totalDurationMinutes).toBeLessThanOrEqual(360);
    expect(fullDayPlan.totalDurationMinutes).toBeGreaterThan(240);
  });

  it("enforces deterministic pruning when maxEndTime makes schedule impossible", () => {
    const unfeasiblePlan = generateDayPlan(mockDestPrimary, {
      startTime: "17:00",
      maxEndTime: "17:30",
    });

    expect(unfeasiblePlan.isUnfeasible).toBe(true);
    expect(unfeasiblePlan.unfeasibleErrorMessage?.en).toContain(
      "We couldn’t create a realistic plan within this time window",
    );
  });

  it("removes a step from plan and recalculates start/end times", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    const firstStepId = initialPlan.steps[0].id;

    const updatedPlan = removeStepFromPlan(initialPlan, firstStepId);
    expect(updatedPlan.steps.find((s) => s.id === firstStepId)).toBeUndefined();
    expect(updatedPlan.steps[0].startTime).toBe("09:00");
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
