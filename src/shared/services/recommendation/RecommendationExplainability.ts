import type { Destination } from "@/shared/types/destination";
import {
  resolveRecommendationWeather,
  type RecommendationContext,
} from "./RecommendationContext";
import type { MatchReason, RecommendationMatch } from "./RecommendationTypes";
import { calculateConfidence, getValidModes } from "./RecommendationScorer";
import {
  formatJPYRange,
  getEstimatedBudgetRange,
} from "@/shared/services/budget/BudgetService";
import type { PriceRange } from "@/shared/types/planner";

export function createRecommendationMatch(
  dest: Destination,
  context: RecommendationContext,
  score: number,
): RecommendationMatch {
  const { budget, carMode, publicModes, partySize } = context;
  const vibe = context.vibe ?? context.tripType ?? "any";
  const { actual } = resolveRecommendationWeather(context);

  const reasons: MatchReason[] = [];
  const matchedPreferences: string[] = [];
  const unmatchedPreferences: string[] = [];

  const confidence = calculateConfidence(score);
  const validModesForDest = getValidModes(
    dest,
    carMode,
    publicModes,
    context.homeStationCoords || undefined,
    context.budgetTier,
    context.originZoneId,
  );

  // 1. Budget and Transport Explainability
  let bestMode = validModesForDest[0];
  let bestModeBudget: PriceRange | undefined;
  let hasFastTrain = false;
  let hasEasyDrive = false;

  for (const mode of validModesForDest) {
    let estimatedBudget: PriceRange | undefined;
    if (dest.budgetRecommended) {
      estimatedBudget = getEstimatedBudgetRange(
        dest,
        mode,
        partySize,
        context.budgetTier,
        dest.totalTripHours,
        context.homeStationCoords || undefined,
      );
    }

    if (
      estimatedBudget &&
      estimatedBudget[1] <= budget &&
      (!bestModeBudget || estimatedBudget[1] < bestModeBudget[1])
    ) {
      bestModeBudget = estimatedBudget;
      bestMode = mode;
    }

    if (mode === "train") {
      const time = dest.transportOptions?.train;
      if (time && time <= 60) {
        hasFastTrain = true;
      }
    } else if (
      (mode === "car" || mode === "my_car") &&
      dest.transportOptions?.car
    ) {
      const time = dest.transportOptions.car;
      if (time && time <= 60) {
        hasEasyDrive = true;
      }
    }
  }

  // Budget Reason
  if (dest.budgetRecommended) {
    if (bestModeBudget && bestModeBudget[1] <= budget) {
      matchedPreferences.push("budget");
      if (budget - bestModeBudget[1] >= 5000) {
        const cost = formatJPYRange(bestModeBudget);
        reasons.push({
          type: "Budget",
          code: "budgetGreatValue",
          params: { cost },
          title: "Great Value",
          description: `Well under budget (estimated ${cost})`,
        });
      } else {
        const cost = formatJPYRange(bestModeBudget);
        reasons.push({
          type: "Budget",
          code: "budgetWithin",
          params: { cost },
          title: "Within Budget",
          description: `Estimated ${cost} is within your range`,
        });
      }
    } else {
      unmatchedPreferences.push("budget");
    }
  }

  // Transport Reasons
  if (hasFastTrain) {
    reasons.push({
      type: "Transport",
      code: "transportFastTrain",
      params: { minutes: dest.transportOptions?.train || 0 },
      title: "Fast Train Access",
      description: `Only ${dest.transportOptions?.train}m by train`,
    });
  }
  if (hasEasyDrive) {
    reasons.push({
      type: "Transport",
      code: "transportEasyDrive",
      params: { minutes: dest.transportOptions?.car || 0 },
      title: "Easy Drive",
      description: `Only ${dest.transportOptions?.car}m driving distance`,
    });
  }
  if (bestMode === "shinkansen") {
    reasons.push({
      type: "Transport",
      code: "transportShinkansen",
      params: { minutes: dest.transportOptions?.shinkansen || 0 },
      title: "Shinkansen Connected",
      description: `Quick shinkansen access (${dest.transportOptions?.shinkansen}m)`,
    });
  }

  // 2. Trip Type Explainability
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
      if (ratings.food >= 8.5) {
        matchedPreferences.push("food");
        reasons.push({
          type: "Interest",
          code: "interestFood",
          title: "Top-tier Food Scene",
          description: "Famous for exceptional local culinary experiences",
        });
      }
      break;
    case "nature":
      if (tags.includes("Nature") || cats.includes("Mountain")) {
        matchedPreferences.push("nature");
        reasons.push({
          type: "Interest",
          code: "interestNature",
          title: "Nature Escape",
          description: "Beautiful scenic landscapes and nature views",
        });
      } else {
        unmatchedPreferences.push("nature");
      }
      break;
    case "history":
      if (
        cats.includes("History") ||
        cats.includes("Shrine") ||
        tags.includes("Historic")
      ) {
        matchedPreferences.push("history");
        reasons.push({
          type: "Interest",
          code: "interestHistory",
          title: "Deep History",
          description: "Rich historical background and monuments",
        });
      } else {
        unmatchedPreferences.push("history");
      }
      break;
    case "art":
      if (cats.includes("Museum") || cats.includes("Art")) {
        matchedPreferences.push("art");
        reasons.push({
          type: "Interest",
          code: "interestArt",
          title: "Rich in Art & Culture",
          description: "Excellent museums and galleries to explore",
        });
      } else {
        unmatchedPreferences.push("art");
      }
      break;
    case "sea":
      if (
        cats.includes("Coast") ||
        cats.includes("Sea") ||
        cats.includes("Beach")
      ) {
        matchedPreferences.push("sea");
        reasons.push({
          type: "Interest",
          code: "interestSea",
          title: "Coastal Vibe",
          description: "Refreshing oceanside beaches and views",
        });
      } else {
        unmatchedPreferences.push("sea");
      }
      break;
    case "cool":
      if (ratings.summer >= 8.5) {
        matchedPreferences.push("cool");
        reasons.push({
          type: "Weather",
          code: "interestCool",
          title: "Cool Retreat",
          description: "Refreshing climate perfect for hot days",
        });
      }
      break;
    case "themepark":
      if (cats.includes("Theme Park")) {
        matchedPreferences.push("themepark");
        reasons.push({
          type: "Interest",
          code: "interestThemepark",
          title: "Theme Park Fun",
          description: "Exciting attractions and theme park rides",
        });
      } else {
        unmatchedPreferences.push("themepark");
      }
      break;
  }

  // 3. Environmental Explainability
  const isRaining =
    actual?.condition === "rainy" || actual?.condition === "stormy";
  const isHot = actual?.temperatureC !== undefined && actual.temperatureC >= 30;
  const isCold =
    actual?.temperatureC !== undefined && actual.temperatureC <= 10;

  if (isRaining) {
    const indoor = dest.indoorPercent || 0;
    if (indoor >= 70 || ratings.rain >= 8.5) {
      matchedPreferences.push("weather");
      reasons.push({
        type: "Weather",
        code: "weatherRainFriendly",
        params: indoor >= 70 ? { indoor: Math.round(indoor) } : undefined,
        title: "Rain Friendly",
        description:
          indoor >= 70
            ? `${Math.round(indoor)}% indoor space, perfect for rain`
            : "Highly rated for rainy-day visits",
      });
    }
  }
  if (isHot && ratings.summer >= 8.5) {
    matchedPreferences.push("weather");
    reasons.push({
      type: "Weather",
      code: "weatherCoolRetreat",
      title: "Cool Mountain Air",
      description: "A cool escape from the hot city temperatures",
    });
  }
  if (isCold && ratings.winter >= 8.5) {
    matchedPreferences.push("weather");
    reasons.push({
      type: "Weather",
      code: "weatherWinterComfort",
      title: "Winter Comfort",
      description: "Excellent cold weather/onsen getaway spot",
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      type: "General",
      code: ratings.overall >= 8.5 ? "generalHighlyRated" : "generalSolidMatch",
      title: ratings.overall >= 8.5 ? "Highly Rated Choice" : "Solid Match",
      description:
        ratings.overall >= 8.5
          ? "Highly recommended by other travelers"
          : "A solid match matching your base criteria",
    });
  }

  // REC-002: Confidence disclosure — non-alarming, editorial framing.
  // Added after primary reasons so it does not displace match explanations.
  if (dest.ratingMetadata?.confidence === "low") {
    reasons.push({
      type: "Editorial",
      code: "editorialReviewPending",
      title: "Being Reviewed",
      description:
        "Ratings for this destination are still being verified by our team",
    });
  }

  // Construct structured summary
  const summary = reasons[0]?.description || "A recommended trip choice";

  return {
    confidence,
    reasons,
    matchedPreferences,
    unmatchedPreferences,
    summary,
  };
}
