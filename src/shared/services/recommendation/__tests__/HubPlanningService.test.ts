import { describe, it, expect } from "vitest";
import { HubPlanningService } from "../HubPlanningService";
import type { Destination } from "@/shared/types/destination";

const mockHub = {
  id: "osaka-station-city",
  name: "Osaka Station City",
  nameJa: "大阪ステーションシティ",
  kind: "city",
  role: "hub",
  prefecture: "Osaka",
  region: "Kansai",
  categories: ["Travel Hub", "City Hub"],
  heroImage: "https://example.com/osaka.jpg",
  description: "Major Osaka railway & commercial hub",
  highlights: ["Shopping", "Transit"],
  totalTripHours: 6,
  budgetMin: 3500,
  budgetRecommended: 14250,
  budgetMax: 25000,
  coordinates: { lat: 34.7024, lng: 135.4959 },
  transportOptions: { train: 200, shinkansen: 1500 },
  relationships: {
    featuredDestinationIds: ["umeda-sky-building", "dotonbori", "shinsekai"],
  },
  recommendedVisitHours: { min: 2, max: 4 },
} as Destination;

describe("HubPlanningService", () => {
  it("should generate a half-day hub plan with deduplicated travel-to-hub cost", () => {
    const plan = HubPlanningService.generateHubPlan(mockHub, {
      planType: "half_day",
      partySize: 2,
    });

    expect(plan.hub.id).toBe("osaka-station-city");
    expect(plan.planType).toBe("half_day");
    expect(plan.items.length).toBeGreaterThanOrEqual(2);
    expect(plan.items[0].isHub).toBe(true);

    // Verify budget calculations
    expect(plan.budget.travelToHubCost).toBeGreaterThan(0);
    expect(plan.budget.partyTotal).toBeGreaterThan(plan.budget.perPersonTotal);
    expect(plan.budget.perPersonRange.min).toBeLessThan(
      plan.budget.perPersonRange.max,
    );
  });

  it("should generate a full-day hub plan with more POIs", () => {
    const halfDayPlan = HubPlanningService.generateHubPlan(mockHub, {
      planType: "half_day",
    });
    const fullDayPlan = HubPlanningService.generateHubPlan(mockHub, {
      planType: "full_day",
    });

    expect(fullDayPlan.items.length).toBeGreaterThanOrEqual(
      halfDayPlan.items.length,
    );
    expect(fullDayPlan.estimatedTotalHours).toBeGreaterThanOrEqual(
      halfDayPlan.estimatedTotalHours,
    );
  });

  it("should correctly handle single vs party budget math", () => {
    const plan1 = HubPlanningService.generateHubPlan(mockHub, { partySize: 1 });
    const plan2 = HubPlanningService.generateHubPlan(mockHub, { partySize: 2 });

    expect(plan1.budget.perPersonTotal).toBe(plan2.budget.perPersonTotal);
    expect(plan2.budget.partyTotal).toBe(plan1.budget.perPersonTotal * 2);
  });
});
