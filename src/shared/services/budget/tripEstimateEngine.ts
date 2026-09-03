/**
 * KAI-260 — range-first traveller estimate engine.
 *
 * This is the one runtime definition of a trip-cost range. It deliberately
 * separates two questions which the old Budget v2 conflated:
 *
 *   1. evidenceCompleteness: how much of the ingredients is source-backed;
 *   2. total: whether a useful bounded planning range can be shown.
 *
 * A modelled component is not a missing trip. Every component follows the
 * same ladder: verified fact, defensible model, broad profile, unavailable.
 * Unknown values are never converted to a numeric zero. Verified ranges are
 * scaled as ranges, never collapsed to their midpoint.
 *
 * Included in the traveller estimate:
 *   day trip: origin travel + local transport + admission + meals
 *   overnight: the same + party-total accommodation × nights
 *
 * Excluded: shopping, souvenirs, optional activities, cafe/snack buckets,
 * parking and contingency uplifts.
 */

import type {
  Destination,
  LocalTransportAccess,
} from "@/shared/types/destination";
import type { BudgetTier, PriceRange } from "@/shared/types/planner";
import type { Journey, JourneyCost } from "@/shared/types/journey";
import { MEAL_PRICE_RANGES } from "@/shared/types/planner";
import type {
  FerryTemporalContext,
  TransportMode,
  TransportFareScope,
} from "@/shared/services/transport/types";
import {
  getCanonicalTransportCost,
  type TransportCostResult,
} from "@/shared/services/transport/transportCostV2";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type { CarRoundTripRoute } from "@/shared/services/transport/CarRouteProvider";
import { isCarRoundTripRouteForDestination } from "@/shared/services/transport/CarRouteProvider";
import type {
  PersonalCarCostOptions,
  RentalCarCostOptions,
} from "@/shared/services/transport/carCostV2";
import { buildCarJourney } from "@/shared/services/transport/CarJourneyBuilder";
import { getDistanceKm } from "@/shared/services/transport/TransportEstimator";
import {
  isVerifiedFree,
  normalizeBudgetState,
} from "@/shared/services/budget/budgetState";
import {
  validateAdmissionFact,
  validateLocalTransportFact,
} from "@/shared/services/budget/factValidation";
import type {
  AccommodationAllowance,
  BoundedCost,
  CostRepresentation,
  CostScope,
  TripCostComponent,
} from "@/shared/services/budget/budgetV2";
import { getTripNights, type TripDuration } from "@/shared/types/tripDuration";

export type EstimateQuality = "verified" | "estimated" | "rough";
export type EvidenceCompleteness = "complete" | "partial" | "unavailable";

export interface TripEstimateContext {
  readonly dest: Destination;
  readonly mode?: string;
  readonly partySize?: number;
  readonly homeCoords?: { lat: number; lng: number };
  readonly duration: TripDuration;
  readonly budgetTier?: BudgetTier;
  readonly ferryTemporal?: FerryTemporalContext;
  /** Normalized provider output; absent means car cost stays unavailable. */
  readonly carRoute?: CarRoundTripRoute;
  readonly carCostOptions?: PersonalCarCostOptions | RentalCarCostOptions;
  /** false means this is an on-site-only estimate (Compare/detail widgets). */
  readonly includeOriginTravel?: boolean;
}

/** Backwards-compatible context name for callers being migrated. */
export type TripCostContext = TripEstimateContext;

export interface TripEstimateResult {
  readonly kind: "trip_estimate";
  /** `complete` means every required ingredient is bounded, regardless of
   * whether the ingredient is verified, modelled, or a broad profile. */
  readonly completeness: "complete" | "partial" | "unavailable";
  /** Explicit ingredient certainty, separate from bounded usability. */
  readonly evidenceCompleteness: EvidenceCompleteness;
  /** `total` is present whenever the required ingredients are all bounded. */
  readonly total?: BoundedCost;
  readonly components: readonly TripCostComponent[];
  readonly knownSubtotal: PriceRange;
  readonly missingComponents: readonly {
    readonly scope: CostScope;
    readonly reason: string;
  }[];
  readonly estimateQuality: EstimateQuality;
  readonly accommodation?: AccommodationAllowance;
  readonly journey?: Journey;
  readonly bounded: boolean;
}

