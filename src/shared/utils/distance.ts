const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres (haversine formula, Earth radius
 * 6371 km — the same formula Leaflet's LatLng.distanceTo uses).
 *
 * Pure implementation: this module used to import the whole Leaflet library
 * for one distance call, which dragged ~250 KB into every chunk that touched
 * the shared utils bundle (including the homepage).
 */
export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
