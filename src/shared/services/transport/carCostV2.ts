import type {
  CostRepresentation,
  CostAssumptionProvenance,
} from "@/shared/services/budget/budgetV2";
import { getTripDays, type TripDuration } from "@/shared/types/tripDuration";
import type { PriceRange } from "@/shared/types/planner";
import planningAssumptions from "@/shared/data/car-planning-assumptions.json";
import type { CarRoundTripRoute, CarRouteResult } from "./CarRouteProvider";

export type CarVehicleClass = "compact" | "standard" | "suv";

export interface CarCostBreakdown {
  readonly fuel: PriceRange;
  readonly toll?: PriceRange;
  readonly parking: PriceRange;
  readonly rental?: PriceRange;
  readonly applicableFees?: PriceRange;
}

export interface PersonalCarCostOptions {
  readonly partySize: number;
  readonly vehicleCapacity?: number;
  readonly fuelEconomyKmPerL: PriceRange;
  readonly fuelPriceJPYPerL: PriceRange;
  readonly parkingCostJPY: PriceRange;
  readonly assumptionProvenance?: CostAssumptionProvenance;
}

export interface RentalCarCostOptions extends PersonalCarCostOptions {
  readonly duration: TripDuration;
  readonly vehicleClass: CarVehicleClass;
  readonly dailyRentalChargeJPY: Readonly<Record<CarVehicleClass, PriceRange>>;
  readonly applicableFeesJPY?: PriceRange;
}

export interface CarCostResult {
  readonly cost: CostRepresentation;
  readonly breakdown?: CarCostBreakdown;
  /** Bounded inputs known even when the full total is unavailable. */
  readonly knownCost?: PriceRange;
  readonly vehiclesNeeded: number;
  readonly routedDistanceKm?: number;
  readonly rentalDays?: number;
  readonly assumptionProvenance?: CostAssumptionProvenance;
  readonly reason?: string;
}

export const DEFAULT_CAR_ASSUMPTION_PROVENANCE: CostAssumptionProvenance = {
  source: "car-planning-assumptions.json",
  basis: planningAssumptions.notes,
  revision: planningAssumptions.version,
  checkedAt: planningAssumptions.checkedAt,
  sourceUrls: [
    planningAssumptions.fuelEconomyKmPerL.reference,
    planningAssumptions.fuelPriceJPYPerL.reference,
    planningAssumptions.rentalDailyChargeJPY.compact.reference,
  ],
};

function planningRange(value: readonly number[]): PriceRange {
  if (
    value.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    throw new Error("Invalid car planning assumption range");
  }
  return [value[0], value[1]];
}

export const DEFAULT_FUEL_ECONOMY_KM_PER_L: PriceRange = planningRange(
  planningAssumptions.fuelEconomyKmPerL.value,
);
export const DEFAULT_FUEL_PRICE_JPY_PER_L: PriceRange = planningRange(
  planningAssumptions.fuelPriceJPYPerL.value,
);
export const DEFAULT_RENTAL_DAILY_CHARGES: Readonly<
  Record<CarVehicleClass, PriceRange>
> = {
  compact: planningRange(
    planningAssumptions.rentalDailyChargeJPY.compact.value,
  ),
  standard: planningRange(
    planningAssumptions.rentalDailyChargeJPY.standard.value,
  ),
  suv: planningRange(planningAssumptions.rentalDailyChargeJPY.suv.value),
};

function unavailable(
  vehiclesNeeded: number,
  reason: string,
  distanceKm?: number,
  rentalDays?: number,
  details: Partial<
    Pick<CarCostResult, "breakdown" | "knownCost" | "assumptionProvenance">
  > = {},
): CarCostResult {
  return {
    cost: { kind: "unavailable", reason: "source_missing" },
    vehiclesNeeded,
    routedDistanceKm: distanceKm,
    rentalDays,
    reason,
    ...details,
  };
}

function validRange(range: readonly [number, number]): boolean {
  return (
    range.length === 2 &&
    Number.isFinite(range[0]) &&
    Number.isFinite(range[1]) &&
    range[0] >= 0 &&
    range[1] >= range[0]
  );
}

