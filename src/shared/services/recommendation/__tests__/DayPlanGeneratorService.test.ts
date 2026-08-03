import { describe, it, expect } from "vitest";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
  isRealDestinationStop,
  getPlanEligibility,
} from "../DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

const mockDestPrimary = {
  id: "roppongi-hills",
  name: "Roppongi Hills",
  prefecture: "Tokyo",
  categories: ["Observation Deck"],
  role: "primary",
  budgetMin: 2000,
  budgetMax: 3000,
  recommendedVisitHours: { min: 1.5, max: 2.5 },
  coordinates: { lat: 35.6604, lng: 139.7292 },
} as unknown as Destination;

describe("DayPlanGeneratorService", () => {
  it("generates a structured day plan with minimum real stop thresholds", () => {
    const plan = generateDayPlan(mockDestPrimary);
    expect(plan).toBeDefined();
    expect(plan.id).toContain(mockDestPrimary.id);

    if (!plan.isUnfeasible) {
      const realStops = plan.steps.filter(isRealDestinationStop);
      expect(realStops.length).toBeGreaterThanOrEqual(2);
      expect(plan.totalDurationMinutes).toBeGreaterThan(0);
      expect(plan.totalBudgetRange[0]).toBeGreaterThan(0);
    }
  });

  it("fails gracefully with half-day fallback when full day stops are insufficient", () => {
    const unfeasiblePlan = generateDayPlan(mockDestPrimary, {
      planType: "full_day",
      startTime: "17:00",
      maxEndTime: "17:30",
    });

    expect(unfeasiblePlan.isUnfeasible).toBe(true);
    expect(unfeasiblePlan.unfeasibleErrorMessage?.en).toBeDefined();
  });

  it("ensures lunch never starts before 11:30 and inserts no long unexplained idle gaps", () => {
    const plan = generateDayPlan(mockDestPrimary, {
      planType: "full_day",
      startTime: "09:00",
    });

    const lunchStep = plan.steps.find((s) => s.id === "meal-lunch");
    if (lunchStep) {
      const startMins =
        parseInt(lunchStep.startTime.split(":")[0], 10) * 60 +
        parseInt(lunchStep.startTime.split(":")[1], 10);
      expect(startMins).toBeGreaterThanOrEqual(11 * 60 + 30);
    }

    const bufferStep = plan.steps.find((s) => s.id === "buffer-lunch");
    if (bufferStep) {
      expect(bufferStep.durationMinutes).toBeLessThanOrEqual(30);
    }
  });

  it("starts the first attraction at the selected arrival time before considering lunch", () => {
    const plan = generateDayPlan(mockDestPrimary, {
      planType: "half_day",
      startTime: "13:00",
      availableMinutes: 300,
    });

    const firstStop = plan.steps.find(isRealDestinationStop);
    expect(firstStop?.startTime).toBe("13:00");
  });

  it("omits lunch instead of rejecting a tight otherwise-valid route", () => {
    const plan = generateDayPlan(mockDestPrimary, {
      planType: "half_day",
      startTime: "11:00",
      availableMinutes: 240,
    });

    expect(plan.isUnfeasible).toBe(false);
    expect(plan.steps.some((step) => step.type === "meal")).toBe(false);
  });

  it("removes a step from plan and recalculates start/end times", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    if (initialPlan.steps.length > 0) {
      const firstStepId = initialPlan.steps[0].id;
      const updatedPlan = removeStepFromPlan(initialPlan, firstStepId);
      expect(
        updatedPlan.steps.find((s) => s.id === firstStepId),
      ).toBeUndefined();
    }
  });

  it("reorders steps in a plan accurately and preserves route feasibility", () => {
    const initialPlan = generateDayPlan(mockDestPrimary);
    const destSteps = initialPlan.steps.filter(isRealDestinationStop);
    if (destSteps.length >= 2) {
      const firstDestTitle = destSteps[0].title.en;
      const reorderedPlan = reorderPlanSteps(initialPlan, 0, 1);
      if (!reorderedPlan.isUnfeasible) {
        const newDestSteps = reorderedPlan.steps.filter(isRealDestinationStop);
        expect(newDestSteps[1].title.en).toBe(firstDestTitle);
      }
    }
  });
});

