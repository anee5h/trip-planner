import type { CostAssumptionProvenance } from "@/shared/services/budget/budgetV2";
import type { Destination } from "@/shared/types/destination";
import type { PriceRange } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/types/tripDuration";
import {
  DEFAULT_FUEL_ECONOMY_KM_PER_L,
  DEFAULT_FUEL_PRICE_JPY_PER_L,
  DEFAULT_PARKING_COST_JPY,
  DEFAULT_PERSONAL_CAR_ASSUMPTION_PROVENANCE,
  DEFAULT_RENTAL_CAR_ASSUMPTION_PROVENANCE,
  DEFAULT_RENTAL_DAILY_CHARGES,
  type CarVehicleClass,
  type PersonalCarCostOptions,
  type RentalCarCostOptions,
} from "./carCostV2";

/** The shared planning capacity used when a vehicle-specific capacity is absent. */
export const DEFAULT_CAR_VEHICLE_CAPACITY = 5;

/** Rental mode has no separate class picker yet; compact is the canonical default. */
export const DEFAULT_RENTAL_VEHICLE_CLASS: CarVehicleClass = "compact";

export interface DestinationCarOptionInputs {
  readonly partySize: number;
  readonly vehicleCapacity?: number;
  readonly parkingCostJPY?: PriceRange;
  readonly assumptionProvenance?: CostAssumptionProvenance;
}

export interface DestinationRentalCarOptionInputs extends DestinationCarOptionInputs {
  readonly duration: TripDuration;
  readonly vehicleClass?: CarVehicleClass;
  readonly dailyRentalChargeJPY?: Readonly<Record<CarVehicleClass, PriceRange>>;
  readonly applicableFeesJPY?: PriceRange;
}

/**
 * Return a source-backed parking amount attached to an official parking
 * anchor. Generic planning assumptions remain the fallback when no such
 * destination-specific fee has been verified.
 */
export function getVerifiedDestinationParkingCost(
  destination: Pick<Destination, "carAccess">,
): PriceRange | undefined {
  const access = destination.carAccess;
  if (
    !access ||
    !["official", "government", "tourism_board"].includes(access.evidence)
  ) {
    return undefined;
  }
  return access.anchors.find(
    (anchor) =>
      anchor.kind === "official_parking" &&
      anchor.sourceUrls.length > 0 &&
      anchor.parkingCostJPY !== undefined,
  )?.parkingCostJPY;
}

function sharedCarOptions(
  inputs: DestinationCarOptionInputs,
  defaultProvenance: CostAssumptionProvenance,
): PersonalCarCostOptions {
  return {
    partySize: inputs.partySize,
    vehicleCapacity: inputs.vehicleCapacity ?? DEFAULT_CAR_VEHICLE_CAPACITY,
    fuelEconomyKmPerL: DEFAULT_FUEL_ECONOMY_KM_PER_L,
    fuelPriceJPYPerL: DEFAULT_FUEL_PRICE_JPY_PER_L,
    parkingCostJPY: inputs.parkingCostJPY ?? DEFAULT_PARKING_COST_JPY,
    assumptionProvenance: inputs.assumptionProvenance ?? defaultProvenance,
  };
}

/** Build the canonical cash-cost assumptions for a personal vehicle. */
export function buildPersonalCarCostOptions(
  inputs: DestinationCarOptionInputs,
): PersonalCarCostOptions {
  return sharedCarOptions(inputs, DEFAULT_PERSONAL_CAR_ASSUMPTION_PROVENANCE);
}

/** Build the canonical possession-plus-cash assumptions for a rental vehicle. */
export function buildRentalCarCostOptions(
  inputs: DestinationRentalCarOptionInputs,
): RentalCarCostOptions {
  return {
    ...sharedCarOptions(inputs, DEFAULT_RENTAL_CAR_ASSUMPTION_PROVENANCE),
    duration: inputs.duration,
    vehicleClass: inputs.vehicleClass ?? DEFAULT_RENTAL_VEHICLE_CLASS,
    dailyRentalChargeJPY:
      inputs.dailyRentalChargeJPY ?? DEFAULT_RENTAL_DAILY_CHARGES,
    ...(inputs.applicableFeesJPY
      ? { applicableFeesJPY: inputs.applicableFeesJPY }
      : {}),
  };
}
