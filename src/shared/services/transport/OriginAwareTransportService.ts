import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext, TransportMode } from "./types";
import {
  getGroundRoute,
  getMunicipalityGroundRoute,
  MUNICIPALITY_SHINKANSEN_HUB_IDS,
  SHINKANSEN_ACCESS_HUBS,
  SHINKANSEN_ACCESS_RADIUS_KM,
  SHINKANSEN_ARRIVAL_RADIUS_KM,
  type GroundRouteEstimate,
} from "./GroundRouteEstimator";
import {
  BUS_ACCESS_HUBS,
  BUS_ACCESS_RADIUS_KM,
  BUS_ARRIVAL_RADIUS_KM,
  getBusRoute,
  MUNICIPALITY_BUS_SLUG,
  type BusRouteEstimate,
} from "./BusRouteEstimator";
import {
  resolveNearbyAccessHubs,
  type ResolvedIntercityAccessHub,
} from "./IntercityAccessHubResolver";
import { estimateBetween } from "./TransportEstimator";
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
  /** Evidence for the complete origin-to-destination duration. */
  evidence: "verified" | "estimated";
  /** The intercity corridor remains verified when access is estimated. */
  corridorEvidence?: "verified";
  /** Straight-line access distances used only to derive bounded time overhead. */
  accessDistanceKm?: { origin?: number; destination?: number };
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

function applyAccessOverhead(
  corridorTimeRange: [number, number],
  originHub: ResolvedIntercityAccessHub | undefined,
  destinationHub: ResolvedIntercityAccessHub | undefined,
  originLocation: { lat: number; lng: number } | undefined,
  destinationLocation: { lat: number; lng: number } | undefined,
): {
  timeRange: [number, number];
  evidence: "verified" | "estimated";
  accessDistanceKm?: { origin?: number; destination?: number };
} {
  // Future ticket: replace this bounded assumption with explicit feeder legs,
  // transfer time, feeder mode, and combined fare/duration display. This PR
  // intentionally keeps those multimodal itinerary semantics out of scope.
  let min = corridorTimeRange[0];
  let max = corridorTimeRange[1];
  let usedCatchment = false;
  const accessDistanceKm: { origin?: number; destination?: number } = {};

  const addAccess = (
    side: "origin" | "destination",
    hub: ResolvedIntercityAccessHub | undefined,
    location: { lat: number; lng: number } | undefined,
  ) => {
    if (!hub?.usedCatchment || !location) return;
    const access = estimateBetween(
      { coordinates: location },
      { coordinates: hub.hub.coordinates },
      // The feeder mode is deliberately not modeled. Bus-shaped local
      // estimation is only a conservative time bound; its fare is discarded.
      "bus",
    ).timeRange;
    min += access[0];
    max += access[1];
    usedCatchment = true;
    accessDistanceKm[side] = hub.distanceKm;
  };

  addAccess("origin", originHub, originLocation);
  addAccess("destination", destinationHub, destinationLocation);

  return {
    timeRange: [min, max],
    evidence: usedCatchment ? "estimated" : "verified",
    ...(usedCatchment ? { accessDistanceKm } : {}),
  };
}

function resolveExactHubIds(
  municipalityId: string | undefined,
  mapping: Record<string, string | string[]>,
): string[] {
  if (!municipalityId) return [];
  const mapped = mapping[municipalityId];
  return mapped ? (Array.isArray(mapped) ? mapped : [mapped]) : [];
}

