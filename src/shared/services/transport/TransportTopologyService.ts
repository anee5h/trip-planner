import topologyData from "../../data/transport-topology.json";
import ferryRoutesData from "../../data/ferry-routes.json";
import airportZonesData from "../../data/airport-zones.json";
import type { Destination } from "../../types/destination";
import type {
  EligibleOriginModesResult,
  TransportEdge,
  TransportTopologyData,
  TransportZone,
  TransportZoneId,
} from "../../types/transportTopology";
import type { TransportMode } from "./types";

// JSON modules are untyped at the import boundary; validate shape once here.
const topologyDataTyped = topologyData as unknown as TransportTopologyData;
const ferryRoutesDataTyped = ferryRoutesData as unknown as {
  routes: Array<{
    from: string;
    to: string;
    passengerService: boolean;
  }>;
};
const topology: TransportTopologyData = topologyDataTyped;
const ferryRoutes: Array<{
  from: string;
  to: string;
  passengerService: boolean;
}> = ferryRoutesDataTyped.routes;
const airportZonesDataTyped = airportZonesData as unknown as {
  airports: Record<string, TransportZoneId>;
};
const airportZones: Record<string, TransportZoneId> =
  airportZonesDataTyped.airports;

const zoneById = new Map<TransportZoneId, TransportZone>();
for (const z of topology.zones) zoneById.set(z.id, z);

/**
 * Non-overlapping island bounding boxes, checked first for both origin and
 * destination resolution. Each box covers only its own island group; none
 * overlap each other. Mainland zones are resolved from prefecture metadata,
 * never from these boxes.
 */
const ISLAND_BOUNDS: Record<
  string,
  { latRange: [number, number]; lngRange: [number, number] }
> = {
  "okinawa-main": { latRange: [26.0, 27.0], lngRange: [127.5, 128.5] },
  ogasawara: { latRange: [26.5, 27.8], lngRange: [142.0, 142.5] },
  sado: { latRange: [37.8, 38.4], lngRange: [138.1, 138.6] },
  ishigaki: { latRange: [24.2, 24.6], lngRange: [124.0, 124.4] },
  miyako: { latRange: [24.6, 25.0], lngRange: [125.1, 125.5] },
  amami: { latRange: [27.5, 29.0], lngRange: [128.5, 130.5] },
  yakushima: { latRange: [30.1, 30.5], lngRange: [130.3, 130.8] },
  tsushima: { latRange: [34.0, 34.7], lngRange: [129.1, 129.5] },
  naoshima: { latRange: [34.42, 34.49], lngRange: [133.93, 134.02] },
  teshima: { latRange: [34.45, 34.51], lngRange: [134.05, 134.12] },
  tomogashima: { latRange: [34.2, 34.4], lngRange: [134.9, 135.1] },
};

/**
 * Non-overlapping mainland boxes for coordinate-only fallback (postal
 * origins). Ordered after island boxes and after prefecture metadata.
 * Honshu is the remainder of Japan bounds not claimed by another zone.
 */
const MAINLAND_BOUNDS: Record<
  string,
  { latRange: [number, number]; lngRange: [number, number] }
> = {
  hokkaido: { latRange: [41.2, 45.6], lngRange: [139.3, 145.9] },
  "mainland-kyushu": { latRange: [30.0, 34.0], lngRange: [128.4, 131.8] },
  "mainland-shikoku": { latRange: [32.5, 34.5], lngRange: [132.2, 134.9] },
};

const JAPAN_BOUNDS: {
  latRange: [number, number];
  lngRange: [number, number];
} = { latRange: [20.0, 46.0], lngRange: [122.0, 154.0] };

/**
 * Complete, disjoint prefecture → mainland zone mapping. Every Japanese
 * prefecture belongs to exactly one mainland zone.
 */
