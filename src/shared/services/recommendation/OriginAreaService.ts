import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";

/** Radius for resolving the origin's home municipality from the nearest hub. */
export const ORIGIN_AREA_RADIUS_KM = 20;

/**
 * A municipality resolution is only trusted when its hub clearly dominates
 * the next nearest municipality's hub. Boundary stations whose two closest
 * ward/city hubs are nearly equidistant resolve to `undefined` instead of
 * guessing — the caller then applies no same-municipality exclusion.
 * Gap rule: nextMuniKm - winnerKm >= max(GAP_KM, winnerKm / 2).
 */
export const ORIGIN_AREA_MIN_GAP_KM = 1.0;

interface HubCandidate {
  municipalityId: string;
  distanceKm: number;
}

/**
 * Resolves the origin's municipality from the nearest hub per municipality
 * within ORIGIN_AREA_RADIUS_KM. Returns `undefined` when:
 * - no home coordinates are provided,
 * - no hub is within the radius, or
 * - the nearest hub is not confidently dominant (see gap rule) — the safe
 *   fallback is to skip the origin-local exclusion entirely.
 */
export function resolveOriginMunicipalityId(
  homeCoords: { lat: number; lng: number } | null | undefined,
  allDestinations: readonly Destination[],
): string | undefined {
  if (!homeCoords) return undefined;

  // Nearest hub per municipality.
  const nearestByMuni = new Map<string, number>();
  for (const d of allDestinations) {
    if (d.role !== "hub" || !d.coordinates || !d.municipalityId) continue;
    const distanceKm = getDistance(
      homeCoords.lat,
      homeCoords.lng,
      d.coordinates.lat,
      d.coordinates.lng,
    );
    if (distanceKm > ORIGIN_AREA_RADIUS_KM) continue;
    const current = nearestByMuni.get(d.municipalityId);
    if (current === undefined || distanceKm < current) {
      nearestByMuni.set(d.municipalityId, distanceKm);
    }
  }
  if (nearestByMuni.size === 0) return undefined;

  let best: HubCandidate | undefined;
  let runnerUp = Infinity;
  for (const [municipalityId, distanceKm] of nearestByMuni) {
    if (!best || distanceKm < best.distanceKm) {
      runnerUp = best ? best.distanceKm : runnerUp;
      best = { municipalityId, distanceKm };
    } else if (distanceKm < runnerUp) {
      runnerUp = distanceKm;
    }
  }
  if (!best) return undefined;

  const gap = runnerUp - best.distanceKm;
  const requiredGap = Math.max(ORIGIN_AREA_MIN_GAP_KM, best.distanceKm / 2);
  if (gap < requiredGap) return undefined;
  return best.municipalityId;
}

export function isOriginLocalDestination(
  destination: Destination,
  originMunicipalityId: string | undefined,
): boolean {
  return (
    originMunicipalityId !== undefined &&
    destination.municipalityId === originMunicipalityId
  );
}
