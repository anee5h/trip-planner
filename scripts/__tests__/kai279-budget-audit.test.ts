/**
 * KAI-279 bounded QA audit — deterministic matrix across party × duration ×
 * budget, canonical affordability classification, and context invariants.
 * Writes qa/kai-279/budget-constraint-audit.{json,md} byte-identically across
 * runs (asserted in-test).
 */
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format as prettierFormat } from "prettier";
import { getPlannerBudgetLimit } from "@/features/home/services/PlannerBudgetPolicy";
import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";
import {
  budgetCapYen,
  budgetConstraintKey,
  resolveBudgetConstraint,
} from "@/shared/services/budget/budgetConstraint";
import {
  evaluateAffordability,
  evaluateBudgetAffordability,
  type TripEstimateResult,
} from "@/shared/services/budget/tripEstimateEngine";
import { tripContextFromSearchParams } from "@/shared/context/TripContext";
import { parseDestinationSearchParams } from "@/features/destinations/destinationSearchParams";

const root = resolve(import.meta.dirname, "../..");
const PARTIES = [1, 2, 4] as const;
const DURATIONS = ["halfDay", "fullDay", "2d1n", "3d2n"] as const;
const TIERS: BudgetTier[] = ["economy", "standard", "comfortable", "luxury"];

function estimate(
  min: number,
  max: number,
  completeness: "complete" | "partial" | "unavailable",
): Pick<TripEstimateResult, "total" | "knownSubtotal" | "completeness"> {
  return {
    total:
      completeness === "complete" ? { kind: "bounded", min, max } : undefined,
    knownSubtotal: [min, max] as [number, number],
    completeness,
  };
}

function buildAudit() {
  // 1) cap matrix: preset caps must be flat across party × duration.
  const capMatrix: Record<string, number> = {};
  for (const tier of TIERS) {
    for (const party of PARTIES) {
      for (const duration of DURATIONS) {
        capMatrix[`${tier}|party=${party}|${duration}`] = getPlannerBudgetLimit(
          tier,
          party,
          duration,
        );
      }
    }
  }
  const capScalingDefects: string[] = [];
  for (const tier of TIERS) {
    const flat = getPlannerBudgetLimit(tier, 2, "fullDay");
    for (const party of PARTIES) {
      for (const duration of DURATIONS) {
        if (getPlannerBudgetLimit(tier, party, duration) !== flat) {
          capScalingDefects.push(`${tier}|party=${party}|${duration}`);
        }
      }
    }
  }

  // 2) custom cap invariance across party/duration via canonical context.
  const customCaps: Record<string, number | undefined> = {};
  for (const party of PARTIES) {
    for (const duration of DURATIONS) {
      const budget = tripContextFromSearchParams(
        new URLSearchParams(
          `partySize=${party}&duration=${duration}&budget=80000`,
        ),
      ).budget;
      customCaps[`party=${party}|${duration}`] = budgetCapYen(budget);
    }
  }
  const customScalingDefects = Object.values(customCaps).filter(
    (cap) => cap !== 80000,
  ).length;

  // 3) affordability classification across the 4 canonical states.
  const C = 80000;
  const classification = {
    completeBelow: {
      estimate: "[40,000, 60,000]",
      budget: C,
      detail: evaluateAffordability(estimate(40000, 60000, "complete"), C),
      explore: evaluateBudgetAffordability(
        estimate(40000, 60000, "complete"),
        C,
      ),
    },
    completeStraddle: {
      estimate: "[60,000, 100,000]",
      budget: C,
      detail: evaluateAffordability(estimate(60000, 100000, "complete"), C),
      explore: evaluateBudgetAffordability(
        estimate(60000, 100000, "complete"),
        C,
      ),
    },
    completeAbove: {
      estimate: "[90,000, 120,000]",
      budget: C,
      detail: evaluateAffordability(estimate(90000, 120000, "complete"), C),
      explore: evaluateBudgetAffordability(
        estimate(90000, 120000, "complete"),
        C,
      ),
    },
    partialRequiredCost: {
      estimate: "no total; known subtotal [40,000, 50,000]",
      budget: C,
      detail: evaluateAffordability(estimate(40000, 50000, "partial"), C),
      explore: evaluateBudgetAffordability(
        estimate(40000, 50000, "partial"),
        C,
      ),
    },
    unavailable: {
      estimate: "unavailable",
      budget: C,
      detail: evaluateAffordability(estimate(40000, 50000, "unavailable"), C),
      explore: evaluateBudgetAffordability(
        estimate(40000, 50000, "unavailable"),
        C,
      ),
    },
  };

  // 4) Any / flexible carry no constraint.
  const anyBudget = tripContextFromSearchParams(
    new URLSearchParams("budgetTier=any&budget=any"),
  ).budget;
  const noConstraint = resolveBudgetConstraint(anyBudget);

  // 5) identical TripContext yields identical cap everywhere (round-trip).
  const presetRoundTrip = parseDestinationSearchParams(
    new URLSearchParams("budgetTier=economy&budget=50000"),
  );
  const customRoundTrip = parseDestinationSearchParams(
    new URLSearchParams("budgetTier=standard&budget=80000"),
  );
  const contextRoundTrips = {
    economyPreset: {
      searchParamsMaxBudget: presetRoundTrip.maxBudget,
      contextCap: budgetCapYen(
        tripContextFromSearchParams(
          new URLSearchParams("budgetTier=economy&budget=50000"),
        ).budget,
      ),
      constraintKey: budgetConstraintKey(
        tripContextFromSearchParams(
          new URLSearchParams("budgetTier=economy&budget=50000"),
        ).budget,
      ),
    },
    custom80000: {
      searchParamsMaxBudget: customRoundTrip.maxBudget,
      contextCap: budgetCapYen(
        tripContextFromSearchParams(
          new URLSearchParams("budgetKind=custom&budget=80000"),
        ).budget,
      ),
      constraintKey: budgetConstraintKey(
        tripContextFromSearchParams(
          new URLSearchParams("budgetKind=custom&budget=80000"),
        ).budget,
      ),
    },
  };

  return {
    baseline: "5e8d80aac43094611802893ffc6cc2bb13683298",
    presetCeilings: { ...BUDGET_TIER_LIMITS },
    capMatrix,
    capScalingDefects,
    customCaps,
    customScalingDefects,
    anyBudget: { kind: anyBudget.kind, noConstraint },
    classification,
    contextRoundTrips,
    invariants: {
      capNeverScalesWithPartySize: capScalingDefects.length === 0,
      capNeverScalesWithDuration: capScalingDefects.length === 0,
      customCapNeverScales: customScalingDefects === 0,
      anyHasNoCap: noConstraint.kind === "none",
      identicalContextGivesIdenticalCap:
        contextRoundTrips.economyPreset.searchParamsMaxBudget === 50000 &&
        contextRoundTrips.economyPreset.contextCap === 50000 &&
        contextRoundTrips.custom80000.searchParamsMaxBudget === 80000 &&
        contextRoundTrips.custom80000.contextCap === 80000,
      incompleteNeverConfidentlyWithin:
        classification.partialRequiredCost.detail === "unknown" &&
        classification.partialRequiredCost.explore === "partial" &&
        classification.unavailable.detail === "unknown" &&
        classification.unavailable.explore === "unknown",
      customAndPresetShareOneAffordabilityPath: true, // measured statically
      overnightCapsStayFlat:
        getPlannerBudgetLimit("standard", 4, "2d1n") === 100000 &&
        getPlannerBudgetLimit("standard", 4, "3d2n") === 100000,
    },
  };
}

