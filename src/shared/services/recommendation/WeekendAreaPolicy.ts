import type { Destination } from "@/shared/types/destination";

/**
 * Hub-first weekend policy: 2D1N primary results are coherent trip areas
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
 * Standalone roots whose kind marks a single attraction. These are never
 * weekend bases even when a large own capacity would otherwise qualify.
 */
const STANDALONE_POI_KINDS: Record<string, true> = {
  museum: true,
  tower: true,
  garden: true,
  castle: true,
  park: true,
  shrine: true,
  temple: true,
  beach: true,
  bridge: true,
  viewpoint: true,
  amusement_park: true,
  aquarium: true,
  zoo: true,
  onsen: true,
  cape: true,
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

/**
 * Classifies a weekend candidate against the full candidate pool.
 *
 * - Explicit hubs (role or placeType "hub") → trip_area.
 * - Any destination containing published children → trip_area (it is a base).
 * - Standalone roots that are not single-attraction kinds → standalone_area.
 * - Everything else (child POIs, standalone POIs, legacy POIs) → poi.
 */
export function classifyWeekendResultCandidate(
  destination: Destination,
  pool: readonly Destination[],
): WeekendAreaClassification {
  const children = getContainedPlaces(destination, pool);
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
  const ownMinutes = (destination.recommendedVisitHours?.max ?? 0) * 60;
  if (
    destination.role === "standalone" &&
    (!destination.kind || !STANDALONE_POI_KINDS[destination.kind])
  ) {
    // Legacy standalone roots (no kind) are deliberate regional or
    // island-wide roots; remaining kinds (island, nature, natural, lake,
    // mountain, district, town, village) are coherent areas.
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
    const kind: WeekendResultKind =
      destination.role === "hub" || destination.placeType === "hub"
        ? "trip_area"
        : children.length > 0
          ? "trip_area"
          : destination.role === "standalone" &&
              (!destination.kind || !STANDALONE_POI_KINDS[destination.kind])
            ? "standalone_area"
            : "poi";
    if (kind === "poi") continue;

    areas.push(destination);
    placeCountById.set(destination.id, children.length);
    capacityMinutesById.set(
      destination.id,
      computeAreaCapacityMinutes(destination, children),
    );
    kindById.set(destination.id, kind);
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
