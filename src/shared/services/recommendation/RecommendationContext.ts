import type {
  ImplicitUserProfile,
  PersonalizationSettings,
} from "./PersonalizationService";

export type TripDuration = "any" | "halfDay" | "dayTrip" | "weekend";

export type ActualWeatherCondition =
  "clear" | "cloudy" | "rainy" | "stormy" | "snowy" | "unknown";

export interface RecommendationWeatherContext {
  actual?: {
    condition: ActualWeatherCondition;
    temperatureC?: number;
  };
  preferred?: "any" | "rainy" | "hot" | "cold";
}

export function normalizeWeatherDescription(
  description: string,
): ActualWeatherCondition {
  const value = description.toLowerCase();
  if (value.includes("storm") || value.includes("thunder")) return "stormy";
  if (value.includes("rain") || value.includes("drizzle")) return "rainy";
  if (value.includes("snow")) return "snowy";
  if (value.includes("cloud") || value.includes("overcast")) return "cloudy";
  if (value.includes("clear") || value.includes("sun")) return "clear";
  return "unknown";
}

export function matchesTripDuration(
  totalTripHours: number,
  tripDuration: TripDuration = "any",
): boolean {
  if (tripDuration === "any") return true;
  if (tripDuration === "halfDay") return totalTripHours < 5;
  if (tripDuration === "dayTrip")
    return totalTripHours >= 5 && totalTripHours <= 12;
  return totalTripHours > 12;
}

export interface RecommendationContext {
  vibe?: string;
  /** @deprecated Use vibe. */
  tripType?: string;
  budget: number;
  budgetTier?: import("@/shared/types/planner").BudgetTier;
  carMode: string;
  publicModes: string[];
  partySize: number;
  weather?: RecommendationWeatherContext;
  /** @deprecated Use weather.actual.condition. */
  currentWeatherCondition?: string;
  visitedIds: string[];
  /** @deprecated Use weather.actual. */
  currentWeather?: { temp: number; desc: string } | null;
  homeStationCoords?: { lat: number; lng: number } | null;
  userRatings?: Record<string, "up" | "down">;
  tripDuration?: TripDuration;
  userProfile?: ImplicitUserProfile;
  personalizationSettings?: PersonalizationSettings;
}

export function resolveRecommendationWeather(context: RecommendationContext) {
  const condition =
    context.weather?.actual?.condition ??
    normalizeWeatherDescription(
      context.currentWeather?.desc ?? context.currentWeatherCondition ?? "",
    );
  const temperatureC =
    context.weather?.actual?.temperatureC ?? context.currentWeather?.temp;

  return {
    actual:
      condition === "unknown" && temperatureC === undefined
        ? undefined
        : { condition, temperatureC },
    preferred: context.weather?.preferred ?? "any",
  } as const;
}
