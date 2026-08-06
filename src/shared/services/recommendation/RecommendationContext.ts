import type {
  ImplicitUserProfile,
  PersonalizationSettings,
} from "./PersonalizationService";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";
import type { TravelDateSelection } from "./TravelConditions";

export type TripDuration =
  "any" | "shortOuting" | "halfDay" | "fullDay" | "weekend";

export type TripMode = "day_trip" | "weekend_2d1n";
export type ActualWeatherCondition =
  "clear" | "cloudy" | "rainy" | "stormy" | "snowy" | "unknown";
export interface RecommendationWeatherDay {
  /** YYYY-MM-DD local calendar date */
  date: string;
  condition: ActualWeatherCondition;
  temperatureC?: number;
}

export interface RecommendationWeatherContext {
  /**
   * DESTINATION-specific weather only. Never origin weather: the live
   * forecast is fetched for the selected origin and is display-only
   * calendar context until destination-coordinate forecasting exists.
   */
  actual?: {
    condition: ActualWeatherCondition;
    temperatureC?: number;
  };
  /** DESTINATION-specific per-day weather (e.g. a 2D1N trip at the place). */
  days?: RecommendationWeatherDay[];
  /** User preference, not weather data. */
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
  /**
   * DESTINATION weather context (actual conditions and per-day forecast at
   * the destination). The live forecast fetched for the home origin is
   * NEVER placed here: it is calendar display context only and must not
   * reach destination scoring until destination-coordinate forecasting
   * exists.
   */
  destinationWeather?: RecommendationWeatherContext;
  /** @deprecated Use destinationWeather.actual.condition. */
  currentWeatherCondition?: string;
  visitedIds: string[];
  /** @deprecated Use destinationWeather.actual. */
  currentWeather?: { temp: number; desc: string } | null;
  homeStationCoords?: { lat: number; lng: number } | null;
  originZoneId?: TransportZoneId;
  /** Planned trip date/season for ferry availability; never the clock. */
  ferryTemporal?: FerryTemporalContext;
  /**
   * Explicit trip dates (Day 1, plus derived Day 2 for 2D1N). When set, the
   * pipeline evaluates forecast/seasonal travel conditions per destination.
   * Omitted means no explicit date: neutral, any-date behaviour.
   */
  travelDates?: TravelDateSelection;
  /** Live forecast map (YYYY-MM-DD → forecast) for the planned origin. */
  forecastMap?: ReadonlyMap<string, DayForecastData>;
  userRatings?: Record<string, "up" | "down">;
  tripDuration?: TripDuration;
  availableTimeHours?: number;
  userProfile?: ImplicitUserProfile;
  personalizationSettings?: PersonalizationSettings;
  tripMode?: TripMode;
  accommodationAllowance?: number;
}

export interface TripDurationContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  availableTimeHours?: number;
  ferryTemporal?: FerryTemporalContext;
}

export function resolveRecommendationWeather(context: RecommendationContext) {
  const condition =
    context.destinationWeather?.actual?.condition ??
    normalizeWeatherDescription(
      context.currentWeather?.desc ?? context.currentWeatherCondition ?? "",
    );
  const temperatureC =
    context.destinationWeather?.actual?.temperatureC ??
    context.currentWeather?.temp;

  return {
    actual:
      condition === "unknown" && temperatureC === undefined
        ? undefined
        : { condition, temperatureC },
    preferred: context.destinationWeather?.preferred ?? "any",
  } as const;
}
