import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { resolveExploreBudgetEstimate } from "@/features/destinations/exploreBudget";
import type { Destination } from "@/shared/types/destination";
import type { TripContext } from "@/shared/context/TripContext";

/**
 * Compare's only estimate adapter. An explicit trip uses the same
 * origin/transport/party/duration semantics as Explore and Detail; a direct
 * Compare visit without an active trip retains the historical on-site view.
 */
export function resolveCompareEstimate(
  destination: Destination,
  tripContext: TripContext,
  hasExplicitTripContext: boolean,
) {
  if (hasExplicitTripContext) {
    const resolved = resolveExploreBudgetEstimate(destination, {
      originCoords: tripContext.origin?.coordinates,
      originZoneId: tripContext.origin?.transportZoneId,
      carMode: tripContext.carMode,
      publicModes: tripContext.publicModes,
      partySize: tripContext.partySize,
      duration: tripContext.duration,
      // A finite cap remains context for affordability; it must not filter
      // away the user's explicitly selected mode before it is displayed.
      budgetTier: undefined,
    });
    if (resolved) return resolved.estimate;

    return calculateTripEstimate({
      dest: destination,
      duration: tripContext.duration,
      partySize: tripContext.partySize,
      homeCoords: tripContext.origin?.coordinates,
      includeOriginTravel: Boolean(tripContext.origin?.coordinates),
    });
  }

  return calculateTripEstimate({
    dest: destination,
    duration: "fullDay",
    includeOriginTravel: false,
  });
}
