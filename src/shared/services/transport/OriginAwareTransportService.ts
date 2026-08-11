import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext, TransportMode } from "./types";
import {
  getGroundRoute,
  getMunicipalityGroundRoute,
} from "./GroundRouteEstimator";
import {
  BUS_ARRIVAL_RADIUS_KM,
  getBusRoute,
  MUNICIPALITY_BUS_SLUG,
  resolveBusTerminalSlugs,
  type BusRouteEstimate,
} from "./BusRouteEstimator";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";
import { getFerryTransportEstimate } from "./FerryTransportEstimator";
import {
  resolveDestinationTransportZone,
  topology,
  zoneById,
} from "./TransportTopologyService";
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
  fare?: [number, number | null] | null;
  /** Fare behavior: fixed / range / variable / dynamic (bus policy §3);
   *  null when no fare is stored. */
  fareVariability?: "fixed" | "range" | "variable" | "dynamic" | null;
  /**
   * What the fare buys: seat product and fare basis (FARE_POLICY §0/§2).
   * Only present together with a fare — a basis without a price implies a
   * product that has no verified fare.
   */
  fareBasis?:
    "base" | "base-plus-lex" | "integrated-total" | "non-reserved" | "reserved";
  /** Supports the fare range specifically, when distinct from route source. */
  fareSourceUrl?: string;
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
  // Ground corridors are prefecture/municipality-pair claims. They are only
  // valid when the destination's transport zone is actually reachable by
  // this mode: an island/remote zone (Sado, Yakushima, Amami, Tomogashima,
  // Ogasawara…) must never inherit a mainland corridor just because its
  // prefecture has one — ferry/flight-dependent islands have no rail
  // (MODE_SEMANTICS §1, KAI-12). Zone reachability = localModes ∪ edge
  // modes (Hokkaido gets shinkansen via the honshu↔hokkaido edge; Shikoku
  // has no shinkansen edge). An unroutable/unknown zone yields no ground
  // corridor at all.
  const destinationZoneId = resolveDestinationTransportZone(destination);
  const destinationZone = zoneById.get(destinationZoneId);
  if (!destinationZone) return null;
  const zoneModes = new Set<TransportMode>(destinationZone.localModes);
  for (const edge of topology.edges) {
    if (edge.from === destinationZoneId || edge.to === destinationZoneId) {
      for (const edgeMode of edge.modes) zoneModes.add(edgeMode);
    }
  }
  if (!zoneModes.has(mode)) return null;

  if (mode === "bus") {
    const resolvedOrigin = context.homeStationCoords
      ? resolveOriginArea(context.homeStationCoords)
      : undefined;
    const originMunicipalityId =
      context.originMunicipalityId ?? resolvedOrigin?.municipalityId;
    if (!context.homeStationCoords && !originMunicipalityId) return null;
    if (!destination.coordinates && !destination.municipalityId) return null;
    // Slugs resolve by exact municipality wiring first, then by the 50 km
    // terminal catchment (KAI-12): a traveler near a terminal may use its
    // corridors, and a destination near the arrival terminal is reachable.
    // Access legs are not modeled — the corridor stays the verified fact.
    // Candidates are nearest-first; try them until a corridor matches (the
    // nearest terminal may serve different corridors than the next).
    const fromSlugs = context.homeStationCoords
      ? resolveBusTerminalSlugs(context.homeStationCoords, originMunicipalityId)
      : originMunicipalityId
        ? [MUNICIPALITY_BUS_SLUG[originMunicipalityId]]
        : [];
    const toSlugs = destination.coordinates
      ? resolveBusTerminalSlugs(
          destination.coordinates,
          destination.municipalityId,
          BUS_ARRIVAL_RADIUS_KM,
        )
      : destination.municipalityId
        ? [MUNICIPALITY_BUS_SLUG[destination.municipalityId]]
        : [];
    let route: BusRouteEstimate | null = null;
    for (const fromSlug of fromSlugs) {
      for (const toSlug of toSlugs) {
        route = getBusRoute(fromSlug, toSlug);
        if (route) break;
      }
      if (route) break;
    }
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
    fare: route.fare,
    fareBasis: route.fareBasis,
    fareSourceUrl: route.fareSourceUrl,
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
