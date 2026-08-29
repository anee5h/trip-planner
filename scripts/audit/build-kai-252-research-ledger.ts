import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import type {
  Destination,
  LocalTransportAccess,
} from "../../src/shared/types/destination";

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
const DECISIONS_PATH =
  process.env.KAI252_DECISIONS ??
  path.join(ROOT, "scripts/audit/kai-252-research-decisions.json");

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
  | "resolved"
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
    | "direct_official"
    | "discovered_official"
    | "source_missing";
  outcome: "retrieved" | "fetch_failed" | "source_missing";
  status?: number;
  finalUrl?: string;
  established: string;
  remainsUnknown: string;
  excerpt?: string;
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
  additionalSourceUrls: string[];
  closureOrSuspension: { applies: boolean; detail: string };
  residualReason: ResidualReason;
  researchDisposition:
    | "authoritative_reviewed"
    | "repository_semantics_reviewed"
    | "topology_blocked"
    | "retrieval_incomplete";
  retrievalFailureCount: number;
  reason: string;
  whyVerifiedWalkingIsInappropriate: string;
  whyNotApplicableIsInappropriate: string;
  whyVerifiedRequiredAccessIsInappropriate: string;
  whyBoundedDefensibleAccessIsInappropriate: string;
  whySegmentOnlyIsInsufficient: string;
  blocker: "localTransport_evidence" | "origin_topology";
  semanticReview: {
    originTravelCoverage: string;
    canonicalArrival: string;
    requiredLocalLegs: string;
    walkingAssessment: string;
    paidAccessAssessment: string;
    fareProduct: string;
    multipleRequiredSegments: string;
    coverageDecision: string;
    noDoubleCounting: string;
  };
  fact: LocalTransportAccess;
};

type ResearchDecision = Omit<
  Pick<
    LedgerEntry,
    | "canonicalArrivalAccessPoint"
    | "canonicalArrivalResolved"
    | "accessPatternResearched"
    | "closureOrSuspension"
    | "residualReason"
    | "reason"
    | "whyVerifiedWalkingIsInappropriate"
    | "whyNotApplicableIsInappropriate"
    | "whyVerifiedRequiredAccessIsInappropriate"
    | "whyBoundedDefensibleAccessIsInappropriate"
    | "whySegmentOnlyIsInsufficient"
    | "blocker"
    | "semanticReview"
    | "sourceAttempts"
    | "retrievalFailureCount"
    | "fact"
  >,
  never
>;