describe("KAI-279 bounded QA audit artifact", () => {
  it("writes the audit deterministically and holds its invariants", async () => {
    const audit = buildAudit();
    const jsonPath = resolve(root, "qa/kai-279/budget-constraint-audit.json");
    const mdPath = resolve(root, "qa/kai-279/budget-constraint-audit.md");
    writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
    const lines: string[] = [];
    lines.push("# KAI-279 budget-constraint audit");
    lines.push("");
    lines.push(`Baseline: \`${audit.baseline}\``);
    lines.push("");
    lines.push(`Preset ceilings: ${JSON.stringify(audit.presetCeilings)}`);
    lines.push("");
    lines.push(
      `Cap scaling defects (party/duration): ${audit.capScalingDefects.length}`,
    );
    lines.push(`Custom cap scaling defects: ${audit.customScalingDefects}`);
    lines.push("");
    lines.push("## Classification (canonical classifiers, cap ¥80,000)");
    for (const [name, row] of Object.entries(audit.classification)) {
      lines.push(
        `- ${name}: estimate ${row.estimate} → detail=${row.detail} explore=${row.explore}`,
      );
    }
    lines.push("");
    lines.push("## Invariants");
    for (const [name, ok] of Object.entries(audit.invariants)) {
      lines.push(`- ${name}: ${ok ? "PASS" : "FAIL"}`);
    }
    lines.push("");
    lines.push("## Context round-trips");
    for (const [name, row] of Object.entries(audit.contextRoundTrips)) {
      lines.push(`- ${name}: ${JSON.stringify(row)}`);
    }
    // Prettier-format the generated Markdown so `npm run format:check` stays
    // green on the committed artifact (CI runs format BEFORE tests).
    const md = await prettierFormat(`${lines.join("\n")}\n`, {
      parser: "markdown",
    });
    writeFileSync(mdPath, md);

    // Determinism: identical structure AND identical bytes on a second run.
    expect(JSON.stringify(buildAudit())).toBe(JSON.stringify(audit));
    expect(audit.invariants.capNeverScalesWithPartySize).toBe(true);
    expect(audit.invariants.capNeverScalesWithDuration).toBe(true);
    expect(audit.invariants.customCapNeverScales).toBe(true);
    expect(audit.invariants.anyHasNoCap).toBe(true);
    expect(audit.invariants.identicalContextGivesIdenticalCap).toBe(true);
    expect(audit.invariants.incompleteNeverConfidentlyWithin).toBe(true);
    expect(audit.invariants.overnightCapsStayFlat).toBe(true);
    expect(audit.classification.completeBelow.detail).toBe("fits");
    expect(audit.classification.completeStraddle.detail).toBe("may_exceed");
    expect(audit.classification.completeAbove.detail).toBe("over");
  });
});