const SOURCE_MISSING: CostRepresentation = {
  kind: "unavailable",
  reason: "source_missing",
};

function journeyCostFromTransport(result: TransportCostResult): JourneyCost {
  const known = result.cost.kind !== "unavailable";
  const partiallyKnown = Boolean(result.knownCost);
  const evidence = known
    ? result.evidence.derivation === "model_estimate"
      ? "estimated"
      : "verified"
    : "unknown";
  const variability =
    result.cost.kind === "bounded"
      ? result.cost.min === result.cost.max
        ? "fixed"
        : "range"
      : result.cost.kind === "open_ended"
        ? "dynamic"
        : result.cost.kind === "variable"
          ? "variable"
          : undefined;
  return {
    currency: "JPY",
    representation: known ? result.cost : null,
    state: known ? "known" : partiallyKnown ? "unknown" : "unavailable",
    evidence,
    scope: result.evidence.fareScope,
    completeness: known
      ? result.evidence.fareScope === "complete"
        ? "complete"
        : "partial"
      : "unknown",
    basis: "round_trip",
    ...(variability ? { variability } : {}),
    assumptionProvenance: result.evidence.assumptionProvenance,
    sourceUrls: result.evidence.sourceUrls,
  };
}

export const LOCAL_TRANSPORT_PROFILES = {
  // Per person, round trip. These are planning bands, not fares.
  walkable: [0, 500],
  urban_transit: [400, 1600],
  regional: [800, 3000],
  rural_spread_out: [1500, 5000],
  special_access: [2000, 8000],
} as const satisfies Record<string, PriceRange>;

/** Party-total, per-night defaults. Lodging is never multiplied by party size. */
export const ACCOMMODATION_PROFILES = {
  economy: [6000, 12000],
  standard: [10000, 22000],
  comfortable: [18000, 40000],
  luxury: [35000, 70000],
} as const satisfies Record<BudgetTier, PriceRange>;

/**
 * Flexible is a matching policy, not a luxury-spend preset. Keep a neutral
 * standard estimate for its display range while the affordability layer uses
 * an infinite ceiling and therefore applies no budget penalty.
 */
function estimateTierForBudget(tier: BudgetTier | undefined): BudgetTier {
  return tier === "luxury" ? "standard" : (tier ?? "standard");
}

const DEFAULT_ADMISSION_OPEN_AREA: PriceRange = [0, 1200];
const DEFAULT_ADMISSION_ATTRACTION: PriceRange = [500, 3000];

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizePartySize(value: number | undefined): number {
  const party = value ?? 2;
  return Number.isInteger(party) && finiteNonNegative(party) && party > 0
    ? party
    : Number.NaN;
}

function scalePerPerson(range: PriceRange, partySize: number): PriceRange {
  return [range[0] * partySize, range[1] * partySize];
}

function addRanges(left: PriceRange, right: PriceRange): PriceRange {
  return [left[0] + right[0], left[1] + right[1]];
}

function sumBounded(components: readonly TripCostComponent[]): BoundedCost {
  let min = 0;
  let max = 0;
  for (const component of components) {
    if (component.cost.kind === "bounded") {
      min += component.cost.min;
      max += component.cost.max;
    } else if (component.knownCost) {
      min += component.knownCost.min;
      max += component.knownCost.max;
    }
  }
  return { kind: "bounded", min, max };
}

function sourceUrlsForTransport(
  transport: TransportCostResult,
): readonly string[] | undefined {
  const urls = transport.evidence.sourceUrls;
  return urls && urls.length > 0 ? urls : undefined;
}

function component(
  cost: CostRepresentation,
  evidence: TripCostComponent["evidence"],
): TripCostComponent {
  return { cost, evidence };
}

