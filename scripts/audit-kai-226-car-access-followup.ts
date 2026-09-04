/**
 * KAI-226 follow-up: classify the current car-access UNKNOWN cohort into
 * product buckets so the residual unknown count can be understood.
 *
 * This is an ANALYSIS artifact only — it does NOT change any authorization
 * rule. The candidate policy itself is discussed in the PR appendix; no
 * eligibility change is implemented here.
 *
 * Buckets (data-driven, deterministic):
 *   A ordinary_main_island_with_coordinates
 *   B ordinary_main_island_without_coordinates
 *   C remote_island                    (zone outside the four main land zones)
 *   D likely_ferry_required            (explicit ferry signal in carAccess/options)
 *   E likely_endpoint_issue            (summit/trail/shrine/ropeway/waterfall-like)
 *   F explicit_restriction             (restricted/unavailable eligibility)
 *   G genuinely_unknown
 */
import { writeFileSync } from "node:fs";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  getCarAccess,
  resolveCarAccess,
} from "@/shared/services/transport/CarAccessService";
import { resolveDestinationTransportZone } from "@/shared/services/transport/TransportTopologyService";

const MAIN_LAND_ZONES = new Set([
  "mainland-honshu",
  "hokkaido",
  "mainland-kyushu",
  "mainland-shikoku",
]);

const REMOTE_ROOT_TERMS =
  /okinawa|miyako|yaeyama|sado|oki|tsushima|amami|islands|oshima|hatsushima|mikura|hachijo|koshiki|got[oö]|kikaijima|taketomi|ir[oô]mot[/eé]|hateruma|iori/i;

const ENDPOINT_TERMS =
  /mountain|summit|peak|trail|trek|hike|ropeway|cable car|waterfall|fall[s]? shrine|temple|jinja|taisha|shrine|on-se|onsen hot spring|garden|park$|observatory|viewpoint|lighthouse|beach|coast|point|port|harbou?r|dam|gorge|valley|canyon|cave|ruins|castle ruins|gujo|kofun|mound|museum|zoo|aquarium|stadium|theme park|amusement|marina|pier|jetty|trailhead/i;

interface Buckets {
  a_ordinary_main_island_with_coordinates: string[];
  b_ordinary_main_island_without_coordinates: string[];
  c_remote_island: string[];
  d_likely_ferry_required: string[];
  e_likely_endpoint_issue: string[];
  f_explicit_restriction: string[];
  g_genuinely_unknown: string[];
}

const buckets: Buckets = {
  a_ordinary_main_island_with_coordinates: [],
  b_ordinary_main_island_without_coordinates: [],
  c_remote_island: [],
  d_likely_ferry_required: [],
  e_likely_endpoint_issue: [],
  f_explicit_restriction: [],
  g_genuinely_unknown: [],
};

function text(d: Destination): string {
  const opts =
    (d.transportOptions as Record<string, unknown> | undefined) ?? {};
  const access = getCarAccess(d);
  return `${d.id} ${d.name ?? ""} ${access.state ?? ""} ${access.eligibility ?? ""} ${Object.keys(opts).join(" ")}`.toLowerCase();
}

function classify(d: Destination): keyof Buckets {
  const access = getCarAccess(d);
  const resolution = resolveCarAccess(d);
  const eligibility = access.eligibility ?? resolution.kind;
  if (eligibility === "restricted" || eligibility === "unavailable") {
    return "f_explicit_restriction";
  }

  // Ferry signal: explicit access state or transportOptions/localAccessModes.
  const haystack = text(d);
  if (/ferry/.test(haystack) || /boat|ship|jetfoil/.test(haystack)) {
    return "d_likely_ferry_required";
  }

  const zone = resolveDestinationTransportZone(d);
  if (!zone) {
    return d.coordinates
      ? "g_genuinely_unknown"
      : "b_ordinary_main_island_without_coordinates";
  }
  if (!MAIN_LAND_ZONES.has(zone)) {
    if (REMOTE_ROOT_TERMS.test(`${d.id} ${d.name ?? ""}`.toLowerCase())) {
      return "c_remote_island";
    }
    // A non-main zone without an explicit remote term still cannot be on a
    // continuous road network from Honshu.
    return "c_remote_island";
  }

  if (!d.coordinates) return "b_ordinary_main_island_without_coordinates";

  if (ENDPOINT_TERMS.test(`${d.id} ${d.name ?? ""}`.toLowerCase())) {
    return "e_likely_endpoint_issue";
  }

  return "a_ordinary_main_island_with_coordinates";
}

const all = destinationsIndex as unknown as Destination[];
for (const d of all) {
  const resolution = resolveCarAccess(d);
  if (resolution.kind !== "unknown") continue; // only the unknown cohort
  buckets[classify(d)].push(d.id);
}

const counts = Object.fromEntries(
  Object.entries(buckets).map(([k, v]) => [k, v.length]),
) as Record<string, number>;

const artifact = {
  generatedAt: new Date().toISOString().slice(0, 10),
  catalogueRecordCount: all.length,
  scope: "current unknown cohort only (KAI-264 audit on main)",
  note: "Analysis-only classification; no authorization rule changed. Buckets use deterministic data heuristics (zone membership, explicit ferry signals, endpoint-like name terms). Bucket E is a heuristic flag for likely POI-coordinate/road-endpoint mismatch — it does not prove such a mismatch.",
  buckets,
  counts,
};

writeFileSync(
  "scripts/audit/kai-226-car-access-followup-audit.json",
  JSON.stringify(artifact, null, 2) + "\n",
);
console.log("unknown cohort classified:", JSON.stringify(counts, null, 2));
