import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";
import { estimateBetween } from "./TransportEstimator";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
  zoneById,
} from "./TransportTopologyService";
import type { TransportMode } from "./types";
import type { EstimatedTransportEstimate } from "./OriginAwareTransportService";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import { resolveOriginMunicipalityId } from "../recommendation/OriginAreaService";
import { getDestinationList } from "../destination/DestinationService";

/**
 * Coordinate estimates are useful for nearby discovery, not for silently
 * replacing an intercity route registry. Keep this radius deliberately tight
 * so a missing corridor cannot turn a long-distance destination into a short
 * outing merely because both points are on Honshu.
 */
export const MAX_ESTIMATED_GROUND_DISTANCE_KM = 120;

const ESTIMATABLE_GROUND_MODES = new Set<TransportMode>([
  "train",
  "shinkansen",
  "bus",
  "car",
  "my_car",
]);

export interface SafeGroundEstimateContext {
  homeStationCoords: { lat: number; lng: number };
  homeStationTransportZoneId?: TransportZoneId;
  /** Modes already authorized by the caller's topology/user selection. */
  authorizedModes: readonly string[];
  allDestinations?: readonly Destination[];
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSupportedDestinationMode(
  destination: Destination,
  mode: TransportMode,
): boolean {
  const optionMode = mode === "my_car" ? "car" : mode;
  return (
    destination.transportOptions?.[
      optionMode as keyof typeof destination.transportOptions
    ] !== undefined
  );
}

function topologyAuthorizesMode(
  mode: string,
  topologyModes: readonly TransportMode[],
): boolean {
  if (mode === "my_car") return topologyModes.includes("car");
  return topologyModes.includes(mode as TransportMode);
}

function pickFastestEstimate(
  destination: Destination,
  context: SafeGroundEstimateContext,
  modes: readonly string[],
): EstimatedTransportEstimate | null {
  let best:
    | {
        mode: TransportMode;
        timeRange: [number, number];
        midpoint: number;
      }
    | undefined;

  for (const mode of modes) {
    if (!ESTIMATABLE_GROUND_MODES.has(mode as TransportMode)) continue;
    if (!isSupportedDestinationMode(destination, mode as TransportMode)) {
      continue;
    }
    const estimatorMode = mode === "my_car" ? "car" : (mode as TransportMode);
    const calculated = estimateBetween(
      { coordinates: context.homeStationCoords },
      { coordinates: destination.coordinates! },
      estimatorMode,
    );
    if (!calculated.available) continue;
    const midpoint = (calculated.timeRange[0] + calculated.timeRange[1]) / 2;
    if (!best || midpoint < best.midpoint) {
      best = {
        mode: mode as TransportMode,
        timeRange: calculated.timeRange,
        midpoint,
      };
    }
  }

  if (!best) return null;
  return {
    mode: best.mode,
    timeRange: best.timeRange,
    source: "calculated_ground_display",
    evidence: "estimated",
    originZoneId: "mainland-honshu",
    destinationZoneId: "mainland-honshu",
  };
}

/**
 * Returns an explicitly estimated travel duration only when all of the
 * following are true:
 * - both endpoints resolve to a non-island topology zone;
 * - the caller has already authorized a ground mode for the destination;
 * - both endpoints have finite coordinates within the locality radius;
 * - destination-level access restrictions allow the selected mode.
 *
 * Ferry and flight are intentionally absent from this function. An island
 * route therefore cannot gain train/car feasibility from coordinate distance.
 */
export function getSafeGroundEstimate(
  destination: Destination,
  context: SafeGroundEstimateContext,
): EstimatedTransportEstimate | null {
  if (destination.localAccessUnestimated === true) return null;
  if (!destination.coordinates) return null;
  if (
    !isFiniteCoordinate(context.homeStationCoords.lat) ||
    !isFiniteCoordinate(context.homeStationCoords.lng) ||
    !isFiniteCoordinate(destination.coordinates.lat) ||
    !isFiniteCoordinate(destination.coordinates.lng)
  ) {
    return null;
  }

  const explicitOriginZoneId = context.homeStationTransportZoneId;
  const originZoneId: TransportZoneId =
    explicitOriginZoneId &&
    explicitOriginZoneId !== "unknown" &&
    zoneById.has(explicitOriginZoneId)
      ? explicitOriginZoneId
      : resolveOriginTransportZone({
          coordinates: context.homeStationCoords,
        });
  const destinationZoneId = resolveDestinationTransportZone(destination);
  const originZone = zoneById.get(originZoneId);
  const destinationZone = zoneById.get(destinationZoneId);

  // Only non-island mainland topology can use this bounded estimator. In the
  // current topology that is mainland-honshu; using the zone flags keeps this
  // policy explicit if more mainland zones are added later.
  if (
    !originZone ||
    !destinationZone ||
    originZone.isIsland ||
    originZone.isRemote ||
    destinationZone.isIsland ||
    destinationZone.isRemote
  ) {
    return null;
  }

  const distanceKm = getDistance(
    context.homeStationCoords.lat,
    context.homeStationCoords.lng,
    destination.coordinates.lat,
    destination.coordinates.lng,
  );
  if (distanceKm > MAX_ESTIMATED_GROUND_DISTANCE_KM) return null;

  const topology = getEligibleOriginModes({
    originZoneId,
    destinationZoneId,
    destination,
  });
  const topologyModes =
    originZoneId === destinationZoneId
      ? topology.localModes
      : topology.crossZoneModes;
  const authorizedGroundModes = context.authorizedModes.filter((mode) =>
    topologyAuthorizesMode(mode, topologyModes),
  );

  if (authorizedGroundModes.length === 0) return null;

  const catalog =
    context.allDestinations ?? (getDestinationList("en") as Destination[]);
  const originMunicipalityId = resolveOriginMunicipalityId(
    context.homeStationCoords,
    catalog,
  );
  const source =
    originMunicipalityId && destination.municipalityId === originMunicipalityId
      ? "calculated_local_display"
      : "calculated_ground_display";

  const estimate = pickFastestEstimate(
    destination,
    context,
    authorizedGroundModes,
  );
  return estimate
    ? {
        ...estimate,
        source,
        originZoneId,
        destinationZoneId,
      }
    : null;
}
