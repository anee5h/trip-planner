import type { Destination } from "@/shared/types/destination";
import type {
  ActualWeatherCondition,
  RecommendationContext,
} from "./RecommendationContext";
import type { MatchReason } from "./RecommendationTypes";
import { evaluateWeekendWeather } from "@/shared/services/weather/WeekendWeatherScoring";
import { getBestOneWayTravelMinutes } from "./TripDurationService";
import {
  getTripDays,
  normalizeTripDuration,
  type TripDuration,
} from "@/shared/types/tripDuration";
import { isOriginLocalDestination } from "./OriginAreaService";
import {
  getOvernightCapacityThresholds,
  isPublishedDestination,
} from "./WeekendAreaPolicy";

// ── Travel Policy ────────────────────────────────────────────────────────────

export const WEEKEND_TRAVEL_POLICY = {
  /** Ordinary local/day-trip destinations are not overnight getaways. */
  LOCAL_MAX_MINUTES: 60,
  /** Borderline-near destinations remain possible but are heavily deprioritized. */
  NEARBY_MAX_MINUTES: 90,
  /** Normal overnight range before the stronger sweet spot begins. */
  NORMAL_MAX_MINUTES: 120,
  /** Sweet spot for an overnight getaway — strongest band (121–240 min). */
  STRONG_MAX_MINUTES: 240,
  ACCEPTABLE_MAX_MINUTES: 300,
  WEAK_MAX_MINUTES: 420,
} as const;

export type WeekendTravelBand =
  "local" | "nearby" | "normal" | "strong" | "acceptable" | "weak" | "unknown";

export interface WeekendTravelFit {
  eligible: boolean;
  band: WeekendTravelBand;
  oneWayMinutes?: number;
}

const OVERNIGHT_WORTHY_KIND = new Set(["island", "onsen"]);
const OVERNIGHT_WORTHY_CATEGORY = /\b(island|onsen|resort)\b/i;

/**
 * Local travel may still describe an overnight area when the catalogue says
 * so explicitly. Capacity is intentionally not part of this exception.
 */
export function hasOvernightWorthyWeekendSemantics(
  destination: Destination,
  pool: readonly Destination[],
): boolean {
  const records = [
    destination,
    ...pool.filter(
      (place) =>
        place.relationships?.parentDestinationId === destination.id &&
        isPublishedDestination(place),
    ),
  ];

  return records.some(
    (place) =>
      (place.kind !== undefined && OVERNIGHT_WORTHY_KIND.has(place.kind)) ||
      place.categories?.some((category) =>
        OVERNIGHT_WORTHY_CATEGORY.test(category),
      ),
  );
}

export function evaluateWeekendTravelFit(
  oneWayMinutes: number | undefined,
  options: { overnightWorthy?: boolean } = {},
): WeekendTravelFit {
  if (oneWayMinutes === undefined) {
    return { eligible: false, band: "unknown" };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.LOCAL_MAX_MINUTES) {
    return {
      eligible: options.overnightWorthy === true,
      band: "local",
      oneWayMinutes,
    };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.NEARBY_MAX_MINUTES) {
    return { eligible: true, band: "nearby", oneWayMinutes };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.NORMAL_MAX_MINUTES) {
    return { eligible: true, band: "normal", oneWayMinutes };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.STRONG_MAX_MINUTES) {
    return { eligible: true, band: "strong", oneWayMinutes };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.ACCEPTABLE_MAX_MINUTES) {
    return { eligible: true, band: "acceptable", oneWayMinutes };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.WEAK_MAX_MINUTES) {
    return { eligible: true, band: "weak", oneWayMinutes };
  }
  return { eligible: false, band: "weak", oneWayMinutes };
}

// ── Capacity Policy ──────────────────────────────────────────────────────────

export {
  getOvernightCapacityThresholds,
  OVERNIGHT_CAPACITY_POLICY as WEEKEND_CAPACITY_POLICY,
} from "./WeekendAreaPolicy";