function defaultAdmissionProfile(dest: Destination): PriceRange {
  if (
    dest.role === "hub" ||
    dest.kind === "city" ||
    dest.kind === "ward" ||
    dest.kind === "district" ||
    dest.kind === "street" ||
    dest.kind === "market"
  ) {
    // A city/hub has no single admission product. This is not a free claim.
    return DEFAULT_ADMISSION_OPEN_AREA;
  }
  if (
    dest.kind === "park" ||
    dest.kind === "garden" ||
    dest.kind === "shrine" ||
    dest.kind === "temple" ||
    dest.kind === "beach" ||
    dest.kind === "viewpoint" ||
    dest.kind === "bridge" ||
    dest.kind === "cape" ||
    dest.kind === "waterfall"
  ) {
    return DEFAULT_ADMISSION_OPEN_AREA;
  }
  return DEFAULT_ADMISSION_ATTRACTION;
}

function admissionFallback(
  dest: Destination,
  partySize: number,
  reason = "profile_default",
): TripCostComponent {
  const range = scalePerPerson(defaultAdmissionProfile(dest), partySize);
  return component(
    { kind: "bounded", min: range[0], max: range[1] },
    {
      scope: "admission",
      derivation: "model_estimate",
      state: "documented_estimate",
      provenance: "model",
      reason:
        reason === "profile_default"
          ? "insufficient_model_evidence"
          : "source_missing",
    },
  );
}

function admissionFromLegacy(
  dest: Destination,
  partySize: number,
): TripCostComponent | undefined {
  const state = normalizeBudgetState(dest);
  if (state.state === "not_applicable") {
    return component(
      { kind: "not_applicable" },
      {
        scope: "admission",
        derivation: "computed",
        state: "not_applicable",
        provenance: state.provenance,
        reason: state.reasonCode ?? "hub_budget_not_applicable",
      },
    );
  }
  const ticket = dest.budgetBreakdown?.tickets;
  if (!finiteNonNegative(ticket) || state.trustLevel === "untrusted")
    return undefined;
  if (isVerifiedFree(dest)) {
    return component(
      { kind: "bounded", min: 0, max: 0 },
      {
        scope: "admission",
        derivation: "source_fact",
        state: "verified_free",
        provenance: "verified_source",
      },
    );
  }
  if (
    state.state !== "verified_paid" &&
    state.state !== "documented_estimate"
  ) {
    return undefined;
  }
  const total = ticket * partySize;
  return component(
    { kind: "bounded", min: total, max: total },
    {
      scope: "admission",
      derivation:
        state.state === "documented_estimate"
          ? "model_estimate"
          : "source_fact",
      state: state.state,
      provenance: state.provenance,
    },
  );
}

function admissionComponent(
  dest: Destination,
  partySize: number,
): TripCostComponent {
  const fact = dest.admission;
  if (!fact) {
    return (
      admissionFromLegacy(dest, partySize) ?? admissionFallback(dest, partySize)
    );
  }

  const validation = validateAdmissionFact(fact);
  if (!validation.valid)
    return admissionFallback(dest, partySize, "source_missing");

  const evidence = {
    scope: "admission" as const,
    state: fact.state,
    provenance: fact.provenance,
    reason: fact.reasonCode,
    sourceUrls: fact.sourceUrls,
  };
  switch (fact.cost.kind) {
    case "not_applicable":
      return component(
        { kind: "not_applicable" },
        { ...evidence, derivation: "computed" },
      );
    case "bounded": {
      const total = scalePerPerson([fact.cost.min, fact.cost.max], partySize);
      return component(
        { kind: "bounded", min: total[0], max: total[1] },
        {
          ...evidence,
          derivation:
            fact.state === "documented_estimate"
              ? "model_estimate"
              : "source_fact",
        },
      );
    }
    case "open_ended": {
      // Keep the fact's lower bound, then use a broad model ceiling. We do
      // not pretend the open-ended source was a fixed fare.
      const from = fact.cost.from * partySize;
      const profile = scalePerPerson(defaultAdmissionProfile(dest), partySize);
      const max = Math.max(profile[1], from * 1.75);
      return component(
        { kind: "bounded", min: from, max },
        {
          ...evidence,
          derivation: "model_estimate",
          reason: fact.reasonCode ?? "price_variable_by_product",
        },
      );
    }
    case "variable":
    case "unavailable":
      return admissionFallback(dest, partySize, "source_missing");
  }
}

