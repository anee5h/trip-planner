import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type {
  FerryTemporalContext,
  TransportFareScope,
  TransportMode,
} from "./types";
import { getDistanceKm } from "./TransportEstimator";
import {
  getGroundRoute,
  getMunicipalityGroundRoute,
  MUNICIPALITY_SHINKANSEN_HUB_IDS,
  SHINKANSEN_ACCESS_HUBS,
  SHINKANSEN_ACCESS_RADIUS_KM,
  SHINKANSEN_ARRIVAL_RADIUS_KM,
} from "./GroundRouteEstimator";
import {
  BUS_ACCESS_HUBS,
  BUS_ACCESS_RADIUS_KM,
  BUS_ARRIVAL_RADIUS_KM,
  BUS_DESTINATION_ACCESS_HUBS,
  DESTINATION_BUS_SLUG,
  getBusRoutes,
  MUNICIPALITY_BUS_SLUG,
} from "./BusRouteEstimator";
import {
  resolveNearbyAccessHubs,
  type ResolvedIntercityAccessHub,
} from "./IntercityAccessHubResolver";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";
import { getFerryTransportEstimate } from "./FerryTransportEstimator";
import {
  getLocalBoundedRailFareEstimate,
  LOCAL_BOUNDED_FARE_SOURCE_URLS,
} from "./LocalBoundedFareEstimator";
import {
  resolveDestinationTransportZone,
  topology,
  zoneById,
} from "./TransportTopologyService";
import { resolveOriginMunicipalityId } from "../recommendation/OriginAreaService";
import { getDestinationList } from "../destination/DestinationService";

export type OriginAwareEstimateSource =
  | "verified_ground_route"
  | "verified_flight"
  | "verified_ferry"
  | "calculated_local_bounded_estimate";

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
  /** Evidence for the fare itself, independent of door-to-door duration. */
  fareEvidence?: TravelDurationEvidence;
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
  /** Bus-only operating window of the corridor product (KAI-66). A
   *  night-only coach must not make a same-day day trip feasible. */
  servicePeriod?: "day" | "night" | "mixed";
  /** Verified bus product metadata, retained so route evidence remains
   *  visible to recommendation and planning consumers. */
  serviceName?: string;
  operator?: string;
  reservationRequired?: boolean;
  departureAirportCode?: string;
  departureAirportName?: string;
  arrivalAirportCode?: string;
  arrivalAirportName?: string;
  departurePortName?: string;
  arrivalPortName?: string;
  notes?: string;
  /**
   * What the fare buys: seat product and fare basis (FARE_POLICY §0/§2).
   * Only present together with a fare — a basis without a price implies a
   * product that has no verified fare.
   */
  fareBasis?:
    | "base"
    | "base-plus-lex"
    | "integrated-total"
    | "non-reserved"
    | "reserved"
    | "one-way"
    | "round-trip";
  /** Supports the fare range specifically, when distinct from route source. */
  fareSourceUrl?: string;
  /** Supports a bounded local fare envelope assembled from operator tables. */
  fareSourceUrls?: readonly string[];
  /** Explicit fare scope; absent on older verified route records. */
  fareScope?: TransportFareScope;
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
 * Bounded origin/destination access time (minutes) to an intercity hub,
 * derived from the straight-line distance. This is deliberately NOT a
 * feeder-mode claim: it models no explicit mode, creates no corridor, and
 * carries no fare. ~45 km/h average with a fixed walk/wait base is a
 * conservative urban transit bound — it overstates short distances only
 * slightly and keeps long access conservative for day-trip feasibility.
 */
export function estimateHubAccessMinutes(distanceKm: number): [number, number] {
  const min = Math.round(10 + (Math.max(0, distanceKm) / 45) * 60);
  const max = Math.round(min * 1.25 + 5);
  return [min, max];
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
  let accessUsed = false;
  let corridorStationMismatch = false;
  const accessDistanceKm: { origin?: number; destination?: number } = {};

  const addAccess = (
    side: "origin" | "destination",
    hub: ResolvedIntercityAccessHub | undefined,
    location: { lat: number; lng: number } | undefined,
  ) => {
    if (!hub) return;
    // A physical station that shares a prefecture-keyed corridor endpoint
    // (e.g. Omiya/Shinagawa for `tokyo`) cannot claim the endpoint's exact
    // verified duration/fare as its own product (KAI-12). The corridor stays
    // verified; the complete journey becomes estimated without inventing a
    // station-specific time.
    if (hub.hub.isCanonicalCorridorStation === false)
      corridorStationMismatch = true;
    if (!hub.usedCatchment || !location) return;
    const access = estimateHubAccessMinutes(hub.distanceKm);
    min += access[0];
    max += access[1];
    accessUsed = true;
    accessDistanceKm[side] = hub.distanceKm;
  };

  addAccess("origin", originHub, originLocation);
  addAccess("destination", destinationHub, destinationLocation);

  return {
    timeRange: [min, max],
    evidence: accessUsed || corridorStationMismatch ? "estimated" : "verified",
    ...(accessUsed ? { accessDistanceKm } : {}),
  };
}

