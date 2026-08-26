import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import { getDistance } from "@/shared/utils/distance";
import { getSafeGroundEstimate } from "./SafeGroundEstimateService";

/**
 * This model is deliberately a fare envelope, not a route fare. The bands
 * cover audited ordinary local/conventional rail examples from JR East,
 * Osaka Metro, Tokyo Metro, and other operator fare tables. They are useful
 * only for a bounded local ground estimate; they do not claim a station pair
 * or promote a corridor fare to a complete journey.
 */
export const LOCAL_BOUNDED_FARE_SOURCE_URLS = [
  "https://www.jreast.co.jp/2026unchin-kaitei/assets/pdf/dentoku_yamate.pdf",
  "https://subway.osakametro.co.jp/en/guide/fare/fare/price.php",
  "https://www.tokyometro.jp/en/ticket/regular/index.html",
] as const;

export const LOCAL_BOUNDED_FARE_SCOPE = "local_bounded_estimate" as const;

export const MAX_LOCAL_BOUNDED_FARE_DISTANCE_KM = 50;

/**
 * Conservative adult one-way fare envelopes. Distance selects an envelope,
 * never a point price: operator, transfer, and access uncertainty remain in
 * the range. Keep this separate from TRANSPORT_PRICING_CONFIG heuristics,
 * which are not origin-aware and must not be used as provenance.
 */
export const LOCAL_BOUNDED_FARE_BANDS = [
  { maxDistanceKm: 5, fare: [150, 500] as [number, number] },
  { maxDistanceKm: 15, fare: [200, 800] as [number, number] },
  { maxDistanceKm: 30, fare: [300, 1200] as [number, number] },
  { maxDistanceKm: 50, fare: [450, 1800] as [number, number] },
] as const;

export interface LocalBoundedFareEstimate {
  timeRange: [number, number];
  fare: [number, number];
  fareScope: typeof LOCAL_BOUNDED_FARE_SCOPE;
  fareVariability: "range";
  fareSourceUrls: readonly string[];
  originZoneId?: TransportZoneId;
  destinationZoneId?: TransportZoneId;
}

/**
 * Returns a complete-origin/local-destination estimate only when the shared
 * safe ground-duration policy can already authorize the same train mode via
 * an explicit transport option.
 * Unsupported islands, explicit local-access gaps, missing coordinates, and
 * trips beyond 50 km remain unknown.
 */
export function getLocalBoundedRailFareEstimate(
  destination: Destination,
  context: {
    homeStationCoords?: { lat: number; lng: number } | null;
    originZoneId?: TransportZoneId;
  },
): LocalBoundedFareEstimate | null {
  if (!context.homeStationCoords || !destination.coordinates) return null;

  const duration = getSafeGroundEstimate(destination, {
    homeStationCoords: context.homeStationCoords,
    homeStationTransportZoneId: context.originZoneId,
    authorizedModes: ["train"],
  });
  if (!duration || duration.mode !== "train") return null;

  const distanceKm = getDistance(
    context.homeStationCoords.lat,
    context.homeStationCoords.lng,
    destination.coordinates.lat,
    destination.coordinates.lng,
  );
  if (
    !Number.isFinite(distanceKm) ||
    distanceKm < 0 ||
    distanceKm > MAX_LOCAL_BOUNDED_FARE_DISTANCE_KM
  ) {
    return null;
  }

  const band = LOCAL_BOUNDED_FARE_BANDS.find(
    (candidate) => distanceKm <= candidate.maxDistanceKm,
  );
  if (!band) return null;

  return {
    timeRange: duration.timeRange,
    fare: band.fare,
    fareScope: LOCAL_BOUNDED_FARE_SCOPE,
    fareVariability: "range",
    fareSourceUrls: LOCAL_BOUNDED_FARE_SOURCE_URLS,
    originZoneId: duration.originZoneId,
    destinationZoneId: duration.destinationZoneId,
  };
}