type FetchResult = {
  outcome: SourceAttempt["outcome"];
  status?: number;
  finalUrl?: string;
  hasAccessTerms: boolean;
  hasFareTerms: boolean;
  hasWalkTerms: boolean;
  hasClosureTerms: boolean;
  retrieval?: "direct" | "jina";
  discoveredUrls: string[];
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

function candidateUrls(
  d: Destination,
  additionalSourceUrls: readonly string[] = [],
): Array<{
  url: string;
  pathKind: SourceAttempt["pathKind"];
}> {
  const result: Array<{
    url: string;
    pathKind: SourceAttempt["pathKind"];
  }> = [];
  if (d.officialWebsite) {
    result.push({ url: d.officialWebsite, pathKind: "direct_official" });
  }
  for (const source of d.editorial?.sources ?? []) {
    result.push({ url: source.url, pathKind: "catalogue_editorial" });
  }
  for (const url of additionalSourceUrls) {
    result.push({ url, pathKind: "direct_official" });
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
      value: `Catalogue parent ${parent} is not a physical arrival point; the exact destination access hub remains unresolved`,
      resolved: false,
      blocker: "origin_topology",
    };
  }
  if (d.municipalityId) {
    return {
      value: `${d.municipalityId} municipality is not itself a physical arrival point; no exact repository hub is substituted`,
      resolved: false,
      blocker: "origin_topology",
    };
  }
  return {
    value: "No canonical arrival/access point is recorded in the catalogue",
    resolved: false,
    blocker: "origin_topology",
  };
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
      discoveredUrls: [],
    };
  const inspect = (
    text: string,
    response: Response,
    retrieval: "direct" | "jina",
  ): FetchResult => {
    const lower = text.toLowerCase();
    const discoveredUrls: string[] = [];
    const baseHost = new URL(url).hostname;
    const linkPattern =
      /(?:href=["']([^"']+)["'][^>]*>([^<]*)|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/gi;
    for (const match of text.matchAll(linkPattern)) {
      const href = match[1] ?? match[4];
      const label = `${match[2] ?? match[3] ?? ""} ${href ?? ""}`;
      if (
        !href ||
        !/access|交通|行き方|アクセス|料金|運賃|fare|price|walk|徒歩|bus|バス|shuttle|シャトル|ropeway|ロープウェイ|ferry|フェリー/i.test(
          label,
        )
      )
        continue;
      try {
        const absolute = new URL(href, response.url || url);
        if (absolute.protocol === "http:" || absolute.protocol === "https:") {
          if (
            absolute.hostname === baseHost &&
            !discoveredUrls.includes(absolute.toString())
          )
            discoveredUrls.push(absolute.toString());
        }
      } catch {
        // Ignore malformed links; the source attempt remains recorded.
      }
      if (discoveredUrls.length >= 25) break;
    }
    return {
      outcome: response.ok ? "retrieved" : "fetch_failed",
      status: response.status,
      finalUrl: response.url,
      retrieval,
      hasAccessTerms: /access|交通|行き方|アクセス/.test(lower),
      hasFareTerms: /fare|料金|運賃|price|¥|円|jpy/.test(lower),
      hasWalkTerms: /walk|on foot|minutes|徒歩|分/.test(lower),
      hasClosureTerms: /closed|suspend|休館|閉鎖|運休|休止/.test(lower),
      discoveredUrls,
      excerpt: excerptFor(text),
    };
  };
  const retrieve = async (
    retrievalUrl: string,
    retrieval: "direct" | "jina",
  ) => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(retrievalUrl, {
        headers: { "user-agent": "Meguruto-KAI-252-research/2.0" },
        redirect: "follow",
        signal: controller.signal,
      });
      const text = await Promise.race([
        response.text(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("body_read_timeout")), 20_000),
        ),
      ]);
      if (
        retrieval === "jina" &&
        /ratelimittriggerederror|per ip rate limit exceeded/i.test(text)
      ) {
        return {
          outcome: "fetch_failed" as const,
          status: 429,
          finalUrl: response.url,
          retrieval,
          hasAccessTerms: false,
          hasFareTerms: false,
          hasWalkTerms: false,
          hasClosureTerms: false,
          discoveredUrls: [],
          excerpt: excerptFor(text),
          error: "jina_rate_limited",
        };
      }
      return inspect(text, response, retrieval);
    } catch (error) {
      return {
        outcome: "fetch_failed" as const,
        retrieval,
        hasAccessTerms: false,
        hasFareTerms: false,
        hasWalkTerms: false,
        hasClosureTerms: false,
        discoveredUrls: [],
        error: error instanceof Error ? error.name : "fetch_error",
      };
    } finally {
      clearTimeout(deadline);
    }
  };
  const direct = await retrieve(url, "direct");
  if (direct.outcome === "retrieved") return direct;
  const jina = await retrieve(`https://r.jina.ai/${url}`, "jina");
  if (jina.outcome === "retrieved") return jina;
  return {
    ...jina,
    error: `direct:${direct.error ?? `HTTP ${direct.status ?? "unknown"}`}; jina:${jina.error ?? `HTTP ${jina.status ?? "unknown"}`}`,
  };
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
      ? `Retrieved via ${result.retrieval ?? "direct"} HTTP ${result.status ?? "2xx"}; ${signalSummary}. This automated pass did not promote any semantic route or fare decision.`
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
    ...(result.excerpt || (result.discoveredUrls ?? []).length > 0
      ? {
          excerpt:
            `${result.excerpt ?? ""}${(result.discoveredUrls ?? []).length > 0 ? ` Discovered ${(result.discoveredUrls ?? []).length} same-site transport/access link(s) for follow-up.` : ""}`.trim(),
        }
      : {}),
  };
}