export interface WeekendCapacityResult {
  eligible: boolean;
  activityMinutes: number;
  eligiblePlaceCount: number;
  reason: "sufficient" | "insufficient" | "unknown";
}

export function evaluateWeekendCapacity(
  destination: Destination,
  pool: readonly Destination[],
  duration: TripDuration | string = "2d1n",
): WeekendCapacityResult {
  const thresholds = getOvernightCapacityThresholds(duration);
  const ownMinutes = (destination.recommendedVisitHours?.max ?? 0) * 60;
  const children = pool.filter(
    (d) =>
      d.relationships?.parentDestinationId === destination.id &&
      isPublishedDestination(d),
  );
  const childrenSum = children.reduce(
    (sum, c) => sum + (c.recommendedVisitHours?.max ?? 0) * 60,
    0,
  );

  let minutes: number;
  let eligiblePlaceCount: number;

  if (children.length > 0) {
    if (childrenSum >= ownMinutes) {
      minutes = childrenSum;
      eligiblePlaceCount = children.length;
    } else {
      minutes = ownMinutes;
      eligiblePlaceCount = 1;
    }
  } else {
    minutes = ownMinutes;
    eligiblePlaceCount = ownMinutes > 0 ? 1 : 0;
  }

  const eligible = minutes >= thresholds.minEligibleMinutes;
  const reason =
    minutes === 0 ? "unknown" : eligible ? "sufficient" : "insufficient";

  return { eligible, activityMinutes: minutes, eligiblePlaceCount, reason };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export const WEEKEND_SCORING = {
  /** Ordinary local destinations are hard-excluded; semantic exceptions keep this penalty. */
  TRAVEL_LOCAL_PENALTY: -20,
  /** Borderline-near score at 61 minutes; remains strongly negative at 90. */
  TRAVEL_NEARBY_PENALTY: -18,
  TRAVEL_NEARBY_EDGE_PENALTY: -16,
  /** Transition score at 91 minutes; reaches a small positive by 120 minutes. */
  TRAVEL_NORMAL_BASE: -14,
  TRAVEL_NORMAL_MAX: 2,
  /** Strong overnight score at the start of the 121–240 minute band. */
  TRAVEL_STRONG_EDGE_BONUS: 2,
  /** Peak score within the strong overnight band. */
  TRAVEL_STRONG_BONUS: 9,
  TRAVEL_STRONG_PEAK_MINUTES: 180,
  /** Strong-band score at 240 minutes, continuous with the acceptable band. */
  TRAVEL_STRONG_END_BONUS: 5,
  /** Positive but declining bonus for acceptable distances. */
  TRAVEL_ACCEPTABLE_BASE: 5,
  TRAVEL_ACCEPTABLE_DENOM: 59,
  TRAVEL_ACCEPTABLE_STEEPNESS: 5,
  /** Long-journey decline starts at neutral immediately after 300 minutes. */
  TRAVEL_WEAK_BASE: 0,
  TRAVEL_WEAK_DENOM: 119,
  TRAVEL_WEAK_STEEPNESS: 15,
  CAPACITY_STRONG_BONUS: 3,
} as const;

export function weekendTravelScoreDelta(fit: WeekendTravelFit): number {
  const minutes = fit.oneWayMinutes;
  if (fit.band === "local") return WEEKEND_SCORING.TRAVEL_LOCAL_PENALTY;
  if (fit.band === "nearby" && minutes !== undefined) {
    return (
      WEEKEND_SCORING.TRAVEL_NEARBY_PENALTY +
      ((minutes - WEEKEND_TRAVEL_POLICY.LOCAL_MAX_MINUTES - 1) /
        (WEEKEND_TRAVEL_POLICY.NEARBY_MAX_MINUTES -
          WEEKEND_TRAVEL_POLICY.LOCAL_MAX_MINUTES -
          1)) *
        (WEEKEND_SCORING.TRAVEL_NEARBY_EDGE_PENALTY -
          WEEKEND_SCORING.TRAVEL_NEARBY_PENALTY)
    );
  }
  if (fit.band === "normal" && minutes !== undefined) {
    return (
      WEEKEND_SCORING.TRAVEL_NORMAL_BASE +
      ((minutes - WEEKEND_TRAVEL_POLICY.NEARBY_MAX_MINUTES - 1) /
        (WEEKEND_TRAVEL_POLICY.NORMAL_MAX_MINUTES -
          WEEKEND_TRAVEL_POLICY.NEARBY_MAX_MINUTES -
          1)) *
        (WEEKEND_SCORING.TRAVEL_NORMAL_MAX - WEEKEND_SCORING.TRAVEL_NORMAL_BASE)
    );
  }
  if (fit.band === "strong" && minutes !== undefined) {
    if (minutes <= WEEKEND_SCORING.TRAVEL_STRONG_PEAK_MINUTES) {
      return (
        WEEKEND_SCORING.TRAVEL_STRONG_EDGE_BONUS +
        ((minutes - WEEKEND_TRAVEL_POLICY.NORMAL_MAX_MINUTES - 1) /
          (WEEKEND_SCORING.TRAVEL_STRONG_PEAK_MINUTES -
            WEEKEND_TRAVEL_POLICY.NORMAL_MAX_MINUTES -
            1)) *
          (WEEKEND_SCORING.TRAVEL_STRONG_BONUS -
            WEEKEND_SCORING.TRAVEL_STRONG_EDGE_BONUS)
      );
    }
    return (
      WEEKEND_SCORING.TRAVEL_STRONG_BONUS -
      ((minutes - WEEKEND_SCORING.TRAVEL_STRONG_PEAK_MINUTES - 1) /
        (WEEKEND_TRAVEL_POLICY.STRONG_MAX_MINUTES -
          WEEKEND_SCORING.TRAVEL_STRONG_PEAK_MINUTES -
          1)) *
        (WEEKEND_SCORING.TRAVEL_STRONG_BONUS -
          WEEKEND_SCORING.TRAVEL_STRONG_END_BONUS)
    );
  }
  if (fit.band === "acceptable" && minutes !== undefined) {
    return (
      WEEKEND_SCORING.TRAVEL_ACCEPTABLE_BASE -
      ((minutes - WEEKEND_TRAVEL_POLICY.STRONG_MAX_MINUTES - 1) /
        WEEKEND_SCORING.TRAVEL_ACCEPTABLE_DENOM) *
        WEEKEND_SCORING.TRAVEL_ACCEPTABLE_STEEPNESS
    );
  }
  if (fit.band === "weak" && minutes !== undefined) {
    return (
      WEEKEND_SCORING.TRAVEL_WEAK_BASE -
      ((minutes - WEEKEND_TRAVEL_POLICY.ACCEPTABLE_MAX_MINUTES - 1) /
        WEEKEND_SCORING.TRAVEL_WEAK_DENOM) *
        WEEKEND_SCORING.TRAVEL_WEAK_STEEPNESS
    );
  }
  return 0;
}

// ── Candidate Evaluation ─────────────────────────────────────────────────────

export interface WeekendCandidateEvaluation {
  eligible: boolean;
  travelFit: WeekendTravelFit;
  capacity: WeekendCapacityResult;
  weatherDays: {
    date: string;
    condition: ActualWeatherCondition;
    temperatureC?: number;
  }[];
  travelScore: number;
  capacityScore: number;
  weatherScore: number;
  scoreDelta: number;
  reasons: MatchReason[];
}

export function evaluateWeekendCandidate(
  destination: Destination,
  context: RecommendationContext,
  pool: readonly Destination[],
  modes: string[],
  originMunicipalityId?: string,
): WeekendCandidateEvaluation {
  const canonicalDuration =
    normalizeTripDuration(context.tripDuration ?? "2d1n") ?? "2d1n";
  const durationDays = Math.max(2, getTripDays(canonicalDuration));
  const capacityThresholds = getOvernightCapacityThresholds(canonicalDuration);
  // DESTINATION-specific forecast days only. The live origin forecast is
  // never passed here, so without destination weather the weather score is
  // zero and no weekendWeather* reason is generated.
  const weatherDays = (context.destinationWeather?.days ?? []).slice(
    0,
    durationDays,
  );

  const oneWayMinutes = getBestOneWayTravelMinutes(destination, context, modes);
  const travelFit = evaluateWeekendTravelFit(oneWayMinutes, {
    overnightWorthy: hasOvernightWorthyWeekendSemantics(destination, pool),
  });
  const capacity = evaluateWeekendCapacity(
    destination,
    pool,
    canonicalDuration,
  );

  const travelScore = weekendTravelScoreDelta(travelFit);
  const capacityScore =
    capacity.activityMinutes >= capacityThresholds.strongMinutes
      ? WEEKEND_SCORING.CAPACITY_STRONG_BONUS
      : 0;
  const weatherResult = evaluateWeekendWeather(destination, weatherDays);
  const weatherScore = weatherResult.score;

  const scoreDelta = travelScore + capacityScore + weatherScore;

  const eligible =
    travelFit.eligible &&
    capacity.eligible &&
    !isOriginLocalDestination(destination, originMunicipalityId);

  const reasons: MatchReason[] = [];
  if (eligible) {
    reasons.push({
      type: "Weekend",
      code: "weekendTripReady",
      params: { days: durationDays },
      title: `${durationDays}-Day Trip Ready`,
      description: `Enough published places for ${durationDays} days`,
    });
  }
  if (capacity.activityMinutes >= capacityThresholds.strongMinutes) {
    reasons.push({
      type: "Weekend",
      code: "weekendCapacityStrong",
      params: { days: durationDays },
      title: "Plenty to Do",
      description: `Enough places for ${durationDays} days`,
    });
  }
  if (travelFit.band === "strong") {
    reasons.push({
      type: "Weekend",
      code: "weekendTravelStrong",
      title: "Good for a Longer Journey",
      description: "Travel time works well for an overnight trip",
    });
  } else if (travelFit.band === "acceptable") {
    reasons.push({
      type: "Weekend",
      code: "weekendTravelAcceptable",
      title: "Manageable Journey",
      description: "Travel time is manageable for an overnight trip",
    });
  } else if (travelFit.band === "weak") {
    reasons.push({
      type: "Weekend",
      code: "weekendTravelWeak",
      title: "Long Journey",
      description: "Travel takes most of a day — plan time carefully",
    });
  }
  if (weatherResult.summary === "good") {
    reasons.push({
      type: "Weekend",
      code: "weekendWeatherGood",
      title: "Good Weather Across All Days",
      description: `Favorable weather for all ${durationDays} days of your trip`,
    });
  } else if (weatherResult.summary === "mixed") {
    reasons.push({
      type: "Weekend",
      code: "weekendWeatherDayRain",
      params: { day: weatherResult.badDayIndices[0] + 1 },
      title: "Indoor Options Available",
      description: `Rain likely on Day ${weatherResult.badDayIndices[0] + 1}; indoor options available`,
    });
  } else if (weatherResult.summary === "poor") {
    reasons.push({
      type: "Weekend",
      code: "weekendWeatherPoorOutdoor",
      title: "Poor Outdoor Weather",
      description: "Poor weather expected for most outdoor activities",
    });
  }
  return {
    eligible,
    travelFit,
    capacity,
    weatherDays,
    travelScore,
    capacityScore,
    weatherScore,
    scoreDelta,
    reasons,
  };
}
