import groundRoutesData from "../../data/ground-routes.json";
import type { IntercityAccessHub } from "./IntercityAccessHubResolver";

export interface GroundRoute {
  from: string;
  to: string;
  bidirectional: boolean;
  mode: "train" | "shinkansen";
  timeRange: [number, number];
  sourceUrl?: string;
  checkedAt?: string;
  /**
   * Verified one-way adult fare (JPY) for the ordinary seat product the
   * timeRange describes (FARE_POLICY §1/§2). Range spans the service
   * classes actually represented; absent = fare unknown.
   */
  fare?: [number, number] | null;
  /** What the fare buys (seat product, fare basis); only stored with a fare. */
  fareBasis?:
    "base" | "base-plus-lex" | "integrated-total" | "non-reserved" | "reserved";
  /** Supports the fare range specifically, when distinct from route source. */
  fareSourceUrl?: string;
}

export interface GroundRouteEstimate {
  mode: "train" | "shinkansen";
  timeRange: [number, number];
  sourceUrl?: string;
  checkedAt?: string;
  fare?: [number, number] | null;
  fareBasis?: GroundRoute["fareBasis"];
  fareSourceUrl?: string;
}

// JSON modules are untyped at the import boundary; validate shape once here.
const groundRoutesDataTyped = groundRoutesData as unknown as {
  routes: GroundRoute[];
  municipalityRoutes?: GroundRoute[];
};
const routes: GroundRoute[] = groundRoutesDataTyped.routes;
const municipalityRoutes: GroundRoute[] =
  groundRoutesDataTyped.municipalityRoutes ?? [];

/**
 * Shinkansen access is intentionally narrower than a prefecture-wide claim:
 * these are physical stations represented by the current verified corridor
 * endpoint keys. Multiple Tokyo-area stations share the registry's `tokyo`
 * endpoint because ground-routes.json is currently prefecture-keyed.
 */
function shinkansenHub(
  id: string,
  coordinates: { lat: number; lng: number },
  corridorEndpoint: string,
  transportZoneId: IntercityAccessHub["transportZoneId"],
  isCanonicalCorridorStation: boolean = true,
): IntercityAccessHub {
  return {
    id,
    mode: "shinkansen",
    coordinates,
    corridorEndpoint,
    transportZoneId,
    isCanonicalCorridorStation,
  };
}

/**
 * Conservative access policy: 50 km covers the representative
 * Shinagawa/Yokohama/Kawasaki/Omiya-to-station cases without making a whole
 * prefecture a station catchment; arrival stays at 30 km because destination
 * access is a stronger "served by this station" claim.
 */
export const SHINKANSEN_ACCESS_RADIUS_KM = 50;
export const SHINKANSEN_ARRIVAL_RADIUS_KM = 30;

