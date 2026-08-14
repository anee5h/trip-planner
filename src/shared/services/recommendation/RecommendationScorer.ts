import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { BudgetTier } from "@/shared/types/planner";
import type { TransportMode } from "@/shared/services/transport/types";
import {
  resolveRecommendationWeather,
  type RecommendationContext,
} from "./RecommendationContext";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import { getFixedSeason } from "@/shared/utils/season";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import { getFerryTransportEstimate } from "@/shared/services/transport/FerryTransportEstimator";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { personalizationService } from "./PersonalizationService";
import {
  getDayTripTravelDurationEvidence,
  getDayTripTravelEfficiency,
  hasPersonalizedOrigin,
} from "./TripDurationService";
import type { DayTripTravelEfficiency } from "./TripDurationService";

export const SCORING_WEIGHTS = {
  // Base & Ratings
  BASE_SCORE: 20,
  RATING_MULTIPLIER: 6,

  // Budget
  BUDGET_OVER_PENALTY_MULTIPLIER: 1.5,
  BUDGET_OVER_DIVISOR: 1000,
  BUDGET_UNDER_BONUS_MAX: 10,
  BUDGET_UNDER_DIVISOR: 3000,

  // Transport
  TRANSPORT_TRAIN_BASE: 4,
  TRANSPORT_CAR_BASE: 5,
  TRANSPORT_SHINKANSEN_FLAT: 12,
  TRANSPORT_BUS_FLAT: 10,
  TRANSPORT_FERRY_FLAT: 8,

  // Trip Type (Target ~+20 for strong match, -25 for mismatch)
  TRIP_TYPE_FOOD_MULTIPLIER: 5, // e.g. (10 - 5) * 5 = +25 max
  TRIP_TYPE_NATURE_MATCH: 15,
  TRIP_TYPE_NATURE_PHOTO_MULT: 1, // 15 + (10 * 1) = +25 max
  TRIP_TYPE_NATURE_PENALTY: 25,
  TRIP_TYPE_HISTORY_MATCH: 20,
  TRIP_TYPE_HISTORY_PENALTY: 25,
  TRIP_TYPE_ART_MATCH: 20,
  TRIP_TYPE_ART_PENALTY: 25,
  TRIP_TYPE_SEA_MATCH: 20,
  TRIP_TYPE_SEA_PENALTY: 25,
  TRIP_TYPE_COOL_MULTIPLIER: 5, // e.g. (10 - 5) * 5 = +25 max
  TRIP_TYPE_THEMEPARK_MATCH: 20,
  TRIP_TYPE_THEMEPARK_PENALTY: 25,

  // Environment
  ENV_RAIN_INDOOR_MULTIPLIER: 25,
  ENV_RAIN_POOR_INDOOR_PENALTY: 25,
  ENV_TEMP_MULTIPLIER: 5,
  ENV_TEMP_PENALTY: 25,

  // Season (calendar-based, independent of live weather)
  // A perfect 10/10 seasonal destination adds +30 — conservative starting value.
  SEASON_MULTIPLIER: 3,
};

/**
 * REC-001: Confidence multipliers for rating-derived score contributions.
 * high = reviewed and verified; medium = lightly reviewed; low = assisted/beta.
 * Missing metadata is unverified evidence and receives the conservative low weight.
 */
export const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  high: 1.0,
  medium: 0.8,
  low: 0.5,
};

export function ratingReliability(destination: Destination): number {
  if (destination.ratingMetadata === undefined)
    return CONFIDENCE_MULTIPLIERS.low;
  const confidence = destination.ratingMetadata.confidence;
  return CONFIDENCE_MULTIPLIERS[confidence] ?? 0.7;
}

