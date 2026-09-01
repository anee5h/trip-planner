import {
  calculateTripEstimate,
  type TripEstimateResult,
} from "@/shared/services/budget/tripEstimateEngine";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import type { BudgetTier } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/types/tripDuration";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import type { Destination } from "@/shared/types/destination";

export interface ExploreBudgetContext {
  originCoords?: { lat: number; lng: number } | null;
  originZoneId?: TransportZoneId;
  carMode: string;
  publicModes: readonly string[];
  partySize: number;
  duration: TripDuration;
  budgetTier?: BudgetTier;
  ferryTemporal?: FerryTemporalContext;
}

export interface ExploreBudgetEstimate {
  readonly mode?: string;
  readonly estimate: TripEstimateResult;
  readonly validModes: readonly string[];
}

function calculateForMode(
  destination: Destination,
  context: ExploreBudgetContext,
  mode?: string,
): TripEstimateResult {
  return calculateTripEstimate({
    dest: destination,
    ...(mode ? { mode } : {}),
    partySize: context.partySize,
    homeCoords: context.originCoords ?? undefined,
    includeOriginTravel: Boolean(context.originCoords),
    duration: context.duration,
    ferryTemporal: context.ferryTemporal,
  });
}

/**
 * Resolve the one budget estimate Explore should use for a destination.
 *
 * With an origin, only `getValidModes` results are candidates. Among those
 * candidates the lowest bounded ceiling wins, with getValidModes order as the
 * deterministic tie-break. Without an origin, the result is explicitly
 * on-site-only and has no synthetic transport mode.
 */
export function resolveExploreBudgetEstimate(
  destination: Destination,
  context: ExploreBudgetContext,
): ExploreBudgetEstimate | null {
  const originCoords = context.originCoords ?? undefined;
  if (!originCoords) {
    const estimate = calculateForMode(destination, context);
    return estimate.total ? { estimate, validModes: [] } : null;
  }

  const validModes = getValidModes(
    destination,
    context.carMode,
    [...context.publicModes],
    originCoords,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );
  let best: ExploreBudgetEstimate | null = null;
  for (const mode of validModes) {
    const estimate = calculateForMode(destination, context, mode);
    if (!estimate.total) continue;
    if (!best || estimate.total.max < best.estimate.total!.max) {
      best = { mode, estimate, validModes };
    }
  }
  return best;
}
