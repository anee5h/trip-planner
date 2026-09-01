import type { Destination } from "@/shared/types/destination";
import {
  getTripDays,
  normalizeTripDuration,
  type TripDuration,
} from "@/shared/types/tripDuration";

/**
 * Hub-first overnight policy: primary results are coherent trip areas
 * (hubs and standalone area-like destinations), never isolated POIs.
 *
 * Classification uses only structured catalogue data (role, placeType,
 * relationships.parentDestinationId, kind) — never title heuristics.
 */

export type WeekendResultKind = "trip_area" | "standalone_area" | "poi";

export interface WeekendAreaClassification {
  kind: WeekendResultKind;
  parentHubId?: string;
  placeCount: number;
  capacityMinutes: number;
}

/**
 * Positive allowlist of coherent-area kinds. A standalone root is a weekend
 * primary area only when its structured kind is explicitly area-like.
 * Unknown or missing kinds default to POI — the classifier never assumes
 * "no kind means area".
 *
 * Only values that actually exist in the catalogue are listed.
 */
const AREA_LIKE_KINDS: Record<string, true> = {
  city: true,
  ward: true,
  town: true,
  village: true,
  district: true,
  island: true,
  nature: true,
  natural: true,
  mountain: true,
  lake: true,
  historic_town: true,
  onsen: true,
};

/**
 * Published (or legacy pre-lifecycle) records count toward capacity and
 * place totals; in_review / draft records never do.
 */
export function isPublishedDestination(destination: Destination): boolean {
  const lifecycle = destination.editorial?.lifecycle;
  return (
    lifecycle === undefined ||
    lifecycle === "published" ||
    lifecycle === "legacy"
  );
}

/** Unique published children contained by a destination. */
export function getContainedPlaces(
  destination: Destination,
  pool: readonly Destination[],
): Destination[] {
  return pool.filter(
    (place) =>
      place.relationships?.parentDestinationId === destination.id &&
      isPublishedDestination(place),
  );
}

/**
 * Area capacity: max(hub own published duration, sum of unique published
 * child durations). Parent and child durations are never added together.
 */
export function computeAreaCapacityMinutes(
  destination: Destination,
  children: readonly Destination[],
): number {
  const ownMinutes = (destination.recommendedVisitHours?.max ?? 0) * 60;
  const childrenSum = children.reduce(
    (sum, child) => sum + (child.recommendedVisitHours?.max ?? 0) * 60,
    0,
  );
  return Math.max(ownMinutes, childrenSum);
}

export interface OvernightCapacityThresholds {
  days: number;
  minEligibleMinutes: number;
  strongMinutes: number;
}

/**
 * Overnight capacity scales with the selected number of days. The default
 * keeps legacy 2D1N callers at 480/600 minutes, while 3D2N requires
 * 720/900 minutes and future N-day durations scale without another policy.
 */
export const OVERNIGHT_CAPACITY_POLICY = {
  MIN_ELIGIBLE_MINUTES_PER_DAY: 240,
  STRONG_MINUTES_PER_DAY: 300,
} as const;

export function getOvernightCapacityThresholds(
  duration: TripDuration | string = "2d1n",
): OvernightCapacityThresholds {
  const canonicalDuration = normalizeTripDuration(duration) ?? "2d1n";
  const days = Math.max(2, getTripDays(canonicalDuration));
  return {
    days,
    minEligibleMinutes:
      days * OVERNIGHT_CAPACITY_POLICY.MIN_ELIGIBLE_MINUTES_PER_DAY,
    strongMinutes: days * OVERNIGHT_CAPACITY_POLICY.STRONG_MINUTES_PER_DAY,
  };
}

/**
 * Classifies a weekend candidate against the full candidate pool.
 *
 * - Explicit hubs (role or placeType "hub") → trip_area.
 * - Any destination containing published children → trip_area (it is a base).
 * - Standalone roots that are not single-attraction kinds → standalone_area.
 * - Everything else (child POIs, standalone POIs, legacy POIs) → poi.
 */
