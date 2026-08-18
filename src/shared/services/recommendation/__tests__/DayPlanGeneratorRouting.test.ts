import { beforeAll, describe, it, expect } from "vitest";
import {
  generateDayPlan,
  isRealDestinationStop,
  resolveReturnEndpoint,
} from "../DayPlanGeneratorService";
import {
  getFullPlaces,
  loadDestinationsIndex,
} from "@/shared/services/place/PlaceCatalog";
import type { Destination } from "@/shared/types/destination";

describe("DayPlanGeneratorRouting", () => {
  let canonicalPlaces: Destination[];
  beforeAll(async () => {
    await loadDestinationsIndex();
    canonicalPlaces = getFullPlaces() as Destination[];
  });

  it("populates routeLegs, rejects unusable transit, and respects anchor POI protection", () => {
    const primary = {
      id: "tokyo-skytree",
      name: "Tokyo Skytree",
      prefecture: "Tokyo",
      coordinates: { lat: 35.7101, lng: 139.8107 },
      recommendedVisitHours: { min: 1, max: 2 },
      budgetMin: 2000,
      budgetMax: 3000,
    } as Destination;

    const plan = generateDayPlan(primary, { planType: "half_day" });

    expect(plan.isUnfeasible).toBe(false);
    expect(plan.routeLegs).toBeDefined();
    expect(plan.steps.some((s) => s.destination?.id === primary.id)).toBe(true);
  });

  it("defaults POI plan returnMode to no return transit", () => {
    const primary = {
      id: "sensoji",
      kind: "temple",
      coordinates: { lat: 35.7148, lng: 139.7967 },
      relationships: { nearestStationId: "asakusa-station" },
    } as unknown as Destination;

    const catalog = [
      {
        id: "asakusa-station",
        name: "Asakusa Station",
        kind: "station",
      } as Destination,
    ];

    const plan = generateDayPlan(primary, {
      planType: "half_day",
      catalogue: catalog,
    });

    expect(plan.returnMode).toBe("none");
  });

  it("resolves nearest station endpoint when returnMode is nearest_station", () => {
    const finalStop = {
      id: "sensoji",
      coordinates: { lat: 35.7148, lng: 139.7967 },
      relationships: { nearestStationId: "asakusa-station" },
    } as unknown as Destination;

    const catalog = [
      {
        id: "asakusa-station",
        name: "Asakusa Station",
        kind: "station",
      } as Destination,
    ];

    const endpoint = resolveReturnEndpoint(
      finalStop,
      "nearest_station",
      finalStop,
      catalog,
    );
    expect(endpoint?.id).toBe("asakusa-station");
  });

  it("does not treat a non-station as a nearest-station endpoint", () => {
    const finalStop = {
      id: "sensoji",
      relationships: { nearestStationId: "asakusa-ward" },
    } as unknown as Destination;
    const catalog = [
      { id: "asakusa-ward", name: "Asakusa", kind: "district" },
    ] as Destination[];

    expect(
      resolveReturnEndpoint(finalStop, "nearest_station", finalStop, catalog),
    ).toBeNull();
  });

  it("builds exactly two real POIs for canonical Odaiba half-day plans", () => {
    const odaiba = canonicalPlaces.find(
      (place) => place.id === "odaiba-minato",
    );
    expect(odaiba).toBeDefined();

    const plan = generateDayPlan(odaiba!, {
      planType: "half_day",
      availableMinutes: 300,
    });

    expect(plan.isUnfeasible).toBe(false);
    expect(plan.steps.filter(isRealDestinationStop)).toHaveLength(2);
  });

  it("keeps canonical Shibuya Sky feasible with a nearby partner", () => {
    const shibuyaSky = canonicalPlaces.find(
      (place) => place.id === "shibuya-sky-shibuya",
    );
    expect(shibuyaSky).toBeDefined();

    const plan = generateDayPlan(shibuyaSky!, {
      planType: "half_day",
      availableMinutes: 300,
    });

    expect(plan.isUnfeasible).toBe(false);
    expect(
      plan.steps.filter(isRealDestinationStop).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
