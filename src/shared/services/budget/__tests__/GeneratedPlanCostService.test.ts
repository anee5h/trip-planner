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
    // Origin travel is not applicable without origin coordinates. The
    // bounded total is complete even though evidence quality stays estimated.
    expect(cost.completeness).toBe("complete");
    expect(cost.knownSubtotal[0]).toBeGreaterThan(0);
    expect(cost.confidence).toBe("estimated");
  });

  it("models absent-metadata admission without consuming it as trusted legacy data", () => {
    // KAI-204 phase 3: a legacy record with numeric values but no
    // budgetMetadata must NOT contribute admission to a generated plan.
    const cost = calculateGeneratedPlanCost(
      makePlan(BASE_DEST),
      2,
      "train",
      false,
    );

    expect(cost.admission.min).toBeGreaterThan(0);
    expect(cost.admission.max).toBeGreaterThan(cost.admission.min);
    expect(cost.admission.source).toBe("estimated");
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

    expect(cost.admission.min).toBeGreaterThan(0);
    expect(cost.admission.max).toBeGreaterThanOrEqual(cost.admission.min);
    expect(cost.admission.source).toBe("estimated");
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
    expect(cost.admission.max).toBe(3000);
    expect(cost.admission.source).toBe("estimated");
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
    expect(cost.knownSubtotal[0]).toBeGreaterThan(3000);
    expect(cost.knownSubtotal[1]).toBeGreaterThan(cost.knownSubtotal[0]);
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

  it("C) open_ended admission → bounded estimate, lower bound preserved", () => {
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
    expect(cost.admission.min).toBe(1200);
    expect(cost.admission.max).toBeGreaterThan(cost.admission.min);
    expect(cost.admission.source).toBe("estimated");
    expect(cost.admission.applicable).toBe(true);
    expect(cost.assumptions.some((a) => a.destinationId === "dest-1")).toBe(
      true,
    );
  });

  it("D) explicit unavailable + legacy ticket → bounded estimate, legacy never resurrects", () => {
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
    expect(cost.admission.min).toBeGreaterThan(0);
    expect(cost.admission.max).toBeGreaterThan(cost.admission.min);
    expect(cost.admission.source).toBe("estimated");
    expect(cost.admission.applicable).toBe(true);
  });

  it("malformed verified_paid fact gets a positive modeled fallback", () => {
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
    expect(cost.admission.min).toBeGreaterThan(0);
    expect(cost.admission.max).toBeGreaterThan(cost.admission.min);
    expect(cost.admission.source).toBe("estimated");
  });

  it("not_applicable admission is excluded while other estimated costs remain disclosed", () => {
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
    expect(cost.admission.min).toBe(0);
    expect(cost.admission.applicable).toBe(false);
    expect(cost.assumptions.some((a) => a.destinationId === "dest-1")).toBe(
      true,
    );
  });
});

