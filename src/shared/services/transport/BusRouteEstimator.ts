import busRoutesData from "../../data/bus-routes.json";

export interface BusRoute {
  from: string;
  to: string;
  bidirectional: boolean;
  mode: "bus";
  serviceName: string;
  operator: string;
  durationMinutes: [number, number];
  reservationRequired: boolean;
  /** Verified one-way adult fare. The upper bound may be null for dynamic
   *  "from ¥X" fares (FARE_POLICY §3); null = no verified standard fare. */
  fare: [number, number | null] | null;
  fareVariability?: "fixed" | "range" | "variable" | "dynamic" | null;
  sourceUrl: string;
  checkedAt: string;
}

export interface BusRouteEstimate {
  mode: "bus";
  timeRange: [number, number];
  serviceName: string;
  operator: string;
  reservationRequired: boolean;
  fare: [number, number | null] | null;
  fareVariability?: "fixed" | "range" | "variable" | "dynamic" | null;
  sourceUrl: string;
  checkedAt: string;
}

const busRoutesDataTyped = busRoutesData as unknown as {
  routes: BusRoute[];
};
const routes: BusRoute[] = busRoutesDataTyped.routes;

/**
 * Municipality ids that participate in the verified intercity/highway-bus
 * corridor registry. Only catalogue hubs with a verified corridor key are
 * mapped; everything else stays unknown (no generic bus fallback).
 */
export const MUNICIPALITY_BUS_SLUG: Record<string, string> = {
  "Aichi:nagoya": "nagoya",
  "Ehime:matsuyama": "matsuyama",
  "Fukuoka:fukuoka": "fukuoka",
  "Hokkaido:sapporo": "sapporo",
  "Hokkaido:hakodate": "hakodate",
  "Hokkaido:asahikawa": "asahikawa",
  "Hiroshima:hiroshima": "hiroshima",
  "Hyogo:kobe": "kobe",
  "Kagawa:takamatsu": "takamatsu",
  "Miyagi:sendai": "sendai",
  "Nagasaki:nagasaki": "nagasaki",
  "Kumamoto:kumamoto": "kumamoto",
  "Fukushima:aizuwakamatsu": "aizu-wakamatsu",
  "Yamagata:yamagata": "yamagata",
  "Niigata:niigata": "niigata",
  "Nagano:nagano": "nagano",
  "Nagano:matsumoto": "matsumoto",
  "Yamanashi:kofu": "kofu",
  "Yamanashi:fujikawaguchiko": "kawaguchiko",
  "Tottori:tottori": "tottori",
  "Osaka:osaka": "osaka",
  "Kyoto:kyoto": "kyoto",
  "Tokyo:chiyoda": "tokyo",
  "Tokyo:chuo": "tokyo",
  "Tokyo:shinjuku": "tokyo",
  "Tokyo:toshima": "ikebukuro",
};

/**
 * Verified intercity/highway-bus corridor lookup, keyed on municipality
 * slugs (e.g. "tokyo"→"osaka"). Bus corridors are city-pair facts, never
 * prefecture-pair: a local city bus or airport limousine is not evidence of
 * intercity reachability (MODE_SEMANTICS §3).
 */
export function getBusRoute(
  fromSlug: string,
  toSlug: string,
): BusRouteEstimate | null {
  const match = routes.find(
    (r) =>
      (r.from === fromSlug && r.to === toSlug) ||
      (r.bidirectional && r.from === toSlug && r.to === fromSlug),
  );
  if (!match) return null;
  return {
    mode: "bus",
    timeRange: match.durationMinutes,
    serviceName: match.serviceName,
    operator: match.operator,
    reservationRequired: match.reservationRequired,
    fare: match.fare,
    fareVariability: match.fareVariability,
    sourceUrl: match.sourceUrl,
    checkedAt: match.checkedAt,
  };
}
