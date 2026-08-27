import type { Destination } from "@/shared/types/destination";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import {
  getCanonicalTransportCost,
  canonicalTransportCostToNumber,
} from "@/shared/services/transport/transportCostV2";
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
import {
  hasDisplayableBudget,
  hasTrustedNumericBudget,
  isVerifiedFree,
  normalizeBudgetState,
} from "@/shared/services/budget/budgetState";
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

/**
 * Returns false for legacy records with no trustworthy price source.
 * KAI-204 phase 3 (positive trust contract) + KAI-215 convergence: numeric
 * budgets are consumed ONLY when the KAI-214 NORMALIZED semantic state says
 * the value is trusted (verified source or documented model estimate).
 * Absent metadata is NOT a trust state — a number existing in old JSON is
 * not provenance. The old negative check (method !== "unknown" &&
 * method !== "legacy") implicitly trusted absent metadata; the positive
 * check closes that hole. KAI-215: trust is read from the centralized
 * normalizer (budgetState.ts), never rebuilt from the raw `method`.
 */
export function hasKnownBudget(dest: Destination): boolean {
  return hasTrustedNumericBudget(dest);
}

/**
 * True when the record carries explicit trusted provenance (manual verified
 * ticket or documented model output). "legacy", "unknown", and ABSENT
 * metadata are never trusted for consumption — trust is positive, never
 * inferred from the absence of a negative marker.
 *
 * KAI-215: this now delegates to the KAI-214 normalized semantic contract
 * (trustLevel trusted | trusted_estimate) rather than re-implementing the
 * method check. The raw `method` field remains ONLY for transitional
 * normalization inside budgetState.ts; no downstream consumer rebuilds
 * trust from it.
 */
export function hasTrustedBudgetProvenance(dest: Destination): boolean {
  const s = normalizeBudgetState(dest);
  return s.trustLevel !== "untrusted" && (s.hasNumericRange || s.hasBreakdown);
}

/**
 * KAI-89 type guard: both budget bounds are finite known values with a
 * valid order. Narrows the Destination so consumers can safely do price
 * arithmetic (unknown budgets must never act as 0/free in comparisons,
 * ranking, or rendering).
 *
 * KAI-215: gated on the KAI-214 NORMALIZED trust contract (trustLevel
 * trusted | trusted_estimate), so an explicit-state record that is
 * malformed (e.g. verified_paid without provenance) fails closed here too.
 * Legacy/unknown/absent never yield a known range even with numbers on the
 * record.
 */
export function hasKnownBudgetRange(
  dest: Destination,
): dest is Destination & { budgetMin: number; budgetMax: number } {
  const s = normalizeBudgetState(dest);
  if (s.trustLevel === "untrusted") return false;
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
  // KAI-216 repair: an explicit catalogue transportFares[mode] entry has NO
  // origin identity and NO provenance — it is a route (corridor) fare with
  // an unspecified origin, so it can never claim whole-journey "complete"
  // scope from an arbitrary user origin. It is corridor_only (access legs
  // unknown) for ground transit, consistent with the canonical ladder
  // (transportCostV2). car/my_car static estimates are UNAVAILABLE (no
  // origin-specific defensible car model) → unknown.
  if (
    dest.transportFares &&
    typeof dest.transportFares[mode as keyof typeof dest.transportFares] ===
      "number"
  ) {
    if (mode === "car" || mode === "my_car") return "unknown";
    return "corridor_only";
  }
  // Flight and ferry fares cover the verified air/sea ROUTE only — origin
  // airport/port access and destination-side access are NOT included. A
  // verified airline/ferry ticket is a verified corridor/service fare, not
  // a complete trip from the user's origin → corridor_only.
  if (mode === "flight" || mode === "ferry") return "corridor_only";
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

/**
 * KAI-216: the generic duration-derived pricing config (base + perMinute
 * fare heuristics, tollRatePerKm, rental tiers) is REMOVED. A corridor
 * without a verified fare is unavailable, never a base+perMinute guess.
 * Verified fares live in the transport registries (ground-routes.json,
 * bus-routes.json, flight-estimates.json, ferry-estimates.json) and
 * explicit transportFares; the canonical transport cost (transportCostV2)
 * consumes only those.
 */

/**
 * Returns the round-trip transport cost for the given party size, or null if
 * no verified cost could be computed (unverified fare, missing corridor,
 * unsupported mode).
 *
 * KAI-216: this function is re-expressed over the canonical structured
 * transport cost (getCanonicalTransportCost). It projects the canonical
 * CostRepresentation to the legacy numeric shape for number|null consumers:
 *
 *   - bounded       → midpoint (min===max ? min : round((min+max)/2))
 *   - open_ended    → the verified lower bound ("from ¥X" floor)
 *   - unavailable / not_applicable / variable → null
 *
 * Duration-derived fake fares (TRANSPORT_PRICING_CONFIG heuristics) and
 * drive-time→distance→toll fabrication are REMOVED: a corridor without a
 * verified fare is null, never a base+perMinute guess. The canonical
 * representation preserves both bounds; this projection is display/legacy
 * only.
 */
export function getTransportCost(
  dest: Destination,
  mode: string,
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
  /**
   * Retained for call-site compatibility (rental tier selection previously
   * used this). Car/my_car costs are now canonical-only: without an explicit
   * transportFares vehicle total the cost is null regardless of duration.
   */
  _tripDurationHours?: number,
): number | null {
  if (!isFiniteNonNegative(partySize)) return null;
  const result = getCanonicalTransportCost(
    dest,
    mode,
    partySize,
    homeCoords,
    ferryTemporal,
  );
  return canonicalTransportCostToNumber(result);
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
  // KAI-204 phase 3 (positive trust contract) + KAI-215 convergence: a
  // breakdown is consumed only when the KAI-214 NORMALIZED semantic state
  // says the record is trusted (trustLevel trusted | trusted_estimate).
  // Absent metadata, "legacy", and "unknown" never yield a usable breakdown
  // — numeric values without recoverable provenance must not enter
  // consumption, and unknown is authoritative. Malformed explicit forward
  // states (e.g. verified_paid without provenance) also fail closed here.
  if (!hasDisplayableBudget(dest)) return null;
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
  if (!dest) return false;
  // KAI-215 convergence: verified free is decided by the KAI-214 NORMALIZED
  // semantic contract (isVerifiedFree = state verified_free + verified
  // source provenance + explicit free evidence). The old implementation
  // re-derived trust from raw `method` plus a keyword fallback; both
  // independently-inferred paths are removed. Free NEVER comes from
  // zero/missing data or free-looking keywords without explicit evidence.
  // farm-tomita (manual, tickets=0, FREE_ENTRY evidence, breakdown-only)
  // normalizes to verified_free and remains free here.
  return isVerifiedFree(dest);
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
