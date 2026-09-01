/** KAI-220 final range, tier, and anomaly benchmark. */
import { describe, expect, it } from "vitest";
import { BUDGET_TIER_LIMITS } from "@/shared/types/planner";
import { loadDestinations, runAudit } from "../kai-220-budget-audit";

describe("KAI-220 final budget audit", () => {
  it("covers five origins across day and overnight party contexts deterministically", () => {
    const destinations = loadDestinations();
    const first = runAudit(destinations);
    const second = runAudit(destinations);

    expect(second).toEqual(first);
    expect(first.totalCatalogue).toBe(destinations.length);
    expect(Object.keys(first.origins)).toEqual([
      "nakayama",
      "tokyo",
      "osaka",
      "hakata",
      "naha",
    ]);
    expect(first.anomalyCount).toBe(0);
    expect(first.calibratedPartyTotalCeilings).toEqual({
      economy: BUDGET_TIER_LIMITS.economy,
      standard: BUDGET_TIER_LIMITS.standard,
      comfortable: BUDGET_TIER_LIMITS.comfortable,
      luxury: Infinity,
    });

    for (const origin of Object.values(first.origins) as Array<{
      scenarios: Record<
        string,
        { routable: number; bounded: number; unavailable: number }
      >;
    }>) {
      for (const scenario of Object.values(origin.scenarios)) {
        expect(scenario.routable).toBeGreaterThan(0);
        expect(scenario.bounded + scenario.unavailable).toBe(scenario.routable);
        expect(scenario.bounded).toBe(scenario.routable);
      }
    }
  }, 120_000);
});
