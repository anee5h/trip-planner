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
 * Hard Locality & Local Access Guards:
 * - Runs ONLY for same-municipality trips (origin municipality === destination municipality).
 * - Honors destination.localAccessUnestimated (returns null when unestimated).
 * - Honors destination.localAccessModes (returns null when mode is unauthorized or train excluded).
 * - Honors context.publicModes (returns null when train is not in publicModes).
 * - Must NOT be used by canonical transport services, recommendation scoring, or budget policies.
 */
export function getLocalDiscoveryDisplayEstimate(
  destination: Destination,
  context: LocalDisplayEstimateContext,
): LocalDisplayEstimate | null {
  const { homeStationCoords, carMode, publicModes, allDestinations } = context;

  // 1. Explicit unestimated local access check
  if (destination.localAccessUnestimated === true) {
    return null;
  }

  // 2. Coordinate check
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

  // 3. Municipality check
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

  // 4. Mode selection & localAccessModes authorization check
  const isCarUser = carMode === "my_car" || carMode === "rental";

  let modeToUse: "train" | "car" | null = null;

  if (isCarUser) {
    if (
      destination.localAccessModes &&
      destination.localAccessModes.length > 0
    ) {
      const allowsCar =
        carMode === "my_car"
          ? destination.localAccessModes.includes("my_car") ||
            destination.localAccessModes.includes("car")
          : destination.localAccessModes.includes("car");
      if (allowsCar) {
        modeToUse = "car";
      }
    } else {
      modeToUse = "car";
    }
  } else {
    const publicModesAllowTrain = !publicModes || publicModes.includes("train");
    const localAccessAllowsTrain =
      !destination.localAccessModes ||
      destination.localAccessModes.length === 0 ||
      destination.localAccessModes.includes("train");

    if (publicModesAllowTrain && localAccessAllowsTrain) {
      modeToUse = "train";
    }
  }

  if (!modeToUse) {
    return null;
  }

  // 5. Calculate local display estimate
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
