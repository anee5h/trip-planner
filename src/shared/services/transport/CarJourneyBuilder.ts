import type {
  Journey,
  JourneyCost,
  JourneyEndpoint,
  JourneyLeg,
  JourneyProvenance,
  JourneyConfidence,
  JourneyEvidence,
  JourneyCompleteness,
} from "@/shared/types/journey";
import type { CarAccessCoordinates } from "@/shared/types/carAccess";
import type { Destination } from "@/shared/types/destination";
import type {
  CarRouteEndpoint,
  CarRoundTripRoute,
  CarRouteResult,
} from "./CarRouteProvider";
import { isCarRoundTripRouteForDestination } from "./CarRouteProvider";
import { journeyHandoffCapabilityForMode } from "./JourneyHandoff";

const unknownCost: JourneyCost = {
  currency: "JPY",
  representation: null,
  state: "unknown",
  evidence: "unknown",
  scope: "unknown",
  completeness: "unknown",
  basis: "unknown",
};

function endpointFromOrigin(origin: CarAccessCoordinates): JourneyEndpoint {
  return {
    id: "origin",
    coordinates: { lat: origin.lat, lng: origin.lng },
    kind: "origin",
  };
}

function endpointFromRouteEndpoint(
  endpoint: CarRouteEndpoint | undefined,
  fallbackKind: JourneyEndpoint["kind"],
): JourneyEndpoint {
  return {
    id: endpoint?.id,
    name: endpoint?.label,
    coordinates: endpoint?.coordinates
      ? {
          lat: endpoint.coordinates.lat,
          lng: endpoint.coordinates.lng,
        }
      : undefined,
    kind: endpoint?.accessAnchorId ? "access_anchor" : fallbackKind,
  };
}

function routeProvenance(route: CarRouteResult): JourneyProvenance {
  const evidence =
    route.confidence === "unknown" ? "unknown" : route.confidence;
  return {
    source: route.provider,
    confidence:
      evidence === "verified"
        ? "high"
        : evidence === "estimated"
          ? "medium"
          : "unknown",
    duration: evidence,
    cost: "unknown",
    sourceUrl: route.sourceUrl,
    checkedAt: route.retrievedAt,
  };
}

function legFromRoute(
  route: CarRouteResult,
  origin: JourneyEndpoint,
  direction: "outbound" | "return",
  mode: "car" | "my_car",
): JourneyLeg {
  const available = route.availability === "available";
  const evidence: JourneyEvidence = available ? route.confidence : "unknown";
  const confidence: JourneyConfidence = available
    ? route.confidence === "verified"
      ? "high"
      : route.confidence === "estimated"
        ? "medium"
        : "unknown"
    : "unknown";
  return {
    mode,
    direction,
    origin,
    destination: endpointFromRouteEndpoint(
      route.destination,
      direction === "outbound" ? "access_anchor" : "origin",
    ),
    duration: {
      minutes:
        available &&
        evidence !== "unknown" &&
        route.durationMinutes !== undefined
          ? [route.durationMinutes, route.durationMinutes]
          : undefined,
      evidence,
      source: route.provider,
      sourceUrl: route.sourceUrl,
      checkedAt: route.retrievedAt,
    },
    cost: unknownCost,
    availability: available
      ? "available"
      : route.availability === "no_route"
        ? "unavailable"
        : "unknown",
    confidence,
    provenance: routeProvenance(route),
    routeMetadata: {
      accessAnchorId:
        route.accessAnchor?.id ?? route.destination?.accessAnchorId,
      routeDistanceKm: route.distanceKm,
      tollState: route.toll.state,
      tollBasis: route.toll.basis,
      retrievedAt: route.retrievedAt,
    },
  };
}

/** Build canonical independent outbound/return legs from normalized routes. */
export function buildCarJourney(
  destination: Destination,
  origin: CarAccessCoordinates,
  route: CarRoundTripRoute,
  cost?: JourneyCost,
  mode: "car" | "my_car" = "car",
): Journey | null {
  if (!isCarRoundTripRouteForDestination(destination, route, origin)) {
    return null;
  }
  const originEndpoint = route.outbound.originEndpoint
    ? endpointFromRouteEndpoint(route.outbound.originEndpoint, "origin")
    : endpointFromOrigin(origin);
  const outbound = legFromRoute(
    route.outbound,
    originEndpoint,
    "outbound",
    mode,
  );
  const returnOrigin = endpointFromRouteEndpoint(
    route.outbound.destination,
    "access_anchor",
  );
  const inbound = legFromRoute(route.returnRoute, returnOrigin, "return", mode);
  const legs = [outbound, inbound] as const;
  // KAI-278 endpoint truthfulness: provider-backed car journeys route to a
  // verified route/access anchor (e.g. Karuizawa's parking anchor, ~1 km from
  // the town centroid). The Journey's top-level destination must be that
  // canonical arrival anchor so external directions hand off to the same
  // place the route actually ends. Catalogue identity is preserved (id/name).
  const arrival = outbound.destination;
  const arrivalCoordinates =
    arrival.coordinates ??
    (destination.coordinates
      ? {
          lat: destination.coordinates.lat,
          lng: destination.coordinates.lng,
        }
      : undefined);
  const allAvailable = legs.every((leg) => leg.availability === "available");
  const anyUnavailable = legs.some((leg) => leg.availability === "unavailable");
  const anyUnknown = legs.some((leg) => leg.confidence === "unknown");
  const confidence = allAvailable
    ? anyUnknown
      ? "unknown"
      : legs.every((leg) => leg.confidence === "high")
        ? "high"
        : "medium"
    : "unknown";
  const costEvidence: JourneyEvidence = cost?.evidence ?? "unknown";
  const provenance: JourneyProvenance = {
    source: "car-route-provider",
    confidence,
    duration: allAvailable
      ? confidence === "high"
        ? "verified"
        : confidence === "medium"
          ? "estimated"
          : "unknown"
      : "unknown",
    cost: costEvidence,
    checkedAt: route.returnRoute.retrievedAt ?? route.outbound.retrievedAt,
  };
  const completeness: JourneyCompleteness = allAvailable
    ? "complete"
    : anyUnavailable
      ? "unavailable"
      : "partial";
  return {
    kind: "journey",
    origin: originEndpoint,
    destination: {
      id: destination.id,
      anchorKey: arrivalCoordinates
        ? `coordinates:${arrivalCoordinates.lat.toFixed(4)}:${arrivalCoordinates.lng.toFixed(4)}`
        : destination.id,
      name: destination.name,
      coordinates: arrivalCoordinates,
      kind: arrival.kind === "access_anchor" ? "access_anchor" : "destination",
    },
    scope: "origin_journey",
    directionality: "round_trip",
    completeness,
    externalHandoff: journeyHandoffCapabilityForMode(
      mode,
      completeness,
      allAvailable ? "available" : anyUnavailable ? "unavailable" : "unknown",
    ),
    legs,
    ...(cost ? { cost } : {}),
    availability: allAvailable
      ? "available"
      : anyUnavailable
        ? "unavailable"
        : "unknown",
    confidence,
    provenance,
  };
}
