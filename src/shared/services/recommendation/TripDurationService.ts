import type { Destination } from "@/shared/types/destination";
import type { Journey } from "@/shared/types/journey";
import {
  buildJourneyFromEstimatedTransportEstimate,
  buildJourneyFromOriginAwareEstimate,
} from "@/shared/services/transport/JourneyBuilder";
import { buildCarJourney } from "@/shared/services/transport/CarJourneyBuilder";
import { getJourneyEndpoints } from "@/shared/services/transport/JourneyService";
import {
  getSafeGroundEstimate,
  type SafeGroundEstimateContext,
} from "@/shared/services/transport/SafeGroundEstimateService";
import {
  getOriginAwareTransportEstimate,
  type TravelDurationEstimate,
  type TravelDurationEvidence,
} from "@/shared/services/transport/OriginAwareTransportService";
import type {
  RecommendationContext,
  TripDuration,
  TripDurationContext,
} from "./RecommendationContext";
import {
  getTripDays,
  getTripNights,
  isOvernightDuration,
  type TripDuration as CanonicalTripDuration,
} from "@/shared/types/tripDuration";

/** Extra uncertainty allowance applied only to estimated one-way travel. */
export const ESTIMATED_TRAVEL_PADDING_MINUTES = 30;
export const DAY_TRIP_MAX_OUTING_HOURS = 14;
// Keep the maximum burden below the existing +25 explicit-interest boost.
export const DAY_TRIP_TRAVEL_EFFICIENCY_MAX_PENALTY = 24;

export interface TripDurationEstimate {
  visitRangeHours: [number, number];
  totalRangeHours: [number, number];
  representativeHours: number;
  band: TripDuration;
  mode?: string;
  bestTravelMinutes?: number;
  /** Provenance of the origin-aware travel used by this estimate. */
  travelEvidence?: TravelDurationEvidence;
  /** The one-way estimate shown by cards, when an origin is present. */
  travelEstimate?: TravelDurationEstimate;
  /** Canonical single-mode Journey backing the compatibility estimate. */
  journey?: Journey;
  /** Conservative one-way minutes used for a constrained day-trip gate. */
  feasibilityTravelMinutes?: number;
  isImpossible?: boolean;
  isBorderline?: boolean;
  warningMessage?: {
    en: string;
    ja: string;
  };
}

export function getBand(hours: number): CanonicalTripDuration {
  if (hours < 4) return "shortOuting";
  if (hours < 7.5) return "halfDay";
  if (hours <= 14) return "fullDay";
  return "fullDay";
}

/**
 * Pure visit-duration band using only published recommendedVisitHours.
 * Changing origin must not change the result.
 */
export type VisitDuration = "shortOuting" | "halfDay" | "fullDay";

export function getVisitBand(destination: Destination): VisitDuration | null {
  if (!destination.recommendedVisitHours) return null;
  const hours =
    (destination.recommendedVisitHours.min +
      destination.recommendedVisitHours.max) /
    2;
  if (hours < 2.5) return "shortOuting";
  if (hours < 5) return "halfDay";
  return "fullDay";
}

export function matchesVisitDuration(
  destination: Destination,
  requested: TripDuration,
): boolean {
  if (requested === "any") return true;
  if (isOvernightDuration(requested)) return true;
  const band = getVisitBand(destination);
  return band === requested;
}

/**
 * The selected day-trip envelopes shown by Home. Weekend planning has a
 * separate policy and must not use these limits.
 */
export function getDayTripAvailableTimeHours(
  requested: TripDuration,
): number | undefined {
  switch (requested) {
    case "shortOuting":
      return 4;
    case "halfDay":
      return 7.5;
    case "fullDay":
    case "any":
      return DAY_TRIP_MAX_OUTING_HOURS;
    default:
      return undefined;
  }
}

/**
 * Whether the context represents a selected origin for personalized planning.
 * A zone without coordinates is still an origin: without coordinates there is
 * no bounded estimate fallback, so unknown remains ineligible.
 */
export function hasPersonalizedOrigin(
  context: TripDurationContext | RecommendationContext,
): boolean {
  return Boolean(
    context.homeStationCoords ||
    ("originZoneId" in context &&
      context.originZoneId &&
      context.originZoneId !== "unknown"),
  );
}

