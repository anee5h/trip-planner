import { describe, expect, it } from "vitest";
import type { TripBudget } from "@/shared/context/TripContext";
import { tripContextFromSearchParams } from "@/shared/context/TripContext";
import type { BudgetTier } from "@/shared/types/planner";
import {
  budgetCapYen,
  budgetConstraintKey,
  classifyBudgetFit,
  parseCustomBudgetInput,
  presetCapYen,
  resolveBudgetConstraint,
} from "../budgetConstraint";
import { evaluateAffordability } from "../tripEstimateEngine";

function preset(tier: BudgetTier): TripBudget {
  return {
    kind: "preset",
    preset: tier as "economy" | "standard" | "comfortable",
  };
}
function custom(cap: number): TripBudget {
  return { kind: "custom", cap };
}
function noConstraint(): TripBudget {
  return { kind: "none" };
}

describe("KAI-279 canonical budget constraint resolver", () => {
  it("none / undefined resolve to NO constraint", () => {
    expect(resolveBudgetConstraint(noConstraint())).toEqual({ kind: "none" });
    expect(resolveBudgetConstraint(undefined)).toEqual({ kind: "none" });
    expect(budgetCapYen(noConstraint())).toBeUndefined();
    expect(budgetCapYen(undefined)).toBeUndefined();
    expect(budgetConstraintKey(noConstraint())).toBe("none");
  });

  it("preset caps equal the canonical flat party-total ceilings", () => {
    expect(presetCapYen("economy")).toBe(50000);
    expect(presetCapYen("standard")).toBe(100000);
    expect(presetCapYen("comfortable")).toBe(200000);
    expect(presetCapYen("luxury")).toBe(Infinity);
    expect(resolveBudgetConstraint(preset("economy"))).toEqual({
      kind: "preset",
      preset: "economy",
      capYen: 50000,
    });
    expect(resolveBudgetConstraint(preset("standard"))).toEqual({
      kind: "preset",
      preset: "standard",
      capYen: 100000,
    });
    expect(resolveBudgetConstraint(preset("comfortable"))).toEqual({
      kind: "preset",
      preset: "comfortable",
      capYen: 200000,
    });
  });

  it("custom is FIRST CLASS: a cap that equals a preset ceiling is still Custom", () => {
    // Standard -> Custom ¥100,000 must stay Custom, never silently Standard.
    const c = custom(100000);
    expect(resolveBudgetConstraint(c)).toEqual({
      kind: "custom",
      capYen: 100000,
    });
    expect(budgetConstraintKey(c)).toBe("custom:100000");
    // Comfortable -> Custom ¥200,000 stays Custom too.
    expect(resolveBudgetConstraint(custom(200000)).kind).toBe("custom");
    expect(budgetConstraintKey(custom(80000))).toBe("custom:80000");
  });

  it("budgetCapYen is a flat party-total cap regardless of party/duration", () => {
    for (const b of [custom(80000), preset("economy"), preset("standard")]) {
      for (let i = 0; i < 4; i += 1) {
        expect(budgetCapYen(b)).toBe(budgetCapYen(b));
      }
    }
    expect(budgetCapYen(custom(80000))).toBe(80000);
    expect(budgetCapYen(preset("economy"))).toBe(50000);
  });

  it("budgetConstraintKey distinguishes none / preset / custom identity", () => {
    expect(budgetConstraintKey(noConstraint())).toBe("none");
    expect(budgetConstraintKey(preset("economy"))).toBe("preset:economy");
    expect(budgetConstraintKey(custom(80000))).toBe("custom:80000");
  });
});

