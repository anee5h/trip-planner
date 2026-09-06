import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { calculateGeneratedPlanCost } from "../GeneratedPlanCostService";

type TestPlan = Parameters<typeof calculateGeneratedPlanCost>[0];

function planFor(destination: Destination): TestPlan {
  return {
    steps: [{ type: "destination", destination }],
    routeLegs: [],
    assumptions: [],
  } as unknown as TestPlan;
}

const destination = {
  id: "kai260-plan-poi",
  name: "Plan POI",
  nameJa: "プラン目的地",
  prefecture: "Kanagawa",
  region: "Kanto",
  kind: "museum",
  role: "standalone",
  coordinates: { lat: 35.45, lng: 139.63 },
  recommendedVisitHours: { min: 2, max: 6 },
} as unknown as Destination;

describe("KAI-260 generated-plan canonical adapter", () => {
  it("keeps the generated total partial when mandatory admission is unresolved", () => {
    const result = calculateGeneratedPlanCost(
      planFor(destination),
      2,
      null,
      false,
    );
    expect(result.totalRange).toBeUndefined();
    expect(result.completeness).toBe("partial");
    expect(result.admission.semanticState).toBe("unknown");
    expect(result.meals.applicable).toBe(true);
    expect(result.meals.source).toBe("estimated");
    expect(result.originTransport.applicable).toBe(false);
    expect(result.estimateQuality).toBe("estimated");
  });

  it("never collapses a verified route-leg range to a midpoint", () => {
    const result = calculateGeneratedPlanCost(
      {
        ...planFor(destination),
        routeLegs: [
          {
            from: destination,
            to: destination,
            mode: "train",
            durationMinutes: 20,
            curatedFare: { min: 300, max: 700 },
          },
        ],
      } as never,
      1,
      "train",
      false,
    );
    expect(result.localTransit.min).toBeLessThan(result.localTransit.max);
    expect(result.localTransit.min).toBeGreaterThanOrEqual(300);
    expect(result.localTransit.max).toBeGreaterThanOrEqual(700);
  });
});
