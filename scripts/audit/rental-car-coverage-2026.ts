/**
 * Rental-car discovery coverage audit (corrected semantics).
 *
 * Classification per (origin, destination):
 *   estimated_car_arc        — chain estimated AND a car arc exists for the pair
 *   estimated_km             — chain estimated from the same-zone km estimator
 *   intentional_cross_water  — ferry-only island destination (no fixed road link)
 *   intentional_out_of_scope — explicit deterministic rule: prefecture centroid
 *                              beyond the 300 km discovery envelope from the
 *                              origin centroid, or a road-plausibility override
 *                              (documented detour-dominated pair)
 *   coverage_gap (FAIL)      — in-scope pair with NO car arc and NO estimate
 *   resolver_failure (FAIL)  — arc exists but the resolver returned unknown
 *
 * CI must fail when coverage_gap > 0 or resolver_failure > 0.
 */
import fs from "node:fs";
import {
  getTravelDurationEvidence,
  getCarZoneArcEstimate,
} from "../../src/shared/services/recommendation/TripDurationService";
import { getRoutableCarAccessAnchors } from "../../src/shared/services/transport/CarAccessService";
import {
  resolveDestinationTransportZone,
  zoneById,
} from "../../src/shared/services/transport/TransportTopologyService";
import { getGroundRoute } from "../../src/shared/services/transport/GroundRouteEstimator";
import { getDistance } from "../../src/shared/utils/distance";

const index = JSON.parse(
  fs.readFileSync("src/shared/data/destinations-index.json", "utf8"),
) as Array<Record<string, any>>;

const ORIGINS: Array<[string, { lat: number; lng: number }]> = [
  ["tokyo", { lat: 35.6812, lng: 139.7671 }],
  ["kanagawa", { lat: 35.4664, lng: 139.6223 }],
  ["osaka", { lat: 34.6937, lng: 135.5023 }],
  ["hiroshima", { lat: 34.3975, lng: 132.4756 }],
  ["fukuoka", { lat: 33.5897, lng: 130.4208 }],
];

const FIXED_LINK = new Set<string>(["awaji"]);
/** Product discovery envelope: prefecture centroid within 300 km straight-line. */
const SCOPE_RADIUS_KM = 300;
/**
 * Road-plausibility overrides: centroid inside the radius, but the practical
 * through-road is detour-dominated (no direct corridor; would exceed the
 * discovery driving envelope).
 */
const EXPLICIT_OUT_OF_SCOPE_PAIRS = new Set<string>([
  "fukuoka:kochi", // Seto-Chuo detour via Kyushu/Oita ≈ 380 km road
  "hiroshima:miyazaki", // Kyushu Expressway detour > 360 km road
  "hiroshima:oita", // detour via Kyushu corridor > 320 km road
  "fukuoka:shimane", // Chugoku→San-in detour ≈ 350 km road (no direct corridor)
]);

const SUBZONES: Record<string, string> = {
  "Gunma:minakami": "gunma_northwest",
  "Gunma:nakanojo": "gunma_northwest",
  "Gunma:shibukawa": "gunma_northwest",
  "Gunma:numata": "gunma_northwest",
  "Gunma:katashina": "gunma_northwest",
  "Gunma:kusatsu": "gunma_northwest",
  "Gunma:naganohara": "gunma_northwest",
  "Gunma:tsumagoi": "gunma_northwest",
  "Gunma:tone": "gunma_northeast",
  "Gunma:kawaba": "gunma_northeast",
};

function carArcKeyFor(d: Record<string, any>): string | null {
  const pk = (d.prefecture ?? "").toLowerCase();
  if (!pk) return null;
  if (pk !== "gunma") return pk;
  return (d.municipalityId && SUBZONES[d.municipalityId]) || "gunma_south";
}

