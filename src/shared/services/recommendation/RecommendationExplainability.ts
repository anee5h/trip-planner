import type { Destination } from "@/shared/types/destination";
import {
  resolveRecommendationWeather,
  type RecommendationContext,
} from "./RecommendationContext";
import type {
  MatchReason,
  RecommendationMatch,
  RecommendationReasonCode,
} from "./RecommendationTypes";
import {
  calculateConfidence,
  isRatingVerified,
  getValidModes,
} from "./RecommendationScorer";
import { formatJPYRange } from "@/shared/services/budget/BudgetService";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { getFerryTransportEstimate } from "@/shared/services/transport/FerryTransportEstimator";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type { PriceRange } from "@/shared/types/planner";

const DAY_TRIP_DISPLAY_PRIORITY: readonly (readonly RecommendationReasonCode[])[] =
  [
    // Specific date/weather guidance is more decision-useful than generic fit.
    [
      "conditionFerrySeasonal",
      "conditionSeasonalStrong",
      "conditionSeasonalWeak",
      "conditionSeasonalMonth",
      "conditionIndoorHeat",
      "conditionIndoorWinter",
      "conditionOutdoorSummer",
      "conditionOutdoorWinter",
      "conditionRainFriendly",
      "conditionRainExposed",
      "weatherRainFriendly",
      "weatherCoolRetreat",
      "weatherWinterComfort",
    ],
    // Then show the requested vibe/interest match, preserving its source order.
    [
      "interestFood",
      "interestNature",
      "interestHistory",
      "interestArt",
      "interestSea",
      "interestCool",
      "interestThemepark",
    ],
    // Transport and budget are useful supporting context.
    [
      "transportFastTrain",
      "transportShinkansen",
      "transportFerry",
      "transportEasyDrive",
    ],
    ["budgetGreatValue", "budgetWithin"],
    // Generic/editorial and non-day-trip reasons are the final fallback tier.
    [
      "generalHighlyRated",
      "generalSolidMatch",
      "editorialReviewPending",
      "conditionForecastDay",
      "conditionForecastRange",
      "conditionUnknown",
      "weekendWeatherGood",
      "weekendWeatherDayRain",
      "weekendWeatherPoorOutdoor",
      "weekendTravelStrong",
      "weekendTravelAcceptable",
      "weekendTravelWeak",
      "weekendCapacityStrong",
      "weekendTripReady",
      "weekendStayAllowance",
      "weekendTransportExcluded",
    ],
  ];

function getDayTripDisplayTier(code: RecommendationReasonCode): number {
  return DAY_TRIP_DISPLAY_PRIORITY.findIndex((tier) => tier.includes(code));
}

const OVERNIGHT_DISPLAY_PRIORITY: readonly RecommendationReasonCode[] = [
  "weekendWeatherGood",
  "weekendWeatherDayRain",
  "weekendWeatherPoorOutdoor",
  "weekendTravelStrong",
  "weekendTravelAcceptable",
  "weekendTravelWeak",
  "weekendCapacityStrong",
  "weekendTripReady",
];

/**
 * Selects a display-only primary reason without mutating or reordering the
 * canonical match.reasons array used by recommendation semantics.
 */