function localProfileFor(
  dest: Destination,
): keyof typeof LOCAL_TRANSPORT_PROFILES {
  const localModes = dest.localAccessModes ?? [];
  const zone = (dest.transportZoneId ?? "").toLowerCase();
  if (
    localModes.includes("ferry") ||
    dest.kind === "island" ||
    zone.includes("island") ||
    zone.includes("ogasawara") ||
    zone.includes("yakushima") ||
    zone.includes("amami") ||
    dest.transportOptions?.ferry !== undefined
  ) {
    return "special_access";
  }
  if (dest.role === "standalone") {
    return dest.municipalityId || dest.areaId ? "urban_transit" : "regional";
  }
  if (
    dest.kind === "mountain" ||
    dest.kind === "waterfall" ||
    dest.kind === "lake" ||
    dest.kind === "beach" ||
    dest.kind === "village" ||
    dest.kind === "cape" ||
    dest.kind === "cliff" ||
    dest.kind === "rock_formation"
  ) {
    return "rural_spread_out";
  }
  if (
    dest.role === "hub" ||
    dest.kind === "city" ||
    dest.kind === "ward" ||
    dest.kind === "district" ||
    dest.kind === "street" ||
    dest.kind === "market" ||
    dest.kind === "station"
  ) {
    return "walkable";
  }
  if (dest.municipalityId || dest.areaId) return "urban_transit";
  return "regional";
}

function localProfileComponent(
  dest: Destination,
  partySize: number,
  extra?: { sourceUrls?: readonly string[]; localCoverage?: "segment_only" },
): TripCostComponent {
  const profile = scalePerPerson(
    LOCAL_TRANSPORT_PROFILES[localProfileFor(dest)],
    partySize,
  );
  return component(
    { kind: "bounded", min: profile[0], max: profile[1] },
    {
      scope: "local_transport",
      derivation: "model_estimate",
      state: "documented_estimate",
      provenance: "model",
      reason: "insufficient_model_evidence",
      ...extra,
    },
  );
}

function localFareTotal(
  fare: readonly [number, number],
  basis: LocalTransportAccess extends never
    ? never
    : "one_way" | "round_trip" | "required_access_total",
  partySize: number,
): PriceRange {
  const multiplier = basis === "one_way" ? 2 : 1;
  return [fare[0] * multiplier * partySize, fare[1] * multiplier * partySize];
}

function localTransportComponent(
  dest: Destination,
  partySize: number,
): TripCostComponent {
  const fact = dest.localTransport;
  if (!fact) return localProfileComponent(dest, partySize);
  const validation = validateLocalTransportFact(fact);
  if (!validation.valid) return localProfileComponent(dest, partySize);

  const sourceUrls = "sourceUrls" in fact ? fact.sourceUrls : undefined;
  switch (fact.kind) {
    case "not_applicable":
      return component(
        { kind: "not_applicable" },
        {
          scope: "local_transport",
          derivation: "computed",
          reason: "hub_budget_not_applicable",
        },
      );
    case "verified_walking":
      return component(
        { kind: "bounded", min: 0, max: 0 },
        {
          scope: "local_transport",
          derivation: "source_fact",
          state: "verified_free",
          provenance: "verified_source",
          sourceUrls,
        },
      );
    case "verified_required_access": {
      if (fact.coverage === "segment_only") {
        // A segment fare is real evidence, but it cannot be presented as the
        // complete local journey. The profile supplies a bounded whole-access
        // planning band; the segment provenance remains attached.
        return localProfileComponent(dest, partySize, {
          sourceUrls,
          localCoverage: "segment_only",
        });
      }
      const total = localFareTotal(fact.fare, fact.fareBasis, partySize);
      return component(
        { kind: "bounded", min: total[0], max: total[1] },
        {
          scope: "local_transport",
          derivation: "source_fact",
          state: "verified_paid",
          provenance: "verified_source",
          sourceUrls,
          localCoverage: fact.coverage,
        },
      );
    }
    case "bounded_defensible_access": {
      if (fact.coverage === "segment_only") {
        return localProfileComponent(dest, partySize, {
          sourceUrls,
          localCoverage: "segment_only",
        });
      }
      const total = localFareTotal(fact.fare, fact.fareBasis, partySize);
      return component(
        { kind: "bounded", min: total[0], max: total[1] },
        {
          scope: "local_transport",
          derivation: "model_estimate",
          state: "documented_estimate",
          provenance: "model",
          sourceUrls,
          localCoverage: fact.coverage,
        },
      );
    }
    case "unavailable":
      return localProfileComponent(dest, partySize);
  }
}