// Prefecture centroids from the catalogue itself (deterministic).
const prefectureCentroids = new Map<string, { lat: number; lng: number }>();
for (const d of index) {
  const p = d.prefecture;
  if (!p || !d.coordinates?.lat) continue;
  const c = prefectureCentroids.get(p) ?? { lat: 0, lng: 0, n: 0 };
  c.lat += d.coordinates.lat;
  c.lng += d.coordinates.lng;
  c.n += 1;
  prefectureCentroids.set(p, c);
}
const centroidOf = (p: string) => {
  const c = prefectureCentroids.get(p);
  if (!c || c.n === 0) return null;
  return { lat: c.lat / c.n, lng: c.lng / c.n };
};

const all = index as any[];
const totals: Record<string, number> = {
  estimated_car_arc: 0,
  estimated_km: 0,
  intentional_cross_water: 0,
  intentional_out_of_scope: 0,
  coverage_gap: 0,
  resolver_failure: 0,
};

for (const [originLabel, originCoords] of ORIGINS) {
  const stats: Record<string, number> = {
    estimated_car_arc: 0,
    estimated_km: 0,
    intentional_cross_water: 0,
    intentional_out_of_scope: 0,
    intentional_no_local_estimate: 0,
    coverage_gap: 0,
    resolver_failure: 0,
  };
  const gapIds: string[] = [];
  const failureIds: string[] = [];

  for (const d of all.filter(
    (x) => getRoutableCarAccessAnchors(x).length > 0,
  )) {
    if (d.localAccessUnestimated === true) {
      stats.intentional_no_local_estimate += 1;
      continue;
    }
    const evidence = getTravelDurationEvidence(
      d,
      { homeStationCoords: originCoords },
      ["car"],
    );
    const arcKey = carArcKeyFor(d);
    const arc = arcKey ? getGroundRoute(originLabel, arcKey, "car") : null;

    if (evidence.evidence !== "unknown") {
      const bucket = arc ? "estimated_car_arc" : "estimated_km";
      stats[bucket] += 1;
      continue;
    }

    const zoneId = resolveDestinationTransportZone(d);
    const zone = zoneById.get(zoneId);
    if (zone?.isIsland && !FIXED_LINK.has(zoneId)) {
      stats.intentional_cross_water += 1;
      continue;
    }

    const centroid = centroidOf(d.prefecture ?? "");
    const scoped =
      centroid !== null &&
      getDistance(
        originCoords.lat,
        originCoords.lng,
        centroid.lat,
        centroid.lng,
      ) <= SCOPE_RADIUS_KM &&
      !EXPLICIT_OUT_OF_SCOPE_PAIRS.has(
        `${originLabel}:${(d.prefecture ?? "").toLowerCase()}`,
      );
    if (!scoped) {
      stats.intentional_out_of_scope += 1;
      continue;
    }

    if (arc) {
      stats.resolver_failure += 1;
      failureIds.push(d.id);
    } else {
      stats.coverage_gap += 1;
      gapIds.push(d.id);
    }
  }

  for (const k of Object.keys(totals)) totals[k] += stats[k];
  console.log(
    `Origin: ${originLabel}\n` +
      `  car-capable: ${all.filter((x) => getRoutableCarAccessAnchors(x).length > 0).length}\n` +
      `  estimated_car_arc: ${stats.estimated_car_arc}\n` +
      `  estimated_km: ${stats.estimated_km}\n` +
      `  intentional_cross_water: ${stats.intentional_cross_water}\n` +
      `  intentional_out_of_scope: ${stats.intentional_out_of_scope}\n` +
      `  intentional_no_local_estimate: ${stats.intentional_no_local_estimate}\n` +
      `  coverage_gap: ${stats.coverage_gap}${gapIds.length ? " " + gapIds.slice(0, 12).join(", ") : ""}\n` +
      `  resolver_failure: ${stats.resolver_failure}${failureIds.length ? " " + failureIds.slice(0, 12).join(", ") : ""}`,
  );
}

console.log(
  `\nTOTALS: arc=${totals.estimated_car_arc} km=${totals.estimated_km} cross_water=${totals.intentional_cross_water} out_of_scope=${totals.intentional_out_of_scope} coverage_gap=${totals.coverage_gap} resolver_failure=${totals.resolver_failure}`,
);
process.exit(totals.coverage_gap > 0 || totals.resolver_failure > 0 ? 1 : 0);
