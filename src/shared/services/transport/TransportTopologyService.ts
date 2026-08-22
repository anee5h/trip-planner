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
  ishigaki: { latRange: [24.2, 24.6], lngRange: [123.5, 124.4] },
  miyako: { latRange: [24.6, 25.0], lngRange: [125.1, 125.5] },
  amami: { latRange: [27.3, 29.0], lngRange: [128.5, 130.5] },
  yakushima: { latRange: [30.1, 30.5], lngRange: [130.3, 130.8] },
  tsushima: { latRange: [34.0, 34.7], lngRange: [129.1, 129.5] },
  naoshima: { latRange: [34.42, 34.49], lngRange: [133.93, 134.02] },
  teshima: { latRange: [34.45, 34.51], lngRange: [134.05, 134.12] },
  tomogashima: { latRange: [34.2, 34.4], lngRange: [134.9, 135.1] },
  // KAI-87: lng floor 132.312 keeps the mainland ferry port (Miyajimaguchi,
  // ~132.308) out of the island zone; the island spans ~132.315-132.325.
  miyajima: { latRange: [34.27, 34.32], lngRange: [132.312, 132.33] },
  // Nokonoshima (能古島) in Hakata Bay, off Fukuoka's Nishi-ku coast. The
  // island spans ~33.60-33.66 lat, ~130.26-130.32 lng; the box keeps the
  // mainland Meinohama ferry terminal (Atago-hama, ~33.585/130.325) out of
  // the island zone. Ferry-only: no rail reaches the island.
  nokonoshima: { latRange: [33.6, 33.66], lngRange: [130.25, 130.33] },
  gunkanjima: { latRange: [32.62, 32.64], lngRange: [129.73, 129.75] },
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
  // Bounds are deliberately narrower than the geographic islands so a
  // coordinate-only origin on the Honshu side of a strait (Shimonoseki,
  // Hiroshima, Onomichi, Mutsu) never resolves into another mainland zone.
  // KAI-12: boxes must be disjoint — the previous shikoku box (lat up to
  // 34.5) overlapped Hiroshima, mis-resolving a major origin. Strait-edge
  // strips that a single lat/lng cutoff cannot separate are handled by the
  // dedicated boxes below (SETO_HONSHU_EXCLUSION_BOX, KANMON_KYUSHU_BOX,
  // TSUGARU_HOKKAIDO_BOX).
  hokkaido: { latRange: [41.5, 45.6], lngRange: [139.3, 145.9] },
  "mainland-kyushu": { latRange: [30.0, 33.93], lngRange: [128.4, 131.9] },
  "mainland-shikoku": { latRange: [32.5, 34.38], lngRange: [132.2, 134.9] },
};

/**
 * Honshu Seto-coast strip that falls inside the shikoku mainland box
 * (Kure, Ujina, southern Hiroshima wards). Checked before the shikoku box so
 * a coordinate-only origin there resolves to mainland-honshu. The latRange
 * ceiling tracks the shikoku box top (34.38); lng ≤ 132.95 keeps every real
 * Shikoku city out (Matsuyama/Kochi/Tokushima/Uwajima are south of lat 34.2;
 * Takamatsu, including its port at lat 34.367, is east of lng 132.95).
 */
const SETO_HONSHU_EXCLUSION_BOX: {
  latRange: [number, number];
  lngRange: [number, number];
} = { latRange: [34.2, 34.38], lngRange: [132.2, 132.95] };

