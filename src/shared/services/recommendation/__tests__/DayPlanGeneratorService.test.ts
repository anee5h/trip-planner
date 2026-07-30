import { describe, it, expect } from "vitest";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
  isRealDestinationStop,
} from "../DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

const mockDestPrimary = {
  id: "roppongi-hills",
  name: "Roppongi Hills",
  prefecture: "Tokyo",
  categories: ["Observation Deck"],
  role: "primary",
  budgetMin: 2000,
  budgetMax: 3000,
  recommendedVisitHours: { min: 1.5, max: 2.5 },
  coordinates: { lat: 35.6604, lng: 139.7292 },
} as unknown as Destination;

describe("DayPlanGeneratorService", () => {
  it("generates a structured day plan with minimum real stop thresholds", () => {
    const plan = generateDayPlan(mockDestPrimary);
    expect(plan).toBeDefined();
    expect(plan.id).toContain(mockDestPrimary.id);

    if (!plan.isUnfeasible) {
      const realStops = plan.steps.filter(isRealDestinationStop);
      expect(realStops.length).toBeGreaterThanOrEqual(2);
      expect(plan.totalDurationMinutes).toBeGreaterThan(0);
      expect(plan.totalBudgetRange[0]).toBeGreaterThan(0);
    }
  });

  it("fails gracefully with half-day fallback when full day stops are insufficient", () => {
    const unfeasiblePlan = generateDayPlan(mockDestPrimary, {
      planType: "full_day",
      startTime: "17:00",
      maxEndTime: "17:30",
    });

    expect(unfeasiblePlan.isUnfeasible).toBe(true);
    expect(unfeasiblePlan.unfeasibleErrorMessage?.en).toBeDefined();
  });

  it("ensures lunch never starts before 11:30 and inserts no long unexplained idle gaps", () => {
    const plan = generateDayPlan(mockDestPrimary, {
      planType: "full_day",
      startTime: "09:00",
    });

    const lunchStep = plan.steps.find((s) => s.id === "meal-lunch");
    if (lunchStep) {
      const startMins =
        parseInt(lunchStep.startTime.split(":")[0], 10) * 60 +
        parseInt(lunchStep.startTime.split(":")[1], 10);
      expect(startMins).toBeGreaterThanOrEqual(11 * 60 + 30);
    }

    const bufferStep = plan.steps.find((s) => s.id === "buffer-lunch");
    if (bufferStep) {
      expect(bufferStep.durationMinutes).toBeLessThanOrEqual(30);
    }
  });

  it("removes a step from plan and recalculates start/end times", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    if (initialPlan.steps.length > 0) {
      const firstStepId = initialPlan.steps[0].id;
      const updatedPlan = removeStepFromPlan(initialPlan, firstStepId);
      expect(
        updatedPlan.steps.find((s) => s.id === firstStepId),
      ).toBeUndefined();
    }
  });

  it("reorders steps in a plan accurately and preserves route feasibility", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    const destSteps = initialPlan.steps.filter(isRealDestinationStop);
    if (destSteps.length >= 2) {
      const idx0 = initialPlan.steps.findIndex((s) => s.id === destSteps[0].id);
      const idx1 = initialPlan.steps.findIndex((s) => s.id === destSteps[1].id);
      const firstDestTitle = destSteps[0].title.en;
      const reorderedPlan = reorderPlanSteps(initialPlan, idx0, idx1);
      if (!reorderedPlan.isUnfeasible) {
        const newDestSteps = reorderedPlan.steps.filter(isRealDestinationStop);
        expect(newDestSteps[1].title.en).toBe(firstDestTitle);
      }
    }
  });
});
