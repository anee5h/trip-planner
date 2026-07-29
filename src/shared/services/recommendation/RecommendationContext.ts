export type TripDuration = "any" | "halfDay" | "dayTrip" | "weekend";

export function matchesTripDuration(
  totalTripHours: number,
  tripDuration: TripDuration = "any",
): boolean {
  if (tripDuration === "any") return true;
  if (tripDuration === "halfDay") return totalTripHours <= 4;
  if (tripDuration === "dayTrip")
    return totalTripHours > 4 && totalTripHours <= 12;
  return totalTripHours > 12;
}

export interface RecommendationContext {
  tripType: string;
  budget: number;
  carMode: string;
  publicModes: string[];
  partySize: number;
  currentWeatherCondition: string;
  visitedIds: string[];
  currentWeather?: { temp: number; desc: string } | null;
  homeStationCoords?: { lat: number; lng: number } | null;
  userRatings?: Record<string, "up" | "down">;
  tripDuration?: TripDuration;
}
