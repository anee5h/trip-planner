import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  hasDisplayableBudget,
  hasSortableBudget,
  hasStoredNumericBudget,
  hasTrustedNumericBudget,
  isBudgetNotApplicable,
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

  it("unknown → unavailable / transitional reason (conservative)", () => {
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
  });

  it("volatile/destination-dependent basis → transitional_unclassified (NOT price_variable_by_date)", () => {
    // Blocker: "destination-dependent" does NOT establish date-variable
    // pricing. KAI-218 owns the real classification.
    const volatile = {
      ...base,
      budgetMin: undefined,
      budgetRecommended: undefined,
      budgetMax: undefined,
      budgetBreakdown: undefined,
      budgetMetadata: {
        method: "unknown",
        basis:
          "Current admission, food, and access costs are volatile or destination-dependent",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(volatile);
    expect(s.state).toBe("unavailable");
    expect(s.reasonCode).toBe("transitional_unclassified");
    expect(s.reasonCode).not.toBe("price_variable_by_date");
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
    expect(hasStoredNumericBudget(d)).toBe(true); // storage has numbers
    expect(hasDisplayableBudget(d)).toBe(false); // but NOT displayable
    expect(hasSortableBudget(d)).toBe(false); // and NOT sortable
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

describe("KAI-214 Blocker 2 — stored vs displayable budget", () => {
  it("legacy numeric → stored true, displayable FALSE", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "legacy",
        confidence: "unknown",
        basis: "legacy numeric budget without recoverable provenance",
      },
    } as unknown as Destination;
    expect(hasStoredNumericBudget(d)).toBe(true);
    expect(hasDisplayableBudget(d)).toBe(false);
    expect(hasSortableBudget(d)).toBe(false);
  });

  it("absent numeric → stored true, displayable FALSE", () => {
    const d = { ...base } as unknown as Destination; // no budgetMetadata
    expect(hasStoredNumericBudget(d)).toBe(true);
    expect(hasDisplayableBudget(d)).toBe(false);
  });

  it("manual verified numeric → displayable TRUE", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket ¥1500 (ledger LEDGER_VERIFIED)",
      },
    } as unknown as Destination;
    expect(hasDisplayableBudget(d)).toBe(true);
    expect(hasStoredNumericBudget(d)).toBe(true);
  });

  it("model numeric → displayable TRUE (trusted estimate)", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "model",
        modelVersion: "budget-model-v1",
        confidence: "low",
        basis: "peer cell n=8",
      },
    } as unknown as Destination;
    expect(hasDisplayableBudget(d)).toBe(true);
    expect(hasSortableBudget(d)).toBe(true);
  });

  it("unknown numeric (if it existed) → displayable FALSE", () => {
    const d = {
      ...base,
      budgetMetadata: { method: "unknown" },
    } as unknown as Destination;
    expect(hasDisplayableBudget(d)).toBe(false);
  });
});

describe("KAI-214 Blocker 3 — verified free requires real evidence", () => {
  it("manual tickets=0 basis='ticket component unavailable' → NOT free", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "ticket component unavailable",
      },
    } as unknown as Destination;
    expect(isVerifiedFree(d)).toBe(false);
    expect(normalizeBudgetState(d).state).not.toBe("verified_free");
  });

  it("manual tickets=0 basis='optional activities priced separately' → NOT free", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "optional activities priced separately",
      },
    } as unknown as Destination;
    expect(isVerifiedFree(d)).toBe(false);
  });

  it("manual tickets=0 basis='not free; admission applies' → NOT free", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "not free; admission applies",
      },
    } as unknown as Destination;
    expect(isVerifiedFree(d)).toBe(false);
  });

  it("verified explicit free evidence → free (EN)", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis:
          "verified free admission (ledger FREE_ENTRY); source: official site",
      },
    } as unknown as Destination;
    expect(isVerifiedFree(d)).toBe(true);
  });

  it("verified explicit free evidence → free (JA 無料)", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "入場無料（公式サイト確認）",
      },
    } as unknown as Destination;
    expect(isVerifiedFree(d)).toBe(true);
  });

  it("manual tickets=0 basis with free word in negative context 'not free' → NOT free", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "not free; admission applies (tickets required)",
      },
    } as unknown as Destination;
    expect(isVerifiedFree(d)).toBe(false);
  });
});