describe("KAI-279 review regressions: custom survives every previous-tier path", () => {
  it("Flexible -> Custom ¥80,000 stays Custom ¥80,000 (never no-constraint)", () => {
    // The fixed serializer writes budgetKind=custom alongside budgetTier=luxury.
    const viaUrl = tripContextFromSearchParams(
      new URLSearchParams("budgetTier=luxury&budgetKind=custom&budget=80000"),
    ).budget;
    expect(viaUrl).toEqual({ kind: "custom", cap: 80000 });
    expect(budgetCapYen(viaUrl)).toBe(80000);
    expect(resolveBudgetConstraint(viaUrl).kind).toBe("custom");

    // Canonical in-memory state carries the explicit kind too.
    expect(resolveBudgetConstraint({ kind: "custom", cap: 80000 }).kind).toBe(
      "custom",
    );
    expect(budgetCapYen({ kind: "custom", cap: 80000 })).toBe(80000);
  });

  it("Standard -> Custom ¥100,000 stays Custom (cap == Standard ceiling)", () => {
    const viaUrl = tripContextFromSearchParams(
      new URLSearchParams(
        "budgetTier=standard&budgetKind=custom&budget=100000",
      ),
    ).budget;
    expect(viaUrl).toEqual({ kind: "custom", cap: 100000 });
    expect(resolveBudgetConstraint(viaUrl)).toEqual({
      kind: "custom",
      capYen: 100000,
    });
  });

  it("Comfortable -> Custom ¥200,000 stays Custom (cap == Comfortable ceiling)", () => {
    const viaUrl = tripContextFromSearchParams(
      new URLSearchParams(
        "budgetTier=comfortable&budgetKind=custom&budget=200000",
      ),
    ).budget;
    expect(viaUrl).toEqual({ kind: "custom", cap: 200000 });
    expect(resolveBudgetConstraint(viaUrl).kind).toBe("custom");
  });

  it("legacy preset URLs (no budgetKind) still parse as their preset", () => {
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetTier=economy&budget=50000"),
      ).budget,
    ).toEqual({ kind: "preset", preset: "economy" });
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetTier=standard&budget=100000"),
      ).budget,
    ).toEqual({ kind: "preset", preset: "standard" });
  });

  it("any / flexible URLs are no-constraint", () => {
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetTier=any&budget=any"),
      ).budget,
    ).toEqual({ kind: "none" });
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetTier=flexible&budget=flexible"),
      ).budget,
    ).toEqual({ kind: "none" });
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetTier=luxury&budget=flexible"),
      ).budget,
    ).toEqual({ kind: "none" });
  });
});

describe("KAI-279 custom input contract", () => {
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
});

describe("KAI-279 review regression: affordability follows the ACTIVE mode", () => {
  function complete(min: number, max: number) {
    return {
      total: { kind: "bounded" as const, min, max },
    };
  }
  function partial() {
    return { total: undefined as undefined };
  }

  it("selected Personal Car partial -> UNCERTAIN even though Train fits the cap", () => {
    // The classifier receives ONLY the selected mode's estimate; it must
    // never scan alternate modes (Train complete+fits) to make a claim.
    const trainFits = complete(40000, 60000);
    const selectedCarPartial = partial();
    expect(evaluateAffordability(trainFits, 80000)).toBe("fits");
    expect(classifyBudgetFit(trainFits, 80000)).toBe("within");
    expect(classifyBudgetFit(selectedCarPartial, 80000)).toBe("uncertain");
    expect(classifyBudgetFit(undefined, 80000)).toBe("uncertain");
  });

  it("selected mode over budget -> ABOVE while an alternate mode fits", () => {
    const selectedOver = complete(90000, 120000);
    const alternateFits = complete(40000, 60000);
    expect(classifyBudgetFit(alternateFits, 80000)).toBe("within");
    expect(classifyBudgetFit(selectedOver, 80000)).toBe("above");
  });

  it("straddling and no-cap are classified honestly", () => {
    expect(classifyBudgetFit(complete(60000, 100000), 80000)).toBe(
      "may_exceed",
    );
    expect(classifyBudgetFit(complete(40000, 60000), undefined)).toBe(
      "uncertain",
    );
  });
});
