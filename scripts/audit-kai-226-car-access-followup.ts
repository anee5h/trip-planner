/**
 * KAI-264 safe first-wave candidate expansion — BEFORE/AFTER audit.
 *
 * Baseline (identical cohort classifier to the #325 artifact):
 *   explicit 2 · candidate 383 · unknown 722 (restricted 0, unavailable 0)
 *   unknown cohort: A 399 · B 0 · C 23 · D 32 · E 268 · F 0 · G 0
 *
 * This run reports the AFTER state (safe-candidate policy active) and every
 * cohort movement with its deterministic reason. Cohort bucketing is
 * byte-identical to the #325 artifact classifier; the promotion predicate
 * is the runtime policy (carAccessCandidatePolicy) that CarAccessService
 * uses.
 */
import { writeFileSync } from "node:fs";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  getCarAccess,
  resolveCarAccess,
} from "@/shared/services/transport/CarAccessService";
import { isEndpointSensitive } from "@/shared/services/transport/carAccessCandidatePolicy";
import { resolveDestinationTransportZone } from "@/shared/services/transport/TransportTopologyService";

const MAIN_LAND_ZONES = new Set([
  "mainland-honshu",
  "hokkaido",
  "mainland-kyushu",
  "mainland-shikoku",
]);

const REMOTE_ROOT_TERMS =
  /okinawa|miyako|yaeyama|sado|oki|tsushima|amami|islands|oshima|hatsushima|mikura|hachijo|koshiki|got[oö]|kikaijima|taketomi|ir[oô]mot[/eé]|hateruma|iori/i;

// EXACT #325 cohort classifier (kept identical for baseline comparability;
// the RUNTIME promotion uses the narrower carAccessCandidatePolicy pattern).
const ENDPOINT_TERMS =
  /mountain|summit|peak|trail|trek|hike|ropeway|cable car|waterfall|fall[s]? shrine|temple|jinja|taisha|shrine|on-se|onsen hot spring|garden|park$|observatory|viewpoint|lighthouse|beach|coast|point|port|harbou?r|dam|gorge|valley|canyon|cave|ruins|castle ruins|gujo|kofun|mound|museum|zoo|aquarium|stadium|theme park|amusement|marina|pier|jetty|trailhead/i;

interface Movement {
  reason: string;
  ids: string[];
}

interface Audit {
  before: {
    explicit: number;
    candidate: number;
    unknown: number;
    restricted: number;
    unavailable: number;
  };
  after: typeof before;
  cohort: Record<string, number>;
  movements: {
    a_promoted: Movement;
    a_retained_unknown: Movement;
    c_bridge_connected: Movement;
    c_retained: Movement;
    d_promoted: Movement;
    d_retained: Movement;
    e_unchanged: Movement;
    e_reclassified_into_a: Movement;
    e_needing_endpoint_work: Movement;
    b_g_f_retained: Movement;
  };
}

const all = destinationsIndex as unknown as Destination[];
let after = {
  explicit: 0,
  candidate: 0,
  unknown: 0,
  restricted: 0,
  unavailable: 0,
};
for (const d of all) {
  const kind = resolveCarAccess(d).kind;
  if (kind === "explicit") after.explicit += 1;
  else if (kind === "candidate") after.candidate += 1;
  else if (kind === "restricted") after.restricted += 1;
  else if (kind === "unavailable") after.unavailable += 1;
  else after.unknown += 1;
}

const postUnknown = all.filter((d) => resolveCarAccess(d).kind === "unknown");
const promoted = all.filter(
  (d) =>
    resolveCarAccess(d).kind === "candidate" &&
    getCarAccess(d).evidence === "none",
);
const preUnknownIds = new Set([
  ...postUnknown.map((d) => d.id),
  ...promoted.map((d) => d.id),
]);
const preUnknown = all.filter((d) => preUnknownIds.has(d.id));

function text(d: Destination): string {
  const opts =
    (d.transportOptions as Record<string, unknown> | undefined) ?? {};
  const access = getCarAccess(d);
  return `${d.id} ${d.name ?? ""} ${access.state ?? ""} ${access.eligibility ?? ""} ${Object.keys(opts).join(" ")}`.toLowerCase();
}

function classify(d: Destination): keyof Omit<Audit["cohort"], never> {
  void isEndpointSensitive; // cohort classifier intentionally uses its own pattern
  const access = getCarAccess(d);
  const eligibility = access.eligibility;
  if (eligibility === "restricted" || eligibility === "unavailable") {
    return "f_explicit_restriction";
  }
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
    return "c_remote_island";
  }
  if (!d.coordinates) return "b_ordinary_main_island_without_coordinates";
  if (ENDPOINT_TERMS.test(`${d.id} ${d.name ?? ""}`.toLowerCase())) {
    return "e_likely_endpoint_issue";
  }
  return "a_ordinary_main_island_with_coordinates";
}