export const SHINKANSEN_ACCESS_HUBS: readonly IntercityAccessHub[] = [
  shinkansenHub(
    "tokyo",
    { lat: 35.6812, lng: 139.7671 },
    "tokyo",
    "mainland-honshu",
  ),
  shinkansenHub(
    "ueno",
    { lat: 35.7138, lng: 139.7773 },
    "tokyo",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "omiya",
    { lat: 35.9063, lng: 139.6239 },
    "tokyo",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "shinagawa",
    { lat: 35.6285, lng: 139.7387 },
    "tokyo",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "shin-yokohama",
    { lat: 35.5073, lng: 139.6172 },
    "tokyo",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "shizuoka",
    { lat: 34.9717, lng: 138.3885 },
    "shizuoka",
    "mainland-honshu",
  ),
  shinkansenHub(
    "nagoya",
    { lat: 35.1709, lng: 136.8815 },
    "aichi",
    "mainland-honshu",
  ),
  shinkansenHub(
    "gifu-hashima",
    { lat: 35.3153, lng: 136.6854 },
    "gifu",
    "mainland-honshu",
  ),
  shinkansenHub(
    "kyoto",
    { lat: 34.9858, lng: 135.7588 },
    "kyoto",
    "mainland-honshu",
  ),
  shinkansenHub(
    "shin-osaka",
    { lat: 34.7335, lng: 135.5001 },
    "osaka",
    "mainland-honshu",
  ),
  shinkansenHub(
    "shin-kobe",
    { lat: 34.7068, lng: 135.1978 },
    "hyogo",
    "mainland-honshu",
  ),
  shinkansenHub(
    "himeji",
    { lat: 34.8268, lng: 134.6906 },
    "hyogo",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "okayama",
    { lat: 34.6663, lng: 133.918 },
    "okayama",
    "mainland-honshu",
  ),
  shinkansenHub(
    "shin-kurashiki",
    { lat: 34.6016, lng: 133.679 },
    "okayama",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "hiroshima",
    { lat: 34.3975, lng: 132.4756 },
    "hiroshima",
    "mainland-honshu",
  ),
  shinkansenHub(
    "hakata",
    { lat: 33.5898, lng: 130.4207 },
    "fukuoka",
    "mainland-kyushu",
  ),
  shinkansenHub(
    "kumamoto",
    { lat: 32.7898, lng: 130.6882 },
    "kumamoto",
    "mainland-kyushu",
  ),
  shinkansenHub(
    "nagasaki",
    { lat: 32.7546, lng: 129.8707 },
    "nagasaki",
    "mainland-kyushu",
  ),
  shinkansenHub(
    "kagoshima-chuo",
    { lat: 31.5839, lng: 130.5428 },
    "kagoshima",
    "mainland-kyushu",
  ),
  shinkansenHub(
    "sendai",
    { lat: 38.2601, lng: 140.8824 },
    "miyagi",
    "mainland-honshu",
  ),
  shinkansenHub(
    "morioka",
    { lat: 39.7019, lng: 141.1364 },
    "iwate",
    "mainland-honshu",
  ),
  shinkansenHub(
    "shin-aomori",
    { lat: 40.8282, lng: 140.6947 },
    "aomori",
    "mainland-honshu",
  ),
  shinkansenHub(
    "akita",
    { lat: 39.7163, lng: 140.1297 },
    "akita",
    "mainland-honshu",
  ),
  shinkansenHub(
    "yamagata",
    { lat: 38.2485, lng: 140.3272 },
    "yamagata",
    "mainland-honshu",
  ),
  shinkansenHub(
    "fukushima",
    { lat: 37.754, lng: 140.4597 },
    "fukushima",
    "mainland-honshu",
  ),
  shinkansenHub(
    "niigata",
    { lat: 37.9121, lng: 139.0614 },
    "niigata",
    "mainland-honshu",
  ),
  shinkansenHub(
    "nagano",
    { lat: 36.6431, lng: 138.1888 },
    "nagano",
    "mainland-honshu",
  ),
  shinkansenHub(
    "karuizawa",
    { lat: 36.342, lng: 138.635 },
    "nagano",
    "mainland-honshu",
    false,
  ),
  shinkansenHub(
    "toyama",
    { lat: 36.7015, lng: 137.2137 },
    "toyama",
    "mainland-honshu",
  ),
  shinkansenHub(
    "kanazawa",
    { lat: 36.5781, lng: 136.6479 },
    "ishikawa",
    "mainland-honshu",
  ),
  shinkansenHub(
    "shin-hakodate-hokuto",
    { lat: 41.9268, lng: 140.6479 },
    "hokkaido",
    "hokkaido",
  ),
];