export interface DayTripTravelDurationEvidence {
  evidence: TravelDurationEvidence;
  estimate?: TravelDurationEstimate;
  journey?: Journey;
}

function getEstimatedFallbackModes(modes: readonly string[]): string[] {
  return [...modes];
}

/**
 * Shared travel truth. Canonical route evidence always wins. The estimated
 * branch is limited to bounded display estimates, including legacy car
 * duration evidence. Car budget and canonical route distance/toll require a
 * provider-normalized route.
 */
export function getTravelDurationEvidence(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: readonly string[],
  estimatedGroundModes: readonly string[] = modes,
): DayTripTravelDurationEvidence {
  // An absent origin is not a Tokyo-origin request. Every origin-aware
  // estimator requires coordinates so its route evidence can be scoped.
  if (!context.homeStationCoords) {
    return { evidence: "unknown" };
  }

  const originAware = getOriginAwareTransportEstimate(
    destination,
    {
      homeStationCoords: context.homeStationCoords ?? undefined,
      originZoneId:
        "originZoneId" in context ? context.originZoneId : undefined,
      ferryTemporal: context.ferryTemporal,
      carRoute: context.carRoute,
    },
    modes,
  );
  if (originAware) {
    return {
      evidence: originAware.evidence,
      estimate: originAware,
      journey:
        (originAware.mode === "car" || originAware.mode === "my_car") &&
        context.carRoute
          ? buildCarJourney(
              destination,
              context.homeStationCoords,
              context.carRoute,
              undefined,
              originAware.mode === "my_car" ? "my_car" : "car",
            )
          : buildJourneyFromOriginAwareEstimate(
              originAware,
              getJourneyEndpoints(destination, {
                homeStationCoords: context.homeStationCoords ?? undefined,
                originZoneId:
                  "originZoneId" in context ? context.originZoneId : undefined,
                ferryTemporal: context.ferryTemporal,
              }),
            ),
    };
  }

  if (!context.homeStationCoords) return { evidence: "unknown" };

  const estimated = getSafeGroundEstimate(destination, {
    homeStationCoords: context.homeStationCoords,
    homeStationTransportZoneId:
      "originZoneId" in context ? context.originZoneId : undefined,
    authorizedModes: estimatedGroundModes,
  } satisfies SafeGroundEstimateContext);
  if (estimated) {
    return {
      evidence: "estimated",
      estimate: estimated,
      journey: buildJourneyFromEstimatedTransportEstimate(
        estimated,
        getJourneyEndpoints(destination, {
          homeStationCoords: context.homeStationCoords,
          originZoneId:
            "originZoneId" in context ? context.originZoneId : undefined,
        }),
      ),
    };
  }

  return { evidence: "unknown" };
}

/** Day-trip alias retained for callers whose policy is day-trip-specific. */
export function getDayTripTravelDurationEvidence(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: readonly string[],
): DayTripTravelDurationEvidence {
  return getTravelDurationEvidence(destination, context, modes);
}

export interface DayTripTravelEfficiency {
  mode: string;
  evidence: Exclude<TravelDurationEvidence, "unknown">;
  travelEstimate: TravelDurationEstimate;
  oneWayMinutes: number;
  feasibilityOneWayMinutes: number;
  availableTimeHours: number;
  visitHours: number;
  travelHours: number;
  totalOutingHours: number;
  travelShare: number;
  travelEnvelopeShare: number;
  contribution: number;
}

/**
 * Bounded, smooth day-trip burden. It is shared by Home and Explore and only
 * runs after the same origin-aware evidence gate has produced a usable route.
 */
