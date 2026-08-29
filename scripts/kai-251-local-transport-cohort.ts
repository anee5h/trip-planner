import fs from "node:fs";
import path from "node:path";
import type {
  Destination,
  LocalTransportAccess,
} from "../src/shared/types/destination";
import { validateLocalTransportFact } from "../src/shared/services/budget/factValidation";

export type CandidateDecision = "author" | "defer_f2" | "defer_f3";

export type ResidualReason =
  | "ambiguous_canonical_arrival"
  | "fare_unavailable"
  | "context_dependent_access"
  | "f3_deep_research_required";

export type ManifestEntry = {
  id: string;
  identity: {
    name: string;
    kind?: string;
    role?: string;
  };
  decision: CandidateDecision;
  canonicalArrivalAccessPoint: string;
  exactAccessEvidence?: string;
  sourceUrls?: string[];
  checkedAt?: string;
  reviewCadence?: string;
  reason: string;
  residualReason?: ResidualReason;
  excludedOptionalOrPaidAccess?: string;
  deferredCohort?: string;
  fact?: LocalTransportAccess;
};

type LocalTransportDestination = Destination & {
  localTransport?: LocalTransportAccess;
};
export type AuthoringState = "STATE A" | "STATE B" | "STATE C";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH =
  process.env.KAI251_INDEX_PATH ??
  path.join(REPO_ROOT, "src/shared/data/destinations-index.json");
const MANIFEST_PATH =
  process.env.KAI251_MANIFEST_PATH ??
  path.join(REPO_ROOT, "scripts/audit/kai-251-local-transport-manifest.json");
const RESIDUAL_PATH =
  process.env.KAI251_RESIDUAL_PATH ??
  path.join(REPO_ROOT, "scripts/audit/kai-251-residual-local-transport.json");
const EXPECTED_QUEUE_ENTRIES = 16;
const EXPECTED_AUTHORED_ENTRIES = 12;

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

function hasNonEmptyStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function assertIdentity(
  entry: ManifestEntry,
  destination: LocalTransportDestination,
): void {
  for (const key of ["name", "kind", "role"] as const) {
    const expected = entry.identity[key] ?? undefined;
    const actual = destination[key] ?? undefined;
    if (actual !== expected) {
      throw new Error(
        `${entry.id}: manifest identity ${key} differs from catalogue (${String(expected)} != ${String(actual)})`,
      );
    }
  }
}

function validateLedgerEntry(entry: ManifestEntry): void {
  if (!entry.canonicalArrivalAccessPoint.trim()) {
    throw new Error(`${entry.id}: missing canonical arrival/access point`);
  }
  if (!entry.reason.trim())
    throw new Error(`${entry.id}: missing decision reason`);

  if (entry.decision === "author") {
    if (!entry.exactAccessEvidence?.trim()) {
      throw new Error(
        `${entry.id}: authored entry missing exact access evidence`,
      );
    }
    if (!hasNonEmptyStrings(entry.sourceUrls)) {
      throw new Error(
        `${entry.id}: authored entry requires authoritative sourceUrls`,
      );
    }
    if (!entry.checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt)) {
      throw new Error(
        `${entry.id}: authored entry requires checkedAt YYYY-MM-DD`,
      );
    }
    if (entry.reviewCadence !== "12 months") {
      throw new Error(
        `${entry.id}: authored entry must declare a 12-month review cadence`,
      );
    }
    if (!entry.fact || entry.fact.kind !== "verified_required_access") {
      throw new Error(
        `${entry.id}: authored entry requires verified_required_access fact`,
      );
    }
    if (stableJson(entry.sourceUrls) !== stableJson(entry.fact.sourceUrls)) {
      throw new Error(
        `${entry.id}: ledger sourceUrls differ from fact sourceUrls`,
      );
    }
    if (entry.fact.checkedAt !== entry.checkedAt) {
      throw new Error(
        `${entry.id}: ledger checkedAt differs from fact checkedAt`,
      );
    }
    if (entry.fact.reviewIntervalMonths !== 12) {
      throw new Error(
        `${entry.id}: authored fact requires 12-month review interval`,
      );
    }
  } else {
    if (entry.fact !== undefined) {
      throw new Error(
        `${entry.id}: deferred entry must not carry a catalogue fact`,
      );
    }
    if (!entry.residualReason) {
      throw new Error(
        `${entry.id}: deferred entry must declare residualReason`,
      );
    }
    if (
      entry.deferredCohort !==
      entry.decision.slice("defer_".length).toUpperCase()
    ) {
      throw new Error(`${entry.id}: deferred cohort does not match decision`);
    }
  }
}