// ── KAI-219A FINAL repair regressions (A-F) ─────────────────────────────────
describe("KAI-219A final — GeneratedPlan known-numeric vs satisfied + aggregate semantics", () => {
  function paidDest(overrides: Partial<Destination> = {}): Destination {
    return {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" },
      ...overrides,
    } as unknown as Destination;
  }

  type AdmissionOverride = NonNullable<Destination["admission"]>;

  function verifiedPaidFact(amount: number): AdmissionOverride {
    return {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: amount, max: amount },
      scope: "general_entry",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-01-01",
    } as AdmissionOverride;
  }

  function unavailableFact(): AdmissionOverride {
    return {
      state: "unavailable",
      provenance: "none",
      reasonCode: "legacy_provenance_unrecovered",
      cost: {
        kind: "unavailable",
        reason: "legacy_provenance_unrecovered",
      },
      scope: "general_entry",
    } as AdmissionOverride;
  }

  function notApplicableFact(): AdmissionOverride {
    return {
      state: "not_applicable",
      provenance: "none",
      reasonCode: "hub_budget_not_applicable",
      cost: { kind: "not_applicable" },
      scope: "general_entry",
    } as AdmissionOverride;
  }

  function freeFact(): AdmissionOverride {
    return {
      state: "verified_free",
      provenance: "verified_source",
      basis: "The garden is free to enter",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: "general_entry",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-01-01",
    } as AdmissionOverride;
  }

  function makeMultiPlan(dests: Destination[]): DayPlan {
    return {
      ...makePlan(dests[0]),
      id: "plan-multi",
      steps: dests.map((d, i) => ({
        id: `step-${i + 1}`,
        type: "destination" as const,
        timeBlock: "morning" as const,
        startTime: "09:00",
        endTime: "11:00",
        durationMinutes: 120,
        destination: d,
        title: { en: `Dest ${i + 1}`, ja: `Dest ${i + 1}` },
      })),
      routeLegs: [],
    };
  }

  function makeZeroLegPlan(dest: Destination): DayPlan {
    return { ...makePlan(dest), routeLegs: [] };
  }

  it("A) only N/A admission + zero route legs → complete; semantic N/A; knownSubtotal gains NO fake ¥0", () => {
    const dest = paidDest({ admission: notApplicableFact() });
    const cost = calculateGeneratedPlanCost(
      makeZeroLegPlan(dest),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.semanticState).toBe("not_applicable");
    expect(cost.admission.satisfied).toBe(true);
    expect(cost.admission.knownNumeric).toBe(false);
    // N/A admission is excluded, while canonical local transport and meals
    // remain real modeled planning costs.
    expect(cost.knownSubtotal[0]).toBeGreaterThan(0);
    expect(cost.knownSubtotal[1]).toBeGreaterThan(cost.knownSubtotal[0]);
  });

  it("B) N/A + paid ¥1,500 → complete; admission range ¥1,500; NOT N/A", () => {
    const naDest = paidDest({ id: "na-1", admission: notApplicableFact() });
    const paidDest2 = paidDest({
      id: "paid-1",
      admission: verifiedPaidFact(1500),
    });
    const cost = calculateGeneratedPlanCost(
      makeMultiPlan([naDest, paidDest2]),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.semanticState).toBe("paid");
    expect(cost.admission.satisfied).toBe(true);
    expect(cost.admission.min).toBe(1500);
    expect(cost.admission.max).toBe(1500);
  });

  it("C) free + paid ¥1,500 → admission range ¥1,500; NOT Free", () => {
    const freeDest = paidDest({ id: "free-1", admission: freeFact() });
    const paidDest2 = paidDest({
      id: "paid-1",
      admission: verifiedPaidFact(1500),
    });
    const cost = calculateGeneratedPlanCost(
      makeMultiPlan([freeDest, paidDest2]),
      1,
      "train",
      false,
    );
    expect(cost.admission.semanticState).toBe("paid");
    expect(cost.admission.min).toBe(1500);
    expect(cost.admission.max).toBe(1500);
    expect(cost.admission.satisfied).toBe(true);
  });

  it("D) verified + unavailable admissions → complete modeled aggregate", () => {
    const paidDest2 = paidDest({
      id: "paid-1",
      admission: verifiedPaidFact(1500),
    });
    const unavailDest = paidDest({
      id: "unavail-1",
      admission: unavailableFact(),
    });
    const cost = calculateGeneratedPlanCost(
      makeMultiPlan([paidDest2, unavailDest]),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.satisfied).toBe(true);
    expect(cost.admission.knownNumeric).toBe(true);
    expect(cost.knownSubtotal[0]).toBeGreaterThan(1500);
    expect(cost.knownSubtotal[1]).toBeGreaterThan(cost.knownSubtotal[0]);
    expect(cost.assumptions.some((a) => a.destinationId === "unavail-1")).toBe(
      true,
    );
  });

  it("E) documented estimate + zero legs → complete + confidence estimated (retain)", () => {
    const dest = paidDest({
      admission: {
        state: "documented_estimate",
        provenance: "model",
        cost: { kind: "bounded", min: 1800, max: 2200 },
        scope: "general_entry",
      },
    });
    const cost = calculateGeneratedPlanCost(
      makeZeroLegPlan(dest),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.source).toBe("estimated");
    expect(cost.admission.semanticState).toBe("estimated");
    expect(cost.confidence).toBe("estimated");
    expect(cost.knownSubtotal[0]).toBeGreaterThan(1800);
    expect(cost.knownSubtotal[1]).toBeGreaterThan(cost.knownSubtotal[0]);
  });

  it("F) all applicable admission free → verified_free", () => {
    const freeDest1 = paidDest({ id: "free-1", admission: freeFact() });
    const freeDest2 = paidDest({ id: "free-2", admission: freeFact() });
    const cost = calculateGeneratedPlanCost(
      makeMultiPlan([freeDest1, freeDest2]),
      1,
      "train",
      false,
    );
    expect(cost.admission.semanticState).toBe("verified_free");
    expect(cost.admission.satisfied).toBe(true);
    expect(cost.admission.min).toBe(0);
    expect(cost.admission.max).toBe(0);
  });
});

