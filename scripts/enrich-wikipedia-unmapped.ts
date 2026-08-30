#!/usr/bin/env node
/**
 * KAI-256 Phase 2: bounded Wikipedia enrichment for published destinations
 * without an explicit identity and outside the Phase 1 legacy-review ledger.
 *
 * Network access is opt-in (`--fetch`). Offline mode reads only the committed
 * cache. Candidate discovery is broader than acceptance; every automatic write
 * still passes the shared fail-closed Wikipedia validator and the Phase 2
 * classifier.
 *
 * Examples:
 *   npm run enrich:wikipedia-unmapped -- --fetch
 *   npm run enrich:wikipedia-unmapped -- --offline
 *   npm run enrich:wikipedia-unmapped -- --offline --apply
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
import {
  extractWikipediaMapping,
  type WikipediaLanguage,
} from "../src/shared/services/wikipedia/WikipediaIdentity";
import { titleMatchesDestination } from "../src/shared/services/wikipedia/WikipediaValidation";
import {
  applyUnmappedIdentity,
  classifyUnmappedDestination,
  unmappedInputFingerprint,
  type UnmappedCandidate,
  type UnmappedClassification,
  type UnmappedDestination,
  type UnmappedDiscovery,
} from "./lib/wikipediaUnmappedEnrichment";

interface SearchRecord {
  language: WikipediaLanguage;
  query: string;
  titles: string[];
}

interface CacheEntryOk {
  status: "ok";
  inputFingerprint: string;
  searches: SearchRecord[];
  candidates: UnmappedCandidate[];
}

interface CacheEntryTransient {
  status: "transient";
  inputFingerprint: string;
  message: string;
}

type CacheEntry = CacheEntryOk | CacheEntryTransient;

interface CacheFile {
  schemaVersion: 1;
  scope: string;
  entries: Record<string, CacheEntry>;
}

interface Phase1Report {
  reviewLedger: Array<{ id: string }>;
}

interface UnmappedCohortManifest {
  schemaVersion: 1;
  scope: string;
  baseline: {
    published: number;
    canonical: number;
    legacyReview: number;
    unmapped: number;
  };
  phase1ReviewIds: string[];
  phase1ReviewFingerprint: string;
  sourceFingerprint: string;
  entries: Array<{ id: string; inputFingerprint: string }>;
}

interface Phase2Record {
  id: string;
  state: UnmappedClassification["state"];
  reason: UnmappedClassification["reason"];
  identity?: UnmappedClassification["identity"];
  candidate?: UnmappedClassification["candidate"];
  candidates: UnmappedClassification["candidates"];
  matchSignals: string[];
  entityTypeResult: UnmappedClassification["entityTypeResult"];
  geographyResult: UnmappedClassification["geographyResult"];
  ambiguityResult: UnmappedClassification["ambiguityResult"];
  details?: string[];
}

interface Phase2Report {
  schemaVersion: 1;
  generatedBy: string;
  scope: string;
  population: {
    destinations: number;
    published: number;
    publishedCanonicalBefore: number;
    publishedCanonicalAfter: number;
    legacyReviewExcluded: number;
    unmappedCohortExamined: number;
    publishedUnmappedBefore: number;
    publishedUnmappedAfter: number;
  };
  classificationCounts: {
    before: {
      unmappedCohort: number;
      canonicalized: number;
      highConfidenceAwaitingApply: number;
      ambiguousCandidate: number;
      noArticleExpected: number;
      unresolved: number;
    };
    after: {
      unmappedCohort: number;
      canonicalized: number;
      highConfidenceAwaitingApply: number;
      ambiguousCandidate: number;
      noArticleExpected: number;
      unresolved: number;
    };
  };
  enrichment: {
    candidatesFetchedEvaluated: number;
    automaticallyCanonicalized: number;
    ambiguous: number;
    noArticleExpected: number;
    unresolved: number;
    transientFailures: number;
  };
  groups: Record<string, string[]>;
  records: Phase2Record[];
  safety: {
    firstResultFallbackIntroduced: "NO";
    similarityOnlyAcceptance: "NO";
    confidenceThresholdWeakened: "NO";
    geographyValidationBypassed: "NO";
    entityValidationBypassed: "NO";
    enJaEquivalenceGuessed: "NO";
    fabricatedContent: "NO";
    kai167FailClosedBehaviorPreserved: "YES";
  };
  method: {
    networkRequests: string;
    boundedConcurrency: number;
    cache: string;
    candidateAcceptance: string;
    noArticleExpected: string;
    legacyReviewBoundary: string;
  };
}

const root = process.cwd();
const indexPath = path.join(root, "src/shared/data/destinations-index.json");
const phase1ReportPath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-legacy-report.json",
);
const defaultManifestPath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-unmapped-cohort.json",
);
const defaultCachePath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-unmapped-api-cache.json",
);
const defaultReportPath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-unmapped-report.json",
);
const scope =
  "published destinations without explicit Wikipedia identity, excluding the KAI-256 Phase 1 legacy-review ledger";
const API_DELAY_MS = 800;
const API_RETRIES = 3;
const API_TIMEOUT_MS = 30_000;
let lastRequestAt = 0;

function parseArgs(): {
  fetch: boolean;
  apply: boolean;
  initManifest: boolean;
  manifestPath: string;
  cachePath: string;
  reportPath: string;
} {
  const args = process.argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const valueFor = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1]
      ? path.resolve(args[index + 1])
      : fallback;
  };
  if (has("--fetch") && has("--offline")) {
    throw new Error("Choose one of --fetch or --offline, not both.");
  }
  return {
    fetch: has("--fetch"),
    apply: has("--apply"),
    initManifest: has("--init-manifest"),
    manifestPath: valueFor("--manifest", defaultManifestPath),
    cachePath: valueFor("--cache", defaultCachePath),
    reportPath: valueFor("--report", defaultReportPath),
  };
}

function readJson<T>(filePath: string, fallback?: T): T {
  if (!fs.existsSync(filePath)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required JSON file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    await format(JSON.stringify(value), { parser: "json" }),
  );
}

function sortIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasExplicitIdentity(destination: UnmappedDestination): boolean {
  return Boolean(
    destination.wikipediaTitle ||
    destination.wikipediaUrl ||
    destination.wikipediaPageId !== undefined ||
    destination.wikidataId,
  );
}

function rawWikipediaReferences(
  destination: UnmappedDestination,
): Array<{ url?: string }> {
  const fieldSources = Object.values(destination.editorial?.fieldSources ?? {})
    .flat()
    .filter((reference) => reference?.type === "wikipedia");
  return [
    ...(destination.editorial?.sources ?? []).filter(
      (reference) => reference.type === "wikipedia",
    ),
    ...fieldSources,
  ];
}

function publishedDestinations(
  destinations: UnmappedDestination[],
): UnmappedDestination[] {
  return destinations.filter(
    (destination) => destination.status === "published",
  );
}

function phase1ReviewIds(report: Phase1Report): string[] {
  return sortIds(report.reviewLedger.map((entry) => entry.id));
}

function buildManifest(
  destinations: UnmappedDestination[],
  phase1Report: Phase1Report,
): UnmappedCohortManifest {
  const published = publishedDestinations(destinations);
  const reviewIds = phase1ReviewIds(phase1Report);
  const reviewSet = new Set(reviewIds);
  const eligible = published
    .filter(
      (destination) =>
        !hasExplicitIdentity(destination) && !reviewSet.has(destination.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const entries = eligible.map((destination) => ({
    id: destination.id,
    inputFingerprint: unmappedInputFingerprint(destination),
  }));
  return {
    schemaVersion: 1,
    scope,
    baseline: {
      published: published.length,
      canonical: published.filter(hasExplicitIdentity).length,
      legacyReview: reviewIds.length,
      unmapped: eligible.length,
    },
    phase1ReviewIds: reviewIds,
    phase1ReviewFingerprint: hashJson(reviewIds),
    sourceFingerprint: hashJson(entries),
    entries,
  };
}

function validateManifest(
  manifest: UnmappedCohortManifest,
  destinations: UnmappedDestination[],
  phase1Report: Phase1Report,
): UnmappedDestination[] {
  if (manifest.schemaVersion !== 1 || manifest.scope !== scope) {
    throw new Error("Invalid KAI-256 Phase 2 cohort manifest metadata.");
  }
  const sortedEntries = [...manifest.entries].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (
    JSON.stringify(sortedEntries) !== JSON.stringify(manifest.entries) ||
    new Set(manifest.entries.map((entry) => entry.id)).size !==
      manifest.entries.length ||
    hashJson(manifest.entries) !== manifest.sourceFingerprint
  ) {
    throw new Error(
      "KAI-256 Phase 2 cohort manifest is not canonical or has a bad fingerprint.",
    );
  }
  const currentReviewIds = phase1ReviewIds(phase1Report);
  if (
    JSON.stringify(currentReviewIds) !==
      JSON.stringify(manifest.phase1ReviewIds) ||
    hashJson(currentReviewIds) !== manifest.phase1ReviewFingerprint
  ) {
    throw new Error(
      "KAI-256 Phase 1 review ledger drift detected; refusing Phase 2 scope change.",
    );
  }

  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const cohort = manifest.entries.map((entry) => {
    const destination = byId.get(entry.id);
    if (!destination || destination.status !== "published") {
      throw new Error(
        `KAI-256 Phase 2 cohort record is missing or unpublished: ${entry.id}`,
      );
    }
    if (unmappedInputFingerprint(destination) !== entry.inputFingerprint) {
      throw new Error(`KAI-256 Phase 2 input drift detected: ${entry.id}`);
    }
    return destination;
  });
  const reviewSet = new Set(manifest.phase1ReviewIds);
  if (cohort.some((destination) => reviewSet.has(destination.id))) {
    throw new Error(
      "KAI-256 Phase 2 cohort overlaps the Phase 1 review ledger.",
    );
  }

  const cohortSet = new Set(manifest.entries.map((entry) => entry.id));
  const currentUnmappedOutsideManifest = publishedDestinations(
    destinations,
  ).filter(
    (destination) =>
      !hasExplicitIdentity(destination) &&
      !rawWikipediaReferences(destination).length &&
      !cohortSet.has(destination.id),
  );
  if (currentUnmappedOutsideManifest.length > 0) {
    throw new Error(
      `KAI-256 Phase 2 unmapped scope expanded outside manifest: ${currentUnmappedOutsideManifest
        .map((destination) => destination.id)
        .join(", ")}`,
    );
  }
  return cohort;
}

function primaryName(
  destination: UnmappedDestination,
  language: WikipediaLanguage,
): string {
  return language === "ja"
    ? destination.nameJa || destination.name
    : destination.name;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class WikipediaTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikipediaTransientError";
  }
}

async function requestUrl(endpoint: string): Promise<unknown | null> {
  let lastError = "unknown network failure";
  for (let attempt = 1; attempt <= API_RETRIES; attempt += 1) {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < API_DELAY_MS) await delay(API_DELAY_MS - elapsed);
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "user-agent": "Meguruto-KAI-256-unmapped-enrichment/1.0",
        },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      lastRequestAt = Date.now();
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (response.status === 404) return null;
        if (
          response.status === 429 ||
          response.status === 408 ||
          response.status >= 500
        ) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await delay(
            Number.isFinite(retryAfter)
              ? Math.max(1000, retryAfter * 1000)
              : 2500 * attempt,
          );
          continue;
        }
        return null;
      }
      try {
        return await response.json();
      } catch {
        lastError = "invalid JSON response";
      }
    } catch (error) {
      lastRequestAt = Date.now();
      lastError = error instanceof Error ? error.message : String(error);
      await delay(2500 * attempt);
    }
  }
  throw new WikipediaTransientError(lastError);
}

async function requestJson(
  language: WikipediaLanguage,
  params: URLSearchParams,
): Promise<unknown | null> {
  return requestUrl(
    `https://${language}.wikipedia.org/w/api.php?${params.toString()}`,
  );
}

function coordinateFromPage(
  page: Record<string, unknown>,
): { lat: number; lng: number } | undefined {
  const values = Array.isArray(page.coordinates) ? page.coordinates : [];
  const point = values.find((value): value is { lat: number; lon: number } =>
    Boolean(
      value &&
      typeof value === "object" &&
      typeof (value as { lat?: unknown }).lat === "number" &&
      typeof (value as { lon?: unknown }).lon === "number",
    ),
  );
  return point ? { lat: point.lat, lng: point.lon } : undefined;
}

function candidateFromPage(
  language: WikipediaLanguage,
  page: Record<string, unknown>,
  directTitle: string,
  query: string,
): UnmappedCandidate | undefined {
  if (page.missing === true || typeof page.title !== "string") return undefined;
  const pageProps =
    page.pageprops && typeof page.pageprops === "object"
      ? (page.pageprops as Record<string, unknown>)
      : {};
  const title = page.title;
  const pageId = typeof page.pageid === "number" ? page.pageid : undefined;
  const wikidataId =
    typeof pageProps.wikibase_item === "string"
      ? pageProps.wikibase_item
      : undefined;
  const url =
    (typeof page.canonicalurl === "string" && page.canonicalurl) ||
    (typeof page.fullurl === "string" && page.fullurl) ||
    `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  const extract = typeof page.extract === "string" ? page.extract : "";
  const description =
    typeof page.description === "string"
      ? page.description
      : typeof pageProps["wikibase-shortdesc"] === "string"
        ? pageProps["wikibase-shortdesc"]
        : undefined;
  return {
    language,
    title,
    url,
    pageId,
    wikidataId,
    extract,
    description,
    type: pageProps.disambiguation !== undefined ? "disambiguation" : undefined,
    coordinates: coordinateFromPage(page),
    source:
      title.toLocaleLowerCase() === directTitle.toLocaleLowerCase()
        ? "direct-title"
        : "search",
    searchQuery: query,
  };
}

async function fetchPagesBatch(
  language: WikipediaLanguage,
  titles: string[],
  query: string,
  source: UnmappedCandidate["source"],
): Promise<UnmappedCandidate[]> {
  if (titles.length === 0) return [];
  const pageParams = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "info|pageprops|coordinates|extracts|description",
    inprop: "url",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const pagePayload = await requestJson(language, pageParams);
  const pages =
    pagePayload && typeof pagePayload === "object"
      ? ((pagePayload as { query?: { pages?: Array<Record<string, unknown>> } })
          .query?.pages ?? [])
      : [];
  return pages
    .map((page) => candidateFromPage(language, page, "", query))
    .filter((candidate): candidate is UnmappedCandidate => Boolean(candidate))
    .map((candidate) => ({ ...candidate, source }));
}

function addCandidate(
  candidatesById: Map<string, UnmappedCandidate[]>,
  destination: UnmappedDestination,
  candidate: UnmappedCandidate,
): void {
  const current = candidatesById.get(destination.id) ?? [];
  const key = `${candidate.language}:${candidate.pageId ?? candidate.url}`;
  if (
    !current.some(
      (existing) =>
        `${existing.language}:${existing.pageId ?? existing.url}` === key,
    )
  ) {
    current.push(candidate);
  }
  candidatesById.set(destination.id, current);
}

function addSearch(
  searchesById: Map<string, SearchRecord[]>,
  destination: UnmappedDestination,
  search: SearchRecord,
): void {
  const current = searchesById.get(destination.id) ?? [];
  if (
    !current.some(
      (existing) =>
        existing.language === search.language &&
        existing.query === search.query,
    )
  ) {
    current.push(search);
  }
  searchesById.set(destination.id, current);
}

async function directBatch(
  destinations: UnmappedDestination[],
  language: WikipediaLanguage,
  candidatesById: Map<string, UnmappedCandidate[]>,
  searchesById: Map<string, SearchRecord[]>,
): Promise<void> {
  const batchSize = 40;
  for (let start = 0; start < destinations.length; start += batchSize) {
    const batch = destinations.slice(start, start + batchSize);
    const titles = batch.map((destination) =>
      primaryName(destination, language),
    );
    const query = `direct-title-batch:${batch[0].id}:${batch.at(-1)?.id}`;
    const candidates = await fetchPagesBatch(
      language,
      titles,
      query,
      "direct-title",
    );
    for (const destination of batch) {
      const matches = candidates.filter((candidate) =>
        titleMatchesDestination(destination, candidate.title),
      );
      for (const candidate of matches)
        addCandidate(candidatesById, destination, candidate);
      addSearch(searchesById, destination, {
        language,
        query,
        titles: matches
          .map((candidate) => candidate.title)
          .sort((left, right) => left.localeCompare(right)),
      });
    }
  }
}

function batchSearchQuery(
  destinations: UnmappedDestination[],
  language: WikipediaLanguage,
): string {
  const names = Array.from(
    new Set(
      destinations.flatMap((destination) => [
        primaryName(destination, language),
        ...(destination.aliases ?? []),
      ]),
    ),
  )
    .filter(Boolean)
    .map((name) => `"${name.replaceAll('"', "")}"`);
  const context = language === "ja" ? "日本" : "Japan";
  return `(${names.join(" OR ")}) ${context}`.trim();
}

async function searchBatch(
  destinations: UnmappedDestination[],
  language: WikipediaLanguage,
  candidatesById: Map<string, UnmappedCandidate[]>,
  searchesById: Map<string, SearchRecord[]>,
): Promise<void> {
  const batchSize = 15;
  for (let start = 0; start < destinations.length; start += batchSize) {
    const batch = destinations.slice(start, start + batchSize);
    const query = batchSearchQuery(batch, language);
    const searchParams = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "50",
      srnamespace: "0",
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    const payload = await requestJson(language, searchParams);
    const searchTitles =
      payload && typeof payload === "object"
        ? (
            (payload as { query?: { search?: Array<{ title?: string }> } })
              .query?.search ?? []
          )
            .map((result) => result.title)
            .filter((title): title is string => Boolean(title))
        : [];
    const exactTitles = searchTitles.filter((title) =>
      batch.some((destination) => titleMatchesDestination(destination, title)),
    );
    const candidates = await fetchPagesBatch(
      language,
      Array.from(new Set(exactTitles)),
      query,
      "search",
    );
    for (const destination of batch) {
      const matches = candidates.filter((candidate) =>
        titleMatchesDestination(destination, candidate.title),
      );
      for (const candidate of matches)
        addCandidate(candidatesById, destination, candidate);
      addSearch(searchesById, destination, {
        language,
        query,
        titles: matches
          .map((candidate) => candidate.title)
          .sort((left, right) => left.localeCompare(right)),
      });
    }
  }
}

async function discoverBatch(
  destinations: UnmappedDestination[],
): Promise<Map<string, UnmappedDiscovery & { searches: SearchRecord[] }>> {
  const candidatesById = new Map<string, UnmappedCandidate[]>();
  const searchesById = new Map<string, SearchRecord[]>();
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const unresolvedIds = () =>
    destinations
      .filter((destination) => {
        const candidates = candidatesById.get(destination.id) ?? [];
        return (
          classifyUnmappedDestination(destination, { candidates }).state !==
          "high-confidence-candidate"
        );
      })
      .map((destination) => destination.id);

  await directBatch(destinations, "en", candidatesById, searchesById);
  let remainingIds = unresolvedIds();
  await directBatch(
    remainingIds.map((id) => byId.get(id)!),
    "ja",
    candidatesById,
    searchesById,
  );
  remainingIds = unresolvedIds();
  await searchBatch(
    remainingIds.map((id) => byId.get(id)!),
    "en",
    candidatesById,
    searchesById,
  );
  remainingIds = unresolvedIds();
  await searchBatch(
    remainingIds.map((id) => byId.get(id)!),
    "ja",
    candidatesById,
    searchesById,
  );

  return new Map(
    destinations.map((destination) => [
      destination.id,
      {
        candidates: (candidatesById.get(destination.id) ?? []).sort(
          (left, right) =>
            `${left.language}:${left.title}:${left.pageId ?? 0}`.localeCompare(
              `${right.language}:${right.title}:${right.pageId ?? 0}`,
            ),
        ),
        searches: (searchesById.get(destination.id) ?? []).sort((left, right) =>
          `${left.language}:${left.query}`.localeCompare(
            `${right.language}:${right.query}`,
          ),
        ),
      },
    ]),
  );
}

function cacheEntryValid(
  entry: CacheEntry | undefined,
  destination: UnmappedDestination,
): entry is CacheEntryOk {
  return Boolean(
    entry &&
    entry.status === "ok" &&
    entry.inputFingerprint === unmappedInputFingerprint(destination),
  );
}

async function loadOrFetchCache(
  cohort: UnmappedDestination[],
  cachePath: string,
  fetchEnabled: boolean,
): Promise<CacheFile> {
  const existing = readJson<CacheFile>(cachePath, {
    schemaVersion: 1,
    scope,
    entries: {},
  });
  if (existing.schemaVersion !== 1 || existing.scope !== scope) {
    throw new Error("Invalid KAI-256 Phase 2 API cache metadata.");
  }
  const entries: Record<string, CacheEntry> = {};
  const sortedCohort = [...cohort].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const missing = sortedCohort.filter(
    (destination) =>
      !cacheEntryValid(existing.entries[destination.id], destination),
  );
  if (missing.length > 0 && !fetchEnabled) {
    throw new Error(
      `Offline mode needs ${missing.length} cached Phase 2 destinations; rerun with --fetch.`,
    );
  }

  for (const destination of sortedCohort) {
    const cached = existing.entries[destination.id];
    if (cacheEntryValid(cached, destination)) {
      entries[destination.id] = cached;
    }
  }

  if (missing.length > 0) {
    if (!fetchEnabled) {
      throw new Error(
        `Offline cache entry is missing or stale: ${missing[0].id}`,
      );
    }
    try {
      const discovered = await discoverBatch(missing);
      for (const destination of missing) {
        const result = discovered.get(destination.id) ?? {
          candidates: [],
          searches: [],
        };
        entries[destination.id] = {
          status: "ok",
          inputFingerprint: unmappedInputFingerprint(destination),
          searches: result.searches,
          candidates: result.candidates,
        };
      }
    } catch (error) {
      for (const destination of missing) {
        entries[destination.id] = {
          status: "transient",
          inputFingerprint: unmappedInputFingerprint(destination),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const nextCache: CacheFile = {
      schemaVersion: 1,
      scope,
      entries: Object.fromEntries(
        Object.entries(entries).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    };
    await writeJson(cachePath, nextCache);
  }
  return {
    schemaVersion: 1,
    scope,
    entries: Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

function sameIdentity(
  destination: UnmappedDestination,
  identity: NonNullable<UnmappedClassification["identity"]>,
): boolean {
  const mapping = extractWikipediaMapping(destination);
  return Boolean(
    mapping &&
    mapping.title === identity.wikipediaTitle &&
    mapping.language === identity.wikipediaLanguage &&
    mapping.url === identity.wikipediaUrl &&
    mapping.pageId === identity.wikipediaPageId &&
    mapping.wikidataId === identity.wikidataId,
  );
}

function recordFor(
  id: string,
  classification: UnmappedClassification,
): Phase2Record {
  return {
    id,
    state: classification.state,
    reason: classification.reason,
    ...(classification.identity ? { identity: classification.identity } : {}),
    ...(classification.candidate
      ? { candidate: classification.candidate }
      : {}),
    candidates: classification.candidates,
    matchSignals: classification.matchSignals,
    entityTypeResult: classification.entityTypeResult,
    geographyResult: classification.geographyResult,
    ambiguityResult: classification.ambiguityResult,
    ...(classification.details ? { details: classification.details } : {}),
  };
}

function buildReport(
  destinations: UnmappedDestination[],
  cohort: UnmappedDestination[],
  manifest: UnmappedCohortManifest,
  cache: CacheFile,
  classifications: Map<string, UnmappedClassification>,
): Phase2Report {
  const published = publishedDestinations(destinations);
  const high = cohort.filter(
    (destination) =>
      classifications.get(destination.id)?.state ===
      "high-confidence-candidate",
  );
  const ambiguous = cohort.filter(
    (destination) =>
      classifications.get(destination.id)?.state === "ambiguous-candidate",
  );
  const noArticle = cohort.filter(
    (destination) =>
      classifications.get(destination.id)?.state === "no-article-expected",
  );
  const unresolved = cohort.filter(
    (destination) =>
      classifications.get(destination.id)?.state === "unresolved",
  );
  const canonicalized = high.filter((destination) => {
    const classification = classifications.get(destination.id);
    return Boolean(
      classification?.identity &&
      sameIdentity(destination, classification.identity),
    );
  });
  const awaiting = high.filter(
    (destination) => !canonicalized.includes(destination),
  );
  const ids = (records: UnmappedDestination[]) =>
    sortIds(records.map((record) => record.id));
  const records = cohort
    .map((destination) =>
      recordFor(destination.id, classifications.get(destination.id)!),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const transientFailures = Object.values(cache.entries).filter(
    (entry) => entry.status === "transient",
  ).length;
  const candidateCount = Object.values(cache.entries).reduce(
    (count, entry) =>
      count + (entry.status === "ok" ? entry.candidates.length : 0),
    0,
  );
  const currentUnmapped = published.filter(
    (destination) =>
      !hasExplicitIdentity(destination) &&
      !rawWikipediaReferences(destination).length,
  ).length;

  return {
    schemaVersion: 1,
    generatedBy: "scripts/enrich-wikipedia-unmapped.ts",
    scope,
    population: {
      destinations: destinations.length,
      published: published.length,
      publishedCanonicalBefore: manifest.baseline.canonical,
      publishedCanonicalAfter: published.filter(hasExplicitIdentity).length,
      legacyReviewExcluded: manifest.phase1ReviewIds.length,
      unmappedCohortExamined: cohort.length,
      publishedUnmappedBefore: manifest.baseline.unmapped,
      publishedUnmappedAfter: currentUnmapped,
    },
    classificationCounts: {
      before: {
        unmappedCohort: cohort.length,
        canonicalized: 0,
        highConfidenceAwaitingApply: 0,
        ambiguousCandidate: 0,
        noArticleExpected: 0,
        unresolved: cohort.length,
      },
      after: {
        unmappedCohort: cohort.length,
        canonicalized: canonicalized.length,
        highConfidenceAwaitingApply: awaiting.length,
        ambiguousCandidate: ambiguous.length,
        noArticleExpected: noArticle.length,
        unresolved: unresolved.length,
      },
    },
    enrichment: {
      candidatesFetchedEvaluated: candidateCount,
      automaticallyCanonicalized: canonicalized.length,
      ambiguous: ambiguous.length,
      noArticleExpected: noArticle.length,
      unresolved: unresolved.length,
      transientFailures,
    },
    groups: {
      "high-confidence-candidate": ids(high),
      "ambiguous-candidate": ids(ambiguous),
      "no-article-expected": ids(noArticle),
      unresolved: ids(unresolved),
      canonicalized: ids(canonicalized),
      "high-confidence-awaiting-apply": ids(awaiting),
      "phase1-legacy-review-excluded": [...manifest.phase1ReviewIds],
    },
    records,
    safety: {
      firstResultFallbackIntroduced: "NO",
      similarityOnlyAcceptance: "NO",
      confidenceThresholdWeakened: "NO",
      geographyValidationBypassed: "NO",
      entityValidationBypassed: "NO",
      enJaEquivalenceGuessed: "NO",
      fabricatedContent: "NO",
      kai167FailClosedBehaviorPreserved: "YES",
    },
    method: {
      networkRequests:
        "MediaWiki search plus bounded page-detail requests; only --fetch enables network access",
      boundedConcurrency: 1,
      cache:
        "Committed cache entries are bound to stable destination input fingerprints; transient failures are never treated as no-article evidence",
      candidateAcceptance:
        "Exact canonical-name or approved-alias title, shared Wikipedia validator, page identity, compatible entity type, coordinates when available, and no competing identity",
      noArticleExpected:
        "Not inferred from search absence; only explicit evidence may produce no-article-expected",
      legacyReviewBoundary:
        "The complete Phase 1 review ledger is fingerprinted and excluded from this cohort",
    },
  };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const destinations = readJson<UnmappedDestination[]>(indexPath);
  const phase1Report = readJson<Phase1Report>(phase1ReportPath);
  if (options.initManifest) {
    if (fs.existsSync(options.manifestPath)) {
      throw new Error(`Manifest already exists: ${options.manifestPath}`);
    }
    await writeJson(
      options.manifestPath,
      buildManifest(destinations, phase1Report),
    );
    console.log(`Manifest: ${options.manifestPath}`);
    return;
  }
  const manifest = readJson<UnmappedCohortManifest>(options.manifestPath);
  const cohort = validateManifest(manifest, destinations, phase1Report);
  const cache = await loadOrFetchCache(
    cohort,
    options.cachePath,
    options.fetch,
  );
  const classifications = new Map<string, UnmappedClassification>();
  for (const destination of cohort) {
    const entry = cache.entries[destination.id];
    const discovery: UnmappedDiscovery =
      entry?.status === "transient"
        ? { candidates: [], transientFailure: entry.message }
        : { candidates: entry?.candidates ?? [] };
    classifications.set(
      destination.id,
      classifyUnmappedDestination(destination, discovery),
    );
  }

  const transientCount = Object.values(cache.entries).filter(
    (entry) => entry.status === "transient",
  ).length;
  if (options.apply && transientCount > 0) {
    const report = buildReport(
      destinations,
      cohort,
      manifest,
      cache,
      classifications,
    );
    await writeJson(options.reportPath, report);
    throw new Error(
      `Refusing --apply while ${transientCount} transient network failure(s) remain; rerun --fetch after the source is reachable.`,
    );
  }

  let changed = 0;
  if (options.apply) {
    for (const destination of cohort) {
      const classification = classifications.get(destination.id);
      if (
        classification?.state !== "high-confidence-candidate" ||
        !classification.identity
      ) {
        continue;
      }
      if (applyUnmappedIdentity(destination, classification.identity))
        changed += 1;
    }
    if (changed > 0) {
      fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
    }
  }

  const report = buildReport(
    destinations,
    cohort,
    manifest,
    cache,
    classifications,
  );
  await writeJson(options.reportPath, report);
  console.log(`Published destinations: ${report.population.published}`);
  console.log(
    `Phase 2 unmapped cohort examined: ${report.population.unmappedCohortExamined}`,
  );
  console.log(
    `Automatically canonicalized: ${report.enrichment.automaticallyCanonicalized}`,
  );
  console.log(
    `High-confidence awaiting apply: ${report.groups["high-confidence-awaiting-apply"].length}`,
  );
  console.log(`Ambiguous candidates: ${report.enrichment.ambiguous}`);
  console.log(`No-article-expected: ${report.enrichment.noArticleExpected}`);
  console.log(`Unresolved: ${report.enrichment.unresolved}`);
  console.log(
    `Transient/network failures: ${report.enrichment.transientFailures}`,
  );
  console.log(
    `Canonical identity: ${report.population.publishedCanonicalBefore} -> ${report.population.publishedCanonicalAfter}`,
  );
  console.log(`Applied changes: ${changed}`);
  console.log(`Report: ${options.reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