describe("KAI-214 Blocker 4 — explicit forward states fail closed at runtime", () => {
  it("verified_paid + missing provenance → UNTRUSTED (fail closed)", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        state: "verified_paid" as const,
        // NO provenance
        basis: "verified",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.provenance).toBe("none"); // NOT derived from method
    expect(s.trustLevel).toBe("untrusted"); // fail closed
    expect(hasDisplayableBudget(d)).toBe(false);
    expect(hasTrustedNumericBudget(d)).toBe(false);
  });

  it("verified_paid + model provenance → UNTRUSTED", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "model",
        state: "verified_paid" as const,
        provenance: "model" as const,
        modelVersion: "budget-model-v1",
      },
    } as unknown as Destination;
    expect(normalizeBudgetState(d).trustLevel).toBe("untrusted");
  });

  it("documented_estimate + missing provenance → UNTRUSTED", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "model",
        state: "documented_estimate" as const,
        // NO provenance
      },
    } as unknown as Destination;
    expect(normalizeBudgetState(d).provenance).toBe("none");
    expect(normalizeBudgetState(d).trustLevel).toBe("untrusted");
  });

  it("documented_estimate + verified_source provenance → UNTRUSTED", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        state: "documented_estimate" as const,
        provenance: "verified_source" as const,
        basis: "verified",
      },
    } as unknown as Destination;
    expect(normalizeBudgetState(d).trustLevel).toBe("untrusted");
  });

  it("documented_estimate + model provenance → trusted_estimate", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "model",
        state: "documented_estimate" as const,
        provenance: "model" as const,
        modelVersion: "budget-model-v1",
      },
    } as unknown as Destination;
    expect(normalizeBudgetState(d).trustLevel).toBe("trusted_estimate");
    expect(hasDisplayableBudget(d)).toBe(true);
  });

  it("verified_free + verified_source but NO free evidence → untrusted / isVerifiedFree false", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        state: "verified_free" as const,
        provenance: "verified_source" as const,
        basis: "admission costs apply",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.trustLevel).toBe("untrusted");
    expect(isVerifiedFree(d)).toBe(false);
  });
});

describe("KAI-214 semantic helper agreement invariants", () => {
  it("hasTrustedNumericBudget === hasSortableBudget for all fixture states", () => {
    const fixtures = [
      {
        ...base,
        budgetMetadata: {
          method: "manual",
          confidence: "low",
          basis: "verified ticket ¥1500",
        },
      },
      {
        ...base,
        budgetMetadata: { method: "model", modelVersion: "budget-model-v1" },
      },
      {
        ...base,
        budgetMetadata: { method: "legacy", confidence: "unknown" },
      },
      { ...base }, // absent
      {
        ...base,
        budgetMetadata: { method: "unknown" },
      },
    ] as unknown as Destination[];
    for (const d of fixtures) {
      // The two helpers must NEVER disagree (both read normalized state).
      expect(hasTrustedNumericBudget(d)).toBe(hasSortableBudget(d));
      // displayable implies sortable-capable trust (both use trustLevel)
      expect(hasDisplayableBudget(d) ? hasSortableBudget(d) : true).toBe(true);
    }
  });

  it("displayable requires trusted or trusted_estimate (never untrusted)", () => {
    const untrusted = [
      {
        ...base,
        budgetMetadata: { method: "legacy", confidence: "unknown" },
      },
      { ...base },
      {
        ...base,
        budgetMetadata: { method: "unknown" },
      },
    ] as unknown as Destination[];
    for (const d of untrusted) {
      expect(hasDisplayableBudget(d)).toBe(false);
    }
  });
});