function accessFareProfile(
  dest: Destination,
  mode: string,
  partySize: number,
  homeCoords: { lat: number; lng: number },
): PriceRange {
  const route = getOriginAwareTransportEstimate(
    dest,
    { homeStationCoords: homeCoords },
    [mode as TransportMode],
  );
  const accessKm = Math.max(
    route?.accessDistanceKm?.origin ?? 0,
    route?.accessDistanceKm?.destination ?? 0,
  );
  let perPerson: PriceRange;
  if (mode === "flight" || mode === "ferry") {
    perPerson = [1000, 6000];
  } else if (accessKm <= 5) {
    perPerson = [300, 1000];
  } else if (accessKm <= 15) {
    perPerson = [500, 2000];
  } else if (accessKm <= 30) {
    perPerson = [800, 3000];
  } else {
    perPerson = [1200, 5000];
  }
  return scalePerPerson(perPerson, partySize);
}

function modelOriginRange(
  dest: Destination,
  mode: string,
  partySize: number,
  homeCoords: { lat: number; lng: number },
): PriceRange | undefined {
  if (!dest.coordinates) return undefined;
  const distanceKm = getDistanceKm(
    homeCoords.lat,
    homeCoords.lng,
    dest.coordinates.lat,
    dest.coordinates.lng,
  );
  if (!finiteNonNegative(distanceKm)) return undefined;

  const perPerson: PriceRange =
    mode === "flight"
      ? [10000, 50000]
      : mode === "ferry"
        ? [5000, 30000]
        : distanceKm <= 50
          ? [1000, 4000]
          : distanceKm <= 150
            ? [2500, 8000]
            : distanceKm <= 400
              ? [6000, 18000]
              : [12000, 45000];
  return scalePerPerson(perPerson, partySize);
}

function normalizeCarCostOptionsForTrip(
  options: PersonalCarCostOptions | RentalCarCostOptions | undefined,
  duration: TripDuration,
): PersonalCarCostOptions | RentalCarCostOptions | undefined {
  return options && "duration" in options ? { ...options, duration } : options;
}

function originComponent(
  dest: Destination,
  mode: string | undefined,
  partySize: number,
  homeCoords: { lat: number; lng: number } | undefined,
  duration: TripDuration,
  ferryTemporal: FerryTemporalContext | undefined,
  carRoute: CarRoundTripRoute | undefined,
  carCostOptions: PersonalCarCostOptions | RentalCarCostOptions | undefined,
): TripCostComponent {
  if (!mode || mode === "all" || mode === "any" || !homeCoords) {
    return component(SOURCE_MISSING, {
      scope: "origin_travel",
      derivation: "computed",
      reason: "source_missing",
    });
  }

  const effectiveCarCostOptions = normalizeCarCostOptionsForTrip(
    carCostOptions,
    duration,
  );
  const scopedCarRoute =
    (mode === "car" || mode === "my_car") &&
    carRoute &&
    isCarRoundTripRouteForDestination(dest, carRoute, homeCoords)
      ? carRoute
      : undefined;
  const transport = getCanonicalTransportCost(
    dest,
    mode,
    partySize,
    homeCoords,
    ferryTemporal,
    scopedCarRoute,
    effectiveCarCostOptions,
  );
  const urls = sourceUrlsForTransport(transport);
  const baseEvidence = {
    scope: "origin_travel" as const,
    fareScope: transport.evidence.fareScope,
    sourceUrls: urls,
    assumptionProvenance: transport.evidence.assumptionProvenance,
  };

  if (transport.cost.kind === "bounded") {
    if (transport.evidence.fareScope === "complete") {
      return component(transport.cost, {
        ...baseEvidence,
        derivation: transport.evidence.derivation,
      });
    }
    // Corridor fares are useful but incomplete. Add a deliberately broad
    // access band rather than claiming corridor-only money is door-to-door.
    const access = accessFareProfile(dest, mode, partySize, homeCoords);
    const total = addRanges([transport.cost.min, transport.cost.max], access);
    return component(
      { kind: "bounded", min: total[0], max: total[1] },
      {
        ...baseEvidence,
        derivation: "model_estimate",
      },
    );
  }

  if (transport.cost.kind === "open_ended") {
    const access = accessFareProfile(dest, mode, partySize, homeCoords);
    const from = transport.cost.from + access[0];
    const max = Math.max(from * 1.7, from + access[1] - access[0] + 5000);
    return component(
      { kind: "bounded", min: from, max },
      {
        ...baseEvidence,
        derivation: "model_estimate",
        reason: "price_variable_by_product",
      },
    );
  }

  if (mode === "car" || mode === "my_car") {
    return {
      ...component(transport.cost, {
        ...baseEvidence,
        derivation: transport.evidence.derivation,
        reason: "source_missing",
      }),
      ...(transport.knownCost ? { knownCost: transport.knownCost } : {}),
    };
  }

  const model = modelOriginRange(dest, mode, partySize, homeCoords);
  if (!model) {
    return component(transport.cost, {
      ...baseEvidence,
      derivation: "computed",
      reason: "source_missing",
    });
  }
  return component(
    { kind: "bounded", min: model[0], max: model[1] },
    {
      scope: "origin_travel",
      derivation: "model_estimate",
      reason: "insufficient_model_evidence",
      fareScope: transport.evidence.fareScope,
    },
  );
}

