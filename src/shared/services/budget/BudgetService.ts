import type { Destination } from "@/shared/types/destination";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import { getFerryTransportEstimate } from "@/shared/services/transport/FerryTransportEstimator";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import type { BudgetTier, PriceRange } from "@/shared/types/planner";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type {
  FerryTemporalContext,
  TransportFareScope,
  TransportMode,
} from "@/shared/services/transport/types";
import { MEAL_PRICE_RANGES } from "@/shared/types/planner";
import { estimateTripDuration } from "@/shared/services/recommendation/TripDurationService";
import { isValidAccommodationAllowance } from "@/shared/types/homePlannerState";
export {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  MAX_ACCOMMODATION_ALLOWANCE,
} from "@/shared/types/homePlannerState";
export { isValidAccommodationAllowance };
export type { AccommodationAllowancePreset } from "@/shared/types/homePlannerState";

const COST_UNAVAILABLE = { en: "Cost unavailable", ja: "料金不明" } as const;

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidPriceRange(range: readonly unknown[]): range is PriceRange {
  return (
    range.length === 2 &&
    isFiniteNonNegative(range[0]) &&
    isFiniteNonNegative(range[1]) &&
    range[0] <= range[1]
  );
}

function finiteNonNegativeOrUndefined(value: unknown): number | undefined {
  return isFiniteNonNegative(value) ? value : undefined;
}

/**
 * Returns false for legacy records with no trustworthy price source.
 * KAI-89: budgetMetadata.method "unknown" is AUTHORITATIVE — even if legacy
 * numbers linger on the record, the metadata state wins and the budget is
 * treated as unknown (never 0, never free, never compared).
 * KAI-204 phase 3: method "legacy" (numeric values without recoverable
 * provenance) is treated the SAME as unknown for trust purposes — the
 * numbers exist in storage but are not trustworthy enough for consumers.
 */
export function hasKnownBudget(dest: Destination): boolean {
  const method = dest.budgetMetadata?.method;
  if (method === "unknown" || method === "legacy") return false;
  const breakdown = dest.budgetBreakdown;
  const bMin = dest.budgetMin;
  const bMax = dest.budgetMax;
  return Boolean(
    (breakdown &&
      [
        breakdown.transport,
        breakdown.tickets,
        breakdown.food,
        breakdown.cafe,
      ].every(isFiniteNonNegative) &&
      isFiniteNonNegative(dest.budgetRecommended)) ||
    (isFiniteNonNegative(bMin) && isFiniteNonNegative(bMax) && bMin <= bMax),
  );
}

/**
 * True when the record carries explicit trusted provenance (manual verified
 * ticket or documented model output). "legacy" and "unknown" are never
 * trusted for consumption.
 */
export function hasTrustedBudgetProvenance(dest: Destination): boolean {
  const method = dest.budgetMetadata?.method;
  return method === "manual" || method === "model";
}

/**
 * KAI-89 type guard: both budget bounds are finite known values with a
 * valid order. Narrows the Destination so consumers can safely do price
 * arithmetic (unknown budgets must never act as 0/free in comparisons,
 * ranking, or rendering).
 */
export function hasKnownBudgetRange(
  dest: Destination,
): dest is Destination & { budgetMin: number; budgetMax: number } {
  // budgetMetadata.method "unknown" is authoritative: even with numbers on
  // the record, the budget is unknown (two competing truths must never
  // surface through the type guard). KAI-204 phase 3: method "legacy" is
  // treated identically — numbers without recoverable provenance are not
  // trustworthy for consumption.
  const method = dest.budgetMetadata?.method;
  if (method === "unknown" || method === "legacy") return false;
  return (
    typeof dest.budgetMin === "number" &&
    Number.isFinite(dest.budgetMin) &&
    typeof dest.budgetMax === "number" &&
    Number.isFinite(dest.budgetMax) &&
    dest.budgetMin >= 0 &&
    dest.budgetMin <= dest.budgetMax
  );
}

/**
 * Runtime-derived trip duration in hours. Uses the canonical visit duration
 * and adds canonical origin-aware round-trip travel for exactly the requested
 * mode. Catchment access is already included as bounded/estimated time;
 * returns `undefined` when the destination cannot be duration-planned or the
 * requested mode has no origin-aware estimate.
 */
