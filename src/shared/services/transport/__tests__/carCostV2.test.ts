import { describe, expect, it } from "vitest";
import {
  calculatePersonalCarCost,
  calculateRentalCarCost,
  DEFAULT_RENTAL_DAILY_CHARGES,
} from "../carCostV2";
import type { CarRoundTripRoute } from "../CarRouteProvider";

const route: CarRoundTripRoute = {
  outbound: {
    availability: "available",
    origin: { lat: 35, lng: 139 },
    destination: {
      id: "parking",
      label: "Parking",
      kind: "official_parking",
      coordinates: { lat: 36, lng: 138 },
      sourceUrls: ["https://example.test/parking"],
    },
    provider: "fixture",
    direction: "outbound",
    distanceKm: 100,
    durationMinutes: 120,
    toll: { state: "priced", amountJPY: 3000, basis: "ETC" },
    confidence: "verified",
    completeness: "complete",
  },
  returnRoute: {
    availability: "available",
    origin: { lat: 35, lng: 139 },
    destination: {
      id: "parking",
      label: "Parking",
      kind: "official_parking",
      coordinates: { lat: 36, lng: 138 },
      sourceUrls: ["https://example.test/parking"],
    },
    provider: "fixture",
    direction: "return",
    distanceKm: 110,
    durationMinutes: 130,
    toll: { state: "priced", amountJPY: 3200, basis: "general" },
    confidence: "verified",
    completeness: "complete",
  },
};

const personalAssumptions = {
  partySize: 1,
  vehicleCapacity: 5,
  fuelEconomyKmPerL: [10, 20] as [number, number],
  fuelPriceJPYPerL: [100, 200] as [number, number],
  parkingCostJPY: [500, 1000] as [number, number],
};

describe("carCostV2", () => {
  it("calculates personal car fuel + toll + parking from routed km", () => {
    const result = calculatePersonalCarCost(route, personalAssumptions);
    expect(result.routedDistanceKm).toBe(210);
    expect(result.vehiclesNeeded).toBe(1);
    expect(result.breakdown).toEqual({
      fuel: [1050, 4200],
      toll: [6200, 6200],
      parking: [500, 1000],
    });
    expect(result.cost).toEqual({ kind: "bounded", min: 7750, max: 11400 });
  });

  it("does not multiply one vehicle cost by two travellers", () => {
    const one = calculatePersonalCarCost(route, personalAssumptions);
    const two = calculatePersonalCarCost(route, {
      ...personalAssumptions,
      partySize: 2,
    });
    expect(two.vehiclesNeeded).toBe(1);
    expect(two.cost).toEqual(one.cost);
  });

  it("uses multiple vehicles only after capacity is exceeded", () => {
    const result = calculatePersonalCarCost(route, {
      ...personalAssumptions,
      partySize: 6,
    });
    expect(result.vehiclesNeeded).toBe(2);
    expect(result.cost).toEqual({ kind: "bounded", min: 15500, max: 22800 });
  });

  it("propagates unknown toll instead of returning a plausible total", () => {
    const unknownToll = {
      ...route,
      outbound: {
        ...route.outbound,
        toll: { state: "unknown" as const, basis: "unspecified" as const },
      },
    };
    const result = calculatePersonalCarCost(unknownToll, personalAssumptions);
    expect(result.cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
    expect(result.reason).toBe("toll_unknown");
  });

  it("prices rental possession by duration and class, not drive minutes", () => {
    const options = {
      ...personalAssumptions,
      partySize: 2,
      duration: "fullDay" as const,
      vehicleClass: "compact" as const,
      dailyRentalChargeJPY: DEFAULT_RENTAL_DAILY_CHARGES,
    };
    const day = calculateRentalCarCost(route, options);
    const twoNights = calculateRentalCarCost(route, {
      ...options,
      duration: "2d1n",
    });
    const threeNights = calculateRentalCarCost(route, {
      ...options,
      duration: "3d2n",
    });
    expect(day.rentalDays).toBe(1);
    expect(twoNights.rentalDays).toBe(2);
    expect(threeNights.rentalDays).toBe(3);
    expect(twoNights.cost).toEqual({ kind: "bounded", min: 19750, max: 31400 });
    expect(threeNights.cost).toEqual({
      kind: "bounded",
      min: 25750,
      max: 41400,
    });
    expect(day.vehiclesNeeded).toBe(1);
  });

  it("retains partial fuel and parking when one toll is unknown", () => {
    const partialRoute = {
      ...route,
      returnRoute: {
        ...route.returnRoute,
        toll: { state: "unknown" as const, basis: "unspecified" as const },
      },
    };
    const result = calculatePersonalCarCost(partialRoute, personalAssumptions);

    expect(result.cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
    expect(result.reason).toBe("toll_unknown");
    expect(result.breakdown?.fuel).toEqual([1050, 4200]);
    expect(result.breakdown?.parking).toEqual([500, 1000]);
    expect(result.breakdown?.toll).toBeUndefined();
    expect(result.knownCost).toEqual([1550, 5200]);
    expect(result.assumptionProvenance).toEqual({
      source: "Meguruto planning defaults",
      basis: "fuel economy, fuel price, parking, and rental-rate profiles",
      revision: "car-cost-v2-defaults-1",
    });
  });

  it("does not invent rental pricing when duration is any", () => {
    const result = calculateRentalCarCost(route, {
      ...personalAssumptions,
      duration: "any",
      vehicleClass: "compact",
      dailyRentalChargeJPY: DEFAULT_RENTAL_DAILY_CHARGES,
    });
    expect(result.cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
    expect(result.reason).toBe("rental_duration_unknown");
  });
});
