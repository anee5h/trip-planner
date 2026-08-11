import busRoutesData from "../../data/bus-routes.json";
import { resolveOriginTransportZone } from "./TransportTopologyService";
import {
  resolveNearbyAccessHubs,
  type IntercityAccessHub,
} from "./IntercityAccessHubResolver";

/**
 * Bus catchment radius (km) around a verified corridor terminal for the
 * ORIGIN side. A traveler within this radius of a terminal may reasonably
 * travel to it to use its intercity coach corridors (e.g. a Kawasaki
 * resident catching the Tokyo-departing bus). Deliberately smaller than the
 * flight catchment (250 km): you travel *to* a bus. Access legs themselves
 * are not modeled (no multi-leg journeys yet) — the corridor remains the
 * verified fact.
 *
 * The asymmetry vs BUS_ARRIVAL_RADIUS_KM is intentional: origin access is
 * the traveler's own deliberate choice to reach the terminal (the same
 * access assumption the flight model makes with its 250 km airport
 * catchment — e.g. a Hakone resident may drive 43 km to the Kawaguchiko
 * terminal to catch the Tokyo coach, an unmodeled access leg), while the
 * arrival side is a product claim about what the corridor *reaches* and is
 * kept conservative so a corridor never silently serves a destination far
 * from its arrival terminal (Hakone must not be "reached" by the
 * tokyo→kawaguchiko coach).
 */
export const BUS_ACCESS_RADIUS_KM = 50;

/**
 * Bus catchment radius (km) for the DESTINATION side — the onward leg after
 * getting off the coach. Kept tighter than the origin radius (30 km): a
 * 50 km destination catchment fabricates pairings across natural barriers
 * (e.g. Hakone is 42 km from Kawaguchiko yet the tokyo→kawaguchiko coach
 * does not serve it), while ~30 km covers genuine onward day-trips like
 * Nara from the Osaka-arriving bus (~28 km).
 */
export const BUS_ARRIVAL_RADIUS_KM = 30;

/**
 * Representative coordinates of each registered corridor terminal (station
 * or bus-terminal city center). Used by the catchment resolver; static
 * geography, matching the station-label resolution elsewhere in the app.
 */
export const BUS_TERMINAL_COORDS: Record<string, { lat: number; lng: number }> =
  {
    tokyo: { lat: 35.6812, lng: 139.7671 }, // Tokyo Station (Yaesu)
    ikebukuro: { lat: 35.7295, lng: 139.7109 }, // Ikebukuro
    osaka: { lat: 34.7025, lng: 135.4959 }, // Osaka/Umeda
    kyoto: { lat: 34.9858, lng: 135.7588 }, // Kyoto Station
    nagoya: { lat: 35.1709, lng: 136.8815 }, // Nagoya
    fukuoka: { lat: 33.5902, lng: 130.4207 }, // Hakata
    kagoshima: { lat: 31.583, lng: 130.542 }, // Kagoshima-Chuo
    kumamoto: { lat: 32.7897, lng: 130.6867 }, // Kumamoto
    nagasaki: { lat: 32.7503, lng: 129.8776 }, // Nagasaki
    kobe: { lat: 34.6932, lng: 135.1954 }, // Sannomiya
    takamatsu: { lat: 34.3503, lng: 134.0469 }, // Takamatsu
    matsuyama: { lat: 33.8404, lng: 132.7657 }, // Matsuyama
    hiroshima: { lat: 34.3983, lng: 132.4756 }, // Hiroshima
    kanazawa: { lat: 36.5782, lng: 136.6485 }, // Kanazawa
    tottori: { lat: 35.4927, lng: 134.2256 }, // Tottori
    sapporo: { lat: 43.068, lng: 141.351 }, // Sapporo
    asahikawa: { lat: 43.7627, lng: 142.3626 }, // Asahikawa
    hakodate: { lat: 41.774, lng: 140.728 }, // Hakodate
    noboribetsu: { lat: 42.4446, lng: 141.0426 }, // Noboribetsu
    sendai: { lat: 38.268, lng: 140.87 }, // Sendai
    yamagata: { lat: 38.2484, lng: 140.3213 }, // Yamagata
    "aizu-wakamatsu": { lat: 37.4952, lng: 139.9292 }, // Aizu-Wakamatsu
    kawaguchiko: { lat: 35.4993, lng: 138.7684 }, // Kawaguchiko
    kofu: { lat: 35.6673, lng: 138.5688 }, // Kofu
    matsumoto: { lat: 36.2308, lng: 137.9705 }, // Matsumoto
    nagano: { lat: 36.6431, lng: 138.1888 }, // Nagano
    niigata: { lat: 37.9121, lng: 139.0614 }, // Niigata
  };

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
 * Bus terminal registry expressed in the shared access-hub shape. The
 * corridor endpoint is still the verified bus-routes.json city slug.
 */
export const BUS_ACCESS_HUBS: readonly IntercityAccessHub[] = Object.entries(
  BUS_TERMINAL_COORDS,
).map(([id, coordinates]) => ({
  id,
  mode: "bus" as const,
  coordinates,
  transportZoneId: resolveOriginTransportZone({ coordinates }),
  corridorEndpoint: id,
}));

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

/**
 * Resolves a location (origin or destination) to the corridor slugs it may
 * use, nearest first. Exact municipality wiring leads; then every registered
 * terminal within BUS_ACCESS_RADIUS_KM (50 km) in the same transport zone
 * qualifies — a Kawasaki resident can catch the Tokyo-departing coach, a
 * Nara destination is reachable from the Osaka-arriving one. Multiple
 * candidates matter: the nearest terminal may serve different corridors
 * than the next (Omiya is closer to Ikebukuro but the Tokyo-departing
 * Sendai coach is the usable one). No terminal within the radius (or
 * cross-zone) → empty: unknown stays unknown, and a 50 km catchment can
 * never bridge water to an island (zone gate).
 */
export function resolveBusTerminalSlugs(
  location: { lat: number; lng: number },
  municipalityId?: string,
  radiusKm: number = BUS_ACCESS_RADIUS_KM,
): string[] {
  return resolveNearbyAccessHubs({
    location,
    mode: "bus",
    hubs: BUS_ACCESS_HUBS,
    exactHubIds: municipalityId
      ? [MUNICIPALITY_BUS_SLUG[municipalityId]].filter(Boolean)
      : [],
    radiusKm,
  }).map(({ hub }) => hub.corridorEndpoint);
}
