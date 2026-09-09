import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  buildPersonalCarCostOptions,
  buildRentalCarCostOptions,
  getVerifiedDestinationParkingCost,
} from "@/shared/services/transport/carCostOptions";
import type {
  CarRouteToll,
  CarRoundTripRoute,
} from "@/shared/services/transport/CarRouteProvider";
import {
  DEFAULT_PERSONAL_CAR_ASSUMPTION_PROVENANCE,
  DEFAULT_RENTAL_CAR_ASSUMPTION_PROVENANCE,
  DEFAULT_RENTAL_DAILY_CHARGES,
  calculatePersonalCarCost,
  calculateRentalCarCost,
} from "@/shared/services/transport/carCostV2";
import { getCanonicalTransportCost } from "@/shared/services/transport/transportCostV2";
import { calculateTripEstimate } from "../tripEstimateEngine";
import { getTransportDisplayCost } from "../transportDisplayCost";

const TOKYO = { lat: 35, lng: 139 };
const accessAnchor = {
  id: "fixture-parking",
  label: "Fixture parking",
  kind: "official_parking" as const,
  coordinates: { lat: 36, lng: 138 },
  sourceUrls: ["https://example.test/parking"],
};
const destination = {
  id: "kai281-car-destination",
  name: "KAI-281 car fixture",
  prefecture: "Nagano",
  coordinates: { lat: 36.001, lng: 138.001 },
  carAccess: {
    state: "parking_walk" as const,
    eligibility: "eligible" as const,
    anchors: [accessAnchor],
    evidence: "official" as const,
    sourceUrls: accessAnchor.sourceUrls,
  },
} as unknown as Destination;

function routeFor(toll: CarRouteToll): CarRoundTripRoute {
  return {
    outbound: {
      availability: "available",
      origin: TOKYO,
      destination: accessAnchor,
      accessAnchor,
      provider: "kai281-fixture",
      direction: "outbound",
      distanceKm: 150,
      durationMinutes: 180,
      toll,
      confidence: "verified",
      completeness: "complete",
    },
    returnRoute: {
      availability: "available",
      origin: accessAnchor.coordinates,
      destination: { id: "origin", label: "Tokyo", coordinates: TOKYO },
      accessAnchor,
      provider: "kai281-fixture",
      direction: "return",
      distanceKm: 150,
      durationMinutes: 180,
      toll,
      confidence: "verified",
      completeness: "complete",
    },
  };
}

const pricedRoute = routeFor({
  state: "priced",
  amountJPY: 3000,
  basis: "ETC",
});
const freeRoute = routeFor({ state: "free", basis: "ETC" });
const unknownTollRoute = routeFor({ state: "unknown", basis: "unspecified" });

function originTravel(estimate: ReturnType<typeof calculateTripEstimate>) {
  const component = estimate.components.find(
    (candidate) => candidate.evidence.scope === "origin_travel",
  );
  expect(component).toBeDefined();
  return component!;
}