export function getDayTripTravelEfficiency(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  mode: string,
): DayTripTravelEfficiency | undefined {
  const requestedDuration =
    "tripDuration" in context ? (context.tripDuration ?? "any") : "any";
  const availableTimeHours =
    getDayTripAvailableTimeHours(requestedDuration) ??
    DAY_TRIP_MAX_OUTING_HOURS;
  const estimate = estimateDayTripDuration(
    destination,
    { ...context, availableTimeHours },
    [mode],
  );
  if (
    !estimate?.travelEstimate ||
    !estimate.travelEvidence ||
    estimate.travelEvidence === "unknown" ||
    estimate.feasibilityTravelMinutes === undefined ||
    estimate.isImpossible
  ) {
    return undefined;
  }

  const visitHours =
    (estimate.visitRangeHours[0] + estimate.visitRangeHours[1]) / 2;
  const travelHours =
    (estimate.feasibilityTravelMinutes * 2 +
      (destination.travelBuffers?.transferMinutes ?? 0) +
      (destination.travelBuffers?.ferryMinutes ?? 0)) /
    60;
  const totalOutingHours = visitHours + travelHours;
  const travelShare = totalOutingHours > 0 ? travelHours / totalOutingHours : 1;
  const travelEnvelopeShare = Math.min(1, travelHours / availableTimeHours);
  // ponytail: one bounded linear curve uses travel only; calibrate weights/cap from outcome data if available.
  const burden = 0.6 * travelShare + 0.4 * travelEnvelopeShare;
  const contribution = -DAY_TRIP_TRAVEL_EFFICIENCY_MAX_PENALTY * burden;

  return {
    mode,
    evidence: estimate.travelEvidence,
    travelEstimate: estimate.travelEstimate,
    oneWayMinutes: estimate.bestTravelMinutes ?? 0,
    feasibilityOneWayMinutes: estimate.feasibilityTravelMinutes,
    availableTimeHours,
    visitHours,
    travelHours,
    totalOutingHours,
    travelShare,
    travelEnvelopeShare,
    contribution,
  };
}

/**
 * Applies the visit-duration band plus the verified-or-bounded-estimated
 * origin-aware feasibility contract for constrained day trips. Unknown travel
 * is neutral only when no personalized origin has been selected; with an
 * origin it is not a usable duration and the candidate is excluded.
 */
export function matchesPersonalizedDayTripDuration(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
  requested: TripDuration,
): boolean {
  if (!matchesVisitDuration(destination, requested)) return false;

  const personalizedOrigin = hasPersonalizedOrigin(context);
  if (!destination.recommendedVisitHours && requested === "any") {
    // Any remains neutral for legacy records without a published visit band,
    // but a selected origin still requires usable canonical travel evidence.
    if (!personalizedOrigin) return true;
    const travel = getDayTripTravelDurationEvidence(
      destination,
      context,
      modes,
    );
    if (travel.evidence === "unknown") return false;
    // KAI-66/KAI-63: a night-only highway coach cannot support a same-day
    // outing even when no visit band is published. The night gate must apply
    // to every day-trip record, not only those with recommendedVisitHours.
    if (
      travel.estimate?.mode === "bus" &&
      "servicePeriod" in travel.estimate &&
      travel.estimate.servicePeriod === "night"
    ) {
      return false;
    }
    return true;
  }

  const availableTimeHours = getDayTripAvailableTimeHours(requested);
  if (availableTimeHours === undefined || !personalizedOrigin) {
    return true;
  }

  const estimate = estimateDayTripDuration(
    destination,
    { ...context, availableTimeHours },
    modes,
  );
  return Boolean(
    estimate &&
    estimate.travelEvidence !== "unknown" &&
    estimate.totalRangeHours[0] <= availableTimeHours,
  );
}

export function formatTripDurationLabel(
  estimate: TripDurationEstimate,
  locale: "en" | "ja",
): string {
  if (isOvernightDuration(estimate.band)) {
    const days = getTripDays(estimate.band);
    const nights = getTripNights(estimate.band);
    return locale === "ja"
      ? `${days}日間・${nights}泊`
      : `${days} days / ${nights} night${nights === 1 ? "" : "s"}`;
  }
  if (locale === "ja") {
    switch (estimate.band) {
      case "shortOuting":
        return "短時間";
      case "halfDay":
        return "半日";
      case "fullDay":
        return "1日";
      default:
        return "滞在時間目安";
    }
  }
  switch (estimate.band) {
    case "shortOuting":
      return "Short outing";
    case "halfDay":
      return "Half day";
    case "fullDay":
      return "Full day";
    default:
      return "Visit duration";
  }
}

