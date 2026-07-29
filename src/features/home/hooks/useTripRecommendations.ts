import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import type { WeatherTab } from "@/shared/services/weather/WeatherTabService";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import {
  normalizeWeatherDescription,
  type PreferredWeather,
} from "@/shared/services/recommendation/RecommendationContext";

interface UseTripRecommendationsProps {
  allDestinations: Destination[];
  currentTab: WeatherTab | undefined;
  weatherContextMap:
    | Map<string, { desc: string; icon: string; temperatureC?: number }>
    | undefined;
  tripType: string;
  budget: number;
  carMode: string;
  publicModes: string[];
  partySize: number;
  weather: string;
  tripDuration: TripDuration;
  homeStationCoords: { lat: number; lng: number } | null;
  isVisited: (id: string) => boolean;
}

export function useTripRecommendations({
  allDestinations,
  currentTab,
  weatherContextMap,
  tripType,
  budget,
  carMode,
  publicModes,
  partySize,
  weather,
  tripDuration,
  homeStationCoords,
  isVisited,
}: UseTripRecommendationsProps) {
  const { destinationRatings } = useTripStore();
  const visitedIds = useMemo(
    () =>
      allDestinations
        .filter((destination) => isVisited(destination.id))
        .map((destination) => destination.id),
    [allDestinations, isVisited],
  );

  const recommendedDestinations = useMemo(() => {
    let actual:
      | {
          condition: ReturnType<typeof normalizeWeatherDescription>;
          temperatureC?: number;
        }
      | undefined;
    if (currentTab && weatherContextMap) {
      const dayData = weatherContextMap.get(currentTab.dates[0]);
      if (dayData) {
        actual = {
          condition: normalizeWeatherDescription(dayData.desc),
          temperatureC: dayData.temperatureC,
        };
      }
    }

    return getRecommendations(allDestinations, {
      tripType,
      budget,
      carMode,
      publicModes,
      partySize,
      weather: {
        actual,
        preferred: (weather === "summer"
          ? "hot"
          : weather === "winter"
            ? "cold"
            : weather) as PreferredWeather,
      },
      visitedIds,
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      userRatings: destinationRatings,
      tripDuration,
    });
  }, [
    allDestinations,
    currentTab,
    weatherContextMap,
    tripType,
    budget,
    carMode,
    publicModes,
    partySize,
    weather,
    tripDuration,
    homeStationCoords,
    destinationRatings,
    visitedIds,
  ]);

  const rouletteCandidates = useMemo(() => {
    return getRecommendations(allDestinations, {
      tripType: "any",
      budget: 100000,
      carMode,
      publicModes,
      partySize,
      currentWeatherCondition: "any",
      visitedIds,
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      tripDuration: "any",
    });
  }, [
    allDestinations,
    carMode,
    publicModes,
    partySize,
    homeStationCoords,
    visitedIds,
  ]);

  return {
    recommendedDestinations,
    rouletteCandidates,
  };
}
