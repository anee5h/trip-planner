import type { Destination } from "@/shared/types/destination";
import {
  getCanonicalTransportCost,
  canonicalTransportCostToNumber,
} from "@/shared/services/transport/transportCostV2";
import type { BudgetTier, PriceRange } from "@/shared/types/planner";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type {
  FerryTemporalContext,
  TransportFareScope,
} from "@/shared/services/transport/types";
import { MEAL_PRICE_RANGES } from "@/shared/types/planner";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import type { EstimateQuality } from "@/shared/services/budget/tripEstimateEngine";
import type { TripDuration } from "@/shared/types/tripDuration";
import { validateAdmissionFact } from "@/shared/services/budget/factValidation";
import {
  hasDisplayableBudget,
  hasTrustedNumericBudget,
  isVerifiedFree,
  normalizeBudgetState,
} from "@/shared/services/budget/budgetState";
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

/** Format estimated ranges with honest, outward-rounded presentation values. */
export function formatLocalizedApproximateJPYRange(
  range: PriceRange | null | undefined,
  locale: "en" | "ja" = "en",
): string {
  if (!range || !isValidPriceRange(range)) {
    return COST_UNAVAILABLE[locale];
  }
  const unit = range[1] >= 1000 ? 1000 : 100;
  const rounded: PriceRange = [
    Math.floor(range[0] / unit) * unit,
    Math.ceil(range[1] / unit) * unit,
  ];
  return formatLocalizedJPYRange(rounded, locale);
}

/**
 * Traveller-facing range formatting. Verified values stay unprefixed; model
 * and broad fallback ranges carry the same compact approximation marker on
 * every surface, while the caller can expose the full quality label in a
 * tooltip or secondary metadata.
 */