describe("KAI-214 shared free-evidence rule (runtime/validator agreement)", () => {
  it("isVerifiedFree agrees with the shared predicate on negatives", () => {
    const cases = [
      { basis: "not free; admission applies", tickets: 0 },
      { basis: "tickets required for entry", tickets: 0 },
      { basis: "optional activities priced separately", tickets: 0 },
      { basis: "ticket component unavailable", tickets: 0 },
      { basis: "free entry for children", tickets: 1500 }, // positive ticket
    ];
    for (const { basis, tickets } of cases) {
      const d = {
        ...base,
        budgetMin: 0,
        budgetMax: 0,
        budgetBreakdown: { transport: 0, tickets, food: 0, cafe: 0 },
        budgetMetadata: {
          method: "manual",
          state: "verified_free" as const,
          provenance: "verified_source" as const,
          basis,
        },
      } as unknown as Destination;
      // Runtime helper AND normalizer both refuse.
      expect(isVerifiedFree(d), basis).toBe(false);
      expect(normalizeBudgetState(d).trustLevel, basis).toBe("untrusted");
    }
  });

  it("isVerifiedFree agrees with the shared predicate on positives (EN + JA)", () => {
    const cases = [
      { basis: "free admission (ledger FREE_ENTRY)", tickets: 0 },
      { basis: "入場無料（公式サイト確認）", tickets: 0 },
      { basis: "no admission fee; open access", tickets: 0 },
      { basis: "無料開放", tickets: 0 },
    ];
    for (const { basis, tickets } of cases) {
      const d = {
        ...base,
        budgetMin: 0,
        budgetMax: 0,
        budgetBreakdown: { transport: 0, tickets, food: 0, cafe: 0 },
        budgetMetadata: {
          method: "manual",
          state: "verified_free" as const,
          provenance: "verified_source" as const,
          basis,
        },
      } as unknown as Destination;
      expect(isVerifiedFree(d), basis).toBe(true);
      expect(normalizeBudgetState(d).trustLevel, basis).toBe("trusted");
    }
  });
});

describe("KAI-214 validator/runtime numeric-shape agreement (final blocker)", () => {
  it("CI-valid numeric shapes always report hasNumericRange || hasBreakdown at runtime", () => {
    // If the CI invariant passes (valid range or complete breakdown), the
    // runtime normalizer MUST report a consumable numeric shape — this
    // prevents validator/runtime drift.
    const validShapes = [
      { budgetMin: 1000, budgetMax: 3000 },
      {
        budgetBreakdown: {
          transport: 500,
          tickets: 1000,
          food: 300,
          cafe: 200,
        },
      },
      {
        budgetMin: 1000,
        budgetRecommended: 2000,
        budgetMax: 3000,
        budgetBreakdown: {
          transport: 500,
          tickets: 1000,
          food: 300,
          cafe: 200,
        },
      },
    ];
    for (const shape of validShapes) {
      const d = {
        ...base,
        ...shape,
        budgetMetadata: {
          method: "manual",
          state: "verified_paid" as const,
          provenance: "verified_source" as const,
          confidence: "low",
          basis: "verified ticket ¥1500",
        },
      } as unknown as Destination;
      const s = normalizeBudgetState(d);
      expect(s.hasNumericRange || s.hasBreakdown, JSON.stringify(shape)).toBe(
        true,
      );
      expect(hasDisplayableBudget(d), JSON.stringify(shape)).toBe(true);
    }
  });

  it("CI-invalid shapes (presence without shape) report NO consumable numeric at runtime", () => {
    // The blocker case: a lone budgetMin looks present but is not a valid
    // shape — runtime must agree it is NOT consumable.
    const cleared = {
      budgetMin: undefined,
      budgetRecommended: undefined,
      budgetMax: undefined,
      budgetBreakdown: undefined,
    };
    const invalidShapes = [
      { budgetMin: 1200 },
      { budgetMax: 3000 },
      { budgetRecommended: 2000 },
      { budgetBreakdown: { transport: 500, tickets: 1500 } }, // partial
      { budgetMin: 5000, budgetMax: 1000 }, // inverted
    ];
    for (const shape of invalidShapes) {
      const d = {
        ...base,
        ...cleared,
        ...shape,
        budgetMetadata: {
          method: "manual",
          state: "verified_paid" as const,
          provenance: "verified_source" as const,
          confidence: "low",
          basis: "verified ticket ¥1500",
        },
      } as unknown as Destination;
      const s = normalizeBudgetState(d);
      expect(s.hasNumericRange || s.hasBreakdown, JSON.stringify(shape)).toBe(
        false,
      );
      expect(hasDisplayableBudget(d), JSON.stringify(shape)).toBe(false);
    }
  });
});
