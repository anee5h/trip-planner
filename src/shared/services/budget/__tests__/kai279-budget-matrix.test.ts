/**
 * KAI-279 required unit matrix — canonical budget-constraint semantics.
 * Uses actual canonical types/functions (budgetConstraint, planner policy,
 * TripEstimateEngine classifiers, TripContext / destinationSearchParams).
 */
import { describe, expect, it } from "vitest";
import { getPlannerBudgetLimit } from "@/features/home/services/PlannerBudgetPolicy";
import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";
import {
  budgetCapYen,
  budgetConstraintKey,
  parseCustomBudgetInput,
  presetCapYen,
  resolveBudgetConstraint,
} from "@/shared/services/budget/budgetConstraint";
import {
  evaluateAffordability,
  evaluateBudgetAffordability,
  ACCOMMODATION_PROFILES,
  type TripEstimateResult,
} from "@/shared/services/budget/tripEstimateEngine";
import { tripContextFromSearchParams } from "@/shared/context/TripContext";
import { parseDestinationSearchParams } from "@/features/destinations/destinationSearchParams";

const PRESETS = ["economy", "standard", "comfortable"] as const;

function completeResult(
  min: number,
  max: number,
): Pick<TripEstimateResult, "total" | "knownSubtotal" | "completeness"> {
  return {
    total: { kind: "bounded", min, max },
    knownSubtotal: [min, max],
    completeness: "complete",
  };
}

describe("KAI-279 presets", () => {
  it("Any / flexible resolve to NO cap", () => {
    expect(resolveBudgetConstraint({ kind: "any", tier: "any" })).toEqual({
      kind: "none",
    });
    expect(
      resolveBudgetConstraint({ kind: "cap", cap: Infinity, tier: "luxury" }),
    ).toEqual({
      kind: "none",
    });
    expect(budgetCapYen({ kind: "any" })).toBeUndefined();
    expect(budgetConstraintKey({ kind: "any" })).toBe("none");
  });

  it("economy/standard/comfortable map to the canonical verified caps", () => {
    expect(presetCapYen("economy")).toBe(50000);
    expect(presetCapYen("standard")).toBe(100000);
    expect(presetCapYen("comfortable")).toBe(200000);
    expect(BUDGET_TIER_LIMITS.economy).toBe(50000);
    expect(BUDGET_TIER_LIMITS.standard).toBe(100000);
    expect(BUDGET_TIER_LIMITS.comfortable).toBe(200000);
  });

  it("caps never scale with party size or duration", () => {
    const durations = ["shortOuting", "halfDay", "fullDay", "2d1n", "3d2n"];
    for (const preset of PRESETS) {
      const flat = getPlannerBudgetLimit(preset, 2, "fullDay");
      for (const party of [1, 2, 4]) {
        for (const duration of durations) {
          expect(getPlannerBudgetLimit(preset, party, duration)).toBe(flat);
        }
      }
    }
    expect(getPlannerBudgetLimit("luxury", 4, "3d2n")).toBe(Infinity);
  });
});

describe("KAI-279 custom cap", () => {
  it("custom ¥80,000 is exactly ¥80,000 at every party size and duration", () => {
    const custom = { kind: "cap", cap: 80000 } as const;
    expect(budgetCapYen(custom)).toBe(80000);
    expect(resolveBudgetConstraint(custom)).toEqual({
      kind: "custom",
      capYen: 80000,
    });
    for (const party of [1, 2, 4]) {
      for (const duration of ["halfDay", "fullDay", "2d1n", "3d2n"]) {
        const parsed = tripContextFromSearchParams(
          new URLSearchParams(
            `partySize=${party}&duration=${duration}&budget=80000`,
          ),
        );
        expect(budgetCapYen(parsed.budget)).toBe(80000);
      }
    }
  });

  it("invalid custom input never becomes ¥0 and never commits", () => {
    expect(parseCustomBudgetInput("")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("0")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("-5")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("abc")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("1.5")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("1e5")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("Infinity")).toEqual({ kind: "invalid" });
    expect(parseCustomBudgetInput("99999999999999999999")).toEqual({
      kind: "invalid",
    });
    expect(parseCustomBudgetInput("80,000")).toEqual({
      kind: "valid",
      capYen: 80000,
    });
    expect(parseCustomBudgetInput("80000")).toEqual({
      kind: "valid",
      capYen: 80000,
    });
  });

  it("party 2 -> 4 preserves an ¥80,000 custom cap", () => {
    const two = tripContextFromSearchParams(
      new URLSearchParams("partySize=2&budget=80000"),
    ).budget;
    const four = tripContextFromSearchParams(
      new URLSearchParams("partySize=4&budget=80000"),
    ).budget;
    expect(budgetCapYen(two)).toBe(80000);
    expect(budgetCapYen(four)).toBe(80000);
    expect(budgetConstraintKey(two)).toBe(budgetConstraintKey(four));
  });

  it("Explore parse round-trips a custom numeric budget exactly", () => {
    const state = parseDestinationSearchParams(
      new URLSearchParams("budgetTier=standard&budget=80000&partySize=2"),
    );
    expect(state.budgetTier).toBe("standard");
    expect(state.maxBudget).toBe(80000);
  });
});