describe("KAI-281 canonical car option and display path", () => {
  it("builds personal options without rental economics", () => {
    const options = buildPersonalCarCostOptions({ partySize: 2 });

    expect(options).toMatchObject({
      partySize: 2,
      vehicleCapacity: 5,
      fuelEconomyKmPerL: [12, 18],
      fuelPriceJPYPerL: [165, 190],
      parkingCostJPY: [500, 1600],
    });
    expect("duration" in options).toBe(false);
    expect("dailyRentalChargeJPY" in options).toBe(false);
    expect(options.assumptionProvenance).toEqual(
      DEFAULT_PERSONAL_CAR_ASSUMPTION_PROVENANCE,
    );
  });

  it("builds rental options with duration, class, and canonical daily charges", () => {
    const options = buildRentalCarCostOptions({
      partySize: 2,
      duration: "2d1n",
      vehicleClass: "standard",
    });

    expect(options.duration).toBe("2d1n");
    expect(options.vehicleClass).toBe("standard");
    expect(options.dailyRentalChargeJPY).toEqual(DEFAULT_RENTAL_DAILY_CHARGES);
    expect(options.parkingCostJPY).toEqual([500, 1600]);
    expect(options.assumptionProvenance).toEqual(
      DEFAULT_RENTAL_CAR_ASSUMPTION_PROVENANCE,
    );
  });

  it("uses a verified official parking override instead of the generic fallback", () => {
    const verifiedParking = [900, 1200] as [number, number];
    const destinationWithParking = {
      ...destination,
      carAccess: {
        ...destination.carAccess!,
        anchors: [
          {
            ...accessAnchor,
            parkingCostJPY: verifiedParking,
          },
        ],
      },
    };

    const parkingOverride = getVerifiedDestinationParkingCost(
      destinationWithParking,
    );
    const options = buildPersonalCarCostOptions({
      partySize: 1,
      parkingCostJPY: parkingOverride,
    });

    expect(parkingOverride).toEqual(verifiedParking);
    expect(options.parkingCostJPY).toEqual(verifiedParking);
    expect(
      calculatePersonalCarCost(pricedRoute, options).breakdown?.parking,
    ).toEqual(verifiedParking);
  });

  it("returns complete personal-car cost for a priced toll route through the engine", () => {
    const estimate = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 1,
      duration: "fullDay",
      homeCoords: TOKYO,
      carRoute: pricedRoute,
      carCostOptions: buildPersonalCarCostOptions({ partySize: 1 }),
    });
    const origin = originTravel(estimate);

    expect(origin.cost.kind).toBe("bounded");
    expect(origin.evidence.reason).toBeUndefined();
    expect(getTransportDisplayCost(estimate, "my_car", 1)).toMatchObject({
      range: [expect.any(Number), expect.any(Number)],
      unit: "per_car_round_trip",
      completeness: "complete",
    });
  });

  it("returns complete personal-car cost for a toll-free route", () => {
    const result = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      freeRoute,
      buildPersonalCarCostOptions({ partySize: 1 }),
    );

    expect(result.cost.kind).toBe("bounded");
    expect(result.incompleteReason).toBeUndefined();
    expect(result.evidence.fareBasis).toBe("personal_vehicle_cash_cost");
  });

  it("keeps a personal-car known subtotal partial when toll is unknown", () => {
    const estimate = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 1,
      duration: "fullDay",
      homeCoords: TOKYO,
      carRoute: unknownTollRoute,
      carCostOptions: buildPersonalCarCostOptions({ partySize: 1 }),
    });
    const origin = originTravel(estimate);
    const display = getTransportDisplayCost(estimate, "my_car", 1);

    expect(origin.cost).toEqual({
      kind: "unavailable",
      reason: "source_missing",
    });
    expect(estimate.completeness).toBe("partial");
    expect(estimate.total).toBeUndefined();
    expect(origin.knownCost).toBeDefined();
    expect(origin.evidence.reason).toBe("toll_unknown");
    expect(display).toMatchObject({
      unit: "per_car_round_trip",
      completeness: "partial",
      reason: "toll_unknown",
    });
    expect(
      display && "range" in display ? display.range[1] : 0,
    ).toBeGreaterThan(0);
  });

  it("returns complete rental-car cost for a priced or toll-free route", () => {
    for (const route of [pricedRoute, freeRoute]) {
      const result = getCanonicalTransportCost(
        destination,
        "car",
        1,
        TOKYO,
        undefined,
        route,
        buildRentalCarCostOptions({
          partySize: 1,
          duration: "fullDay",
          vehicleClass: "compact",
        }),
      );
      expect(result.cost.kind).toBe("bounded");
      expect(result.evidence.fareBasis).toBe("rental_vehicle_cash_cost");
    }
  });

  it("keeps rental fuel, parking, and rental subtotal visible when toll is unknown", () => {
    const result = getCanonicalTransportCost(
      destination,
      "car",
      2,
      TOKYO,
      undefined,
      unknownTollRoute,
      buildRentalCarCostOptions({
        partySize: 2,
        duration: "fullDay",
        vehicleClass: "compact",
      }),
    );

    expect(result.cost.kind).toBe("unavailable");
    expect(result.knownCost).toBeDefined();
    expect(result.incompleteReason).toBe("toll_unknown");
    expect(result.evidence.fareBasis).toBe("rental_vehicle_cash_cost");
  });

  it("changes rental cost by duration and vehicle class, not route minutes", () => {
    const compactDay = calculateRentalCarCost(
      pricedRoute,
      buildRentalCarCostOptions({
        partySize: 1,
        duration: "fullDay",
        vehicleClass: "compact",
      }),
    );
    const standardTwoDay = calculateRentalCarCost(
      pricedRoute,
      buildRentalCarCostOptions({
        partySize: 1,
        duration: "2d1n",
        vehicleClass: "standard",
      }),
    );

    expect(compactDay.cost.kind).toBe("bounded");
    expect(standardTwoDay.cost.kind).toBe("bounded");
    expect(compactDay.breakdown?.parking).toEqual([500, 1600]);
    expect(standardTwoDay.breakdown?.parking).toEqual([500, 1600]);
    if (
      compactDay.cost.kind === "bounded" &&
      standardTwoDay.cost.kind === "bounded"
    ) {
      expect(standardTwoDay.cost.min).toBeGreaterThan(compactDay.cost.min);
      expect(standardTwoDay.cost.max).toBeGreaterThan(compactDay.cost.max);
    }
  });

  it("fails closed for missing or unroutable road routes", () => {
    const options = buildPersonalCarCostOptions({ partySize: 1 });
    const missing = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      undefined,
      options,
    );
    const wrongAnchorRoute = {
      ...pricedRoute,
      outbound: {
        ...pricedRoute.outbound,
        accessAnchor: { ...accessAnchor, id: "wrong-anchor" },
      },
    };
    const unroutable = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      wrongAnchorRoute,
      options,
    );

    expect(missing.cost.kind).toBe("unavailable");
    expect(missing.incompleteReason).toBe("route_unavailable");
    expect(unroutable.cost.kind).toBe("unavailable");
    expect(unroutable.incompleteReason).toBe("route_unavailable");
  });

  it("fails closed for missing or invalid parking assumptions", () => {
    const noOptions = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      pricedRoute,
    );
    const invalidParking = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      pricedRoute,
      buildPersonalCarCostOptions({
        partySize: 1,
        parkingCostJPY: [1500, 500],
      }),
    );
    const missingParking = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      pricedRoute,
      {
        ...buildPersonalCarCostOptions({ partySize: 1 }),
        parkingCostJPY: undefined as never,
      },
    );

    const invalidFuel = getCanonicalTransportCost(
      destination,
      "my_car",
      1,
      TOKYO,
      undefined,
      pricedRoute,
      {
        ...buildPersonalCarCostOptions({ partySize: 1 }),
        fuelEconomyKmPerL: [0, 18],
      },
    );

    expect(noOptions.incompleteReason).toBe("car_options_missing");
    expect(invalidFuel.incompleteReason).toBe("fuel_assumption_invalid");
    expect(invalidParking.incompleteReason).toBe("parking_unknown");
    expect(missingParking.cost.kind).toBe("unavailable");
  });

  it("scales one-car costs only after party capacity is exceeded", () => {
    const one = calculatePersonalCarCost(
      pricedRoute,
      buildPersonalCarCostOptions({ partySize: 1 }),
    );
    const two = calculatePersonalCarCost(
      pricedRoute,
      buildPersonalCarCostOptions({ partySize: 2 }),
    );
    const six = calculatePersonalCarCost(
      pricedRoute,
      buildPersonalCarCostOptions({ partySize: 6 }),
    );

    expect(two.vehiclesNeeded).toBe(1);
    expect(two.cost).toEqual(one.cost);
    expect(six.vehiclesNeeded).toBe(2);
    if (one.cost.kind === "bounded" && six.cost.kind === "bounded") {
      expect(six.cost.min).toBe(one.cost.min * 2);
      expect(six.cost.max).toBe(one.cost.max * 2);
    }
  });

  it("keeps train and bus display projection per person and unchanged", () => {
    const estimate = {
      components: [
        {
          cost: { kind: "bounded" as const, min: 1200, max: 2400 },
          evidence: {
            scope: "origin_travel" as const,
            derivation: "source_fact" as const,
          },
        },
      ],
    } as unknown as ReturnType<typeof calculateTripEstimate>;

    expect(getTransportDisplayCost(estimate, "train", 2)).toEqual({
      range: [600, 1200],
      unit: "per_person_round_trip",
      completeness: "complete",
    });
    expect(getTransportDisplayCost(estimate, "bus", 2)).toEqual({
      range: [600, 1200],
      unit: "per_person_round_trip",
      completeness: "complete",
    });
  });
});
