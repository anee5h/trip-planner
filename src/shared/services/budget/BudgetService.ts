import type { Destination } from "@/shared/types/destination";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import { getFerryTransportEstimate } from "@/shared/services/transport/FerryTransportEstimator";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import type { BudgetTier, PriceRange } from "@/shared/types/planner";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { MEAL_PRICE_RANGES } from "@/shared/types/planner";
export const ACCOMMODATION_ALLOWANCE_PRESETS = {
  economy: 8000,
  standard: 15000,
  comfortable: 25000,
} as const;
export type AccommodationAllowancePreset =
  keyof typeof ACCOMMODATION_ALLOWANCE_PRESETS;
export const MAX_ACCOMMODATION_ALLOWANCE = 500000;

/**
 * Returns true when value is a finite integer between 0 and MAX_ACCOMMODATION_ALLOWANCE inclusive.
 */
export function isValidAccommodationAllowance(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_ACCOMMODATION_ALLOWANCE
  );
}

function formatSingleJPYValue(val: number, locale: "en" | "ja" = "en"): string {
  if (locale === "ja") {
    if (val >= 10000) {
      const man = val / 10000;
      return `${Number.isInteger(man) ? man : man.toFixed(1)}万`;
    }
    if (val >= 1000) {
      const sen = val / 1000;
      return `${Number.isInteger(sen) ? sen : sen.toFixed(1)}千`;
    }
    return `${val}`;
  }

  // English formatting
  if (val >= 1000) {
    const k = val / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${val}`;
}

export function formatLocalizedJPYRange(
  range: PriceRange,
  locale: "en" | "ja" = "en",
): string {
  const [min, max] = range.map((value) => Math.round(value));
  const rangeSep = locale === "ja" ? "〜" : "–";

  if (min === max) {
    return `¥${formatSingleJPYValue(min, locale)}`;
  }

  return `¥${formatSingleJPYValue(min, locale)}${rangeSep}${formatSingleJPYValue(max, locale)}`;
}

export function formatJPYRange(range: PriceRange): string {
  const [min, max] = range.map((value) => Math.round(value));
  return min === max
    ? `¥${min.toLocaleString()}`
    : `¥${min.toLocaleString()}–${max.toLocaleString()}`;
}

export function getDiningFoodRange(
  tier: BudgetTier = "standard",
  totalTripHours: number,
  partySize: number,
): PriceRange {
  const meals =
    totalTripHours < 5
      ? ["lunch"]
      : totalTripHours <= 9
        ? ["lunch", "dinner"]
        : ["breakfast", "lunch", "dinner"];
  const ranges = meals.map(
    (meal) =>
      MEAL_PRICE_RANGES[tier][
        meal as keyof (typeof MEAL_PRICE_RANGES)[BudgetTier]
      ],
  );
  return [
    ranges.reduce((total, [min]) => total + min, 0) * partySize,
    ranges.reduce((total, [, max]) => total + max, 0) * partySize,
  ];
}

export interface EstimatedBudgetRangeResult {
  range: PriceRange;
  transportIncluded: boolean;
}

export function getEstimatedBudgetRange(
  dest: Destination,
  mode: string,
  partySize: number,
  budgetTier: BudgetTier = "standard",
  totalTripHours: number = dest.totalTripHours,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): EstimatedBudgetRangeResult {
  const breakdown = getEffectiveBudgetBreakdown(dest);
  const scale = partySize / 2;
  const rawTransport = getTransportCost(
    dest,
    mode,
    partySize,
    homeCoords,
    ferryTemporal,
  );
  const transportIncluded = rawTransport !== null;
  const transport = rawTransport ?? 0;
  const food = getDiningFoodRange(budgetTier, totalTripHours, partySize);
  const transfers: Record<BudgetTier, PriceRange> = {
    economy: [0, 600],
    standard: [500, 1500],
    comfortable: [1500, 5000],
    luxury: [5000, 15000],
  };
  const transfer = transfers[budgetTier];
  const tickets = breakdown.tickets * scale;
  const cafe = breakdown.cafe * scale;
  return {
    range: [
      Math.round((transport + tickets + food[0] + cafe + transfer[0]) * 1.05),
      Math.round((transport + tickets + food[1] + cafe + transfer[1]) * 1.05),
    ],
    transportIncluded,
  };
}

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
 * Returns the round-trip transport cost for the given party size, or null if
 * no cost could be computed (e.g. unverified flight fare, missing option).
 * Checks explicit route fares (dest.transportFares) first, falling back to
 * configurable duration-based pricing (TRANSPORT_PRICING_CONFIG).
 */
export function getTransportCost(
  dest: Destination,
  mode: string,
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): number | null {
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
    const flightEst = getFlightTransportEstimate(dest, homeCoords);
    if (flightEst && !flightEst.costUnavailable) {
      const avgOneWayPerPerson = Math.round(
        (flightEst.costRange[0] + flightEst.costRange[1]) / 2,
      );
      return Math.floor(avgOneWayPerPerson * 2 * partySize);
    }
    return null;
  }

  if (mode === "ferry") {
    const ferryEst = getFerryTransportEstimate(dest, homeCoords, ferryTemporal);
    if (ferryEst && !ferryEst.costUnavailable) {
      const avgRoundTripPerPerson = Math.round(
        (ferryEst.costRange[0] + ferryEst.costRange[1]) / 2,
      );
      // One-way fares are doubled for the return trip; round-trip fares
      // already include it and must not be doubled again.
      const multiplier =
        ferryEst.details?.ferryFareBasis === "round-trip" ? 1 : 2;
      return Math.floor(avgRoundTripPerPerson * multiplier * partySize);
    }
    return null;
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

  return null;
}

/**
 * Returns the total estimated budget for the party size, substituting the
 * cheapest authorized transport if activeMode is "all" or "any".
 *
 * Authorization uses the same sources as the recommendation pipeline:
 * explicit topology edges for rail/road/bus, the flight-route registry for
 * flight, and the ferry route registry for ferry. When no authorized mode
 * exists the generic breakdown fallback is returned — never a Train cost.
 */
export function getAdjustedBudget(
  dest: Destination,
  activeMode: string,
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  originZoneId?: TransportZoneId,
  ferryTemporal?: FerryTemporalContext,
): number {
  let mode: string | undefined;

  const effectiveOriginZoneId =
    originZoneId ??
    (homeCoords
      ? resolveOriginTransportZone({ coordinates: homeCoords })
      : undefined);
  const destinationZoneId = resolveDestinationTransportZone(dest);

  if (
    activeMode !== "all" &&
    activeMode !== "any" &&
    (dest.transportOptions?.[
      activeMode as keyof typeof dest.transportOptions
    ] !== undefined ||
      activeMode === "flight" ||
      activeMode === "ferry")
  ) {
    mode = activeMode;
  } else if (effectiveOriginZoneId && destinationZoneId !== "unknown") {
    const topologyModes = getEligibleOriginModes({
      originZoneId: effectiveOriginZoneId,
      destinationZoneId,
      destination: dest,
    });
    const authorized = new Set<string>(
      effectiveOriginZoneId === destinationZoneId
        ? topologyModes.localModes
        : topologyModes.crossZoneModes,
    );
    const entries = Object.entries(dest.transportOptions || {}).filter(
      ([_, v]) => v !== undefined,
    ) as [string, number][];
    const candidates = entries.filter(([m]) => authorized.has(m));
    if (candidates.length > 0) {
      mode = candidates.reduce((min, curr) =>
        curr[1] < min[1] ? curr : min,
      )[0];
    }
  }

  const transportCost =
    mode === undefined
      ? null
      : getTransportCost(dest, mode, partySize, homeCoords, ferryTemporal);
  const recBudget = dest.budgetRecommended || dest.budgetMin || 5000;
  const otherCostsCouple =
    recBudget - (dest.budgetBreakdown?.transport || 3000);
  const otherCosts = Math.max(0, (otherCostsCouple / 2) * partySize);
  return otherCosts + (transportCost ?? 0);
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

  // Check if destination is free ticket
  const isFree = isFreeDestination(dest);
  const tickets = isFree ? 0 : dest.role === "hub" ? 1500 : 2000;
  const remaining = Math.max(2000, totalRec - transport - tickets);
  const food = Math.round(remaining * 0.65);
  const cafe = Math.round(remaining * 0.35);

  return { transport, tickets, food, cafe };
}

export function isFreeDestination(dest: Destination): boolean {
  if (!dest) return false;
  if (dest.budgetMin === 0 && dest.budgetMax === 0) return true;
  const freeKeywords = [
    "free observatory",
    "free",
    "park",
    "shrine",
    "temple",
    "garden",
  ];
  const hasFreeCategory = dest.categories?.some((c) =>
    freeKeywords.some((k) => c.toLowerCase().includes(k)),
  );
  const hasFreeTag = dest.tags?.some((t) =>
    freeKeywords.some((k) => t.toLowerCase().includes(k)),
  );
  return Boolean(hasFreeCategory || hasFreeTag);
}

export interface ItemizedCostBreakdown {
  transport: number;
  tickets: number;
  food: PriceRange;
  cafe: number;
  parking: number;
  perPersonRange: PriceRange;
  partyRange: PriceRange;
  isFreeTicket: boolean;
  confidence: "high" | "medium" | "estimated";
  accommodationAllowance: number;
}

export function calculateItemizedTripCost(
  dest: Destination,
  options: {
    activeMode?: string | null;
    partySize?: number;
    budgetTier?: BudgetTier;
    totalTripHours?: number;
    homeCoords?: { lat: number; lng: number };
    ferryTemporal?: FerryTemporalContext;
    accommodationAllowance?: number;
  } = {},
): ItemizedCostBreakdown {
  const partySize = options.partySize ?? 2;
  // null means no estimable origin route: origin transport is excluded
  // from the total, never defaulted to Train.
  const mode = options.activeMode ?? null;
  const budgetTier = options.budgetTier ?? "standard";
  const totalTripHours = options.totalTripHours ?? dest.totalTripHours ?? 6;

  const isFreeTicket = isFreeDestination(dest);
  const breakdown = getEffectiveBudgetBreakdown(dest);

  const rawTransport =
    mode === null
      ? 0
      : getTransportCost(
          dest,
          mode,
          partySize,
          options.homeCoords,
          options.ferryTemporal,
        );
  const transport =
    Number.isNaN(rawTransport) || !rawTransport ? 0 : rawTransport;
  const tickets = isFreeTicket ? 0 : (breakdown.tickets || 0) * partySize;
  const food = getDiningFoodRange(budgetTier, totalTripHours, partySize);
  const cafe = (breakdown.cafe || 0) * partySize;
  const parking = mode === "car" || mode === "my_car" ? 1200 : 0;
  const accommodationAllowance = options.accommodationAllowance ?? 0;

  const minPartyTotal = Math.round(
    transport + tickets + food[0] + cafe + parking + accommodationAllowance,
  );
  const maxPartyTotal = Math.round(
    transport + tickets + food[1] + cafe + parking + accommodationAllowance,
  );

  const perPersonMin = Math.round(minPartyTotal / partySize);
  const perPersonMax = Math.round(maxPartyTotal / partySize);

  let confidence: "high" | "medium" | "estimated" = "estimated";
  if (
    dest.transportFares?.[mode as keyof typeof dest.transportFares] !==
    undefined
  ) {
    confidence = "high";
  } else if (dest.budgetBreakdown) {
    confidence = "medium";
  }

  return {
    transport,
    tickets,
    food,
    cafe,
    parking,
    perPersonRange: [perPersonMin, perPersonMax],
    partyRange: [minPartyTotal, maxPartyTotal],
    isFreeTicket,
    confidence,
    accommodationAllowance,
  };
}

// Class wrapper kept for DestinationDetails.tsx which calls budgetService.getTransportCost()
export const budgetService = {
  getTransportCost,
  getAdjustedBudget,
  getEffectiveBudgetBreakdown,
  calculateItemizedTripCost,
  isFreeDestination,
};
