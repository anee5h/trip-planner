import { useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import type { CarRoundTripRoute } from "@/shared/services/transport/CarRouteProvider";
import { peekCachedCarRoundTrip } from "@/shared/services/transport/CarRouteApiProvider";
import { getRoutableCarAccessAnchors } from "@/shared/services/transport/CarAccessService";
import {
  carRouteIntentCounters,
  CAR_ROUTE_ENRICHMENT_LIMIT,
} from "@/shared/services/recommendation/carRouteAcquisition";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import type { TravelDateSelection } from "@/shared/services/recommendation/TravelConditions";
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
    case "2d1n":
      return ["3d2n"];
    case "3d2n":
      return ["2d1n"];
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
  >;
  /** Explicit trip dates (Day 1 + derived dates for overnight duration). */
  travelDates?: TravelDateSelection;
  /**
   * Roulette is only needed after the modal opens. Keeping the expansion pool
   * lazy prevents the homepage discovery rails from waiting on several full
   * recommendation passes during the initial render.
   */
  rouletteEnabled?: boolean;
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
  travelDates,
  rouletteEnabled = true,
}: UseTripRecommendationsProps) {
  const { destinationRatings } = useTripStore();
  const visitedIds = useMemo(
    () =>
      allDestinations
        .filter((destination) => isVisited(destination.id))
        .map((destination) => destination.id),
    [allDestinations, isVisited],
  );

  // KAI-226: server-side car-route acquisition for car-relevant requests.
  // The shortlist is the SURFACED recommendation set (cheap static scoring
  // first, no routes), so route enrichment aligns with what the UI actually
  // shows; the synchronous first pass renders immediately and is upgraded in
  // place when routes arrive. Fail closed: acquisition errors degrade to the
  // plain no-route behaviour (canonical car facts stay unknown).
  const recommendationContextBase = useMemo(
    () => ({
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
      homeStationCoords,
      originZoneId: homeStationTransportZoneId,
      tripDuration,
      ferryTemporal,
      travelDates,
      // KAI-130: forecastMap deliberately NOT passed — the origin forecast
      // is display-only. TravelConditions evaluates explicit dates
      // deterministically via catalogue seasonal evidence, so weather
      // arrival cannot change ranking and ranking is stable across
      // renders (no ref-smuggled timing dependence).
    }),
    [
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
      travelDates,
      // KAI-130: forecastMap deliberately excluded — origin weather is
      // display-only and never contributes a destination score delta.
    ],
  );

  // Static (route-free) scoring of the same context: the surfaced shortlist
  // for cached-route reuse on discovery (KAI-226 intent-triggered ORS).
  const baseRecommendations = useMemo(
    () => getRecommendations(allDestinations, recommendationContextBase),
    [allDestinations, recommendationContextBase],
  );

  // KAI-226 intent-triggered ORS: discovery never calls the provider. The
  // hook only PEEKS the shared provider cache (populated by detail/hub
  // intent refinements) so already-verified routes may upgrade display
  // without any network request. Deterministic bounded estimates cover
  // everything else.
  const carRelevant =
    carMode !== undefined && carMode !== "none" && Boolean(homeStationCoords);
  const cachedCarRoutes = useMemo(() => {
    if (!carRelevant || !homeStationCoords) return undefined;
    const shortlist = baseRecommendations
      .slice(0, CAR_ROUTE_ENRICHMENT_LIMIT)
      .map((recommendation) => recommendation.id)
      .map((id) => allDestinations.find((destination) => destination.id === id))
      .filter(
        (destination): destination is Destination => destination !== undefined,
      );
    if (shortlist.length === 0) return undefined;
    const found: Record<string, CarRoundTripRoute> = {};
    for (const destination of shortlist) {
      const pair = peekCachedCarRoundTrip(
        destination,
        homeStationCoords,
        getRoutableCarAccessAnchors(destination).map((anchor) => anchor.id),
      );
      if (pair) {
        found[destination.id] = pair as CarRoundTripRoute;
        carRouteIntentCounters.cache_hit += 1;
      }
    }
    carRouteIntentCounters.discovery_estimate +=
      shortlist.length - Object.keys(found).length;
    return Object.keys(found).length > 0 ? found : undefined;
  }, [baseRecommendations, allDestinations, carRelevant, homeStationCoords]);

  const carRoutes = cachedCarRoutes;

  const recommendationContext = useMemo(
    () =>
      carRoutes
        ? { ...recommendationContextBase, carRoutes }
        : recommendationContextBase,
    [recommendationContextBase, carRoutes],
  );

  const recommendedDestinations = useMemo(() => {
    // Route-free and initial state share the same static result; the second
    // pass (with carRoutes) is only computed after server acquisition lands.
    return carRoutes
      ? getRecommendations(allDestinations, recommendationContext)
      : baseRecommendations;
  }, [allDestinations, recommendationContext, carRoutes, baseRecommendations]);

  const roulette = useMemo(() => {
    if (!rouletteEnabled) {
      return {
        candidates: [] as Destination[],
        expansion: "exact" as const,
      };
    }

    const constraints = rouletteConstraints ?? {
      budget,
      carMode,
      publicModes,
      partySize,
      budgetTier,
      tripDuration,
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
            homeStationCoords,
            originZoneId: homeStationTransportZoneId,
            userRatings: destinationRatings,
            tripDuration: duration,
            ferryTemporal,
            travelDates,
            // KAI-226: share the same server-acquired canonical routes.
            carRoutes,
          }),
        ),
      );

    const durations = [
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
    visitedIds,
    travelDates,
    preferredWeather,
    rouletteEnabled,
  ]);

  return {
    recommendedDestinations,
    rouletteCandidates: roulette.candidates,
    rouletteExpansion: roulette.expansion as RouletteExpansion,
  };
}
