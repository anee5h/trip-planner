import type { Destination } from "@/shared/types/destination";
import { getSortableVerifiedBudget } from "@/shared/services/budget/BudgetService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import { getDistance } from "@/shared/utils/distance";

export type ExploreSortKey = "recommended" | "budget" | "walking" | "nearest";

export interface ExploreSortMetrics {
  /** Straight-line kilometres from the selected origin. */
  nearestKm: number | null;
  /** Canonical complete party-aware trip cost, in JPY. */
  budgetJpy: number | null;
  /** Published destination on-site walking time, in minutes. */
  walkingMinutes: number | null;
}

export interface ExploreSortContext {
  originCoords?: { lat: number; lng: number } | null;
  originZoneId?: TransportZoneId;
  carMode: string;
  publicModes: readonly string[];
  partySize: number;
  budgetTier?: "economy" | "standard" | "comfortable" | "luxury";
  ferryTemporal?: FerryTemporalContext;
}

/**
 * Converts an arbitrary candidate into the only numeric values the Explore
 * comparator is allowed to see. Unknown, unavailable, NaN, and infinities are
 * represented by null; zero remains a valid value.
 */
export function normalizeExploreNumericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Ascending comparison with unknown values last. Returning zero for two
 * unknown/equal values lets the caller apply a deterministic id tie-break.
 */
export function compareExploreNumericValues(
  left: unknown,
  right: unknown,
): number {
  const normalizedLeft = normalizeExploreNumericValue(left);
  const normalizedRight = normalizeExploreNumericValue(right);
  if (normalizedLeft === null) return normalizedRight === null ? 0 : 1;
  if (normalizedRight === null) return -1;
  return normalizedLeft - normalizedRight;
}

export function getExploreNearestDistance(
  destination: Destination,
  originCoords?: { lat: number; lng: number } | null,
): number | null {
  if (!originCoords || !destination.coordinates) return null;
  return normalizeExploreNumericValue(
    getDistance(
      originCoords.lat,
      originCoords.lng,
      destination.coordinates.lat,
      destination.coordinates.lng,
    ),
  );
}

/**
 * Least Walk means the destination's canonical on-site walking burden. The
 * catalogue contract stores this as minutes, not origin-to-destination travel
 * time. Missing, explicitly unknown, or legacy metre values do not participate
 * in ranking and are sorted after known minute values.
 */
export function getExploreWalkingMinutes(
  destination: Destination,
): number | null {
  if (
    destination.walkingMetadata?.method === "unknown" ||
    destination.walkingMetadata?.unit === "metres"
  ) {
    return null;
  }
  return normalizeExploreNumericValue(destination.walkingMin);
}

/**
 * Uses the existing BudgetService canonical metric: for each mode with a
 * complete, origin-aware party trip-cost range, BudgetService selects the
 * range upper bound (`range[1]`) and then chooses the lowest such bound. This
 * conservative existing product metric prevents a destination's worst-case
 * known cost from being ranked as cheaper than a lower guaranteed cost.
 */
export function getExploreBudgetMetric(
  destination: Destination,
  context: ExploreSortContext,
): number | null {
  const modes = getValidModes(
    destination,
    context.carMode,
    [...context.publicModes],
    context.originCoords ?? undefined,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );
  return normalizeExploreNumericValue(
    getSortableVerifiedBudget(
      destination,
      modes,
      context.partySize,
      context.originCoords ?? undefined,
      context.ferryTemporal,
      context.budgetTier,
    ),
  );
}

/** Compute every explicit Explore metric once per eligible destination. */
export function computeExploreSortMetrics(
  destinations: readonly Destination[],
  context: ExploreSortContext,
  sortBy?: string,
): Map<string, ExploreSortMetrics> {
  const computeAll = sortBy === undefined;
  const metrics = new Map<string, ExploreSortMetrics>();
  for (const destination of destinations) {
    metrics.set(destination.id, {
      nearestKm:
        computeAll || sortBy === "nearest"
          ? getExploreNearestDistance(destination, context.originCoords)
          : null,
      budgetJpy:
        computeAll || sortBy === "budget"
          ? getExploreBudgetMetric(destination, context)
          : null,
      walkingMinutes:
        computeAll || sortBy === "walking"
          ? getExploreWalkingMinutes(destination)
          : null,
    });
  }
  return metrics;
}

export function sortExploreDestinations<T extends Pick<Destination, "id">>(
  destinations: readonly T[],
  sortBy: string,
  metricsById: ReadonlyMap<string, ExploreSortMetrics>,
  recommendedScoresById?: ReadonlyMap<string, number>,
): T[] {
  const sortKey: ExploreSortKey =
    sortBy === "budget" || sortBy === "walking" || sortBy === "nearest"
      ? sortBy
      : "recommended";

  return [...destinations].sort((left, right) => {
    let comparison = 0;
    if (sortKey === "recommended") {
      const leftScore = recommendedScoresById?.get(left.id);
      const rightScore = recommendedScoresById?.get(right.id);
      comparison = compareExploreNumericValues(rightScore, leftScore);
    } else {
      const leftMetrics = metricsById.get(left.id);
      const rightMetrics = metricsById.get(right.id);
      const metricName =
        sortKey === "budget"
          ? "budgetJpy"
          : sortKey === "walking"
            ? "walkingMinutes"
            : "nearestKm";
      comparison = compareExploreNumericValues(
        leftMetrics?.[metricName],
        rightMetrics?.[metricName],
      );
    }
    return comparison || left.id.localeCompare(right.id);
  });
}
