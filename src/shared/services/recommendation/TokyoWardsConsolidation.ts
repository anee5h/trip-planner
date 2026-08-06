import type { Destination } from "@/shared/types/destination";
import type { TripMode } from "./RecommendationContext";
import type { PipelineRecommendation } from "./RecommendationTypes";
import type { OriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import { getContainedPlaces } from "./WeekendAreaPolicy";

/** Virtual result id for the Tokyo 23 Wards group card. */
export const TOKYO_WARDS_GROUP_ID = "tokyo-23-wards";

/** Kanto prefectures (lowercase). Origins inside Kanto keep wards separate. */
export const KANTO_PREFECTURES: ReadonlySet<string> = new Set([
  "tokyo",
  "kanagawa",
  "chiba",
  "saitama",
  "ibaraki",
  "tochigi",
  "gunma",
]);

/**
 * Maximum score bonus a group can gain over its highest-scoring member —
 * small and bounded: a group of 23 wards is worth at most +6, never the sum
 * of its members.
 */
export const TOKYO_WARDS_DIVERSITY_BONUS_MAX = 6;

/**
 * The 23 special-ward municipalities, derived from the catalogue's 23
 * `kind === "ward"` hubs. Membership covers every hub inside these
 * municipalities — the ward hub itself plus ward-area hubs such as
 * `tokyo-station-chiyoda` (Chiyoda) and `ueno-taito` (Taito). Other Tokyo
 * municipalities (Machida, Hachioji, …) are never members.
 */
export const TOKYO_23_WARDS_MUNICIPALITIES: ReadonlySet<string> = new Set([
  "Tokyo:adachi",
  "Tokyo:arakawa",
  "Tokyo:bunkyo",
  "Tokyo:chiyoda",
  "Tokyo:chuo",
  "Tokyo:edogawa",
  "Tokyo:itabashi",
  "Tokyo:katsushika",
  "Tokyo:kita",
  "Tokyo:koto",
  "Tokyo:meguro",
  "Tokyo:minato",
  "Tokyo:nakano",
  "Tokyo:nerima",
  "Tokyo:ota",
  "Tokyo:setagaya",
  "Tokyo:shibuya",
  "Tokyo:shinagawa",
  "Tokyo:shinjuku",
  "Tokyo:suginami",
  "Tokyo:sumida",
  "Tokyo:taito",
  "Tokyo:toshima",
]);

export function isTokyoWardHub(destination: Destination): boolean {
  return (
    destination.role === "hub" &&
    TOKYO_23_WARDS_MUNICIPALITIES.has(destination.municipalityId ?? "")
  );
}

/** Typed accessor for the virtual group marker on any destination-shaped value. */
export function getWardGroup(
  destination: Destination,
): TokyoWardsGroupMetadata | undefined {
  if (
    destination &&
    typeof destination === "object" &&
    "wardGroup" in destination
  ) {
    return (
      destination as Destination & { wardGroup?: TokyoWardsGroupMetadata }
    ).wardGroup;
  }
  return undefined;
}

export interface TokyoWardsGroupMetadata {
  memberCount: number;
  /** Unique published supporting places across all members. */
  placeCount: number;
  /** Verified origin-aware gateway estimate of the best-served member. */
  gatewayEstimate?: OriginAwareTransportEstimate;
  /** Member destination ids, for the filtered Destinations link. */
  memberIds: string[];
  tripMode?: TripMode;
}

export interface TokyoWardsConsolidationInput {
  results: PipelineRecommendation[];
  /** Lowercase origin prefecture; undefined (no origin/unresolved) skips. */
  originPrefecture?: string;
  /** Full candidate pool for unique published place counting. */
  pool: readonly Destination[];
  tripMode?: TripMode;
}

/**
 * Conditionally consolidates eligible Tokyo 23-ward hubs into one virtual
 * super-hub result:
 *
 * - activates only when the origin is outside Kanto and at least 2 eligible
 *   ward hubs remain in the results;
 * - consumes exactly one ranking position;
 * - scores as highest member + a small bounded diversity bonus (never the
 *   sum of member scores);
 * - reports member count, unique published place count, and the verified
 *   origin-aware gateway estimate (never legacy ward transport values).
 *
 * Kanto origins, unresolved origins, and neutral browsing (no origin) keep
 * every ward as an independent result.
 */
export function consolidateTokyoWards(
  input: TokyoWardsConsolidationInput,
): PipelineRecommendation[] {
  const { results, originPrefecture, pool, tripMode } = input;
  if (!originPrefecture || KANTO_PREFECTURES.has(originPrefecture)) {
    return results;
  }

  const members = results.filter((result) => isTokyoWardHub(result));
  if (members.length < 2) return results;

  const topMember = members.reduce((best, member) =>
    member.score >= best.score ? member : best,
  );
  const memberIds = members.map((member) => member.id);

  // Unique published supporting places across members (a place has a single
  // parent in the data model; dedupe defensively).
  const seenPlaceIds = new Set<string>();
  for (const member of members) {
    for (const place of getContainedPlaces(member, pool)) {
      seenPlaceIds.add(place.id);
    }
  }

  const gatewayEstimate = members.reduce<
    OriginAwareTransportEstimate | undefined
  >((fastest, member) => {
    const estimate = member.transportEstimate;
    if (!estimate) return fastest;
    if (!fastest || estimate.timeRange[0] < fastest.timeRange[0]) {
      return estimate;
    }
    return fastest;
  }, undefined);

  const groupScore =
    topMember.score +
    Math.min(TOKYO_WARDS_DIVERSITY_BONUS_MAX, members.length - 1);

  const groupResult: PipelineRecommendation = {
    ...topMember,
    id: TOKYO_WARDS_GROUP_ID,
    name: "Tokyo 23 Wards",
    score: groupScore,
    transportEstimate: gatewayEstimate,
    weekend: topMember.weekend
      ? {
          ...topMember.weekend,
          placeCount: seenPlaceIds.size,
        }
      : undefined,
    wardGroup: {
      memberCount: members.length,
      placeCount: seenPlaceIds.size,
      gatewayEstimate,
      memberIds,
      tripMode,
    },
  };

  const memberIdsInResults = new Set(memberIds);
  return [
    groupResult,
    ...results.filter((result) => !memberIdsInResults.has(result.id)),
  ];
}

/**
 * Destinations URL that preserves the matching ward filter: individual
 * wards remain browseable and follow the same trip mode.
 */
export function buildTokyoWardsLink(
  memberIds: readonly string[],
  tripMode?: TripMode,
): string {
  const params = new URLSearchParams();
  for (const id of memberIds) {
    params.append("city", id);
  }
  if (tripMode) {
    params.set("tripMode", tripMode);
  }
  return `/destinations?${params.toString()}`;
}

export interface ExplorerWardGroupBuildInput {
  members: Destination[];
  /** Unique published supporting places across members. */
  placeCount: number;
  tripMode?: TripMode;
}

/**
 * Builds the virtual group card for the Destinations explorer: a shallow
 * copy of the highest-ranked member with a distinct id, the localized
 * display name, and the wardGroup metadata the card branch renders.
 */
export function buildExplorerWardGroup(
  input: ExplorerWardGroupBuildInput,
): Destination {
  const { members, placeCount, tripMode } = input;
  const topMember = members.reduce((best, member) =>
    (member.ratings?.overall ?? 0) >= (best.ratings?.overall ?? 0)
      ? member
      : best,
  );
  return {
    ...topMember,
    id: TOKYO_WARDS_GROUP_ID,
    name: "Tokyo 23 Wards",
    wardGroup: {
      memberCount: members.length,
      placeCount,
      gatewayEstimate: undefined,
      memberIds: members.map((member) => member.id),
      tripMode,
    },
  } as Destination;
}