const buckets: Record<string, Destination[]> = {};
for (const key of [
  "a_ordinary_main_island_with_coordinates",
  "b_ordinary_main_island_without_coordinates",
  "c_remote_island",
  "d_likely_ferry_required",
  "e_likely_endpoint_issue",
  "f_explicit_restriction",
  "g_genuinely_unknown",
]) {
  buckets[key] = [];
}
for (const d of preUnknown) buckets[classify(d)].push(d);

const promotedSet = new Set(promoted.map((d) => d.id));
const postUnknownSet = new Set(postUnknown.map((d) => d.id));
const keep = (key: keyof typeof buckets, from: Set<string>) =>
  buckets[key].filter((d) => from.has(d.id));
const idsOf = (list: readonly Destination[]) => list.map((d) => d.id);

const aPromoted = keep("a_ordinary_main_island_with_coordinates", promotedSet);
const aRetained = keep(
  "a_ordinary_main_island_with_coordinates",
  postUnknownSet,
);
const cPromoted = keep("c_remote_island", promotedSet);
const cRetained = keep("c_remote_island", postUnknownSet);
const dPromoted = keep("d_likely_ferry_required", promotedSet);
const dRetained = keep("d_likely_ferry_required", postUnknownSet);
const ePromoted = keep("e_likely_endpoint_issue", promotedSet);
const eRetained = keep("e_likely_endpoint_issue", postUnknownSet);
const residualRetained = [
  ...keep("b_ordinary_main_island_without_coordinates", postUnknownSet),
  ...keep("g_genuinely_unknown", postUnknownSet),
  ...keep("f_explicit_restriction", postUnknownSet),
];

const cohort: Record<string, number> = Object.fromEntries(
  Object.entries(buckets).map(([k, v]) => [k, v.length]),
);

const audit: Audit = {
  before: {
    explicit: 2,
    candidate: 383,
    unknown: 722,
    restricted: 0,
    unavailable: 0,
  },
  after,
  cohort,
  movements: {
    a_promoted: {
      reason:
        "Ordinary main-land destination, valid coordinates, no structured negative evidence, not endpoint-sensitive per the runtime policy → candidate_resolvable (attempt/estimate only, never proof).",
      ids: idsOf(aPromoted),
    },
    a_retained_unknown: {
      reason:
        "A-cohort records that stayed unknown after the policy (any present means a promotion blocker fired).",
      ids: idsOf(aRetained),
    },
    c_bridge_connected: {
      reason:
        "Remote-island cohort records that resolved to a bridge-connected major land zone and promoted (bridge-connected islands map to main-land zones; 0 expected).",
      ids: idsOf(cPromoted),
    },
    c_retained: {
      reason:
        "Remote-island / non-major-zone records retained unknown (no continuous-road candidate; ferry/remote stays truthful).",
      ids: idsOf(cRetained),
    },
    d_promoted: {
      reason:
        "Heuristic ferry-text records whose STRUCTURED access data is clean and whose zone is a major land zone → promoted by the structured deterministic policy (name-text ferry mentions are not negative evidence).",
      ids: idsOf(dPromoted),
    },
    d_retained: {
      reason:
        "Ferry-text records retained unknown (structured negative evidence or non-major zone; ferry-only stays unknown/blocked).",
      ids: idsOf(dRetained),
    },
    e_unchanged: {
      reason:
        "Endpoint-sensitive records preserved as-is (no invented parking/entrance/road anchors).",
      ids: idsOf(eRetained),
    },
    e_reclassified_into_a: {
      reason:
        "Endpoints promoted by the runtime policy where the #325 heuristic pattern matched (e.g. plain 'park' names whose catalogue coordinates sit on the ordinary road network). Deterministic per-record reason = runtime policy decision.",
      ids: idsOf(ePromoted),
    },
    e_needing_endpoint_work: {
      reason:
        "Endpoint-sensitive records retained: catalogue coordinate likely not the correct car endpoint; require a later endpoint-resolution task.",
      ids: idsOf(buckets.e_likely_endpoint_issue),
    },
    b_g_f_retained: {
      reason:
        "Residual cohort (no coordinates / genuinely unknown / explicit restriction) retained unknown.",
      ids: idsOf(residualRetained),
    },
  },
};

writeFileSync(
  "scripts/audit/kai-264-safe-candidates-audit.json",
  JSON.stringify(audit, null, 2) + "\n",
);

console.log(
  JSON.stringify(
    {
      before: audit.before,
      after: audit.after,
      cohort,
      a_promoted: aPromoted.length,
      a_retained_unknown: aRetained.length,
      c_bridge_connected: cPromoted.length,
      c_retained: cRetained.length,
      d_promoted: dPromoted.length,
      d_retained: dRetained.length,
      e_unchanged: eRetained.length,
      e_reclassified_into_a: ePromoted.length,
      e_needing_endpoint_work: buckets.e_likely_endpoint_issue.length,
    },
    null,
    2,
  ),
);
