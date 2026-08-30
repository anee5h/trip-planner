#!/usr/bin/env node
/**
 * KAI-256 bounded migration of legacy Wikipedia provenance.
 *
 * The default mode is offline and requires an API cache. Network access is
 * explicit (`--fetch`), bounded, and never runs from normal builds/tests.
 * Only records that pass the existing fail-closed Wikipedia validator and the
 * legacy classifier are written when `--apply` is supplied.
 *
 * Examples:
 *   npx tsx scripts/migrate-wikipedia-legacy-provenance.ts \
 *     --fetch --report scripts/audit/kai-256-wikipedia-legacy-report.json \
 *     --cache scripts/audit/kai-256-wikipedia-legacy-api-cache.json
 *   npx tsx scripts/migrate-wikipedia-legacy-provenance.ts \
 *     --offline --apply --report scripts/audit/kai-256-wikipedia-legacy-report.json \
 *     --cache scripts/audit/kai-256-wikipedia-legacy-api-cache.json
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
  parseWikipediaUrl,
  type WikipediaIdentitySource,
} from "../src/shared/services/wikipedia/WikipediaIdentity";
import {
  classifyLegacyDestination,
  type LegacyCandidate,
  type LegacyCandidateFailure,
  type LegacyClassification,
  type LegacyDestination,
} from "./lib/wikipediaLegacyMigration";

interface ApiCacheEntryOk {
  status: "ok";
  candidate: LegacyCandidate;
}
interface ApiCacheEntryFailure extends LegacyCandidateFailure {
  status: "missing" | "transient";
}
type ApiCacheEntry = ApiCacheEntryOk | ApiCacheEntryFailure;
type ApiCache = Record<string, ApiCacheEntry>;

interface AuditReport {
  schemaVersion: 1;
  generatedBy: string;
  scope: string;
  population: {
    destinations: number;
    published: number;
    publishedCanonicalBefore: number;
    publishedCanonicalAfter: number;
    publishedUnmappedBefore: number;
    publishedUnmappedAfter: number;
    legacyProvenanceExamined: number;
  };
  migration: {
    automaticallyCanonicalized: number;
    reviewRequired: number;
    transientNetworkFailures: number;
    invalidProvenance: number;
    noUsableIdentity: number;
  };
  groups: Record<string, string[]>;
  reviewLedger: Array<{
    id: string;
    reason: string;
    details?: string[];
    sourceUrls: string[];
  }>;
  method: {
    networkRequests: string;
    boundedConcurrency: number;
    runtimeSearchStates: string;
    failClosedValidator: string;
    noArticleExpected: string;
  };
}

interface LegacyCohortManifest {
  schemaVersion: 1;
  scope: string;
  publishedCanonicalBefore: number;
  publishedUnmappedBefore: number;
  sourceFingerprint: string;
  entries: Array<{ id: string; sourceUrls: string[] }>;
  unmappedIds: string[];
  unmappedFingerprint: string;
}

const root = process.cwd();
const indexPath = path.join(root, "src/shared/data/destinations-index.json");
const defaultReportPath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-legacy-report.json",
);
const defaultCachePath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-legacy-api-cache.json",
);
const cohortManifestPath = path.join(
  root,
  "scripts/audit/kai-256-wikipedia-legacy-cohort.json",
);
const API_CONCURRENCY = 1;
const API_DELAY_MS = 800;

function parseArgs(): {
  fetch: boolean;
  apply: boolean;
  reportPath: string;
  cachePath: string;
} {
  const args = process.argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const valueFor = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1]
      ? path.resolve(args[index + 1])
      : fallback;
  };
  const fetch = has("--fetch");
  if (fetch && has("--offline")) {
    throw new Error("Choose one of --fetch or --offline, not both.");
  }
  return {
    fetch,
    apply: has("--apply"),
    reportPath: valueFor("--report", defaultReportPath),
    cachePath: valueFor("--cache", defaultCachePath),
  };
}

function hasExplicitIdentity(destination: WikipediaIdentitySource): boolean {
  return Boolean(
    destination.wikipediaTitle ||
    destination.wikipediaUrl ||
    destination.wikipediaPageId !== undefined ||
    destination.wikidataId,
  );
}

function normalizedTitle(value: string): string {
  return value
    .replace(/_/g, " ")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function hasValidExplicitIdentity(destination: LegacyDestination): boolean {
  if (!hasExplicitIdentity(destination)) return false;
  const mapping = extractWikipediaMapping(destination);
  if (!mapping || !mapping.language || !mapping.title) return false;
  if (destination.wikipediaUrl) {
    const parsed = parseWikipediaUrl(destination.wikipediaUrl);
    if (
      !parsed ||
      parsed.language !== mapping.language ||
      normalizedTitle(parsed.title) !== normalizedTitle(mapping.title)
    ) {
      return false;
    }
  }
  if (
    destination.wikipediaPageId !== undefined &&
    (!Number.isInteger(destination.wikipediaPageId) ||
      destination.wikipediaPageId <= 0)
  ) {
    return false;
  }
  if (destination.wikidataId && !/^Q\d+$/i.test(destination.wikidataId)) {
    return false;
  }
  return Boolean(
    destination.wikipediaPageId !== undefined ||
    destination.wikidataId ||
    (destination.wikipediaUrl &&
      canonicalWikipediaIdentity(destination.wikipediaUrl)) ||
    destination.wikipediaTitle,
  );
}

function rawWikipediaReferences(
  destination: LegacyDestination,
): Array<{ url?: string; title?: string; type?: string }> {
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

function isLegacyProvenance(destination: LegacyDestination): boolean {
  return (
    !hasExplicitIdentity(destination) &&
    rawWikipediaReferences(destination).length > 0
  );
}

function sortIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
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

function sourceWikipediaUrls(destination: LegacyDestination): string[] {
  return [
    ...new Set(
      rawWikipediaReferences(destination)
        .map((reference) => reference.url)
        .filter((url): url is string => Boolean(url)),
    ),
  ].sort();
}

function cohortFingerprint(
  entries: Array<{ id: string; sourceUrls: string[] }>,
): string {
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function loadCohortManifest(destinations: LegacyDestination[]): {
  manifest: LegacyCohortManifest;
  legacy: LegacyDestination[];
} {
  const manifest = readJson<LegacyCohortManifest>(cohortManifestPath);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.scope !==
      "published destinations with legacy Wikipedia provenance only" ||
    manifest.entries.length !== 213 ||
    manifest.unmappedIds.length !== 500
  ) {
    throw new Error("Invalid KAI-256 cohort manifest metadata.");
  }

  const entries = manifest.entries.map((entry) => ({
    id: entry.id,
    sourceUrls: [...new Set(entry.sourceUrls)].sort(),
  }));
  if (
    JSON.stringify(entries) !== JSON.stringify(manifest.entries) ||
    cohortFingerprint(entries) !== manifest.sourceFingerprint ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  ) {
    throw new Error(
      "KAI-256 cohort manifest is not canonical or has a bad fingerprint.",
    );
  }

  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  for (const entry of entries) {
    const destination = byId.get(entry.id);
    if (!destination || destination.status !== "published") {
      throw new Error(
        `KAI-256 cohort record is missing or unpublished: ${entry.id}`,
      );
    }
    if (
      JSON.stringify(sourceWikipediaUrls(destination)) !==
      JSON.stringify(entry.sourceUrls)
    ) {
      throw new Error(`KAI-256 provenance drift detected: ${entry.id}`);
    }
  }

  const currentUnmappedIds = sortIds(
    destinations
      .filter(
        (destination) =>
          destination.status === "published" &&
          !hasExplicitIdentity(destination) &&
          !isLegacyProvenance(destination),
      )
      .map((destination) => destination.id),
  );
  if (
    JSON.stringify(currentUnmappedIds) !==
      JSON.stringify(manifest.unmappedIds) ||
    createHash("sha256")
      .update(JSON.stringify(currentUnmappedIds))
      .digest("hex") !== manifest.unmappedFingerprint
  ) {
    throw new Error("KAI-256 unmapped cohort drift detected.");
  }

  return {
    manifest,
    legacy: entries.map((entry) => byId.get(entry.id)!),
  };
}

function cacheEntryFor(
  cache: ApiCache,
  identity: string,
): LegacyCandidate | LegacyCandidateFailure | undefined {
  const entry = cache[identity];
  if (!entry) return undefined;
  return entry.status === "ok"
    ? entry.candidate
    : { status: entry.status, message: entry.message };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchApiEntry(sourceUrl: string): Promise<ApiCacheEntry> {
  const parsed = parseWikipediaUrl(sourceUrl);
  const requestedIdentity = canonicalWikipediaIdentity(sourceUrl);
  if (!parsed || !requestedIdentity) {
    return { status: "missing", message: "invalid-provenance-url" };
  }
  const endpoint = `https://${parsed.language}.wikipedia.org/w/api.php`;
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "info|pageprops|coordinates|extracts|description",
    inprop: "url",
    exintro: "1",
    explaintext: "1",
    titles: parsed.title,
  });

  let lastError = "unknown network failure";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?${query.toString()}`, {
        headers: {
          accept: "application/json",
          "user-agent": "Meguruto-KAI-256-bounded-audit/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter)
            ? Math.max(1000, retryAfter * 1000)
            : 2500 * attempt;
          await delay(waitMs);
        }
        continue;
      }
      const payload = (await response.json()) as {
        query?: {
          pages?: Array<Record<string, unknown>>;
          redirects?: Array<Record<string, unknown>>;
        };
      };
      const page = payload.query?.pages?.[0];
      if (!page) return { status: "missing", message: "missing-api-page" };
      if (page.missing === true) {
        return { status: "missing", message: "wikipedia-page-missing" };
      }

      const pageProps = (page.pageprops ?? {}) as Record<string, unknown>;
      const pageUrl =
        (typeof page.canonicalurl === "string" && page.canonicalurl) ||
        (typeof page.fullurl === "string" && page.fullurl) ||
        sourceUrl;
      const pageTitle =
        typeof page.title === "string" ? page.title : parsed.title;
      const pageLanguage =
        page.pagelanguage === "ja" || page.pagelanguage === "en"
          ? page.pagelanguage
          : parsed.language;
      const coordinates = Array.isArray(page.coordinates)
        ? (page.coordinates.find(
            (point): point is { lat: number; lon: number } =>
              Boolean(
                point &&
                typeof point === "object" &&
                typeof (point as { lat?: unknown }).lat === "number" &&
                typeof (point as { lon?: unknown }).lon === "number",
              ),
          ) ?? undefined)
        : undefined;
      const pageId = typeof page.pageid === "number" ? page.pageid : undefined;
      const wikidataId =
        typeof pageProps.wikibase_item === "string"
          ? pageProps.wikibase_item
          : undefined;
      const extract = typeof page.extract === "string" ? page.extract : "";
      const description =
        typeof page.description === "string"
          ? page.description
          : typeof pageProps["wikibase-shortdesc"] === "string"
            ? pageProps["wikibase-shortdesc"]
            : undefined;
      const redirectedFrom = payload.query?.redirects?.some(
        (redirect) => typeof redirect.from === "string",
      )
        ? sourceUrl
        : undefined;

      return {
        status: "ok",
        candidate: {
          language: pageLanguage,
          title: pageTitle,
          url: pageUrl,
          extract,
          requestedIdentity,
          ...(redirectedFrom ? { redirectedFrom } : {}),
          ...(description ? { description } : {}),
          ...(pageId !== undefined ? { pageId } : {}),
          ...(wikidataId ? { wikidataId } : {}),
          ...(pageProps.disambiguation !== undefined
            ? { type: "disambiguation" }
            : {}),
          ...(coordinates
            ? { coordinates: { lat: coordinates.lat, lng: coordinates.lon } }
            : {}),
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { status: "transient", message: lastError };
}

async function loadOrFetchCache(
  identities: Array<{ identity: string; url: string }>,
  cachePath: string,
  fetchEnabled: boolean,
): Promise<ApiCache> {
  const cache = readJson<ApiCache>(cachePath, {});
  const missing = identities.filter(({ identity }) => {
    const entry = cache[identity];
    return (
      !entry ||
      entry.status === "transient" ||
      (entry.status === "ok" &&
        entry.candidate.requestedIdentity !== identity) ||
      (entry.status === "missing" && entry.message === "invalid-provenance-url")
    );
  });
  if (missing.length && !fetchEnabled) {
    throw new Error(
      `Offline mode needs ${missing.length} cached Wikipedia identities; rerun with --fetch.`,
    );
  }
  if (fetchEnabled && missing.length) {
    for (const { identity, url } of missing) {
      await delay(API_DELAY_MS);
      cache[identity] = await fetchApiEntry(url);
      const sortedCache = Object.fromEntries(
        Object.entries(cache).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
      await writeJson(cachePath, sortedCache);
    }
  }
  return cache;
}

function classificationDetails(
  classification: LegacyClassification,
): string[] | undefined {
  return classification.state === "canonicalizable"
    ? undefined
    : classification.details;
}

function buildReport(
  destinations: LegacyDestination[],
  legacy: LegacyDestination[],
  classifications: Map<string, LegacyClassification>,
  manifest: LegacyCohortManifest,
): AuditReport {
  const published = destinations.filter(
    (destination) => destination.status === "published",
  );
  const canonicalBefore = published.filter(hasValidExplicitIdentity);
  const unmappedBefore = published.filter(
    (destination) =>
      !hasExplicitIdentity(destination) && !isLegacyProvenance(destination),
  );
  const canonicalizable = legacy.filter(
    (destination) =>
      classifications.get(destination.id)?.state === "canonicalizable",
  );
  const review = legacy.filter(
    (destination) => classifications.get(destination.id)?.state === "review",
  );
  const transientFailures = legacy.filter(
    (destination) => classifications.get(destination.id)?.state === "transient",
  );
  const reviewLedger = review
    .map((destination) => {
      const classification = classifications.get(destination.id)!;
      return {
        id: destination.id,
        reason: classification.reason,
        ...(classificationDetails(classification)
          ? { details: classificationDetails(classification) }
          : {}),
        sourceUrls: classification.sourceUrls,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const transientLedger = transientFailures
    .map((destination) => {
      const classification = classifications.get(destination.id)!;
      return {
        id: destination.id,
        reason: classification.reason,
        ...(classificationDetails(classification)
          ? { details: classificationDetails(classification) }
          : {}),
        sourceUrls: classification.sourceUrls,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const groups: Record<string, string[]> = {
    canonical: sortIds([
      ...canonicalBefore.map((destination) => destination.id),
      ...canonicalizable.map((destination) => destination.id),
    ]),
    "legacy-canonicalizable": sortIds(
      canonicalizable.map((destination) => destination.id),
    ),
    "legacy-needs-review": sortIds(review.map((destination) => destination.id)),
    "legacy-transient-network-failure": sortIds(
      transientFailures.map((destination) => destination.id),
    ),
    "unmapped-exact-high-confidence": [],
    ambiguous: [],
    "no-article-expected": [],
    unresolved: sortIds(unmappedBefore.map((destination) => destination.id)),
  };

  const invalidProvenance = review.filter(
    (destination) =>
      classifications.get(destination.id)?.reason === "invalid-provenance",
  ).length;
  const noUsableIdentity = review.filter((destination) => {
    const reason = classifications.get(destination.id)?.reason;
    return (
      reason === "no-usable-identity" || reason === "missing-api-candidate"
    );
  }).length;
  const publishedCanonicalBefore = manifest.publishedCanonicalBefore;
  const publishedCanonicalAfter = Math.max(
    canonicalBefore.length,
    manifest.publishedCanonicalBefore + canonicalizable.length,
  );
  const publishedUnmappedBefore = manifest.publishedUnmappedBefore;

  return {
    schemaVersion: 1,
    generatedBy: "scripts/migrate-wikipedia-legacy-provenance.ts",
    scope: "published destinations with legacy Wikipedia provenance only",
    population: {
      destinations: destinations.length,
      published: published.length,
      publishedCanonicalBefore,
      publishedCanonicalAfter,
      publishedUnmappedBefore,
      publishedUnmappedAfter: unmappedBefore.length,
      legacyProvenanceExamined: manifest.entries.length,
    },
    migration: {
      automaticallyCanonicalized: canonicalizable.length,
      reviewRequired: review.length,
      transientNetworkFailures: transientFailures.length,
      invalidProvenance,
      noUsableIdentity,
    },
    groups,
    reviewLedger: [...reviewLedger, ...transientLedger],
    method: {
      networkRequests:
        "MediaWiki API page identity only; no search endpoint and no first-result fallback",
      boundedConcurrency: API_CONCURRENCY,
      runtimeSearchStates:
        "unmapped exact/high-confidence, ambiguous, and no-article-expected were not queried in this legacy-only PR",
      failClosedValidator:
        "WikipediaValidation.validateWikipediaCandidate with title, language, geography, entity, ambiguity, and identity checks",
      noArticleExpected:
        "not assigned automatically; parent-landmark and unsuitable-entity cases remain review/unresolved",
    },
  };
}

function applyCanonicalIdentities(
  destinations: LegacyDestination[],
  legacy: LegacyDestination[],
  classifications: Map<string, LegacyClassification>,
): { destinations: LegacyDestination[]; changed: number } {
  const byId = new Map(
    legacy.map((destination) => [destination.id, destination]),
  );
  let changed = 0;
  const next = destinations.map((destination) => {
    const classification = classifications.get(destination.id);
    if (
      !classification ||
      classification.state !== "canonicalizable" ||
      !byId.has(destination.id)
    ) {
      return destination;
    }
    const identity = classification.identity;
    if (
      destination.wikipediaTitle === identity.wikipediaTitle &&
      destination.wikipediaLanguage === identity.wikipediaLanguage &&
      destination.wikipediaUrl === identity.wikipediaUrl &&
      destination.wikipediaPageId === identity.wikipediaPageId &&
      (identity.wikidataId === undefined ||
        destination.wikidataId === identity.wikidataId)
    ) {
      return destination;
    }
    changed += 1;
    return { ...destination, ...identity };
  });
  return { destinations: next, changed };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const destinations = readJson<LegacyDestination[]>(indexPath);
  const { manifest, legacy } = loadCohortManifest(destinations);
  const identityToIds = new Map<string, Set<string>>();
  const identityToUrl = new Map<string, string>();
  for (const destination of legacy) {
    for (const reference of rawWikipediaReferences(destination)) {
      const identity = canonicalWikipediaIdentity(reference.url);
      if (!identity || !reference.url) continue;
      const ids = identityToIds.get(identity) ?? new Set<string>();
      ids.add(destination.id);
      identityToIds.set(identity, ids);
      identityToUrl.set(identity, reference.url);
    }
  }
  const sharedSourceIdentities = new Set(
    [...identityToIds.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([identity]) => identity),
  );
  const identities = [...identityToUrl.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([identity, url]) => ({ identity, url }));
  const cache = await loadOrFetchCache(
    identities,
    options.cachePath,
    options.fetch,
  );
  const candidates = new Map<
    string,
    LegacyCandidate | LegacyCandidateFailure | undefined
  >();
  for (const { identity } of identities) {
    candidates.set(identity, cacheEntryFor(cache, identity));
  }
  const classifications = new Map<string, LegacyClassification>();
  for (const destination of legacy) {
    classifications.set(
      destination.id,
      classifyLegacyDestination(
        destination,
        candidates,
        sharedSourceIdentities,
      ),
    );
  }
  const report = buildReport(destinations, legacy, classifications, manifest);
  await writeJson(options.reportPath, report);

  const transientCount = report.migration.transientNetworkFailures;
  if (options.apply && transientCount > 0) {
    throw new Error(
      `Refusing --apply while ${transientCount} transient network failure(s) remain; rerun --fetch after the source is reachable.`,
    );
  }
  if (options.apply) {
    const applied = applyCanonicalIdentities(
      destinations,
      legacy,
      classifications,
    );
    const original = fs.readFileSync(indexPath, "utf8");
    const next = `${JSON.stringify(applied.destinations, null, 2)}\n`;
    if (original !== next) fs.writeFileSync(indexPath, next);
    console.log(`Applied ${applied.changed} canonical Wikipedia identities.`);
  }
  console.log(`Published destinations: ${report.population.published}`);
  console.log(
    `Legacy-provenance records examined: ${report.population.legacyProvenanceExamined}`,
  );
  console.log(
    `Automatically canonicalized: ${report.migration.automaticallyCanonicalized}`,
  );
  console.log(`Review required: ${report.migration.reviewRequired}`);
  console.log(
    `Transient/network failures: ${report.migration.transientNetworkFailures}`,
  );
  console.log(
    `Canonical identity: ${report.population.publishedCanonicalBefore} -> ${report.population.publishedCanonicalAfter}`,
  );
  console.log(
    `Unmapped/unclassified: ${report.population.publishedUnmappedBefore} -> ${report.population.publishedUnmappedAfter}`,
  );
  console.log(`Report: ${options.reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
