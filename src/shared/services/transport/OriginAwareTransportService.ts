import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext, TransportMode } from "./types";
import {
  getGroundRoute,
  getMunicipalityGroundRoute,
} from "./GroundRouteEstimator";
import { getBusRoute, MUNICIPALITY_BUS_SLUG } from "./BusRouteEstimator";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";
import { getFerryTransportEstimate } from "./FerryTransportEstimator";
import { resolveDestinationTransportZone } from "./TransportTopologyService";
import { resolveOriginMunicipalityId } from "../recommendation/OriginAreaService";
import { getDestinationList } from "../destination/DestinationService";

export type OriginAwareEstimateSource =
  "verified_ground_route" | "verified_flight" | "verified_ferry";

export type TravelDurationEvidence = "verified" | "estimated" | "unknown";

export type EstimatedTransportEstimateSource =
  "calculated_local_display" | "calculated_ground_display";

/**
 * Canonical origin-aware transport estimate. Every consumer (travel fit,
 * ranking, budget, cards, roulette, destination details) must read durations
 * from this service — never from unprovenanced `transportOptions` values.
 */
export interface OriginAwareTransportEstimate {
  mode: TransportMode;
  timeRange: [number, number];
  source: OriginAwareEstimateSource;
  /** Explicit provenance for consumers that also accept bounded estimates. */
  evidence: "verified";
  originZoneId?: TransportZoneId;
  destinationZoneId?: TransportZoneId;
  sourceUrl?: string;
  checkedAt?: string;
  /** Verified one-way adult fare range [min, max] in JPY. For dynamic bus
   *  fares the upper bound may be null ("from ¥X") — a dynamic fare is
   *  never a fixed price. null = no verified standard fare (FARE_POLICY
   *  §3). Budget consumers must not treat an estimate without this field
   *  as having a verified fare. */
  fare?: [number, number] | null;
  /** Fare behavior: fixed / range / variable / dynamic (bus policy §3). */
  fareVariability?: "fixed" | "range" | "variable" | "dynamic";
}

/**
 * A bounded coordinate/local-ground duration. This is never a canonical
 * route fact and must not be used for fares or budget calculations.
 */
export interface EstimatedTransportEstimate {
  mode: TransportMode;
  timeRange: [number, number];
  source: EstimatedTransportEstimateSource;
  evidence: "estimated";
  originZoneId?: TransportZoneId;
  destinationZoneId?: TransportZoneId;
}

export type TravelDurationEstimate =
  OriginAwareTransportEstimate | EstimatedTransportEstimate;

export interface OriginAwareEstimateContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  /** Island-level topology zone of the origin, when known. */
  originZoneId?: TransportZoneId;
  /** Prefecture of the origin ("osaka"), derived from the confidently
   *  resolved origin municipality. Ground corridors are keyed on it. */
  originPrefecture?: string;
  /** Municipality of the origin ("Osaka:osaka"), for same-prefecture
   *  metro corridors. */
  originMunicipalityId?: string;
  ferryTemporal?: FerryTemporalContext;
}

let originAreaCache:
  | {
      key: string;
      municipalityId?: string;
      prefecture?: string;
    }
  | undefined;

/**
 * Resolves the origin municipality/prefecture from the home coordinates via
 * the same confidence-guarded nearest-hub resolution the pipeline uses.
 * `undefined` when the origin cannot be resolved confidently — ground
 * corridors then return no duration rather than guessing.
 */
function resolveOriginArea(homeStationCoords: { lat: number; lng: number }): {
  municipalityId?: string;
  prefecture?: string;
} {
  const key = `${homeStationCoords.lat.toFixed(4)},${homeStationCoords.lng.toFixed(4)}`;
  if (originAreaCache?.key === key) return originAreaCache;
  const municipalityId = resolveOriginMunicipalityId(
    homeStationCoords,
    getDestinationList("en") as Destination[],
  );
  originAreaCache = {
    key,
    municipalityId,
    prefecture: municipalityId?.split(":")[0]?.toLowerCase(),
  };
  return originAreaCache;
}

/**
 * Ground-mode registry lookup. Only train/shinkansen corridors carry
 * verified prefecture-pair durations; bus corridors are verified city-pair
 * facts (bus-routes.json) and resolve at municipality granularity only — a
 * prefecture-pair bus key would overgeneralize local/limousine service into
 * intercity availability (MODE_SEMANTICS §3).
 */
