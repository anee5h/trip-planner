import type { Destination } from "@/shared/types/destination";
import { resolveOriginMunicipalityId } from "@/shared/services/recommendation/OriginAreaService";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { estimateBetween } from "@/shared/services/transport/TransportEstimator";

export interface LocalDisplayEstimate {
  mode: "train" | "car";
  timeRange: [number, number];
  source: "calculated_local_display";
}

export interface LocalDisplayEstimateContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  carMode?: string;
  publicModes?: string[];
  allDestinations?: readonly Destination[];
}

/**
 * Presentation-only helper for local nearby-discovery cards.
 *
 * Hard Locality Guard:
 * - Runs ONLY for same-municipality trips (origin municipality === destination municipality).
 * - Must NOT be used by canonical transport services, recommendation scoring, or budget policies.
 */
export function getLocalDiscoveryDisplayEstimate(
  destination: Destination,
  context: LocalDisplayEstimateContext,
): LocalDisplayEstimate | null {
  const { homeStationCoords, carMode, allDestinations } = context;

  // 1. Coordinate check
  if (
    !homeStationCoords ||
    typeof homeStationCoords.lat !== "number" ||
    typeof homeStationCoords.lng !== "number"
  ) {
    return null;
  }
  if (
    !destination.coordinates ||
    typeof destination.coordinates.lat !== "number" ||
    typeof destination.coordinates.lng !== "number"
  ) {
    return null;
  }

  // 2. Municipality check
  const destMunicipalityId = destination.municipalityId?.trim();
  if (!destMunicipalityId) {
    return null;
  }

  const catalog =
    allDestinations ?? (getDestinationList("en") as Destination[]);
  const originMunicipalityId = resolveOriginMunicipalityId(
    homeStationCoords,
    catalog,
  );
  if (!originMunicipalityId || originMunicipalityId !== destMunicipalityId) {
    return null;
  }

  // 3. Mode selection (strictly typed)
  const modeToUse: "train" | "car" =
    carMode === "my_car" || carMode === "rental" ? "car" : "train";

  // 4. Calculate local display estimate
  const calc = estimateBetween(
    { coordinates: homeStationCoords },
    { coordinates: destination.coordinates },
    modeToUse,
  );

  if (!calc || !calc.available) {
    return null;
  }

  return {
    mode: modeToUse,
    timeRange: calc.timeRange,
    source: "calculated_local_display",
  };
}