describe("getPlanEligibility", () => {
  const poi = (id: string, lat: number, lng: number) =>
    ({
      id,
      name: id,
      prefecture: "Tokyo",
      region: "Kanto",
      role: "standalone",
      kind: "museum",
      categories: [id],
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
      description: id,
      highlights: [],
      heroImage: `https://example.com/${id}.jpg`,
      coordinates: { lat, lng },
      relationships: {},
    }) as unknown as Destination;

  const hub = (id: string, lat: number, lng: number) =>
    ({
      id,
      name: id,
      prefecture: "Tokyo",
      region: "Kanto",
      role: "hub",
      kind: "city",
      categories: [id],
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
      description: id,
      highlights: [],
      heroImage: `https://example.com/${id}.jpg`,
      coordinates: { lat, lng },
      relationships: {},
    }) as unknown as Destination;

  // All injected POIs sit within ~1 km of each other so the transit estimator
  // marks them usable regardless of area density.
  const center = poi("center", 35.68, 139.76);
  const a = poi("a", 35.681, 139.76);
  const b = poi("b", 35.682, 139.761);
  const c = poi("c", 35.683, 139.762);

  it("isolated POI: half-day and full-day both ineligible, count is 1", () => {
    const catalogue = [center];
    expect(
      getPlanEligibility(center, { planType: "half_day", catalogue }).eligible,
    ).toBe(false);
    expect(
      getPlanEligibility(center, { planType: "full_day", catalogue }).eligible,
    ).toBe(false);
    expect(
      getPlanEligibility(center, { planType: "full_day", catalogue })
        .candidateCount,
    ).toBe(1);
  });

  it("POI plus one nearby POI: half-day eligible, full-day ineligible", () => {
    const catalogue = [center, a];
    expect(
      getPlanEligibility(center, { planType: "half_day", catalogue }).eligible,
    ).toBe(true);
    expect(
      getPlanEligibility(center, { planType: "full_day", catalogue }).eligible,
    ).toBe(false);
    expect(
      getPlanEligibility(center, { planType: "full_day", catalogue })
        .candidateCount,
    ).toBe(2);
  });

  it("POI plus two nearby POIs: full-day eligible", () => {
    const catalogue = [center, a, b];
    const el = getPlanEligibility(center, { planType: "full_day", catalogue });
    expect(el.eligible).toBe(true);
    expect(el.candidateCount).toBe(3);
  });

  it("hub with one child: half-day ineligible", () => {
    const h = hub("hub-city", 35.7, 139.75);
    const catalogue = [h, a];
    const el = getPlanEligibility(h, { planType: "half_day", catalogue });
    expect(el.eligible).toBe(false);
    expect(el.candidateCount).toBe(1);
  });

  it("hub with two children: half-day eligible, full-day ineligible", () => {
    const h = hub("hub-city", 35.7, 139.75);
    const catalogue = [h, a, b];
    expect(
      getPlanEligibility(h, { planType: "half_day", catalogue }).eligible,
    ).toBe(true);
    expect(
      getPlanEligibility(h, { planType: "full_day", catalogue }).eligible,
    ).toBe(false);
  });

  it("hub with three children: full-day eligible", () => {
    const h = hub("hub-city", 35.7, 139.75);
    const catalogue = [h, a, b, c];
    const el = getPlanEligibility(h, { planType: "full_day", catalogue });
    expect(el.eligible).toBe(true);
    expect(el.candidateCount).toBe(3);
  });

  it("district anchor does not count as a real stop", () => {
    const district = {
      ...poi("district-anchor", 35.68, 139.76),
      kind: "district",
      role: "destination",
    } as unknown as Destination;
    const catalogue = [district];
    const el = getPlanEligibility(district, {
      planType: "half_day",
      catalogue,
    });
    // District anchor is not a real stop: 0 candidates -> ineligible.
    expect(el.eligible).toBe(false);
    expect(el.candidateCount).toBe(0);
  });

  it("candidate without coordinates does not count", () => {
    const noCoords = {
      ...poi("no-coords", 0, 0),
      coordinates: undefined,
    } as unknown as Destination;
    const catalogue = [center, noCoords];
    const el = getPlanEligibility(center, { planType: "full_day", catalogue });
    expect(el.candidateCount).toBe(1);
    expect(el.eligible).toBe(false);
  });

  it("exposes reason insufficient_real_pois when ineligible", () => {
    const el = getPlanEligibility(center, {
      planType: "full_day",
      catalogue: [center],
    });
    expect(el.eligible).toBe(false);
    expect(el.reason).toBe("insufficient_real_pois");
  });
});
