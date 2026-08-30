import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPhase3Identity,
  classifyPhase3Destination,
  hashStable,
  phase3IdentityMatches,
  phase3InputFingerprint,
  type Phase3Candidate,
  type Phase3Destination,
  type Phase3Page,
  type Phase2EvidenceSnapshot,
  type Phase3RedirectEvidence,
  type Phase3Source,
  type Phase3WikidataEntity,
  type Phase3WikidataSearchEvidence,
} from "./lib/wikipediaPhase3Enrichment";
import type { WikipediaLanguage } from "../src/shared/services/wikipedia/WikipediaIdentity";

const ROOT = process.cwd();
const SCOPE = "kai-256-wikipedia-phase3";
const MANIFEST_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase3-cohort.json",
);
const CACHE_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase3-api-cache.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase3-report.json",
);
const INDEX_PATH = resolve(ROOT, "src/shared/data/destinations-index.json");
const PHASE1_REPORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-legacy-report.json",
);
const PHASE2_CACHE_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-unmapped-api-cache.json",
);
const PHASE2_REPORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-unmapped-report.json",
);
const REQUEST_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_QUERIES_PER_DESTINATION = 6;

export interface Phase3Manifest {
  schemaVersion: 2;
  scope: typeof SCOPE;
  baseline: {
    publishedDestinations: number;
    canonicalWikipediaIdentity: number;
    phase1ReviewRecords: number;
    phase2CohortRecords: number;
    phase2AmbiguousCandidate: number;
    phase2Unresolved: number;
    phase3CohortRecords: number;
  };
  ids: string[];
  inputFingerprints: Record<string, string>;
  phase1ReviewLedgerFingerprint: string;
  phase1ReviewInputFingerprints: Record<string, string>;
  phase1ReviewIdentityFingerprints: Record<string, string>;
  phase2ReportFingerprint: string;
  phase2CacheFingerprint: string;
  wholeCohortFingerprint: string;
}

interface Phase2CacheFile {
  entries: Record<
    string,
    {
      status: string;
      inputFingerprint: string;
      searches?: Array<Record<string, unknown>>;
      candidates?: Array<Record<string, unknown>>;
    }
  >;
}

interface Phase2ReportFile {
  records: Array<{
    id: string;
    state: string;
    reason: string;
    candidates?: Array<Record<string, unknown>>;
    details?: string[];
    ambiguityResult?: string;
  }>;
}

interface Phase1ReportFile {
  reviewLedger: Array<{ id: string }>;
}

interface Phase3CacheEntry {
  status: "ok" | "transient-failure";
  inputFingerprint: string;
  phase2?: Phase2EvidenceSnapshot;
  redirects: Phase3RedirectEvidence[];
  wikidataSearches: Phase3WikidataSearchEvidence[];
  candidates: Phase3Candidate[];
  transientFailure?: string;
}

export interface Phase3CacheFile {
  schemaVersion: 2;
  scope: typeof SCOPE;
  manifestFingerprint: string;
  phase2ReportFingerprint: string;
  phase2CacheFingerprint: string;
  entries: Record<string, Phase3CacheEntry>;
}

export interface Phase3SafetyReport {
  similarityOnlyAcceptance: boolean;
  geographyBypassed: boolean;
  entityValidationBypassed: boolean;
  enJaEquivalenceGuessed: boolean;
  parentArticleSubstitution: boolean;
  phase1ReviewModified: boolean;
  transientFailures: number;
}

interface Phase3ReportRecord {
  id: string;
  state: string;
  reason: string;
  candidates: ReturnType<typeof classifyPhase3Destination>["candidates"];
  chosenCandidate?: ReturnType<typeof classifyPhase3Destination>["candidate"];
  identity?: ReturnType<typeof classifyPhase3Destination>["identity"];
  phase2State?: string;
  phase2Reason?: string;
  redirects: Phase3RedirectEvidence[];
  wikidataSearches: Phase3WikidataSearchEvidence[];
  details?: string[];
}