function mealNames(
  dest: Destination,
  duration: TripDuration,
  totalDurationHours?: number,
): (keyof (typeof MEAL_PRICE_RANGES)[BudgetTier])[] {
  const nights = getTripNights(duration);
  if (nights > 0) {
    const meals: (keyof (typeof MEAL_PRICE_RANGES)[BudgetTier])[] = [
      "lunch",
      "dinner",
      "breakfast",
      "lunch",
    ];
    const extensionNights = Math.max(0, nights - 1);
    for (let index = 0; index < extensionNights; index += 1) {
      meals.push("dinner", "breakfast", "lunch");
    }
    return meals;
  }
  const availableHours = totalDurationHours ?? dest.recommendedVisitHours?.max;
  if (availableHours !== undefined && Number.isFinite(availableHours)) {
    if (availableHours <= 4) return ["lunch"];
    if (availableHours <= 9) return ["lunch", "dinner"];
    return ["breakfast", "lunch", "dinner"];
  }
  // A normal day trip without a duration record still needs a practical
  // meal budget; two meals is a broad but unsurprising default.
  return ["lunch", "dinner"];
}

function mealDurationHours(context: TripEstimateContext): number | undefined {
  const visitMax = context.dest.recommendedVisitHours?.max;
  if (visitMax === undefined || !Number.isFinite(visitMax)) return undefined;
  if (
    !context.homeCoords ||
    !context.mode ||
    context.mode === "all" ||
    context.mode === "any"
  ) {
    return visitMax;
  }
  const scopedCarRoute =
    (context.mode === "car" || context.mode === "my_car") &&
    context.carRoute &&
    isCarRoundTripRouteForDestination(
      context.dest,
      context.carRoute,
      context.homeCoords,
    )
      ? context.carRoute
      : undefined;
  const travel = getOriginAwareTransportEstimate(
    context.dest,
    {
      homeStationCoords: context.homeCoords,
      ferryTemporal: context.ferryTemporal,
      carRoute: scopedCarRoute,
    },
    [context.mode as TransportMode],
  );
  if (!travel || travel.evidence === "unknown") {
    return visitMax;
  }
  const roundTripMinutes = travel.roundTripTimeRange
    ? (travel.roundTripTimeRange[0] + travel.roundTripTimeRange[1]) / 2
    : travel.timeRange[0] + travel.timeRange[1];
  const bufferHours =
    ((context.dest.travelBuffers?.transferMinutes ?? 0) +
      (context.dest.travelBuffers?.ferryMinutes ?? 0)) /
    60;
  return visitMax + roundTripMinutes / 60 + bufferHours;
}