function accessMinutesFor(
  hub: ResolvedIntercityAccessHub,
  location: { lat: number; lng: number } | undefined,
): [number, number] | null {
  if (!hub.usedCatchment || !location) return null;
  return estimateHubAccessMinutes(hub.distanceKm);
}

/**
 * Evaluates every (origin hub, destination hub, corridor row) combination
 * and selects the best defensible route. The score is corridor midpoint +
 * bounded origin access + bounded destination access, so a slightly farther
 * hub with a much faster corridor beats a nearer hub with a slow one. Each
 * candidate keeps its own duration and fare together — duration from route A
 * is never mixed with the fare from route B.
 */
function selectGroundCandidate<
  T extends { timeRange: [number, number] },
>(options: {
  fromHubs: readonly ResolvedIntercityAccessHub[];
  toHubs: readonly ResolvedIntercityAccessHub[];
  originLocation?: { lat: number; lng: number };
  destinationLocation?: { lat: number; lng: number };
  routesFor: (fromEndpoint: string, toEndpoint: string) => readonly T[];
}): {
  route: T;
  fromHub: ResolvedIntercityAccessHub;
  destinationHub: ResolvedIntercityAccessHub;
} | null {
  let best:
    | {
        route: T;
        fromHub: ResolvedIntercityAccessHub;
        destinationHub: ResolvedIntercityAccessHub;
        score: number;
      }
    | undefined;
  for (const fromHub of options.fromHubs) {
    // A boarding hub materially farther from home than the destination
    // itself means the corridor is being reversed: the trip would detour
    // past the destination to board (e.g. a Sendai resident "boarding" the
    // Sendai↔Yamagata coach at the Yamagata terminal to reach a Sendai-area
    // destination). Such a candidate is never a defensible journey.
    if (
      options.originLocation &&
      options.destinationLocation &&
      fromHub.distanceKm >
        getDistanceKm(
          options.originLocation.lat,
          options.originLocation.lng,
          options.destinationLocation.lat,
          options.destinationLocation.lng,
        )
    ) {
      continue;
    }
    for (const destinationHub of options.toHubs) {
      // The arrival hub must not lie farther from the destination than the
      // boarding hub does: otherwise the corridor runs past the destination
      // and the trip doubles back (e.g. an Osaka-area destination "served"
      // by riding the Osaka↔Kobe corridor to Shin-Kobe and returning 27 km).
      if (
        options.originLocation &&
        options.destinationLocation &&
        destinationHub.distanceKm >
          getDistanceKm(
            options.destinationLocation.lat,
            options.destinationLocation.lng,
            fromHub.hub.coordinates.lat,
            fromHub.hub.coordinates.lng,
          )
      ) {
        continue;
      }
      const routes = options.routesFor(
        fromHub.hub.corridorEndpoint,
        destinationHub.hub.corridorEndpoint,
      );
      for (const route of routes) {
        const corridorMidpoint = (route.timeRange[0] + route.timeRange[1]) / 2;
        const originAccess = accessMinutesFor(fromHub, options.originLocation);
        const destinationAccess = accessMinutesFor(
          destinationHub,
          options.destinationLocation,
        );
        const score =
          corridorMidpoint +
          (originAccess?.[0] ?? 0) +
          (destinationAccess?.[0] ?? 0);
        if (!best || score < best.score) {
          best = { route, fromHub, destinationHub, score };
        }
      }
    }
  }
  return best
    ? {
        route: best.route,
        fromHub: best.fromHub,
        destinationHub: best.destinationHub,
      }
    : null;
}

function resolveExactHubIds(
  municipalityId: string | undefined,
  mapping: Record<string, string | string[]>,
): string[] {
  if (!municipalityId) return [];
  const mapped = mapping[municipalityId];
  return mapped ? (Array.isArray(mapped) ? mapped : [mapped]) : [];
}