function deriveTripDurationHours(
  dest: Destination,
  mode?: string,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): number | undefined {
  if (!dest.recommendedVisitHours) return undefined;
  const modes =
    mode && mode !== "all" && mode !== "any" ? [mode as TransportMode] : [];
  // With no concrete mode there is no travel to price; meals then use the
  // visit duration only. A concrete mode without a verified origin estimate
  // remains unknown rather than being approximated.
  return estimateTripDuration(
    dest,
    {
      homeStationCoords:
        modes.length > 0 ? (homeCoords ?? undefined) : undefined,
      ferryTemporal,
    },
    modes,
  )?.representativeHours;
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
  range: PriceRange | null | undefined,
  locale: "en" | "ja" = "en",
): string {
  if (!range || !isValidPriceRange(range)) {
    return COST_UNAVAILABLE[locale];
  }
  const [min, max] = range.map((value) => Math.round(value));
  const rangeSep = locale === "ja" ? "〜" : "–";

  if (min === max) {
    return `¥${formatSingleJPYValue(min, locale)}`;
  }

  return `¥${formatSingleJPYValue(min, locale)}${rangeSep}${formatSingleJPYValue(max, locale)}`;
}

export function formatJPYRange(range: PriceRange | null | undefined): string {
  if (!range || !isValidPriceRange(range)) {
    return COST_UNAVAILABLE.en;
  }
  const [min, max] = range.map((value) => Math.round(value));
  return min === max
    ? `¥${min.toLocaleString()}`
    : `¥${min.toLocaleString()}–${max.toLocaleString()}`;
}

export function getDiningFoodRange(
  tier: BudgetTier = "standard",
  tripDurationHours: number | undefined,
  partySize: number,
): PriceRange | null {
  if (
    tripDurationHours === undefined ||
    !Number.isFinite(tripDurationHours) ||
    tripDurationHours < 0 ||
    !isFiniteNonNegative(partySize)
  ) {
    return null;
  }
  const normalizedPartySize = Math.max(1, Math.floor(partySize));
  const meals =
    tripDurationHours < 5
      ? ["lunch"]
      : tripDurationHours <= 9
        ? ["lunch", "dinner"]
        : ["breakfast", "lunch", "dinner"];
  const ranges = meals.map(
    (meal) =>
      MEAL_PRICE_RANGES[tier][
        meal as keyof (typeof MEAL_PRICE_RANGES)[BudgetTier]
      ],
  );
  return [
    ranges.reduce((total, [min]) => total + min, 0) * normalizedPartySize,
    ranges.reduce((total, [, max]) => total + max, 0) * normalizedPartySize,
  ];
}

export interface EstimatedBudgetRangeResult {
  /** Cost range for this mode; complete only when both inclusion flags are true. */
  range: PriceRange | null;
  /** True when the verified corridor fare is included; access fare may be unmodeled. */
  transportIncluded: boolean;
  /** Whether the included transport fare covers the complete OD, a corridor,
   * or a bounded local estimate. */
  transportFareScope: TransportFareScope;
  /** True when trip duration was derived for exactly this mode. */
  durationIncluded: boolean;
  /** Meal range for this mode, or null when trip duration is unknown. */
  food: PriceRange | null;
}

function getTransportFareScope(
  dest: Destination,
  mode: string,
  homeCoords: { lat: number; lng: number } | undefined,
  ferryTemporal: FerryTemporalContext | undefined,
  transportIncluded: boolean,
): EstimatedBudgetRangeResult["transportFareScope"] {
  if (!transportIncluded || !homeCoords) return "unknown";
  // Flight and ferry fares cover the complete origin-destination journey
  // (verified airport/port-to-port products); only ground intercity fares
  // can be corridor-only when bounded access is estimated.
  if (mode === "flight" || mode === "ferry") return "complete";
  if (mode !== "train" && mode !== "shinkansen" && mode !== "bus") {
    return "unknown";
  }
  const estimate = getOriginAwareTransportEstimate(
    dest,
    { homeStationCoords: homeCoords, ferryTemporal },
    [mode as TransportMode],
  );
  if (!estimate?.fare) return "unknown";
  if (estimate.fareScope) return estimate.fareScope;
  return estimate.evidence === "estimated" ? "corridor_only" : "complete";
}

