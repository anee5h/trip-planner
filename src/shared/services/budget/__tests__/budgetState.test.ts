import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  hasDisplayableBudget,
  hasSortableBudget,
  isBudgetNotApplicable,
  isBudgetUnavailable,
  isBudgetVariable,
  isDocumentedEstimate,
  isVerifiedFree,
  normalizeBudgetState,
} from "../budgetState";

const base = {
  id: "test",
  name: "Test",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: [],
  budgetMin: 1000,
  budgetRecommended: 2000,
  budgetMax: 3000,
  budgetBreakdown: { transport: 500, tickets: 1000, food: 300, cafe: 200 },
} as unknown as Destination;

describe("KAI-214 budget-state taxonomy — normalizeBudgetState", () => {
  it("source-backed paid (manual + numbers) → verified_paid / verified_source", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket ¥1500 (ledger LEDGER_VERIFIED)",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("verified_paid");
    expect(s.provenance).toBe("verified_source");
    expect(s.trustLevel).toBe("trusted");
    expect(s.reasonCode).toBeUndefined();
  });

  it("verified free (manual + tickets=0 + free evidence) → verified_free", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetRecommended: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified free admission (ledger FREE_ENTRY)",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("verified_free");
    expect(s.trustLevel).toBe("trusted");
    expect(isVerifiedFree(d)).toBe(true);
  });

  it("model → documented_estimate / provenance model / trusted_estimate", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "model",
        modelVersion: "budget-model-v1",
        confidence: "low",
        basis: "peer cell n=8",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("documented_estimate");
    expect(s.provenance).toBe("model");
    expect(s.trustLevel).toBe("trusted_estimate");
    expect(isDocumentedEstimate(d)).toBe(true);
  });

  it("legacy → legacy_unverified / provenance legacy / untrusted", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "legacy",
        confidence: "unknown",
        basis: "legacy numeric budget without recoverable provenance",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("legacy_unverified");
    expect(s.provenance).toBe("legacy");
    expect(s.trustLevel).toBe("untrusted");
    expect(s.reasonCode).toBe("legacy_provenance_unrecovered");
  });

  it("unknown → unavailable / reason source_missing (or variable by basis)", () => {
    const d = {
      ...base,
      budgetMin: undefined,
      budgetRecommended: undefined,
      budgetMax: undefined,
      budgetBreakdown: undefined,
      budgetMetadata: {
        method: "unknown",
        basis:
          "no source-verified admission; budget returned to unknown (UNKNOWN_NOT_FREE)",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("unavailable");
    expect(s.reasonCode).toBe("source_missing");
    expect(s.trustLevel).toBe("untrusted");

    const volatile = {
      ...d,
      budgetMetadata: {
        method: "unknown",
        basis:
          "Current admission, food, and access costs are volatile or destination-dependent",
      },
    } as unknown as Destination;
    expect(normalizeBudgetState(volatile).reasonCode).toBe(
      "price_variable_by_date",
    );
    expect(isBudgetUnavailable(volatile)).toBe(true);
    expect(isBudgetVariable(volatile)).toBe(false); // state stays unavailable; reason is variable
  });

  it("absent metadata with numbers → unavailable (transitional), untrusted", () => {
    const d = {
      ...base,
      // NO budgetMetadata
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("unavailable");
    expect(s.provenance).toBe("none");
    expect(s.trustLevel).toBe("untrusted");
    expect(s.hasNumericRange).toBe(true); // numbers in storage
    expect(hasDisplayableBudget(d)).toBe(true); // storage has numbers
    expect(hasSortableBudget(d)).toBe(false); // but NOT sortable
  });

  it("explicit forward-path state overrides transitional derivation", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        state: "not_applicable" as const,
        provenance: "verified_source" as const,
        reasonCode: "hub_budget_not_applicable" as const,
        basis: "city hub — no single admission product",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("not_applicable");
    expect(isBudgetNotApplicable(d)).toBe(true);
    expect(s.trustLevel).toBe("untrusted"); // not_applicable has no numeric trust
  });

  it("explicit variable_price state with reason", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        state: "variable_price" as const,
        provenance: "verified_source" as const,
        reasonCode: "price_variable_by_product" as const,
        basis: "ticket price varies by package",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("variable_price");
    expect(isBudgetVariable(d)).toBe(true);
  });

  it("verified/model distinction survives normalization (epistemic difference)", () => {
    const verified = {
      ...base,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified",
      },
    } as unknown as Destination;
    const estimated = {
      ...base,
      budgetMetadata: { method: "model", modelVersion: "budget-model-v1" },
    } as unknown as Destination;
    const a = normalizeBudgetState(verified);
    const b = normalizeBudgetState(estimated);
    expect(a.state).toBe("verified_paid");
    expect(b.state).toBe("documented_estimate");
    expect(a.provenance).toBe("verified_source");
    expect(b.provenance).toBe("model");
    expect(a.trustLevel).toBe("trusted");
    expect(b.trustLevel).toBe("trusted_estimate");
    expect(a.state).not.toBe(b.state);
    expect(a.provenance).not.toBe(b.provenance);
  });

  it("O(1) determinism: same input → identical normalized output", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket ¥1500",
      },
    } as unknown as Destination;
    expect(normalizeBudgetState(d)).toEqual(normalizeBudgetState(d));
  });
});