function getLocalBoundedOriginAwareEstimate(
  destination: Destination,
  context: OriginAwareEstimateContext,
  destinationZoneId: TransportZoneId,
): OriginAwareTransportEstimate | null {
  const local = getLocalBoundedRailFareEstimate(destination, {
    homeStationCoords: context.homeStationCoords,
    originZoneId: context.originZoneId,
  });
  if (!local) return null;
  return {
    mode: "train",
    timeRange: local.timeRange,
    source: "calculated_local_bounded_estimate",
    evidence: "estimated",
    fareEvidence: local.fare ? "estimated" : "unknown",
    originZoneId: local.originZoneId ?? context.originZoneId,
    destinationZoneId: local.destinationZoneId ?? destinationZoneId,
    fare: local.fare,
    fareVariability: local.fareVariability,
    fareSourceUrl: LOCAL_BOUNDED_FARE_SOURCE_URLS[0],
    fareSourceUrls: local.fareSourceUrls,
    fareScope: local.fareScope,
  };
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
    const destinationBusSlug = DESTINATION_BUS_SLUG[destination.id];
    const destinationHubs = destinationBusSlug
      ? BUS_DESTINATION_ACCESS_HUBS
      : BUS_ACCESS_HUBS;
    const toHubs = resolveNearbyAccessHubs({
      location: destination.coordinates,
      mode: "bus",
      hubs: destinationHubs,
      exactHubIds: destinationBusSlug
        ? [destinationBusSlug]
        : resolveExactHubIds(destination.municipalityId, MUNICIPALITY_BUS_SLUG),
      radiusKm: BUS_ARRIVAL_RADIUS_KM,
      transportZoneId: destinationZoneId,
      exactOnly: Boolean(destinationBusSlug),
    });
    const selected = selectGroundCandidate({
      fromHubs,
      toHubs,
      originLocation: context.homeStationCoords ?? undefined,
      destinationLocation: destination.coordinates,
      routesFor: (fromEndpoint, toEndpoint) =>
        getBusRoutes(fromEndpoint, toEndpoint),
    });
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
      fareEvidence: selected.route.fare ? "verified" : "unknown",
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
      fareSourceUrl: selected.route.sourceUrl,
      fareScope: selected.route.fare ? "corridor_only" : "unknown",
      servicePeriod: selected.route.servicePeriod,
      serviceName: selected.route.serviceName,
      operator: selected.route.operator,
      reservationRequired: selected.route.reservationRequired,
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
      const selected = selectGroundCandidate({
        fromHubs,
        toHubs,
        originLocation: context.homeStationCoords ?? undefined,
        destinationLocation: destination.coordinates,
        routesFor: (fromEndpoint, toEndpoint) => {
          const route = getGroundRoute(fromEndpoint, toEndpoint, mode);
          return route ? [route] : [];
        },
      });
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
        fareEvidence: selected.route.fare ? "verified" : "unknown",
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
  if (!originPrefecture) {
    return mode === "train"
      ? getLocalBoundedOriginAwareEstimate(
          destination,
          context,
          destinationZoneId,
        )
      : null;
  }
  const destinationPrefecture = (destination.prefecture ?? "")
    .trim()
    .toLowerCase();
  if (!destinationPrefecture) return null;

  // Municipality-pair rows are the precise representation (KAI-66): a
  // verified corridor between two specific cities must never be widened
  // into a whole-prefecture claim (an Aichi→Gifu prefecture row would
  // present a Nagoya→Gifu-city time as a Nagoya→Takayama time). Prefer the
  // exact municipality pair whenever both sides are known; fall back to the
  // prefecture-pair registry only when no municipality row exists.
  const municipalityRoute =
    originMunicipalityId && destination.municipalityId
      ? getMunicipalityGroundRoute(
          originMunicipalityId,
          destination.municipalityId,
          mode,
        )
      : null;
  // A newly verified record with route-known-but-unestimated local access
  // must not inherit a broad prefecture corridor and present a station-to-
  // attraction claim. Require an exact municipality corridor until the
  // final local leg has its own evidence; legacy records with a static mode
  // value retain the old fallback while they are migrated.
  if (
    !municipalityRoute &&
    destination.localAccessUnestimated === true &&
    destination.transportOptions?.[mode] === undefined
  ) {
    return null;
  }
  const route =
    municipalityRoute ??
    getGroundRoute(originPrefecture, destinationPrefecture, mode);
  if (!route && mode === "train") {
    return getLocalBoundedOriginAwareEstimate(
      destination,
      context,
      destinationZoneId,
    );
  }
  if (!route) return null;
  return {
    mode,
    timeRange: route.timeRange,
    source: "verified_ground_route",
    evidence: "verified",
    fareEvidence: route.fare ? "verified" : "unknown",
    originZoneId: context.originZoneId,
    destinationZoneId,
    sourceUrl: route.sourceUrl,
    checkedAt: route.checkedAt,
    fare: route.fare,
    fareBasis: route.fareBasis,
    fareSourceUrl: route.fareSourceUrl,
    fareScope: route.fare ? "complete" : "unknown",
  };
}

