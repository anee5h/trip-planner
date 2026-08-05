import type {
  ImplicitUserProfile,
  PersonalizationSettings,
} from "./PersonalizationService";
import type { TransportZoneId } from "@/shared/types/transportTopology";

export type TripDuration =
  "any" | "shortOuting" | "halfDay" | "fullDay" | "weekend";

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
  if (tripDuration === "shortOuting") return totalTripHours < 4;
  if (tripDuration === "halfDay")
    return totalTripHours >= 4 && totalTripHours < 7.5;
  if (tripDuration === "fullDay")
    return totalTripHours >= 7.5 && totalTripHours <= 14;
  return totalTripHours > 14;
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
  originZoneId?: TransportZoneId;
  userRatings?: Record<string, "up" | "down">;
  tripDuration?: TripDuration;
  availableTimeHours?: number;
  userProfile?: ImplicitUserProfile;
  personalizationSettings?: PersonalizationSettings;
}

export interface TripDurationContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  availableTimeHours?: number;
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