// ── KAI-219A FINAL N/A numeric-total guard regressions ──────────────────────
describe("KAI-219A final — hasNumericTotal guard", () => {
  function paidDest(overrides: Partial<Destination> = {}): Destination {
    return {
      ...BASE_DEST,
      budgetMetadata: { method: "unknown" },
      ...overrides,
    } as unknown as Destination;
  }

  type AdmissionOverride = NonNullable<Destination["admission"]>;

  function notApplicableFact(): AdmissionOverride {
    return {
      state: "not_applicable",
      provenance: "none",
      reasonCode: "hub_budget_not_applicable",
      cost: { kind: "not_applicable" },
      scope: "general_entry",
    } as AdmissionOverride;
  }

  function verifiedPaidFact(amount: number): AdmissionOverride {
    return {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: amount, max: amount },
      scope: "general_entry",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-01-01",
    } as AdmissionOverride;
  }

  function freeFact(): AdmissionOverride {
    return {
      state: "verified_free",
      provenance: "verified_source",
      basis: "The garden is free to enter",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: "general_entry",
      sourceUrls: ["https://example.com"],
      checkedAt: "2026-01-01",
    } as AdmissionOverride;
  }

  function unavailableFact(): AdmissionOverride {
    return {
      state: "unavailable",
      provenance: "none",
      reasonCode: "legacy_provenance_unrecovered",
      cost: {
        kind: "unavailable",
        reason: "legacy_provenance_unrecovered",
      },
      scope: "general_entry",
    } as AdmissionOverride;
  }

  function zeroLegPlan(dest: Destination): DayPlan {
    return { ...makePlan(dest), routeLegs: [] };
  }

  it("A) N/A admission + zero route legs still has a numeric modeled total", () => {
    const dest = paidDest({ admission: notApplicableFact() });
    const cost = calculateGeneratedPlanCost(
      zeroLegPlan(dest),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.semanticState).toBe("not_applicable");
    expect(cost.hasNumericTotal).toBe(true);
    expect(cost.knownSubtotal[0]).toBeGreaterThan(0);
  });

  it("B) verified free + zero legs → complete → hasNumericTotal TRUE ([0,0] is a legitimate verified zero)", () => {
    const dest = paidDest({ admission: freeFact() });
    const cost = calculateGeneratedPlanCost(
      zeroLegPlan(dest),
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.admission.semanticState).toBe("verified_free");
    expect(cost.hasNumericTotal).toBe(true);
  });

  it("C) N/A + paid ¥1,500 → complete → hasNumericTotal TRUE → ¥1,500", () => {
    const naDest = paidDest({ id: "na-1", admission: notApplicableFact() });
    const paidDest2 = paidDest({
      id: "paid-1",
      admission: verifiedPaidFact(1500),
    });
    const cost = calculateGeneratedPlanCost(
      {
        ...makePlan(naDest),
        routeLegs: [],
        steps: [makePlan(naDest).steps[0], makePlan(paidDest2).steps[0]],
      },
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.hasNumericTotal).toBe(true);
    expect(cost.knownSubtotal[0]).toBeGreaterThan(1500);
    expect(cost.knownSubtotal[1]).toBeGreaterThan(cost.knownSubtotal[0]);
  });

  it("D) verified + unavailable → complete modeled total", () => {
    const paidDest2 = paidDest({
      id: "paid-1",
      admission: verifiedPaidFact(1500),
    });
    const unavailDest = paidDest({
      id: "unavail-1",
      admission: unavailableFact(),
    });
    const cost = calculateGeneratedPlanCost(
      {
        ...makePlan(paidDest2),
        routeLegs: [],
        steps: [makePlan(paidDest2).steps[0], makePlan(unavailDest).steps[0]],
      },
      1,
      "train",
      false,
    );
    expect(cost.completeness).toBe("complete");
    expect(cost.hasNumericTotal).toBe(true);
    expect(cost.knownSubtotal[0]).toBeGreaterThan(1500);
    expect(cost.knownSubtotal[1]).toBeGreaterThan(cost.knownSubtotal[0]);
    expect(cost.totalRange).toBeDefined();
  });
});
