import type { Destination } from "@/shared/types/destination";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";

export const TRANSPORT_PRICING_CONFIG = {
  carRentalRates: {
    upTo6h: 7370,
    upTo12h: 7920,
    upTo24h: 10340,
    extraPerHour: 1540,
  },
  gasPricePerLiter: 175,
  train: {
    shortTripMaxMins: 25,
    shortTripBase: 160,
    shortTripPerMin: 8,
    mediumTripMaxMins: 65,
    mediumTripBase: 250,
    mediumTripPerMin: 16,
    longTripBase: 890,
    longTripPerMin: 22,
  },
  shinkansen: {
    baseFare: 2200,
    perMinRate: 62,
  },
  bus: {
    baseFare: 800,
    perMinRate: 11,
  },
  car: {
    circuityMultiplier: 1.1,
    tollRatePerKm: 18,
    fuelConsumptionKmPerLiter: 14,
  },
} as const;

function getRentalBaseFee(tripDurationHours: number): number {
  const rates = TRANSPORT_PRICING_CONFIG.carRentalRates;
  if (tripDurationHours <= 6) return rates.upTo6h;
  if (tripDurationHours <= 12) return rates.upTo12h;
  if (tripDurationHours <= 24) return rates.upTo24h;
  return rates.upTo24h + Math.ceil(tripDurationHours - 24) * rates.extraPerHour;
}

/**
 * Returns the round-trip transport cost for the given party size.
 * Checks explicit route fares (dest.transportFares) first, falling back to
 * configurable duration-based pricing (TRANSPORT_PRICING_CONFIG).
 */
export function getTransportCost(
  dest: Destination,
  mode: string,
  partySize: number = 2,
): number {
  // 1. Explicit Route Fare Precedence (if specified in destination JSON)
  const explicitFare =
    dest.transportFares?.[mode as keyof typeof dest.transportFares];
  if (explicitFare !== undefined) {
    if (mode === "car" || mode === "my_car") {
      // For driving modes, explicitFare represents total round-trip vehicle cost per car (tolls + gas + rental).
      // Scale by vehicles needed for party size (4 seats per car).
      const carsNeeded = Math.ceil(partySize / 4);
      return explicitFare * carsNeeded;
    }
    // For transit modes (train, bus, shinkansen), explicitFare represents one-way ticket fare per person.
    // Scale to round-trip (x2) across partySize.
    const roundTripPerPerson = explicitFare * 2;
    return Math.floor(roundTripPerPerson * partySize);
  }

  // 2. Duration-based Fallback Pricing Heuristics
  const cfg = TRANSPORT_PRICING_CONFIG;

  if (mode === "flight") {
    const flightEst = getFlightTransportEstimate(dest);
    if (flightEst) {
      const avgOneWayPerPerson = Math.round(
        (flightEst.costRange[0] + flightEst.costRange[1]) / 2,
      );
      return Math.floor(avgOneWayPerPerson * 2 * partySize);
    }
  }

  if (
    mode === "shinkansen" &&
    dest.transportOptions?.shinkansen !== undefined
  ) {
    const mins = dest.transportOptions.shinkansen;
    const oneWayPerPerson = Math.round(
      cfg.shinkansen.baseFare + mins * cfg.shinkansen.perMinRate,
    );
    return Math.floor(oneWayPerPerson * 2 * partySize);
  }

  if (mode === "bus" && dest.transportOptions?.bus !== undefined) {
    const mins = dest.transportOptions.bus;
    const oneWayPerPerson = Math.round(
      cfg.bus.baseFare + mins * cfg.bus.perMinRate,
    );
    return Math.floor(oneWayPerPerson * 2 * partySize);
  }

  if (mode === "car" && dest.transportOptions?.car !== undefined) {
    const driveTimeOneWayMin = dest.transportOptions.car;
    const distanceKm = driveTimeOneWayMin * cfg.car.circuityMultiplier;
    const tripDurationHours = dest.totalTripHours || 8;
    const rentalFee = getRentalBaseFee(tripDurationHours);
    const tollsRoundTrip = Math.floor(distanceKm * cfg.car.tollRatePerKm * 2);
    const gasRoundTrip = Math.floor(
      ((distanceKm * 2) / cfg.car.fuelConsumptionKmPerLiter) *
        cfg.gasPricePerLiter,
    );
    const carsNeeded = Math.ceil(partySize / 4);
    return (rentalFee + tollsRoundTrip + gasRoundTrip) * carsNeeded;
  }

  if (mode === "my_car" && dest.transportOptions?.my_car !== undefined) {
    const driveTimeOneWayMin = dest.transportOptions.my_car;
    const distanceKm = driveTimeOneWayMin * cfg.car.circuityMultiplier;
    const tollsRoundTrip = Math.floor(distanceKm * cfg.car.tollRatePerKm * 2);
    const gasRoundTrip = Math.floor(
      ((distanceKm * 2) / cfg.car.fuelConsumptionKmPerLiter) *
        cfg.gasPricePerLiter,
    );
    const carsNeeded = Math.ceil(partySize / 4);
    return (tollsRoundTrip + gasRoundTrip) * carsNeeded;
  }

  if (mode === "train" && dest.transportOptions?.train !== undefined) {
    const mins = dest.transportOptions.train;
    const tCfg = cfg.train;
    let oneWayPerPerson: number;

    if (mins <= tCfg.shortTripMaxMins) {
      oneWayPerPerson = Math.round(
        tCfg.shortTripBase + mins * tCfg.shortTripPerMin,
      );
    } else if (mins <= tCfg.mediumTripMaxMins) {
      oneWayPerPerson = Math.round(
        tCfg.mediumTripBase +
          (mins - tCfg.shortTripMaxMins) * tCfg.mediumTripPerMin,
      );
    } else {
      oneWayPerPerson = Math.round(
        tCfg.longTripBase +
          (mins - tCfg.mediumTripMaxMins) * tCfg.longTripPerMin,
      );
    }

    return Math.floor(oneWayPerPerson * 2 * partySize);
  }

  return ((dest.budgetBreakdown?.transport || 3000) / 2) * partySize;
}

