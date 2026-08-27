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
    // KAI-217B round-3: originTransport unknown → the plan is PARTIAL (a
    // missing route leg) — knownSubtotal still carries the known parts but
    // there is no totalRange and no complete claim. The confidence is
    // honestly "estimated" (not verified): a partial plan is never verified
    // end-to-end even when its known parts are curated.
    expect(cost.completeness).toBe("partial");
    expect(cost.knownSubtotal[0]).toBeGreaterThan(0);
    expect(cost.confidence).toBe("estimated");
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

  it("known admission + ZERO route legs => complete, knownSubtotal = admission (KAI-217B round-4)", () => {
    const manualDest = {
      ...BASE_DEST,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket",
      },
    } as unknown as Destination;
    const zeroLegPlan: DayPlan = {
      ...makePlan(manualDest),
      routeLegs: [],
    };
    const cost = calculateGeneratedPlanCost(zeroLegPlan, 2, "train", false);
    // Zero required route legs satisfies the route condition → complete
    // when admission is fully curated.
    expect(cost.completeness).toBe("complete");
    expect(cost.knownSubtotal[0]).toBe(3000); // 1500 × 2
    expect(cost.knownSubtotal[1]).toBe(3000);
  });
});

// ── KAI-219A review BLOCKER 3: GeneratedPlan trusts explicit v2 facts ──────
describe("KAI-219A — GeneratedPlan explicit v2 admission authority", () => {
  it("A) old budgetMetadata legacy + new valid verified_paid fact → plan consumes the FACT", () => {
    // The record has OLD legacy metadata (untrusted method 'unknown') but a
    // NEW valid verified_paid fact. The fact is authoritative — the old
    // trust gate must NOT reject it.
    const dest = {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" },
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 2500, max: 2500 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
        reviewIntervalMonths: 12,
      },
    } as unknown as Destination;
    const cost = calculateGeneratedPlanCost(makePlan(dest), 1, "train", false);
    expect(cost.admission.min).toBe(2500);
    expect(cost.admission.max).toBe(2500);
    expect(cost.admission.source).toBe("curated");
    expect(cost.admission.applicable).toBe(true);
  });

  it("B) documented_estimate bounded → source ESTIMATED, NOT curated", () => {
    const dest = {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" }, // old trust gate would reject
      admission: {
        state: "documented_estimate",
        provenance: "model",
        cost: { kind: "bounded", min: 1800, max: 2200 },
        scope: "general_entry",
      },
    } as unknown as Destination;
    const cost = calculateGeneratedPlanCost(makePlan(dest), 1, "train", false);
    expect(cost.admission.min).toBe(1800);
    expect(cost.admission.max).toBe(2200);
    expect(cost.admission.source).toBe("estimated");
    expect(cost.admission.applicable).toBe(true);
  });

  it("C) open_ended admission → partial → NO exact projected ticket scalar", () => {
    const dest = {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" },
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "open_ended", from: 1200 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    } as unknown as Destination;
    const cost = calculateGeneratedPlanCost(makePlan(dest), 1, "train", false);
    // open_ended → never scalarized to a full ticket amount.
    expect(cost.admission.min).toBe(0);
    expect(cost.admission.max).toBe(0);
    expect(cost.admission.source).toBe("unknown");
    expect(cost.admission.applicable).toBe(false);
    expect(cost.assumptions.some((a) => a.destinationId === "dest-1")).toBe(
      true,
    );
  });

  it("D) explicit unavailable + legacy numeric ticket → remains missing, legacy NEVER resurrects", () => {
    // The record HAS a legacy numeric ticket (1500) AND an explicit
    // unavailable admission fact. The fact's truth wins — the legacy
    // value must NOT be consumed.
    const dest = {
      ...BASE_DEST, // budgetBreakdown.tickets = 1500
      budgetMetadata: { method: "manual", confidence: "low" },
      admission: {
        state: "unavailable",
        provenance: "none",
        reasonCode: "legacy_provenance_unrecovered",
        cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
        scope: "general_entry",
      },
    } as unknown as Destination;
    const cost = calculateGeneratedPlanCost(makePlan(dest), 1, "train", false);
    expect(cost.admission.min).toBe(0);
    expect(cost.admission.max).toBe(0);
    expect(cost.admission.source).toBe("unknown");
    expect(cost.admission.applicable).toBe(false);
  });

  it("malformed verified_paid fact (wrong cost kind) → fails closed, never numeric", () => {
    const dest = {
      ...BASE_DEST,
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "open_ended", from: 1000 }, // wrong kind for paid
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    } as unknown as Destination;
    const cost = calculateGeneratedPlanCost(makePlan(dest), 1, "train", false);
    expect(cost.admission.min).toBe(0);
    expect(cost.admission.source).toBe("unknown");
  });

  it("not_applicable admission → excluded from required admission (not missing)", () => {
    const dest = {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" },
      admission: {
        state: "not_applicable",
        provenance: "none",
        reasonCode: "hub_budget_not_applicable",
        cost: { kind: "not_applicable" },
        scope: "general_entry",
      },
    } as unknown as Destination;
    const cost = calculateGeneratedPlanCost(makePlan(dest), 1, "train", false);
    // Excluded: no missing assumption, not ¥0 contribution.
    expect(cost.admission.min).toBe(0);
    expect(cost.admission.applicable).toBe(true);
    expect(cost.assumptions.some((a) => a.destinationId === "dest-1")).toBe(
      false,
    );
  });
});
