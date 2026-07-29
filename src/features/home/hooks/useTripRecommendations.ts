import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import {
  normalizeWeatherDescription,
  type PreferredWeather,
} from "@/shared/services/recommendation/RecommendationContext";

interface UseTripRecommendationsProps {
  allDestinations: Destination[];
  actualWeather?: { desc: string; temperatureC: number };
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
  actualWeather,
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
    return getRecommendations(allDestinations, {
      tripType,
      budget,
      carMode,
      publicModes,
      partySize,
      weather: {
        actual: actualWeather
          ? {
              condition: normalizeWeatherDescription(actualWeather.desc),
              temperatureC: actualWeather.temperatureC,
            }
          : undefined,
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
    actualWeather,
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
