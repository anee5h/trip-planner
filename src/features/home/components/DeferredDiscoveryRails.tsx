import { useEffect, useMemo, useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";
import type { BudgetTier } from "@/shared/types/planner";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import {
  isOvernightDuration,
  type TripDuration,
} from "@/shared/types/tripDuration";
import type { Season } from "@/shared/utils/season";
import DiscoveryRail from "./DiscoveryRail";
import UnexploredNearbyRail from "./UnexploredNearbyRail";
import {
  getSeasonalDiscoveryDestinations,
  getUnder60Destinations,
  getUnexploredNearbyDestinations,
  getOvernightGetawayDestinations,
  getWorthLongerJourneyDestinations,
  softDeduplicateRail,
  type OriginRailContext,
} from "../services/HomeRailService";

export interface HomeDiscoveryRails {
  seasonal: Destination[];
  under60: Destination[];
  nearby: Destination[];
  overnightGetaways: Destination[];
  longerJourney: Destination[];
}

export type HomeDiscoveryRailKey = keyof HomeDiscoveryRails;

export interface HomeDiscoveryRailStage {
  key: HomeDiscoveryRailKey;
  destinations: Destination[];
}

interface BuildHomeDiscoveryRailsInput {
  recommendedDestinations: Destination[];
  allDestinations: Destination[];
  topMatchIds: readonly string[];
  recentlyViewedDestinations: readonly Destination[];
  bucketListDisplayedIds: readonly string[];
  homeStationCoords: { lat: number; lng: number } | null;
  homeStationTransportZoneId?: TransportZoneId;
  carMode: string;
  publicModes: string[];
  budgetTier?: BudgetTier;
  ferryTemporal?: FerryTemporalContext;
  visitedIds: readonly string[];
  tripDuration: TripDuration;
  seasonalReferenceDate: Date;
}

/**
 * Creates the same ordered discovery-rail selection as Home used to perform
 * synchronously, but exposes one complete rail at a time. The picker keeps
 * shared soft-deduplication state between stages.
 */
export function createHomeDiscoveryRailStages(
  input: BuildHomeDiscoveryRailsInput,
): { next: () => HomeDiscoveryRailStage | null } {
  const {
    recommendedDestinations,
    allDestinations,
    topMatchIds,
    recentlyViewedDestinations,
    bucketListDisplayedIds,
    homeStationCoords,
    homeStationTransportZoneId,
    carMode,
    publicModes,
    budgetTier,
    ferryTemporal,
    visitedIds,
    tripDuration,
    seasonalReferenceDate,
  } = input;
  const isOvernightMode = isOvernightDuration(tripDuration);
  const originRailContext: OriginRailContext = {
    homeStationCoords,
    homeStationTransportZoneId,
    carMode,
    publicModes,
    budgetTier,
    ferryTemporal,
    visitedIds,
    tripDuration,
    estimateCache: new Map(),
  };
  const usedIds = new Set(topMatchIds);
  recentlyViewedDestinations.forEach((destination) =>
    usedIds.add(destination.id),
  );
  bucketListDisplayedIds.forEach((id) => usedIds.add(id));

  const pick = (
    candidates: Destination[],
    qualityOf?: (candidate: Destination) => number,
    duplicateQualityMargin?: number,
  ) => {
    const selected = softDeduplicateRail(
      candidates,
      usedIds,
      10,
      qualityOf,
      duplicateQualityMargin,
    );
    selected.forEach((destination) => usedIds.add(destination.id));
    return selected;
  };

  const stages: Array<{
    key: HomeDiscoveryRailKey;
    getCandidates: () => Destination[];
    qualityOf?: (candidate: Destination) => number;
    duplicateQualityMargin?: number;
  }> = isOvernightMode
    ? [
        {
          key: "overnightGetaways",
          getCandidates: () =>
            getOvernightGetawayDestinations(recommendedDestinations),
        },
        {
          key: "seasonal",
          getCandidates: () =>
            getSeasonalDiscoveryDestinations(
              recommendedDestinations,
              seasonalReferenceDate,
            ),
        },
        {
          key: "longerJourney",
          getCandidates: () =>
            getWorthLongerJourneyDestinations(recommendedDestinations),
        },
      ]
    : [
        {
          key: "seasonal",
          getCandidates: () =>
            getSeasonalDiscoveryDestinations(
              recommendedDestinations,
              seasonalReferenceDate,
            ),
        },
        {
          key: "under60",
          getCandidates: () =>
            getUnder60Destinations(recommendedDestinations, originRailContext),
        },
        {
          key: "nearby",
          getCandidates: () =>
            getUnexploredNearbyDestinations(allDestinations, originRailContext),
          qualityOf: (destination) =>
            homeStationCoords && destination.coordinates
              ? -getDistance(
                  homeStationCoords.lat,
                  homeStationCoords.lng,
                  destination.coordinates.lat,
                  destination.coordinates.lng,
                )
              : Number.NEGATIVE_INFINITY,
          duplicateQualityMargin: 0,
        },
      ];
  let stageIndex = 0;

  return {
    next: () => {
      const stage = stages[stageIndex++];
      if (!stage) return null;
      return {
        key: stage.key,
        destinations: pick(
          stage.getCandidates(),
          stage.qualityOf,
          stage.duplicateQualityMargin,
        ),
      };
    },
  };
}

/**
 * Synchronous reference implementation used by correctness tests and any
 * non-React callers. It consumes the same staged picker without changing the
 * selected destinations or their order.
 */
export function buildHomeDiscoveryRails(
  input: BuildHomeDiscoveryRailsInput,
): HomeDiscoveryRails {
  const stages = createHomeDiscoveryRailStages(input);
  const result: HomeDiscoveryRails = {
    seasonal: [],
    under60: [],
    nearby: [],
    overnightGetaways: [],
    longerJourney: [],
  };
  let stage: HomeDiscoveryRailStage | null;
  while ((stage = stages.next())) result[stage.key] = stage.destinations;
  return result;
}

interface DeferredDiscoveryRailsProps extends BuildHomeDiscoveryRailsInput {
  currentSeason: Season;
  partySize: number;
  travelDate?: string;
  isVisited: (destinationId: string) => boolean;
}

const EMPTY_DISCOVERY_RAILS: HomeDiscoveryRails = {
  seasonal: [],
  under60: [],
  nearby: [],
  overnightGetaways: [],
  longerJourney: [],
};

export default function DeferredDiscoveryRails({
  recommendedDestinations,
  allDestinations,
  topMatchIds,
  recentlyViewedDestinations,
  bucketListDisplayedIds,
  homeStationCoords,
  homeStationTransportZoneId,
  carMode,
  publicModes,
  budgetTier,
  ferryTemporal,
  visitedIds,
  tripDuration,
  seasonalReferenceDate,
  currentSeason,
  partySize,
  travelDate,
  isVisited,
}: DeferredDiscoveryRailsProps) {
  const isOvernightMode = isOvernightDuration(tripDuration);
  const stages = useMemo(
    () =>
      createHomeDiscoveryRailStages({
        recommendedDestinations,
        allDestinations,
        topMatchIds,
        recentlyViewedDestinations,
        bucketListDisplayedIds,
        homeStationCoords,
        homeStationTransportZoneId,
        carMode,
        publicModes,
        budgetTier,
        ferryTemporal,
        visitedIds,
        tripDuration,
        seasonalReferenceDate,
      }),
    [
      recommendedDestinations,
      allDestinations,
      topMatchIds,
      recentlyViewedDestinations,
      bucketListDisplayedIds,
      homeStationCoords,
      homeStationTransportZoneId,
      carMode,
      publicModes,
      budgetTier,
      ferryTemporal,
      visitedIds,
      tripDuration,
      seasonalReferenceDate,
    ],
  );
  const [discoveryRails, setDiscoveryRails] = useState<HomeDiscoveryRails>(
    EMPTY_DISCOVERY_RAILS,
  );

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let fallbackTimer = 0;
    setDiscoveryRails(EMPTY_DISCOVERY_RAILS);

    const scheduleNext = () => {
      frame = requestAnimationFrame(advance);
      // Keep the progressive queue moving in throttled/background tabs where
      // rAF may be suspended. Normal foreground tabs cancel this timer.
      fallbackTimer = window.setTimeout(advance, 50);
    };
    const advance = () => {
      if (cancelled) return;
      cancelAnimationFrame(frame);
      window.clearTimeout(fallbackTimer);
      const stage = stages.next();
      if (!stage) return;
      setDiscoveryRails((current) => ({
        ...current,
        [stage.key]: stage.destinations,
      }));
      scheduleNext();
    };

    scheduleNext();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(fallbackTimer);
    };
  }, [stages]);

  return isOvernightMode ? (
    <>
      <DiscoveryRail
        kind="overnightGetaways"
        destinations={discoveryRails.overnightGetaways}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
        travelDate={travelDate}
        duration={tripDuration}
      />
      <DiscoveryRail
        kind="seasonal"
        season={currentSeason}
        destinations={discoveryRails.seasonal}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
        travelDate={travelDate}
        duration={tripDuration}
      />
      <DiscoveryRail
        kind="longerJourney"
        destinations={discoveryRails.longerJourney}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
        travelDate={travelDate}
        duration={tripDuration}
      />
    </>
  ) : (
    <>
      <DiscoveryRail
        kind="seasonal"
        season={currentSeason}
        destinations={discoveryRails.seasonal}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
        travelDate={travelDate}
        duration={tripDuration}
      />
      <DiscoveryRail
        kind="under60"
        destinations={discoveryRails.under60}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
        travelDate={travelDate}
        duration={tripDuration}
      />
      <UnexploredNearbyRail
        destinations={allDestinations}
        precomputedDestinations={discoveryRails.nearby}
        homeStationCoords={homeStationCoords}
        homeStationTransportZoneId={homeStationTransportZoneId}
        isVisited={isVisited}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
        travelDate={travelDate}
        duration={tripDuration}
      />
    </>
  );
}
