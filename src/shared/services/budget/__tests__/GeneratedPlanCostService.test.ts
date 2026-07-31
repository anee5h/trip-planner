import { describe, it, expect } from "vitest";
import {
  calculateGeneratedPlanCost,
  estimateOriginTransportFare,
} from "../GeneratedPlanCostService";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

describe("GeneratedPlanCostService", () => {
  it("calculates itemized plan cost using ticket breakdown and marks missing tickets as estimated/unknown", () => {
    const mockDest = {
      id: "dest-1",
      name: "Dest 1",
      budgetMin: 5000,
      budgetBreakdown: {
        tickets: 1500,
        food: 2000,
        transport: 500,
        cafe: 1000,
      },
    } as unknown as Destination;

    const mockPlan: DayPlan = {
      id: "plan-test",
      title: { en: "Test", ja: "テスト" },
      steps: [
        {
          id: "step-1",
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "11:00",
          durationMinutes: 120,
          destination: mockDest,
          title: { en: "Dest 1", ja: "Dest 1" },
        },
      ],
      routeLegs: [
        {
          fromDestinationId: "hub-1",
          toDestinationId: "dest-1",
          durationMinutes: 20,
          source: "estimated",
          confidence: "estimated",
        },
      ],
      totalDurationMinutes: 120,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    };

    const cost = calculateGeneratedPlanCost(mockPlan, 2, "train", false);

    expect(cost.admission.min).toBe(3000); // 1500 * 2
    expect(cost.admission.source).toBe("curated");
    expect(cost.originTransport.source).toBe("unknown");
    expect(cost.totalRange[0]).toBeGreaterThan(0);
    expect(cost.confidence).toBe("estimated");
  });

  it("returns zero origin transport fare when origin info is unavailable", () => {
    const originCost = estimateOriginTransportFare(false);
    expect(originCost.min).toBe(0);
    expect(originCost.max).toBe(0);
    expect(originCost.source).toBe("unknown");
  });
});