export function formatTravellerEstimateRange(
  range: PriceRange | null | undefined,
  quality: EstimateQuality | undefined,
  locale: "en" | "ja" = "en",
): string {
  const value =
    quality === "verified"
      ? formatLocalizedJPYRange(range, locale)
      : formatLocalizedApproximateJPYRange(range, locale);
  if (!range || quality === "verified") return value;
  return locale === "ja" ? `約 ${value}` : `~${value}`;
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

export function getEstimatedBudgetRange(
  dest: Destination,
  mode: string,
  partySize: number,
  budgetTier: BudgetTier = "standard",
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): EstimatedBudgetRangeResult {
  // Compatibility projection for older callers. The range itself is always
  // produced by TripEstimateEngine; this adapter never adds food/cafe/5% or
  // collapses the canonical range to a scalar.
  const result = calculateTripEstimate({
    dest,
    mode,
    partySize,
    budgetTier,
    homeCoords,
    duration: "fullDay",
    ferryTemporal,
    // Without an origin there is no honest origin fare to include; callers
    // are asking for an on-site planning estimate rather than an unavailable
    // trip total.
    includeOriginTravel: Boolean(homeCoords),
  });
  const origin = result.components.find(
    (item) => item.evidence.scope === "origin_travel",
  );
  const meals = result.components.find(
    (item) => item.evidence.scope === "meals",
  );
  const range = result.total
    ? ([result.total.min, result.total.max] as PriceRange)
    : null;
  return {
    range,
    transportIncluded: origin?.cost.kind === "bounded",
    transportFareScope: origin?.evidence.fareScope ?? "unknown",
    durationIncluded: Boolean(dest.recommendedVisitHours),
    food:
      meals?.cost.kind === "bounded" ? [meals.cost.min, meals.cost.max] : null,
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
  _originZoneId?: TransportZoneId,
  ferryTemporal?: FerryTemporalContext,
): number | null {
  if (!isFiniteNonNegative(partySize)) return null;
  const explicitMode = activeMode !== "all" && activeMode !== "any";
  const mode = explicitMode
    ? activeMode
    : Object.keys(dest.transportOptions ?? {}).find(
        (candidate) =>
          dest.transportOptions[
            candidate as keyof Destination["transportOptions"]
          ] !== undefined,
      );
  const result = calculateTripEstimate({
    dest,
    mode,
    partySize,
    homeCoords,
    duration: "fullDay",
    ferryTemporal,
    // No origin context means this compatibility API returns the bounded
    // on-site estimate, not an origin-travel unknown.
    includeOriginTravel: Boolean(homeCoords),
  });
  // This scalar is a compatibility ceiling only. New UI and ranking code
  // consumes result.total as a range and never uses this projection.
  return result.total?.max ?? null;
}

export function getEffectiveBudgetBreakdown(dest: Destination): {
  transport: number;
  tickets: number;
  food: number;
  cafe: number;
} | null {
  // KAI-219A ONE-WAY COMPATIBILITY PROJECTION (DEPRECATION.md §2): when an
  // explicit KAI-218 `admission` FACT exists, legacy `tickets` consumers
  // read the PROJECTED value derived FROM the fact at read time. This is
  // DERIVED and READ-ONLY — never written back, never independently edited.
  //
  // KAI-219A review BLOCKER 4: the projection uses the SAME shared runtime
  // validator (factValidation.ts) as the engine, and only projects a
  // VALIDATED BOUNDED fact to a scalar. open_ended / variable /
  // not_applicable / unavailable / malformed → null (no "from ¥X" → exact
  // ¥X scalarization). The bounded projection uses the fact MAX (the
  // conservative ceiling for legacy readers).
  const fact = dest.admission;
  const legacyBreakdown = dest.budgetBreakdown;
  if (fact) {
    const validation = validateAdmissionFact(fact);
    const validBounded =
      validation.valid &&
      fact.cost.kind === "bounded" &&
      isFiniteNonNegative(fact.cost.min) &&
      isFiniteNonNegative(fact.cost.max);
    const hasLegacyTransportFoodCafe =
      legacyBreakdown &&
      [
        legacyBreakdown.transport,
        legacyBreakdown.food,
        legacyBreakdown.cafe,
      ].every(isFiniteNonNegative);
    if (
      fact.state === "not_applicable" &&
      validation.valid &&
      hasLegacyTransportFoodCafe
    ) {
      return {
        transport: legacyBreakdown!.transport,
        tickets: 0,
        food: legacyBreakdown!.food,
        cafe: legacyBreakdown!.cafe,
      };
    }
    const projectedTickets = validBounded ? fact.cost.max : undefined;
    if (projectedTickets !== undefined && hasLegacyTransportFoodCafe) {
      return {
        transport: legacyBreakdown!.transport,
        tickets: projectedTickets,
        food: legacyBreakdown!.food,
        cafe: legacyBreakdown!.cafe,
      };
    }
    // No scalar projection (non-bounded / malformed fact, or absent legacy
    // non-admission fields). NEVER synthesize zeros, NEVER scalarize
    // "from ¥X" → ¥X, NEVER resurrect the stale legacy tickets value.
    // Fail closed for the whole breakdown.
    return null;
  }
  // KAI-204 phase 3 (positive trust contract) + KAI-215 convergence: a
  // breakdown is consumed only when the KAI-214 NORMALIZED semantic state
  // says the record is trusted (trustLevel trusted | trusted_estimate).
  // Absent metadata, "legacy", and "unknown" never yield a usable breakdown
  // — numeric values without recoverable provenance must not enter
  // consumption, and unknown is authoritative. Malformed explicit forward
  // states (e.g. verified_paid without provenance) also fail closed here.
  if (!hasDisplayableBudget(dest)) return null;
  if (
    legacyBreakdown &&
    [
      legacyBreakdown.transport,
      legacyBreakdown.tickets,
      legacyBreakdown.food,
      legacyBreakdown.cafe,
    ].every(isFiniteNonNegative)
  ) {
    return legacyBreakdown;
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
    tripDurationHours?: number;
    duration?: TripDuration;
    homeCoords?: { lat: number; lng: number };
    ferryTemporal?: FerryTemporalContext;
  } = {},
): ItemizedCostBreakdown {
  const requestedPartySize = options.partySize ?? 2;
  const partySize = isFiniteNonNegative(requestedPartySize)
    ? Math.max(1, Math.floor(requestedPartySize))
    : 2;
  const result = calculateTripEstimate({
    dest,
    mode: options.activeMode ?? undefined,
    partySize,
    budgetTier: options.budgetTier ?? "standard",
    homeCoords: options.homeCoords,
    ferryTemporal: options.ferryTemporal,
    duration: options.duration ?? "fullDay",
    includeOriginTravel: Boolean(options.homeCoords),
  });
  const rangeFor = (scope: string): PriceRange | null => {
    const item = result.components.find(
      (entry) => entry.evidence.scope === scope,
    );
    return item?.cost.kind === "bounded"
      ? [item.cost.min, item.cost.max]
      : null;
  };
  const originRange = rangeFor("origin_travel");
  const localRange = rangeFor("local_transport");
  const admissionRange = rangeFor("admission");
  const food = rangeFor("meals");
  const baseTotal: PriceRange = result.total
    ? [result.total.min, result.total.max]
    : [0, 0];
  const total: PriceRange = baseTotal;
  const isFreeTicket = isVerifiedFree(dest);
  const confidence =
    result.estimateQuality === "verified"
      ? "high"
      : result.estimateQuality === "estimated"
        ? "medium"
        : "estimated";
  return {
    transport: originRange?.[1] ?? 0,
    transportAvailable: Boolean(originRange),
    localTransit: localRange?.[1] ?? 0,
    tickets: isFreeTicket ? 0 : (admissionRange?.[1] ?? 0),
    food,
    cafe: 0,
    parking: 0,
    perPersonRange: [
      Math.round(total[0] / partySize),
      Math.round(total[1] / partySize),
    ],
    partyRange: total,
    isFreeTicket,
    confidence,
    accommodationAllowance: rangeFor("accommodation")?.[1] ?? 0,
    durationKnown: Boolean(
      options.tripDurationHours ?? dest.recommendedVisitHours,
    ),
    budgetAvailable: result.bounded,
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