/**
 * REC-002: Whether a destination's rating vector may be presented as a
 * reviewed fact in the UI (card score, detail score card, compare table,
 * map popup, "Highly recommended" claims). Only high/medium-confidence
 * metadata counts as verified evidence; low confidence or missing metadata
 * means the raw numbers are unverified (template/assisted) and must not be
 * shown as authoritative.
 *
 * KAI-89 3-state contract (finishing pass):
 *  - "verified"    — numeric score shown from trusted provenance + a
 *                    localized explanation;
 *  - "estimated"   — a DETERMINISTIC score derived from trusted non-gated
 *                    inputs (the season vector with its own provenance),
 *                    visibly labeled estimated + a localized note; NEVER
 *                    the gated raw ratings;
 *  - "unavailable" — cannot be scored from trusted inputs; a consistent
 *                    localized "Score unavailable" note, never blank, never
 *                    the generic "under editorial review" wording.
 */
export type RatingDisplayState = "verified" | "estimated" | "unavailable";

export function getRatingDisplayState(
  destination: Destination,
): RatingDisplayState {
  const confidence = destination.ratingMetadata?.confidence;
  if (confidence === "high" || confidence === "medium") return "verified";
  // Estimated only from TRUSTED, separately-provenanced inputs — never the
  // gated ratings vector.
  return getEstimatedOverallScore(destination) === null
    ? "unavailable"
    : "estimated";
}

/**
 * Deterministic estimated overall score (0-10) from the season vector —
 * the only trusted non-gated 0-10 signal with its own KAI-89 provenance
 * (seasonMetadata). The mean of the four season values is used ONLY when
 * seasonMetadata.method is model/manual/assisted and all four values are
 * finite. Explicit-neutral (method "unknown") or missing season NEVER
 * becomes a fabricated number → null (unavailable).
 */
export function getEstimatedOverallScore(
  destination: Destination,
): number | null {
  const method = destination.seasonMetadata?.method;
  if (method === undefined || method === "unknown") return null;
  const s = destination.season;
  if (!s) return null;
  const values = [s.spring, s.summer, s.autumn, s.winter];
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v)))
    return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 10) / 10;
}

/**
 * One shared presentation resolution so every surface stays in lockstep:
 * state, the numeric value to render (null when unavailable), and whether
 * the value is an ESTIMATE (must be visibly labeled; never earns "Best"
 * badges or verified-only claims).
 */
export function getScorePresentation(destination: Destination): {
  state: RatingDisplayState;
  value: number | null;
  estimated: boolean;
} {
  const state = getRatingDisplayState(destination);
  if (state === "verified")
    return {
      state,
      value:
        typeof destination.ratings?.overall === "number"
          ? destination.ratings.overall
          : null,
      estimated: false,
    };
  if (state === "estimated")
    return {
      state,
      value: getEstimatedOverallScore(destination),
      estimated: true,
    };
  return { state, value: null, estimated: false };
}

