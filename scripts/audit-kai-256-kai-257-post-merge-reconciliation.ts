/**
 * KAI-256/KAI-257 post-merge reconciliation.
 *
 * This is a deterministic, read-only catalogue audit. It reads the merged
 * KAI-256 Phase 4 ledgers, compares the current catalogue with the KAI-291
 * merge state, runs the KAI-257 relationship audit, and writes only the
 * requested reconciliation report. It never edits destination or generated
 * catalogue data.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json scripts/audit-kai-256-kai-257-post-merge-reconciliation.ts
 *   npx tsx --tsconfig tsconfig.app.json scripts/audit-kai-256-kai-257-post-merge-reconciliation.ts --output <path>
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { format, resolveConfig } from "prettier";
import type { Destination } from "../src/shared/types/destination.js";
import {
  extractWikipediaMapping,
  parseWikipediaUrl,
} from "../src/shared/services/wikipedia/WikipediaIdentity.js";
import type { Phase3Destination } from "./lib/wikipediaPhase3Enrichment.js";
import {
  hashStable,
  phase3InputFingerprint,
} from "./lib/wikipediaPhase3Enrichment.js";
import {
  DestinationRelationshipService,
  loadRelationshipIndex,
} from "../src/shared/services/destination/DestinationRelationshipService.js";
import {
  identitySnapshot,
  phase4AdjudicationFingerprint,
} from "./adjudicate-wikipedia-phase4.js";
import {
  runKai257Audit,
  type Kai257AuditReport,
} from "./audit-kai-257-top-sights-integrity.js";
import { generateCatalogueOutputs } from "./catalog/generate-outputs.js";
import { loadCommittedOutputs, toOutputMap } from "./check-catalog-sync.js";

const ROOT = process.cwd();
const BASE_SHA = "710813288cbce1c591696adbb6dd2bb6c4885811";
const KAI291_SHA = "fb164a012a7cef3952c73b002fc3e7b8795acfca";
const INDEX_RELATIVE = "src/shared/data/destinations-index.json";
const PHASE1_REPORT_RELATIVE =
  "scripts/audit/kai-256-wikipedia-legacy-report.json";
const PHASE4_MANIFEST_RELATIVE =
  "scripts/audit/kai-256-wikipedia-phase4-tail.json";
const PHASE4_REPORT_RELATIVE =
  "scripts/audit/kai-256-wikipedia-phase4-report.json";
const PHASE3_COHORT_RELATIVE =
  "scripts/audit/kai-256-wikipedia-phase3-cohort.json";
const PHASE3_REPORT_RELATIVE =
  "scripts/audit/kai-256-wikipedia-phase3-report.json";
const PHASE3_CACHE_RELATIVE =
  "scripts/audit/kai-256-wikipedia-phase3-api-cache.json";
const PHASE4_CACHE_RELATIVE =
  "scripts/audit/kai-256-wikipedia-phase4-api-cache.json";
const DEFAULT_OUTPUT_RELATIVE =
  "scripts/audit/kai-256-kai-257-post-merge-reconciliation.json";

const IDENTITY_FIELDS = [
  "wikipediaTitle",
  "wikipediaLanguage",
  "wikipediaUrl",
  "wikipediaPageId",
  "wikidataId",
] as const;

// KAI-256 Phase 1's Wikipedia resolver reads this catalogue context. Other
// catalogue fields, including relationship rails, are not identity inputs to
// the legacy migration and may be repaired independently when justified.
const PHASE1_WIKIPEDIA_ADJUDICATION_FIELDS = [
  "name",
  "nameJa",
  "aliases",
  "kind",
  "role",
  "categories",
  "tags",
  "coordinates",
] as const;
const PHASE1_COHORT_BOUNDARY_FIELDS = ["status"] as const;
const PHASE1_PROTECTED_FIELDS = [
  ...IDENTITY_FIELDS,
  ...PHASE1_WIKIPEDIA_ADJUDICATION_FIELDS,
  ...PHASE1_COHORT_BOUNDARY_FIELDS,
] as const;

const ADJUDICATION_FIELDS = [
  "id",
  "name",
  "nameJa",
  "aliases",
  "description",
  "kind",
  "role",
  "prefecture",
  "region",
  "coordinates",
  "categories",
  "tags",
  "municipalityId",
  "placeType",
  "relationships",
  "status",
] as const;

const RELATIONSHIP_FIELDS = [
  "kind",
  "role",
  "placeType",
  "municipalityId",
  "relationships",
] as const;

const REQUIRED_FINAL_GATE_FIELDS = [
  "correctDestinationEntity",
  "enJaRulePreserved",
  "entityTypeCompatible",
  "geographyCompatible",
  "noUnresolvedCompetingQid",
  "notDisambiguationPage",
  "notParentChildSubstitution",
  "parentCheckEvaluated",
  "sourceEvidenceStillValid",
  "validPageIdTitleUrl",
  "validQid",
  "wikipediaWikidataAgreement",
] as const;

interface IdentityRecord {
  wikipediaTitle?: string;
  wikipediaLanguage?: "en" | "ja";
  wikipediaUrl?: string;
  wikipediaPageId?: number;
  wikidataId?: string;
}

interface CandidateEvidence {
  entityTypeResult?: string;
  geographyResult?: string;
  wikipediaAgreement?: boolean;
}

interface Phase4Record {
  id: string;
  finalDecision: string;
  decisionReason: string;
  approvalStatus: string;
  selectedIdentity: IdentityRecord | null;
  selectedCandidateEvidence: CandidateEvidence | null;
  parentChildResult: string;
  sourceModified: boolean;
  followUpRequired: boolean;
  finalGate: Record<string, boolean> | null;
}

interface Phase4Report {
  counts: Record<string, number>;
  records: Phase4Record[];
  catalogueRelationshipIssues: Array<{
    id: string;
    issueType: string;
    evidence: string;
    recommendedAction: string;
    finalDecision: string;
  }>;
  noStandaloneArticleLedger: Array<{ id: string }>;
  remainingHumanReview: Array<{ id: string }>;
  safety: Record<string, unknown>;
}

interface Phase4Manifest {
  ids: string[];
  wholeTailFingerprint: string;
  phase3CohortFingerprint: string;
  phase3CohortWholeFingerprint: string;
  phase3ReportFingerprint: string;
  phase3CacheFingerprint: string;
  phase4AdjudicationFingerprints: Record<string, string>;
  phase1ReviewIdentityFingerprints: Record<string, string>;
}

interface Phase3Cohort {
  ids: string[];
  inputFingerprints: Record<string, string>;
  wholeCohortFingerprint: string;
}

interface Phase3Cache {
  entries: Record<string, Record<string, unknown>>;
}

interface Phase4CacheEntry {
  adjudicationFingerprint: string;
  phase3EntryFingerprint: string;
  targetedRetrievals: unknown[];
}

interface Phase4Cache {
  manifestFingerprint: string;
  phase3CacheFingerprint: string;
  targetedRetrievals: unknown[];
  entries: Record<string, Phase4CacheEntry>;
}

interface Phase1Report {
  reviewLedger: Array<{ id: string; reason: string; details?: string[] }>;
}

interface DuplicateGroup {
  identity: string;
  destinationIds: string[];
}

interface SourceChange {
  id: string;
  fields: string[];
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
  ) as T;
}

function readJsonAtGitRef<T>(ref: string, relativePath: string): T {
  return JSON.parse(
    execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  ) as T;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(relativePath: string): string {
  return sha256(fs.readFileSync(path.join(ROOT, relativePath)));
}

function buildPhase4EvidenceBinding(
  destinations: Destination[],
  manifest: Phase4Manifest,
): Record<string, unknown> {
  const phase3Cohort = readJson<Phase3Cohort>(PHASE3_COHORT_RELATIVE);
  const phase3Cache = readJson<Phase3Cache>(PHASE3_CACHE_RELATIVE);
  const phase4Cache = readJson<Phase4Cache>(PHASE4_CACHE_RELATIVE);
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const phase3CohortInputFingerprintDriftIds = phase3Cohort.ids.filter((id) => {
    const destination = byId.get(id);
    return (
      !destination ||
      phase3Cohort.inputFingerprints[id] !==
        phase3InputFingerprint(destination as unknown as Phase3Destination)
    );
  });
  const phase3CacheInputFingerprintDriftIds = Object.keys(phase3Cache.entries)
    .filter((id) => {
      const destination = byId.get(id);
      const inputFingerprint = phase3Cache.entries[id]?.inputFingerprint;
      return (
        Boolean(destination) &&
        typeof inputFingerprint === "string" &&
        inputFingerprint !==
          phase3InputFingerprint(destination as unknown as Phase3Destination)
      );
    })
    .sort((left, right) => left.localeCompare(right));
  const previousPhase3Cohort = readJsonAtGitRef<Phase3Cohort>(
    KAI291_SHA,
    PHASE3_COHORT_RELATIVE,
  );
  const phase3CohortChangedSinceKai291 = phase3Cohort.ids
    .filter(
      (id) =>
        previousPhase3Cohort.inputFingerprints[id] !==
        phase3Cohort.inputFingerprints[id],
    )
    .sort((left, right) => left.localeCompare(right));
  const currentPhase3CohortFileFingerprint = sha256File(PHASE3_COHORT_RELATIVE);
  const currentPhase3ReportFileFingerprint = sha256File(PHASE3_REPORT_RELATIVE);
  const currentPhase3CacheFileFingerprint = sha256File(PHASE3_CACHE_RELATIVE);
  const phase3ArtifactChecks = {
    cohortFile: {
      expectedFromPhase4Manifest: manifest.phase3CohortFingerprint,
      current: currentPhase3CohortFileFingerprint,
      matches:
        currentPhase3CohortFileFingerprint === manifest.phase3CohortFingerprint,
    },
    cohortWholeFingerprint: {
      expectedFromPhase4Manifest: manifest.phase3CohortWholeFingerprint,
      current: phase3Cohort.wholeCohortFingerprint,
      matches:
        phase3Cohort.wholeCohortFingerprint ===
        manifest.phase3CohortWholeFingerprint,
    },
    reportFile: {
      expectedFromPhase4Manifest: manifest.phase3ReportFingerprint,
      current: currentPhase3ReportFileFingerprint,
      matches:
        currentPhase3ReportFileFingerprint === manifest.phase3ReportFingerprint,
    },
    cacheFile: {
      expectedFromPhase4Manifest: manifest.phase3CacheFingerprint,
      current: currentPhase3CacheFileFingerprint,
      matches:
        currentPhase3CacheFileFingerprint === manifest.phase3CacheFingerprint,
    },
  };
  const phase4ApiCacheFailures: string[] = [];
  const expectedPhase4CacheIds = [...manifest.ids].sort((left, right) =>
    left.localeCompare(right),
  );
  const actualPhase4CacheIds = Object.keys(phase4Cache.entries).sort(
    (left, right) => left.localeCompare(right),
  );
  if (phase4Cache.manifestFingerprint !== manifest.wholeTailFingerprint) {
    phase4ApiCacheFailures.push("phase4-cache-manifest-binding");
  }
  if (phase4Cache.phase3CacheFingerprint !== manifest.phase3CacheFingerprint) {
    phase4ApiCacheFailures.push("phase4-cache-phase3-cache-binding");
  }
  if (!sameValue(actualPhase4CacheIds, expectedPhase4CacheIds)) {
    phase4ApiCacheFailures.push("phase4-cache-id-set");
  }
  if (
    !Array.isArray(phase4Cache.targetedRetrievals) ||
    phase4Cache.targetedRetrievals.length !== 0
  ) {
    phase4ApiCacheFailures.push("phase4-cache-targeted-retrievals");
  }
  for (const id of manifest.ids) {
    const cacheEntry = phase4Cache.entries[id];
    const phase3Entry = phase3Cache.entries[id];
    if (!cacheEntry || !phase3Entry) {
      phase4ApiCacheFailures.push(`phase4-cache-missing-entry:${id}`);
      continue;
    }
    if (
      cacheEntry.adjudicationFingerprint !==
      manifest.phase4AdjudicationFingerprints[id]
    ) {
      phase4ApiCacheFailures.push(
        `phase4-cache-adjudication-fingerprint:${id}`,
      );
    }
    if (cacheEntry.phase3EntryFingerprint !== hashStable(phase3Entry)) {
      phase4ApiCacheFailures.push(`phase4-cache-phase3-evidence:${id}`);
    }
    if (
      !Array.isArray(cacheEntry.targetedRetrievals) ||
      cacheEntry.targetedRetrievals.length !== 0
    ) {
      phase4ApiCacheFailures.push(`phase4-cache-targeted-retrieval:${id}`);
    }
  }
  const phase4AdjudicationFingerprintDriftIds = manifest.ids
    .filter((id) => {
      const destination = byId.get(id);
      return (
        Boolean(destination) &&
        phase4AdjudicationFingerprint(destination!) !==
          manifest.phase4AdjudicationFingerprints[id]
      );
    })
    .sort((left, right) => left.localeCompare(right));
  const phase4InputValidationFailures = [
    ...(phase4AdjudicationFingerprintDriftIds.length > 0
      ? [
          `phase4-adjudication-fingerprint-drift:${phase4AdjudicationFingerprintDriftIds.join(",")}`,
        ]
      : []),
    ...(phase3ArtifactChecks.cohortFile.matches
      ? []
      : ["phase3-cohort-artifact-drift"]),
    ...(phase3ArtifactChecks.cohortWholeFingerprint.matches
      ? []
      : ["phase3-whole-cohort-fingerprint-drift"]),
    ...(phase3ArtifactChecks.reportFile.matches
      ? []
      : ["phase3-report-artifact-drift"]),
    ...(phase3ArtifactChecks.cacheFile.matches
      ? []
      : ["phase3-cache-artifact-drift"]),
    ...(phase3CacheInputFingerprintDriftIds.length > 0
      ? [
          `phase3-cache-input-fingerprint-drift:${phase3CacheInputFingerprintDriftIds.join(",")}`,
        ]
      : []),
    ...phase4ApiCacheFailures,
  ];
  return {
    phase3CohortInputFingerprintDriftIds,
    phase3CacheInputFingerprintDriftIds,
    phase3CohortChangedSinceKai291,
    phase3ArtifactChecks,
    phase4ApiCache: {
      manifestBindingValid:
        phase4Cache.manifestFingerprint === manifest.wholeTailFingerprint,
      phase3CacheBindingValid:
        phase4Cache.phase3CacheFingerprint === manifest.phase3CacheFingerprint,
      expectedEntryCount: expectedPhase4CacheIds.length,
      actualEntryCount: actualPhase4CacheIds.length,
      targetedRetrievalCount: Array.isArray(phase4Cache.targetedRetrievals)
        ? phase4Cache.targetedRetrievals.length
        : null,
      failures: phase4ApiCacheFailures,
    },
    phase4AdjudicationFingerprintDriftIds,
    phase4InputValidation: {
      passes: phase4InputValidationFailures.length === 0,
      failures: phase4InputValidationFailures,
    },
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function identityFieldsOf(destination: Destination): Record<string, unknown> {
  return Object.fromEntries(
    IDENTITY_FIELDS.map((field) => [field, destination[field] ?? null]),
  );
}

function phase1ProtectedFieldsOf(
  destination: Destination,
): Record<string, unknown> {
  const record = destination as unknown as Record<string, unknown>;
  return Object.fromEntries(
    PHASE1_PROTECTED_FIELDS.map((field) => [field, record[field] ?? null]),
  );
}

function wikipediaProvenanceUrls(destination: Destination): string[] {
  const sources = [
    ...(destination.editorial?.sources ?? []),
    ...Object.values(destination.editorial?.fieldSources ?? {}).flat(),
  ];
  return sortedUnique(
    sources
      .filter((source) => source?.type === "wikipedia")
      .map((source) => source.url)
      .filter((url): url is string => Boolean(url)),
  );
}

function nestedRelationshipFieldChanges(
  current: Destination,
  previous: Destination,
): string[] {
  const currentRelationships = current.relationships ?? {};
  const previousRelationships = previous.relationships ?? {};
  return Object.keys({ ...previousRelationships, ...currentRelationships })
    .filter(
      (field) =>
        !sameValue(
          previousRelationships[field as keyof typeof previousRelationships],
          currentRelationships[field as keyof typeof currentRelationships],
        ),
    )
    .map((field) => `relationships.${field}`)
    .sort((left, right) => left.localeCompare(right));
}

function hasPhase1ProtectedFieldChange(
  current: Destination | undefined,
  previous: Destination | undefined,
): boolean {
  return Boolean(
    current &&
    previous &&
    !sameValue(
      phase1ProtectedFieldsOf(current),
      phase1ProtectedFieldsOf(previous),
    ),
  );
}

function hasPhase1ProvenanceChange(
  current: Destination | undefined,
  previous: Destination | undefined,
): boolean {
  return Boolean(
    current &&
    previous &&
    !sameValue(
      wikipediaProvenanceUrls(current),
      wikipediaProvenanceUrls(previous),
    ),
  );
}

function hasOnlyUnrelatedPhase1CatalogueChanges(
  current: Destination | undefined,
  previous: Destination | undefined,
): boolean {
  if (!current || !previous) return false;
  const changedFields = recordChangedFields(current, previous);
  return (
    changedFields.length > 0 &&
    !hasPhase1ProtectedFieldChange(current, previous) &&
    !hasPhase1ProvenanceChange(current, previous)
  );
}

function hasExplicitIdentity(destination: Destination): boolean {
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

function validExplicitIdentity(destination: Destination): boolean {
  if (!hasExplicitIdentity(destination)) return false;
  const mapping = extractWikipediaMapping(destination);
  if (!mapping || !["en", "ja"].includes(mapping.language)) return false;
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
    const parsed = parseWikipediaUrl(destination.wikipediaUrl);
    if (!parsed || parsed.language !== mapping.language) return false;
    if (
      destination.wikipediaTitle &&
      normalizedTitle(destination.wikipediaTitle) !==
        normalizedTitle(parsed.title)
    ) {
      return false;
    }
  }
  return true;
}

function directIdentityKey(
  destination: Destination,
  field: "wikipediaPageId" | "wikidataId",
): string | undefined {
  const value = destination[field];
  if (value === undefined || value === null) return undefined;
  return field === "wikidataId"
    ? String(value).trim().toUpperCase()
    : String(value);
}

function duplicateGroups(
  destinations: Destination[],
  field: "wikipediaPageId" | "wikidataId",
): DuplicateGroup[] {
  const groups = new Map<string, string[]>();
  for (const destination of destinations) {
    const key = directIdentityKey(destination, field);
    if (!key) continue;
    const ids = groups.get(key) ?? [];
    ids.push(destination.id);
    groups.set(key, ids);
  }
  return [...groups.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([identity, ids]) => ({
      identity,
      destinationIds: sortedUnique(ids),
    }))
    .sort((left, right) => left.identity.localeCompare(right.identity));
}

function sourceChanges(
  current: Destination[],
  previous: Destination[],
  fields: readonly string[],
): SourceChange[] {
  const previousById = new Map(
    previous.map((destination) => [destination.id, destination]),
  );
  return current
    .flatMap((destination) => {
      const prior = previousById.get(destination.id);
      if (!prior)
        return [{ id: destination.id, fields: ["missing-in-previous"] }];
      const changed = fields.filter(
        (field) =>
          !sameValue(
            (prior as unknown as Record<string, unknown>)[field],
            (destination as unknown as Record<string, unknown>)[field],
          ),
      );
      return changed.length > 0
        ? [{ id: destination.id, fields: changed }]
        : [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function identityChanges(
  current: Destination[],
  previous: Destination[],
): SourceChange[] {
  const previousById = new Map(
    previous.map((destination) => [destination.id, destination]),
  );
  return current
    .flatMap((destination) => {
      const prior = previousById.get(destination.id);
      if (!prior)
        return [{ id: destination.id, fields: ["missing-in-previous"] }];
      const changed = IDENTITY_FIELDS.filter(
        (field) => prior[field] !== destination[field],
      );
      return changed.length > 0
        ? [{ id: destination.id, fields: [...changed] }]
        : [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function recordChangedFields(
  current: Destination | undefined,
  previous: Destination | undefined,
): string[] {
  if (!current || !previous) return ["record-missing"];
  return Object.keys({ ...previous, ...current })
    .filter(
      (field) =>
        !sameValue(
          (previous as unknown as Record<string, unknown>)[field],
          (current as unknown as Record<string, unknown>)[field],
        ),
    )
    .sort((left, right) => left.localeCompare(right));
}

function parentValidation(
  destination: Destination,
  byId: Map<string, Destination>,
): { valid: boolean; parentId: string | null; reasons: string[] } {
  const parentId = destination.relationships?.parentDestinationId ?? null;
  if (!parentId) return { valid: true, parentId: null, reasons: [] };
  const parent = byId.get(parentId);
  const reasons: string[] = [];
  if (!parent) reasons.push("parent-missing");
  else {
    if (parent.role !== "hub") reasons.push("parent-not-hub");
    if (parent.prefecture !== destination.prefecture)
      reasons.push("parent-prefecture-mismatch");
    if (parent.municipalityId !== destination.municipalityId)
      reasons.push("parent-municipality-mismatch");
  }
  return { valid: reasons.length === 0, parentId, reasons };
}

function issueDuplicateStatus(
  destination: Destination,
  pageGroupsById: Map<string, DuplicateGroup>,
  qidGroupsById: Map<string, DuplicateGroup>,
): Record<string, unknown> {
  const page = destination.wikipediaPageId
    ? pageGroupsById.get(String(destination.wikipediaPageId))
    : undefined;
  const qid = destination.wikidataId
    ? qidGroupsById.get(destination.wikidataId.toUpperCase())
    : undefined;
  return {
    status:
      page || qid
        ? "duplicate"
        : hasExplicitIdentity(destination)
          ? "unique"
          : "unmapped",
    pageIdGroup: page ?? null,
    qidGroup: qid ?? null,
  };
}

function classifyDuplicateGroup(
  ids: string[],
  byId: Map<string, Destination>,
): {
  classification:
    | "intentional-same-entity"
    | "parent-child-conflict"
    | "duplicate-catalogue-record"
    | "suspicious-needs-review";
  status:
    "fixed" | "still-intentionally-deferred" | "worse" | "newly-ambiguous";
  evidence: string;
} {
  const normalized = new Set(ids);
  const isOsakaPair =
    normalized.has("osaka-city") &&
    normalized.has("osaka-museum-of-housing-and-living") &&
    normalized.size === 2;
  const isEnoshimaPair =
    normalized.has("enoshima-island") &&
    normalized.has("enoshima-iwaya-caves") &&
    normalized.size === 2;
  if (isOsakaPair) {
    return {
      classification: "parent-child-conflict",
      status: "still-intentionally-deferred",
      evidence:
        "The Osaka hub and the distinct Osaka Museum of Housing and Living child share Osaka's page/QID; the child points to osaka-city and the duplicate is an article/parent substitution, not one catalogue entity.",
    };
  }
  if (isEnoshimaPair) {
    return {
      classification: "parent-child-conflict",
      status: "still-intentionally-deferred",
      evidence:
        "Enoshima Iwaya Caves is a distinct attraction on Enoshima, but both records currently use Enoshima's page/QID; KAI-257 did not alter either record's identity or relationship semantics.",
    };
  }
  const records = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as Destination[];
  const sameEntityShape = records.every(
    (record) =>
      record.name === records[0]?.name &&
      record.kind === records[0]?.kind &&
      record.role === records[0]?.role &&
      record.municipalityId === records[0]?.municipalityId,
  );
  if (sameEntityShape) {
    return {
      classification: "duplicate-catalogue-record",
      status: "still-intentionally-deferred",
      evidence:
        "The duplicate records have the same identity-bearing catalogue shape and require explicit catalogue deduplication review.",
    };
  }
  return {
    classification: "suspicious-needs-review",
    status: "newly-ambiguous",
    evidence:
      "The duplicate identity group is not covered by an intentional same-entity or known parent/child explanation.",
  };
}

function mapsByDestinationId(
  groups: DuplicateGroup[],
): Map<string, DuplicateGroup> {
  const map = new Map<string, DuplicateGroup>();
  for (const group of groups) {
    for (const id of group.destinationIds) map.set(id, group);
  }
  return map;
}

function findPhase4FingerprintDrift(
  tailIds: string[],
  currentById: Map<string, Destination>,
  manifest: Phase4Manifest,
): SourceChange[] {
  return tailIds
    .flatMap((id) => {
      const destination = currentById.get(id);
      if (!destination) return [{ id, fields: ["destination-missing"] }];
      if (
        phase4AdjudicationFingerprint(destination) !==
        manifest.phase4AdjudicationFingerprints[id]
      ) {
        return [{ id, fields: ["phase4-adjudication-fingerprint"] }];
      }
      return [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function selectedIdentityMatches(
  destination: Destination,
  selected: IdentityRecord | null,
): boolean {
  if (!selected) return false;
  return sameValue(identitySnapshot(destination), identitySnapshot(selected));
}

function makeOutputPath(): string {
  const outputArg = process.argv.indexOf("--output");
  return outputArg >= 0 && process.argv[outputArg + 1]
    ? path.resolve(process.argv[outputArg + 1])
    : path.join(ROOT, DEFAULT_OUTPUT_RELATIVE);
}

function buildDuplicateAudit(
  destinations: Destination[],
): Record<string, unknown> {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const pageGroups = duplicateGroups(destinations, "wikipediaPageId");
  const qidGroups = duplicateGroups(destinations, "wikidataId");
  const semanticGroups = new Map<string, string[]>();
  for (const group of [...pageGroups, ...qidGroups]) {
    const key = group.destinationIds.join("|");
    semanticGroups.set(key, group.destinationIds);
  }
  const classifications = [...semanticGroups.values()]
    .sort((left, right) => left.join("|").localeCompare(right.join("|")))
    .map((ids) => ({
      destinationIds: ids,
      ...classifyDuplicateGroup(ids, byId),
    }));
  const count = (classification: string) =>
    classifications.filter((group) => group.classification === classification)
      .length;
  return {
    duplicatePageIdGroups: pageGroups.length,
    duplicateQidGroups: qidGroups.length,
    intentionalSameEntity: count("intentional-same-entity"),
    parentChildConflict: count("parent-child-conflict"),
    duplicateCatalogueRecord: count("duplicate-catalogue-record"),
    suspiciousNeedsReview: count("suspicious-needs-review"),
    pageIdGroups: pageGroups,
    qidGroups,
    semanticGroups: classifications,
    historicalPairs: {
      osaka: {
        destinationIds: ["osaka-city", "osaka-museum-of-housing-and-living"],
        changedByKai257: false,
        status: "still-intentionally-deferred",
        classification: "parent-child-conflict",
      },
      enoshima: {
        destinationIds: ["enoshima-island", "enoshima-iwaya-caves"],
        changedByKai257: false,
        status: "still-intentionally-deferred",
        classification: "parent-child-conflict",
      },
    },
  };
}

function buildKAI257Invariants(
  destinations: Destination[],
  audit: Kai257AuditReport,
): Record<string, unknown> {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const parentContainmentErrors: Array<Record<string, unknown>> = [];
  for (const destination of destinations) {
    if (!destination.relationships?.parentDestinationId) continue;
    const validation = parentValidation(destination, byId);
    if (!validation.valid) {
      parentContainmentErrors.push({
        destinationId: destination.id,
        parentId: validation.parentId,
        reasons: validation.reasons,
      });
    }
  }
  const municipalityContainmentErrors: Array<Record<string, unknown>> = [];
  const administrativeContainerErrors: Array<Record<string, unknown>> = [];
  const runtimeProjectionErrors: Array<Record<string, unknown>> = [];
  const topSightReferenceCount = destinations.reduce((count, hub) => {
    if (hub.role !== "hub") return count;
    return count + (hub.relationships?.featuredDestinationIds?.length ?? 0);
  }, 0);
  for (const hub of destinations.filter(
    (destination) => destination.role === "hub",
  )) {
    for (const targetId of hub.relationships?.featuredDestinationIds ?? []) {
      const target = byId.get(targetId);
      if (!target) continue;
      const parentId = target.relationships?.parentDestinationId;
      const parent = parentId ? byId.get(parentId) : undefined;
      const expectedMunicipality = parent ?? hub;
      if (
        expectedMunicipality.municipalityId &&
        target.municipalityId &&
        expectedMunicipality.municipalityId !== target.municipalityId
      ) {
        municipalityContainmentErrors.push({
          hubId: hub.id,
          targetId,
          expectedMunicipality: expectedMunicipality.municipalityId,
          actualMunicipality: target.municipalityId,
        });
      }
      if (
        target.role === "hub" ||
        (["city", "town", "village", "ward", "region", "prefecture"].includes(
          target.kind ?? "",
        ) &&
          target.role !== "poi")
      ) {
        administrativeContainerErrors.push({
          hubId: hub.id,
          targetId,
          role: target.role ?? null,
          kind: target.kind ?? null,
        });
      }
    }
    for (const sight of DestinationRelationshipService.getFeaturedChildDestinations(
      hub,
    )) {
      if (!DestinationRelationshipService.isValidChildSight(sight, hub)) {
        runtimeProjectionErrors.push({ hubId: hub.id, targetId: sight.id });
      }
    }
  }
  const grouped = audit.summary.groupedCounts;
  const invalidPeerLeakage =
    grouped.DESTINATION_LEVEL_AS_SIGHT +
    grouped.PARENT_MUNICIPALITY_MISMATCH +
    grouped.SAME_PREFECTURE_VIOLATION +
    grouped.NEARBY_OR_SIBLING_FALLBACK_CONTAMINATION;
  return {
    activeTopSightDefects: audit.summary.totalDefectsFound,
    invalidPeerLeakage,
    groupedDefectCounts: grouped,
    parentChildContainmentErrors: parentContainmentErrors.length,
    parentChildContainmentLedger: parentContainmentErrors,
    municipalityContainmentErrors: municipalityContainmentErrors.length,
    municipalityContainmentLedger: municipalityContainmentErrors,
    administrativeContainerErrors: administrativeContainerErrors.length,
    administrativeContainerLedger: administrativeContainerErrors,
    arbitraryHubIdentityErrors: administrativeContainerErrors.length,
    unsafePeerFallbackErrors: runtimeProjectionErrors.length,
    unsafePeerFallbackLedger: runtimeProjectionErrors,
    sparseHubsFailClosed: audit.summary.omittedTopSightsHubCount > 0,
    sparseHubsOmitted: audit.summary.omittedTopSightsHubCount,
    topSightReferenceCount,
    reviewLedgerCount: audit.summary.ambiguousReviewLedgerCount,
    cleanTopSightsHubCount: audit.summary.cleanTopSightsHubCount,
    relationshipInvariantErrors:
      audit.summary.totalDefectsFound +
      parentContainmentErrors.length +
      municipalityContainmentErrors.length +
      administrativeContainerErrors.length +
      runtimeProjectionErrors.length,
  };
}

async function main(): Promise<void> {
  const indexPath = path.join(ROOT, INDEX_RELATIVE);
  const sourceIndexBefore = fs.readFileSync(indexPath);
  const destinations = JSON.parse(
    sourceIndexBefore.toString("utf8"),
  ) as Destination[];
  const previousDestinations = readJsonAtGitRef<Destination[]>(
    KAI291_SHA,
    INDEX_RELATIVE,
  );
  const baselineDestinations = readJsonAtGitRef<Destination[]>(
    BASE_SHA,
    INDEX_RELATIVE,
  );
  if (
    !sameValue(
      destinations.map((destination) => destination.id),
      baselineDestinations.map((destination) => destination.id),
    )
  ) {
    throw new Error(
      "Current catalogue membership differs from the KAI-292 base; refusing to treat this as the requested closeout.",
    );
  }

  const phase1 = readJson<Phase1Report>(PHASE1_REPORT_RELATIVE);
  const phase4Manifest = readJson<Phase4Manifest>(PHASE4_MANIFEST_RELATIVE);
  const phase4 = readJson<Phase4Report>(PHASE4_REPORT_RELATIVE);
  const phase4EvidenceBinding = buildPhase4EvidenceBinding(
    destinations,
    phase4Manifest,
  );
  const phase4EvidenceBindingData = phase4EvidenceBinding as {
    phase3CohortInputFingerprintDriftIds: string[];
    phase3CacheInputFingerprintDriftIds: string[];
    phase3CohortChangedSinceKai291: string[];
    phase4AdjudicationFingerprintDriftIds: string[];
    phase4ApiCache: { failures: string[] };
    phase4InputValidation: { failures: string[] };
  };
  const expectedExplainedPhase4BindingFailures = [
    ...(phase4EvidenceBindingData.phase4AdjudicationFingerprintDriftIds.length
      ? [
          `phase4-adjudication-fingerprint-drift:${phase4EvidenceBindingData.phase4AdjudicationFingerprintDriftIds.join(",")}`,
        ]
      : []),
    "phase3-cohort-artifact-drift",
    "phase3-whole-cohort-fingerprint-drift",
    ...(phase4EvidenceBindingData.phase3CacheInputFingerprintDriftIds.length
      ? [
          `phase3-cache-input-fingerprint-drift:${phase4EvidenceBindingData.phase3CacheInputFingerprintDriftIds.join(",")}`,
        ]
      : []),
  ];
  const phase4EvidenceBindingExplained =
    phase4EvidenceBindingData.phase3CohortInputFingerprintDriftIds.length ===
      0 &&
    sameValue(
      phase4EvidenceBindingData.phase3CacheInputFingerprintDriftIds,
      phase4EvidenceBindingData.phase3CohortChangedSinceKai291,
    ) &&
    phase4EvidenceBindingData.phase4ApiCache.failures.length === 0 &&
    sameValue(
      phase4EvidenceBindingData.phase4InputValidation.failures,
      expectedExplainedPhase4BindingFailures,
    );
  const phase4EvidenceBindingPasses =
    phase4EvidenceBindingData.phase4InputValidation.failures.length === 0;
  const currentById = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const previousById = new Map(
    previousDestinations.map((destination) => [destination.id, destination]),
  );
  const phase4ById = new Map(
    phase4.records.map((record) => [record.id, record]),
  );

  const published = destinations.filter(
    (destination) => destination.status === "published",
  );
  const canonicalPublished = published.filter(validExplicitIdentity);
  const tailIds = sortedUnique(phase4.records.map((record) => record.id));
  const canonicalRecords = phase4.records
    .filter((record) => record.finalDecision === "canonical")
    .sort((left, right) => left.id.localeCompare(right.id));
  const noStandaloneRecords = phase4.records
    .filter((record) => record.finalDecision === "no-standalone-article")
    .sort((left, right) => left.id.localeCompare(right.id));
  const relationshipIssueRecords = phase4.records
    .filter((record) => record.finalDecision === "catalogue-relationship-issue")
    .sort((left, right) => left.id.localeCompare(right.id));
  const humanRecords = phase4.records
    .filter((record) => record.finalDecision === "needs-human-review")
    .sort((left, right) => left.id.localeCompare(right.id));

  const relationshipChanges = sourceChanges(
    destinations,
    previousDestinations,
    RELATIONSHIP_FIELDS,
  );
  const phase4SemanticChanges = sourceChanges(
    destinations,
    previousDestinations,
    ADJUDICATION_FIELDS,
  );
  const allIdentityChanges = identityChanges(
    destinations,
    previousDestinations,
  );
  const phase4FingerprintDrift = findPhase4FingerprintDrift(
    tailIds,
    currentById,
    phase4Manifest,
  );
  const expectedFingerprintDrift = ["hakone-town", "kusatsu-town"].filter(
    (id) => phase4FingerprintDrift.some((change) => change.id === id),
  );
  const unexplainedFingerprintDrift = phase4FingerprintDrift
    .filter((change) => !expectedFingerprintDrift.includes(change.id))
    .map((change) => change.id);

  const pageGroups = duplicateGroups(destinations, "wikipediaPageId");
  const qidGroups = duplicateGroups(destinations, "wikidataId");
  const qidGroupsById = mapsByDestinationId(qidGroups);

  const canonicalMappingAudits = canonicalRecords.map((record) => {
    const destination = currentById.get(record.id);
    const previous = previousById.get(record.id);
    const selectedIdentityMatchesCurrent = Boolean(
      destination &&
      selectedIdentityMatches(destination, record.selectedIdentity),
    );
    const currentIdentityIsValid = Boolean(
      destination && validExplicitIdentity(destination),
    );
    const publishedAndExists = Boolean(
      destination && destination.status === "published",
    );
    const identityUnchangedSinceKai291 = Boolean(
      destination &&
      previous &&
      sameValue(identityFieldsOf(destination), identityFieldsOf(previous)),
    );
    const finalGate = record.finalGate ?? {};
    const finalGatePasses = REQUIRED_FINAL_GATE_FIELDS.every(
      (field) => finalGate[field] === true,
    );
    const evidence = record.selectedCandidateEvidence;
    const typeCompatible =
      finalGate.entityTypeCompatible === true &&
      evidence?.entityTypeResult === "compatible";
    const geographyCompatible =
      finalGate.geographyCompatible === true &&
      evidence?.geographyResult === "coordinates-compatible";
    const parent = destination
      ? parentValidation(destination, currentById)
      : { valid: false, parentId: null, reasons: ["destination-missing"] };
    const qid = destination?.wikidataId?.toUpperCase();
    const qidGroup = qid ? qidGroupsById.get(qid) : undefined;
    const noCompetingQid = !qidGroup;
    const fingerprintMatches =
      Boolean(destination) &&
      phase4Manifest.phase4AdjudicationFingerprints[record.id] ===
        phase4AdjudicationFingerprint(destination as Destination);
    const allowedFingerprintDrift = expectedFingerprintDrift.includes(
      record.id,
    );
    const sourceFieldsStableOrExplained =
      !phase4SemanticChanges.some((change) => change.id === record.id) ||
      allowedFingerprintDrift;
    const valid =
      publishedAndExists &&
      currentIdentityIsValid &&
      selectedIdentityMatchesCurrent &&
      identityUnchangedSinceKai291 &&
      finalGatePasses &&
      typeCompatible &&
      geographyCompatible &&
      parent.valid &&
      noCompetingQid &&
      finalGate.notParentChildSubstitution === true &&
      sourceFieldsStableOrExplained;
    return {
      id: record.id,
      publishedAndExists,
      identityUnchangedSinceKai291,
      titleLanguageUrlPageIdQidUnchanged: selectedIdentityMatchesCurrent,
      identityValid: currentIdentityIsValid,
      phase4AdjudicationFingerprintMatches: fingerprintMatches,
      phase4AdjudicationFingerprintDriftAllowedByKai257:
        allowedFingerprintDrift,
      entityTypeCompatible: typeCompatible,
      geographyCompatible,
      parentChildValidation: parent,
      noNewCompetingQid: noCompetingQid,
      parentArticleSubstitutionExposed: !(
        finalGate.notParentChildSubstitution === true
      ),
      finalGatePasses,
      sourceFieldsStableOrExplained,
      valid,
      invalidationReasons: valid
        ? []
        : [
            ...(!publishedAndExists ? ["missing-or-unpublished"] : []),
            ...(!identityUnchangedSinceKai291
              ? ["identity-changed-since-kai291"]
              : []),
            ...(!selectedIdentityMatchesCurrent
              ? ["identity-does-not-match-phase4-selection"]
              : []),
            ...(!currentIdentityIsValid ? ["invalid-current-identity"] : []),
            ...(!finalGatePasses ? ["phase4-final-gate-failure"] : []),
            ...(!typeCompatible ? ["entity-type-incompatible"] : []),
            ...(!geographyCompatible ? ["geography-incompatible"] : []),
            ...(!parent.valid ? ["parent-validation-failure"] : []),
            ...(!noCompetingQid ? ["competing-qid"] : []),
            ...(finalGate.notParentChildSubstitution !== true
              ? ["parent-article-substitution"]
              : []),
            ...(!sourceFieldsStableOrExplained
              ? ["unexplained-adjudication-fingerprint-drift"]
              : []),
          ],
    };
  });
  const invalidCanonicalMappings = canonicalMappingAudits.filter(
    (audit) => !audit.valid,
  );

  const phase1Ids = sortedUnique(
    phase1.reviewLedger.map((record) => record.id),
  );
  const phase1ManifestIds = sortedUnique(
    Object.keys(phase4Manifest.phase1ReviewIdentityFingerprints),
  );
  const previousPhase1 = readJsonAtGitRef<Phase1Report>(
    KAI291_SHA,
    PHASE1_REPORT_RELATIVE,
  );
  const previousPhase1Ids = sortedUnique(
    previousPhase1.reviewLedger.map((record) => record.id),
  );
  const phase1SourceModifiedIds = phase1Ids.filter((id) => {
    const current = currentById.get(id);
    const previous = previousById.get(id);
    return !current || !previous || !sameValue(current, previous);
  });
  const phase1SourceModificationDetails = phase1SourceModifiedIds.map((id) => ({
    id,
    changedFields: recordChangedFields(
      currentById.get(id),
      previousById.get(id),
    ),
    previousRelationships: previousById.get(id)?.relationships ?? null,
    currentRelationships: currentById.get(id)?.relationships ?? null,
  }));
  const phase1IdentityChangedIds = phase1Ids.filter((id) => {
    const current = currentById.get(id);
    const previous = previousById.get(id);
    return (
      !current ||
      !previous ||
      !sameValue(identityFieldsOf(current), identityFieldsOf(previous))
    );
  });
  const phase1ProtectedFieldChangedIds = phase1Ids.filter((id) =>
    hasPhase1ProtectedFieldChange(currentById.get(id), previousById.get(id)),
  );
  const phase1ProvenanceChangedIds = phase1Ids.filter((id) => {
    const current = currentById.get(id);
    const previous = previousById.get(id);
    return (
      !current || !previous || hasPhase1ProvenanceChange(current, previous)
    );
  });
  const phase1AdjudicationBoundaryChangedIds = sortedUnique([
    ...phase1ProtectedFieldChangedIds,
    ...phase1ProvenanceChangedIds,
  ]);
  const phase1ReviewInputFingerprintChangedIds = phase1Ids.filter((id) => {
    const current = currentById.get(id);
    return (
      !current ||
      phase4Manifest.phase1ReviewInputFingerprints[id] !==
        phase4AdjudicationFingerprint(current)
    );
  });
  const phase1UnrelatedCatalogueRepairDetails = phase1SourceModificationDetails
    .filter((change) =>
      hasOnlyUnrelatedPhase1CatalogueChanges(
        currentById.get(change.id),
        previousById.get(change.id),
      ),
    )
    .map((change) => {
      const current = currentById.get(change.id)!;
      const previous = previousById.get(change.id)!;
      const nestedRelationshipChanges = nestedRelationshipFieldChanges(
        current,
        previous,
      );
      const fields =
        nestedRelationshipChanges.length > 0
          ? nestedRelationshipChanges
          : change.changedFields;
      return {
        id: change.id,
        fields,
        reason:
          change.id === "aso-city" &&
          fields.includes("relationships.featuredDestinationIds")
            ? "KAI-257 invalid cross-area Top Sights repair"
            : "Independent catalogue repair outside the Phase 1 Wikipedia identity/adjudication boundary",
        previousRelationships: change.previousRelationships,
        currentRelationships: change.currentRelationships,
      };
    });
  const phase1PulledIntoLaterPhases = phase1Ids.filter((id) =>
    phase4ById.has(id),
  );
  const phase1ReviewLedgerIntact =
    phase1Ids.length === 98 &&
    sameValue(phase1Ids, phase1ManifestIds) &&
    sameValue(phase1Ids, previousPhase1Ids);
  const phase1BoundaryPreserved =
    phase1ReviewLedgerIntact &&
    phase1AdjudicationBoundaryChangedIds.length === 0 &&
    phase1PulledIntoLaterPhases.length === 0;

  const noStandaloneAudits = noStandaloneRecords.map((record) => {
    const destination = currentById.get(record.id);
    const previous = previousById.get(record.id);
    const fingerprintMatches = Boolean(
      destination &&
      phase4Manifest.phase4AdjudicationFingerprints[record.id] ===
        phase4AdjudicationFingerprint(destination),
    );
    const unchanged = Boolean(
      destination && previous && sameValue(destination, previous),
    );
    const currentIdentityAbsent = Boolean(
      destination && !hasExplicitIdentity(destination),
    );
    const invalidated =
      !destination ||
      destination.status !== "published" ||
      !fingerprintMatches ||
      !unchanged ||
      !currentIdentityAbsent;
    return {
      id: record.id,
      existsAndPublished: Boolean(
        destination && destination.status === "published",
      ),
      phase4AdjudicationFingerprintMatches: fingerprintMatches,
      sourceSemanticsUnchangedSinceKai291: unchanged,
      identityRemainsAbsent: currentIdentityAbsent,
      invalidated,
      invalidationReasons: invalidated
        ? [
            ...(!destination ? ["destination-missing"] : []),
            ...(destination?.status !== "published" ? ["not-published"] : []),
            ...(!fingerprintMatches ? ["adjudication-fingerprint-drift"] : []),
            ...(!unchanged ? ["catalogue-semantics-changed"] : []),
            ...(!currentIdentityAbsent ? ["identity-assigned"] : []),
          ]
        : [],
    };
  });
  const invalidNoStandalone = noStandaloneAudits.filter(
    (audit) => audit.invalidated,
  );

  const issueDuplicatePageById = mapsByDestinationId(pageGroups);
  const issueDuplicateQidById = mapsByDestinationId(qidGroups);
  const issueChangesById = new Map(
    relationshipChanges.map((change) => [change.id, change]),
  );
  const issueAudits = relationshipIssueRecords.map((record) => {
    const destination = currentById.get(record.id);
    const change = issueChangesById.get(record.id);
    const duplicateStatus = destination
      ? issueDuplicateStatus(
          destination,
          issueDuplicatePageById,
          issueDuplicateQidById,
        )
      : { status: "missing", pageIdGroup: null, qidGroup: null };
    const finalStatus = !destination
      ? "REGRESSION"
      : !change
        ? "STILL_VALID_DEBT"
        : hasExplicitIdentity(destination)
          ? "RESOLVED_BY_KAI257"
          : "PARTIALLY_RESOLVED";
    return {
      destinationId: record.id,
      originalPhase4Diagnosis: record.decisionReason,
      current: {
        kind: destination?.kind ?? null,
        role: destination?.role ?? null,
        placeType: destination?.placeType ?? null,
        parentDestinationId:
          destination?.relationships?.parentDestinationId ?? null,
        municipalityId: destination?.municipalityId ?? null,
      },
      currentDuplicateIdentityStatus: duplicateStatus,
      kai257ChangeAffectingIt: change ?? null,
      finalStatus,
      evidence: {
        destinationExists: Boolean(destination),
        published: destination?.status === "published",
        phase4AdjudicationFingerprintMatches: Boolean(
          destination &&
          phase4Manifest.phase4AdjudicationFingerprints[record.id] ===
            phase4AdjudicationFingerprint(destination),
        ),
        noRelationshipOrTaxonomyChangeSinceKai291: !change,
        explanation: !change
          ? "No KAI-257 kind/role/placeType/municipality/relationship change touched this record; the original Phase 4 diagnosis remains explicit debt."
          : "The record changed in the KAI-257 relationship/taxonomy field set and requires manual review of whether the original diagnosis still applies.",
      },
    };
  });
  const issueRegressions = issueAudits.filter(
    (issue) => issue.finalStatus === "REGRESSION",
  );
  const issueCounts = {
    original: issueAudits.length,
    resolvedByKai257: issueAudits.filter(
      (issue) => issue.finalStatus === "RESOLVED_BY_KAI257",
    ).length,
    partiallyResolved: issueAudits.filter(
      (issue) => issue.finalStatus === "PARTIALLY_RESOLVED",
    ).length,
    stillDebt: issueAudits.filter(
      (issue) => issue.finalStatus === "STILL_VALID_DEBT",
    ).length,
    supersededByNewModel: issueAudits.filter(
      (issue) => issue.finalStatus === "SUPERSEDED_BY_NEW_MODEL",
    ).length,
    regressions: issueRegressions.length,
  };

  const humanIds = sortedUnique(
    phase4.remainingHumanReview.map((record) => record.id),
  );
  const humanRecordIds = humanRecords.map((record) => record.id);
  const humanDirectIdentityChanges = identityChanges(
    humanIds.map((id) => currentById.get(id)).filter(Boolean) as Destination[],
    humanIds.map((id) => previousById.get(id)).filter(Boolean) as Destination[],
  );
  const humanMissingIds = humanIds.filter((id) => !currentById.has(id));
  const humanPromotedIds = humanIds.filter((id) => {
    const destination = currentById.get(id);
    return Boolean(destination && hasExplicitIdentity(destination));
  });
  const humanSemanticChanges = relationshipChanges
    .filter((change) => humanIds.includes(change.id))
    .map((change) => change.id);
  const humanPotentiallyReconsiderable = sortedUnique(humanSemanticChanges);
  const humanReviewIntegrity = {
    expectedCount: 104,
    actualCount: humanIds.length,
    ids: humanIds,
    recordLedgerMatches: sameValue(humanIds, sortedUnique(humanRecordIds)),
    missingIds: humanMissingIds,
    promotedWithIdentityIds: humanPromotedIds,
    directIdentityChangesSinceKai291: humanDirectIdentityChanges,
    potentiallyReconsiderableAfterKai257: humanPotentiallyReconsiderable,
    humanReviewSilentlyModified:
      humanMissingIds.length +
      humanPromotedIds.length +
      humanDirectIdentityChanges.length,
  };

  await loadRelationshipIndex(destinations);
  const kai257Audit = runKai257Audit(destinations);
  const kai257Invariants = buildKAI257Invariants(destinations, kai257Audit);

  const committedOutputs = loadCommittedOutputs(ROOT);
  const firstGeneration = await generateCatalogueOutputs({ rootDir: ROOT });
  const secondGeneration = await generateCatalogueOutputs({ rootDir: ROOT });
  const firstMap = toOutputMap(firstGeneration);
  const secondMap = toOutputMap(secondGeneration);
  const staleOutputs = [
    ...new Set([...committedOutputs.keys(), ...firstMap.keys()]),
  ]
    .filter((key) => committedOutputs.get(key) !== firstMap.get(key))
    .sort();
  const changedOnRegen = [...firstMap.keys()]
    .filter((key) => firstMap.get(key) !== secondMap.get(key))
    .sort();

  const sourceIndexAfter = fs.readFileSync(indexPath);
  const sourceMutation = {
    expectedDestinationMutations: 0,
    actualDestinationMutations: sourceIndexBefore.equals(sourceIndexAfter)
      ? 0
      : 1,
    destinationIndexByteIdenticalDuringAudit:
      sourceIndexBefore.equals(sourceIndexAfter),
    destinationIndexSha256: sha256(sourceIndexAfter),
    changedDestinationIds: sourceIndexBefore.equals(sourceIndexAfter)
      ? []
      : ["src/shared/data/destinations-index.json"],
  };

  const duplicateAudit = buildDuplicateAudit(destinations) as {
    suspiciousNeedsReview: number;
  } & Record<string, unknown>;
  const noSilentHumanReviewPromotion =
    humanReviewIntegrity.humanReviewSilentlyModified === 0 &&
    humanReviewIntegrity.recordLedgerMatches;
  const noSuspiciousIdentityDuplicates =
    duplicateAudit.suspiciousNeedsReview === 0;
  const noTransientFailures =
    phase4.counts.transientFailures === 0 &&
    phase4.safety.transientFailures === 0;
  const relationshipInvariantsPass =
    kai257Invariants.relationshipInvariantErrors === 0;
  const phase4MappingsPreserved = invalidCanonicalMappings.length === 0;
  const noStandalonePreserved = invalidNoStandalone.length === 0;
  const phase1Preserved = phase1BoundaryPreserved;
  const noRegression =
    issueRegressions.length === 0 &&
    unexplainedFingerprintDrift.length === 0 &&
    allIdentityChanges.length === 0 &&
    phase1AdjudicationBoundaryChangedIds.length === 0 &&
    phase4EvidenceBindingExplained;
  const syncPasses = staleOutputs.length === 0 && changedOnRegen.length === 0;
  const close =
    phase4MappingsPreserved &&
    noStandalonePreserved &&
    noSilentHumanReviewPromotion &&
    phase1Preserved &&
    noSuspiciousIdentityDuplicates &&
    relationshipInvariantsPass &&
    noRegression &&
    syncPasses;

  const report = {
    baseSha: BASE_SHA,
    mergedPull: {
      kai291Present: true,
      kai291MergeSha: KAI291_SHA,
      kai292Present: true,
      kai292MergeSha: BASE_SHA,
    },
    publishedDestinations: published.length,
    canonicalWikipediaIdentities: canonicalPublished.length,
    phase1: {
      expectedReviewRecords: 98,
      actualReviewRecords: phase1Ids.length,
      reviewIds: phase1Ids,
      membershipChanged:
        !sameValue(phase1Ids, phase1ManifestIds) ||
        !sameValue(phase1Ids, previousPhase1Ids),
      phase1MembershipChanged:
        !sameValue(phase1Ids, phase1ManifestIds) ||
        !sameValue(phase1Ids, previousPhase1Ids),
      sourceModified: phase1SourceModifiedIds.length,
      sourceModifiedIds: phase1SourceModifiedIds,
      sourceModificationDetails: phase1SourceModificationDetails,
      protectedFields: PHASE1_PROTECTED_FIELDS,
      wikipediaIdentityModified: phase1IdentityChangedIds.length,
      wikipediaIdentityModifiedIds: phase1IdentityChangedIds,
      provenanceModified: phase1ProvenanceChangedIds.length,
      provenanceModifiedIds: phase1ProvenanceChangedIds,
      adjudicationBoundaryViolated: phase1AdjudicationBoundaryChangedIds.length,
      adjudicationBoundaryViolatedIds: phase1AdjudicationBoundaryChangedIds,
      laterPhaseBroadInputFingerprintChanged:
        phase1ReviewInputFingerprintChangedIds.length,
      laterPhaseBroadInputFingerprintChangedIds:
        phase1ReviewInputFingerprintChangedIds,
      unrelatedCatalogueRepairs: phase1UnrelatedCatalogueRepairDetails.length,
      unrelatedCatalogueRepairDetails: phase1UnrelatedCatalogueRepairDetails,
      pulledIntoLaterPhases: phase1PulledIntoLaterPhases,
      reviewLedgerIntact: phase1ReviewLedgerIntact,
      semanticBoundaryPreserved: phase1BoundaryPreserved,
    },
    phase4: {
      originalTail: tailIds.length,
      canonicalMappingsChecked: canonicalRecords.length,
      canonicalMappingIds: canonicalRecords.map((record) => record.id),
      canonicalMappingsInvalidated: invalidCanonicalMappings.length,
      canonicalMappingAudits,
      adjudicationFingerprintDrift: phase4FingerprintDrift,
      adjudicationFingerprintDriftAllowedByKai257: expectedFingerprintDrift,
      unexplainedAdjudicationFingerprintDrift: unexplainedFingerprintDrift,
      noStandaloneChecked: noStandaloneRecords.length,
      noStandaloneIds: noStandaloneRecords.map((record) => record.id),
      noStandaloneInvalidated: invalidNoStandalone.length,
      noStandaloneAudits,
      humanReviewChecked: humanIds.length,
      humanReviewIntegrity,
      phase4EvidenceBinding,
      phase4EvidenceBindingExplained,
      transientFailures: phase4.counts.transientFailures,
    },
    catalogueRelationshipIssues: {
      ...issueCounts,
      audits: issueAudits,
    },
    duplicateIdentityAudit: duplicateAudit,
    kai257: {
      ...kai257Audit.summary,
      ...kai257Invariants,
      generatedDestinationModelSync: {
        generatedDetailFiles: firstGeneration.detailFiles.size,
        staleOutputCount: staleOutputs.length,
        staleOutputs,
        changedOnRegenerationCount: changedOnRegen.length,
        changedOnRegeneration: changedOnRegen,
      },
    },
    safety: {
      phase1BoundaryPreserved: phase1Preserved,
      phase1WikipediaIdentityModified: phase1IdentityChangedIds.length > 0,
      phase1AdjudicationBoundaryViolated:
        phase1AdjudicationBoundaryChangedIds.length > 0,
      unrelatedPhase1CatalogueRepairs:
        phase1UnrelatedCatalogueRepairDetails.length,
      phase4MappingsPreserved,
      noSilentHumanReviewPromotion,
      noSuspiciousIdentityDuplicates,
      noTransientFailures,
      noRegression,
      phase4EvidenceBindingPasses,
      phase4EvidenceBindingExplained,
      sourceDestinationMutations: sourceMutation.actualDestinationMutations,
      noUnexplainedPhase4FingerprintDrift:
        unexplainedFingerprintDrift.length === 0,
      catalogueSyncAndIdempotencyPass: syncPasses,
    },
    sourceMutation,
    kai256CloseoutRecommendation: close ? "CLOSE" : "DO_NOT_CLOSE",
  };

  const outputPath = makeOutputPath();
  const prettierConfig = (await resolveConfig(ROOT)) ?? {};
  const reportJson = await format(`${JSON.stringify(report, null, 2)}\n`, {
    ...prettierConfig,
    parser: "json",
  });
  fs.writeFileSync(outputPath, reportJson);
  console.log(
    JSON.stringify(
      {
        outputPath,
        baseSha: BASE_SHA,
        publishedDestinations: published.length,
        canonicalWikipediaIdentities: canonicalPublished.length,
        canonicalMappingsChecked: canonicalRecords.length,
        canonicalMappingsInvalidated: invalidCanonicalMappings.length,
        noStandaloneChecked: noStandaloneRecords.length,
        noStandaloneInvalidated: invalidNoStandalone.length,
        humanReviewChecked: humanIds.length,
        phase1ReviewRecords: phase1Ids.length,
        relationshipIssues: issueCounts,
        duplicatePageIdGroups: pageGroups.length,
        duplicateQidGroups: qidGroups.length,
        kai257ActiveDefects: kai257Audit.summary.totalDefectsFound,
        kai257RelationshipInvariantErrors:
          kai257Invariants.relationshipInvariantErrors,
        staleGeneratedOutputs: staleOutputs.length,
        changedOnRegeneration: changedOnRegen.length,
        sourceDestinationMutations: sourceMutation.actualDestinationMutations,
        recommendation: report.kai256CloseoutRecommendation,
      },
      null,
      2,
    ),
  );
}

await main();