describe("KAI-279 range classification (canonical classifiers)", () => {
  const C = 80000;
  it("[40k,60k] under 80k -> below / fits", () => {
    expect(evaluateAffordability(completeResult(40000, 60000), C)).toBe("fits");
    expect(evaluateBudgetAffordability(completeResult(40000, 60000), C)).toBe(
      "fits",
    );
  });
  it("[60k,100k] straddles 80k -> may_exceed / exceeds", () => {
    expect(evaluateAffordability(completeResult(60000, 100000), C)).toBe(
      "may_exceed",
    );
    expect(evaluateBudgetAffordability(completeResult(60000, 100000), C)).toBe(
      "exceeds",
    );
  });
  it("[90k,120k] above 80k -> over / exceeds", () => {
    expect(evaluateAffordability(completeResult(90000, 120000), C)).toBe(
      "over",
    );
    expect(evaluateBudgetAffordability(completeResult(90000, 120000), C)).toBe(
      "exceeds",
    );
  });
  it("partial mandatory cost -> uncertain / partial (never confident within)", () => {
    const partial: Pick<
      TripEstimateResult,
      "total" | "knownSubtotal" | "completeness"
    > = {
      total: undefined,
      knownSubtotal: [40000, 50000],
      completeness: "partial",
    };
    expect(evaluateAffordability(partial, C)).toBe("unknown");
    expect(evaluateBudgetAffordability(partial, C)).toBe("partial");
    const noBudget = evaluateAffordability(
      completeResult(40000, 60000),
      undefined,
    );
    expect(noBudget).toBe("unknown");
  });
});

describe("KAI-279 overnight / duration semantics", () => {
  it("2D1N and 3D2N keep the SAME flat party-total cap", () => {
    expect(getPlannerBudgetLimit("standard", 2, "2d1n")).toBe(100000);
    expect(getPlannerBudgetLimit("standard", 4, "3d2n")).toBe(100000);
    const ctx2d = tripContextFromSearchParams(
      new URLSearchParams("duration=2d1n&partySize=2&budgetTier=standard"),
    );
    expect(budgetCapYen(ctx2d.budget)).toBe(100000);
  });

  it("accommodation stays canonical party-total-per-night, never doubled by party", () => {
    // ACCOMMODATION_PROFILES is a party-total per-night profile and remains
    // untouched by KAI-279 (no hotel-cost selector, no per-person scaling).
    expect(ACCOMMODATION_PROFILES.standard).toEqual([10000, 22000]);
    expect(ACCOMMODATION_PROFILES.economy).toEqual([6000, 12000]);
    expect(ACCOMMODATION_PROFILES.comfortable).toEqual([18000, 40000]);
  });
});

describe("KAI-279 context persistence contract", () => {
  it("Home->Explore style URLs preserve preset AND custom constraints", () => {
    const preset = tripContextFromSearchParams(
      new URLSearchParams("budgetTier=economy&budget=50000"),
    ).budget;
    expect(preset).toEqual({ kind: "cap", cap: 50000, tier: "economy" });
    const custom = tripContextFromSearchParams(
      new URLSearchParams("budgetTier=standard&budget=80000"),
    ).budget;
    expect(custom).toEqual({ kind: "cap", cap: 80000, tier: "standard" });
  });

  it("tier identity is preserved so presets survive round-trips as presets", () => {
    const standard = tripContextFromSearchParams(
      new URLSearchParams("budgetTier=standard&budget=100000"),
    ).budget;
    expect(resolveBudgetConstraint(standard)).toEqual({
      kind: "preset",
      preset: "standard",
      capYen: 100000,
    });
    const custom = tripContextFromSearchParams(
      new URLSearchParams("budgetTier=standard&budget=80000"),
    ).budget;
    expect(resolveBudgetConstraint(custom)).toEqual({
      kind: "custom",
      capYen: 80000,
    });
  });
});

describe("KAI-279 preset tier set sanity", () => {
  it("luxury is never a preset constraint (flexible)", () => {
    const tier: BudgetTier = "luxury";
    expect(BUDGET_TIER_LIMITS[tier]).toBe(Infinity);
    expect(presetCapYen(tier)).toBe(Infinity);
    expect(
      resolveBudgetConstraint({ kind: "cap", cap: Infinity, tier: "luxury" }),
    ).toEqual({ kind: "none" });
  });
});
