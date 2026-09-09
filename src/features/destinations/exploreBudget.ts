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

export type ExploreEstimateScope =
  "complete" | "partial_on_site" | "partial_total";

/**
 * Resolve the traveller-facing scope of a bounded Explore estimate.
 *
 * A partial result is not automatically on-site-only: the canonical engine
 * retains bounded origin travel in `knownCost` when another component is
 * unresolved. Only a partial result with no origin contribution to the known
 * subtotal may claim that origin transport is excluded.
 */
export function getExploreEstimateScope(
  estimate: TripEstimateResult,
): ExploreEstimateScope {
  if (estimate.completeness === "complete") return "complete";
  if (estimate.completeness !== "partial") return "partial_on_site";

  const originTravel = estimate.components.find(
    (component) => component.evidence.scope === "origin_travel",
  );
  const originIncluded = Boolean(
    originTravel &&
    (originTravel.cost.kind === "bounded" || originTravel.knownCost),
  );
  return originIncluded ? "partial_total" : "partial_on_site";
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
  // KAI-275 follow-up: prefer a COMPLETE estimate (any complete total beats
  // a partial), but retain the cheapest PARTIAL estimate as a fallback so
  // restricted-tier filtering and card display can evaluate the KNOWN
  // bounded subtotal truthfully. Discovery estimates are partial by design
  // (#326: no ORS during discovery → origin-car transport unknown).
  let best: ExploreBudgetEstimate | null = null;
  let bestPartial: ExploreBudgetEstimate | null = null;
  for (const mode of validModes) {
    const estimate = calculateForMode(destination, context, mode);
    if (estimate.completeness === "unavailable") continue;
    if (!estimate.total) {
      if (
        !bestPartial ||
        estimate.knownSubtotal[1] < bestPartial.estimate.knownSubtotal[1]
      ) {
        bestPartial = { mode, estimate, validModes };
      }
      continue;
    }
    if (!best || estimate.total.max < best.estimate.total!.max) {
      best = { mode, estimate, validModes };
    }
  }
  return best ?? bestPartial;
}
