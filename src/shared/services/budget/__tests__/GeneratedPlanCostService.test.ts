import { describe, it, expect } from "vitest";
import { calculateGeneratedPlanCost } from "../GeneratedPlanCostService";
import type { DayPlan } from "../../recommendation/DayPlanGeneratorService";

describe("GeneratedPlanCostService", () => {
  it("calculates itemized plan cost based on route legs and plan steps", () => {
    const mockPlan: DayPlan = {
      id: "plan-skytree",
      title: { en: "Test Plan", ja: "テスト" },
      steps: [
        {
          id: "step-1",
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "11:00",
          durationMinutes: 120,
          destination: { id: "skytree", budgetMin: 2000 } as any,
          title: { en: "Skytree", ja: "スカイツリー" },
        },
        {
          id: "step-lunch",
          type: "meal",
          timeBlock: "afternoon",
          startTime: "12:00",
          endTime: "13:00",
          durationMinutes: 60,
          title: { en: "Lunch", ja: "昼食" },
        },
      ],
      routeLegs: [
        {
          fromDestinationId: "skytree",
          toDestinationId: "sensoji",
          durationMinutes: 15,
          source: "estimated",
          confidence: "estimated",
        },
      ],
      totalDurationMinutes: 240,
      totalBudgetRange: [3000, 6000],
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    };

    const cost = calculateGeneratedPlanCost(mockPlan, 2, "train");

    expect(cost.originTransport).toBe(3000); // 1500 * 2
    expect(cost.localTransit).toBe(450); // 15m * 15 * 2
    expect(cost.admission).toBe(4000); // 2000 * 2
    expect(cost.meals).toBe(2400); // 1 meal * 1200 * 2
    expect(cost.parking).toBe(0); // train mode
    expect(cost.totalRange[0]).toBe(3000 + 450 + 4000 + 2400);
  });
});
