import topologyData from "../../data/transport-topology.json";
import type { Destination } from "../../types/destination";
import type {
  EligibleOriginModesResult,
  JourneyEstimate,
  JourneyLeg,
  TransportEdge,
  TransportTopologyData,
  TransportZone,
  TransportZoneId,
} from "../../types/transportTopology";
import type { TransportMode } from "./types";

const topology: TransportTopologyData =
  topologyData as unknown as TransportTopologyData;

const zoneById = new Map<TransportZoneId, TransportZone>();
for (const z of topology.zones) zoneById.set(z.id, z);

const ZONE_BOUNDS: Record<
  string,
  { latRange: [number, number]; lngRange: [number, number] }
> = {
  hokkaido: { latRange: [41.0, 45.6], lngRange: [139.0, 146.0] },
  "mainland-honshu": { latRange: [33.0, 41.5], lngRange: [130.0, 142.0] },
  "mainland-kyushu": { latRange: [30.0, 33.9], lngRange: [128.5, 132.0] },
  "mainland-shikoku": { latRange: [32.5, 34.5], lngRange: [132.0, 134.8] },
  "okinawa-main": { latRange: [26.0, 27.0], lngRange: [127.5, 128.5] },
  ogasawara: { latRange: [26.5, 27.8], lngRange: [142.0, 142.5] },
  sado: { latRange: [37.8, 38.4], lngRange: [138.1, 138.6] },
  ishigaki: { latRange: [24.2, 24.6], lngRange: [124.0, 124.4] },
  miyako: { latRange: [24.6, 25.0], lngRange: [125.1, 125.5] },
  amami: { latRange: [27.5, 29.0], lngRange: [128.5, 130.5] },
  yakushima: { latRange: [30.1, 30.5], lngRange: [130.3, 130.8] },
  tsushima: { latRange: [34.0, 34.7], lngRange: [129.1, 129.5] },
  naoshima: { latRange: [34.3, 34.6], lngRange: [133.8, 134.2] },
  teshima: { latRange: [34.3, 34.6], lngRange: [134.0, 134.2] },
  tomogashima: { latRange: [34.2, 34.4], lngRange: [134.9, 135.1] },
};

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
  fukuoka: "mainland-kyushu",
  saga: "mainland-kyushu",
  nagasaki: "mainland-kyushu",
  kumamoto: "mainland-kyushu",
  oita: "mainland-kyushu",
  miyazaki: "mainland-kyushu",
  kagoshima: "mainland-kyushu",
  kagawa: "mainland-shikoku",
  tokushima: "mainland-shikoku",
  ehime: "mainland-shikoku",
  kochi: "mainland-shikoku",
  okinawa: "okinawa-main",
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, "");
}

export function resolveOriginTransportZone(params: {
  coordinates: { lat: number; lng: number };
  label?: string;
}): TransportZoneId {
  const { coordinates, label } = params;
  for (const [zoneId, b] of Object.entries(ZONE_BOUNDS)) {
    if (
      coordinates.lat >= b.latRange[0] &&
      coordinates.lat <= b.latRange[1] &&
      coordinates.lng >= b.lngRange[0] &&
      coordinates.lng <= b.lngRange[1]
    ) {
      if (zoneById.has(zoneId as TransportZoneId))
        return zoneId as TransportZoneId;
    }
  }
  if (label) {
    const n = norm(label);
    for (const [pref, zone] of Object.entries(PREFECTURE_ZONE)) {
      if (n.includes(norm(pref))) return zone;
    }
  }
  return "unknown";
}