/** Exact municipality-to-station wiring for known Shinkansen hubs. */
export const MUNICIPALITY_SHINKANSEN_HUB_IDS: Record<string, string[]> = {
  "Tokyo:chiyoda": ["tokyo"],
  "Tokyo:chuo": ["tokyo"],
  "Tokyo:minato": ["shinagawa"],
  "Tokyo:shinagawa": ["shinagawa"],
  "Tokyo:taito": ["ueno"],
  "Tokyo:shinjuku": ["tokyo"],
  "Kanagawa:kawasaki": ["shinagawa", "shin-yokohama"],
  "Kanagawa:yokohama": ["shin-yokohama"],
  "Saitama:saitama": ["omiya"],
  "Shizuoka:shizuoka": ["shizuoka"],
  "Aichi:nagoya": ["nagoya"],
  "Gifu:gifu": ["gifu-hashima"],
  "Kyoto:kyoto": ["kyoto"],
  "Osaka:osaka": ["shin-osaka"],
  "Hyogo:kobe": ["shin-kobe"],
  "Hyogo:himeji": ["himeji"],
  "Okayama:okayama": ["okayama"],
  "Okayama:kurashiki": ["shin-kurashiki"],
  "Hiroshima:hiroshima": ["hiroshima"],
  "Fukuoka:fukuoka": ["hakata"],
  "Kumamoto:kumamoto": ["kumamoto"],
  "Nagasaki:nagasaki": ["nagasaki"],
  "Kagoshima:kagoshima": ["kagoshima-chuo"],
  "Miyagi:sendai": ["sendai"],
  "Iwate:morioka": ["morioka"],
  "Aomori:aomori": ["shin-aomori"],
  "Akita:akita": ["akita"],
  "Yamagata:yamagata": ["yamagata"],
  "Fukushima:fukushima": ["fukushima"],
  "Niigata:niigata": ["niigata"],
  "Nagano:nagano": ["nagano"],
  "Nagano:karuizawa": ["karuizawa"],
  "Hokkaido:hakodate": ["shin-hakodate-hokuto"],
};

/**
 * Bidirectional ground-route lookup keyed on prefecture pairs. Railway
 * corridors are prefecture-to-prefecture: the topology's transport zones are
 * island-level and cannot distinguish Osaka→Kyoto from Tokyo→Kyoto, so the
 * canonical registry uses the origin/destination prefectures (derived from
 * the confidently resolved origin municipality and the destination's
 * prefecture field).
 */
export function getGroundRoute(
  fromPrefecture: string,
  toPrefecture: string,
  mode: "train" | "shinkansen",
): GroundRouteEstimate | null {
  const match = routes.find(
    (r) =>
      r.mode === mode &&
      ((r.from === fromPrefecture && r.to === toPrefecture) ||
        (r.bidirectional &&
          r.from === toPrefecture &&
          r.to === fromPrefecture)),
  );
  if (!match) return null;
  return {
    mode: match.mode,
    timeRange: match.timeRange,
    sourceUrl: match.sourceUrl,
    checkedAt: match.checkedAt,
    fare: match.fare,
    fareBasis: match.fareBasis,
    fareSourceUrl: match.fareSourceUrl,
  };
}

/**
 * Intra-prefecture (municipality-pair) ground-route lookup, used when the
 * origin and destination share a prefecture: local metro corridors cannot
 * be expressed at prefecture granularity.
 */
export function getMunicipalityGroundRoute(
  fromMunicipalityId: string,
  toMunicipalityId: string,
  mode: "train" | "shinkansen",
): GroundRouteEstimate | null {
  const match = municipalityRoutes.find(
    (r) =>
      r.mode === mode &&
      ((r.from === fromMunicipalityId && r.to === toMunicipalityId) ||
        (r.bidirectional &&
          r.from === toMunicipalityId &&
          r.to === fromMunicipalityId)),
  );
  if (!match) return null;
  return {
    mode: match.mode,
    timeRange: match.timeRange,
    sourceUrl: match.sourceUrl,
    checkedAt: match.checkedAt,
    fare: match.fare,
    fareBasis: match.fareBasis,
    fareSourceUrl: match.fareSourceUrl,
  };
}
