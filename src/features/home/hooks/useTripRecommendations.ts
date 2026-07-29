import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import type { WeatherTab } from "@/shared/services/weather/WeatherTabService";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";

interface UseTripRecommendationsProps {
  allDestinations: Destination[];
  currentTab: WeatherTab | undefined;
  weatherContextMap: Map<string, { desc: string; icon: string }> | undefined;
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

  const recommendedDestinations = useMemo(() => {
    let activeWeatherStr = weather;
    if (currentTab && weatherContextMap) {
      const dayData = weatherContextMap.get(currentTab.dates[0]);
      if (dayData) {
        activeWeatherStr = dayData.desc;
      }
    }

    return getRecommendations(allDestinations, {
      tripType,
      budget,
      carMode,
      publicModes,
      partySize,
      currentWeatherCondition: activeWeatherStr,
      visitedIds: [],
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
  ]);

  const rouletteCandidates = useMemo(() => {
    return getRecommendations(allDestinations, {
      tripType: "any",
      budget: 100000,
      carMode,
      publicModes,
      partySize,
      currentWeatherCondition: "any",
      visitedIds: allDestinations
        .filter((d) => isVisited(d.id))
        .map((d) => d.id),
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      tripDuration: "any",
    });
  }, [
    allDestinations,
    carMode,
    publicModes,
    partySize,
    homeStationCoords,
    isVisited,
  ]);

  return {
    recommendedDestinations,
    rouletteCandidates,
  };
}
