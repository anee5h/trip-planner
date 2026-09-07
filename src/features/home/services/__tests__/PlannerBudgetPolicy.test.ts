import { describe, it, expect } from "vitest";
import { getPlannerBudgetLimit } from "../PlannerBudgetPolicy";

describe("PlannerBudgetPolicy (KAI-279 flat party-total ceilings)", () => {
  it("returns the flat party-total ceiling for every tier, independent of party and duration", () => {
    // Economy is a ¥50,000 party-total cap for the WHOLE trip regardless of
    // how many people travel or how long the trip lasts.
    expect(getPlannerBudgetLimit("economy", 1, "shortOuting")).toBe(50000);
    expect(getPlannerBudgetLimit("economy", 2, "fullDay")).toBe(50000);
    expect(getPlannerBudgetLimit("economy", 4, "3d2n")).toBe(50000);

    expect(getPlannerBudgetLimit("standard", 2, "fullDay")).toBe(100000);
    expect(getPlannerBudgetLimit("standard", 4, "3d2n")).toBe(100000);

    expect(getPlannerBudgetLimit("comfortable", 2, "fullDay")).toBe(200000);
    expect(getPlannerBudgetLimit("comfortable", 4, "halfDay")).toBe(200000);

    // Flexible has no affordability ceiling, regardless of context.
    expect(getPlannerBudgetLimit("luxury", 2, "fullDay")).toBe(Infinity);
  });
});
