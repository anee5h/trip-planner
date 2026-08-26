import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  getEffectiveBudgetBreakdown,
  hasKnownBudget,
  hasKnownBudgetRange,
  hasTrustedBudgetProvenance,
  isFreeDestination,
} from "../BudgetService";
import {
  hasDisplayableBudget,
  hasSortableBudget,
  hasTrustedNumericBudget,
  isVerifiedFree,
  normalizeBudgetState,
} from "../budgetState";

/**
 * KAI-215 — semantic agreement tests.
 *
 * These pin the PRODUCTION budget trust helpers (BudgetService) to the
 * KAI-214 NORMALIZED semantic layer. The invariant under test:
 *
 *   trusted/displayable/sortable helpers cannot disagree;
 *   legacy/unknown/absent cannot become trusted through a downstream
 *   fallback;
 *   explicit malformed forward states fail closed;
 *   Free never comes from zero/missing data.
 */

const base = {
  id: "agreement",
  name: "Agreement",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: [],
  budgetMin: 1000,
  budgetRecommended: 2000,
  budgetMax: 3000,
  budgetBreakdown: { transport: 500, tickets: 1000, food: 300, cafe: 200 },
} as unknown as Destination;

/** A destination that fails every trust helper. */
function assertUntrusted(d: Destination, label: string) {
  const s = normalizeBudgetState(d);
  expect(s.trustLevel, `${label} trust`).toBe("untrusted");
  expect(hasTrustedNumericBudget(d), `${label} trustedNumeric`).toBe(false);
  expect(hasSortableBudget(d), `${label} sortable`).toBe(false);
  expect(hasDisplayableBudget(d), `${label} displayable`).toBe(false);
  expect(hasKnownBudget(d), `${label} hasKnownBudget`).toBe(false);
  expect(hasKnownBudgetRange(d), `${label} hasKnownBudgetRange`).toBe(false);
  expect(hasTrustedBudgetProvenance(d), `${label} trustedProvenance`).toBe(
    false,
  );
  expect(getEffectiveBudgetBreakdown(d), `${label} breakdown`).toBeNull();
  expect(isFreeDestination(d), `${label} free`).toBe(false);
  expect(isVerifiedFree(d), `${label} verifiedFree`).toBe(false);
}

/** A destination that passes every trust helper. */
function assertTrusted(d: Destination, label: string) {
  const s = normalizeBudgetState(d);
  expect(
    s.trustLevel === "trusted" || s.trustLevel === "trusted_estimate",
    `${label} trust`,
  ).toBe(true);
  expect(hasTrustedNumericBudget(d), `${label} trustedNumeric`).toBe(true);
  expect(hasSortableBudget(d), `${label} sortable`).toBe(true);
  expect(hasDisplayableBudget(d), `${label} displayable`).toBe(true);
  expect(hasKnownBudget(d), `${label} hasKnownBudget`).toBe(true);
  expect(hasKnownBudgetRange(d), `${label} hasKnownBudgetRange`).toBe(true);
  expect(hasTrustedBudgetProvenance(d), `${label} trustedProvenance`).toBe(
    true,
  );
  expect(getEffectiveBudgetBreakdown(d), `${label} breakdown`).not.toBeNull();
  expect(isFreeDestination(d), `${label} free`).toBe(false);
  expect(isVerifiedFree(d), `${label} verifiedFree`).toBe(false);
}

