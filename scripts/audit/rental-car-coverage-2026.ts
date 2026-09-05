/**
 * Rental-car discovery coverage audit (post SafeGround-car-arcs).
 *
 * For every supported origin: enumerate car-capable destinations, resolve
 * their discovery travel-duration evidence WITHOUT any provider, and
 * classify: arc/km estimated / intentionally unavailable / unexpected.
 *
 * Invariant: unexpected unavailable === 0 for pairs covered by the
 * supported geography (an arc exists for the pair).
 */
import fs from "node:fs";
import { getTravelDurationEvidence } from "../../src/shared/services/recommendation/TripDurationService";
import { getRoutableCarAccessAnchors } from "../../src/shared/services/transport/CarAccessService";
import {
  resolveDestinationTransportZone,
  zoneById,
} from "../../src/shared/services/transport/TransportTopologyService";
import { getGroundRoute } from "../../src/shared/services/transport/GroundRouteEstimator";

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

function prefectureKey(prefecture: string): string {
  return prefecture.toLowerCase();
}

function carArcKeyFor(d: Record<string, any>): string | null {
  const pk = prefectureKey(d.prefecture ?? "");
  if (!pk) return null;
  if (pk !== "gunma" || !d.municipalityId) return pk;
  const subzones: Record<string, string> = {
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
  return subzones[d.municipalityId] ?? "gunma_south";
}

const all = index as any[];
let totalUnexpected = 0;

for (const [originLabel, originCoords] of ORIGINS) {
  const carCapable = all.filter(
    (d) => getRoutableCarAccessAnchors(d).length > 0,
  );
  let estimated = 0;
  let intentional = 0;
  let unexpected = 0;
  const unexpectedIds: string[] = [];

  for (const d of carCapable) {
    const evidence = getTravelDurationEvidence(
      d,
      { homeStationCoords: originCoords },
      ["car"],
    );
    if (evidence.evidence !== "unknown") {
      estimated += 1;
      continue;
    }
    const zoneId = resolveDestinationTransportZone(d);
    const zone = zoneById.get(zoneId);
    if (zone?.isIsland && !FIXED_LINK.has(zoneId)) {
      intentional += 1; // ferry-only island: cross-water stays unavailable.
      continue;
    }
    const arc = getGroundRoute(originLabel, carArcKeyFor(d) ?? "", "car");
    if (!arc) {
      intentional += 1; // unsupported pair: no defensive estimate exists.
      continue;
    }
    unexpected += 1; // arc exists for this pair but no estimate resolved.
    unexpectedIds.push(d.id);
  }

  totalUnexpected += unexpected;
  console.log(
    `Origin: ${originLabel}\n` +
      `  car-capable destinations: ${carCapable.length}\n` +
      `  estimated: ${estimated}\n` +
      `  intentionally unavailable: ${intentional}\n` +
      `  unexpected unavailable: ${unexpected}${unexpectedIds.length ? " " + unexpectedIds.join(", ") : ""}`,
  );
}

console.log(`\nTOTAL UNEXPECTED UNAVAILABLE: ${totalUnexpected}`);
process.exit(totalUnexpected === 0 ? 0 : 1);
