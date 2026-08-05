import L from "leaflet";

export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return L.latLng(lat1, lon1).distanceTo(L.latLng(lat2, lon2)) / 1000;
}
