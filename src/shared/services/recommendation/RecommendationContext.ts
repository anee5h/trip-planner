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
}