describe("KAI-215 semantic agreement — production helpers agree with normalizeBudgetState", () => {
  it("transitional manual verified paid → all helpers agree (trusted)", () => {
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
    assertTrusted(d, "manual verified paid");
  });

  it("transitional model estimate → trusted_estimate (sortable/displayable, not verified)", () => {
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
    assertTrusted(d, "model estimate");
  });

  it("legacy numeric → untrusted everywhere (never trusted through fallback)", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "legacy",
        confidence: "unknown",
        basis: "legacy numeric budget without recoverable provenance",
      },
    } as unknown as Destination;
    assertUntrusted(d, "legacy numeric");
  });

  it("unknown → untrusted everywhere even with numbers on the record", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "unknown",
        basis: "no source-verified admission",
      },
    } as unknown as Destination;
    assertUntrusted(d, "unknown");
  });

  it("absent metadata → untrusted everywhere even with numbers (storage ≠ trust)", () => {
    const d = { ...base } as unknown as Destination; // no budgetMetadata
    assertUntrusted(d, "absent metadata");
  });

  it("explicit verified_paid + verified_source → trusted", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        state: "verified_paid" as const,
        provenance: "verified_source" as const,
        confidence: "low",
        basis: "verified ticket ¥1500",
      },
    } as unknown as Destination;
    assertTrusted(d, "explicit verified_paid + verified_source");
  });

  it("explicit verified_paid + MISSING provenance → fail closed (untrusted)", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "manual",
        state: "verified_paid" as const,
        // NO provenance — must not be reconstructed from method
        basis: "verified",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.provenance).toBe("none"); // never derived from method
    assertUntrusted(d, "verified_paid missing provenance");
  });

  it("explicit documented_estimate + model → trusted_estimate", () => {
    const d = {
      ...base,
      budgetMetadata: {
        method: "model",
        state: "documented_estimate" as const,
        provenance: "model" as const,
        modelVersion: "budget-model-v1",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.trustLevel).toBe("trusted_estimate");
    assertTrusted(d, "documented_estimate + model");
  });

  it("explicit documented_estimate + WRONG provenance (verified_source) → fail closed", () => {
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
    assertUntrusted(d, "documented_estimate + wrong provenance");
  });

  it("explicit verified_free + verified_source + positive evidence → free and trusted", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        state: "verified_free" as const,
        provenance: "verified_source" as const,
        basis: "verified free admission (ledger FREE_ENTRY)",
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.state).toBe("verified_free");
    expect(s.trustLevel).toBe("trusted");
    expect(isVerifiedFree(d)).toBe(true);
    expect(isFreeDestination(d)).toBe(true);
    // free with a trusted zero range IS displayable/sortable (known zero).
    expect(hasDisplayableBudget(d)).toBe(true);
    expect(hasSortableBudget(d)).toBe(true);
  });

  it("explicit verified_free + NEGATIVE/no evidence → NOT free, fail closed", () => {
    const d = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        state: "verified_free" as const,
        provenance: "verified_source" as const,
        basis: "admission costs apply", // no positive free evidence
      },
    } as unknown as Destination;
    const s = normalizeBudgetState(d);
    expect(s.trustLevel).toBe("untrusted");
    expect(isVerifiedFree(d)).toBe(false);
    expect(isFreeDestination(d)).toBe(false);
    expect(hasDisplayableBudget(d)).toBe(false);
    expect(hasSortableBudget(d)).toBe(false);
  });

  it("zero/missing data never becomes Free", () => {
    // A zero range with no evidence, no metadata, and no free basis.
    const zeroNoEvidence = {
      ...base,
      budgetMin: 0,
      budgetMax: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
    } as unknown as Destination; // no budgetMetadata
    expect(isFreeDestination(zeroNoEvidence)).toBe(false);
    expect(isVerifiedFree(zeroNoEvidence)).toBe(false);
    expect(normalizeBudgetState(zeroNoEvidence).trustLevel).toBe("untrusted");

    // A free-looking keyword without evidence must NOT be free.
    const keywordOnly = {
      ...zeroNoEvidence,
      budgetMetadata: { method: "unknown", basis: "free public space" },
    } as unknown as Destination;
    expect(isFreeDestination(keywordOnly)).toBe(false);
    expect(isVerifiedFree(keywordOnly)).toBe(false);
  });

  it("helpers never disagree across the full fixture matrix", () => {
    const fixtures: Destination[] = [
      {
        ...base,
        budgetMetadata: { method: "manual", basis: "verified ticket ¥1500" },
      },
      {
        ...base,
        budgetMetadata: { method: "model", modelVersion: "budget-model-v1" },
      },
      { ...base, budgetMetadata: { method: "legacy", confidence: "unknown" } },
      { ...base }, // absent
      { ...base, budgetMetadata: { method: "unknown" } },
      {
        ...base,
        budgetMetadata: {
          method: "manual",
          state: "verified_paid" as const,
          provenance: "verified_source" as const,
          basis: "verified",
        },
      },
      {
        ...base,
        budgetMetadata: {
          method: "manual",
          state: "verified_paid" as const, // missing provenance → malformed
          basis: "verified",
        },
      },
    ] as unknown as Destination[];
    for (const d of fixtures) {
      // The three semantic helpers MUST agree with each other on every state.
      expect(hasTrustedNumericBudget(d)).toBe(hasSortableBudget(d));
      expect(hasTrustedNumericBudget(d)).toBe(hasDisplayableBudget(d));
      expect(hasKnownBudget(d)).toBe(hasTrustedNumericBudget(d));
      // hasTrustedBudgetProvenance agrees with the same normalized truth.
      expect(hasTrustedBudgetProvenance(d)).toBe(hasTrustedNumericBudget(d));
      // Free NEVER coincides with an untrusted budget.
      if (isFreeDestination(d)) {
        expect(normalizeBudgetState(d).trustLevel).not.toBe("untrusted");
        expect(isVerifiedFree(d)).toBe(true);
      }
    }
  });
});