const ISLAND_KEYS: Record<string, TransportZoneId> = {
  okinawa: "okinawa-main",
  naha: "okinawa-main",
  ogasawara: "ogasawara",
  chichijima: "ogasawara",
  hahajima: "ogasawara",
  sado: "sado",
  ishigaki: "ishigaki",
  yaeyama: "ishigaki",
  iriomote: "ishigaki",
  taketomi: "ishigaki",
  yonaguni: "ishigaki",
  miyako: "miyako",
  miyakojima: "miyako",
  amami: "amami",
  yakushima: "yakushima",
  tsushima: "tsushima",
  naoshima: "naoshima",
  teshima: "teshima",
  enoshima: "mainland-honshu",
  "art-island": "naoshima",
  "art-islands": "naoshima",
  sakurajima: "mainland-kyushu",
  aoshima: "mainland-kyushu",
  chiringashima: "mainland-kyushu",
  matsushima: "mainland-honshu",
  okinoshima: "mainland-kyushu",
  tomogashima: "tomogashima",
};

/**
 * Tokenizes an identifier so island keys match whole words only. Prevents
 * substring collisions such as "matsushima" matching the "tsushima" key.
 */
function islandTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/**
 * True when an island-marked destination is explicitly declared to connect
 * to a mainland zone by bridge, tunnel, or tidal causeway. These records
 * intentionally resolve to a mainland zone and must not be flagged as
 * fall-through.
 */
export function isBridgeConnectedDestination(dest: Destination): boolean {
  const nameTokens = islandTokens(dest.name ?? "");
  const munTokens = islandTokens(dest.municipalityId ?? "");
  const idTokens = islandTokens(dest.id ?? "");
  for (const [key, zone] of Object.entries(ISLAND_KEYS)) {
    if (
      (nameTokens.has(key) || munTokens.has(key) || idTokens.has(key)) &&
      (zone === "mainland-honshu" ||
        zone === "mainland-kyushu" ||
        zone === "mainland-shikoku")
    ) {
      return true;
    }
  }
  return false;
}