/**
 * Returns the fastest canonical one-way travel time (midpoint of the estimate
 * range) for a destination across all authorised modes. Verified origin-aware
 * routes win; when they are absent, the shared bounded estimated-ground
 * contract may provide evidence for an authorized nearby ground mode.
 */
export function getBestOneWayTravelMinutes(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
): number | undefined {
  const travel = getTravelDurationEvidence(
    destination,
    context,
    modes,
    getEstimatedFallbackModes(modes),
  );
  if (!travel.estimate) return undefined;
  return Math.round(
    (travel.estimate.timeRange[0] + travel.estimate.timeRange[1]) / 2,
  );
}

export function estimateTripDuration(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
): TripDurationEstimate | null {
  // KAI-50: `recommendedVisitHours` is the only canonical visit-duration
  // source. `totalTripHours` is deprecated and may already include travel
  // from a fixed origin, so it can never be used as a visit fallback.
  if (!destination.recommendedVisitHours) return null;
  const visitRange: [number, number] = [
    destination.recommendedVisitHours.min,
    destination.recommendedVisitHours.max,
  ];

  let totalRangeHours: [number, number];
  let representativeHours: number;
  let bestMode: string | undefined;
  let bestTravelMinutes: number | undefined;
  let travelEstimate: TravelDurationEstimate | undefined;
  let journey: Journey | undefined;

  if (!context.homeStationCoords) {
    totalRangeHours = visitRange;
    representativeHours = (visitRange[0] + visitRange[1]) / 2;
  } else {
    const travel = getTravelDurationEvidence(
      destination,
      context,
      modes,
      getEstimatedFallbackModes(modes),
    );
    if (!travel.estimate) return null;
    journey = travel.journey;
    travelEstimate = travel.estimate;
    bestMode = travel.estimate.mode;
    bestTravelMinutes = Math.round(
      (travel.estimate.timeRange[0] + travel.estimate.timeRange[1]) / 2,
    );
    const bufferHours =
      ((destination.travelBuffers?.transferMinutes ?? 0) +
        (destination.travelBuffers?.ferryMinutes ?? 0)) /
      60;
    const travelHours = (bestTravelMinutes * 2) / 60 + bufferHours;
    totalRangeHours = [
      visitRange[0] + travelHours,
      visitRange[1] + travelHours,
    ];
    representativeHours = (totalRangeHours[0] + totalRangeHours[1]) / 2;
  }

  let isImpossible = false;
  let isBorderline = false;
  let warningMessage: { en: string; ja: string } | undefined;

  if (
    context.availableTimeHours !== undefined &&
    context.availableTimeHours > 0
  ) {
    const minRequired = totalRangeHours[0];
    const maxRequired = totalRangeHours[1];
    const avail = context.availableTimeHours;

    if (minRequired > avail) {
      isImpossible = true;
      warningMessage = {
        en: `Exceeds available time limit of ${avail}h (${Math.round(minRequired * 10) / 10}h min required)`,
        ja: `利用可能時間 (${avail}時間) を超えます (最低${Math.round(minRequired * 10) / 10}時間必要)`,
      };
    } else if (maxRequired > avail) {
      isBorderline = true;
      warningMessage = {
        en: `Tight schedule — maximum visit (${Math.round(maxRequired * 10) / 10}h) exceeds ${avail}h limit`,
        ja: `時間がタイトです — 最大滞在 (${Math.round(maxRequired * 10) / 10}時間) が${avail}時間の制限を超えます`,
      };
    }
  }

  return {
    visitRangeHours: visitRange,
    totalRangeHours,
    representativeHours,
    band: getBand(representativeHours),
    mode: bestMode,
    bestTravelMinutes,
    travelEvidence: travelEstimate?.evidence,
    travelEstimate,
    journey,
    isImpossible,
    isBorderline,
    warningMessage,
  };
}

/**
 * Day-trip duration model. It shares canonical corridor-backed estimates with
 * the budget-safe model, including bounded access evidence, and permits the
 * separate safe coordinate estimate only for constrained day-trip
 * feasibility/display decisions.
 */
