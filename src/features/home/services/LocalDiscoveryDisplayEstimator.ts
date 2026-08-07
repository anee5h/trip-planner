import type { Destination } from "@/shared/types/destination";
import { resolveOriginMunicipalityId } from "@/shared/services/recommendation/OriginAreaService";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import { estimateBetween } from "@/shared/services/transport/TransportEstimator";

export interface LocalDisplayEstimate {
  mode: "train" | "car";
  timeRange: [number, number];
  source: "calculated_local_display" | "calculated_ground_display";
}

export interface LocalDisplayEstimateContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  carMode?: string;
  publicModes?: string[];
  allDestinations?: readonly Destination[];
}

/** Mainland zones that support ground transport (train/car). */
const GROUND_ZONES = new Set([
  "mainland-honshu",
  "mainland-kyushu",
  "mainland-shikoku",
  "hokkaido",
]);

/**
 * Safe ground-movement zone check: returns true when both origin and
 * destination zones support ground transport AND are the same zone
 * (within-zone) or connected by a non-ferry/non-flight edge.
 * Honshu ↔ Kyushu / Shikoku are connected; Hokkaido ↔ Honshu as well.
 */
function isGroundReachable(originZone: string, destZone: string): boolean {
  if (!GROUND_ZONES.has(originZone) || !GROUND_ZONES.has(destZone)) {
    return false;
  }
  // Same mainland zone: always reachable by ground.
  if (originZone === destZone) return true;
  // Connected mainland pairs (all currently have edges).
  const connected = new Set([
    "mainland-honshu",
    "mainland-kyushu",
    "mainland-shikoku",
    "hokkaido",
  ]);
  return connected.has(originZone) && connected.has(destZone);
}

/**
 * Presentation-only display estimator for Home rail cards.
 *
 * Hierarchy (first match wins):
 * 1. Same-municipality local estimate → Est. (most accurate for nearby)
 * 2. Mainland ground estimate where origin/dest zones support it → Est.
 * 3. Otherwise null → card shows generic "Travel"
 *
 * Guards:
 * - localAccessUnestimated → null
 * - localAccessModes honored (car/train authorization)
 * - User publicModes honored
 * - Islands without ground access → null (must have verified route)
 * - No mainland train to Okinawa/Ogasawara/remote islands
 * - Must NOT be used by canonical transport, recommendations, or budget.
 */
export function getSafeDisplayEstimate(
  destination: Destination,
  context: LocalDisplayEstimateContext,
): LocalDisplayEstimate | null {
  const { homeStationCoords, carMode, publicModes } = context;

  // Guard: explicit unestimated
  if (destination.localAccessUnestimated === true) return null;

  // Guard: coordinates required
  if (
    !homeStationCoords ||
    typeof homeStationCoords.lat !== "number" ||
    typeof homeStationCoords.lng !== "number" ||
    !destination.coordinates ||
    typeof destination.coordinates.lat !== "number" ||
    typeof destination.coordinates.lng !== "number"
  ) {
    return null;
  }

  const catalog =
    context.allDestinations ?? (getDestinationList("en") as Destination[]);

  // Determine mode: car user vs public transport
  const isCarUser = carMode === "my_car" || carMode === "rental";
  const publicModesAllowTrain =
    !publicModes || publicModes.length === 0 || publicModes.includes("train");

  // Resolve municipality for same-muni check
  const destMunicipalityId = destination.municipalityId?.trim();
  const originMunicipalityId = resolveOriginMunicipalityId(
    homeStationCoords,
    catalog,
  );
  const sameMuni =
    Boolean(destMunicipalityId) && originMunicipalityId === destMunicipalityId;

  // Resolve zones for mainland ground check
  const destZone = resolveDestinationTransportZone(destination);
  const originZone = resolveOriginTransportZone({
    coordinates: homeStationCoords,
    label: "",
  });
  const canUseGround = !sameMuni && isGroundReachable(originZone, destZone);

  // If neither same-muni nor ground reachable, no estimate
  if (!sameMuni && !canUseGround) return null;

  // Mode selection with localAccessModes authorization
  let modeToUse: "train" | "car" | null = null;

  const localAccessModes = destination.localAccessModes;
  const hasLocalAccessModes = localAccessModes && localAccessModes.length > 0;

  if (isCarUser) {
    if (hasLocalAccessModes) {
      const allowsCar =
        carMode === "my_car"
          ? localAccessModes.includes("my_car") ||
            localAccessModes.includes("car")
          : localAccessModes.includes("car");
      if (allowsCar) modeToUse = "car";
    } else {
      modeToUse = "car";
    }
  } else {
    const localAccessAllowsTrain =
      !hasLocalAccessModes || localAccessModes.includes("train");
    if (publicModesAllowTrain && localAccessAllowsTrain) {
      modeToUse = "train";
    }
  }

  if (!modeToUse) return null;

  // Calculate estimate
  const calc = estimateBetween(
    { coordinates: homeStationCoords },
    { coordinates: destination.coordinates },
    modeToUse,
  );

  if (!calc || !calc.available) return null;

  return {
    mode: modeToUse,
    timeRange: calc.timeRange,
    source: sameMuni ? "calculated_local_display" : "calculated_ground_display",
  };
}

// Keep backward compat alias
export { getSafeDisplayEstimate as getLocalDiscoveryDisplayEstimate };