function isRentalCarCostOptions(
  options: PersonalCarCostOptions | RentalCarCostOptions,
): options is RentalCarCostOptions {
  return (
    "duration" in options &&
    "vehicleClass" in options &&
    "dailyRentalChargeJPY" in options
  );
}

function availableRoute(route: CarRouteResult): boolean {
  return (
    route.availability === "available" &&
    Number.isFinite(route.distanceKm) &&
    (route.distanceKm ?? -1) >= 0 &&
    Number.isFinite(route.durationMinutes) &&
    (route.durationMinutes ?? -1) >= 0 &&
    route.confidence !== "unknown" &&
    route.completeness === "complete"
  );
}

function routeDistance(route: CarRoundTripRoute): number | undefined {
  if (!availableRoute(route.outbound) || !availableRoute(route.returnRoute)) {
    return undefined;
  }
  return route.outbound.distanceKm! + route.returnRoute.distanceKm!;
}

function tollAmount(route: CarRouteResult): number | undefined {
  if (route.toll.state === "free") return 0;
  if (
    route.toll.state === "priced" &&
    route.toll.amountJPY !== undefined &&
    Number.isFinite(route.toll.amountJPY) &&
    route.toll.amountJPY >= 0
  ) {
    return route.toll.amountJPY;
  }
  return undefined;
}

function vehicleCount(partySize: number, capacity: number): number | undefined {
  if (!Number.isInteger(partySize) || partySize <= 0) return undefined;
  if (!Number.isInteger(capacity) || capacity <= 0) return undefined;
  return Math.ceil(partySize / capacity);
}

function fuelRange(
  distanceKm: number,
  fuelEconomyKmPerL: PriceRange,
  fuelPriceJPYPerL: PriceRange,
  vehicles: number,
): PriceRange | undefined {
  if (!validRange(fuelEconomyKmPerL) || fuelEconomyKmPerL[0] <= 0)
    return undefined;
  if (!validRange(fuelPriceJPYPerL)) return undefined;
  return [
    (distanceKm / fuelEconomyKmPerL[1]) * fuelPriceJPYPerL[0] * vehicles,
    (distanceKm / fuelEconomyKmPerL[0]) * fuelPriceJPYPerL[1] * vehicles,
  ];
}

function sumRanges(...ranges: PriceRange[]): PriceRange {
  return ranges.reduce<PriceRange>(
    (total, range) => [total[0] + range[0], total[1] + range[1]],
    [0, 0],
  );
}

function tollRange(
  route: CarRoundTripRoute,
  vehicles: number,
): PriceRange | undefined {
  const outbound = tollAmount(route.outbound);
  const inbound = tollAmount(route.returnRoute);
  if (outbound === undefined || inbound === undefined) return undefined;
  const total = (outbound + inbound) * vehicles;
  return [total, total];
}

function routeInputs(
  route: CarRoundTripRoute,
  options: PersonalCarCostOptions,
):
  | {
      distanceKm: number;
      vehicles: number;
      fuel: PriceRange;
      toll?: PriceRange;
      parking: PriceRange;
    }
  | CarCostResult {
  const vehicles = vehicleCount(
    options.partySize,
    options.vehicleCapacity ?? 5,
  );
  if (vehicles === undefined)
    return unavailable(0, "invalid_party_or_vehicle_capacity");
  const distanceKm = routeDistance(route);
  if (distanceKm === undefined)
    return unavailable(vehicles, "route_unavailable");
  const fuel = fuelRange(
    distanceKm,
    options.fuelEconomyKmPerL,
    options.fuelPriceJPYPerL,
    vehicles,
  );
  if (!fuel)
    return unavailable(vehicles, "fuel_assumption_invalid", distanceKm);
  const toll = tollRange(route, vehicles);
  if (!validRange(options.parkingCostJPY)) {
    return unavailable(vehicles, "parking_unknown", distanceKm);
  }
  const parking: PriceRange = [
    options.parkingCostJPY[0] * vehicles,
    options.parkingCostJPY[1] * vehicles,
  ];
  return { distanceKm, vehicles, fuel, toll, parking };
}

