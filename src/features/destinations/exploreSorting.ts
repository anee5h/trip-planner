import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";
import type { BudgetTier } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/types/tripDuration";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import {
  resolveExploreBudgetEstimate,
  type ExploreBudgetEstimate,
} from "./exploreBudget";

export type ExploreSortKey = "recommended" | "walking" | "nearest" | "budget";

export interface ExploreSortMetrics {
  /** Straight-line kilometres from the selected origin. */
  nearestKm: number | null;
  /** Published destination on-site walking time, in minutes. */
  walkingMinutes: number | null;
  /** Lowest canonical day-trip range ceiling across eligible modes. */
  budgetMax?: number | null;
}

export interface ExploreSortContext {
  originCoords?: { lat: number; lng: number } | null;
  originZoneId?: TransportZoneId;
  carMode: string;
  publicModes: readonly string[];
  partySize: number;
  budgetTier?: BudgetTier;
  duration?: TripDuration;
  ferryTemporal?: FerryTemporalContext;
  budgetEstimatesById?: ReadonlyMap<string, ExploreBudgetEstimate>;
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

function getExploreBudgetMax(
  destination: Destination,
  context: ExploreSortContext,
): number | null {
  const resolved =
    context.budgetEstimatesById?.get(destination.id) ??
    resolveExploreBudgetEstimate(destination, {
      originCoords: context.originCoords,
      originZoneId: context.originZoneId,
      carMode: context.carMode,
      publicModes: context.publicModes,
      partySize: context.partySize,
      duration: context.duration ?? "fullDay",
      budgetTier: context.budgetTier,
      ferryTemporal: context.ferryTemporal,
    });
  return resolved?.estimate.total?.max ?? null;
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
      walkingMinutes:
        computeAll || sortBy === "walking"
          ? getExploreWalkingMinutes(destination)
          : null,
      budgetMax:
        computeAll || sortBy === "budget"
          ? getExploreBudgetMax(destination, context)
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
    sortBy === "walking" || sortBy === "nearest" || sortBy === "budget"
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
        sortKey === "walking"
          ? "walkingMinutes"
          : sortKey === "budget"
            ? "budgetMax"
            : "nearestKm";
      comparison = compareExploreNumericValues(
        leftMetrics?.[metricName],
        rightMetrics?.[metricName],
      );
    }
    return comparison || left.id.localeCompare(right.id);
  });
}
