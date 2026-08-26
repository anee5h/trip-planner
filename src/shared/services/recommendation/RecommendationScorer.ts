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
import {
  calculateTripCost,
  evaluateAffordability,
} from "@/shared/services/budget/tripCostEngine";
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

const MAX_VALID_MODES_CONTEXTS_PER_DESTINATION = 8;
// Catalogue records are immutable after load, so object identity is a valid
// destination component of this bounded semantic cache key.
const validModesCache = new WeakMap<Destination, Map<string, string[]>>();

function buildValidModesCacheKey(
  carMode: string,
  publicModes: string[],
  homeCoords: { lat: number; lng: number } | undefined,
  budgetTier: BudgetTier | undefined,
  originZoneId: TransportZoneId | undefined,
  ferryTemporal: FerryTemporalContext | undefined,
): string {
  return [
    carMode,
    publicModes.join(","),
    homeCoords ? `${homeCoords.lat},${homeCoords.lng}` : "",
    budgetTier ?? "",
    originZoneId ?? "",
    ferryTemporal?.travelDate?.getTime() ?? "",
    ferryTemporal?.season ?? "",
  ].join("|");
}

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
 * REC-002: Whether a destination's legacy RATING VECTOR (ratings.overall,
 * food, couple, …) may be presented as reviewed evidence in the UI ("Highly
 * recommended" claims, experience-ratings grid, combination tie-break).
 * Only high/medium-confidence ratingMetadata counts; low confidence or
 * missing metadata means the raw numbers are unverified (template/assisted)
 * and must not be shown as authoritative. This is a DIFFERENT concept from
 * the overall-score state — see isRatingVerified.
 *
 * KAI-89 overall-score 3-state contract (rubric v2):
 *  - "verified"    — ONE rubric value whose inputs were editorially
 *                    verified against authoritative sources (score-specific
 *                    provenance, date + source URLs, persisted by the
 *                    generator); localized note;
 *  - "estimated"   — the SAME rubric value (Overall-Destination Rubric v2)
 *                    over trusted non-gated catalogue fields, visibly
 *                    labeled estimated + a localized note; NEVER the gated
 *                    raw ratings, NEVER a seasonal-suitability mean;
 *  - "unavailable" — weighted evidence coverage below the documented
 *                    threshold; a consistent localized "Score unavailable"
 *                    note, never blank, never a neutral-5 estimate, never
 *                    the generic "under editorial review" wording.
 */
export {
  type ScoreState,
  type ScoreMetadata,
  type ScoreProvenance,
  type RubricResult,
  type RubricDimensions,
  type EditorialScoreProvenance,
  OVERALL_SCORE_RUBRIC_VERSION,
  SCORE_EVIDENCE_THRESHOLD,
  computeOverallScore,
  isRatingVerified,
  buildScoreMetadata,
  getScorePresentation,
} from "./scoreRubric";

function getValidModesUncached(
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
    if (
      checkMode === "train" ||
      checkMode === "shinkansen" ||
      checkMode === "bus"
    ) {
      if (homeCoords) {
        // Personalized origin with coordinates: the canonical origin-aware
        // system is authoritative for records whose static mode is unknown.
        // A null canonical result means unsupported — stale transportOptions
        // must not resurrect a missing personalized corridor (KAI-12).
        // Existing records with a legacy static value retain that value as an
        // availability fallback until their corridor is migrated; newly
        // verified expansion records deliberately leave the value absent.
        if (
          dest.transportOptions?.[
            checkMode as keyof typeof dest.transportOptions
          ] === undefined
        ) {
          // Origin-aware fallback is opt-in for records that explicitly
          // declare local access modes. Legacy fixtures and records without
          // that declaration must not gain a synthetic corridor merely
          // because a broad prefecture route exists.
          if (
            checkMode === "train" &&
            !dest.localAccessModes?.includes(checkMode)
          ) {
            return false;
          }
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
      }
      if (checkMode === "shinkansen" || checkMode === "bus") {
        if (homeCoords) {
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
        return Boolean(
          dest.transportOptions?.[
            checkMode as keyof typeof dest.transportOptions
          ] !== undefined,
        );
      }
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

export function getValidModes(
  dest: Destination,
  carMode: string = "none",
  publicModes: string[] = [],
  homeCoords?: { lat: number; lng: number },
  budgetTier?: BudgetTier,
  originZoneId?: TransportZoneId,
  ferryTemporal?: FerryTemporalContext,
): string[] {
  const key = buildValidModesCacheKey(
    carMode,
    publicModes,
    homeCoords,
    budgetTier,
    originZoneId,
    ferryTemporal,
  );
  const cachedByContext = validModesCache.get(dest);
  const cached = cachedByContext?.get(key);
  if (cached) return [...cached];

  const validModes = getValidModesUncached(
    dest,
    carMode,
    publicModes,
    homeCoords,
    budgetTier,
    originZoneId,
    ferryTemporal,
  );
  const nextCache = cachedByContext ?? new Map<string, string[]>();
  if (nextCache.size >= MAX_VALID_MODES_CONTEXTS_PER_DESTINATION) {
    const oldestKey = nextCache.keys().next().value;
    if (oldestKey !== undefined) nextCache.delete(oldestKey);
  }
  nextCache.set(key, [...validModes]);
  validModesCache.set(dest, nextCache);
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
      // KAI-217B: the budget score evaluates the CANONICAL engine cost
      // (food/cafe/parking/5% excluded). The legacy midpoint is NOT a valid
      // affordability notion — bonus only on complete fit (max <= C),
      // penalty only on definite over (min > C), nothing when the range
      // straddles the ceiling or the result is partial/open-ended.
      const engineResult = calculateTripCost({
        dest,
        mode,
        partySize,
        homeCoords: context.homeStationCoords || undefined,
        tripMode: "day_trip",
        ferryTemporal: context.ferryTemporal,
      });
      const affordability = evaluateAffordability(engineResult, budget);
      if (affordability === "fits" && engineResult.total) {
        // Complete fit: bonus proportional to headroom under the ceiling.
        budgetScore += Math.min(
          SCORING_WEIGHTS.BUDGET_UNDER_BONUS_MAX,
          (budget - engineResult.total.max) /
            SCORING_WEIGHTS.BUDGET_UNDER_DIVISOR,
        );
        adjustedBudget = engineResult.total.max;
      } else if (affordability === "over" && engineResult.total) {
        // Definite over: penalty proportional to the overshoot.
        budgetScore -=
          ((engineResult.total.min - budget) /
            SCORING_WEIGHTS.BUDGET_OVER_DIVISOR) *
          SCORING_WEIGHTS.BUDGET_OVER_PENALTY_MULTIPLIER;
        adjustedBudget = engineResult.total.min;
      }
      // may_exceed / unknown: no bonus, no penalty (no strict claim).
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
