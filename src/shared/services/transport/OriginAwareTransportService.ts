import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext, TransportMode } from "./types";
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
  /** Bus-only operating window of the corridor product (KAI-66). A
   *  night-only coach must not make a same-day day trip feasible. */
  servicePeriod?: "day" | "night" | "mixed";
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
      servicePeriod: selected.route.servicePeriod,
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
  const route =
    municipalityRoute ??
    getGroundRoute(originPrefecture, destinationPrefecture, mode);
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
