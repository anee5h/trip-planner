import type { Destination } from "@/shared/types/destination";
import { resolveOriginMunicipalityId } from "@/shared/services/recommendation/OriginAreaService";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { resolveOriginTransportZone } from "@/shared/services/transport/TransportTopologyService";
import { estimateBetween } from "@/shared/services/transport/TransportEstimator";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";

export interface LocalDisplayEstimate {
  mode: "train" | "shinkansen" | "bus" | "car";
  timeRange: [number, number];
  source: "calculated_local_display" | "calculated_ground_display";
}

export interface LocalDisplayEstimateContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  homeStationTransportZoneId?: string;
  carMode?: string;
  publicModes?: string[];
  allDestinations?: readonly Destination[];
}

/** Ground modes that can be estimated with coordinate-based distance. */
const ESTIMATABLE_MODES = new Set([
  "train",
  "shinkansen",
  "bus",
  "car",
  "my_car",
]);

function pickFastestEstimated(
  coords: { lat: number; lng: number },
  destCoords: { lat: number; lng: number },
  modes: string[],
): {
  mode: "train" | "shinkansen" | "bus" | "car";
  timeRange: [number, number];
} | null {
  let best: {
    mode: "train" | "shinkansen" | "bus" | "car";
    timeRange: [number, number];
  } | null = null;
  for (const m of modes) {
    // Normalise my_car → car for the estimator
    const estimatorMode = m === "my_car" ? "car" : m;
    if (!ESTIMATABLE_MODES.has(m)) continue;
    const calc = estimateBetween(
      { coordinates: coords },
      { coordinates: destCoords },
      estimatorMode as "train" | "shinkansen" | "bus" | "car",
    );
    if (!calc || !calc.available) continue;
    const midpoint = (calc.timeRange[0] + calc.timeRange[1]) / 2;
    if (!best || midpoint < (best.timeRange[0] + best.timeRange[1]) / 2) {
      best = {
        mode: estimatorMode as "train" | "shinkansen" | "bus" | "car",
        timeRange: calc.timeRange as [number, number],
      };
    }
  }
  return best;
}

/**
 * Presentation-only display estimator for Home rail cards.
 *
 * Hierarchy:
 * 1. Verified canonical route (via getFastestPreferredTransport) → exact
 * 2. Same-municipality → Est. local
 * 3. Mainland ground authorized by topology → Est. ground
 * 4. Otherwise → null (card shows generic "Travel")
 *
 * Strictly layer-separated:
 * - Mode AUTHORIZATION: canonical getValidModes() (topology + destination + user)
 * - Mode DURATION: estimateBetween() (coordinate distance × speed)
 * - Never feed this into recommendation scoring or budget.
 * - Never use destination.transportOptions numeric values as travel duration.
 */
export function getSafeDisplayEstimate(
  destination: Destination,
  context: LocalDisplayEstimateContext,
): LocalDisplayEstimate | null {
  const {
    homeStationCoords,
    homeStationTransportZoneId,
    carMode = "none",
    publicModes,
  } = context;

  // Absolute guard: explicitly unestimated
  if (destination.localAccessUnestimated === true) return null;

  // Coordinates required
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

  // Resolve municipality for same-muni check
  const destMunicipalityId = destination.municipalityId?.trim();
  const originMunicipalityId = resolveOriginMunicipalityId(
    homeStationCoords,
    catalog,
  );
  const sameMuni =
    Boolean(destMunicipalityId) && originMunicipalityId === destMunicipalityId;

  // Resolve origin zone: prefer passed transportZoneId, fall back to coords
  const originZoneId =
    homeStationTransportZoneId ??
    resolveOriginTransportZone({ coordinates: homeStationCoords });

  // Authorize modes via canonical topology
  const authorizedModes = getValidModes(
    destination,
    carMode,
    publicModes ?? ["train", "shinkansen", "bus", "flight", "ferry"],
    homeStationCoords,
    undefined,
    originZoneId && originZoneId !== "unknown"
      ? (originZoneId as Parameters<typeof getValidModes>[5])
      : undefined,
  );

  // Filter to estimatable ground modes only (never flight/ferry)
  const groundModes = authorizedModes.filter((m) => ESTIMATABLE_MODES.has(m));

  if (groundModes.length === 0) return null;

  // For same-municipality, also check localAccessModes authorization
  if (sameMuni) {
    const localAccess = destination.localAccessModes;
    if (localAccess && localAccess.length > 0) {
      const carUser = carMode === "my_car" || carMode === "rental";
      if (carUser) {
        const carModeKey = carMode === "my_car" ? "my_car" : "car";
        if (
          !localAccess.includes(carModeKey as any) &&
          !localAccess.includes("car" as any)
        ) {
          return null;
        }
      } else {
        const trainsOk = groundModes.some(
          (m) => m === "train" || m === "shinkansen",
        );
        if (!localAccess.includes("train" as any) && trainsOk) {
          // Filter groundModes to only what localAccess allows
          const allowed = groundModes.filter((m) =>
            localAccess.includes(m as any),
          );
          if (allowed.length === 0) return null;
        }
      }
    }

    const best = pickFastestEstimated(
      homeStationCoords,
      destination.coordinates,
      groundModes,
    );
    if (!best) return null;
    return {
      mode: best.mode,
      timeRange: best.timeRange,
      source: "calculated_local_display",
    };
  }

  // Cross-municipality: only if topology authorized (getValidModes() already did)
  // Additional guard: must be a mainland reachable destination
  // getValidModes() already handles island exclusion via topology zones/edges

  const best = pickFastestEstimated(
    homeStationCoords,
    destination.coordinates,
    groundModes,
  );
  if (!best) return null;

  return {
    mode: best.mode,
    timeRange: best.timeRange,
    source: "calculated_ground_display",
  };
}

// Backward-compat alias
export { getSafeDisplayEstimate as getLocalDiscoveryDisplayEstimate };
