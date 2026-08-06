import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";

/** Radius for resolving the origin's home municipality from the nearest hub. */
export const ORIGIN_AREA_RADIUS_KM = 20;

export function resolveOriginMunicipalityId(
  homeCoords: { lat: number; lng: number } | null | undefined,
  allDestinations: readonly Destination[],
): string | undefined {
  if (!homeCoords) return undefined;
  let best: { municipalityId: string; distanceKm: number } | undefined;
  for (const d of allDestinations) {
    if (d.role !== "hub" || !d.coordinates || !d.municipalityId) continue;
    const distanceKm = getDistance(
      homeCoords.lat,
      homeCoords.lng,
      d.coordinates.lat,
      d.coordinates.lng,
    );
    if (distanceKm > ORIGIN_AREA_RADIUS_KM) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = { municipalityId: d.municipalityId, distanceKm };
    }
  }
  return best?.municipalityId;
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