export function getPrimaryDisplayReason(
  reasons: readonly MatchReason[],
  options: { overnight?: boolean } = {},
): MatchReason | undefined {
  if (options.overnight) {
    for (const code of OVERNIGHT_DISPLAY_PRIORITY) {
      const reason = reasons.find((candidate) => candidate.code === code);
      if (reason) return reason;
    }
    return undefined;
  }

  let primary: MatchReason | undefined;
  let primaryRank = Number.POSITIVE_INFINITY;
  for (const reason of reasons) {
    const rank = getDayTripDisplayTier(reason.code);
    if (rank >= 0 && rank < primaryRank) {
      primary = reason;
      primaryRank = rank;
    }
  }
  return primary;
}

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
    context.ferryTemporal,
  );

  // 1. Budget and Transport Explainability
  let bestMode = validModesForDest[0];
  let bestModeBudget: PriceRange | undefined;
  let hasFastTrain = false;

  for (const mode of validModesForDest) {
    let estimatedBudget: PriceRange | undefined;
    // A bounded canonical estimate can support an affordability reason even
    // when one or more ingredients are model-derived.
    const engineResult = calculateTripEstimate({
      dest,
      mode,
      partySize,
      homeCoords: context.homeStationCoords ?? undefined,
      includeOriginTravel: Boolean(context.homeStationCoords),
      budgetTier: context.budgetTier,
      // KAI-260: use the same canonical duration as the scorer.
      duration: context.tripDuration ?? "fullDay",
      ferryTemporal: context.ferryTemporal,
    });
    if (engineResult.total && engineResult.total.max <= budget) {
      estimatedBudget = [engineResult.total.min, engineResult.total.max];
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
      const estimate = getOriginAwareTransportEstimate(
        dest,
        {
          homeStationCoords: context.homeStationCoords ?? undefined,
          ferryTemporal: context.ferryTemporal,
        },
        ["train"],
      );
      if (estimate && estimate.timeRange[0] <= 60) {
        hasFastTrain = true;
      }
    }
  }

  // Budget Reason
  if (bestModeBudget) {
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

  // Transport Reasons — minutes come from the same origin-aware estimate
  // used for ranking, never from unprovenanced catalogue values.
  const transportEstimate = getOriginAwareTransportEstimate(
    dest,
    {
      homeStationCoords: context.homeStationCoords ?? undefined,
      ferryTemporal: context.ferryTemporal,
    },
    validModesForDest,
  );
  if (hasFastTrain) {
    const minutes = transportEstimate?.timeRange[0] ?? 0;
    reasons.push({
      type: "Transport",
      code: "transportFastTrain",
      params: { minutes },
      title: "Fast Train Access",
      description: `Only ${minutes}m by train`,
    });
  }
  if (bestMode === "shinkansen" && transportEstimate) {
    reasons.push({
      type: "Transport",
      code: "transportShinkansen",
      params: { minutes: transportEstimate.timeRange[0] },
      title: "Shinkansen Connected",
      description: `Quick shinkansen access (${transportEstimate.timeRange[0]}m)`,
    });
  }
  if (bestMode === "ferry") {
    const ferryEst = getFerryTransportEstimate(
      dest,
      context.homeStationCoords || undefined,
      context.ferryTemporal,
    );
    if (ferryEst) {
      const operator = ferryEst.details?.operator ?? "passenger ferry";
      reasons.push({
        type: "Transport",
        code: "transportFerry",
        params: { operator },
        title: "Scenic Ferry Route",
        description: `Accessible by ferry (${operator})`,
      });
    }
  }

  // 2. Trip Type Explainability
  const ratings = dest.ratings || {
    food: 5,
    photography: 5,
    summer: 5,
    winter: 5,
    overall: 5,
  };
  // Rating-derived claims ("Top-tier Food Scene", "Highly rated for rainy-day
  // visits", "Highly recommended by other travelers") must not fire on
  // unverified/template rating data — only high/medium-confidence metadata is
  // presentation-worthy evidence (REC-002, legacy rating vector trust).
  const ratingsTrusted = isRatingVerified(dest);
  const cats = dest.categories || [];
  const tags = dest.tags || [];

  switch (vibe) {
    case "food":
      if (ratingsTrusted && ratings.food >= 8.5) {
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
      if (ratingsTrusted && ratings.summer >= 8.5) {
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
    if (indoor >= 70 || (ratingsTrusted && ratings.rain >= 8.5)) {
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
  if (isHot && ratingsTrusted && ratings.summer >= 8.5) {
    matchedPreferences.push("weather");
    reasons.push({
      type: "Weather",
      code: "weatherCoolRetreat",
      title: "Cool Mountain Air",
      description: "A cool escape from the hot city temperatures",
    });
  }
  if (isCold && ratingsTrusted && ratings.winter >= 8.5) {
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
      code:
        ratingsTrusted && ratings.overall >= 8.5
          ? "generalHighlyRated"
          : "generalSolidMatch",
      title:
        ratingsTrusted && ratings.overall >= 8.5
          ? "Highly Rated Choice"
          : "Solid Match",
      description:
        ratingsTrusted && ratings.overall >= 8.5
          ? "Highly recommended by other travelers"
          : "A solid match matching your base criteria",
    });
  }

  // REC-002: Confidence disclosure — non-alarming, editorial framing.
  // Added after primary reasons so it does not displace match explanations.
  // Fires for low-confidence AND missing rating metadata (unverified evidence).
  if (!ratingsTrusted) {
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
