import type {
  Journey,
  JourneyEndpoint,
  JourneyLeg,
  JourneyScope,
} from "@/shared/types/journey";
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
import type { TransportMode } from "./types";
import {
  areCanonicalAnchorsIdentical,
  getJourneyEndpoints,
} from "./JourneyEndpoints";
import { getTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";

export {
  areCanonicalAnchorsIdentical,
  canonicalAnchorKey,
  getJourneyEndpoints,
} from "./JourneyEndpoints";

export interface JourneyResolutionOptions {
  scope?: JourneyScope;
  directionality?: Journey["directionality"];
  originEndpoint?: JourneyEndpoint;
}

const PARTIAL_ACCESS_MODES: readonly TransportMode[] = [
  "train",
  "shinkansen",
  "bus",
  "ferry",
  "flight",
  "car",
  "my_car",
];

function withJourneySemantics(
  journey: Journey,
  options: JourneyResolutionOptions,
): Journey {
  return {
    ...journey,
    scope: options.scope ?? journey.scope,
    directionality: options.directionality ?? journey.directionality,
  };
}

function rebindCanonicalEndpoints(
  journey: Journey,
  endpoints: JourneyEndpoints,
): Journey {
  // Provider-backed car journeys legitimately arrive at a route/access
  // anchor (e.g. a parking lot) that differs from the catalogue centroid.
  // Never clobber that canonical arrival back to the centroid: the origin is
  // rebound to the resolved context, the destination only when the journey
  // does not already carry a coordinate-bearing access anchor (KAI-278).
  const destination =
    journey.destination.kind === "access_anchor" &&
    journey.destination.coordinates
      ? journey.destination
      : endpoints.destination;
  return {
    ...journey,
    origin: endpoints.origin,
    destination,
  };
}

function buildSameAnchorJourney(
  endpoints: JourneyEndpoints,
  mode: TransportMode,
  scope: JourneyScope,
): Journey {
  const provenance = {
    source: "same_canonical_anchor",
    confidence: "high" as const,
    duration: "verified" as const,
    cost: "unknown" as const,
  };
  const leg: JourneyLeg = {
    mode,
    direction: "one_way",
    origin: endpoints.origin,
    destination: endpoints.destination,
    duration: {
      minutes: [0, 0],
      evidence: "verified",
      source: "same_canonical_anchor",
    },
    cost: {
      currency: "JPY",
      representation: null,
      state: "unknown",
      evidence: "unknown",
      scope: "unknown",
      completeness: "unknown",
      basis: "unknown",
    },
    availability: "available",
    confidence: "high",
    provenance,
    routeMetadata: { notes: "Already at the canonical arrival anchor." },
  };
  return {
    kind: "journey",
    origin: endpoints.origin,
    destination: endpoints.destination,
    scope,
    directionality: "one_way",
    completeness: "complete",
    externalHandoff: { supported: false, reason: "same_anchor" },
    legs: [leg],
    availability: "available",
    confidence: "high",
    provenance,
  };
}

export function buildPartialLocalAccessJourney(
  destination: Destination,
  modes: readonly string[],
  originEndpoint: JourneyEndpoint,
): Journey {
  const mode = (modes.find((candidate): candidate is TransportMode =>
    PARTIAL_ACCESS_MODES.includes(candidate as TransportMode),
  ) ?? "bus") as TransportMode;
  const endpoints = getJourneyEndpoints(
    destination,
    {
      homeStationCoords: originEndpoint.coordinates,
      originZoneId: originEndpoint.zoneId,
      originMunicipalityId: originEndpoint.id,
      originLabel: originEndpoint.name,
      originAnchorId: originEndpoint.anchorKey,
    },
    { originEndpoint },
  );
  const provenance = {
    source: "known_local_access_guidance",
    confidence: "low" as const,
    duration: "unknown" as const,
    cost: "unknown" as const,
  };
  const leg: JourneyLeg = {
    mode,
    direction: "one_way",
    origin: endpoints.origin,
    destination: endpoints.destination,
    duration: { evidence: "unknown", source: "known_local_access_guidance" },
    cost: {
      currency: "JPY",
      representation: null,
      state: "unknown",
      evidence: "unknown",
      scope: "unknown",
      completeness: "unknown",
      basis: "unknown",
    },
    availability: "unknown",
    confidence: "low",
    provenance,
    routeMetadata: {
      notes:
        "Local access mode is known, but the origin journey and access duration are unavailable.",
    },
  };
  return {
    kind: "journey",
    origin: endpoints.origin,
    destination: endpoints.destination,
    scope: "final_segment",
    directionality: "one_way",
    completeness: "partial",
    externalHandoff: { supported: false, reason: "partial_journey" },
    legs: [leg],
    availability: "unknown",
    confidence: "low",
    provenance,
  };
}

export function buildOriginAwareTransportJourney(
  destination: Destination,
  context: OriginAwareEstimateContext,
  estimate: OriginAwareTransportEstimate,
  options: JourneyResolutionOptions = {},
): Journey | null {
  if (!context.homeStationCoords && !options.originEndpoint?.coordinates)
    return null;
  const endpoints = getJourneyEndpoints(destination, context, options);
  const scopedCarRoute =
    context.carRoute &&
    context.homeStationCoords &&
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
    const carJourney = buildCarJourney(
      destination,
      context.homeStationCoords!,
      scopedCarRoute,
      undefined,
      estimate.mode === "my_car" ? "my_car" : "car",
    );
    return carJourney ? withJourneySemantics(carJourney, options) : null;
  }
  const journey = buildJourneyFromOriginAwareEstimate(estimate, endpoints);
  return journey ? withJourneySemantics(journey, options) : null;
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
  options: JourneyResolutionOptions = {},
): Journey | null {
  if (!context.homeStationCoords && !options.originEndpoint?.coordinates)
    return null;
  const endpoints = getJourneyEndpoints(destination, context, options);
  const selectedMode = modes.find((candidate): candidate is TransportMode =>
    PARTIAL_ACCESS_MODES.includes(candidate as TransportMode),
  );
  if (
    selectedMode &&
    areCanonicalAnchorsIdentical(endpoints.origin, endpoints.destination)
  ) {
    return buildSameAnchorJourney(
      endpoints,
      selectedMode,
      options.scope === "origin_journey"
        ? "local_access"
        : (options.scope ?? "local_access"),
    );
  }

  const evidence = getTravelDurationEvidence(
    destination,
    context,
    modes,
    modes,
  );
  return evidence.journey
    ? withJourneySemantics(
        rebindCanonicalEndpoints(evidence.journey, endpoints),
        options,
      )
    : null;
}

/** Direct estimator adapter retained for callers that need the estimate shape. */
export { getOriginAwareTransportEstimate };