export function estimateDayTripDuration(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: readonly string[],
): TripDurationEstimate | null {
  if (!destination.recommendedVisitHours) return null;
  if (!context.homeStationCoords) {
    // A persisted topology zone without coordinates is still a personalized
    // origin, but it cannot support the bounded coordinate fallback. Keep the
    // conservative unknown result instead of treating the visit-only range as
    // a personalized travel estimate.
    if (hasPersonalizedOrigin(context)) return null;
    return estimateTripDuration(destination, context, [...modes]);
  }

  const travel = getDayTripTravelDurationEvidence(destination, context, modes);
  if (!travel.estimate) return null;

  // A night-only highway coach (e.g. はかた号, ドリーム号系) cannot support
  // a same-day round trip: its duration would only be "feasible" because the
  // model has no departure/arrival dates. KAI-66: night-only rows are
  // excluded from day-trip feasibility while remaining available for generic
  // browsing and weekend one-way evaluation. Mixed rows keep their day
  // service's day-trip behavior.
  if (
    travel.estimate.mode === "bus" &&
    "servicePeriod" in travel.estimate &&
    travel.estimate.servicePeriod === "night"
  ) {
    return null;
  }

  const visitRange: [number, number] = [
    destination.recommendedVisitHours.min,
    destination.recommendedVisitHours.max,
  ];
  const bestTravelMinutes = Math.round(
    (travel.estimate.timeRange[0] + travel.estimate.timeRange[1]) / 2,
  );
  const feasibilityTravelMinutes =
    travel.evidence === "estimated"
      ? travel.estimate.timeRange[1] + ESTIMATED_TRAVEL_PADDING_MINUTES
      : bestTravelMinutes;
  const bufferHours =
    ((destination.travelBuffers?.transferMinutes ?? 0) +
      (destination.travelBuffers?.ferryMinutes ?? 0)) /
    60;
  const travelHours = (feasibilityTravelMinutes * 2) / 60 + bufferHours;
  const totalRangeHours: [number, number] = [
    visitRange[0] + travelHours,
    visitRange[1] + travelHours,
  ];
  const representativeHours = (totalRangeHours[0] + totalRangeHours[1]) / 2;
  const available = context.availableTimeHours;
  const isImpossible =
    available !== undefined && available > 0
      ? totalRangeHours[0] > available
      : false;
  const isBorderline =
    available !== undefined && available > 0
      ? !isImpossible && totalRangeHours[1] > available
      : false;
  let warningMessage: { en: string; ja: string } | undefined;
  if (isImpossible && available !== undefined) {
    warningMessage = {
      en: `Exceeds available time limit of ${available}h (${Math.round(totalRangeHours[0] * 10) / 10}h min required)`,
      ja: `利用可能時間 (${available}時間) を超えます (最低${Math.round(totalRangeHours[0] * 10) / 10}時間必要)`,
    };
  } else if (isBorderline && available !== undefined) {
    warningMessage = {
      en: `Tight schedule — maximum visit (${Math.round(totalRangeHours[1] * 10) / 10}h) exceeds ${available}h limit`,
      ja: `時間がタイトです — 最大滞在 (${Math.round(totalRangeHours[1] * 10) / 10}時間) が${available}時間の制限を超えます`,
    };
  }

  return {
    visitRangeHours: visitRange,
    totalRangeHours,
    representativeHours,
    band: getBand(representativeHours),
    mode: travel.estimate.mode,
    bestTravelMinutes,
    travelEvidence: travel.evidence,
    travelEstimate: travel.estimate,
    journey: travel.journey,
    feasibilityTravelMinutes,
    isImpossible,
    isBorderline,
    warningMessage,
  };
}

/**
 * Representative runtime total trip duration in hours, derived from the
 * canonical visit duration plus origin-aware round-trip travel and buffers.
 * Catchment access remains marked estimated in the underlying result.
 * Returns `undefined` when the destination cannot be duration-planned.
 */
export function getDerivedTripDurationHours(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
): number | undefined {
  return estimateTripDuration(destination, context, modes)?.representativeHours;
}

export function matchesTripDurationEstimate(
  estimate: TripDurationEstimate | null,
  requested: TripDuration = "any",
) {
  return (
    requested === "any" || (estimate !== null && estimate.band === requested)
  );
}
