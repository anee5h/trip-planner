import type { Destination } from "@/shared/types/destination";
import {
  resolveRecommendationWeather,
  type RecommendationContext,
} from "./RecommendationContext";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import { getFixedSeason } from "@/shared/utils/season";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import { personalizationService } from "./PersonalizationService";

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
 * Destinations without ratingMetadata are pre-expansion curated records — full weight.
 */
export const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  high: 1.0,
  medium: 0.8,
  low: 0.5,
};

export function ratingReliability(destination: Destination): number {
  // No ratingMetadata field at all → curated pre-expansion record → full weight.
  if (destination.ratingMetadata === undefined) return 1.0;
  const confidence = destination.ratingMetadata.confidence;
  return CONFIDENCE_MULTIPLIERS[confidence] ?? 0.7;
}

export function getValidModes(
  dest: Destination,
  carMode: string = "none",
  publicModes: string[] = [],
  homeCoords?: { lat: number; lng: number },
  budgetTier?: import("@/shared/types/planner").BudgetTier,
): string[] {
  let validModes: string[] = [];
  if (carMode === "rental" && dest.transportOptions?.car !== undefined)
    validModes.push("car");
  if (carMode === "my_car" && dest.transportOptions?.my_car !== undefined)
    validModes.push("my_car");

  for (const m of publicModes) {
    if (m === "flight") {
      const flightEst = getFlightTransportEstimate(dest, homeCoords);
      if (flightEst) {
        validModes.push("flight");
      }
    } else if (
      dest.transportOptions?.[m as keyof typeof dest.transportOptions] !==
      undefined
    ) {
      validModes.push(m);
    }
  }

  if (budgetTier) {
    const hasMode = (mode: string) => validModes.includes(mode);
    const choose = (preferred: string[], fallback: string[]) => {
      const primary = preferred.filter(hasMode);
      return primary.length > 0 ? primary : fallback.filter(hasMode);
    };
    validModes =
      budgetTier === "economy"
        ? choose(["train", "bus"], ["shinkansen", "flight"])
        : budgetTier === "standard"
          ? choose(["train", "bus"], ["shinkansen", "flight"])
          : budgetTier === "comfortable"
            ? choose(["shinkansen", "train", "bus"], ["flight"])
            : choose(["shinkansen", "flight", "train", "bus"], []);
  }

  if (
    validModes.length === 0 &&
    (carMode !== "none" || publicModes.length > 0)
  ) {
    return [];
  }

  if (validModes.length === 0) {
    const entries = Object.entries(dest.transportOptions || {}).filter(
      ([_, v]) => v !== undefined,
    );
    if (entries.length > 0) validModes = entries.map((e) => e[0]);
    else validModes = ["train"];
  }

  return validModes;
}

export function calculateConfidence(score: number): number {
  return Math.max(15, Math.min(99, Math.round((score / 120) * 100)));
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
} {
  const { budget, carMode, publicModes, partySize, userRatings } = context;
  const vibe = context.vibe ?? context.tripType ?? "any";
  const { actual, preferred } = resolveRecommendationWeather(context);

  const ratingWeight = ratingReliability(dest);
  const ratingScore = (value: number) => value * ratingWeight;
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
  );

  // Budget and Transport Logic
  let bestMode = validModesForDest[0];
  let bestModeScore = 0;
  let bestModeBudget: number | undefined;

  for (const mode of validModesForDest) {
    let modeScore = 0;

    let adjustedBudget = 999999;
    if (dest.budgetRecommended) {
      const estimatedRange = getEstimatedBudgetRange(
        dest,
        mode,
        partySize,
        context.budgetTier,
        dest.totalTripHours,
        context.homeStationCoords || undefined,
      );
      adjustedBudget = (estimatedRange[0] + estimatedRange[1]) / 2;
      if (adjustedBudget > budget) {
        modeScore -=
          ((adjustedBudget - budget) / SCORING_WEIGHTS.BUDGET_OVER_DIVISOR) *
          SCORING_WEIGHTS.BUDGET_OVER_PENALTY_MULTIPLIER;
      } else {
        modeScore += Math.min(
          SCORING_WEIGHTS.BUDGET_UNDER_BONUS_MAX,
          (budget - adjustedBudget) / SCORING_WEIGHTS.BUDGET_UNDER_DIVISOR,
        );
      }
    }

    if (mode === "train") {
      const time = dest.transportOptions?.train;
      if (time) {
        modeScore +=
          SCORING_WEIGHTS.TRANSPORT_TRAIN_BASE + Math.max(0, 12 - time / 10);
      }
    } else if (mode === "car" || mode === "my_car") {
      const time =
        mode === "my_car"
          ? dest.transportOptions?.my_car
          : dest.transportOptions?.car;
      if (time) {
        modeScore +=
          SCORING_WEIGHTS.TRANSPORT_CAR_BASE + Math.max(0, 10 - time / 15);
      }
    } else if (mode === "shinkansen") {
      modeScore += SCORING_WEIGHTS.TRANSPORT_SHINKANSEN_FLAT;
    } else if (mode === "bus") {
      modeScore += SCORING_WEIGHTS.TRANSPORT_BUS_FLAT;
    }

    if (
      modeScore > bestModeScore ||
      (Math.abs(modeScore - bestModeScore) < 0.1 &&
        (bestModeBudget === undefined || adjustedBudget < bestModeBudget))
    ) {
      bestModeScore = modeScore;
      bestModeBudget = adjustedBudget;
      bestMode = mode;
    }
  }

  if (validModesForDest.length > 0) score += bestModeScore;

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

  // Environmental Logic
  const isRaining =
    actual?.condition === "rainy" || actual?.condition === "stormy";
  const isHot = actual?.temperatureC !== undefined && actual.temperatureC >= 30;
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

  // Calendar Season Scoring
  // Independent of live weather — a cold rainy July is still calendar-summer.
  // Reads destination.season[currentSeason] (0-10 scale, fully populated on all destinations).
  // Falls back to 5 (neutral mid-point) if the field is missing.
  const currentSeason = getFixedSeason();
  const seasonScore = dest.season?.[currentSeason] ?? 5;
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
  };
}
