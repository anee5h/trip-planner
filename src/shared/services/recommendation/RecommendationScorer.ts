import type { Destination } from "@/shared/types/destination";
import {
  resolveRecommendationWeather,
  type RecommendationContext,
} from "./RecommendationContext";
import { getAdjustedBudget } from "@/shared/services/budget/BudgetService";
import { getFixedSeason } from "@/shared/utils/season";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";

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

export function getValidModes(
  dest: Destination,
  carMode: string = "none",
  publicModes: string[] = [],
  homeCoords?: { lat: number; lng: number },
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
  bestMode?: string;
  bestModeScore: number;
  bestModeBudget: number;
} {
  const { tripType, budget, carMode, publicModes, partySize, userRatings } =
    context;
  const { actual, preferred } = resolveRecommendationWeather(context);

  let score =
    SCORING_WEIGHTS.BASE_SCORE +
    (dest.ratings?.overall || 5) * SCORING_WEIGHTS.RATING_MULTIPLIER;

  const validModesForDest = getValidModes(
    dest,
    carMode,
    publicModes,
    context.homeStationCoords || undefined,
  );

  // Budget and Transport Logic
  let bestMode = validModesForDest[0];
  let bestModeScore = -9999;
  let bestModeBudget = 999999;

  for (const mode of validModesForDest) {
    let modeScore = 0;

    let adjustedBudget = 999999;
    if (dest.budgetRecommended) {
      adjustedBudget = getAdjustedBudget(
        dest,
        mode,
        partySize,
        context.homeStationCoords || undefined,
      );
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
        adjustedBudget < bestModeBudget)
    ) {
      bestModeScore = modeScore;
      bestModeBudget = adjustedBudget;
      bestMode = mode;
    }
  }

  score += bestModeScore;

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

  switch (tripType) {
    case "food":
      score += (ratings.food - 5) * SCORING_WEIGHTS.TRIP_TYPE_FOOD_MULTIPLIER;
      break;
    case "nature":
      if (tags.includes("Nature") || cats.includes("Mountain")) {
        score +=
          SCORING_WEIGHTS.TRIP_TYPE_NATURE_MATCH +
          ratings.photography * SCORING_WEIGHTS.TRIP_TYPE_NATURE_PHOTO_MULT;
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
      score += (ratings.summer - 5) * SCORING_WEIGHTS.TRIP_TYPE_COOL_MULTIPLIER;
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
    score += (ratings.summer - 5) * SCORING_WEIGHTS.ENV_TEMP_MULTIPLIER;
    if (ratings.summer <= 4) score -= SCORING_WEIGHTS.ENV_TEMP_PENALTY;
  }
  if (isCold) {
    score += (ratings.winter - 5) * SCORING_WEIGHTS.ENV_TEMP_MULTIPLIER;
    if (ratings.winter <= 4) score -= SCORING_WEIGHTS.ENV_TEMP_PENALTY;
  }

  if (preferred === "rainy") {
    score += (dest.comfort?.rainFriendly ?? dest.ratings?.rain ?? 5) - 5;
  } else if (preferred === "hot") {
    score += (ratings.summer - 5) * 2;
  } else if (preferred === "cold") {
    score += (ratings.winter - 5) * 2;
  }

  // Calendar Season Scoring
  // Independent of live weather — a cold rainy July is still calendar-summer.
  // Reads destination.season[currentSeason] (0-10 scale, fully populated on all destinations).
  // Falls back to 5 (neutral mid-point) if the field is missing.
  const currentSeason = getFixedSeason();
  const seasonScore = dest.season?.[currentSeason] ?? 5;
  score += seasonScore * SCORING_WEIGHTS.SEASON_MULTIPLIER;

  // User Rating Adjustments (Netflix-style Thumbs Up / Down)
  if (userRatings?.[dest.id] === "up") {
    score += 25;
  } else if (userRatings?.[dest.id] === "down") {
    score -= 1000;
  }

  return {
    score,
    bestMode,
    bestModeScore,
    bestModeBudget,
  };
}