/** Personal car is one vehicle's trip cash cost, scaled only by vehicle count. */
export function calculatePersonalCarCost(
  route: CarRoundTripRoute,
  options: PersonalCarCostOptions,
): CarCostResult {
  if (isRentalCarCostOptions(options)) {
    return unavailable(0, "personal_options_mismatch");
  }
  const inputs = routeInputs(route, options);
  if ("cost" in inputs) return inputs;
  const breakdown = {
    fuel: inputs.fuel,
    ...(inputs.toll ? { toll: inputs.toll } : {}),
    parking: inputs.parking,
  };
  const knownCost = sumRanges(inputs.fuel, inputs.parking);
  const assumptionProvenance =
    options.assumptionProvenance ?? DEFAULT_CAR_ASSUMPTION_PROVENANCE;
  if (!inputs.toll) {
    return unavailable(
      inputs.vehicles,
      "toll_unknown",
      inputs.distanceKm,
      undefined,
      { breakdown, knownCost, assumptionProvenance },
    );
  }
  const total = sumRanges(inputs.fuel, inputs.toll, inputs.parking);
  return {
    cost: { kind: "bounded", min: total[0], max: total[1] },
    breakdown,
    knownCost: total,
    vehiclesNeeded: inputs.vehicles,
    routedDistanceKm: inputs.distanceKm,
    assumptionProvenance,
  };
}

/** Rental charge is duration/class based; route duration never prices possession. */
export function calculateRentalCarCost(
  route: CarRoundTripRoute,
  options: RentalCarCostOptions,
): CarCostResult {
  if (!isRentalCarCostOptions(options)) {
    return unavailable(0, "rental_options_mismatch");
  }
  if (options.duration === "any") {
    return unavailable(0, "rental_duration_unknown");
  }
  const days = getTripDays(options.duration);
  if (!Number.isInteger(days) || days < 1) {
    return unavailable(0, "rental_duration_unknown");
  }
  const inputs = routeInputs(route, options);
  if ("cost" in inputs) {
    return { ...inputs, rentalDays: days };
  }
  const daily = options.dailyRentalChargeJPY[options.vehicleClass];
  if (!daily || !validRange(daily)) {
    return unavailable(
      inputs.vehicles,
      "rental_rate_unknown",
      inputs.distanceKm,
      days,
    );
  }
  const rental: PriceRange = [
    daily[0] * days * inputs.vehicles,
    daily[1] * days * inputs.vehicles,
  ];
  const applicableFees = options.applicableFeesJPY
    ? ([
        options.applicableFeesJPY[0] * inputs.vehicles,
        options.applicableFeesJPY[1] * inputs.vehicles,
      ] as PriceRange)
    : ([0, 0] as PriceRange);
  if (!validRange(applicableFees)) {
    return unavailable(
      inputs.vehicles,
      "rental_fee_unknown",
      inputs.distanceKm,
      days,
    );
  }
  const breakdown = {
    rental,
    fuel: inputs.fuel,
    ...(inputs.toll ? { toll: inputs.toll } : {}),
    parking: inputs.parking,
    applicableFees,
  };
  const knownCost = sumRanges(
    rental,
    inputs.fuel,
    inputs.parking,
    applicableFees,
  );
  const assumptionProvenance =
    options.assumptionProvenance ?? DEFAULT_CAR_ASSUMPTION_PROVENANCE;
  if (!inputs.toll) {
    return unavailable(
      inputs.vehicles,
      "toll_unknown",
      inputs.distanceKm,
      days,
      { breakdown, knownCost, assumptionProvenance },
    );
  }
  const total = sumRanges(
    rental,
    inputs.fuel,
    inputs.toll,
    inputs.parking,
    applicableFees,
  );
  return {
    cost: { kind: "bounded", min: total[0], max: total[1] },
    breakdown,
    knownCost: total,
    vehiclesNeeded: inputs.vehicles,
    routedDistanceKm: inputs.distanceKm,
    rentalDays: days,
    assumptionProvenance,
  };
}