const MAX_ORIGIN_AWARE_CACHE_ENTRIES = 4096;
const originAwareEstimateCache = new Map<
  string,
  OriginAwareTransportEstimate | null
>();

export interface OriginAwareEstimateCacheStats {
  hits: number;
  misses: number;
  entries: number;
}

let originAwareCacheHits = 0;
let originAwareCacheMisses = 0;

/** QA/performance harness hook; production callers never need to clear this cache. */
export function resetOriginAwareEstimateCache(): void {
  originAwareEstimateCache.clear();
  originAwareCacheHits = 0;
  originAwareCacheMisses = 0;
}

export function getOriginAwareEstimateCacheStats(): OriginAwareEstimateCacheStats {
  return {
    hits: originAwareCacheHits,
    misses: originAwareCacheMisses,
    entries: originAwareEstimateCache.size,
  };
}

function buildEstimateCacheKey(
  destination: Destination,
  context: OriginAwareEstimateContext,
  modes: readonly string[],
): string {
  const coordinates = destination.coordinates
    ? `${destination.coordinates.lat},${destination.coordinates.lng}`
    : "";
  const origin = context.homeStationCoords
    ? `${context.homeStationCoords.lat},${context.homeStationCoords.lng}`
    : "";
  const travelDate = context.ferryTemporal?.travelDate?.getTime() ?? "";
  return [
    destination.id,
    coordinates,
    destination.municipalityId ?? "",
    destination.prefecture ?? "",
    origin,
    context.originZoneId ?? "",
    context.originPrefecture ?? "",
    context.originMunicipalityId ?? "",
    travelDate,
    context.ferryTemporal?.season ?? "",
    [...modes].sort().join(","),
  ].join("|");
}

function rememberOriginAwareEstimate(
  key: string,
  estimate: OriginAwareTransportEstimate | null,
): void {
  if (originAwareEstimateCache.size >= MAX_ORIGIN_AWARE_CACHE_ENTRIES) {
    const oldest = originAwareEstimateCache.keys().next().value;
    if (oldest !== undefined) originAwareEstimateCache.delete(oldest);
  }
  originAwareEstimateCache.set(key, estimate);
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
  const cacheKey = buildEstimateCacheKey(destination, context, modes);
  const cached = originAwareEstimateCache.get(cacheKey);
  if (cached !== undefined) {
    originAwareCacheHits += 1;
    return cached;
  }
  originAwareCacheMisses += 1;

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
          // The selected flight fare is verified, but the total duration
          // includes calculated airport-access overhead. Keep the Journey
          // duration estimated until those access legs become explicit.
          evidence: "estimated",
          fareEvidence: flight.details?.verifiedFare ? "verified" : "unknown",
          originZoneId: context.originZoneId,
          destinationZoneId: resolveDestinationTransportZone(destination),
          sourceUrl: flight.details?.sourceUrl,
          checkedAt: flight.details?.checkedAt,
          departureAirportCode: flight.details?.departureAirportCode,
          departureAirportName: flight.details?.departureAirportName,
          arrivalAirportCode: flight.details?.arrivalAirportCode,
          arrivalAirportName: flight.details?.arrivalAirportName,
          fare: flight.details?.verifiedFare,
          fareVariability: flight.details?.verifiedFare ? "range" : null,
          fareSourceUrl: flight.details?.fareSourceUrl,
          fareScope: flight.details?.verifiedFare ? "corridor_only" : "unknown",
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
          // Ferry duration includes calculated port access overhead; do not
          // claim the combined door-to-door duration is fully verified.
          evidence: "estimated",
          fareEvidence: ferry.details?.verifiedFare ? "verified" : "unknown",
          originZoneId: context.originZoneId,
          destinationZoneId: resolveDestinationTransportZone(destination),
          sourceUrl: ferry.details?.sourceUrl,
          checkedAt: ferry.details?.checkedAt,
          departurePortName: ferry.details?.departurePortName,
          arrivalPortName: ferry.details?.arrivalPortName,
          serviceName: ferry.details?.serviceName,
          operator: ferry.details?.operator,
          notes: ferry.details?.ferryNotes,
          fare: ferry.details?.verifiedFare,
          fareVariability: ferry.details?.verifiedFare
            ? ferry.details?.verifiedFare[0] === ferry.details?.verifiedFare[1]
              ? "fixed"
              : "range"
            : null,
          fareBasis:
            ferry.details?.ferryFareBasis === "one-way" ||
            ferry.details?.ferryFareBasis === "round-trip"
              ? ferry.details.ferryFareBasis
              : undefined,
          fareSourceUrl: ferry.details?.fareSourceUrl,
          fareScope: ferry.details?.verifiedFare ? "corridor_only" : "unknown",
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
  rememberOriginAwareEstimate(cacheKey, best);
  return best;
}
