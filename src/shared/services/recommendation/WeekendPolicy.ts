import type { Destination } from "@/shared/types/destination";
import type {
  ActualWeatherCondition,
  RecommendationContext,
} from "./RecommendationContext";
import type { MatchReason } from "./RecommendationTypes";
import { evaluateWeekendWeather } from "@/shared/services/weather/WeekendWeatherScoring";
import { getBestOneWayTravelMinutes } from "./TripDurationService";
import { isOriginLocalDestination } from "./OriginAreaService";
import { isPublishedDestination } from "./WeekendAreaPolicy";

// ── Travel Policy ────────────────────────────────────────────────────────────

export const WEEKEND_TRAVEL_POLICY = {
  /** Very close destinations are eligible but receive no weekend travel bonus. */
  LOCAL_MAX_MINUTES: 60,
  /** Sweet spot for an overnight getaway — strongest score. */
  STRONG_MIN_MINUTES: 121,
  STRONG_MAX_MINUTES: 240,
  ACCEPTABLE_MAX_MINUTES: 300,
  WEAK_MAX_MINUTES: 420,
} as const;

export type WeekendTravelBand =
  "local" | "nearby" | "strong" | "acceptable" | "weak" | "unknown";

export interface WeekendTravelFit {
  eligible: boolean;
  band: WeekendTravelBand;
  oneWayMinutes?: number;
}

export function evaluateWeekendTravelFit(
  oneWayMinutes: number | undefined,
): WeekendTravelFit {
  if (oneWayMinutes === undefined) {
    return { eligible: false, band: "unknown" };
  }
  if (oneWayMinutes <= WEEKEND_TRAVEL_POLICY.LOCAL_MAX_MINUTES) {
    return { eligible: true, band: "local", oneWayMinutes };
  }
  if (oneWayMinutes < WEEKEND_TRAVEL_POLICY.STRONG_MIN_MINUTES) {
    return { eligible: true, band: "nearby", oneWayMinutes };
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

export const WEEKEND_CAPACITY_POLICY = {
  MIN_ELIGIBLE_MINUTES: 480,
  STRONG_MINUTES: 600,
} as const;

export interface WeekendCapacityResult {
  eligible: boolean;
  activityMinutes: number;
  eligiblePlaceCount: number;
  reason: "sufficient" | "insufficient" | "unknown";
}

export function evaluateWeekendCapacity(
  destination: Destination,
  pool: readonly Destination[],
): WeekendCapacityResult {
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

  const eligible = minutes >= WEEKEND_CAPACITY_POLICY.MIN_ELIGIBLE_MINUTES;
  const reason =
    minutes === 0 ? "unknown" : eligible ? "sufficient" : "insufficient";

  return { eligible, activityMinutes: minutes, eligiblePlaceCount, reason };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export const WEEKEND_SCORING = {
  /** Very close to origin: eligible but no getaway bonus. */
  TRAVEL_LOCAL_BONUS: -20,
  /** Modest bonus for closer-than-sweet-spot destinations. */
  TRAVEL_NEARBY_BONUS: 3,
  /** Strongest bonus for the overnight sweet spot (121–240 min). */
  TRAVEL_STRONG_BONUS: 14,
  /** Positive but declining bonus for acceptable distances. */
  TRAVEL_ACCEPTABLE_BASE: 5,
  TRAVEL_ACCEPTABLE_DENOM: 60,
  TRAVEL_ACCEPTABLE_STEEPNESS: 5,
  /** Penalty for very long one-way travel. */
  TRAVEL_WEAK_BASE: -12,
  TRAVEL_WEAK_DENOM: 120,
  TRAVEL_WEAK_STEEPNESS: 15,
  CAPACITY_STRONG_BONUS: 3,
} as const;

export function weekendTravelScoreDelta(fit: WeekendTravelFit): number {
  const minutes = fit.oneWayMinutes;
  if (fit.band === "local") return WEEKEND_SCORING.TRAVEL_LOCAL_BONUS;
  if (fit.band === "nearby") return WEEKEND_SCORING.TRAVEL_NEARBY_BONUS;
  if (fit.band === "strong") return WEEKEND_SCORING.TRAVEL_STRONG_BONUS;
  if (fit.band === "acceptable" && minutes !== undefined) {
    return (
      WEEKEND_SCORING.TRAVEL_ACCEPTABLE_BASE -
      ((minutes - WEEKEND_TRAVEL_POLICY.STRONG_MAX_MINUTES) /
        WEEKEND_SCORING.TRAVEL_ACCEPTABLE_DENOM) *
        WEEKEND_SCORING.TRAVEL_ACCEPTABLE_STEEPNESS
    );
  }
  if (fit.band === "weak" && minutes !== undefined) {
    return (
      WEEKEND_SCORING.TRAVEL_WEAK_BASE -
      ((minutes - WEEKEND_TRAVEL_POLICY.ACCEPTABLE_MAX_MINUTES) /
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
  // DESTINATION-specific forecast days only. The live origin forecast is
  // never passed here, so without destination weather the weather score is
  // zero and no weekendWeather* reason is generated.
  const weatherDays = (context.destinationWeather?.days ?? []).slice(0, 2);

  const oneWayMinutes = getBestOneWayTravelMinutes(destination, context, modes);
  const travelFit = evaluateWeekendTravelFit(oneWayMinutes);
  const capacity = evaluateWeekendCapacity(destination, pool);

  const travelScore = weekendTravelScoreDelta(travelFit);
  const capacityScore =
    capacity.activityMinutes >= WEEKEND_CAPACITY_POLICY.STRONG_MINUTES
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
      title: "2-Day Trip Ready",
      description: "Enough published places for a full weekend",
    });
  }
  if (capacity.activityMinutes >= WEEKEND_CAPACITY_POLICY.STRONG_MINUTES) {
    reasons.push({
      type: "Weekend",
      code: "weekendCapacityStrong",
      title: "Plenty to Do",
      description: "Enough places for a full weekend",
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
      title: "Good Weather Across Both Days",
      description: "Favorable weather for both days of your trip",
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
  if (
    context.accommodationAllowance !== undefined &&
    context.accommodationAllowance > 0
  ) {
    reasons.push({
      type: "Budget",
      code: "weekendStayAllowance",
      params: { amount: context.accommodationAllowance },
      title: "Stay Allowance Included",
      description: `Estimated total includes ¥${context.accommodationAllowance} stay allowance`,
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