const PREFECTURE_ZONE: Record<string, TransportZoneId> = {
  hokkaido: "hokkaido",
  aomori: "mainland-honshu",
  iwate: "mainland-honshu",
  miyagi: "mainland-honshu",
  akita: "mainland-honshu",
  yamagata: "mainland-honshu",
  fukushima: "mainland-honshu",
  ibaraki: "mainland-honshu",
  tochigi: "mainland-honshu",
  gunma: "mainland-honshu",
  saitama: "mainland-honshu",
  chiba: "mainland-honshu",
  tokyo: "mainland-honshu",
  kanagawa: "mainland-honshu",
  niigata: "mainland-honshu",
  toyama: "mainland-honshu",
  ishikawa: "mainland-honshu",
  fukui: "mainland-honshu",
  yamanashi: "mainland-honshu",
  nagano: "mainland-honshu",
  gifu: "mainland-honshu",
  shizuoka: "mainland-honshu",
  aichi: "mainland-honshu",
  mie: "mainland-honshu",
  shiga: "mainland-honshu",
  kyoto: "mainland-honshu",
  osaka: "mainland-honshu",
  hyogo: "mainland-honshu",
  nara: "mainland-honshu",
  wakayama: "mainland-honshu",
  tottori: "mainland-honshu",
  shimane: "mainland-honshu",
  okayama: "mainland-honshu",
  hiroshima: "mainland-honshu",
  yamaguchi: "mainland-honshu",
  tokushima: "mainland-shikoku",
  kagawa: "mainland-shikoku",
  ehime: "mainland-shikoku",
  kochi: "mainland-shikoku",
  fukuoka: "mainland-kyushu",
  saga: "mainland-kyushu",
  nagasaki: "mainland-kyushu",
  kumamoto: "mainland-kyushu",
  oita: "mainland-kyushu",
  miyazaki: "mainland-kyushu",
  kagoshima: "mainland-kyushu",
  okinawa: "okinawa-main",
};

const ISLAND_ZONE_IDS = new Set<TransportZoneId>(
  Object.keys(ISLAND_BOUNDS) as TransportZoneId[],
);

function pointInBox(
  coordinates: { lat: number; lng: number },
  box: { latRange: [number, number]; lngRange: [number, number] },
): boolean {
  return (
    coordinates.lat >= box.latRange[0] &&
    coordinates.lat <= box.latRange[1] &&
    coordinates.lng >= box.lngRange[0] &&
    coordinates.lng <= box.lngRange[1]
  );
}

function resolveFromIslandBoxes(coordinates: {
  lat: number;
  lng: number;
}): TransportZoneId | null {
  for (const [zoneId, box] of Object.entries(ISLAND_BOUNDS)) {
    if (pointInBox(coordinates, box)) {
      return zoneId as TransportZoneId;
    }
  }
  return null;
}

function resolveFromMainlandBoxes(coordinates: {
  lat: number;
  lng: number;
}): TransportZoneId {
  for (const [zoneId, box] of Object.entries(MAINLAND_BOUNDS)) {
    if (pointInBox(coordinates, box)) {
      return zoneId as TransportZoneId;
    }
  }
  if (
    pointInBox(coordinates, {
      latRange: JAPAN_BOUNDS.latRange,
      lngRange: JAPAN_BOUNDS.lngRange,
    })
  ) {
    // Honshu is the mainland remainder by construction.
    return "mainland-honshu";
  }
  return "unknown";
}

/**
 * Resolves an origin zone.
 *
 * Order:
 * 1. explicit persisted transportZoneId
 * 2. island bounding boxes (non-overlapping)
 * 3. station/postal label prefecture metadata
 * 4. mainland coordinate boxes (hokkaido/kyushu/shikoku), honshu remainder
 * 5. unknown when nothing matches
 */
export function resolveOriginTransportZone(params: {
  coordinates: { lat: number; lng: number };
  label?: string;
  transportZoneId?: TransportZoneId;
}): TransportZoneId {
  if (params.transportZoneId && zoneById.has(params.transportZoneId)) {
    return params.transportZoneId;
  }
  const island = resolveFromIslandBoxes(params.coordinates);
  if (island) return island;
  if (params.label) {
    const labelParts = params.label
      .split(",")
      .map((part) => part.trim().toLowerCase());
    for (const part of labelParts) {
      const zone = PREFECTURE_ZONE[part];
      if (zone) return zone;
    }
  }
  return resolveFromMainlandBoxes(params.coordinates);
}

