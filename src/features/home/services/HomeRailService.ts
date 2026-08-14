import type { Destination } from "@/shared/types/destination";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  WEEKEND_TRAVEL_POLICY,
  type WeekendTravelBand,
} from "@/shared/services/recommendation/WeekendPolicy";
import type {
  TripDuration,
  TripMode,
} from "@/shared/services/recommendation/RecommendationContext";
import type { BudgetTier } from "@/shared/types/planner";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import {
  getJapanDateParts,
  getFixedSeason,
  type Season,
} from "@/shared/utils/season";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";

export const MAX_HOME_RAIL_CARDS = 10;
export const MAX_NEARBY_TRAVEL_MINUTES = 180;
export const DUPLICATE_QUALITY_MARGIN = 5;

export const DAY_TRIP_RAILS = [
  "topMatches",
  "bucketList",
  "seasonal",
  "under60",
  "nearby",
] as const;

export const WEEKEND_RAILS = [
  "topMatches",
  "bucketList",
  "weekendGetaways",
  "seasonal",
  "longerJourney",
] as const;

export type HomepageRailType =
  (typeof DAY_TRIP_RAILS)[number] | (typeof WEEKEND_RAILS)[number];

export function getHomepageRailConfig(
  tripMode: TripMode,
  _tripDuration?: TripDuration,
): readonly HomepageRailType[] {
  return tripMode === "weekend_2d1n" ? WEEKEND_RAILS : DAY_TRIP_RAILS;
}

interface RankedDestination extends Destination {
  score?: number;
}

function scoreOf(destination: RankedDestination): number {
  return typeof destination.score === "number" &&
    Number.isFinite(destination.score)
    ? destination.score
    : 0;
}

function limit<T>(destinations: readonly T[], count?: number): T[] {
  if (count === undefined) return [...destinations];
  return destinations.slice(0, Math.min(MAX_HOME_RAIL_CARDS, count));
}

function seasonalScore(
  destination: RankedDestination,
  season: Season,
  month: number,
): number | undefined {
  const seasonMetadata = (
    destination as Destination & { seasonMetadata?: { method?: string } }
  ).seasonMetadata;
  if (seasonMetadata?.method === "unknown") return undefined;

  const rating = destination.season?.[season];
  const inBestMonths = destination.bestMonths?.includes(month) ?? false;
  const seasonalRecord = destination as RankedDestination & {
    bestSeasons?: readonly string[];
  };
  const explicitSeasonNames = [
    seasonalRecord.bestSeason,
    ...(seasonalRecord.bestSeasons ?? []),
  ];
  const matchesBestSeason = explicitSeasonNames.some((value) =>
    value?.toLowerCase().includes(season),
  );
  const hasMeaningfulRating =
    typeof rating === "number" && Number.isFinite(rating) && rating > 5;
  const hasEvidence = hasMeaningfulRating || inBestMonths || matchesBestSeason;
  if (!hasEvidence) return undefined;

  const normalizedRating = rating ?? 5;
  const score =
    normalizedRating * 10 +
    (inBestMonths ? 12 : 0) +
    (matchesBestSeason ? 5 : 0) +
    (normalizedRating >= 8 ? 3 : 0);

  // Neutral ratings and year-round labels are not seasonal evidence on their
  // own. A current best month or explicit current-season label is sufficient.
  if (score < 55) return undefined;
  return score;
}

export function getSeasonalDiscoveryDestinations(
  candidates: readonly RankedDestination[],
  referenceDate: Date | string = new Date(),
  count?: number,
): RankedDestination[] {
  const { month } = getJapanDateParts(referenceDate);
  const season = getFixedSeason(referenceDate);
  return limit(
    candidates
      .map((destination) => ({
        destination,
        seasonalScore: seasonalScore(destination, season, month),
      }))
      .filter(
        (
          item,
        ): item is {
          destination: RankedDestination;
          seasonalScore: number;
        } => item.seasonalScore !== undefined,
      )
      .sort(
        (a, b) =>
          b.seasonalScore - a.seasonalScore ||
          scoreOf(b.destination) - scoreOf(a.destination) ||
          a.destination.id.localeCompare(b.destination.id),
      )
      .map(({ destination }) => destination),
    count,
  );
}

export interface OriginRailContext {
  homeStationCoords: { lat: number; lng: number } | null;
  homeStationTransportZoneId?: TransportZoneId;
  carMode: string;
  publicModes: string[];
  budgetTier?: BudgetTier;
  ferryTemporal?: FerryTemporalContext;
  visitedIds?: readonly string[];
  tripMode: TripMode;
}

function originEstimate(destination: Destination, context: OriginRailContext) {
  if (!context.homeStationCoords || context.tripMode !== "day_trip") {
    return null;
  }
  const modes = getValidModes(
    destination,
    context.carMode,
    context.publicModes,
    context.homeStationCoords,
    context.budgetTier,
    context.homeStationTransportZoneId,
    context.ferryTemporal,
  );
  if (modes.length === 0) return null;
  const estimate = getOriginAwareTransportEstimate(
    destination,
    {
      homeStationCoords: context.homeStationCoords,
      originZoneId: context.homeStationTransportZoneId,
      ferryTemporal: context.ferryTemporal,
    },
    modes,
  );
  if (
    !estimate ||
    (estimate.evidence !== "verified" && estimate.evidence !== "estimated") ||
    !estimate.timeRange.every(Number.isFinite) ||
    estimate.timeRange[0] < 0 ||
    estimate.timeRange[1] < estimate.timeRange[0]
  ) {
    return null;
  }
  return estimate;
}