function makeEntry(
  d: Destination,
  fetchMap: Map<string, FetchResult>,
  decision: ResearchDecision,
  candidates = candidateUrls(d, decision.additionalSourceUrls),
): LedgerEntry {
  if (!decision)
    throw new Error(
      `${d.id}: research decision is missing; builder refuses to preselect unavailable`,
    );
  const cohort = classifyCohort(d);
  const attempts = candidates.map((candidate) =>
    buildSourceAttempt(
      candidate,
      fetchMap.get(candidate.url) ?? {
        outcome: "fetch_failed",
        hasAccessTerms: false,
        hasFareTerms: false,
        hasWalkTerms: false,
        hasClosureTerms: false,
        discoveredUrls: [],
        error: "missing_fetch_result",
      },
    ),
  );
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
    canonicalArrivalAccessPoint: decision.canonicalArrivalAccessPoint,
    canonicalArrivalResolved: decision.canonicalArrivalResolved,
    accessPatternResearched: decision.accessPatternResearched,
    ...decision,
    sourceAttempts: attempts,
    retrievalFailureCount: attempts.filter(
      (attempt) => attempt.outcome === "fetch_failed",
    ).length,
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
  const decisions = readJson<Record<string, ResearchDecision>>(DECISIONS_PATH);
  const missingDecisions = unresolved
    .map((destination) => destination.id)
    .filter((id) => decisions[id] === undefined);
  if (missingDecisions.length > 0)
    throw new Error(
      `Research decision ledger is incomplete (${missingDecisions.length} missing): ${missingDecisions.slice(0, 5).join(", ")}`,
    );
  const candidatesById = new Map(
    researchSet.map((destination) => [
      destination.id,
      candidateUrls(
        destination,
        decisions[destination.id].additionalSourceUrls,
      ),
    ]),
  );
  const initialCandidates = researchSet.flatMap((destination) =>
    (candidatesById.get(destination.id) ?? []).map((candidate) => ({
      ...candidate,
      ownerId: destination.id,
    })),
  );
  const uniqueUrls = [
    ...new Set(initialCandidates.map((candidate) => candidate.url)),
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
  const discoveredCandidates = initialCandidates.flatMap((candidate) => {
    const result = sourceCache[candidate.url];
    return (result?.discoveredUrls ?? []).map((url) => ({
      url,
      pathKind: "discovered_official" as const,
      ownerId: candidate.ownerId,
    }));
  });
  for (const candidate of discoveredCandidates) {
    const existing = candidatesById.get(candidate.ownerId) ?? [];
    if (!existing.some((item) => item.url === candidate.url))
      existing.push({ url: candidate.url, pathKind: candidate.pathKind });
    candidatesById.set(candidate.ownerId, existing);
  }
  const discoveredUrls = [
    ...new Set(discoveredCandidates.map((candidate) => candidate.url)),
  ];
  const discoveredUncached = discoveredUrls.filter(
    (url) => sourceCache[url] === undefined,
  );
  const discoveredResults = process.env.KAI252_SKIP_FETCH
    ? new Map<string, FetchResult>()
    : await fetchAll(discoveredUncached);
  for (const [url, result] of discoveredResults) sourceCache[url] = result;
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(sourceCache, null, 2)}\n`);
  const allUrls = [...new Set([...uniqueUrls, ...discoveredUrls])];
  const fetchMap = new Map<string, FetchResult>(
    allUrls.map((url) => [
      url,
      sourceCache[url] ?? {
        outcome: "fetch_failed",
        hasAccessTerms: false,
        hasFareTerms: false,
        hasWalkTerms: false,
        hasClosureTerms: false,
        discoveredUrls: [],
        error: "missing_fetch_result",
      },
    ]),
  );
  const entries = researchSet
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
    .map((destination) => {
      const decision = decisions[destination.id];
      if (!decision)
        throw new Error(`${destination.id}: missing research decision`);
      return makeEntry(
        destination,
        fetchMap,
        decision,
        candidatesById.get(destination.id),
      );
    });
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