export function getValidModes(
  dest: Destination,
  carMode: string = "none",
  publicModes: string[] = [],
  homeCoords?: { lat: number; lng: number },
  _budgetTier?: BudgetTier,
  originZoneId?: TransportZoneId,
  ferryTemporal?: FerryTemporalContext,
): string[] {
  // a. Resolve origin and destination zones.
  const effectiveOriginZoneId =
    originZoneId ??
    (homeCoords
      ? resolveOriginTransportZone({ coordinates: homeCoords })
      : undefined);
  if (!effectiveOriginZoneId || effectiveOriginZoneId === "unknown") {
    return [];
  }
  const destinationZoneId = resolveDestinationTransportZone(dest);
  if (destinationZoneId === "unknown") {
    return [];
  }

  // b. Authorize modes from independent sources:
  //    - rail/road/bus: explicit topology connections (edges or same-zone
  //      local policy)
  //    - flight: verified airport route from flight-estimates.json
  //    - ferry: verified passenger route from ferry-estimates.json
  const topologyModes = getEligibleOriginModes({
    originZoneId: effectiveOriginZoneId,
    destinationZoneId,
    destination: dest,
  });
  const authorized = new Set<TransportMode>(
    effectiveOriginZoneId === destinationZoneId
      ? topologyModes.localModes
      : topologyModes.crossZoneModes,
  );
  const flightEstimate = getFlightTransportEstimate(
    dest,
    homeCoords,
    ferryTemporal?.travelDate,
  );
  if (flightEstimate) authorized.add("flight");
  const ferryEstimate = getFerryTransportEstimate(
    dest,
    homeCoords,
    ferryTemporal,
  );
  if (ferryEstimate) authorized.add("ferry");

  // c. Conservative failure: no authorized route → no modes.
  if (authorized.size === 0) return [];

  // d. Intersect with user-selected modes and destination support.
  const supported = (mode: string): boolean => {
    if (mode === "flight") return Boolean(flightEstimate);
    if (mode === "ferry") return Boolean(ferryEstimate);
    // my_car uses the same road-support check as car
    const checkMode = mode === "my_car" ? "car" : mode;
    if (checkMode === "shinkansen" || checkMode === "bus") {
      if (homeCoords) {
        // Personalized origin with coordinates: the canonical origin-aware
        // system is authoritative. A null canonical result means unsupported —
        // stale transportOptions must not resurrect a missing personalized
        // corridor (KAI-12).
        return Boolean(
          getOriginAwareTransportEstimate(
            dest,
            {
              homeStationCoords: homeCoords,
              originZoneId: effectiveOriginZoneId,
              ferryTemporal,
            },
            [checkMode],
          ),
        );
      }
      // Zone-only / neutral browsing keeps the legacy metadata display gate.
      return (
        dest.transportOptions?.[
          checkMode as keyof typeof dest.transportOptions
        ] !== undefined
      );
    }
    return (
      dest.transportOptions?.[
        checkMode as keyof typeof dest.transportOptions
      ] !== undefined
    );
  };
  const selected = new Set<string>(publicModes);
  if (carMode === "rental") selected.add("car");
  if (carMode === "my_car") selected.add("my_car");

  let validModes: string[] = [];
  const addMode = (m: string) => {
    if (!validModes.includes(m)) validModes.push(m);
  };
  for (const mode of authorized) {
    if (mode === "car") {
      // Topology car authorizes both rental and personal car.
      if (selected.has("car") && supported("car")) addMode("car");
      if (selected.has("my_car") && supported("my_car")) addMode("my_car");
      continue;
    }
    if (mode === "my_car") {
      if (selected.has(mode) && supported(mode)) addMode(mode);
      continue;
    }
    if (selected.has(mode) && supported(mode)) addMode(mode);
  }

  // No budget-tier mode deletion: a faster authorized mode (e.g. shinkansen)
  // must survive for travel-time evaluation and for per-mode affordability.
  // Budget tiers influence ranking and the affordability gate, never which
  // authorized modes are evaluated.
  return validModes;
}

export function calculateConfidence(score: number): number {
  return Math.max(15, Math.min(99, Math.round((score / 120) * 100)));
}

export interface ModeScoreBreakdown {
  mode: string;
  budget: number;
  transport: number;
  travelEfficiency: number;
  total?: number;
  usable: boolean;
  travelEvidence?: "verified" | "estimated" | "unknown";
}

