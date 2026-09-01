import { describe, it, expect } from "vitest";
import {
  getPlannerBudgetLimit,
  PER_PERSON_DAILY_LIMITS,
  DURATION_BUDGET_MULTIPLIERS,
} from "../PlannerBudgetPolicy";

describe("PlannerBudgetPolicy", () => {
  it("calculates correct budget limits for various tiers, party sizes, and durations", () => {
    // Standard, 2 people, fullDay -> ¥100,000 party-total ceiling.
    expect(getPlannerBudgetLimit("standard", 2, "fullDay")).toBe(100000);

    // Economy, 1 person, shortOuting -> 25000 * 1 * 0.5 = 12500
    expect(getPlannerBudgetLimit("economy", 1, "shortOuting")).toBe(12500);

    // Comfortable, 4 people, halfDay -> 100000 * 4 * 0.75 = 300000
    expect(getPlannerBudgetLimit("comfortable", 4, "halfDay")).toBe(300000);

    // Flexible has no affordability ceiling, regardless of context.
    expect(getPlannerBudgetLimit("luxury", 2, "fullDay")).toBe(Infinity);
  });

  it("exports correct per-person daily limits", () => {
    expect(PER_PERSON_DAILY_LIMITS.economy).toBe(25000);
    expect(PER_PERSON_DAILY_LIMITS.standard).toBe(50000);
    expect(PER_PERSON_DAILY_LIMITS.comfortable).toBe(100000);
    expect(PER_PERSON_DAILY_LIMITS.luxury).toBe(Infinity);
  });

  it("exports correct duration multipliers", () => {
    expect(DURATION_BUDGET_MULTIPLIERS.shortOuting).toBe(0.5);
    expect(DURATION_BUDGET_MULTIPLIERS.halfDay).toBe(0.75);
    expect(DURATION_BUDGET_MULTIPLIERS.fullDay).toBe(1.0);
  });
});
