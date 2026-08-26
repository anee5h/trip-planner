import { describe, it, expect } from "vitest";
import {
  calculateGeneratedPlanCost,
  estimateOriginTransportFare,
} from "../GeneratedPlanCostService";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

function makePlan(dest: Destination): DayPlan {
  return {
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
        destination: dest,
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
}

const BASE_DEST = {
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

describe("GeneratedPlanCostService", () => {
  it("calculates itemized plan cost using ticket breakdown for TRUSTED (manual) provenance", () => {
    const manualDest = {
      ...BASE_DEST,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket",
      },
    } as unknown as Destination;

    const cost = calculateGeneratedPlanCost(
      makePlan(manualDest),
      2,
      "train",
      false,
    );

    expect(cost.admission.min).toBe(3000); // 1500 * 2
    expect(cost.admission.source).toBe("curated");
    expect(cost.originTransport.source).toBe("unknown");
    expect(cost.totalRange[0]).toBeGreaterThan(0);
    // KAI-217B: the fabricated meals/parking components are removed, so a
    // plan built entirely from curated components is now VERIFIED (the old
    // "estimated" came from the fabricated meal/parking sources).
    expect(cost.confidence).toBe("verified");
  });

  it("excludes tickets from ABSENT-metadata legacy destinations (not trusted)", () => {
    // KAI-204 phase 3: a legacy record with numeric values but no
    // budgetMetadata must NOT contribute admission to a generated plan.
    const cost = calculateGeneratedPlanCost(
      makePlan(BASE_DEST),
      2,
      "train",
      false,
    );

    expect(cost.admission.min).toBe(0);
    expect(cost.admission.max).toBe(0);
    expect(cost.admission.source).toBe("unknown");
    expect(cost.assumptions.length).toBeGreaterThan(0);
    const assumption = cost.assumptions.find(
      (a) => a.type === "estimated_cost" && a.destinationId === "dest-1",
    );
    expect(assumption).toBeDefined();
  });

  it("excludes tickets from method 'unknown' destinations", () => {
    const unknownDest = {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" },
    } as unknown as Destination;

    const cost = calculateGeneratedPlanCost(
      makePlan(unknownDest),
      2,
      "train",
      false,
    );

    expect(cost.admission.min).toBe(0);
    expect(cost.admission.source).toBe("unknown");
  });

  it("includes tickets from documented model destinations", () => {
    const modelDest = {
      ...BASE_DEST,
      budgetMetadata: {
        method: "model",
        modelVersion: "budget-model-v1",
        confidence: "low",
        basis: "peer cell",
      },
    } as unknown as Destination;

    const cost = calculateGeneratedPlanCost(
      makePlan(modelDest),
      2,
      "train",
      false,
    );

    expect(cost.admission.min).toBe(3000);
    expect(cost.admission.source).toBe("curated");
  });

  it("returns zero origin transport fare when origin info is unavailable (KAI-217B: never fabricated)", () => {
    // KAI-217B: the origin-fare fallback (1500/3000) is removed; origin
    // transport is owned by the canonical engine. This extraction always
    // reports unknown/non-applicable.
    const originCost = estimateOriginTransportFare();
    expect(originCost.min).toBe(0);
    expect(originCost.max).toBe(0);
    expect(originCost.source).toBe("unknown");
    expect(originCost.applicable).toBe(false);
  });
});
