import fs from "node:fs";
import path from "node:path";
import type {
  Destination,
  LocalTransportAccess,
} from "../src/shared/types/destination";
import {
  isValidCheckedAtDate,
  validateLocalTransportFact,
} from "../src/shared/services/budget/factValidation";

export type AuthoringState = "STATE A" | "STATE B" | "STATE C";

export type ResidualReason =
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

export type SourceAttempt = {
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

export type ManifestEntry = {
  id: string;
  identity: { name: string; kind?: string; role?: string };
  decision: "author";
  cohort: string;
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

type LocalTransportDestination = Destination & {
  localTransport?: LocalTransportAccess;
};

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH =
  process.env.KAI252_INDEX_PATH ??
  path.join(REPO_ROOT, "src/shared/data/destinations-index.json");
const MANIFEST_PATH =
  process.env.KAI252_MANIFEST_PATH ??
  path.join(REPO_ROOT, "scripts/audit/kai-252-local-transport-manifest.json");
// KAI-258D adds 11 records to the predecessor's fully authored catalogue.
const EXPECTED_TOTAL = 1130;
const EXPECTED_RESIDUAL = 1052;
const RESIDUAL_REASONS = new Set<ResidualReason>([
  "resolved",
  "fare_unavailable",
  "ambiguous_canonical_arrival",
  "context_dependent_access",
  "route_unavailable",
  "temporarily_closed",
  "service_suspended",
  "bundled_product_unrepresentable",
  "incomplete_required_segments",
  "evidence_conflict",
  "origin_topology_gap",
  "no_current_saleable_product",
]);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/** Stable equality for persisted JSON facts; object key order is irrelevant. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function factsEqual(
  left: LocalTransportAccess | undefined,
  right: LocalTransportAccess,
): boolean {
  return stableJson(left) === stableJson(right);
}

function assertIdentity(
  entry: ManifestEntry,
  destination: LocalTransportDestination,
): void {
  for (const key of ["name", "kind", "role"] as const) {
    const expected = entry.identity[key] ?? undefined;
    const actual = destination[key] ?? undefined;
    if (expected !== actual) {
      throw new Error(
        `${entry.id}: manifest identity ${key} differs from catalogue (${String(expected)} != ${String(actual)})`,
      );
    }
  }
}

function validateSourceAttempt(
  entry: ManifestEntry,
  attempt: SourceAttempt,
): void {
  if (!attempt.url.trim()) throw new Error(`${entry.id}: blank source URL`);
  if (!attempt.authority.trim())
    throw new Error(`${entry.id}: source attempt missing authority`);
  if (!isValidCheckedAtDate(attempt.checkedAt)) {
    throw new Error(`${entry.id}: source attempt has invalid checkedAt`);
  }
  if (!attempt.established.trim())
    throw new Error(`${entry.id}: source attempt missing established detail`);
  if (!attempt.remainsUnknown.trim())
    throw new Error(
      `${entry.id}: source attempt missing remainsUnknown detail`,
    );
  if (
    attempt.outcome === "retrieved" &&
    (attempt.status === undefined || attempt.status < 100)
  ) {
    throw new Error(
      `${entry.id}: retrieved source attempt missing HTTP status`,
    );
  }
}

function validateLedgerEntry(entry: ManifestEntry): void {
  if (entry.decision !== "author")
    throw new Error(`${entry.id}: KAI-252 entries must author explicit facts`);
  if (!entry.identity.name.trim())
    throw new Error(`${entry.id}: missing canonical identity name`);
  if (!entry.cohort || !entry.cohortLabel)
    throw new Error(`${entry.id}: missing inventory cohort metadata`);
  if (entry.cohortIsInventoryAidOnly !== true)
    throw new Error(`${entry.id}: cohort metadata must remain inventory-only`);
  if (!entry.canonicalArrivalAccessPoint.trim())
    throw new Error(`${entry.id}: missing canonical arrival/access point`);
  if (!entry.accessPatternResearched.trim())
    throw new Error(`${entry.id}: missing access-pattern research detail`);
  if (
    !Array.isArray(entry.sourceAttempts) ||
    entry.sourceAttempts.length === 0
  ) {
    throw new Error(
      `${entry.id}: unavailable entry requires evidence attempts`,
    );
  }
  if (!Array.isArray(entry.additionalSourceUrls))
    throw new Error(`${entry.id}: additionalSourceUrls must be an array`);
  for (const attempt of entry.sourceAttempts)
    validateSourceAttempt(entry, attempt);
  if (!entry.residualReason || !RESIDUAL_REASONS.has(entry.residualReason)) {
    throw new Error(`${entry.id}: unsupported residual reason`);
  }
  if (!entry.reason.trim())
    throw new Error(`${entry.id}: missing residual reason detail`);
  if (
    ![
      "authoritative_reviewed",
      "repository_semantics_reviewed",
      "topology_blocked",
      "retrieval_incomplete",
    ].includes(entry.researchDisposition)
  ) {
    throw new Error(`${entry.id}: unsupported research disposition`);
  }
  if (
    !Number.isInteger(entry.retrievalFailureCount) ||
    entry.retrievalFailureCount < 0
  ) {
    throw new Error(`${entry.id}: invalid retrieval failure count`);
  }
  if (!entry.semanticReview || typeof entry.semanticReview !== "object")
    throw new Error(`${entry.id}: missing semanticReview`);
  for (const field of [
    "originTravelCoverage",
    "canonicalArrival",
    "requiredLocalLegs",
    "walkingAssessment",
    "paidAccessAssessment",
    "fareProduct",
    "multipleRequiredSegments",
    "coverageDecision",
    "noDoubleCounting",
  ] as const) {
    if (!entry.semanticReview[field].trim())
      throw new Error(`${entry.id}: missing semanticReview.${field}`);
  }
  for (const field of [
    "whyVerifiedWalkingIsInappropriate",
    "whyNotApplicableIsInappropriate",
    "whyVerifiedRequiredAccessIsInappropriate",
    "whyBoundedDefensibleAccessIsInappropriate",
    "whySegmentOnlyIsInsufficient",
  ] as const) {
    if (!entry[field].trim()) throw new Error(`${entry.id}: missing ${field}`);
  }
  if (!entry.closureOrSuspension.detail.trim())
    throw new Error(`${entry.id}: missing closure/suspension assessment`);
  if (
    entry.blocker !== "localTransport_evidence" &&
    entry.blocker !== "origin_topology"
  ) {
    throw new Error(`${entry.id}: unsupported blocker`);
  }
  const result = validateLocalTransportFact(entry.fact);
  if (!result.valid)
    throw new Error(
      `${entry.id}: invalid localTransport fact: ${result.reason}`,
    );
  if (
    entry.fact.kind === "unavailable" &&
    entry.researchDisposition === "retrieval_incomplete"
  ) {
    throw new Error(
      `${entry.id}: retrieval-incomplete research cannot author unavailable`,
    );
  }
  if (
    entry.fact.kind !== "unavailable" &&
    entry.researchDisposition !== "authoritative_reviewed" &&
    entry.researchDisposition !== "repository_semantics_reviewed"
  ) {
    throw new Error(
      `${entry.id}: resolved fact requires source-backed or repository-semantic research disposition`,
    );
  }
}

export function validateManifest(
  entries: ManifestEntry[],
  destinations: LocalTransportDestination[],
): Map<string, LocalTransportAccess> {
  if (destinations.length !== EXPECTED_TOTAL)
    throw new Error(
      `Expected ${EXPECTED_TOTAL} catalogue destinations; found ${destinations.length}`,
    );
  if (entries.length !== EXPECTED_RESIDUAL)
    throw new Error(
      `KAI-252 manifest must contain exactly ${EXPECTED_RESIDUAL} entries; found ${entries.length}`,
    );
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const facts = new Map<string, LocalTransportAccess>();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id))
      throw new Error(`${entry.id}: duplicate KAI-252 manifest ID`);
    seen.add(entry.id);
    const destination = byId.get(entry.id);
    if (!destination) throw new Error(`${entry.id}: not found in catalogue`);
    assertIdentity(entry, destination);
    validateLedgerEntry(entry);
    facts.set(entry.id, entry.fact);
  }
  const absentIds = destinations
    .filter((destination) => destination.localTransport === undefined)
    .map((destination) => destination.id)
    .sort();
  const unexpectedAbsent = absentIds.filter((id) => !seen.has(id));
  if (unexpectedAbsent.length > 0) {
    throw new Error(
      `KAI-252 manifest does not cover currently absent localTransport IDs: ${unexpectedAbsent.slice(0, 5).join(", ")}`,
    );
  }
  return facts;
}

export function determineState(
  entries: ManifestEntry[],
  destinations: LocalTransportDestination[],
): {
  state: AuthoringState;
  facts: Map<string, LocalTransportAccess>;
  absent: string[];
  correct: string[];
  conflicting: string[];
} {
  const facts = validateManifest(entries, destinations);
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const absent: string[] = [];
  const correct: string[] = [];
  const conflicting: string[] = [];
  for (const entry of entries) {
    const destination = byId.get(entry.id)!;
    const expected = facts.get(entry.id)!;
    if (destination.localTransport === undefined) absent.push(entry.id);
    else if (factsEqual(destination.localTransport, expected))
      correct.push(entry.id);
    else conflicting.push(entry.id);
  }
  const state: AuthoringState =
    conflicting.length > 0
      ? "STATE C"
      : absent.length === entries.length
        ? "STATE A"
        : correct.length === entries.length
          ? "STATE B"
          : "STATE C";
  return { state, facts, absent, correct, conflicting };
}

export function applyManifest(
  destinations: LocalTransportDestination[],
  entries: ManifestEntry[],
): { state: AuthoringState; changed: number } {
  const result = determineState(entries, destinations);
  if (result.state === "STATE C") {
    throw new Error(
      `KAI-252 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }
  if (result.state === "STATE B") return { state: result.state, changed: 0 };
  for (const entry of entries) {
    const destination = destinations.find((item) => item.id === entry.id)!;
    destination.localTransport = result.facts.get(entry.id)!;
  }
  return { state: result.state, changed: result.absent.length };
}

function main(): void {
  const destinations = readJson<LocalTransportDestination[]>(INDEX_PATH);
  const entries = readJson<ManifestEntry[]>(MANIFEST_PATH);
  const result = determineState(entries, destinations);
  const shouldWrite = process.argv.includes("--write");
  if (result.state === "STATE C") {
    throw new Error(
      `KAI-252 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }
  if (shouldWrite && result.state === "STATE A") {
    applyManifest(destinations, entries);
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(
      `KAI-252 ${result.state}: authored ${result.absent.length} explicit localTransport facts (${[...new Set(entries.map((entry) => entry.fact.kind))].sort().join(", ")})`,
    );
    return;
  }
  console.log(
    JSON.stringify(
      {
        state: result.state,
        manifestEntries: entries.length,
        absent: result.absent.length,
        correct: result.correct.length,
        conflicting: result.conflicting.length,
        writes: 0,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) main();
