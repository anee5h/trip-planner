import { describe, expect, it } from "vitest";
import type { TripBudget } from "@/shared/context/TripContext";
import type { BudgetTier } from "@/shared/types/planner";
import {
  budgetCapYen,
  budgetConstraintKey,
  presetCapYen,
  resolveBudgetConstraint,
} from "../budgetConstraint";

function budget(tier: BudgetTier, cap?: number): TripBudget {
  return cap === undefined
    ? { kind: "cap", cap: 0, tier }
    : { kind: "cap", cap, tier };
}

describe("KAI-279 canonical budget constraint resolver", () => {
  it("Any / undefined / flexible resolve to NO constraint", () => {
    expect(resolveBudgetConstraint({ kind: "any", tier: "any" })).toEqual({
      kind: "none",
    });
    expect(resolveBudgetConstraint(undefined)).toEqual({ kind: "none" });
    expect(
      resolveBudgetConstraint({ kind: "cap", cap: Infinity, tier: "luxury" }),
    ).toEqual({
      kind: "none",
    });
    expect(budgetCapYen({ kind: "any", tier: "any" })).toBeUndefined();
    expect(budgetCapYen(undefined)).toBeUndefined();
  });

  it("preset caps equal the canonical flat party-total ceilings", () => {
    expect(presetCapYen("economy")).toBe(50000);
    expect(presetCapYen("standard")).toBe(100000);
    expect(presetCapYen("comfortable")).toBe(200000);
    expect(presetCapYen("luxury")).toBe(Infinity);
  });

  it("a cap that equals its tier ceiling is a preset", () => {
    expect(resolveBudgetConstraint(budget("economy", 50000))).toEqual({
      kind: "preset",
      preset: "economy",
      capYen: 50000,
    });
    expect(resolveBudgetConstraint(budget("standard", 100000))).toEqual({
      kind: "preset",
      preset: "standard",
      capYen: 100000,
    });
    expect(resolveBudgetConstraint(budget("comfortable", 200000))).toEqual({
      kind: "preset",
      preset: "comfortable",
      capYen: 200000,
    });
  });

  it("a cap that differs from its tier ceiling is a CUSTOM party-total cap", () => {
    expect(resolveBudgetConstraint(budget("standard", 80000))).toEqual({
      kind: "custom",
      capYen: 80000,
    });
    expect(resolveBudgetConstraint({ kind: "cap", cap: 80000 })).toEqual({
      kind: "custom",
      capYen: 80000,
    });
    // A custom ¥100,000 happens to equal the Standard ceiling, so it is
    // semantically a Standard preset cap — identical constraint.
    expect(resolveBudgetConstraint(budget("standard", 100000)).kind).toBe(
      "preset",
    );
  });

  it("budgetCapYen is a flat party-total cap: identical for every party/duration call", () => {
    const custom: TripBudget = { kind: "cap", cap: 80000 };
    const preset: TripBudget = { kind: "cap", cap: 50000, tier: "economy" };
    for (let i = 0; i < 4; i += 1) {
      expect(budgetCapYen(custom)).toBe(80000);
      expect(budgetCapYen(preset)).toBe(50000);
    }
  });

  it("budgetConstraintKey distinguishes none / preset / custom identity", () => {
    expect(budgetConstraintKey({ kind: "any" })).toBe("none");
    expect(budgetConstraintKey(budget("economy", 50000))).toBe(
      "preset:economy",
    );
    expect(budgetConstraintKey(budget("standard", 80000))).toBe("custom:80000");
    expect(budgetConstraintKey({ kind: "cap", cap: 80000 })).toBe(
      "custom:80000",
    );
  });
});