/**
 * Honshu Yamaguchi-coast strip below the SETO box that still falls inside
 * the shikoku mainland box (Iwakuni city, Suo-Oshima, southern Otake): the
 * shikoku box's west edge (lng 132.2) begins at the western limit of the
 * Seto Inland Sea, but Yamaguchi prefecture's coast (Iwakuni at
 * lng 132.22–132.35, lat 34.0–34.2) juts east of that line. Checked before
 * the shikoku box so a coordinate-only origin there (e.g. a postcode in
 * 742-xxxx) resolves to mainland-honshu instead of mainland-shikoku.
 *
 * The band is deliberately narrow in longitude: its east edge (lng 132.45)
 * keeps every Matsuyama City island in the Seto (the Kutsuna group —
 * Nakajima at ~33.97/132.61, Tsuwajima at ~33.99/132.67, and neighbours)
 * out, so an Ehime island origin can never resolve as Honshu. No
 * Ehime/Shikoku land lies inside [lat 33.8–34.2] × [lng 132.2–132.45]:
 * Shikoku proper's north coast in that lng band is the Sadamisaki
 * peninsula (lat ≤ 33.5), Matsuyama city sits east of lng 132.7, and the
 * only islands in the band are Yamaguchi's Suo-Oshima group. Points east
 * of 132.45 (including all Ehime islands) fall through to the shikoku box
 * exactly as before the KAI-63 Iwakuni fix.
 */
const YAMAGUCHI_HONSHU_EXCLUSION_BOX: {
  latRange: [number, number];
  lngRange: [number, number];
} = { latRange: [33.8, 34.2], lngRange: [132.2, 132.45] };

/**
 * Geiyo-islands strip that falls inside the shikoku mainland box (southern
 * coast of Mukaishima island, Onomichi/Hiroshima — lat 34.36–34.38 between
 * the Seto coast exclusion and lng 133.5). No Shikoku land lies in this
 * band (Imabari is at lat 34.06; Shikoku's north coast is south of 34.2), so
 * it resolves to mainland-honshu. Checked before the shikoku box.
 */
const GEIYO_HONSHU_EXCLUSION_BOX: {
  latRange: [number, number];
  lngRange: [number, number];
} = { latRange: [34.36, 34.38], lngRange: [132.95, 133.5] };

/**
 * Kyushu-side Kanmon-strait strip: Mojiko/Moji ward, Kitakyushu (lat
 * 33.93–33.96) sits below the kyushu box ceiling (33.93) that keeps
 * Shimonoseki Station (33.9505, Honshu) out. Moji lies east of lng 130.95;
 * Shimonoseki's station and port lie west of it, so an lng floor separates
 * the two sides of the strait. The floor cannot move below 130.95 without
 * swallowing Shimonoseki port (130.935) — the strip west of it (strait
 * water, Hikoshima-side coast) resolves by the lat/lng boxes; Moji/Mojiko
 * are the catalogue-relevant coordinates on the Kyushu side. Checked before
 * the kyushu box.
 */
const KANMON_KYUSHU_BOX: {
  latRange: [number, number];
  lngRange: [number, number];
} = { latRange: [33.93, 33.96], lngRange: [130.95, 131.2] };

/**
 * Hokkaido-side Tsugaru-strait strip: Matsumae and Fukushima-cho (the Oshima
 * peninsula, lat 41.2–41.5) sit below the hokkaido box floor (41.5) that
 * keeps Mutsu (41.29, Honshu) out. Hokkaido's Oshima peninsula lies west of
 * lng 140.3; Honshu's Tappi cape (41.43) lies east of it. Checked before the
 * hokkaido box.
 */
const TSUGARU_HOKKAIDO_BOX: {
  latRange: [number, number];
  lngRange: [number, number];
} = { latRange: [41.2, 41.5], lngRange: [139.9, 140.3] };

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
  if (pointInBox(coordinates, SETO_HONSHU_EXCLUSION_BOX)) {
    return "mainland-honshu";
  }
  if (pointInBox(coordinates, YAMAGUCHI_HONSHU_EXCLUSION_BOX)) {
    return "mainland-honshu";
  }
  if (pointInBox(coordinates, GEIYO_HONSHU_EXCLUSION_BOX)) {
    return "mainland-honshu";
  }
  if (pointInBox(coordinates, KANMON_KYUSHU_BOX)) {
    return "mainland-kyushu";
  }
  if (pointInBox(coordinates, TSUGARU_HOKKAIDO_BOX)) {
    return "hokkaido";
  }
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
      ? params.destination.localAccessModes
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
