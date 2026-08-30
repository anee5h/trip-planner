#!/usr/bin/env node
/**
 * KAI-167 catalogue-wide Wikipedia identity audit.
 *
 * Default mode is deliberately offline: it inspects the committed catalogue
 * and its provenance without making one network request per destination. A
 * live resolver sweep would be a request storm and is not a CI gate. The
 * report therefore distinguishes deterministic declarations from unresolved
 * runtime search candidates instead of pretending that an HTTP response is
 * evidence of identity.
 *
 * Usage: npx tsx scripts/audit-wikipedia-mappings.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
  parseWikipediaUrl,
  wikipediaProvenanceReferences,
  type WikipediaIdentitySource,
} from "../src/shared/services/wikipedia/WikipediaIdentity";

interface DestinationRecord extends WikipediaIdentitySource {
  id: string;
  name: string;
  status?: string;
  description?: string;
  wikipediaTitle?: string;
  wikipediaLanguage?: "en" | "ja";
  wikipediaUrl?: string;
  wikipediaPageId?: number;
  wikidataId?: string;
  coordinates?: { lat: number; lng: number };
  content?: {
    en?: { description?: string };
    ja?: { description?: string };
  };
}

const root = process.cwd();
const indexPath = path.join(root, "src/shared/data/destinations-index.json");
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as DestinationRecord[];

function hasExplicitWikipediaIdentity(destination: DestinationRecord): boolean {
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

function explicitMappingIsValid(
  destination: DestinationRecord,
  mapping: ReturnType<typeof extractWikipediaMapping>,
): boolean {
  if (!mapping || !hasExplicitWikipediaIdentity(destination)) return false;
  if (mapping.language !== "en" && mapping.language !== "ja") return false;
  if (
    destination.wikipediaPageId !== undefined &&
    (!Number.isInteger(destination.wikipediaPageId) ||
      destination.wikipediaPageId <= 0)
  ) {
    return false;
  }
  if (
    destination.wikidataId &&
    !/^Q\d+$/i.test(destination.wikidataId.trim())
  ) {
    return false;
  }
  if (destination.wikipediaUrl) {
    const parsedUrl = parseWikipediaUrl(destination.wikipediaUrl);
    if (!parsedUrl || parsedUrl.language !== mapping.language) return false;
    if (
      destination.wikipediaTitle &&
      normalizedTitle(destination.wikipediaTitle) !==
        normalizedTitle(parsedUrl.title)
    ) {
      return false;
    }
  }
  return true;
}

function deterministicIdentity(
  destination: DestinationRecord,
): string | undefined {
  const mapping = extractWikipediaMapping(destination);
  if (!mapping) return undefined;
  if (
    hasExplicitWikipediaIdentity(destination) &&
    !explicitMappingIsValid(destination, mapping)
  ) {
    return undefined;
  }
  if (mapping.pageId !== undefined) return `pageid:${mapping.pageId}`;
  if (mapping.wikidataId) return `qid:${mapping.wikidataId}`;
  if (mapping.url) {
    const identity = canonicalWikipediaIdentity(mapping.url);
    if (identity) return `url:${identity}`;
  }
  return mapping.title
    ? `title:${mapping.language}:${mapping.title}`
    : undefined;
}

const explicit = destinations.filter((destination) =>
  deterministicIdentity(destination),
);
const published = destinations.filter(
  (destination) => destination.status === "published",
);
const publishedCanonical = published.filter(
  (destination) =>
    Boolean(deterministicIdentity(destination)) &&
    hasExplicitWikipediaIdentity(destination),
);
const publishedLegacyProvenance = published.filter(
  (destination) =>
    !hasExplicitWikipediaIdentity(destination) &&
    wikipediaProvenanceReferences(destination).length > 0,
);
const publishedUnmapped = published.filter(
  (destination) => !deterministicIdentity(destination),
);
const provenanceRecords = destinations.filter(
  (destination) => wikipediaProvenanceReferences(destination).length > 0,
);
const provenanceOnly = provenanceRecords.filter(
  (destination) => !deterministicIdentity(destination),
);
const explicitWithoutNumericIdentity = explicit.filter((destination) => {
  const mapping = extractWikipediaMapping(destination);
  return mapping?.pageId === undefined && !mapping?.wikidataId;
}).length;

const urlToIds = new Map<string, Set<string>>();
for (const destination of provenanceRecords) {
  for (const reference of wikipediaProvenanceReferences(destination)) {
    const url = canonicalWikipediaIdentity(reference.url);
    if (!url) continue;
    const ids = urlToIds.get(url) ?? new Set<string>();
    ids.add(destination.id);
    urlToIds.set(url, ids);
  }
}
const duplicateUrls = [...urlToIds.entries()]
  .filter(([, ids]) => ids.size > 1)
  .sort((a, b) => b[1].size - a[1].size);

const explicitIdentityToIds = new Map<string, Set<string>>();
for (const destination of explicit) {
  const identity = deterministicIdentity(destination)!;
  const ids = explicitIdentityToIds.get(identity) ?? new Set<string>();
  ids.add(destination.id);
  explicitIdentityToIds.set(identity, ids);
}
const duplicateExplicitIdentities = [...explicitIdentityToIds.entries()]
  .filter(([, ids]) => ids.size > 1)
  .sort((a, b) => b[1].size - a[1].size);

const subtitleMissingFieldSource = destinations.filter((destination) => {
  const hasDescription = Boolean(
    destination.description ||
    destination.content?.en?.description ||
    destination.content?.ja?.description,
  );
  return hasDescription && !destination.editorial?.fieldSources?.description;
});

const descriptions = new Map<string, string[]>();
for (const destination of destinations) {
  for (const value of [
    destination.description,
    destination.content?.en?.description,
    destination.content?.ja?.description,
  ]) {
    if (!value) continue;
    const ids = descriptions.get(value) ?? [];
    ids.push(destination.id);
    descriptions.set(value, ids);
  }
}
const duplicateSubtitles = [...descriptions.entries()]
  .filter(([, ids]) => new Set(ids).size > 1)
  .sort((a, b) => b[1].length - a[1].length);

const yagiri = destinations.find(
  (destination) => destination.id === "yagiri-no-watashi-matsudo",
);
const yagiriDescriptionSource =
  yagiri?.editorial?.fieldSources?.description ?? [];

console.log("KAI-167 Wikipedia catalogue audit (offline committed-data pass)");
console.log(`Destinations checked: ${destinations.length}`);
console.log(`Published destinations: ${published.length}`);
console.log(
  `Existing Wikipedia provenance records: ${provenanceRecords.length}`,
);
console.log(`Deterministic identity declarations: ${explicit.length}`);
console.log("Resolver identity inventory (offline committed-data pass):");
console.log(
  `  deterministic declarations available for live validation: ${explicit.length}`,
);
console.log("  rejected declarations: not evaluated in offline pass");
console.log(`  suspicious provenance-only mappings: ${provenanceOnly.length}`);
console.log(
  `  unresolved/no deterministic identity: ${destinations.length - explicit.length}`,
);
console.log(
  `  mappings with canonical title/URL but no page ID/QID: ${explicitWithoutNumericIdentity}`,
);
console.log(
  `  duplicate explicit page IDs/URLs/QIDs: ${duplicateExplicitIdentities.length}; provenance URL duplicate groups: ${duplicateUrls.length}`,
);
console.log(
  "  coordinate mismatches: 0 (article coordinates are not persisted; live check intentionally skipped)",
);
console.log(
  "  ambiguous title matches: 0 (search candidates are runtime-only and were not queried)",
);
console.log("Runtime article validation counts: not evaluated in offline pass");
console.log(
  "Runtime accepted/rejected/suspicious search results: not evaluated",
);
console.log(
  `Subtitle/provenance records without fieldSources.description: ${subtitleMissingFieldSource.length}`,
);
console.log(`Duplicate subtitle text groups: ${duplicateSubtitles.length}`);
console.log(
  `Yagiri subtitle field provenance: ${yagiriDescriptionSource.length ? "present" : "missing field-level reference"}`,
);

console.log(
  "KAI-255 Wikipedia coverage states (deterministic committed-data pass):",
);
console.log(
  `  Verified/canonical Wikipedia mapping: ${publishedCanonical.length}`,
);
const runtimeStateNotEvaluated = "N/E (runtime search not inferred offline)";
console.log(`  High-confidence automatic mapping: ${runtimeStateNotEvaluated}`);
console.log(`  Trustworthy no-match: ${runtimeStateNotEvaluated}`);
console.log(
  `  Resolver rejected despite likely valid candidate: ${runtimeStateNotEvaluated}`,
);
console.log(`  Transient/network failure: ${runtimeStateNotEvaluated}`);
console.log(
  `  Legacy provenance declarations requiring identity review: ${publishedLegacyProvenance.length}`,
);
console.log(
  `  Unmapped/unclassified published destinations: ${publishedUnmapped.length}`,
);
console.log(
  "State IDs (the five runtime states remain unevaluated until a bounded live resolver audit is run):",
);
const stateIds: Array<[string, string[] | undefined]> = [
  [
    "verified-canonical",
    publishedCanonical.map((destination) => destination.id),
  ],
  ["high-confidence-automatic", undefined],
  ["trustworthy-no-match", undefined],
  ["resolver-rejected-likely-valid", undefined],
  ["transient-network-failure", undefined],
  [
    "legacy-provenance-review",
    publishedLegacyProvenance.map((destination) => destination.id),
  ],
  [
    "unmapped-unclassified",
    publishedUnmapped.map((destination) => destination.id),
  ],
];
for (const [state, ids] of stateIds) {
  console.log(
    ids === undefined
      ? `  ${state}: N/E (runtime search not inferred offline)`
      : `  ${state} (${ids.length}): ${ids.sort().join(", ") || "None"}`,
  );
}

if (duplicateUrls.length) {
  console.log(
    "Most important duplicate/suspicious Wikipedia provenance cases:",
  );
  for (const [url, ids] of duplicateUrls.slice(0, 10)) {
    console.log(
      `  ${ids.size} destinations share ${url}: ${[...ids].join(", ")}`,
    );
  }
}
if (duplicateSubtitles.length) {
  console.log(
    "Repeated subtitle samples requiring editorial review (not auto-modified):",
  );
  for (const [text, ids] of duplicateSubtitles.slice(0, 5)) {
    console.log(
      `  ${ids.length} records: ${ids.slice(0, 8).join(", ")} — ${text.slice(0, 140)}`,
    );
  }
}
console.log(
  "Classification: curated canonical URL/title declarations are deterministic candidates for live identity validation; duplicate identities are review flags, not auto-edits; records without an identity remain unresolved until a safe mapping exists.",
);
