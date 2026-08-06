import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type {
  TripDuration,
  TripMode,
} from "@/shared/services/recommendation/RecommendationContext";
import type { TravelDateSelection } from "@/shared/services/recommendation/TravelConditions";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";
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
  /**
   * User preference for weather-appropriate picks; never live weather.
   * The live origin forecast is display-only and must not reach the
   * recommendation context.
   */
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
  /** Explicit trip dates (Day 1 + derived Day 2 for 2D1N). */
  travelDates?: TravelDateSelection;
  /** Live forecast map for the planned origin. */
  forecastMap?: ReadonlyMap<string, DayForecastData>;
  tripMode: TripMode;
  accommodationAllowance: number;
}

export function useTripRecommendations({
  allDestinations,
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
  travelDates,
  forecastMap,
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
      // Destination weather only — never the live origin forecast. Until
      // destination-coordinate forecasts exist this carries just the user's
      // weather preference, so origin conditions cannot score destinations.
      destinationWeather: { preferred: preferredWeather },
      visitedIds,
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      originZoneId: homeStationTransportZoneId,
      tripDuration,
      ferryTemporal,
      tripMode,
      accommodationAllowance,
      travelDates,
      forecastMap,
    });
  }, [
    allDestinations,
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
    travelDates,
    forecastMap,
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
            // Roulette shares the same forecast-neutral pool: origin
            // weather never affects candidate selection or ranking.
            destinationWeather: { preferred: preferredWeather },
            visitedIds,
            homeStationCoords: homeStationCoords || {
              lat: 35.6812,
              lng: 139.7671,
            },
            originZoneId: homeStationTransportZoneId,
            userRatings: destinationRatings,
            tripDuration: duration,
            ferryTemporal,
            travelDates,
            forecastMap,
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
    travelDates,
    forecastMap,
    preferredWeather,
  ]);

  return {
    recommendedDestinations,
    rouletteCandidates: roulette.candidates,
    rouletteExpansion: roulette.expansion as RouletteExpansion,
  };
}
