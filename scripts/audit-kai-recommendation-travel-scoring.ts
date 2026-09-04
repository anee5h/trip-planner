/**
 * PHASE 1 AUDIT (before mutation): Home weekend recommendation scoring from
 * Nakayama AND Tokyo, Personal Car, 2D1N/3D2N — full decomposition incl.
 * straight-line (haversine) ranking-only proxy.
 */
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { calculateScore } from "@/shared/services/recommendation/RecommendationScorer";
import {
  evaluateWeekendCandidate,
  type WeekendTravelBand,
} from "@/shared/services/recommendation/WeekendPolicy";
import { getBestOneWayTravelMinutes } from "@/shared/services/recommendation/TripDurationService";
import type { TripDuration } from "@/shared/types/tripDuration";

const all = destinationsIndex as unknown as Destination[];

const WATCH = [
  "hakone-town",
  "karuizawa-town",
  "mount-fuji",
  "ito-city",
  "nagoya-city",
  "osaka-city",
  "kyoto-city",
  "sendai-city",
  "niigata-city",
];

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function context(origin: { lat: number; lng: number }, duration: TripDuration) {
  return {
    vibe: "any",
    budget: 1e9,
    carMode: "my_car",
    publicModes: [] as string[],
    partySize: 2,
    budgetTier: "luxury",
    tripDuration: duration,
    homeStationCoords: origin,
    originZoneId: "mainland-honshu",
    visitedIds: [] as string[],
    currentWeather: null,
  } as never;
}

const ORIGINS = {
  Nakayama: { lat: 35.5192, lng: 139.5393 },
  Tokyo: { lat: 35.6812, lng: 139.7671 },
};

function run(
  originName: string,
  origin: { lat: number; lng: number },
  duration: TripDuration,
) {
  const results = getRecommendations(all, context(origin, duration));
  const rankOf = new Map(results.map((r, i) => [r.id, i]));
  const scoreOf = new Map(results.map((r) => [r.id, r.score]));
  console.log(`\n===== ${originName} ${duration} =====`);
  console.log(
    "top10:",
    results
      .slice(0, 10)
      .map((r) => `${r.id}(${Math.round(r.score)})`)
      .join(", "),
  );
  for (const id of WATCH) {
    const dest = all.find((d) => d.id === id);
    if (!dest) continue;
    const ctx = context(origin, duration);
    const base = calculateScore(dest, ctx).score;
    const evalW = evaluateWeekendCandidate(
      dest,
      ctx,
      all,
      ["my_car"],
      undefined,
    );
    const minutes = getBestOneWayTravelMinutes(
      dest,
      { homeStationCoords: origin, originZoneId: "mainland-honshu" },
      ["my_car"],
    );
    const km = dest.coordinates
      ? haversineKm(origin, dest.coordinates)
      : undefined;
    const final = scoreOf.get(id) ?? 0;
    console.log(
      `${id}: rank=${rankOf.get(id) ?? "-"} final=${Math.round(final)} base=${Math.round(base)} | min=${minutes ?? "undef"} straightKm=${km === undefined ? "-" : Math.round(km)} | travel=${Math.round(evalW.travelScore)} (${evalW.travelFit.band as WeekendTravelBand}) | cap=${Math.round(evalW.capacityScore)} | Δ=${Math.round(evalW.scoreDelta)}`,
    );
  }
}

for (const [name, origin] of Object.entries(ORIGINS)) {
  run(name, origin, "2d1n");
  run(name, origin, "3d2n");
}