function classifyWithChildren(
  destination: Destination,
  children: readonly Destination[],
): WeekendAreaClassification {
  const ownMinutes = (destination.recommendedVisitHours?.max ?? 0) * 60;
  if (destination.role === "hub" || destination.placeType === "hub") {
    return {
      kind: "trip_area",
      placeCount: children.length,
      capacityMinutes: computeAreaCapacityMinutes(destination, children),
    };
  }
  if (children.length > 0) {
    return {
      kind: "trip_area",
      placeCount: children.length,
      capacityMinutes: computeAreaCapacityMinutes(destination, children),
    };
  }
  if (
    destination.role === "standalone" &&
    destination.kind &&
    AREA_LIKE_KINDS[destination.kind]
  ) {
    return {
      kind: "standalone_area",
      placeCount: 0,
      capacityMinutes: ownMinutes,
    };
  }
  return {
    kind: "poi",
    parentHubId: destination.relationships?.parentDestinationId,
    placeCount: 0,
    capacityMinutes: ownMinutes,
  };
}

export function classifyWeekendResultCandidate(
  destination: Destination,
  pool: readonly Destination[],
): WeekendAreaClassification {
  return classifyWithChildren(
    destination,
    getContainedPlaces(destination, pool),
  );
}

export interface WeekendAreaConsolidation {
  /** Primary results — eligible trip areas / standalone areas, input order. */
  areas: Destination[];
  placeCountById: ReadonlyMap<string, number>;
  capacityMinutesById: ReadonlyMap<string, number>;
  kindById: ReadonlyMap<string, WeekendResultKind>;
  /** Unique published children across all returned areas (deduped by id). */
  totalPlaceCount: number;
}

/**
 * No-origin overnight browsing gate: no personalized travel claims, but the
 * candidate still needs coherent trip-area classification and duration-aware
 * published activity capacity. Thin areas are never overnight bases.
 */
export function passesNoOriginWeekendGate(
  destination: Destination,
  pool: readonly Destination[],
  duration: TripDuration | string = "2d1n",
): boolean {
  const children = getContainedPlaces(destination, pool);
  if (classifyWithChildren(destination, children).kind === "poi") return false;
  return (
    computeAreaCapacityMinutes(destination, children) >=
    getOvernightCapacityThresholds(duration).minEligibleMinutes
  );
}

/**
 * Hub-first consolidation step: runs after weekend eligibility, before final
 * ranking. Drops every poi-kind candidate (child cards are suppressed with
 * or without an eligible parent; standalone POIs never become bases) and
 * computes the deduplicated place counts for the returned areas.
 */
export function consolidateWeekendAreas(
  eligible: readonly Destination[],
  pool: readonly Destination[],
): WeekendAreaConsolidation {
  const childIndex = new Map<string, Destination[]>();
  for (const place of pool) {
    const parentId = place.relationships?.parentDestinationId;
    if (!parentId || !isPublishedDestination(place)) continue;
    const siblings = childIndex.get(parentId);
    if (siblings) siblings.push(place);
    else childIndex.set(parentId, [place]);
  }

  const areas: Destination[] = [];
  const placeCountById = new Map<string, number>();
  const capacityMinutesById = new Map<string, number>();
  const kindById = new Map<string, WeekendResultKind>();
  const seenChildIds = new Set<string>();

  for (const destination of eligible) {
    const children = childIndex.get(destination.id) ?? [];
    const classification = classifyWithChildren(destination, children);
    if (classification.kind === "poi") continue;

    areas.push(destination);
    placeCountById.set(destination.id, classification.placeCount);
    capacityMinutesById.set(destination.id, classification.capacityMinutes);
    kindById.set(destination.id, classification.kind);
    for (const child of children) {
      seenChildIds.add(child.id);
    }
  }

  return {
    areas,
    placeCountById,
    capacityMinutesById,
    kindById,
    totalPlaceCount: seenChildIds.size,
  };
}

/**
 * Compact human-readable one-way duration, e.g. 130 → "2h 10m" / "2時間10分",
 * 45 → "45m" / "45分".
 */
export function formatWeekendMinutes(
  minutes: number | undefined,
  locale: "en" | "ja" = "en",
): string {
  if (minutes === undefined) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "ja") {
    if (hours === 0) return `${rest}分`;
    if (rest === 0) return `${hours}時間`;
    return `${hours}時間${rest}分`;
  }
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
