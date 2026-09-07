/**
 * KAI-279 Phase-0 reproduction (deterministic). Captures current-main budget
 * behavior across party/duration/tier and the parse contracts, then writes
 * qa/kai-279/before-reproduction.json byte-identically.
 */
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPlannerBudgetLimit } from "@/features/home/services/PlannerBudgetPolicy";
import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";
import { parseDestinationSearchParams } from "@/features/destinations/destinationSearchParams";
import { tripContextFromSearchParams } from "@/shared/context/TripContext";
import { evaluateBudgetAffordability } from "@/shared/services/budget/tripEstimateEngine";

const root = resolve(import.meta.dirname, "../..");
const tiers: BudgetTier[] = ["economy", "standard", "comfortable", "luxury"];
const durations = ["shortOuting", "halfDay", "fullDay", "1d1n", "2d1n", "3d2n"];

function buildReport() {
  const scaledLimits: Record<string, number> = {};
  for (const tier of tiers) {
    for (const party of [1, 2, 4]) {
      for (const duration of durations) {
        scaledLimits[`${tier}|party=${party}|${duration}`] =
          getPlannerBudgetLimit(tier, party, duration);
      }
    }
  }

  const parseCases: Record<string, unknown> = {};
  for (const [name, query] of [
    ["any", "budgetTier=any"],
    ["economy", "budgetTier=economy"],
    ["standard", "budgetTier=standard"],
    ["comfortable", "budgetTier=comfortable"],
    ["custom-80000", "budgetTier=standard&budget=80000"],
    ["custom-80000-notier", "budget=80000"],
    ["flexible", "budgetTier=flexible"],
  ]) {
    const state = parseDestinationSearchParams(new URLSearchParams(query));
    parseCases[name] = {
      budgetTier: state.budgetTier,
      maxBudget: state.maxBudget,
    };
  }

  const tripContextCases: Record<string, unknown> = {};
  for (const [name, query] of [
    ["any", "budgetTier=any"],
    ["economy-tier-only", "budgetTier=economy"],
    ["standard-tier-only", "budgetTier=standard"],
    ["comfortable-tier-only", "budgetTier=comfortable"],
    ["custom-80000", "budget=80000"],
    ["custom-80000-with-tier", "budgetTier=standard&budget=80000"],
  ]) {
    tripContextCases[name] = tripContextFromSearchParams(
      new URLSearchParams(query),
    ).budget;
  }

  const syntheticEstimates = [
    { id: "below", total: { min: 40000, max: 60000 } },
    { id: "straddle", total: { min: 60000, max: 100000 } },
    { id: "above", total: { min: 90000, max: 120000 } },
  ] as const;
  const classification: Record<string, unknown> = {};
  for (const est of syntheticEstimates) {
    const base = {
      ...est,
      knownSubtotal: [est.total.min, est.total.max] as [number, number],
      completeness: "complete" as const,
    };
    classification[est.id] = {
      scaledStandard2pFullDay: evaluateBudgetAffordability(base, 100000),
      custom80000: evaluateBudgetAffordability(base, 80000),
    };
  }

  return {
    baseline: "5e8d80aac43094611802893ffc6cc2bb13683298",
    flatCeilings: { ...BUDGET_TIER_LIMITS },
    scaledLimits,
    exploreParse: parseCases,
    tripContextBudgetParse: tripContextCases,
    classificationSample: classification,
    findings: [
      "getPlannerBudgetLimit returns FLAT party-total ceilings (never scaled by party/duration).",
      "Explore numeric custom budget parses budgetTier=standard + exact maxBudget cap (custom label).",
      "TripContext tier-only parse maps to that tier's canonical flat cap (no magic 75000).",
      "Flat ceilings match KAI-220 (50000/100000/200000).",
    ],
  };
}

describe("KAI-279 phase-0 reproduction artifact", () => {
  it("writes before-reproduction.json deterministically", () => {
    const report = buildReport();
    const jsonPath = resolve(root, "qa/kai-279/before-reproduction.json");
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const again = buildReport();
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
    expect(report.flatCeilings.economy).toBe(50000);
    expect(report.flatCeilings.standard).toBe(100000);
    expect(report.flatCeilings.comfortable).toBe(200000);
    // KAI-279: caps are FLAT party-total ceilings — economy 1 person short
    // outing is ¥50,000 (never per-person 12,500).
    expect(report.scaledLimits["economy|party=1|shortOuting"]).toBe(50000);
    expect(report.scaledLimits["economy|party=4|3d2n"]).toBe(50000);
    // Tier-only URLs resolve to the tier's canonical preset.
    expect(report.tripContextBudgetParse["economy-tier-only"]).toEqual({
      kind: "preset",
      preset: "economy",
    });
  });
});
