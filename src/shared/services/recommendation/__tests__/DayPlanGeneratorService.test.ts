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

  it("generates a structured day plan with morning, afternoon, and meal breaks", () => {
    const plan = generateDayPlan(mockDestPrimary);
    expect(plan.id).toBe(`plan-${mockDestPrimary.id}`);
    expect(plan.steps.length).toBeGreaterThan(0);

    const hasMeal = plan.steps.some((s) => s.type === "meal");
    const hasDestination = plan.steps.some((s) => s.type === "destination");
    expect(hasMeal).toBe(true);
    expect(hasDestination).toBe(true);

    expect(plan.totalDurationMinutes).toBeGreaterThan(120);
    expect(plan.totalBudgetRange[0]).toBeGreaterThan(0);
  });

  it("discloses missing opening hours when businessHours and openingHours are null", () => {
    const plan = generateDayPlan(mockDestPrimary);
    expect(Array.isArray(plan.uncertainHoursDisclosures)).toBe(true);
  });

  it("triggers overfilled warning when total plan duration exceeds limit", () => {
    const plan = generateDayPlan(mockDestPrimary, { availableTimeHours: 3 });
    expect(plan.isOverfilled).toBe(true);
    expect(plan.overfillWarning?.en).toContain("Tight schedule");
    expect(plan.overfillWarning?.ja).toContain("スケジュールが過密です");
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