/**
 * Ground-mode registry lookup. Conventional train corridors carry verified
 * prefecture-pair durations; Shinkansen uses the curated physical
 * access-hub registry. Bus corridors are verified city-pair facts
 * (bus-routes.json) and resolve at municipality granularity only — a
 * prefecture-pair bus key would overgeneralize local/limousine service into
 * intercity availability (MODE_SEMANTICS §3). Neither access radius can
 * create a corridor without a registry row.
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
    const fromHubs = resolveNearbyAccessHubs({
      location: context.homeStationCoords,
      mode: "bus",
      hubs: BUS_ACCESS_HUBS,
      exactHubIds: resolveExactHubIds(
        originMunicipalityId,
        MUNICIPALITY_BUS_SLUG,
      ),
      radiusKm: BUS_ACCESS_RADIUS_KM,
      transportZoneId: context.originZoneId,
    });
    const toHubs = resolveNearbyAccessHubs({
      location: destination.coordinates,
      mode: "bus",
      hubs: BUS_ACCESS_HUBS,
      exactHubIds: resolveExactHubIds(
        destination.municipalityId,
        MUNICIPALITY_BUS_SLUG,
      ),
      radiusKm: BUS_ARRIVAL_RADIUS_KM,
      transportZoneId: destinationZoneId,
    });
    let selected:
      | {
          route: BusRouteEstimate;
          fromHub: ResolvedIntercityAccessHub;
          destinationHub: ResolvedIntercityAccessHub;
        }
      | undefined;
    for (const fromHub of fromHubs) {
      for (const destinationHub of toHubs) {
        const route = getBusRoute(
          fromHub.hub.corridorEndpoint,
          destinationHub.hub.corridorEndpoint,
        );
        if (route) {
          selected = { route, fromHub, destinationHub };
          break;
        }
      }
      if (selected) break;
    }
    if (!selected) return null;
    const adjusted = applyAccessOverhead(
      selected.route.timeRange,
      selected.fromHub,
      selected.destinationHub,
      context.homeStationCoords ?? undefined,
      destination.coordinates,
    );
    return {
      mode,
      timeRange: adjusted.timeRange,
      source: "verified_ground_route",
      evidence: adjusted.evidence,
      corridorEvidence: "verified",
      accessDistanceKm: adjusted.accessDistanceKm,
      originZoneId: context.originZoneId,
      destinationZoneId,
      sourceUrl: selected.route.sourceUrl,
      checkedAt: selected.route.checkedAt,
      // Verified fare metadata rides along so budget consumers can prefer
      // the intercity corridor fare (access fare is deliberately not modeled).
      // Dynamic fares stay ranges with variability — never fixed truth.
      fare: selected.route.fare,
      fareVariability: selected.route.fareVariability,
    };
  }
  if (mode === "shinkansen") {
    const resolvedOrigin = context.homeStationCoords
      ? resolveOriginArea(context.homeStationCoords)
      : undefined;
    const originMunicipalityId =
      context.originMunicipalityId ?? resolvedOrigin?.municipalityId;
    const fromHubIds = resolveExactHubIds(
      originMunicipalityId,
      MUNICIPALITY_SHINKANSEN_HUB_IDS,
    );
    const toHubIds = resolveExactHubIds(
      destination.municipalityId,
      MUNICIPALITY_SHINKANSEN_HUB_IDS,
    );
    const canResolveAccessHubs =
      Boolean(context.homeStationCoords || fromHubIds.length > 0) &&
      Boolean(destination.coordinates || toHubIds.length > 0);

    if (canResolveAccessHubs) {
      const fromHubs = resolveNearbyAccessHubs({
        location: context.homeStationCoords,
        mode: "shinkansen",
        hubs: SHINKANSEN_ACCESS_HUBS,
        exactHubIds: fromHubIds,
        radiusKm: SHINKANSEN_ACCESS_RADIUS_KM,
        transportZoneId: context.originZoneId,
      });
      const toHubs = resolveNearbyAccessHubs({
        location: destination.coordinates,
        mode: "shinkansen",
        hubs: SHINKANSEN_ACCESS_HUBS,
        exactHubIds: toHubIds,
        radiusKm: SHINKANSEN_ARRIVAL_RADIUS_KM,
        transportZoneId: destinationZoneId,
      });
      let selected:
        | {
            route: GroundRouteEstimate;
            fromHub: ResolvedIntercityAccessHub;
            destinationHub: ResolvedIntercityAccessHub;
          }
        | undefined;
      for (const fromHub of fromHubs) {
        for (const destinationHub of toHubs) {
          const route = getGroundRoute(
            fromHub.hub.corridorEndpoint,
            destinationHub.hub.corridorEndpoint,
            mode,
          );
          if (route) {
            selected = { route, fromHub, destinationHub };
            break;
          }
        }
        if (selected) break;
      }
      if (!selected) return null;
      const adjusted = applyAccessOverhead(
        selected.route.timeRange,
        selected.fromHub,
        selected.destinationHub,
        context.homeStationCoords ?? undefined,
        destination.coordinates,
      );
      return {
        mode,
        timeRange: adjusted.timeRange,
        source: "verified_ground_route",
        evidence: adjusted.evidence,
        corridorEvidence: "verified",
        accessDistanceKm: adjusted.accessDistanceKm,
        originZoneId: context.originZoneId,
        destinationZoneId,
        sourceUrl: selected.route.sourceUrl,
        checkedAt: selected.route.checkedAt,
        fare: selected.route.fare,
        fareBasis: selected.route.fareBasis,
        fareSourceUrl: selected.route.fareSourceUrl,
      };
    }

    // A physical boarding/arrival hub is required for personalized
    // Shinkansen access. A prefecture pair alone cannot prove that the user's
    // location reaches the represented station.
    return null;
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
    originZoneId: context.originZoneId,
    destinationZoneId,
    sourceUrl: route.sourceUrl,
    checkedAt: route.checkedAt,
    fare: route.fare,
    fareBasis: route.fareBasis,
    fareSourceUrl: route.fareSourceUrl,
  };
}

/**
 * Returns the fastest canonical origin-aware estimate across the requested
 * modes. A catchment-adjusted result is bounded/estimated for the complete
 * journey while retaining verified corridor provenance.
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
