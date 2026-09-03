import type { Journey } from "@/shared/types/journey";
import type { Destination } from "@/shared/types/destination";
import {
  buildJourneyFromOriginAwareEstimate,
  type JourneyEndpoints,
} from "./JourneyBuilder";
import { buildCarJourney } from "./CarJourneyBuilder";
import { isCarRoundTripRouteForDestination } from "./CarRouteProvider";
import {
  getOriginAwareTransportEstimate,
  type OriginAwareEstimateContext,
  type OriginAwareTransportEstimate,
} from "./OriginAwareTransportService";

export function getJourneyEndpoints(
  destination: Destination,
  context: OriginAwareEstimateContext,
): JourneyEndpoints {
  return {
    origin: {
      kind: "origin",
      coordinates: context.homeStationCoords ?? undefined,
      zoneId: context.originZoneId,
      id: context.originMunicipalityId,
    },
    destination: {
      kind: "destination",
      id: destination.id,
      name: destination.name,
      coordinates: destination.coordinates,
      zoneId: undefined,
    },
  };
}

export function buildOriginAwareTransportJourney(
  destination: Destination,
  context: OriginAwareEstimateContext,
  estimate: OriginAwareTransportEstimate,
): Journey | null {
  if (!context.homeStationCoords) return null;
  const scopedCarRoute =
    context.carRoute &&
    isCarRoundTripRouteForDestination(
      destination,
      context.carRoute,
      context.homeStationCoords,
    )
      ? context.carRoute
      : undefined;
  if (
    (estimate.mode === "car" || estimate.mode === "my_car") &&
    scopedCarRoute
  ) {
    return buildCarJourney(
      destination,
      context.homeStationCoords,
      scopedCarRoute,
      undefined,
      estimate.mode === "my_car" ? "my_car" : "car",
    );
  }
  return buildJourneyFromOriginAwareEstimate(
    estimate,
    getJourneyEndpoints(destination, context),
  );
}

/**
 * Canonical Journey seam for existing origin-aware single-mode results.
 * A missing estimate remains null: this function never creates a supported
 * Journey from an unsupported or unproven transport mode.
 */
export function getOriginAwareTransportJourney(
  destination: Destination,
  context: OriginAwareEstimateContext,
  modes: readonly string[],
): Journey | null {
  if (!context.homeStationCoords) return null;
  const estimate = getOriginAwareTransportEstimate(destination, context, modes);
  return estimate
    ? buildOriginAwareTransportJourney(destination, context, estimate)
    : null;
}
