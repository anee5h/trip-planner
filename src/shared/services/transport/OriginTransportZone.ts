import type { TransportZoneId } from "../../types/transportTopology";

/**
 * Lightweight origin-only transport-zone resolution.
 *
 * This intentionally contains no topology, ferry, airport, destination, or
 * estimator payload. It is used by the global origin state and the eager Home
 * controls; the full TransportTopologyService remains lazy with HeavyHome.
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
  miyajima: { latRange: [34.27, 34.32], lngRange: [132.312, 132.33] },
  nokonoshima: { latRange: [33.6, 33.66], lngRange: [130.25, 130.33] },
  gunkanjima: { latRange: [32.62, 32.64], lngRange: [129.73, 129.75] },
};

const MAINLAND_BOUNDS: Record<
  string,
  { latRange: [number, number]; lngRange: [number, number] }
> = {
  hokkaido: { latRange: [41.5, 45.6], lngRange: [139.3, 145.9] },
  "mainland-kyushu": { latRange: [30.0, 33.93], lngRange: [128.4, 131.9] },
  "mainland-shikoku": { latRange: [32.5, 34.38], lngRange: [132.2, 134.9] },
};

const SETO_HONSHU_EXCLUSION_BOX = {
  latRange: [34.2, 34.38] as [number, number],
  lngRange: [132.2, 132.95] as [number, number],
};
const YAMAGUCHI_HONSHU_EXCLUSION_BOX = {
  latRange: [33.8, 34.2] as [number, number],
  lngRange: [132.2, 132.45] as [number, number],
};
const GEIYO_HONSHU_EXCLUSION_BOX = {
  latRange: [34.36, 34.38] as [number, number],
  lngRange: [132.95, 133.5] as [number, number],
};
const KANMON_KYUSHU_BOX = {
  latRange: [33.93, 33.96] as [number, number],
  lngRange: [130.95, 131.2] as [number, number],
};
const TSUGARU_HOKKAIDO_BOX = {
  latRange: [41.2, 41.5] as [number, number],
  lngRange: [139.9, 140.3] as [number, number],
};
const JAPAN_BOUNDS = {
  latRange: [20.0, 46.0] as [number, number],
  lngRange: [122.0, 154.0] as [number, number],
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
    if (pointInBox(coordinates, box)) return zoneId as TransportZoneId;
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
  if (pointInBox(coordinates, TSUGARU_HOKKAIDO_BOX)) return "hokkaido";
  for (const [zoneId, box] of Object.entries(MAINLAND_BOUNDS)) {
    if (pointInBox(coordinates, box)) return zoneId as TransportZoneId;
  }
  if (pointInBox(coordinates, JAPAN_BOUNDS)) return "mainland-honshu";
  return "unknown";
}

/** Resolves an origin zone without loading the recommendation topology. */
export function resolveOriginTransportZone(params: {
  coordinates: { lat: number; lng: number };
  label?: string;
  transportZoneId?: TransportZoneId;
}): TransportZoneId {
  if (params.transportZoneId) {
    // `unknown` is a fallback sentinel, not a topology zone. Keep this set
    // aligned with the real IDs above; persisted `unknown` must fall through
    // to the same geographic resolution as TransportTopologyService.
    const knownZone = Object.keys({
      ...ISLAND_BOUNDS,
      ...MAINLAND_BOUNDS,
      "mainland-honshu": true,
    }).includes(params.transportZoneId);
    if (knownZone) return params.transportZoneId;
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