export function buildFact(
  entry: ManifestEntry,
  destination?: LocalTransportDestination,
): LocalTransportAccess {
  validateLedgerEntry(entry);
  if (entry.decision !== "author" || !entry.fact) {
    throw new Error(`${entry.id}: only authored entries can build a fact`);
  }
  if (destination) assertIdentity(entry, destination);
  const result = validateLocalTransportFact(entry.fact);
  if (!result.valid) {
    throw new Error(
      `${entry.id}: invalid localTransport fact: ${result.reason}`,
    );
  }
  return entry.fact;
}

export function validateManifest(
  entries: ManifestEntry[],
  destinations: LocalTransportDestination[],
): Map<string, LocalTransportAccess> {
  if (entries.length !== EXPECTED_QUEUE_ENTRIES) {
    throw new Error(
      `KAI-251 research queue must contain exactly ${EXPECTED_QUEUE_ENTRIES} entries; found ${entries.length}`,
    );
  }
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const facts = new Map<string, LocalTransportAccess>();
  for (const entry of entries) {
    if (
      facts.has(entry.id) ||
      entries.filter((candidate) => candidate.id === entry.id).length > 1
    ) {
      throw new Error(`${entry.id}: duplicate research queue ID`);
    }
    const destination = byId.get(entry.id);
    if (!destination) throw new Error(`${entry.id}: not found in catalogue`);
    assertIdentity(entry, destination);
    validateLedgerEntry(entry);
    if (entry.fact) facts.set(entry.id, buildFact(entry, destination));
  }
  const authoredCount = entries.filter(
    (entry) => entry.decision === "author",
  ).length;
  if (authoredCount !== EXPECTED_AUTHORED_ENTRIES) {
    throw new Error(
      `KAI-251 queue expected ${EXPECTED_AUTHORED_ENTRIES} authored + ${EXPECTED_QUEUE_ENTRIES - EXPECTED_AUTHORED_ENTRIES} deferred entries; found ${authoredCount} authored`,
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
    if (entry.fact) {
      const expected = facts.get(entry.id)!;
      if (destination.localTransport === undefined) absent.push(entry.id);
      else if (factsEqual(destination.localTransport, expected))
        correct.push(entry.id);
      else conflicting.push(entry.id);
    } else if (destination.localTransport !== undefined) {
      conflicting.push(entry.id);
    }
  }

  const authoredCount = entries.filter(
    (entry) => entry.fact !== undefined,
  ).length;
  const state: AuthoringState =
    conflicting.length > 0
      ? "STATE C"
      : absent.length === authoredCount
        ? "STATE A"
        : correct.length === authoredCount && absent.length === 0
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
      `KAI-251 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }
  if (result.state === "STATE B") return { state: result.state, changed: 0 };
  for (const entry of entries) {
    if (!entry.fact) continue;
    const destination = destinations.find((item) => item.id === entry.id)!;
    destination.localTransport = result.facts.get(entry.id)!;
  }
  return { state: result.state, changed: result.absent.length };
}

export function buildResidualReport(
  entries: ManifestEntry[],
  destinations: LocalTransportDestination[],
): {
  generatedFromDestinationCount: number;
  unresolvedCount: number;
  unresolvedIds: string[];
  groups: Record<ResidualReason, string[]>;
} {
  const queueById = new Map(entries.map((entry) => [entry.id, entry]));
  const groups: Record<ResidualReason, string[]> = {
    ambiguous_canonical_arrival: [],
    fare_unavailable: [],
    context_dependent_access: [],
    f3_deep_research_required: [],
  };
  const unresolvedIds = destinations
    .filter((destination) => destination.localTransport === undefined)
    .map((destination) => destination.id)
    .sort();

  for (const id of unresolvedIds) {
    const entry = queueById.get(id);
    const reason: ResidualReason =
      entry?.residualReason ?? "f3_deep_research_required";
    groups[reason].push(id);
  }
  return {
    generatedFromDestinationCount: destinations.length,
    unresolvedCount: unresolvedIds.length,
    unresolvedIds,
    groups,
  };
}

function main(): void {
  const destinations = readJson<LocalTransportDestination[]>(INDEX_PATH);
  const entries = readJson<ManifestEntry[]>(MANIFEST_PATH);
  const result = determineState(entries, destinations);
  const shouldWrite = process.argv.includes("--write");
  if (result.state === "STATE C") {
    throw new Error(
      `KAI-251 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }
  if (shouldWrite && result.state === "STATE A") {
    applyManifest(destinations, entries);
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(
      `KAI-251 ${result.state}: authored ${result.absent.length} localTransport facts`,
    );
  } else {
    console.log(
      JSON.stringify(
        {
          state: result.state,
          queueEntries: entries.length,
          authored: entries.filter((entry) => entry.fact).length,
          deferred: entries.filter((entry) => !entry.fact).length,
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
  const residual = buildResidualReport(entries, destinations);
  if (shouldWrite)
    fs.writeFileSync(RESIDUAL_PATH, `${JSON.stringify(residual, null, 2)}\n`);
}

if (import.meta.main) main();