function mealsComponent(
  dest: Destination,
  duration: TripDuration,
  tier: BudgetTier,
  partySize: number,
  totalDurationHours?: number,
): TripCostComponent {
  const ranges = mealNames(dest, duration, totalDurationHours).map(
    (meal) => MEAL_PRICE_RANGES[tier][meal],
  );
  const perPerson: PriceRange = [
    ranges.reduce((sum, range) => sum + range[0], 0),
    ranges.reduce((sum, range) => sum + range[1], 0),
  ];
  const total = scalePerPerson(perPerson, partySize);
  return component(
    { kind: "bounded", min: total[0], max: total[1] },
    {
      scope: "meals",
      derivation: "model_estimate",
      state: "documented_estimate",
      provenance: "model",
      reason: "insufficient_model_evidence",
    },
  );
}

function accommodationComponent(
  nights: number,
  tier: BudgetTier,
): { component: TripCostComponent; allowance?: AccommodationAllowance } {
  if (nights === 0) {
    return {
      component: component(
        { kind: "bounded", min: 0, max: 0 },
        { scope: "accommodation", derivation: "computed" },
      ),
      allowance: { perNight: 0, nights: 0 },
    };
  }

  const range = ACCOMMODATION_PROFILES[tier];
  const derivation = "model_estimate" as const;

  const total: PriceRange = [range[0] * nights, range[1] * nights];
  return {
    component: component(
      { kind: "bounded", min: total[0], max: total[1] },
      {
        scope: "accommodation",
        derivation,
        state: "documented_estimate" as const,
        provenance: "model" as const,
        reason: "insufficient_model_evidence" as const,
      },
    ),
    // The allowance is retained as the per-night party total. Do not put the
    // multiplied party amount here: the number is already party-total.
    allowance: { perNight: range[0], nights },
  };
}

function buildMissingComponents(components: readonly TripCostComponent[]) {
  return components.flatMap((item) => {
    if (
      item.cost.kind === "unavailable" ||
      item.cost.kind === "variable" ||
      item.cost.kind === "open_ended"
    ) {
      return [
        {
          scope: item.evidence.scope,
          reason: item.evidence.reason ?? item.cost.kind,
        },
      ];
    }
    return [];
  });
}

function qualityFor(components: readonly TripCostComponent[]): EstimateQuality {
  if (
    components.some(
      (item) =>
        item.cost.kind === "open_ended" ||
        item.cost.kind === "variable" ||
        item.cost.kind === "unavailable",
    )
  ) {
    return "rough";
  }

  const hasModelEstimate = components.some(
    (item) =>
      item.evidence.derivation === "model_estimate" &&
      item.evidence.provenance === "model",
  );
  const hasUserAllowance = components.some(
    (item) => item.evidence.derivation === "user_allowance",
  );
  if (!hasModelEstimate && !hasUserAllowance) return "verified";

  // Deterministic profiles (including meals) are intentionally modeled but
  // usable. Reserve rough for broad source-missing fallbacks or non-bounded
  // required components rather than making every estimate look equally weak.
  return components.some(
    (item) =>
      item.evidence.reason === "source_missing" ||
      (item.evidence.scope === "admission" &&
        item.evidence.reason === "insufficient_model_evidence"),
  )
    ? "rough"
    : "estimated";
}

function evidenceCompletenessFor(
  components: readonly TripCostComponent[],
  boundedTotal: boolean,
): EvidenceCompleteness {
  if (!boundedTotal) return "unavailable";
  return components.every(
    (item) =>
      item.cost.kind === "not_applicable" ||
      item.evidence.derivation === "source_fact",
  )
    ? "complete"
    : "partial";
}