export function getEstimatedBudgetRange(
  dest: Destination,
  mode: string,
  partySize: number,
  budgetTier: BudgetTier = "standard",
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): EstimatedBudgetRangeResult {
  const effectiveTripDurationHours = deriveTripDurationHours(
    dest,
    mode,
    homeCoords,
    ferryTemporal,
  );
  const breakdown = getEffectiveBudgetBreakdown(dest);
  // KAI-89 contract: catalogue budget values are PER-PERSON (budgetMin/Max
  // multiply by partySize in the card; the budget model emits per-person
  // components). The legacy couple-scale assumption (partySize / 2) made
  // solo travellers pay half and masked the bug at party size 2.
  const scale = partySize;
  const rawTransport = getTransportCost(
    dest,
    mode,
    partySize,
    homeCoords,
    ferryTemporal,
    effectiveTripDurationHours,
  );
  const transportIncluded = rawTransport !== null;
  const transportFareScope = getTransportFareScope(
    dest,
    mode,
    homeCoords,
    ferryTemporal,
    transportIncluded,
  );
  if (!breakdown) {
    return {
      range: null,
      transportIncluded,
      transportFareScope,
      durationIncluded: false,
      food: null,
    };
  }
  const transport = rawTransport ?? 0;
  const food =
    effectiveTripDurationHours === undefined
      ? null
      : getDiningFoodRange(budgetTier, effectiveTripDurationHours, partySize);
  if (!food) {
    return {
      range: null,
      transportIncluded,
      transportFareScope,
      durationIncluded: false,
      food: null,
    };
  }
  // KAI-89 on-site transport contract: budgetBreakdown.transport is the
  // PER-PERSON on-site/local-transit allowance and is part of the trip cost.
  // It replaces the legacy hardcoded per-tier transfer band (which was a
  // synthetic stand-in — keeping both would double count local transit).
  const onsiteTransit = breakdown.transport * scale;
  const tickets = breakdown.tickets * scale;
  const cafe = breakdown.cafe * scale;
  return {
    range: [
      Math.round((transport + onsiteTransit + tickets + food[0] + cafe) * 1.05),
      Math.round((transport + onsiteTransit + tickets + food[1] + cafe) * 1.05),
    ],
    transportIncluded,
    transportFareScope,
    durationIncluded: true,
    food,
  };
}

/**
 * Lowest finite trip-budget metric across the given modes. Verified complete
 * and corridor-only estimates remain numerically sortable for the existing
 * diagnostic contract, while local bounded estimates add an explicitly
 * scoped third state. Callers that need affordability or "complete" claims
 * must inspect `transportFareScope`; unknown/on-site-only values stay at
 * PositiveInfinity and never become zero-cost.
 */
