import fs from "node:fs";
import path from "node:path";
import type {
  Destination,
  LocalTransportAccess,
} from "../src/shared/types/destination";
import { validateLocalTransportFact } from "../src/shared/services/budget/factValidation";

export type CandidateDecision =
  "verified_walking" | "not_applicable" | "defer_f2" | "defer_f3";

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
  process.env.KAI250_INDEX_PATH ??
  path.join(REPO_ROOT, "src/shared/data/destinations-index.json");
const MANIFEST_PATH =
  process.env.KAI250_MANIFEST_PATH ??
  path.join(REPO_ROOT, "scripts/audit/kai-250-candidates.json");
const EXPECTED_INVENTORY_ENTRIES = 32;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/** Stable equality for persisted JSON facts; object key order is irrelevant. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
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

function isAuthoredDecision(
  decision: CandidateDecision,
): decision is "verified_walking" | "not_applicable" {
  return decision === "verified_walking" || decision === "not_applicable";
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

  if (isAuthoredDecision(entry.decision)) {
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
    if (!entry.fact)
      throw new Error(
        `${entry.id}: authored entry missing localTransport fact`,
      );
    if (entry.fact.kind !== entry.decision) {
      throw new Error(
        `${entry.id}: decision ${entry.decision} does not match fact kind ${entry.fact.kind}`,
      );
    }
    if (
      entry.fact.kind === "verified_walking" &&
      stableJson(entry.sourceUrls) !== stableJson(entry.fact.sourceUrls ?? [])
    ) {
      throw new Error(
        `${entry.id}: ledger sourceUrls differ from fact sourceUrls`,
      );
    }
    if (
      entry.fact.kind === "verified_walking" &&
      entry.fact.walkingEvidence !== entry.exactAccessEvidence
    ) {
      throw new Error(
        `${entry.id}: walking evidence differs from ledger evidence`,
      );
    }
    if (entry.fact.kind === "verified_walking" && !entry.fact.checkedAt) {
      throw new Error(`${entry.id}: verified walking fact requires checkedAt`);
    }
    if (
      entry.fact.kind === "verified_walking" &&
      entry.fact.reviewIntervalMonths !== 12
    ) {
      throw new Error(
        `${entry.id}: verified walking fact requires 12-month review interval`,
      );
    }
  } else {
    if (entry.fact !== undefined) {
      throw new Error(
        `${entry.id}: deferred entry must not carry a catalogue fact`,
      );
    }
    if (entry.decision !== "defer_f2" && entry.decision !== "defer_f3") {
      throw new Error(`${entry.id}: unknown decision ${entry.decision}`);
    }
    if (entry.deferredCohort !== "F2" && entry.deferredCohort !== "F3") {
      throw new Error(`${entry.id}: deferred entry requires F2/F3 cohort`);
    }
    const expectedDecision = `defer_${entry.deferredCohort.toLowerCase()}`;
    if (entry.decision !== expectedDecision) {
      throw new Error(
        `${entry.id}: decision ${entry.decision} does not match ${entry.deferredCohort}`,
      );
    }
  }
}

export function buildFact(
  entry: ManifestEntry,
  destination?: LocalTransportDestination,
): LocalTransportAccess {
  validateLedgerEntry(entry);
  if (!isAuthoredDecision(entry.decision) || !entry.fact) {
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
  if (entries.length !== EXPECTED_INVENTORY_ENTRIES) {
    throw new Error(
      `KAI-250 candidate inventory must contain exactly ${EXPECTED_INVENTORY_ENTRIES} entries; found ${entries.length}`,
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
      throw new Error(`${entry.id}: duplicate inventory ID`);
    }
    const destination = byId.get(entry.id);
    if (!destination) throw new Error(`${entry.id}: not found in catalogue`);
    assertIdentity(entry, destination);
    validateLedgerEntry(entry);
    if (entry.fact) {
      facts.set(entry.id, buildFact(entry, destination));
    }
  }
  const authoredCount = entries.filter(
    (entry) => entry.fact !== undefined,
  ).length;
  const deferredCount = entries.length - authoredCount;
  if (authoredCount !== 16 || deferredCount !== 16) {
    throw new Error(
      `KAI-250 inventory expected 16 authored + 16 deferred entries; found ${authoredCount} + ${deferredCount}`,
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
  const authoredEntries = entries.filter((entry) => entry.fact !== undefined);
  const absent: string[] = [];
  const correct: string[] = [];
  const conflicting: string[] = [];

  for (const entry of authoredEntries) {
    const destination = byId.get(entry.id)!;
    const expected = facts.get(entry.id)!;
    if (destination.localTransport === undefined) {
      absent.push(entry.id);
    } else if (factsEqual(destination.localTransport, expected)) {
      correct.push(entry.id);
    } else {
      conflicting.push(entry.id);
    }
  }

  const state: AuthoringState =
    absent.length === authoredEntries.length
      ? "STATE A"
      : correct.length === authoredEntries.length
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
      `KAI-250 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
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

function main(): void {
  const destinations = readJson<LocalTransportDestination[]>(INDEX_PATH);
  const entries = readJson<ManifestEntry[]>(MANIFEST_PATH);
  const result = determineState(entries, destinations);
  const shouldWrite = process.argv.includes("--write");

  if (result.state === "STATE C") {
    throw new Error(
      `KAI-250 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }
  if (shouldWrite && result.state === "STATE A") {
    applyManifest(destinations, entries);
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(
      `KAI-250 ${result.state}: authored ${result.absent.length} localTransport facts`,
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        state: result.state,
        inventoryEntries: entries.length,
        authored: entries.filter((entry) => entry.fact !== undefined).length,
        deferred: entries.filter((entry) => entry.fact === undefined).length,
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
