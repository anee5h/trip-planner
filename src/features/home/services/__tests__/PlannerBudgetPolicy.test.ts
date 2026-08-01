import { describe, it, expect } from "vitest";
import {
  getPlannerBudgetLimit,
  PER_PERSON_DAILY_LIMITS,
  DURATION_BUDGET_MULTIPLIERS,
} from "../PlannerBudgetPolicy";

describe("PlannerBudgetPolicy", () => {
  it("calculates correct budget limits for various tiers, party sizes, and durations", () => {
    // Standard, 2 people, fullDay -> 20000 * 2 * 1.0 = 40000
    expect(getPlannerBudgetLimit("standard", 2, "fullDay")).toBe(40000);

    // Economy, 1 person, shortOuting -> 10000 * 1 * 0.5 = 5000
    expect(getPlannerBudgetLimit("economy", 1, "shortOuting")).toBe(5000);

    // Comfortable, 4 people, halfDay -> 35000 * 4 * 0.75 = 105000
    expect(getPlannerBudgetLimit("comfortable", 4, "halfDay")).toBe(105000);

    // Luxury, 2 people, fullDay -> 75000 * 2 * 1.0 = 150000
    expect(getPlannerBudgetLimit("luxury", 2, "fullDay")).toBe(150000);
  });

  it("exports correct per-person daily limits", () => {
    expect(PER_PERSON_DAILY_LIMITS.economy).toBe(10000);
    expect(PER_PERSON_DAILY_LIMITS.standard).toBe(20000);
    expect(PER_PERSON_DAILY_LIMITS.comfortable).toBe(35000);
    expect(PER_PERSON_DAILY_LIMITS.luxury).toBe(75000);
  });

  it("exports correct duration multipliers", () => {
    expect(DURATION_BUDGET_MULTIPLIERS.shortOuting).toBe(0.5);
    expect(DURATION_BUDGET_MULTIPLIERS.halfDay).toBe(0.75);
    expect(DURATION_BUDGET_MULTIPLIERS.fullDay).toBe(1.0);
  });
});