export function calculateScore(
  dest: Destination,
  context: RecommendationContext,
): {
  score: number;
  eligible: boolean;
  ineligibleReason?: "NO_VALID_TRANSPORT";
  bestMode?: string;
  bestModeScore: number;
  bestModeBudget?: number;
  dayTripTravelEfficiency?: DayTripTravelEfficiency;
  modeScoreBreakdown: Record<string, ModeScoreBreakdown>;
} {
  const { budget, carMode, publicModes, partySize, userRatings } = context;
  const vibe = context.vibe ?? context.tripType ?? "any";
  const { actual, preferred } = resolveRecommendationWeather(context);

  const ratingWeight = ratingReliability(dest);
  const ratingScore = (value: number) =>
    Number.isFinite(value) ? value * ratingWeight : 0;
  let score =
    SCORING_WEIGHTS.BASE_SCORE +
    ratingScore(
      ((dest.ratings?.overall ?? 5) - 5) * SCORING_WEIGHTS.RATING_MULTIPLIER,
    );

  const validModesForDest = getValidModes(
    dest,
    carMode,
    publicModes,
    context.homeStationCoords || undefined,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );

  // Budget and Transport Logic
  const personalizedDayTrip =
    context.tripMode === "day_trip" && hasPersonalizedOrigin(context);
  let bestMode: string | undefined = personalizedDayTrip
    ? undefined
    : validModesForDest[0];
  let bestModeScore = 0;
  let bestModeBudget: number | undefined;
  let bestModeTotal = personalizedDayTrip ? Number.NEGATIVE_INFINITY : 0;
  let dayTripTravelEfficiency: DayTripTravelEfficiency | undefined;
  const modeScoreBreakdown: Record<string, ModeScoreBreakdown> = {};

  for (const mode of validModesForDest) {
    let budgetScore = 0;

    let adjustedBudget = Number.POSITIVE_INFINITY;
    const budgetRecommended = dest.budgetRecommended;
    if (
      typeof budgetRecommended === "number" &&
      Number.isFinite(budgetRecommended) &&
      budgetRecommended >= 0
    ) {
      const estimatedResult = getEstimatedBudgetRange(
        dest,
        mode,
        partySize,
        context.budgetTier,
        context.homeStationCoords || undefined,
        context.ferryTemporal,
      );
      // KAI-50: budget uses the mode-specific derived duration. Skip the
      // bonus/penalty when either the origin transport fare or the
      // duration-dependent meal/rental cost is unavailable.
      if (
        estimatedResult.transportIncluded &&
        estimatedResult.durationIncluded &&
        estimatedResult.range
      ) {
        adjustedBudget =
          (estimatedResult.range[0] + estimatedResult.range[1]) / 2;
        if (adjustedBudget > budget) {
          budgetScore -=
            ((adjustedBudget - budget) / SCORING_WEIGHTS.BUDGET_OVER_DIVISOR) *
            SCORING_WEIGHTS.BUDGET_OVER_PENALTY_MULTIPLIER;
        } else {
          budgetScore += Math.min(
            SCORING_WEIGHTS.BUDGET_UNDER_BONUS_MAX,
            (budget - adjustedBudget) / SCORING_WEIGHTS.BUDGET_UNDER_DIVISOR,
          );
        }
      }
    }

    let transportScore = 0;
    if (mode === "train") {
      const estimate = getOriginAwareTransportEstimate(
        dest,
        {
          homeStationCoords: context.homeStationCoords ?? undefined,
          ferryTemporal: context.ferryTemporal,
        },
        ["train"],
      );
      if (estimate) {
        transportScore +=
          SCORING_WEIGHTS.TRANSPORT_TRAIN_BASE +
          Math.max(0, 12 - estimate.timeRange[0] / 10);
      }
    } else if (mode === "car" || mode === "my_car") {
      // Car modes have no verified origin-aware duration registry; no bonus
      // is fabricated from unprovenanced catalogue times.
    } else if (mode === "shinkansen") {
      transportScore += SCORING_WEIGHTS.TRANSPORT_SHINKANSEN_FLAT;
    } else if (mode === "bus") {
      transportScore += SCORING_WEIGHTS.TRANSPORT_BUS_FLAT;
    } else if (mode === "ferry") {
      transportScore += SCORING_WEIGHTS.TRANSPORT_FERRY_FLAT;
    }

    const modeTravelEfficiency = personalizedDayTrip
      ? getDayTripTravelEfficiency(dest, context, mode)
      : undefined;
    const modeTravelEvidence =
      personalizedDayTrip && !dest.recommendedVisitHours
        ? getDayTripTravelDurationEvidence(dest, context, [mode]).evidence
        : modeTravelEfficiency?.evidence;
    const usable =
      !personalizedDayTrip ||
      (dest.recommendedVisitHours
        ? modeTravelEfficiency !== undefined
        : modeTravelEvidence !== "unknown");
    const travelEfficiencyScore = modeTravelEfficiency?.contribution ?? 0;
    const total = budgetScore + transportScore + travelEfficiencyScore;
    modeScoreBreakdown[mode] = {
      mode,
      budget: budgetScore,
      transport: transportScore,
      travelEfficiency: travelEfficiencyScore,
      ...(usable ? { total } : {}),
      usable,
      travelEvidence: modeTravelEvidence,
    };
    if (!usable) continue;

    const shouldSelect = personalizedDayTrip
      ? total > bestModeTotal ||
        (Math.abs(total - bestModeTotal) < 0.1 &&
          (bestModeBudget === undefined || adjustedBudget < bestModeBudget))
      : total > bestModeScore ||
        (Math.abs(total - bestModeScore) < 0.1 &&
          (bestModeBudget === undefined || adjustedBudget < bestModeBudget));
    if (shouldSelect) {
      bestModeTotal = total;
      bestModeScore = budgetScore + transportScore;
      bestModeBudget = adjustedBudget;
      bestMode = mode;
      dayTripTravelEfficiency = modeTravelEfficiency;
    }
  }

  if (bestMode) score += personalizedDayTrip ? bestModeTotal : bestModeScore;

  // Trip Type Logic
  const ratings = dest.ratings || {
    food: 5,
    photography: 5,
    summer: 5,
    winter: 5,
    overall: 5,
  };
  const cats = dest.categories || [];
  const tags = dest.tags || [];

  switch (vibe) {
    case "food":
      score += ratingScore(
        (ratings.food - 5) * SCORING_WEIGHTS.TRIP_TYPE_FOOD_MULTIPLIER,
      );
      break;
    case "nature":
      if (tags.includes("Nature") || cats.includes("Mountain")) {
        score +=
          SCORING_WEIGHTS.TRIP_TYPE_NATURE_MATCH +
          ratingScore(
            ratings.photography * SCORING_WEIGHTS.TRIP_TYPE_NATURE_PHOTO_MULT,
          );
      } else score -= SCORING_WEIGHTS.TRIP_TYPE_NATURE_PENALTY;
      break;
    case "history":
      if (
        cats.includes("History") ||
        cats.includes("Shrine") ||
        tags.includes("Historic")
      ) {
        score += SCORING_WEIGHTS.TRIP_TYPE_HISTORY_MATCH;
      } else score -= SCORING_WEIGHTS.TRIP_TYPE_HISTORY_PENALTY;
      break;
    case "art":
      if (cats.includes("Museum") || cats.includes("Art")) {
        score += SCORING_WEIGHTS.TRIP_TYPE_ART_MATCH;
      } else score -= SCORING_WEIGHTS.TRIP_TYPE_ART_PENALTY;
      break;
    case "sea":
      if (
        cats.includes("Coast") ||
        cats.includes("Sea") ||
        cats.includes("Beach")
      ) {
        score += SCORING_WEIGHTS.TRIP_TYPE_SEA_MATCH;
      } else score -= SCORING_WEIGHTS.TRIP_TYPE_SEA_PENALTY;
      break;
    case "cool":
      score += ratingScore(
        (ratings.summer - 5) * SCORING_WEIGHTS.TRIP_TYPE_COOL_MULTIPLIER,
      );
      break;
    case "themepark":
      if (cats.includes("Theme Park")) {
        score += SCORING_WEIGHTS.TRIP_TYPE_THEMEPARK_MATCH;
      } else score -= SCORING_WEIGHTS.TRIP_TYPE_THEMEPARK_PENALTY;
      break;
  }

  // Environmental Logic — only applies to day trips; weekend weather is handled separately
  if (context.tripMode !== "weekend_2d1n") {
    const isRaining =
      actual?.condition === "rainy" || actual?.condition === "stormy";
    const isHot =
      actual?.temperatureC !== undefined && actual.temperatureC >= 30;
    const isCold =
      actual?.temperatureC !== undefined && actual.temperatureC <= 10;

    if (isRaining) {
      const indoor = dest.indoorPercent || 0;
      score += (indoor / 100) * SCORING_WEIGHTS.ENV_RAIN_INDOOR_MULTIPLIER;
      if (indoor < 30) score -= SCORING_WEIGHTS.ENV_RAIN_POOR_INDOOR_PENALTY;
    }
    if (isHot) {
      score += ratingScore(
        (ratings.summer - 5) * SCORING_WEIGHTS.ENV_TEMP_MULTIPLIER,
      );
      if (ratings.summer <= 4)
        score -= ratingScore(SCORING_WEIGHTS.ENV_TEMP_PENALTY);
    }
    if (isCold) {
      score += ratingScore(
        (ratings.winter - 5) * SCORING_WEIGHTS.ENV_TEMP_MULTIPLIER,
      );
      if (ratings.winter <= 4)
        score -= ratingScore(SCORING_WEIGHTS.ENV_TEMP_PENALTY);
    }

    if (preferred === "rainy") {
      const indoor = dest.indoorPercent || 0;
      score += (indoor / 100) * SCORING_WEIGHTS.ENV_RAIN_INDOOR_MULTIPLIER;
      if (indoor < 30) score -= SCORING_WEIGHTS.ENV_RAIN_POOR_INDOOR_PENALTY;
    }
    if (preferred === "hot") {
      score += ratingScore(
        (ratings.summer - 5) * SCORING_WEIGHTS.ENV_TEMP_MULTIPLIER,
      );
      if (ratings.summer <= 4)
        score -= ratingScore(SCORING_WEIGHTS.ENV_TEMP_PENALTY);
    }
    if (preferred === "cold") {
      score += ratingScore(
        (ratings.winter - 5) * SCORING_WEIGHTS.ENV_TEMP_MULTIPLIER,
      );
      if (ratings.winter <= 4)
        score -= ratingScore(SCORING_WEIGHTS.ENV_TEMP_PENALTY);
    }
  }

  // Calendar Season Scoring
  // Independent of live weather — a cold rainy July is still calendar-summer.
  // Reads destination.season[currentSeason] (0-10 scale, fully populated on all destinations).
  // Falls back to 5 (neutral mid-point) if the field is missing.
  const currentSeason = getFixedSeason();
  const seasonScore =
    typeof dest.season?.[currentSeason] === "number" &&
    Number.isFinite(dest.season[currentSeason])
      ? dest.season[currentSeason]
      : 5;
  score += (seasonScore - 5) * SCORING_WEIGHTS.SEASON_MULTIPLIER;

  // User Rating Adjustments (Netflix-style Thumbs Up / Down)
  if (userRatings?.[dest.id] === "up") {
    score += 25;
  } else if (userRatings?.[dest.id] === "down") {
    score -= 1000;
  }

  // Personalization Multiplier
  if (context.userProfile) {
    const pMultiplier = personalizationService.calculateMultiplier(
      dest,
      context.userProfile,
      context.personalizationSettings,
    );
    score = Math.round(score * pMultiplier);
  }

  return {
    score,
    eligible: validModesForDest.length > 0,
    ...(validModesForDest.length === 0
      ? { ineligibleReason: "NO_VALID_TRANSPORT" as const }
      : {}),
    bestMode,
    bestModeScore,
    bestModeBudget,
    dayTripTravelEfficiency,
    modeScoreBreakdown,
  };
}
