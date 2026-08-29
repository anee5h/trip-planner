import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import type { Destination } from "../../src/shared/types/destination";

const ROOT = path.resolve(import.meta.dirname, "../..");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");
const OUTPUT_PATH =
  process.env.KAI252_OUTPUT ??
  path.join(ROOT, "scripts/audit/kai-252-local-transport-manifest.json");
const CHECKED_AT = "2026-08-29";
const EXPECTED_TOTAL = 1057;
const EXPECTED_RESIDUAL = 1029;
const PREDECESSOR_RESIDUAL_PATH = path.join(
  ROOT,
  "scripts/audit/kai-251-residual-local-transport.json",
);
const CACHE_PATH =
  process.env.KAI252_CACHE ??
  path.join(ROOT, "scripts/audit/kai-252-source-cache.json");

const COHORTS = {
  A: "likely verified walking",
  B: "likely no separate local transport / N/A",
  C: "obvious single required rail/subway",
  D: "obvious required bus/shuttle",
  E: "ropeway/cablecar/funicular candidate",
  F: "ferry/boat/island access candidate",
  G: "multiple required paid segments candidate",
  H: "nature/mountain/rural access candidate",
  I: "ambiguous canonical arrival",
  J: "context-dependent city access",
  K: "potentially bounded-defensible fare candidate",
  L: "closures/suspended service candidate",
  M: "evidence-conflict / deep research",
  N: "likely unavailable / no authoritative path",
} as const;

type Cohort = keyof typeof COHORTS;
type ResidualReason =
  | "fare_unavailable"
  | "ambiguous_canonical_arrival"
  | "context_dependent_access"
  | "route_unavailable"
  | "temporarily_closed"
  | "service_suspended"
  | "bundled_product_unrepresentable"
  | "incomplete_required_segments"
  | "evidence_conflict"
  | "origin_topology_gap"
  | "no_current_saleable_product";

type SourceAttempt = {
  url: string;
  checkedAt: string;
  authority: string;
  pathKind:
    | "catalogue_official"
    | "catalogue_editorial"
    | "derived_access"
    | "source_missing";
  outcome: "retrieved" | "fetch_failed" | "source_missing";
  status?: number;
  finalUrl?: string;
  established: string;
  remainsUnknown: string;
  excerpt?: string;
};

type LocalTransportUnavailable = {
  kind: "unavailable";
  reason:
    | "no_on_site_evidence"
    | "untrusted_legacy_only"
    | "island_no_rail"
    | "corridor_only"
    | "distance_beyond_model"
    | "fare_not_found"
    | "other";
  detail: string;
};

type LedgerEntry = {
  id: string;
  identity: { name: string; kind?: string; role?: string };
  decision: "author";
  cohort: Cohort;
  cohortLabel: string;
  cohortIsInventoryAidOnly: true;
  canonicalArrivalAccessPoint: string;
  canonicalArrivalResolved: boolean;
  accessPatternResearched: string;
  sourceAttempts: SourceAttempt[];
  closureOrSuspension: { applies: boolean; detail: string };
  residualReason: ResidualReason;
  reason: string;
  whyVerifiedWalkingIsInappropriate: string;
  whyNotApplicableIsInappropriate: string;
  whyVerifiedRequiredAccessIsInappropriate: string;
  whyBoundedDefensibleAccessIsInappropriate: string;
  whySegmentOnlyIsInsufficient: string;
  blocker: "localTransport_evidence" | "origin_topology";
  fact: LocalTransportUnavailable;
};