function calculate(context: TripEstimateContext): TripEstimateResult {
  const partySize = normalizePartySize(context.partySize);
  const nights = getTripNights(context.duration);
  if (
    !Number.isFinite(partySize) ||
    nights === undefined ||
    !Number.isInteger(nights) ||
    nights < 0
  ) {
    return {
      kind: "trip_estimate",
      completeness: "unavailable",
      evidenceCompleteness: "unavailable",
      components: [],
      knownSubtotal: [0, 0],
      missingComponents: [{ scope: "accommodation", reason: "source_missing" }],
      estimateQuality: "rough",
      bounded: false,
    };
  }

  const includeOrigin =
    context.includeOriginTravel === true ||
    (context.includeOriginTravel === undefined && Boolean(context.homeCoords));
  const scopedCarRoute =
    context.carRoute &&
    context.homeCoords &&
    isCarRoundTripRouteForDestination(
      context.dest,
      context.carRoute,
      context.homeCoords,
    )
      ? context.carRoute
      : undefined;
  const origin = !includeOrigin
    ? component(
        { kind: "not_applicable" },
        { scope: "origin_travel", derivation: "computed" },
      )
    : originComponent(
        context.dest,
        context.mode,
        partySize,
        context.homeCoords,
        context.duration,
        context.ferryTemporal,
        scopedCarRoute,
        context.carCostOptions,
      );
  const admission = admissionComponent(context.dest, partySize);
  const local = localTransportComponent(context.dest, partySize);
  const estimateTier = estimateTierForBudget(context.budgetTier);
  const meals = mealsComponent(
    context.dest,
    context.duration,
    estimateTier,
    partySize,
    mealDurationHours(context),
  );
  const accommodation = accommodationComponent(nights, estimateTier);
  const components = [
    origin,
    admission,
    local,
    meals,
    accommodation.component,
  ] as const;
  const required = components.filter(
    (item) => item.cost.kind !== "not_applicable",
  );
  const allBounded =
    required.length > 0 &&
    required.every((item) => item.cost.kind === "bounded");
  const total = allBounded ? sumBounded(components) : undefined;
  const knownSubtotal = sumBounded(components);
  const missingComponents = buildMissingComponents(components);
  const journey =
    (context.mode === "car" || context.mode === "my_car") &&
    context.includeOriginTravel !== false &&
    context.homeCoords &&
    scopedCarRoute
      ? buildCarJourney(
          context.dest,
          context.homeCoords,
          scopedCarRoute,
          journeyCostFromTransport(
            getCanonicalTransportCost(
              context.dest,
              context.mode,
              partySize,
              context.homeCoords,
              context.ferryTemporal,
              scopedCarRoute,
              normalizeCarCostOptionsForTrip(
                context.carCostOptions,
                context.duration,
              ),
            ),
          ),
          context.mode === "my_car" ? "my_car" : "car",
        )
      : undefined;

  return {
    kind: "trip_estimate",
    completeness: allBounded
      ? "complete"
      : required.some((item) => item.cost.kind === "bounded")
        ? "partial"
        : "unavailable",
    evidenceCompleteness: evidenceCompletenessFor(components, allBounded),
    ...(total ? { total } : {}),
    components,
    knownSubtotal: [knownSubtotal.min, knownSubtotal.max],
    missingComponents,
    estimateQuality: qualityFor(components),
    ...(accommodation.allowance
      ? { accommodation: accommodation.allowance }
      : {}),
    ...(journey ? { journey } : {}),
    bounded: Boolean(total),
  };
}

export class TripEstimateEngine {
  static estimate(context: TripEstimateContext): TripEstimateResult {
    return calculate(context);
  }
}

export function calculateTripEstimate(
  context: TripEstimateContext,
): TripEstimateResult {
  return TripEstimateEngine.estimate(context);
}

/** Compatibility name; production callers should import calculateTripEstimate. */
/** @deprecated Use calculateTripEstimate / TripEstimateEngine. */
export const calculateTripCost = calculateTripEstimate;

export function evaluateAffordability(
  result: Pick<TripEstimateResult, "total">,
  budget: number | undefined,
): "fits" | "may_exceed" | "over" | "unknown" {
  if (!finiteNonNegative(budget) || !result.total) return "unknown";
  if (budget >= result.total.max) return "fits";
  if (budget >= result.total.min) return "may_exceed";
  return "over";
}

export function getEstimateRange(
  result: TripEstimateResult,
): PriceRange | null {
  return result.total ? [result.total.min, result.total.max] : null;
}

export function estimateQualityLabel(
  quality: EstimateQuality,
  locale: "en" | "ja",
): string {
  if (quality === "verified") return locale === "ja" ? "確認済み" : "Verified";
  if (quality === "rough") return locale === "ja" ? "概算" : "Rough estimate";
  return locale === "ja" ? "概算" : "Estimated";
}

export type { TransportFareScope };
