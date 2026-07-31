import { describe, it, expect } from "vitest";
import { generateDayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

const mockPoi1 = {
  id: "poi-1",
  name: "POI One",
  nameJa: "スポット1",
  kind: "landmark",
  role: "anchor",
  placeType: "destination",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["sightseeing"],
  heroImage: "https://example.com/hero.jpg",
  description: "Test landmark",
  areaId: "shinjuku",
  coordinates: { lat: 35.69, lng: 139.7 },
  recommendedVisitHours: { min: 1, max: 3 },
  businessHours: "09:00 - 18:00",
  openingHoursMetadata: {
    verifiedAt: new Date().toISOString(),
    sourceUrl: "https://official.example.com",
  },
} as unknown as Destination;

const mockHub = {
  id: "hub-1",
  name: "Shinjuku Hub",
  nameJa: "新宿ハブ",
  kind: "district",
  role: "hub",
  placeType: "hub",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["district"],
  heroImage: "https://example.com/hub.jpg",
  description: "Test district hub",
  areaId: "shinjuku",
  coordinates: { lat: 35.69, lng: 139.7 },
  relationships: {
    featuredDestinationIds: ["poi-1"],
  },
} as unknown as Destination;

describe("DayPlanGeneratorService - Disclosures & Hub Routing", () => {
  it("populates uncertainHoursDisclosures for unverified or stale locations", () => {
    const unverifiedPoi: Destination = {
      ...mockPoi1,
      id: "unverified-1",
      openingHoursMetadata: undefined,
    };
    const plan = generateDayPlan(unverifiedPoi, {
      planType: "half_day",
      availableMinutes: 300,
    });

    expect(plan.uncertainHoursDisclosures.length).toBeGreaterThan(0);
    expect(
      plan.uncertainHoursDisclosures.some(
        (u) => u.destinationId === "unverified-1",
      ),
    ).toBe(true);
  });

  it("does not schedule a transit leg from hub anchor to first POI", () => {
    const plan = generateDayPlan(mockHub, {
      planType: "half_day",
      availableMinutes: 300,
    });

    expect(plan.isUnfeasible).toBe(false);
    const legs = plan.routeLegs ?? [];
    expect(legs.length).toBeGreaterThanOrEqual(1);

    const firstLeg = legs[0];
    expect(firstLeg.fromDestinationId).not.toBe("hub-1");

    const firstRealStop = plan.steps.find(
      (step) => step.type === "destination",
    );
    expect(firstRealStop?.startTime).toBe("09:00");
    expect(plan.steps.some((step) => step.destination?.id === "hub-1")).toBe(
      false,
    );
  });
});
