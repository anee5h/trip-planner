import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import { normalizeWeatherDescription } from "@/shared/services/recommendation/RecommendationContext";
import type { DiningStyle } from "@/shared/types/planner";

interface UseTripRecommendationsProps {
  allDestinations: Destination[];
  actualWeather?: { desc: string; temperatureC: number };
  vibe: string;
  budget: number;
  carMode: string;
  publicModes: string[];
  partySize: number;
  diningStyle: DiningStyle;
  tripDuration: TripDuration;
  homeStationCoords: { lat: number; lng: number } | null;
  isVisited: (id: string) => boolean;
}

export function useTripRecommendations({
  allDestinations,
  actualWeather,
  vibe,
  budget,
  carMode,
  publicModes,
  partySize,
  diningStyle,
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
      vibe,
      budget,
      carMode,
      publicModes,
      partySize,
      diningStyle,
      weather: {
        actual: actualWeather
          ? {
              condition: normalizeWeatherDescription(actualWeather.desc),
              temperatureC: actualWeather.temperatureC,
            }
          : undefined,
      },
      visitedIds,
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      userRatings: destinationRatings,
      tripDuration,
    });
  }, [
    allDestinations,
    actualWeather,
    vibe,
    budget,
    carMode,
    publicModes,
    partySize,
    diningStyle,
    tripDuration,
    homeStationCoords,
    destinationRatings,
    visitedIds,
  ]);

  const rouletteCandidates = useMemo(() => {
    return getRecommendations(allDestinations, {
      vibe: "any",
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