type FetchResult = {
  outcome: SourceAttempt["outcome"];
  status?: number;
  finalUrl?: string;
  hasAccessTerms: boolean;
  hasFareTerms: boolean;
  hasWalkTerms: boolean;
  hasClosureTerms: boolean;
  excerpt?: string;
  error?: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textFor(d: Destination): string {
  return normalize(
    [
      d.name,
      d.nameJa,
      d.kind,
      d.role,
      d.municipalityId,
      d.notes,
      d.notesJa,
      d.description,
      d.description,
      d.localAccessModes?.join(" "),
      d.transportZoneId,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function sourceAuthority(url: string, kind: SourceAttempt["pathKind"]): string {
  if (kind === "source_missing") return "catalogue metadata";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".go.jp") || host === "go.jp") return "government";
    if (host.endsWith(".lg.jp") || host === "lg.jp") return "municipality";
    if (host.includes("japan.travel") || host.includes("japan-guide"))
      return "tourism/secondary";
    return "operator or published source";
  } catch {
    return "unclassified source";
  }
}

function candidateUrls(d: Destination): Array<{
  url: string;
  pathKind: SourceAttempt["pathKind"];
}> {
  const result: Array<{
    url: string;
    pathKind: SourceAttempt["pathKind"];
  }> = [];
  if (d.officialWebsite) {
    result.push({ url: d.officialWebsite, pathKind: "catalogue_official" });
    // Keep the sweep bounded and reproducible: the catalogue root plus the
    // two conventional access paths. The resulting ledger records every
    // attempted path; semantic facts still require manual source review.
    const paths = ["access/", "en/access/"];
    for (const relative of paths) {
      try {
        result.push({
          url: new URL(relative, d.officialWebsite).toString(),
          pathKind: "derived_access",
        });
      } catch {
        // Invalid catalogue URLs are recorded through the root attempt.
      }
    }
  }
  for (const source of d.editorial?.sources ?? []) {
    result.push({ url: source.url, pathKind: "catalogue_editorial" });
  }
  if (result.length === 0) {
    result.push({
      url: `catalogue://missing-official-source/${d.id}`,
      pathKind: "source_missing",
    });
  }
  const seen = new Set<string>();
  return result.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function classifyCohort(d: Destination): Cohort {
  const id = d.id;
  const t = textFor(d).toLowerCase();
  if (id === "tokyo-skytree-sumida") return "I";
  if (id === "meiji-jingu" || id === "tsukiji-outer-market") return "J";
  if (id === "sapporo-beer-museum") return "K";
  if (/closed|suspend|休館|閉鎖|運休|休止/.test(t)) return "L";
  if (d.editorial?.freshness === "conflicting") return "M";
  if (d.transportFares && Object.keys(d.transportFares).length > 0) return "K";
  const modes = new Set(d.localAccessModes ?? []);
  if (
    modes.has("ferry") ||
    d.kind === "island" ||
    /ferry|boat|island|島|船/.test(t)
  )
    return "F";
  if (
    /ropeway|cable.?car|funicular|gondola|ロープウェイ|ケーブルカー|リフト/.test(
      t,
    )
  )
    return "E";
  if (modes.size > 1) return "G";
  if (modes.has("bus") || /shuttle|bus|バス|シャトル/.test(t)) return "D";
  if (
    modes.has("train") ||
    modes.has("shinkansen") ||
    /rail|subway|station|鉄道|地下鉄|駅/.test(t)
  )
    return "C";
  if (
    d.walkingMetadata?.method === "manual" ||
    /directly connected|minutes? walk|on foot|徒歩|直結/.test(t)
  )
    return "A";
  if (d.placeType === "hub" || d.role === "hub" || d.kind === "station")
    return "B";
  if (
    [
      "mountain",
      "nature",
      "natural",
      "lake",
      "waterfall",
      "cliff",
      "rock_formation",
      "cape",
      "beach",
      "village",
      "historic_town",
    ].includes(d.kind ?? "")
  )
    return "H";
  if (["city", "ward", "town", "district", "street"].includes(d.kind ?? ""))
    return "J";
  if (!d.officialWebsite && !(d.editorial?.sources?.length ?? 0)) return "N";
  return "M";
}

function canonicalArrival(d: Destination): {
  value: string;
  resolved: boolean;
  blocker: LedgerEntry["blocker"];
} {
  if (d.id === "sapporo-beer-museum") {
    return {
      value:
        "Sapporo Station-area arrival; official access continues by JR to Naebo or Chuo Bus to Sapporo Beer Garden, then a documented walk",
      resolved: true,
      blocker: "localTransport_evidence",
    };
  }
  if (d.id === "tokyo-skytree-sumida") {
    return {
      value:
        "Tokyo:sumida destination has no canonical intercity arrival hub in the current catalogue topology; Oshiage/Tokyo Skytree is the operator endpoint, not a substituted origin hub",
      resolved: false,
      blocker: "origin_topology",
    };
  }
  if (d.id === "meiji-jingu") {
    return {
      value:
        "Tokyo:shibuya arrival mapping remains unresolved; operator lists Harajuku, Meiji-jingumae, Kita-sando, and Yoyogi-side entrances",
      resolved: false,
      blocker: "origin_topology",
    };
  }
  if (d.id === "tsukiji-outer-market") {
    return {
      value:
        "Tokyo central arrival context unresolved; operator lists multiple rail entrances plus Tokyo Station and Shimbashi/Kinshicho bus contexts",
      resolved: false,
      blocker: "origin_topology",
    };
  }
  const parent = d.relationships?.parentDestinationId;
  if (parent) {
    return {
      value: `Catalogue parent ${parent}; exact destination access remains the localTransport evidence question`,
      resolved: true,
      blocker: "localTransport_evidence",
    };
  }
  if (d.municipalityId) {
    return {
      value: `${d.municipalityId} municipality; destination-level localTransport evidence is researched separately without substituting an unrecorded hub`,
      resolved: true,
      blocker: "localTransport_evidence",
    };
  }
  return {
    value: "No canonical arrival/access point is recorded in the catalogue",
    resolved: false,
    blocker: "origin_topology",
  };
}

function accessPattern(d: Destination, cohort: Cohort): string {
  const modes = d.localAccessModes?.join(", ");
  return normalize(
    `Inventory hypothesis only (not promoted to a fact): cohort ${cohort} (${COHORTS[cohort]}); kind=${d.kind ?? "missing"}; role=${d.role ?? "missing"}; localAccessModes=${modes ?? "not recorded"}; source-backed access pattern requires record-specific confirmation.`,
  );
}

function residualReason(
  d: Destination,
  cohort: Cohort,
  canonical: ReturnType<typeof canonicalArrival>,
): ResidualReason {
  if (d.id === "sapporo-beer-museum") return "fare_unavailable";
  if (d.id === "tokyo-skytree-sumida") return "ambiguous_canonical_arrival";
  if (d.id === "meiji-jingu" || d.id === "tsukiji-outer-market")
    return "context_dependent_access";
  if (canonical.blocker === "origin_topology" && cohort === "J")
    return "context_dependent_access";
  if (d.editorial?.freshness === "conflicting") return "evidence_conflict";
  if (canonical.blocker === "origin_topology") return "origin_topology_gap";
  if (fetches.some((fetch) => fetch.hasClosureTerms))
    return "temporarily_closed";
  if (["E", "F", "G", "H"].includes(cohort))
    return "incomplete_required_segments";
  return "fare_unavailable";
}

function runtimeReason(
  reason: ResidualReason,
): LocalTransportUnavailable["reason"] {
  if (reason === "incomplete_required_segments") return "other";
  if (
    reason === "origin_topology_gap" ||
    reason === "ambiguous_canonical_arrival"
  )
    return "other";
  if (reason === "context_dependent_access") return "corridor_only";
  if (reason === "no_current_saleable_product") return "no_on_site_evidence";
  if (reason === "temporarily_closed" || reason === "service_suspended")
    return "other";
  if (reason === "evidence_conflict") return "other";
  return "fare_not_found";
}

function excerptFor(text: string): string | undefined {
  const cleaned = normalize(text.replace(/\[[^\]]*\]/g, " "));
  const match = cleaned.match(
    /.{0,100}(access|交通|行き方|fare|料金|運賃|walk|徒歩|closed|休館|suspend|運休).{0,180}/i,
  );
  return match ? normalize(match[0]) : cleaned.slice(0, 240);
}

async function fetchOne(url: string): Promise<FetchResult> {
  if (url.startsWith("catalogue://"))
    return {
      outcome: "source_missing",
      hasAccessTerms: false,
      hasFareTerms: false,
      hasWalkTerms: false,
      hasClosureTerms: false,
    };
  try {
    const retrievalUrl = `https://r.jina.ai/${url}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const bodyDeadline = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(retrievalUrl, {
          headers: { "user-agent": "Meguruto-KAI-252-research/1.0" },
          redirect: "follow",
          signal: controller.signal,
        });
        const text = await Promise.race([
          response.text(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("body_read_timeout")), 20_000),
          ),
        ]);
        const lower = text.toLowerCase();
        const jinaRateLimited =
          /ratelimittriggerederror|per ip rate limit exceeded/i.test(text);
        if (jinaRateLimited) {
          return {
            outcome: "fetch_failed",
            status: 429,
            finalUrl: response.url,
            hasAccessTerms: false,
            hasFareTerms: false,
            hasWalkTerms: false,
            hasClosureTerms: false,
            excerpt: excerptFor(text),
            error: "jina_rate_limited",
          };
        }
        if (response.status === 429 && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, (attempt + 1) * 1500),
          );
          continue;
        }
        return {
          outcome: response.ok ? "retrieved" : "fetch_failed",
          status: response.status,
          finalUrl: response.url,
          hasAccessTerms: /access|交通|行き方|アクセス/.test(lower),
          hasFareTerms: /fare|料金|運賃|price|¥|円|jpy/.test(lower),
          hasWalkTerms: /walk|on foot|minutes|徒歩|分/.test(lower),
          hasClosureTerms: /closed|suspend|休館|閉鎖|運休|休止/.test(lower),
          excerpt: excerptFor(text),
        };
      } finally {
        clearTimeout(bodyDeadline);
      }
    }
    throw new Error("retry_exhausted");
  } catch (error) {
    return {
      outcome: "fetch_failed",
      hasAccessTerms: false,
      hasFareTerms: false,
      hasWalkTerms: false,
      hasClosureTerms: false,
      error: error instanceof Error ? error.name : "fetch_error",
    };
  }
}

async function fetchAll(urls: string[]): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor;
      cursor += 1;
      const url = urls[index];
      results.set(url, await fetchOne(url));
    }
  };
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  return results;
}

function buildSourceAttempt(
  candidate: { url: string; pathKind: SourceAttempt["pathKind"] },
  result: FetchResult,
): SourceAttempt {
  const signalSummary = [
    result.hasAccessTerms
      ? "access terminology present"
      : "no access terminology detected",
    result.hasFareTerms
      ? "fare/price terminology present"
      : "no fare/price terminology detected",
    result.hasWalkTerms
      ? "walking terminology present"
      : "no walking terminology detected",
    result.hasClosureTerms
      ? "closure/suspension terminology present"
      : "no closure/suspension terminology detected",
  ].join("; ");
  const established =
    result.outcome === "retrieved"
      ? `Retrieved HTTP ${result.status ?? "2xx"}; ${signalSummary}. This automated pass did not promote any semantic route or fare decision.`
      : result.outcome === "source_missing"
        ? "The catalogue contains no official or editorial source URL for this record."
        : `The path could not be retrieved (${result.error ?? `HTTP ${result.status ?? "unknown"}`}); no claim was inferred from the failure.`;
  return {
    url: candidate.url,
    checkedAt: CHECKED_AT,
    authority: sourceAuthority(candidate.url, candidate.pathKind),
    pathKind: candidate.pathKind,
    outcome: result.outcome,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.finalUrl ? { finalUrl: result.finalUrl } : {}),
    established,
    remainsUnknown:
      "A current authoritative source tying the exact canonical arrival/access point to every required local segment and its ordinary-adult saleable fare remains unresolved.",
    ...(result.excerpt ? { excerpt: result.excerpt } : {}),
  };
}

function makeEntry(
  d: Destination,
  fetchMap: Map<string, FetchResult>,
): LedgerEntry {
  const cohort = classifyCohort(d);
  const canonical = canonicalArrival(d);
  const candidates = candidateUrls(d);
  const attempts = candidates.map((candidate) =>
    buildSourceAttempt(
      candidate,
      fetchMap.get(candidate.url) ?? {
        outcome: "fetch_failed",
        hasAccessTerms: false,
        hasFareTerms: false,
        hasWalkTerms: false,
        hasClosureTerms: false,
        error: "missing_fetch_result",
      },
    ),
  );
  const reason = residualReason(d, cohort, canonical);
  const runtime = runtimeReason(reason);
  const topology = canonical.blocker === "origin_topology";
  return {
    id: d.id,
    identity: {
      name: d.name,
      ...(d.kind === undefined ? {} : { kind: d.kind }),
      ...(d.role === undefined ? {} : { role: d.role }),
    },
    decision: "author",
    cohort,
    cohortLabel: COHORTS[cohort],
    cohortIsInventoryAidOnly: true,
    canonicalArrivalAccessPoint: canonical.value,
    canonicalArrivalResolved: canonical.resolved,
    accessPatternResearched: accessPattern(d, cohort),
    sourceAttempts: attempts,
    closureOrSuspension: {
      applies:
        reason === "temporarily_closed" || reason === "service_suspended",
      detail:
        reason === "temporarily_closed" || reason === "service_suspended"
          ? "A retrieved source contained closure/suspension terminology; the current saleable access product was not promoted."
          : "No closure or suspension was used as a basis for this residual decision in the retained checks.",
    },
    residualReason: reason,
    reason: topology
      ? "The current origin/topology model does not provide a defensible canonical access context for a destination-level localTransport fact."
      : "The retained authoritative-source attempts did not establish a truthful complete destination-specific localTransport fare envelope; no numeric, walking, or N/A fact was fabricated.",
    whyVerifiedWalkingIsInappropriate:
      "The retained evidence does not establish practical pedestrian access from one resolved canonical arrival point to the represented destination; coordinates, walkingMin, proximity, and model routes are not used as proof.",
    whyNotApplicableIsInappropriate:
      "A separate destination-specific access leg has not been disproved. Treating missing fare evidence as N/A would conflate unknown with no transport.",
    whyVerifiedRequiredAccessIsInappropriate:
      "No current authoritative route-specific fare and complete required-segment envelope was retained for the resolved canonical context; legacy transportOptions and generic city fares are excluded.",
    whyBoundedDefensibleAccessIsInappropriate:
      "No authoritative fare-zone or published bounded envelope was proven for the exact required route. Distance, coordinates, minutes, typical-city fares, and arbitrary ranges are excluded.",
    whySegmentOnlyIsInsufficient:
      "Any isolated route signal does not establish that all required access segments are covered. A segment_only fact would be insufficient unless a known required paid segment was independently saleable and meaningful for the canonical context; no such partial fact was promoted in this pass.",
    blocker: canonical.blocker,
    fact: {
      kind: "unavailable",
      reason: runtime,
      detail: `KAI-252 residual ${reason}: evidence ledger records the attempted authoritative paths and the unresolved canonical access/fare boundary; no fabricated fare or zero value is used.`,
    },
  };
}

async function main(): Promise<void> {
  const destinations = readJson<Destination[]>(INDEX_PATH);
  if (destinations.length !== EXPECTED_TOTAL)
    throw new Error(
      `Expected ${EXPECTED_TOTAL} catalogue records; found ${destinations.length}`,
    );
  const predecessorResidual = readJson<{ unresolvedIds: string[] }>(
    PREDECESSOR_RESIDUAL_PATH,
  );
  const unresolved = predecessorResidual.unresolvedIds
    .map((id) => destinations.find((destination) => destination.id === id))
    .filter(
      (destination): destination is Destination => destination !== undefined,
    );
  if (unresolved.length !== EXPECTED_RESIDUAL)
    throw new Error(
      `Expected ${EXPECTED_RESIDUAL} unresolved records; found ${unresolved.length}`,
    );
  const offset = Number(process.env.KAI252_OFFSET ?? 0);
  const limit = Number(process.env.KAI252_LIMIT ?? unresolved.length);
  const boundedOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, limit)
    : unresolved.length;
  const researchSet = unresolved.slice(
    boundedOffset,
    boundedOffset + boundedLimit,
  );
  const candidates = researchSet.flatMap(candidateUrls);
  const uniqueUrls = [
    ...new Set(candidates.map((candidate) => candidate.url)),
  ].filter((url) => !url.startsWith("catalogue://"));
  console.log(
    `KAI-252 inventory: ${unresolved.length} unresolved records; ${uniqueUrls.length} unique source paths to check`,
  );
  const sourceCache = fs.existsSync(CACHE_PATH)
    ? readJson<Record<string, FetchResult>>(CACHE_PATH)
    : {};
  const uncachedUrls = uniqueUrls.filter(
    (url) => sourceCache[url] === undefined,
  );
  const freshResults = process.env.KAI252_SKIP_FETCH
    ? new Map<string, FetchResult>()
    : await fetchAll(uncachedUrls);
  for (const [url, result] of freshResults) sourceCache[url] = result;
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(sourceCache, null, 2)}\n`);
  const fetchMap = new Map<string, FetchResult>(
    uniqueUrls.map((url) => [
      url,
      sourceCache[url] ?? {
        outcome: "fetch_failed",
        hasAccessTerms: false,
        hasFareTerms: false,
        hasWalkTerms: false,
        hasClosureTerms: false,
        error: "missing_fetch_result",
      },
    ]),
  );
  const entries = researchSet
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
    .map((destination) => makeEntry(destination, fetchMap));
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  const cohortCounts = Object.fromEntries(
    Object.keys(COHORTS).map((cohort) => [
      cohort,
      entries.filter((entry) => entry.cohort === cohort).length,
    ]),
  );
  const reasonCounts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.residualReason))]
      .sort()
      .map((reason) => [
        reason,
        entries.filter((entry) => entry.residualReason === reason).length,
      ]),
  );
  console.log(
    JSON.stringify(
      {
        output: path.relative(ROOT, OUTPUT_PATH),
        entries: entries.length,
        cohortCounts,
        reasonCounts,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) void main();

export { COHORTS, classifyCohort, candidateUrls, canonicalArrival, makeEntry };