export function resolveDestinationTransportZone(
  dest: Destination,
): TransportZoneId {
  const cats = (dest.categories ?? []).map((c) => c.toLowerCase());
  const tags = (dest.tags ?? []).map((t) => t.toLowerCase());
  const islandTags = tags.flatMap((t) => [...t.split(/[^a-z0-9]+/)]);
  const isIsland =
    dest.kind === "island" ||
    cats.includes("island") ||
    islandTags.includes("island") ||
    islandTags.includes("remote") ||
    islandTags.includes("ferry");
  const nameTokens = islandTokens(dest.name ?? "");
  const munTokens = islandTokens(dest.municipalityId ?? "");
  const idTokens = islandTokens(dest.id ?? "");

  for (const [key, zone] of Object.entries(ISLAND_KEYS)) {
    if (nameTokens.has(key) || munTokens.has(key) || idTokens.has(key)) {
      return zone;
    }
  }

  const MAINLAND_ZONE_IDS = new Set<TransportZoneId>([
    "mainland-honshu",
    "mainland-kyushu",
    "mainland-shikoku",
  ]);
  if (isIsland && dest.coordinates) {
    for (const [zoneId, b] of Object.entries(ZONE_BOUNDS)) {
      if (MAINLAND_ZONE_IDS.has(zoneId as TransportZoneId)) continue;
      if (
        dest.coordinates.lat >= b.latRange[0] &&
        dest.coordinates.lat <= b.latRange[1] &&
        dest.coordinates.lng >= b.lngRange[0] &&
        dest.coordinates.lng <= b.lngRange[1]
      ) {
        if (zoneById.has(zoneId as TransportZoneId))
          return zoneId as TransportZoneId;
      }
    }
    // An island-marked record with no explicit island zone must not inherit
    // the mainland default.
    return "unknown";
  }

  const prefL = (dest.prefecture ?? "").toLowerCase().trim();
  if (prefL === "okinawa") return "okinawa-main";

  if (dest.coordinates) {
    for (const [zoneId, b] of Object.entries(ZONE_BOUNDS)) {
      if (
        dest.coordinates.lat >= b.latRange[0] &&
        dest.coordinates.lat <= b.latRange[1] &&
        dest.coordinates.lng >= b.lngRange[0] &&
        dest.coordinates.lng <= b.lngRange[1]
      ) {
        if (zoneById.has(zoneId as TransportZoneId))
          return zoneId as TransportZoneId;
      }
    }
  }

  if (!isIsland) return "mainland-honshu";
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

export function getEligibleOriginModes(params: {
  originZoneId: TransportZoneId;
  destinationZoneId: TransportZoneId;
  destination: Destination;
}): EligibleOriginModesResult {
  const { originZoneId, destinationZoneId } = params;
  const dz = zoneById.get(destinationZoneId);
  const localModes: TransportMode[] = dz?.localModes ?? ["bus"];
  if (originZoneId === destinationZoneId)
    return { originZoneId, destinationZoneId, crossZoneModes: [], localModes };
  if (originZoneId === "unknown")
    return {
      originZoneId,
      destinationZoneId,
      crossZoneModes: [],
      localModes: dz?.isRemote ? ["ferry"] : [],
    };
  if (destinationZoneId === "unknown")
    return {
      originZoneId,
      destinationZoneId,
      crossZoneModes: [],
      localModes: [],
    };
  const edge = findEdge(originZoneId, destinationZoneId);
  return {
    originZoneId,
    destinationZoneId,
    crossZoneModes: edge ? [...edge.modes] : [],
    localModes,
  };
}

export function buildTransportJourneyEstimate(params: {
  originZoneId: TransportZoneId;
  destinationZoneId: TransportZoneId;
  crossZoneModes: TransportMode[];
  localModes: TransportMode[];
  destination: Destination;
}): JourneyEstimate {
  const { originZoneId, destinationZoneId, crossZoneModes, localModes } =
    params;
  if (originZoneId === destinationZoneId) {
    const pm = localModes.includes("train")
      ? "train"
      : localModes.includes("bus")
        ? "bus"
        : localModes.includes("car")
          ? "car"
          : (localModes[0] ?? null);
    const legs: JourneyLeg[] = localModes.map((m) => ({
      mode: m,
      legType: "local-access" as const,
      label: ml(m),
    }));
    return {
      primaryMode: pm,
      legs,
      totalTimeRange: null,
      totalCostRange: null,
      available: legs.length > 0,
    };
  }
  if (originZoneId === "unknown" || destinationZoneId === "unknown") {
    return {
      primaryMode: null,
      legs: [],
      totalTimeRange: null,
      totalCostRange: null,
      available: false,
      unavailableReason: `No topology data for ${originZoneId} → ${destinationZoneId}`,
    };
  }
  if (crossZoneModes.length === 0) {
    return {
      primaryMode: null,
      legs: [],
      totalTimeRange: null,
      totalCostRange: null,
      available: false,
      unavailableReason: `No connection between ${originZoneId} and ${destinationZoneId}`,
    };
  }
  const prio: TransportMode[] = [
    "flight",
    "ferry",
    "shinkansen",
    "train",
    "car",
    "my_car",
    "bus",
  ];
  const pm = crossZoneModes.find((m) => prio.includes(m)) ?? crossZoneModes[0];
  const legs: JourneyLeg[] = [];
  for (const m of crossZoneModes)
    legs.push({ mode: m, legType: "cross-zone", label: ml(m) });
  for (const m of localModes) {
    if (m === "train")
      legs.push({ mode: m, legType: "local-access", label: "Yui Rail" });
    else if (!["flight", "ferry", "shinkansen"].includes(m))
      legs.push({ mode: m, legType: "local-access", label: ml(m) });
  }
  return {
    primaryMode: pm,
    legs,
    totalTimeRange: null,
    totalCostRange: null,
    available: true,
  };
}

function ml(mode: TransportMode): string {
  const labels: Record<TransportMode, string> = {
    train: "Train",
    shinkansen: "Shinkansen",
    car: "Car",
    my_car: "Own Car",
    bus: "Bus",
    flight: "Flight",
    ferry: "Ferry",
  };
  return labels[mode] ?? mode;
}

export { topology, zoneById };