/**
 * Resolves a destination zone.
 *
 * Order:
 * 1. explicit `transportZoneId` on the record (canonical authority)
 * 2. island bounding boxes for unassigned records
 * 3. prefecture → mainland zone
 * 4. island-marked records without any resolution → unknown
 * 5. unknown otherwise
 */
export function resolveDestinationTransportZone(
  dest: Destination,
): TransportZoneId {
  // "unknown" is the explicit non-routable sentinel: an aggregate or
  // non-transportable record declared without a routable zone.
  if (dest.transportZoneId === "unknown") return "unknown";
  if (
    dest.transportZoneId &&
    zoneById.has(dest.transportZoneId as TransportZoneId)
  ) {
    return dest.transportZoneId as TransportZoneId;
  }

  const tags = [...(dest.tags ?? []), ...(dest.categories ?? [])].map((t) =>
    t.toLowerCase(),
  );
  const islandTagTokens = tags.flatMap((t) => t.split(/[^a-z0-9]+/));
  const islandMarked =
    dest.kind === "island" ||
    islandTagTokens.includes("island") ||
    islandTagTokens.includes("remote") ||
    islandTagTokens.includes("ferry");

  if (dest.coordinates) {
    const island = resolveFromIslandBoxes(dest.coordinates);
    if (island) return island;
  }

  // Island-marked records must never inherit a mainland zone from
  // prefecture metadata; they need an explicit assignment.
  if (islandMarked) return "unknown";

  const prefL = (dest.prefecture ?? "").trim().toLowerCase();
  const zone = PREFECTURE_ZONE[prefL];
  if (zone) return zone;

  if (dest.coordinates) {
    return resolveFromMainlandBoxes(dest.coordinates);
  }
  return "unknown";
}

function findEdge(
  from: TransportZoneId,
  to: TransportZoneId,
): TransportEdge | undefined {
  return topology.edges.find(
    (e) =>
      (e.from === from && e.to === to) ||
      (e.bidirectional && e.from === to && e.to === from),
  );
}

export function hasFerryRoute(
  from: TransportZoneId,
  to: TransportZoneId,
): boolean {
  return ferryRoutes.some(
    (r) =>
      r.passengerService === true &&
      ((r.from === from && r.to === to) || (r.from === to && r.to === from)),
  );
}

/**
 * The transport zone an airport belongs to. Flight destination access is
 * only valid when the arrival airport sits in the destination's zone; an
 * airport in another zone would require an explicitly modelled access leg.
 */
export function getAirportZone(airportCode: string): TransportZoneId | null {
  return airportZones[airportCode] ?? null;
}

/**
 * Rail/road/bus authorization comes exclusively from explicit zone edges.
 * Flight and ferry are never edge modes.
 */
export function getEligibleOriginModes(params: {
  originZoneId: TransportZoneId;
  destinationZoneId: TransportZoneId;
  destination: Destination;
}): EligibleOriginModesResult {
  const { originZoneId, destinationZoneId } = params;
  const dz = zoneById.get(destinationZoneId);
  const localModes: TransportMode[] = dz?.localModes ?? [];

  if (originZoneId === destinationZoneId) {
    // Destination-level constraint: when a record declares localAccessModes,
    // only those modes reach the destination, even if the zone supports more.
    const effectiveLocalModes = params.destination.localAccessModes?.length
      ? (params.destination.localAccessModes as TransportMode[])
      : localModes;
    return {
      originZoneId,
      destinationZoneId,
      crossZoneModes: [],
      localModes: effectiveLocalModes,
    };
  }
  if (originZoneId === "unknown" || destinationZoneId === "unknown") {
    return { originZoneId, destinationZoneId, crossZoneModes: [], localModes };
  }
  const edge = findEdge(originZoneId, destinationZoneId);
  const crossZoneModes: TransportMode[] = edge ? [...edge.modes] : [];
  return { originZoneId, destinationZoneId, crossZoneModes, localModes };
}

export { topology, zoneById, ISLAND_ZONE_IDS };