function getGroundEstimate(
  destination: Destination,
  context: OriginAwareEstimateContext,
  mode: "train" | "shinkansen" | "bus",
): OriginAwareTransportEstimate | null {
  if (mode === "bus") {
    const resolvedOrigin = context.homeStationCoords
      ? resolveOriginArea(context.homeStationCoords)
      : undefined;
    const originMunicipalityId =
      context.originMunicipalityId ?? resolvedOrigin?.municipalityId;
    if (!originMunicipalityId || !destination.municipalityId) return null;
    const fromSlug = MUNICIPALITY_BUS_SLUG[originMunicipalityId];
    const toSlug = MUNICIPALITY_BUS_SLUG[destination.municipalityId];
    if (!fromSlug || !toSlug) return null;
    const route = getBusRoute(fromSlug, toSlug);
    if (!route) return null;
    return {
      mode,
      timeRange: route.timeRange,
      source: "verified_ground_route",
      evidence: "verified",
      destinationZoneId: resolveDestinationTransportZone(destination),
      sourceUrl: route.sourceUrl,
      checkedAt: route.checkedAt,
      // Verified fare metadata rides along so budget consumers can prefer
      // it over duration heuristics (FARE_POLICY §3; consumed in #135).
      // Dynamic fares stay ranges with variability — never fixed truth.
      fare: route.fare,
      fareVariability: route.fareVariability,
    };
  }
  const resolvedOrigin = context.homeStationCoords
    ? resolveOriginArea(context.homeStationCoords)
    : undefined;
  const originPrefecture =
    context.originPrefecture ?? resolvedOrigin?.prefecture;
  const originMunicipalityId =
    context.originMunicipalityId ?? resolvedOrigin?.municipalityId;
  if (!originPrefecture) return null;
  const destinationPrefecture = (destination.prefecture ?? "")
    .trim()
    .toLowerCase();
  if (!destinationPrefecture) return null;
  // Same-prefecture trips resolve at municipality granularity (metro
  // corridors); cross-prefecture trips use the prefecture-pair registry.
  const route =
    originPrefecture === destinationPrefecture &&
    originMunicipalityId &&
    destination.municipalityId
      ? getMunicipalityGroundRoute(
          originMunicipalityId,
          destination.municipalityId,
          mode,
        )
      : getGroundRoute(originPrefecture, destinationPrefecture, mode);
  if (!route) return null;
  return {
    mode,
    timeRange: route.timeRange,
    source: "verified_ground_route",
    evidence: "verified",
    destinationZoneId: resolveDestinationTransportZone(destination),
    sourceUrl: route.sourceUrl,
    checkedAt: route.checkedAt,
  };
}

/**
 * Returns the fastest verified origin-aware estimate across the requested
 * modes, or null when no mode has a verified duration for this origin.
 * Never fabricates a duration from distance or generic speeds.
 */
export function getOriginAwareTransportEstimate(
  destination: Destination,
  context: OriginAwareEstimateContext,
  modes: readonly string[],
): OriginAwareTransportEstimate | null {
  let best: OriginAwareTransportEstimate | null = null;
  for (const mode of modes) {
    let estimate: OriginAwareTransportEstimate | null = null;
    if (mode === "flight") {
      const flight = getFlightTransportEstimate(
        destination,
        context.homeStationCoords ?? undefined,
        context.ferryTemporal?.travelDate,
      );
      if (flight) {
        estimate = {
          mode: "flight",
          timeRange: flight.timeRange,
          source: "verified_flight",
          evidence: "verified",
          originZoneId: context.originZoneId,
          destinationZoneId: resolveDestinationTransportZone(destination),
          sourceUrl: undefined,
        };
      }
    } else if (mode === "ferry") {
      const ferry = getFerryTransportEstimate(
        destination,
        context.homeStationCoords ?? undefined,
        context.ferryTemporal,
      );
      if (ferry) {
        estimate = {
          mode: "ferry",
          timeRange: ferry.timeRange,
          source: "verified_ferry",
          evidence: "verified",
          originZoneId: context.originZoneId,
          destinationZoneId: resolveDestinationTransportZone(destination),
        };
      }
    } else if (mode === "train" || mode === "shinkansen" || mode === "bus") {
      estimate = getGroundEstimate(destination, context, mode);
    }
    // car/my_car have no verified origin-aware durations.
    if (estimate && (!best || estimate.timeRange[0] < best.timeRange[0])) {
      best = estimate;
    }
  }
  return best;
}