function sortOriginCandidates(
  candidates: readonly RankedDestination[],
  context: OriginRailContext,
  predicate: (maxMinutes: number) => boolean,
): RankedDestination[] {
  const visited = new Set(context.visitedIds ?? []);
  return candidates
    .map((destination) => ({
      destination,
      estimate: originEstimate(destination, context),
    }))
    .filter(
      (item) =>
        !visited.has(item.destination.id) &&
        item.estimate !== null &&
        predicate(item.estimate.timeRange[1]),
    )
    .sort(
      (a, b) =>
        a.estimate!.timeRange[1] - b.estimate!.timeRange[1] ||
        scoreOf(b.destination) - scoreOf(a.destination) ||
        a.destination.id.localeCompare(b.destination.id),
    )
    .map(({ destination }) => destination);
}

export function getUnder60Destinations(
  candidates: readonly RankedDestination[],
  context: OriginRailContext,
  count?: number,
): RankedDestination[] {
  if (context.tripMode !== "day_trip") return [];
  return limit(
    sortOriginCandidates(candidates, context, (maxMinutes) => maxMinutes <= 60),
    count,
  );
}

export function getUnexploredNearbyDestinations(
  candidates: readonly RankedDestination[],
  context: OriginRailContext,
  count?: number,
): RankedDestination[] {
  if (context.tripMode !== "day_trip") return [];
  return limit(
    sortOriginCandidates(
      candidates,
      context,
      (maxMinutes) => maxMinutes <= MAX_NEARBY_TRAVEL_MINUTES,
    ),
    count,
  );
}

const WEEKEND_BAND_ORDER: readonly WeekendTravelBand[] = [
  "strong",
  "normal",
  "acceptable",
  "nearby",
  "weak",
  "local",
];

const CORE_WEEKEND_GETAWAY_BANDS = new Set<WeekendTravelBand>([
  "strong",
  "normal",
  "acceptable",
]);

function weekendRank(destination: RankedDestination): number {
  const band = (destination as ScoredDestination).weekend?.travelFit.band;
  const index = band ? WEEKEND_BAND_ORDER.indexOf(band) : -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function isWeekendCandidate(destination: RankedDestination): boolean {
  const weekend = (destination as ScoredDestination).weekend;
  return Boolean(weekend?.travelFit.eligible && weekend.capacity.eligible);
}

function isCoreWeekendGetawayCandidate(
  destination: RankedDestination,
): boolean {
  const weekend = (destination as ScoredDestination).weekend;
  return Boolean(
    isWeekendCandidate(destination) &&
    weekend &&
    CORE_WEEKEND_GETAWAY_BANDS.has(weekend.travelFit.band),
  );
}

export function getWeekendGetawayDestinations(
  candidates: readonly RankedDestination[],
  count?: number,
): RankedDestination[] {
  return limit(
    candidates
      .filter(isCoreWeekendGetawayCandidate)
      .sort(
        (a, b) =>
          weekendRank(a) - weekendRank(b) ||
          scoreOf(b) - scoreOf(a) ||
          a.id.localeCompare(b.id),
      ),
    count,
  );
}

export function getWorthLongerJourneyDestinations(
  candidates: readonly RankedDestination[],
  count?: number,
): RankedDestination[] {
  return limit(
    candidates
      .filter((destination) => {
        const weekend = (destination as ScoredDestination).weekend;
        const minutes = weekend?.travelFit.oneWayMinutes;
        return Boolean(
          isWeekendCandidate(destination) &&
          minutes !== undefined &&
          minutes > WEEKEND_TRAVEL_POLICY.STRONG_MAX_MINUTES,
        );
      })
      .sort(
        (a, b) =>
          scoreOf(b) - scoreOf(a) ||
          weekendRank(a) - weekendRank(b) ||
          ((a as ScoredDestination).weekend?.travelFit.oneWayMinutes ?? 0) -
            ((b as ScoredDestination).weekend?.travelFit.oneWayMinutes ?? 0) ||
          a.id.localeCompare(b.id),
      ),
    count,
  );
}

export function softDeduplicateRail<T extends RankedDestination>(
  candidates: readonly T[],
  usedIds: ReadonlySet<string>,
  count = MAX_HOME_RAIL_CARDS,
): T[] {
  const unused = candidates.filter((candidate) => !usedIds.has(candidate.id));
  const used = candidates.filter((candidate) => usedIds.has(candidate.id));
  const selected: T[] = [];

  while (selected.length < Math.min(MAX_HOME_RAIL_CARDS, count)) {
    const nextUnused = unused[0];
    const nextUsed = used[0];
    if (!nextUnused && !nextUsed) break;
    if (
      nextUnused &&
      (!nextUsed ||
        scoreOf(nextUnused) + DUPLICATE_QUALITY_MARGIN >= scoreOf(nextUsed))
    ) {
      selected.push(unused.shift()!);
    } else {
      selected.push(used.shift()!);
    }
  }
  return selected;
}