export function getSortableVerifiedBudget(
  dest: Destination,
  modes: readonly string[],
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
  budgetTier: BudgetTier = "standard",
): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const mode of modes) {
    const estimate = getEstimatedBudgetRange(
      dest,
      mode,
      partySize,
      budgetTier,
      homeCoords,
      ferryTemporal,
    );
    if (
      estimate.transportIncluded &&
      estimate.durationIncluded &&
      estimate.range
    ) {
      lowest = Math.min(lowest, estimate.range[1]);
    }
  }
  return lowest;
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
  /**
   * Explicit mode-matched trip duration for rental tier selection. Must
   * correspond to `mode`; when omitted the mode-specific duration is derived
   * internally and unknown durations make car rental unavailable.
   */
  tripDurationHours?: number,
): number | null {
  if (!isFiniteNonNegative(partySize)) return null;
  const normalizedPartySize = Math.max(1, Math.floor(partySize));

  // 1. Explicit Route Fare Precedence (if specified in destination JSON)
  const explicitFare =
    dest.transportFares?.[mode as keyof typeof dest.transportFares];
  if (explicitFare !== undefined) {
    if (!isFiniteNonNegative(explicitFare)) return null;
    if (mode === "car" || mode === "my_car") {
      // For driving modes, explicitFare represents total round-trip vehicle cost per car (tolls + gas + rental).
      // Scale by vehicles needed for party size (4 seats per car).
      const carsNeeded = Math.ceil(normalizedPartySize / 4);
      return explicitFare * carsNeeded;
    }
    // For transit modes (train, bus, shinkansen), explicitFare represents one-way ticket fare per person.
    // Scale to round-trip (x2) across partySize.
    const roundTripPerPerson = explicitFare * 2;
    return Math.floor(roundTripPerPerson * normalizedPartySize);
  }

  // 2. Verified origin-aware registry fare (ground modes only): when the
  // corridor registry carries a verified one-way adult fare for the same
  // product the duration describes, it wins over heuristics (FARE_POLICY
  // §0–§2). A catchment estimate may use this corridor fare, but never adds
  // an invented access fare.
  if (
    homeCoords &&
    (mode === "train" || mode === "shinkansen" || mode === "bus")
  ) {
    const estimate = getOriginAwareTransportEstimate(
      dest,
      { homeStationCoords: homeCoords, ferryTemporal },
      [mode as TransportMode],
    );
    if (estimate?.fare) {
      // Dynamic bus fares may have a null upper bound ("from ¥X"): the
      // verified lower bound is the advertised minimum — never treat a
      // dynamic fare as fixed truth above it.
      const lower = estimate.fare[0];
      const upper = estimate.fare[1] ?? lower;
      if (
        !isFiniteNonNegative(lower) ||
        !isFiniteNonNegative(upper) ||
        lower > upper
      ) {
        return null;
      }
      const avgOneWayPerPerson = Math.round((lower + upper) / 2);
      return Math.floor(avgOneWayPerPerson * 2 * normalizedPartySize);
    }
    // A bounded access duration is not evidence for a duration-priced fare.
    if (estimate?.evidence === "estimated") return null;
  }

  // 3. Duration-based Fallback Pricing Heuristics
  const cfg = TRANSPORT_PRICING_CONFIG;

  // With an explicit origin, ground pricing must use the verified
  // origin-aware duration; without one the cost is unknown (never a
  // fabricated price from unprovenanced catalogue minutes).
  let originAwareMinutes: number | undefined;
  if (homeCoords && mode !== "flight" && mode !== "ferry") {
    const estimate = getOriginAwareTransportEstimate(
      dest,
      { homeStationCoords: homeCoords, ferryTemporal },
      [mode as TransportMode],
    );
    if (!estimate) return null;
    const [minMinutes, maxMinutes] = estimate.timeRange;
    if (
      !isFiniteNonNegative(minMinutes) ||
      !isFiniteNonNegative(maxMinutes) ||
      minMinutes > maxMinutes
    ) {
      return null;
    }
    originAwareMinutes = Math.round((minMinutes + maxMinutes) / 2);
  }

  if (mode === "flight") {
    const flightEst = getFlightTransportEstimate(
      dest,
      homeCoords,
      ferryTemporal?.travelDate,
    );
    if (
      flightEst &&
      !flightEst.costUnavailable &&
      isValidPriceRange(flightEst.costRange)
    ) {
      const avgOneWayPerPerson = Math.round(
        (flightEst.costRange[0] + flightEst.costRange[1]) / 2,
      );
      return Math.floor(avgOneWayPerPerson * 2 * normalizedPartySize);
    }
    return null;
  }

  if (mode === "ferry") {
    const ferryEst = getFerryTransportEstimate(dest, homeCoords, ferryTemporal);
    if (
      ferryEst &&
      !ferryEst.costUnavailable &&
      isValidPriceRange(ferryEst.costRange)
    ) {
      const avgRoundTripPerPerson = Math.round(
        (ferryEst.costRange[0] + ferryEst.costRange[1]) / 2,
      );
      // One-way fares are doubled for the return trip; round-trip fares
      // already include it and must not be doubled again.
      const multiplier =
        ferryEst.details?.ferryFareBasis === "round-trip" ? 1 : 2;
      return Math.floor(
        avgRoundTripPerPerson * multiplier * normalizedPartySize,
      );
    }
    return null;
  }

  if (mode === "shinkansen") {
    const mins = finiteNonNegativeOrUndefined(
      originAwareMinutes ?? dest.transportOptions?.shinkansen,
    );
    if (mins === undefined) return null;
    const oneWayPerPerson = Math.round(
      cfg.shinkansen.baseFare + mins * cfg.shinkansen.perMinRate,
    );
    return Math.floor(oneWayPerPerson * 2 * normalizedPartySize);
  }

  if (mode === "bus") {
    const mins = finiteNonNegativeOrUndefined(
      originAwareMinutes ?? dest.transportOptions?.bus,
    );
    if (mins === undefined) return null;
    const oneWayPerPerson = Math.round(
      cfg.bus.baseFare + mins * cfg.bus.perMinRate,
    );
    return Math.floor(oneWayPerPerson * 2 * normalizedPartySize);
  }

  if (mode === "car") {
    const driveTimeOneWayMin = finiteNonNegativeOrUndefined(
      originAwareMinutes ?? dest.transportOptions?.car,
    );
    if (driveTimeOneWayMin === undefined) return null;
    const distanceKm = driveTimeOneWayMin * cfg.car.circuityMultiplier;
    const rentalDurationHours =
      tripDurationHours ??
      deriveTripDurationHours(dest, mode, homeCoords, ferryTemporal);
    if (!isFiniteNonNegative(rentalDurationHours)) return null;
    const rentalFee = getRentalBaseFee(rentalDurationHours);
    const tollsRoundTrip = Math.floor(distanceKm * cfg.car.tollRatePerKm * 2);
    const gasRoundTrip = Math.floor(
      ((distanceKm * 2) / cfg.car.fuelConsumptionKmPerLiter) *
        cfg.gasPricePerLiter,
    );
    const carsNeeded = Math.ceil(normalizedPartySize / 4);
    return (rentalFee + tollsRoundTrip + gasRoundTrip) * carsNeeded;
  }

  if (mode === "my_car") {
    const driveTimeOneWayMin = finiteNonNegativeOrUndefined(
      originAwareMinutes ?? dest.transportOptions?.my_car,
    );
    if (driveTimeOneWayMin === undefined) return null;
    const distanceKm = driveTimeOneWayMin * cfg.car.circuityMultiplier;
    const tollsRoundTrip = Math.floor(distanceKm * cfg.car.tollRatePerKm * 2);
    const gasRoundTrip = Math.floor(
      ((distanceKm * 2) / cfg.car.fuelConsumptionKmPerLiter) *
        cfg.gasPricePerLiter,
    );
    const carsNeeded = Math.ceil(normalizedPartySize / 4);
    return (tollsRoundTrip + gasRoundTrip) * carsNeeded;
  }

  if (mode === "train") {
    const mins = finiteNonNegativeOrUndefined(
      originAwareMinutes ?? dest.transportOptions?.train,
    );
    if (mins === undefined) return null;
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

    return Math.floor(oneWayPerPerson * 2 * normalizedPartySize);
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
 * A destination with no trustworthy price source returns null.
 */
export function getAdjustedBudget(
  dest: Destination,
  activeMode: string,
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  originZoneId?: TransportZoneId,
  ferryTemporal?: FerryTemporalContext,
): number | null {
  if (!isFiniteNonNegative(partySize)) return null;
  const normalizedPartySize = Math.max(1, Math.floor(partySize));
  const hasExplicitMode = activeMode !== "all" && activeMode !== "any";
  let mode: string | undefined;

  const effectiveOriginZoneId =
    originZoneId ??
    (homeCoords
      ? resolveOriginTransportZone({ coordinates: homeCoords })
      : undefined);
  const destinationZoneId = resolveDestinationTransportZone(dest);
  const canonicalActiveMode =
    homeCoords && (activeMode === "bus" || activeMode === "shinkansen")
      ? Boolean(
          getOriginAwareTransportEstimate(
            dest,
            {
              homeStationCoords: homeCoords,
              originZoneId: effectiveOriginZoneId,
              ferryTemporal,
            },
            [activeMode],
          ),
        )
      : false;
  // With a personalized coordinate origin, Bus/Shinkansen mode selection is
  // canonical-only: stale transportOptions must not resurrect a missing
  // personalized corridor. Without coordinates (neutral/zone-only) the
  // legacy metadata display path remains.
  const activeModeSupported =
    homeCoords && (activeMode === "bus" || activeMode === "shinkansen")
      ? canonicalActiveMode
      : dest.transportOptions?.[
          activeMode as keyof typeof dest.transportOptions
        ] !== undefined;

  if (
    hasExplicitMode &&
    (activeModeSupported || activeMode === "flight" || activeMode === "ferry")
  ) {
    mode = activeMode;
  } else if (hasExplicitMode) {
    return null;
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
  if (hasExplicitMode && transportCost === null) return null;
  const breakdown = getEffectiveBudgetBreakdown(dest);
  if (!breakdown) return null;
  const recBudget = isFiniteNonNegative(dest.budgetRecommended)
    ? dest.budgetRecommended
    : isFiniteNonNegative(dest.budgetMin) && isFiniteNonNegative(dest.budgetMax)
      ? Math.max(dest.budgetMin, dest.budgetMax)
      : breakdown.transport +
        breakdown.tickets +
        breakdown.food +
        breakdown.cafe;
  // KAI-89 contract: catalogue values are per-person; ALL on-site components
  // (transport/tickets/food/cafe) scale directly with the party, and the
  // per-person on-site/local-transit allowance is included (previously
  // subtracted and never re-added — the adjusted total omitted on-site
  // transit entirely). Origin transport is added separately by the caller.
  const otherCosts = Math.max(0, recBudget) * normalizedPartySize;
  return otherCosts + (transportCost ?? 0);
}

export function getEffectiveBudgetBreakdown(dest: Destination): {
  transport: number;
  tickets: number;
  food: number;
  cafe: number;
} | null {
  // KAI-89: budgetMetadata.method "unknown" is AUTHORITATIVE — even a
  // breakdown present on the record must not be consumed as known.
  // KAI-204 phase 3: method "legacy" is treated identically — numeric values
  // without recoverable provenance must not enter consumption.
  const method = dest.budgetMetadata?.method;
  if (method === "unknown" || method === "legacy") return null;
  if (
    dest.budgetBreakdown &&
    [
      dest.budgetBreakdown.transport,
      dest.budgetBreakdown.tickets,
      dest.budgetBreakdown.food,
      dest.budgetBreakdown.cafe,
    ].every(isFiniteNonNegative)
  ) {
    return dest.budgetBreakdown;
  }
  // KAI-89 review: NO synthetic breakdown. A known range without a valid
  // breakdown returns null — the runtime must NEVER invent admission
  // (tickets are factual-only: "NEVER estimated from kind") or split a
  // remainder 65/35 into food/cafe. Unknown stays unknown; consumers render
  // "cost unavailable" instead of fabricated numbers.
  return null;
}

export function isFreeDestination(dest: Destination): boolean {
  if (!dest || !hasKnownBudget(dest)) return false;
  // KAI-204 (Phase 5): a zero range is only "free" when the record carries
  // trusted provenance (manual/model metadata). Absent metadata means the
  // numbers are legacy debt with no verified source — a min=0/max=0 pair on
  // such a record is not evidence of free admission (undefined/null/NaN/
  // missing-metadata must never become 0 or "Free"). Verified free always
  // requires ledger/ledger-derived evidence or an approved class rule.
  if (dest.budgetMin === 0 && dest.budgetMax === 0) {
    return (
      dest.budgetMetadata?.method === "manual" ||
      dest.budgetMetadata?.method === "model"
    );
  }
  const freeKeywords = ["free observatory", "free"];
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
  /** False when origin transport cost is unavailable or unknown; never
   *  presented as a verified zero-cost estimate. */
  transportAvailable: boolean;
  /** Per-party on-site/local-transit allowance from the catalogue
   *  (budgetBreakdown.transport × partySize; KAI-89 per-person contract). */
  localTransit: number;
  tickets: number;
  /** Meal range, or null when trip duration is unknown. */
  food: PriceRange | null;
  cafe: number;
  parking: number;
  perPersonRange: PriceRange;
  partyRange: PriceRange;
  isFreeTicket: boolean;
  confidence: "high" | "medium" | "estimated";
  accommodationAllowance: number;
  /** True when trip duration is known and meal/rental costs are included. */
  durationKnown: boolean;
  /** False when the catalogue has no trustworthy price source. */
  budgetAvailable: boolean;
}

export function calculateItemizedTripCost(
  dest: Destination,
  options: {
    activeMode?: string | null;
    partySize?: number;
    budgetTier?: BudgetTier;
    /** Intentional caller-known trip duration for the active mode. */
    tripDurationHours?: number;
    homeCoords?: { lat: number; lng: number };
    ferryTemporal?: FerryTemporalContext;
    accommodationAllowance?: number;
  } = {},
): ItemizedCostBreakdown {
  const requestedPartySize = options.partySize ?? 2;
  const partySize = isFiniteNonNegative(requestedPartySize)
    ? Math.max(1, Math.floor(requestedPartySize))
    : 2;
  const accommodationAllowance = isValidAccommodationAllowance(
    options.accommodationAllowance ?? 0,
  )
    ? (options.accommodationAllowance ?? 0)
    : 0;
  // null means no estimable origin route: origin transport is excluded
  // from the total, never defaulted to Train.
  const mode = options.activeMode ?? null;
  const budgetTier = options.budgetTier ?? "standard";
  const tripDurationHours =
    options.tripDurationHours ??
    deriveTripDurationHours(
      dest,
      options.activeMode ?? undefined,
      options.homeCoords,
      options.ferryTemporal,
    );
  const durationKnown =
    tripDurationHours !== undefined &&
    Number.isFinite(tripDurationHours) &&
    tripDurationHours >= 0;

  const breakdown = getEffectiveBudgetBreakdown(dest);

  const rawTransport: number | null =
    mode === null
      ? null
      : getTransportCost(
          dest,
          mode,
          partySize,
          options.homeCoords,
          options.ferryTemporal,
          tripDurationHours,
        );
  const transportAvailable = rawTransport !== null;
  const transport =
    transportAvailable && Number.isFinite(rawTransport) ? rawTransport : 0;
  if (!breakdown) {
    return {
      transport,
      transportAvailable: transportAvailable && Number.isFinite(rawTransport),
      localTransit: 0,
      tickets: 0,
      food: null,
      cafe: 0,
      parking: 0,
      perPersonRange: [0, 0],
      partyRange: [0, 0],
      isFreeTicket: false,
      confidence: "estimated",
      accommodationAllowance,
      durationKnown: false,
      budgetAvailable: false,
    };
  }
  const isFreeTicket = isFreeDestination(dest);
  const tickets = isFreeTicket ? 0 : (breakdown.tickets || 0) * partySize;
  const food = durationKnown
    ? getDiningFoodRange(budgetTier, tripDurationHours, partySize)
    : null;
  const cafe = (breakdown.cafe || 0) * partySize;
  // KAI-89 on-site transport contract: budgetBreakdown.transport is the
  // per-person on-site/local-transit allowance; it is part of the trip cost.
  const localTransit = (breakdown.transport || 0) * partySize;
  const parking = mode === "car" || mode === "my_car" ? 1200 : 0;
  const minPartyTotal = Math.round(
    transport +
      localTransit +
      tickets +
      (food?.[0] ?? 0) +
      cafe +
      parking +
      accommodationAllowance,
  );
  const maxPartyTotal = Math.round(
    transport +
      localTransit +
      tickets +
      (food?.[1] ?? 0) +
      cafe +
      parking +
      accommodationAllowance,
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
    transportAvailable,
    localTransit,
    tickets,
    food,
    cafe,
    parking,
    perPersonRange: [perPersonMin, perPersonMax],
    partyRange: [minPartyTotal, maxPartyTotal],
    isFreeTicket,
    confidence,
    accommodationAllowance,
    durationKnown,
    budgetAvailable: true,
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