interface Phase3ReportFile {
  schemaVersion: 2;
  scope: typeof SCOPE;
  manifestFingerprint: string;
  baseline: Phase3Manifest["baseline"];
  summary: Record<string, number>;
  safety: Phase3SafetyReport;
  records: Phase3ReportRecord[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function formatGeneratedJson(paths: string[]): void {
  execFileSync("npx", ["prettier", "--write", ...paths], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

function fileFingerprint(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function hasExplicitIdentity(destination: Phase3Destination): boolean {
  return Boolean(
    destination.wikipediaTitle ||
    destination.wikipediaUrl ||
    destination.wikipediaPageId !== undefined ||
    destination.wikidataId,
  );
}

function loadInputs(): {
  destinations: Phase3Destination[];
  phase1: Phase1ReportFile;
  phase2Cache: Phase2CacheFile;
  phase2Report: Phase2ReportFile;
} {
  return {
    destinations: readJson<Phase3Destination[]>(INDEX_PATH),
    phase1: readJson<Phase1ReportFile>(PHASE1_REPORT_PATH),
    phase2Cache: readJson<Phase2CacheFile>(PHASE2_CACHE_PATH),
    phase2Report: readJson<Phase2ReportFile>(PHASE2_REPORT_PATH),
  };
}

function deriveCohort(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): Phase3Destination[] {
  const published = destinations.filter(
    (destination) => destination.status === "published",
  );
  const reviewIds = new Set(phase1.reviewLedger.map((record) => record.id));
  return published
    .filter(
      (destination) =>
        !hasExplicitIdentity(destination) && !reviewIds.has(destination.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function phase1ReviewInputFingerprint(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): Record<string, string> {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  return Object.fromEntries(
    phase1.reviewLedger
      .map((record) => {
        const destination = byId.get(record.id);
        if (!destination)
          throw new Error(`Phase 1 review ID is missing: ${record.id}`);
        return [record.id, phase3InputFingerprint(destination)];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function phase1ReviewIdentityFingerprint(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): Record<string, string> {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  return Object.fromEntries(
    phase1.reviewLedger
      .map((record) => {
        const destination = byId.get(record.id);
        if (!destination)
          throw new Error(`Phase 1 review ID is missing: ${record.id}`);
        return [
          record.id,
          hashStable({
            id: destination.id,
            wikipediaTitle: destination.wikipediaTitle ?? null,
            wikipediaLanguage: destination.wikipediaLanguage ?? null,
            wikipediaUrl: destination.wikipediaUrl ?? null,
            wikipediaPageId: destination.wikipediaPageId ?? null,
            wikidataId: destination.wikidataId ?? null,
          }),
        ];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function buildManifest(inputs = loadInputs()): Phase3Manifest {
  const cohort = deriveCohort(inputs.destinations, inputs.phase1);
  const published = inputs.destinations.filter(
    (destination) => destination.status === "published",
  );
  const canonical = published.filter(hasExplicitIdentity);
  const phase2Records = inputs.phase2Report.records;
  const ids = cohort.map((destination) => destination.id);
  const inputFingerprints = Object.fromEntries(
    cohort.map((destination) => [
      destination.id,
      phase3InputFingerprint(destination),
    ]),
  );
  const phase1Ids = sortedUnique(
    inputs.phase1.reviewLedger.map((record) => record.id),
  );
  const phase1InputFingerprints = phase1ReviewInputFingerprint(
    inputs.destinations,
    inputs.phase1,
  );
  const phase1IdentityFingerprints = phase1ReviewIdentityFingerprint(
    inputs.destinations,
    inputs.phase1,
  );
  const phase2ReportFingerprint = fileFingerprint(PHASE2_REPORT_PATH);
  const phase2CacheFingerprint = fileFingerprint(PHASE2_CACHE_PATH);
  const wholeCohortFingerprint = hashStable({ ids, inputFingerprints });
  return {
    schemaVersion: 2,
    scope: SCOPE,
    baseline: {
      publishedDestinations: published.length,
      canonicalWikipediaIdentity: canonical.length,
      phase1ReviewRecords: phase1Ids.length,
      phase2CohortRecords: phase2Records.length,
      phase2AmbiguousCandidate: phase2Records.filter(
        (record) => record.state === "ambiguous-candidate",
      ).length,
      phase2Unresolved: phase2Records.filter(
        (record) => record.state === "unresolved",
      ).length,
      phase3CohortRecords: cohort.length,
    },
    ids,
    inputFingerprints,
    phase1ReviewLedgerFingerprint: hashStable(phase1Ids),
    phase1ReviewInputFingerprints: phase1InputFingerprints,
    phase1ReviewIdentityFingerprints: phase1IdentityFingerprints,
    phase2ReportFingerprint,
    phase2CacheFingerprint,
    wholeCohortFingerprint,
  };
}

export function validatePhase3Manifest(
  manifest: Phase3Manifest,
  inputs = loadInputs(),
): Phase3Destination[] {
  if (manifest.schemaVersion !== 2 || manifest.scope !== SCOPE) {
    throw new Error("Invalid KAI-256 Phase 3 cohort manifest metadata.");
  }
  const cohort = deriveCohort(inputs.destinations, inputs.phase1);
  const manifestIds = new Set(manifest.ids);
  if (manifest.ids.length !== manifestIds.size) {
    throw new Error("Phase 3 cohort manifest contains duplicate IDs.");
  }
  const expandedIds = cohort
    .filter((destination) => !manifestIds.has(destination.id))
    .map((destination) => destination.id);
  if (expandedIds.length > 0) {
    throw new Error(
      `Phase 3 cohort drift: new eligible IDs outside frozen manifest: ${expandedIds.join(", ")}`,
    );
  }
  const byId = new Map(
    inputs.destinations.map((destination) => [destination.id, destination]),
  );
  for (const id of manifest.ids) {
    const destination = byId.get(id);
    if (!destination) throw new Error(`Phase 3 manifest ID is missing: ${id}`);
    if (
      phase3InputFingerprint(destination) !== manifest.inputFingerprints[id]
    ) {
      throw new Error(`Phase 3 input fingerprint drift: ${id}`);
    }
  }
  const reviewIds = sortedUnique(
    inputs.phase1.reviewLedger.map((record) => record.id),
  );
  if (reviewIds.some((id) => manifestIds.has(id))) {
    throw new Error("Phase 3 cohort intersects the Phase 1 review ledger.");
  }
  if (hashStable(reviewIds) !== manifest.phase1ReviewLedgerFingerprint) {
    throw new Error("Phase 1 review ledger drift detected.");
  }
  const currentReviewInputFingerprints = phase1ReviewInputFingerprint(
    inputs.destinations,
    inputs.phase1,
  );
  if (
    hashStable(currentReviewInputFingerprints) !==
    hashStable(manifest.phase1ReviewInputFingerprints)
  ) {
    throw new Error("Phase 1 review input fingerprint drift detected.");
  }
  const currentReviewIdentityFingerprints = phase1ReviewIdentityFingerprint(
    inputs.destinations,
    inputs.phase1,
  );
  if (
    hashStable(currentReviewIdentityFingerprints) !==
    hashStable(manifest.phase1ReviewIdentityFingerprints)
  ) {
    throw new Error(
      "Phase 1 review source identity fingerprint drift detected.",
    );
  }
  if (
    fileFingerprint(PHASE2_REPORT_PATH) !== manifest.phase2ReportFingerprint
  ) {
    throw new Error("Phase 2 report drift detected.");
  }
  if (fileFingerprint(PHASE2_CACHE_PATH) !== manifest.phase2CacheFingerprint) {
    throw new Error("Phase 2 cache drift detected.");
  }
  if (
    hashStable({
      ids: manifest.ids,
      inputFingerprints: manifest.inputFingerprints,
    }) !== manifest.wholeCohortFingerprint
  ) {
    throw new Error("Phase 3 whole-cohort fingerprint is invalid.");
  }
  return manifest.ids
    .map((id) => byId.get(id))
    .filter((destination): destination is Phase3Destination =>
      Boolean(destination),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function phase2Snapshot(
  id: string,
  phase2Cache: Phase2CacheFile,
  phase2Report: Phase2ReportFile,
): Phase2EvidenceSnapshot | undefined {
  const cacheEntry = phase2Cache.entries[id];
  const report = phase2Report.records.find((record) => record.id === id);
  if (!cacheEntry && !report) return undefined;
  return {
    state: report?.state ?? "unknown",
    reason: report?.reason ?? "unknown",
    searches: cacheEntry?.searches ?? [],
    candidates: report?.candidates ?? cacheEntry?.candidates ?? [],
    ...(report ? { reportRecord: report as Record<string, unknown> } : {}),
    ...(cacheEntry
      ? { cacheEntry: cacheEntry as Record<string, unknown> }
      : {}),
    ...(report?.candidates && cacheEntry?.candidates
      ? { apiCandidates: cacheEntry.candidates }
      : {}),
    ...(report?.details ? { details: report.details } : {}),
  };
}

function coordinateFromPage(
  page: Record<string, unknown>,
): { lat: number; lng: number } | undefined {
  const coordinates = Array.isArray(page.coordinates) ? page.coordinates : [];
  const point = coordinates.find(
    (value): value is { lat: number; lon: number } =>
      Boolean(
        value &&
        typeof value === "object" &&
        typeof (value as { lat?: unknown }).lat === "number" &&
        typeof (value as { lon?: unknown }).lon === "number",
      ),
  );
  return point ? { lat: point.lat, lng: point.lon } : undefined;
}

function pageFromApi(
  language: WikipediaLanguage,
  raw: Record<string, unknown>,
): Phase3Page | undefined {
  if (raw.missing === true || typeof raw.title !== "string") return undefined;
  const props =
    raw.pageprops && typeof raw.pageprops === "object"
      ? (raw.pageprops as Record<string, unknown>)
      : {};
  const title = raw.title;
  const url =
    (typeof raw.canonicalurl === "string" && raw.canonicalurl) ||
    (typeof raw.fullurl === "string" && raw.fullurl) ||
    `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  return {
    language,
    title,
    url,
    ...(typeof raw.pageid === "number" ? { pageId: raw.pageid } : {}),
    ...(typeof props.wikibase_item === "string"
      ? { wikidataId: props.wikibase_item }
      : {}),
    extract: typeof raw.extract === "string" ? raw.extract : "",
    ...(typeof raw.description === "string"
      ? { description: raw.description }
      : typeof props["wikibase-shortdesc"] === "string"
        ? { description: props["wikibase-shortdesc"] as string }
        : {}),
    ...(props.disambiguation !== undefined ? { type: "disambiguation" } : {}),
    ...(coordinateFromPage(raw)
      ? { coordinates: coordinateFromPage(raw) }
      : {}),
  };
}

let lastRequestAt = 0;

async function throttledRequest(
  url: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    let retryDelayMs: number | undefined;
    const wait = REQUEST_DELAY_MS - (Date.now() - lastRequestAt);
    if (wait > 0)
      await new Promise((resolveWait) => setTimeout(resolveWait, wait));
    lastRequestAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        signal: controller.signal,
        headers: { "user-agent": "meguruto-kai-256-phase3/1.0" },
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        retryDelayMs = Number.isFinite(retryAfter)
          ? Math.min(
              MAX_RETRY_AFTER_MS,
              Math.max(REQUEST_DELAY_MS, retryAfter * 1000),
            )
          : REQUEST_DELAY_MS * 2 ** (attempt - 1);
        throw new Error(`HTTP ${response.status}`);
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object")
        throw new Error("Invalid JSON object");
      return payload as Record<string, unknown>;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolveWait) =>
          setTimeout(
            resolveWait,
            retryDelayMs ?? REQUEST_DELAY_MS * 2 ** (attempt - 1),
          ),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Transient request failure for ${url}: ${String(lastError)}`);
}

function wikiParams(titles: string[]): URLSearchParams {
  return new URLSearchParams({
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
}

async function fetchWikiBatch(
  language: WikipediaLanguage,
  titles: string[],
): Promise<{ pages: Phase3Page[]; redirects: Phase3RedirectEvidence[] }> {
  if (titles.length === 0) return { pages: [], redirects: [] };
  const payload = await throttledRequest(
    `https://${language}.wikipedia.org/w/api.php`,
    wikiParams(titles),
  );
  const query =
    payload.query && typeof payload.query === "object"
      ? (payload.query as Record<string, unknown>)
      : undefined;
  if (!query || !Array.isArray(query.pages)) {
    throw new Error("Wikipedia response omitted query.pages.");
  }
  const rawPages = query.pages;
  const pages = rawPages
    .map((raw) =>
      raw && typeof raw === "object"
        ? pageFromApi(language, raw as Record<string, unknown>)
        : undefined,
    )
    .filter((page): page is Phase3Page => Boolean(page));
  const rawRedirects = Array.isArray(query?.redirects) ? query.redirects : [];
  const redirects = rawRedirects
    .filter((raw): raw is Record<string, unknown> =>
      Boolean(raw && typeof raw === "object"),
    )
    .filter((raw) => typeof raw.from === "string" && typeof raw.to === "string")
    .map((raw) => ({
      language,
      fromTitle: raw.from as string,
      toTitle: raw.to as string,
      ...(pages.find((page) => page.title === raw.to)?.url
        ? { url: pages.find((page) => page.title === raw.to)?.url }
        : {}),
    }));
  return { pages, redirects };
}

function destinationTitles(
  destination: Phase3Destination,
  language: WikipediaLanguage,
): string[] {
  const names = [
    language === "en" ? destination.name : destination.nameJa,
    ...(destination.aliases ?? []),
  ];
  return sortedUnique(
    names.filter((name): name is string => Boolean(name)).slice(0, 8),
  );
}

async function discoverRedirects(destinations: Phase3Destination[]): Promise<{
  redirectsById: Map<string, Phase3RedirectEvidence[]>;
  candidatesById: Map<string, Phase3Candidate[]>;
}> {
  const redirectsById = new Map<string, Phase3RedirectEvidence[]>();
  const candidatesById = new Map<string, Phase3Candidate[]>();
  for (const language of ["en", "ja"] as const) {
    const owners = new Map<string, string[]>();
    for (const destination of destinations) {
      for (const title of destinationTitles(destination, language)) {
        const key = title.toLocaleLowerCase();
        owners.set(key, [...(owners.get(key) ?? []), destination.id]);
      }
    }
    const titles = Array.from(owners.keys()).sort((left, right) =>
      left.localeCompare(right),
    );
    for (let start = 0; start < titles.length; start += 40) {
      const batch = titles.slice(start, start + 40);
      const response = await fetchWikiBatch(language, batch);
      for (const redirect of response.redirects) {
        const ownerIds =
          owners.get(redirect.fromTitle.toLocaleLowerCase()) ?? [];
        const page = response.pages.find(
          (item) => item.title === redirect.toTitle,
        );
        for (const id of ownerIds) {
          redirectsById.set(id, [...(redirectsById.get(id) ?? []), redirect]);
          if (!page) continue;
          const current = candidatesById.get(id) ?? [];
          current.push({
            page,
            ...(page.wikidataId ? { qid: page.wikidataId } : {}),
            sources: ["wikipedia-redirect"],
            queries: [`redirect:${language}:${redirect.fromTitle}`],
            redirectFromTitles: [redirect.fromTitle],
          });
          candidatesById.set(id, current);
        }
      }
    }
  }
  return { redirectsById, candidatesById };
}

function searchQueries(destination: Phase3Destination): Array<{
  language: string;
  query: string;
}> {
  const values = [
    { language: "en", query: destination.name },
    ...(destination.nameJa
      ? [{ language: "ja", query: destination.nameJa }]
      : []),
    ...(destination.aliases ?? []).map((query) => ({
      language: [...query].some(
        (character) => (character.codePointAt(0) ?? 0) > 0x7f,
      )
        ? "ja"
        : "en",
      query,
    })),
  ];
  const seen = new Set<string>();
  return values
    .filter(({ language, query }) => {
      const key = `${language}:${query}`;
      if (!query || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_QUERIES_PER_DESTINATION);
}

function sparqlLiteral(value: string, language: string): string {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", " ")}"@${language}`;
}

async function searchWikidataBatch(
  terms: Array<{ language: string; query: string }>,
): Promise<Map<string, Phase3WikidataSearchEvidence>> {
  const resultsByTerm = new Map<
    string,
    Map<string, { label?: string; description?: string }>
  >();
  for (let start = 0; start < terms.length; start += 80) {
    const batch = terms.slice(start, start + 80);
    const values = batch
      .map((term) => sparqlLiteral(term.query, term.language))
      .join(" ");
    const query = `SELECT ?term ?item ?labelEn ?labelJa ?descriptionEn ?descriptionJa WHERE {
      VALUES ?term { ${values} }
      { ?item <http://www.w3.org/2000/01/rdf-schema#label> ?term }
      UNION
      { ?item <http://www.w3.org/2004/02/skos/core#altLabel> ?term }
      OPTIONAL { ?item <http://www.w3.org/2000/01/rdf-schema#label> ?labelEn . FILTER(LANG(?labelEn) = "en") }
      OPTIONAL { ?item <http://www.w3.org/2000/01/rdf-schema#label> ?labelJa . FILTER(LANG(?labelJa) = "ja") }
      OPTIONAL { ?item <http://schema.org/description> ?descriptionEn . FILTER(LANG(?descriptionEn) = "en") }
      OPTIONAL { ?item <http://schema.org/description> ?descriptionJa . FILTER(LANG(?descriptionJa) = "ja") }
    }`;
    const payload = await throttledRequest(
      "https://query.wikidata.org/sparql",
      new URLSearchParams({ query, format: "json" }),
    );
    const rawResults =
      payload.results && typeof payload.results === "object"
        ? (payload.results as Record<string, unknown>).bindings
        : undefined;
    if (!Array.isArray(rawResults)) {
      throw new Error("Wikidata SPARQL response omitted results.bindings.");
    }
    for (const raw of rawResults) {
      if (!raw || typeof raw !== "object") continue;
      const binding = raw as Record<string, unknown>;
      const term = binding.term;
      const item = binding.item;
      if (
        !term ||
        typeof term !== "object" ||
        !item ||
        typeof item !== "object" ||
        typeof (term as { value?: unknown }).value !== "string" ||
        typeof (item as { value?: unknown }).value !== "string"
      )
        continue;
      const termValue = (term as { value: string }).value;
      const termLanguage = (term as { [key: string]: unknown })["xml:lang"];
      const itemValue = (item as { value: string }).value;
      const qid = itemValue.split("/").at(-1);
      if (typeof qid !== "string" || !/^Q\d+$/i.test(qid)) continue;
      const key = `${typeof termLanguage === "string" ? termLanguage : "en"}:${termValue}`;
      const labelBinding =
        typeof termLanguage === "string" && termLanguage === "ja"
          ? binding.labelJa
          : binding.labelEn;
      const descriptionBinding =
        typeof termLanguage === "string" && termLanguage === "ja"
          ? binding.descriptionJa
          : binding.descriptionEn;
      const label =
        labelBinding &&
        typeof labelBinding === "object" &&
        typeof (labelBinding as { value?: unknown }).value === "string"
          ? (labelBinding as { value: string }).value
          : undefined;
      const description =
        descriptionBinding &&
        typeof descriptionBinding === "object" &&
        typeof (descriptionBinding as { value?: unknown }).value === "string"
          ? (descriptionBinding as { value: string }).value
          : undefined;
      const candidates = resultsByTerm.get(key) ?? new Map();
      if (!candidates.has(qid.toLocaleUpperCase())) {
        candidates.set(qid.toLocaleUpperCase(), { label, description });
      }
      resultsByTerm.set(key, candidates);
    }
  }
  const result = new Map<string, Phase3WikidataSearchEvidence>();
  for (const term of terms) {
    const key = `${term.language}:${term.query}`;
    const candidates = resultsByTerm.get(key) ?? new Map();
    const sorted = Array.from(candidates.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 5);
    result.set(key, {
      language: term.language,
      query: term.query,
      results: sorted.map(([qid, item], rank) => ({
        qid,
        ...(item.label ? { label: item.label } : {}),
        ...(item.description ? { description: item.description } : {}),
        language: term.language,
        rank,
      })),
    });
  }
  return result;
}

function localizedValue(value: unknown): string | undefined {
  return value &&
    typeof value === "object" &&
    typeof (value as { value?: unknown }).value === "string"
    ? (value as { value: string }).value
    : undefined;
}

function localizedMap(
  value: unknown,
): Partial<Record<WikipediaLanguage, string>> {
  if (!value || typeof value !== "object") return {};
  const result: Partial<Record<WikipediaLanguage, string>> = {};
  for (const language of ["en", "ja"] as const) {
    const localized = localizedValue(
      (value as Record<string, unknown>)[language],
    );
    if (localized) result[language] = localized;
  }
  return result;
}

function aliasesMap(
  value: unknown,
): Partial<Record<WikipediaLanguage, string[]>> {
  if (!value || typeof value !== "object") return {};
  const result: Partial<Record<WikipediaLanguage, string[]>> = {};
  for (const language of ["en", "ja"] as const) {
    const raw = (value as Record<string, unknown>)[language];
    if (!Array.isArray(raw)) continue;
    const aliases = raw
      .map(localizedValue)
      .filter((alias): alias is string => Boolean(alias))
      .sort((left, right) => left.localeCompare(right));
    if (aliases.length) result[language] = aliases;
  }
  return result;
}

function claimIds(claims: unknown, property: string): string[] {
  if (!claims || typeof claims !== "object") return [];
  const raw = (claims as Record<string, unknown>)[property];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((claim) => {
      const mainsnak =
        claim && typeof claim === "object"
          ? (claim as Record<string, unknown>).mainsnak
          : undefined;
      const data =
        mainsnak && typeof mainsnak === "object"
          ? (mainsnak as Record<string, unknown>).datavalue
          : undefined;
      const value =
        data && typeof data === "object"
          ? (data as Record<string, unknown>).value
          : undefined;
      return value &&
        typeof value === "object" &&
        typeof (value as { id?: unknown }).id === "string"
        ? (value as { id: string }).id
        : undefined;
    })
    .filter((id): id is string => Boolean(id));
}

function coordinateFromClaims(
  claims: unknown,
): { lat: number; lng: number } | undefined {
  if (!claims || typeof claims !== "object") return undefined;
  const raw = (claims as Record<string, unknown>).P625;
  if (!Array.isArray(raw)) return undefined;
  for (const claim of raw) {
    const mainsnak =
      claim && typeof claim === "object"
        ? (claim as Record<string, unknown>).mainsnak
        : undefined;
    const data =
      mainsnak && typeof mainsnak === "object"
        ? (mainsnak as Record<string, unknown>).datavalue
        : undefined;
    const value =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).value
        : undefined;
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { latitude?: unknown }).latitude === "number" &&
      typeof (value as { longitude?: unknown }).longitude === "number"
    ) {
      return {
        lat: (value as { latitude: number }).latitude,
        lng: (value as { longitude: number }).longitude,
      };
    }
  }
  return undefined;
}

function parseWikidataEntity(
  qid: string,
  raw: Record<string, unknown>,
): Phase3WikidataEntity {
  const labels = localizedMap(raw.labels);
  const descriptions = localizedMap(raw.descriptions);
  const aliases = aliasesMap(raw.aliases);
  const claims = raw.claims;
  const references = (property: string) =>
    claimIds(claims, property).map((id) => ({ id }));
  const rawSitelinks =
    raw.sitelinks && typeof raw.sitelinks === "object"
      ? (raw.sitelinks as Record<string, unknown>)
      : {};
  const sitelinks: Partial<
    Record<WikipediaLanguage, { title: string; url?: string }>
  > = {};
  for (const [language, site] of [
    ["en", "enwiki"],
    ["ja", "jawiki"],
  ] as const) {
    const link = rawSitelinks[site];
    if (!link || typeof link !== "object") continue;
    const title = (link as { title?: unknown }).title;
    if (typeof title !== "string") continue;
    const url = (link as { url?: unknown }).url;
    sitelinks[language] = {
      title,
      ...(typeof url === "string" ? { url } : {}),
    };
  }
  return {
    qid,
    labels,
    aliases,
    descriptions,
    p31: references("P31"),
    p279: references("P279"),
    p131: references("P131"),
    p17: references("P17"),
    ...(coordinateFromClaims(claims)
      ? { coordinates: coordinateFromClaims(claims) }
      : {}),
    sitelinks,
  };
}

async function fetchWikidataEntities(
  qids: string[],
): Promise<Map<string, Phase3WikidataEntity>> {
  const entities = new Map<string, Phase3WikidataEntity>();
  const unique = sortedUnique(qids.map((qid) => qid.toLocaleUpperCase()));
  for (let start = 0; start < unique.length; start += 50) {
    const batch = unique.slice(start, start + 50);
    const payload = await throttledRequest(
      "https://www.wikidata.org/w/api.php",
      new URLSearchParams({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "labels|descriptions|aliases|claims|sitelinks",
        languages: "en|ja",
        sitefilter: "enwiki|jawiki",
        format: "json",
        formatversion: "2",
      }),
    );
    const rawEntities = payload.entities;
    if (!rawEntities || typeof rawEntities !== "object") {
      throw new Error("Wikidata response omitted entities.");
    }
    for (const [qid, raw] of Object.entries(
      rawEntities as Record<string, unknown>,
    )) {
      if (raw && typeof raw === "object") {
        entities.set(
          qid.toLocaleUpperCase(),
          parseWikidataEntity(qid, raw as Record<string, unknown>),
        );
      }
    }
  }

  const referenceIds = sortedUnique(
    Array.from(entities.values()).flatMap((entity) =>
      [...entity.p31, ...entity.p279, ...entity.p131, ...entity.p17].map(
        (claim) => claim.id,
      ),
    ),
  ).filter((qid) => !entities.has(qid.toLocaleUpperCase()));
  for (let start = 0; start < referenceIds.length; start += 50) {
    const batch = referenceIds.slice(start, start + 50);
    const payload = await throttledRequest(
      "https://www.wikidata.org/w/api.php",
      new URLSearchParams({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "labels",
        languages: "en|ja",
        format: "json",
        formatversion: "2",
      }),
    );
    const rawEntities = payload.entities;
    if (!rawEntities || typeof rawEntities !== "object") {
      throw new Error("Wikidata response omitted entities.");
    }
    for (const [qid, raw] of Object.entries(
      rawEntities as Record<string, unknown>,
    )) {
      if (!raw || typeof raw !== "object") continue;
      const labels = localizedMap((raw as Record<string, unknown>).labels);
      entities.set(qid.toLocaleUpperCase(), {
        qid,
        labels,
        aliases: {},
        descriptions: {},
        p31: [],
        p279: [],
        p131: [],
        p17: [],
        sitelinks: {},
      });
    }
  }
  const labelFor = (qid: string): string | undefined =>
    entities.get(qid.toLocaleUpperCase())?.labels.en ??
    entities.get(qid.toLocaleUpperCase())?.labels.ja;
  for (const entity of entities.values()) {
    for (const claims of [entity.p31, entity.p279, entity.p131, entity.p17]) {
      for (const claim of claims) claim.label = labelFor(claim.id);
    }
  }
  return entities;
}

function mergeCandidate(
  candidates: Map<string, Phase3Candidate>,
  candidate: Phase3Candidate,
): void {
  const key = `${candidate.page.language}:${candidate.page.pageId ?? candidate.page.url}`;
  const existing = candidates.get(key);
  if (!existing) {
    candidates.set(key, candidate);
    return;
  }
  const sources = sortedUnique([
    ...existing.sources,
    ...candidate.sources,
  ]) as Phase3Source[];
  const queries = sortedUnique([...existing.queries, ...candidate.queries]);
  const redirects = sortedUnique([
    ...(existing.redirectFromTitles ?? []),
    ...(candidate.redirectFromTitles ?? []),
  ]);
  candidates.set(key, {
    ...existing,
    ...(candidate.qid ? { qid: candidate.qid } : {}),
    sources,
    queries,
    ...(redirects.length ? { redirectFromTitles: redirects } : {}),
    ...(candidate.entity ? { entity: candidate.entity } : {}),
  });
}

async function discoverPhase3(
  destinations: Phase3Destination[],
  phase2Cache: Phase2CacheFile,
  phase2Report: Phase2ReportFile,
): Promise<Map<string, Phase3CacheEntry>> {
  const redirects = await discoverRedirects(destinations);
  const searchesById = new Map<string, Phase3WikidataSearchEvidence[]>();
  const qidsById = new Map<string, Set<string>>();
  const searchedQidsById = new Map<string, Set<string>>();
  const ownersByTerm = new Map<string, string[]>();
  const termsById = new Map<
    string,
    Array<{ language: string; query: string }>
  >();
  for (const destination of destinations) {
    const terms = searchQueries(destination);
    termsById.set(destination.id, terms);
    for (const term of terms) {
      const key = `${term.language}:${term.query}`;
      ownersByTerm.set(key, [...(ownersByTerm.get(key) ?? []), destination.id]);
    }
  }
  const searchTerms = Array.from(ownersByTerm.keys())
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const separator = key.indexOf(":");
      return {
        language: key.slice(0, separator),
        query: key.slice(separator + 1),
      };
    });
  const searchResults = await searchWikidataBatch(searchTerms);
  for (const destination of destinations) {
    const searches = (termsById.get(destination.id) ?? [])
      .map((term) => searchResults.get(`${term.language}:${term.query}`))
      .filter((search): search is Phase3WikidataSearchEvidence =>
        Boolean(search),
      );
    const qids = new Set<string>();
    const searchedQids = new Set<string>();
    for (const search of searches) {
      for (const item of search.results) {
        qids.add(item.qid);
        searchedQids.add(item.qid.toLocaleUpperCase());
      }
    }
    const phase2Candidates =
      phase2Cache.entries[destination.id]?.candidates ?? [];
    for (const item of phase2Candidates) {
      if (typeof item.wikidataId === "string") qids.add(item.wikidataId);
    }
    for (const item of redirects.candidatesById.get(destination.id) ?? []) {
      if (item.qid) qids.add(item.qid);
    }
    searchesById.set(destination.id, searches);
    qidsById.set(destination.id, qids);
    searchedQidsById.set(destination.id, searchedQids);
  }
  const allQids = sortedUnique(
    Array.from(qidsById.values()).flatMap((qids) => Array.from(qids)),
  );
  const entities = await fetchWikidataEntities(allQids);
  const qidsWithEntities = new Set(entities.keys());
  const sitelinkTitles = new Map<WikipediaLanguage, Set<string>>([
    ["en", new Set<string>()],
    ["ja", new Set<string>()],
  ]);
  for (const qid of qidsWithEntities) {
    const entity = entities.get(qid);
    if (!entity) continue;
    for (const language of ["en", "ja"] as const) {
      const title = entity.sitelinks[language]?.title;
      if (title) sitelinkTitles.get(language)?.add(title);
    }
  }
  const sitelinkPages = new Map<string, Phase3Page>();
  for (const language of ["en", "ja"] as const) {
    const titles = Array.from(sitelinkTitles.get(language) ?? []).sort(
      (left, right) => left.localeCompare(right),
    );
    for (let start = 0; start < titles.length; start += 40) {
      const batch = titles.slice(start, start + 40);
      const response = await fetchWikiBatch(language, batch);
      for (const page of response.pages)
        sitelinkPages.set(`${language}:${page.title}`, page);
    }
  }

  const results = new Map<string, Phase3CacheEntry>();
  for (const destination of destinations) {
    const byPage = new Map<string, Phase3Candidate>();
    const phase2Entry = phase2Cache.entries[destination.id];
    for (const raw of phase2Entry?.candidates ?? []) {
      if (raw.language !== "en" && raw.language !== "ja") continue;
      if (typeof raw.title !== "string" || typeof raw.url !== "string")
        continue;
      const page: Phase3Page = {
        language: raw.language,
        title: raw.title,
        url: raw.url,
        ...(typeof raw.pageId === "number" ? { pageId: raw.pageId } : {}),
        ...(typeof raw.wikidataId === "string"
          ? { wikidataId: raw.wikidataId }
          : {}),
        extract: typeof raw.extract === "string" ? raw.extract : "",
        ...(typeof raw.description === "string"
          ? { description: raw.description }
          : {}),
        ...(raw.coordinates && typeof raw.coordinates === "object"
          ? { coordinates: raw.coordinates as { lat: number; lng: number } }
          : {}),
      };
      mergeCandidate(byPage, {
        page,
        ...(page.wikidataId ? { qid: page.wikidataId } : {}),
        sources: ["phase2"],
        queries: typeof raw.searchQuery === "string" ? [raw.searchQuery] : [],
      });
    }
    for (const item of redirects.candidatesById.get(destination.id) ?? []) {
      mergeCandidate(byPage, item);
    }
    const qids = qidsById.get(destination.id) ?? new Set<string>();
    for (const qid of qids) {
      const entity = entities.get(qid.toLocaleUpperCase());
      if (!entity) continue;
      for (const language of ["en", "ja"] as const) {
        const title = entity.sitelinks[language]?.title;
        if (!title) continue;
        const page = sitelinkPages.get(`${language}:${title}`);
        if (!page) continue;
        const sources: Phase3Source[] = ["wikidata-sitelink"];
        if (
          searchedQidsById.get(destination.id)?.has(qid.toLocaleUpperCase())
        ) {
          sources.push("wikidata-search");
        }
        mergeCandidate(byPage, {
          page,
          qid: entity.qid,
          sources,
          queries: [`wikidata-sitelink:${entity.qid}`],
          entity,
        });
      }
    }
    const candidates = Array.from(byPage.values()).map((candidate) => ({
      ...candidate,
      ...(candidate.qid && entities.get(candidate.qid.toLocaleUpperCase())
        ? { entity: entities.get(candidate.qid.toLocaleUpperCase()) }
        : {}),
    }));
    results.set(destination.id, {
      status: "ok",
      inputFingerprint: phase3InputFingerprint(destination),
      phase2: phase2Snapshot(destination.id, phase2Cache, phase2Report),
      redirects: sortedRedirects(
        redirects.redirectsById.get(destination.id) ?? [],
      ),
      wikidataSearches: (searchesById.get(destination.id) ?? []).sort(
        (left, right) =>
          `${left.language}:${left.query}`.localeCompare(
            `${right.language}:${right.query}`,
          ),
      ),
      candidates: candidates.sort((left, right) =>
        `${left.page.language}:${left.page.title}:${left.page.pageId ?? 0}`.localeCompare(
          `${right.page.language}:${right.page.title}:${right.page.pageId ?? 0}`,
        ),
      ),
    });
  }
  return results;
}

function sortedRedirects(
  redirects: Phase3RedirectEvidence[],
): Phase3RedirectEvidence[] {
  return redirects
    .sort((left, right) =>
      `${left.language}:${left.fromTitle}:${left.toTitle}`.localeCompare(
        `${right.language}:${right.fromTitle}:${right.toTitle}`,
      ),
    )
    .filter(
      (redirect, index, all) =>
        index === 0 ||
        `${redirect.language}:${redirect.fromTitle}:${redirect.toTitle}` !==
          `${all[index - 1].language}:${all[index - 1].fromTitle}:${all[index - 1].toTitle}`,
    );
}

function validCacheEntry(
  entry: Phase3CacheEntry | undefined,
  destination: Phase3Destination,
): entry is Phase3CacheEntry {
  return Boolean(
    entry &&
    entry.status === "ok" &&
    entry.inputFingerprint === phase3InputFingerprint(destination),
  );
}

async function loadOrFetchCache(
  manifest: Phase3Manifest,
  cohort: Phase3Destination[],
  fetchEnabled: boolean,
  phase2Cache: Phase2CacheFile,
  phase2Report: Phase2ReportFile,
): Promise<Phase3CacheFile> {
  const existing = existsSync(CACHE_PATH)
    ? readJson<Phase3CacheFile>(CACHE_PATH)
    : undefined;
  if (
    existing &&
    (existing.schemaVersion !== 2 ||
      existing.scope !== SCOPE ||
      existing.manifestFingerprint !== manifest.wholeCohortFingerprint ||
      existing.phase2ReportFingerprint !== manifest.phase2ReportFingerprint ||
      existing.phase2CacheFingerprint !== manifest.phase2CacheFingerprint)
  ) {
    throw new Error("Invalid or stale KAI-256 Phase 3 API cache metadata.");
  }
  const entries: Record<string, Phase3CacheEntry> = {};
  const missing = cohort.filter(
    (destination) =>
      !validCacheEntry(existing?.entries[destination.id], destination),
  );
  if (missing.length > 0 && !fetchEnabled) {
    throw new Error(
      `Offline mode needs ${missing.length} cached Phase 3 destinations; rerun with --fetch.`,
    );
  }
  for (const destination of cohort) {
    const cached = existing?.entries[destination.id];
    if (validCacheEntry(cached, destination)) entries[destination.id] = cached;
  }
  if (missing.length > 0) {
    try {
      const discovered = await discoverPhase3(
        missing,
        phase2Cache,
        phase2Report,
      );
      for (const destination of missing) {
        entries[destination.id] = discovered.get(destination.id) ?? {
          status: "transient-failure",
          inputFingerprint: phase3InputFingerprint(destination),
          redirects: [],
          wikidataSearches: [],
          candidates: [],
          transientFailure: "No discovery result was returned.",
        };
      }
    } catch (error) {
      for (const destination of missing) {
        entries[destination.id] = {
          status: "transient-failure",
          inputFingerprint: phase3InputFingerprint(destination),
          redirects: [],
          wikidataSearches: [],
          candidates: [],
          transientFailure: String(error),
        };
      }
    }
  }
  for (const destination of cohort) {
    const entry = entries[destination.id];
    if (!entry) continue;
    entries[destination.id] = {
      ...entry,
      phase2: phase2Snapshot(destination.id, phase2Cache, phase2Report),
    };
  }
  const cache: Phase3CacheFile = {
    schemaVersion: 2,
    scope: SCOPE,
    manifestFingerprint: manifest.wholeCohortFingerprint,
    phase2ReportFingerprint: manifest.phase2ReportFingerprint,
    phase2CacheFingerprint: manifest.phase2CacheFingerprint,
    entries: Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
  writeJson(CACHE_PATH, cache);
  return cache;
}

function reportFor(
  manifest: Phase3Manifest,
  cohort: Phase3Destination[],
  cache: Phase3CacheFile,
  phase1ReviewModified: boolean,
): Phase3ReportFile {
  const records: Phase3ReportRecord[] = [];
  for (const destination of cohort) {
    const entry = cache.entries[destination.id];
    const classification = entry
      ? classifyPhase3Destination(destination, {
          phase2: entry.phase2,
          candidates: entry.candidates,
          redirects: entry.redirects,
          wikidataSearches: entry.wikidataSearches,
          ...(entry.transientFailure
            ? { transientFailure: entry.transientFailure }
            : {}),
        })
      : classifyPhase3Destination(destination, {
          candidates: [],
          redirects: [],
          wikidataSearches: [],
          transientFailure: "Missing cache entry.",
        });
    const state =
      classification.identity &&
      phase3IdentityMatches(destination, classification.identity)
        ? "canonicalized"
        : classification.state;
    records.push({
      id: destination.id,
      state,
      reason: classification.reason,
      candidates: classification.candidates,
      ...(classification.candidate
        ? { chosenCandidate: classification.candidate }
        : {}),
      ...(classification.identity ? { identity: classification.identity } : {}),
      ...(entry?.phase2?.state ? { phase2State: entry.phase2.state } : {}),
      ...(entry?.phase2?.reason ? { phase2Reason: entry.phase2.reason } : {}),
      redirects: entry?.redirects ?? [],
      wikidataSearches: entry?.wikidataSearches ?? [],
      ...(classification.details ? { details: classification.details } : {}),
    });
  }
  const summary = Object.fromEntries(
    [
      "canonicalized",
      "high-confidence-awaiting-apply",
      "ambiguous-candidate",
      "no-standalone-article-expected",
      "unresolved",
    ].map((state) => [
      state,
      records.filter((record) => record.state === state).length,
    ]),
  );
  const candidatesForSafety = records.filter(
    (record) =>
      record.identity !== undefined && record.chosenCandidate !== undefined,
  );
  const safety: Phase3SafetyReport = {
    similarityOnlyAcceptance: candidatesForSafety.some((record) => {
      const signals = record.chosenCandidate?.identitySignals ?? [];
      return !signals.some((signal) =>
        [
          "wikipedia-title-match",
          "canonical-name-or-approved-alias",
          "wikipedia-redirect",
          "wikidata-label-or-alias",
        ].includes(signal),
      );
    }),
    geographyBypassed: candidatesForSafety.some(
      (record) =>
        ![
          "coordinates-compatible",
          "administrative-location-compatible",
        ].includes(record.chosenCandidate?.geographyResult ?? ""),
    ),
    entityValidationBypassed: candidatesForSafety.some(
      (record) => record.chosenCandidate?.entityTypeResult !== "compatible",
    ),
    enJaEquivalenceGuessed: candidatesForSafety.some((record) => {
      const languages = new Set(
        record.candidates.map((candidate) => candidate.language),
      );
      return (
        languages.size > 1 &&
        !record.chosenCandidate?.sharesVerifiedWikidataIdentity
      );
    }),
    parentArticleSubstitution: candidatesForSafety.some(
      (record) => record.reason === "parent-child-ambiguity",
    ),
    phase1ReviewModified,
    transientFailures: Object.values(cache.entries).filter(
      (entry) => entry.status === "transient-failure",
    ).length,
  };
  return {
    schemaVersion: 2,
    scope: SCOPE,
    manifestFingerprint: manifest.wholeCohortFingerprint,
    baseline: manifest.baseline,
    summary,
    safety,
    records,
  };
}

export function applyClassifications(
  cohort: Phase3Destination[],
  cache: Phase3CacheFile,
): number {
  const transientIds = Object.entries(cache.entries)
    .filter(([, entry]) => entry.status === "transient-failure")
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right));
  if (transientIds.length > 0) {
    throw new Error(
      `Refusing Phase 3 apply with transient cache entries: ${transientIds.join(", ")}`,
    );
  }
  let applied = 0;
  for (const destination of cohort) {
    const entry = cache.entries[destination.id];
    if (!entry || entry.status !== "ok") continue;
    const classification = classifyPhase3Destination(destination, {
      phase2: entry.phase2,
      candidates: entry.candidates,
      redirects: entry.redirects,
      wikidataSearches: entry.wikidataSearches,
    });
    if (!classification.identity) continue;
    if (applyPhase3Identity(destination, classification.identity)) applied += 1;
  }
  return applied;
}

function parseArgs(): {
  initManifest: boolean;
  fetch: boolean;
  offline: boolean;
  apply: boolean;
} {
  const args = new Set(process.argv.slice(2));
  const initManifest = args.has("--init-manifest");
  const fetchEnabled = args.has("--fetch");
  const offline = args.has("--offline") || !fetchEnabled;
  const apply = args.has("--apply");
  if (fetchEnabled && offline) {
    throw new Error("Use --fetch or --offline, not both.");
  }
  if (apply && !offline) {
    throw new Error(
      "--apply requires --offline after a committed cache exists.",
    );
  }
  return { initManifest, fetch: fetchEnabled, offline, apply };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const inputs = loadInputs();
  const generatedManifest = buildManifest(inputs);
  if (options.initManifest) {
    if (existsSync(MANIFEST_PATH)) {
      const current = readJson<Phase3Manifest>(MANIFEST_PATH);
      validatePhase3Manifest(current, inputs);
      if (hashStable(current) !== hashStable(generatedManifest)) {
        throw new Error(
          "Existing Phase 3 manifest differs from current merged-main baseline.",
        );
      }
      console.log(`Phase 3 manifest already frozen: ${MANIFEST_PATH}`);
    } else {
      writeJson(MANIFEST_PATH, generatedManifest);
      console.log(`Initialized Phase 3 manifest: ${MANIFEST_PATH}`);
    }
    formatGeneratedJson([MANIFEST_PATH]);
    return;
  }
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      "Phase 3 cohort manifest is missing; run --init-manifest first.",
    );
  }
  const manifest = readJson<Phase3Manifest>(MANIFEST_PATH);
  const cohort = validatePhase3Manifest(manifest, inputs);
  const cache = await loadOrFetchCache(
    manifest,
    cohort,
    options.fetch,
    inputs.phase2Cache,
    inputs.phase2Report,
  );
  const phase1ReviewIdentityBefore = phase1ReviewIdentityFingerprint(
    inputs.destinations,
    inputs.phase1,
  );
  let applied = 0;
  if (options.apply) {
    applied = applyClassifications(cohort, cache);
    if (applied > 0) writeJson(INDEX_PATH, inputs.destinations);
  }
  const phase1ReviewModified =
    hashStable(phase1ReviewIdentityBefore) !==
    hashStable(
      phase1ReviewIdentityFingerprint(inputs.destinations, inputs.phase1),
    );
  const report = reportFor(manifest, cohort, cache, phase1ReviewModified);
  writeJson(REPORT_PATH, report);
  formatGeneratedJson([MANIFEST_PATH, CACHE_PATH, REPORT_PATH]);
  console.log(
    JSON.stringify(
      {
        scope: SCOPE,
        cohort: cohort.length,
        fetched: options.fetch,
        applied,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
