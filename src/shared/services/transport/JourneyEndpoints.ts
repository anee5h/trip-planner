import type { Destination } from "@/shared/types/destination";
import type { JourneyEndpoint } from "@/shared/types/journey";
import type { JourneyEndpoints } from "./JourneyBuilder";
import type { OriginAwareEstimateContext } from "./OriginAwareTransportService";
import { resolveDestinationTransportZone } from "./TransportTopologyService";

export interface JourneyEndpointOptions {
  originEndpoint?: JourneyEndpoint;
}

const SAME_ANCHOR_THRESHOLD_KM = 0.01;

export function canonicalAnchorKey(
  endpoint: Pick<JourneyEndpoint, "id" | "coordinates" | "anchorKey">,
): string | undefined {
  if (endpoint.anchorKey) return endpoint.anchorKey;
  if (endpoint.coordinates) {
    return `coordinates:${endpoint.coordinates.lat.toFixed(4)}:${endpoint.coordinates.lng.toFixed(4)}`;
  }
  return endpoint.id;
}

function distanceKm(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
): number {
  const radians = Math.PI / 180;
  const dLat = (right.lat - left.lat) * radians;
  const dLng = (right.lng - left.lng) * radians;
  const lat1 = left.lat * radians;
  const lat2 = right.lat * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function areCanonicalAnchorsIdentical(
  origin: JourneyEndpoint,
  destination: JourneyEndpoint,
): boolean {
  const originKey = canonicalAnchorKey(origin);
  const destinationKey = canonicalAnchorKey(destination);
  if (originKey && destinationKey && originKey === destinationKey) return true;
  if (origin.coordinates && destination.coordinates) {
    return (
      distanceKm(origin.coordinates, destination.coordinates) <=
      SAME_ANCHOR_THRESHOLD_KM
    );
  }
  return Boolean(origin.id && destination.id && origin.id === destination.id);
}

export function getJourneyEndpoints(
  destination: Destination,
  context: OriginAwareEstimateContext,
  options: JourneyEndpointOptions = {},
): JourneyEndpoints {
  const origin = options.originEndpoint ?? {
    kind: "origin" as const,
    anchorKey: context.originAnchorId,
    name: context.originLabel,
    coordinates: context.homeStationCoords ?? undefined,
    zoneId: context.originZoneId,
    id: context.originMunicipalityId,
  };
  return {
    origin: {
      ...origin,
      anchorKey: canonicalAnchorKey(origin),
    },
    destination: {
      kind: "destination",
      id: destination.id,
      anchorKey: canonicalAnchorKey({
        id: destination.id,
        coordinates: destination.coordinates,
      }),
      name: destination.name,
      coordinates: destination.coordinates,
      zoneId: resolveDestinationTransportZone(destination),
    },
  };
}