/**
 * Returns the total estimated budget for the party size, substituting the cheapest
 * available transport if activeMode is "all" or "any".
 */
export function getAdjustedBudget(
  dest: Destination,
  activeMode: string,
  partySize: number = 2,
): number {
  let mode = "train";

  if (
    activeMode !== "all" &&
    activeMode !== "any" &&
    (dest.transportOptions?.[
      activeMode as keyof typeof dest.transportOptions
    ] !== undefined ||
      activeMode === "flight")
  ) {
    mode = activeMode;
  } else {
    const entries = Object.entries(dest.transportOptions || {}).filter(
      ([_, v]) => v !== undefined,
    ) as [string, number][];
    if (entries.length > 0) {
      mode = entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0];
    }
  }

  const transportCost = getTransportCost(dest, mode, partySize);
  const recBudget = dest.budgetRecommended || dest.budgetMin || 5000;
  const otherCostsCouple =
    recBudget - (dest.budgetBreakdown?.transport || 3000);
  const otherCosts = Math.max(0, (otherCostsCouple / 2) * partySize);
  return otherCosts + transportCost;
}

export function getEffectiveBudgetBreakdown(dest: Destination): {
  transport: number;
  tickets: number;
  food: number;
  cafe: number;
} {
  if (dest.budgetBreakdown) {
    return dest.budgetBreakdown;
  }
  const totalRec = dest.budgetRecommended || dest.budgetMin || 12000;
  const transport = 3000;
  const tickets = dest.role === "hub" ? 1500 : 2000;
  const remaining = Math.max(2000, totalRec - transport - tickets);
  const food = Math.round(remaining * 0.65);
  const cafe = Math.round(remaining * 0.35);

  return { transport, tickets, food, cafe };
}

// Class wrapper kept for DestinationDetails.tsx which calls budgetService.getTransportCost()
// TODO: remove once DestinationDetails is updated to named imports
export const budgetService = {
  getTransportCost,
  getAdjustedBudget,
  getEffectiveBudgetBreakdown,
};
