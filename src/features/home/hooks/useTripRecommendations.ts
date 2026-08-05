import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type {
  TripDuration,
  TripMode,
  RecommendationWeatherDay,
} from "@/shared/services/recommendation/RecommendationContext";
import { normalizeWeatherDescription } from "@/shared/services/recommendation/RecommendationContext";
import type { BudgetTier } from "@/shared/types/planner";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "@/shared/services/transport/types";

export type RouletteExpansion = "exact" | "duration" | "budget";

const MAX_ROULETTE_CANDIDATES = 20;
const MIN_EXACT_ROULETTE_CANDIDATES = 8;
const TARGET_ROULETTE_CANDIDATES = 10;

function adjacentDurations(duration: TripDuration): TripDuration[] {
  switch (duration) {
    case "shortOuting":
      return ["halfDay"];
    case "halfDay":
      return ["shortOuting", "fullDay"];
    case "fullDay":
      return ["halfDay"];
    case "weekend":
      return ["fullDay"];
    default:
      return [];
  }
}

function uniqueCandidates(candidates: Destination[]): Destination[] {
  return Array.from(
    new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
  );
}

interface UseTripRecommendationsProps {
  allDestinations: Destination[];
  actualWeather?: { desc: string; temperatureC: number };
  preferredWeather?: "any" | "rainy" | "hot" | "cold";
  vibe: string;
  budget: number;
  carMode: string;
  publicModes: string[];
  partySize: number;
  budgetTier: BudgetTier;
  tripDuration: TripDuration;
  homeStationCoords: { lat: number; lng: number } | null;
  homeStationTransportZoneId?: TransportZoneId;
  /** Planned trip date/season for ferry availability. */
  ferryTemporal?: FerryTemporalContext;
  isVisited: (id: string) => boolean;
  rouletteConstraints?: Pick<
    UseTripRecommendationsProps,
    | "budget"
    | "carMode"
    | "publicModes"
    | "partySize"
    | "budgetTier"
    | "tripDuration"
    | "tripMode"
    | "accommodationAllowance"
  >;
  weatherDays?: RecommendationWeatherDay[];
  tripMode: TripMode;
  accommodationAllowance: number;
}

export function useTripRecommendations({
  allDestinations,
  actualWeather,
  preferredWeather = "any",
  vibe,
  budget,
  carMode,
  publicModes,
  partySize,
  budgetTier,
  tripDuration,
  homeStationCoords,
  homeStationTransportZoneId,
  ferryTemporal,
  isVisited,
  rouletteConstraints,
  tripMode,
  accommodationAllowance,
  weatherDays,
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
      budgetTier,
      weather: {
        actual: actualWeather
          ? {
              condition: normalizeWeatherDescription(actualWeather.desc),
              temperatureC: actualWeather.temperatureC,
            }
          : undefined,
        preferred: preferredWeather,
        days: tripMode === "weekend_2d1n" ? weatherDays : undefined,
      },
      visitedIds,
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      originZoneId: homeStationTransportZoneId,
      tripDuration,
      ferryTemporal,
      tripMode,
      accommodationAllowance,
    });
  }, [
    allDestinations,
    actualWeather,
    preferredWeather,
    vibe,
    budget,
    carMode,
    publicModes,
    partySize,
    budgetTier,
    tripDuration,
    homeStationCoords,
    homeStationTransportZoneId,
    ferryTemporal,
    destinationRatings,
    visitedIds,
    tripMode,
    accommodationAllowance,
    weatherDays,
  ]);

  const roulette = useMemo(() => {
    const constraints = rouletteConstraints ?? {
      budget,
      carMode,
      publicModes,
      partySize,
      budgetTier,
      tripDuration,
      tripMode,
      accommodationAllowance,
    };
    const getPool = (budgetLimit: number, durations: TripDuration[]) =>
      uniqueCandidates(
        durations.flatMap((duration) =>
          getRecommendations(allDestinations, {
            vibe: "any",
            budget: budgetLimit,
            carMode: constraints.carMode,
            publicModes: constraints.publicModes,
            partySize: constraints.partySize,
            budgetTier: constraints.budgetTier,
            weather: {
              actual: actualWeather
                ? {
                    condition: normalizeWeatherDescription(actualWeather.desc),
                    temperatureC: actualWeather.temperatureC,
                  }
                : undefined,
              days: tripMode === "weekend_2d1n" ? weatherDays : undefined,
            },
            visitedIds,
            homeStationCoords: homeStationCoords || {
              lat: 35.6812,
              lng: 139.7671,
            },
            originZoneId: homeStationTransportZoneId,
            userRatings: destinationRatings,
            tripDuration: duration,
            ferryTemporal,
            tripMode: constraints.tripMode,
            accommodationAllowance: constraints.accommodationAllowance,
          }),
        ),
      );

    // Weekend mode: no adjacent-duration expansion
    const durations =
      constraints.tripMode === "weekend_2d1n"
        ? [constraints.tripDuration]
        : [
            constraints.tripDuration,
            ...adjacentDurations(constraints.tripDuration),
          ];

    const exact = getPool(constraints.budget, [constraints.tripDuration]);
    if (exact.length >= MIN_EXACT_ROULETTE_CANDIDATES) {
      return {
        candidates: exact.slice(0, MAX_ROULETTE_CANDIDATES),
        expansion: "exact" as const,
      };
    }

    const durationExpanded = getPool(constraints.budget, durations);
    if (durationExpanded.length >= TARGET_ROULETTE_CANDIDATES) {
      return {
        candidates: durationExpanded.slice(0, MAX_ROULETTE_CANDIDATES),
        expansion: "duration" as const,
      };
    }

    return {
      candidates: getPool(
        Math.round(constraints.budget * 1.2),
        durations,
      ).slice(0, MAX_ROULETTE_CANDIDATES),
      expansion: "budget" as const,
    };
  }, [
    allDestinations,
    actualWeather,
    budget,
    budgetTier,
    carMode,
    destinationRatings,
    ferryTemporal,
    homeStationCoords,
    homeStationTransportZoneId,
    partySize,
    publicModes,
    rouletteConstraints,
    tripDuration,
    tripMode,
    accommodationAllowance,
    visitedIds,
  ]);

  return {
    recommendedDestinations,
    rouletteCandidates: roulette.candidates,
    rouletteExpansion: roulette.expansion as RouletteExpansion,
  };
}
