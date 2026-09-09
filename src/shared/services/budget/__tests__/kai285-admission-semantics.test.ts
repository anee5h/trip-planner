import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { calculateGeneratedPlanCost } from "../GeneratedPlanCostService";
import { calculateTripEstimate } from "../tripEstimateEngine";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";

function destination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "kai-285-budget-fixture",
    name: "KAI-285 budget fixture",
    nameJa: "KAI-285予算フィクスチャ",
    prefecture: "Tokyo",
    region: "Kanto",
    role: "poi",
    kind: "museum",
    categories: ["Museum"],
    coordinates: { lat: 35.68, lng: 139.76 },
    transportOptions: { train: 45 },
    recommendedVisitHours: { min: 1, max: 3 },
    ...overrides,
  } as Destination;
}

function paidFact() {
  return {
    state: "verified_paid" as const,
    provenance: "verified_source" as const,
    cost: { kind: "bounded" as const, min: 1500, max: 1500 },
    scope: "general_entry" as const,
    basis: "Official adult admission.",
    sourceUrls: ["https://example.test/paid"],
    checkedAt: "2026-09-09",
  };
}

function freeFact() {
  return {
    state: "verified_free" as const,
    provenance: "verified_source" as const,
    cost: { kind: "bounded" as const, min: 0, max: 0 },
    scope: "general_entry" as const,
    basis: "Official free entry.",
    sourceUrls: ["https://example.test/free"],
    checkedAt: "2026-09-09",
  };
}

function estimateFor(dest: Destination) {
  return calculateTripEstimate({
    dest,
    duration: "fullDay",
    partySize: 2,
    includeOriginTravel: false,
  });
}

function admissionOf(result: ReturnType<typeof estimateFor>) {
  return result.components.find(
    (component) => component.evidence.scope === "admission",
  )!;
}

function planFor(destinations: Destination[]): DayPlan {
  return {
    id: "kai-285-plan",
    title: { en: "KAI-285 plan", ja: "KAI-285プラン" },
    steps: destinations.map((destination, index) => ({
      id: `step-${index + 1}`,
      type: "destination" as const,
      timeBlock: "morning" as const,
      startTime: "09:00",
      endTime: "11:00",
      durationMinutes: 120,
      destination,
      title: { en: destination.name, ja: destination.name },
    })),
    routeLegs: [],
    totalDurationMinutes: destinations.length * 120,
    isOverfilled: false,
    uncertainHoursDisclosures: [],
  };
}

describe("KAI-285 admission semantics in the canonical estimate path", () => {
  it("city hub with no destination-level ticket is complete without admission cost", () => {
    const result = estimateFor(
      destination({
        role: "hub",
        kind: "city",
        admissionApplicability: "not_applicable",
      }),
    );
    expect(admissionOf(result).cost).toEqual({ kind: "not_applicable" });
    expect(result.completeness).toBe("complete");
  });

  it("municipality with no destination-level ticket is not treated as free", () => {
    const result = estimateFor(
      destination({
        kind: "town",
        admissionApplicability: "not_applicable",
      }),
    );
    expect(admissionOf(result).cost.kind).toBe("not_applicable");
    expect(admissionOf(result).cost).not.toEqual({
      kind: "bounded",
      min: 0,
      max: 0,
    });
    expect(result.completeness).toBe("complete");
  });

  it("open scenic/nature destination uses explicit N/A semantics", () => {
    const result = estimateFor(
      destination({
        role: "standalone",
        kind: "lake",
        admissionApplicability: "not_applicable",
      }),
    );
    expect(admissionOf(result).cost).toEqual({ kind: "not_applicable" });
    expect(result.completeness).toBe("complete");
  });

  it("genuinely paid POI remains bounded and contributes to totals", () => {
    const result = estimateFor(
      destination({ kind: "museum", admission: paidFact() }),
    );
    expect(admissionOf(result).cost).toEqual({
      kind: "bounded",
      min: 3000,
      max: 3000,
    });
    expect(result.completeness).toBe("complete");
  });

  it("verified-free POI remains applicable and distinct from N/A", () => {
    const result = estimateFor(
      destination({ kind: "garden", admission: freeFact() }),
    );
    expect(admissionOf(result).cost).toEqual({
      kind: "bounded",
      min: 0,
      max: 0,
    });
    expect(admissionOf(result).evidence.state).toBe("verified_free");
    expect(result.completeness).toBe("complete");
  });

  it("city containing a paid attraction includes the child fee once, not the parent", () => {
    const city = destination({
      id: "kai-285-city",
      name: "KAI-285 City",
      role: "hub",
      kind: "city",
      admissionApplicability: "not_applicable",
    });
    const attraction = destination({
      id: "kai-285-attraction",
      name: "KAI-285 Attraction",
      kind: "museum",
      admission: paidFact(),
    });
    const cost = calculateGeneratedPlanCost(
      planFor([city, attraction]),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.semanticState).toBe("paid");
    expect(cost.admission.min).toBe(1500);
    expect(cost.admission.max).toBe(1500);
  });

  it("applicable POI with unknown admission remains partial", () => {
    const result = estimateFor(
      destination({ kind: "museum", admission: undefined }),
    );
    expect(admissionOf(result).cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
    expect(result.completeness).toBe("partial");
    expect(result.missingComponents).toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: "admission" })]),
    );
  });

  it("N/A destination with otherwise complete costs is complete, not partial", () => {
    const result = estimateFor(
      destination({
        kind: "village",
        admissionApplicability: "not_applicable",
      }),
    );
    expect(result.completeness).toBe("complete");
    expect(result.total).toBeDefined();
    expect(result.missingComponents).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: "admission" })]),
    );
  });
});
