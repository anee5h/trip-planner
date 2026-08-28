import fs from "node:fs";
import path from "node:path";
import type {
  AdmissionCostFact,
  Destination,
} from "../src/shared/types/destination";
import { validateAdmissionFact } from "../src/shared/services/budget/factValidation";

type EvidenceAttempt = {
  url: string | null;
  result: string;
  note: string;
};

export type ManifestEntry = {
  id: string;
  identity: {
    name: string;
    kind?: string;
    role?: string;
  };
  evidenceAttempted: EvidenceAttempt[];
  state: AdmissionCostFact["state"];
  provenance: AdmissionCostFact["provenance"];
  reasonCode?: string;
  cost: AdmissionCostFact["cost"];
  scope?: AdmissionCostFact["scope"];
  basis: string;
  sourceUrls?: string[];
  checkedAt?: string;
  reviewIntervalMonths?: number;
};

type AdmissionDestination = Destination & { admission?: AdmissionCostFact };

type AuthoringState = "STATE A" | "STATE B" | "STATE C";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH =
  process.env.KAI219E2_INDEX_PATH ??
  path.join(REPO_ROOT, "src/shared/data/destinations-index.json");
const MANIFEST_PATH =
  process.env.KAI219E2_MANIFEST_PATH ??
  path.join(REPO_ROOT, "scripts/audit/kai-219e2-candidates.json");
const EXPECTED_MANIFEST_ENTRIES = 728;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableJson(value: unknown): string {
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
  left: AdmissionCostFact | undefined,
  right: AdmissionCostFact,
): boolean {
  return stableJson(left) === stableJson(right);
}

export function buildFact(
  entry: ManifestEntry,
  destination?: AdmissionDestination,
): AdmissionCostFact {
  if (!entry.basis.trim()) {
    throw new Error(`${entry.id}: missing research basis`);
  }
  if (entry.evidenceAttempted.length === 0) {
    throw new Error(`${entry.id}: missing evidence-attempt record`);
  }
  if (destination) {
    if (destination.name !== entry.identity.name) {
      throw new Error(
        `${entry.id}: manifest identity name differs from catalogue`,
      );
    }
    if (
      (destination.kind ?? undefined) !== (entry.identity.kind ?? undefined)
    ) {
      throw new Error(
        `${entry.id}: manifest identity kind differs from catalogue`,
      );
    }
    if (
      (destination.role ?? undefined) !== (entry.identity.role ?? undefined)
    ) {
      throw new Error(
        `${entry.id}: manifest identity role differs from catalogue`,
      );
    }
  }

  const {
    id: _id,
    identity: _identity,
    evidenceAttempted: _evidenceAttempted,
    ...fact
  } = entry;
  const result = validateAdmissionFact(fact);
  if (!result.valid) {
    throw new Error(`${entry.id}: invalid admission fact: ${result.reason}`);
  }
  return fact;
}

function validateManifest(
  entries: ManifestEntry[],
  destinations: AdmissionDestination[],
): Map<string, AdmissionCostFact> {
  if (entries.length === 0) {
    throw new Error("KAI-219E2 manifest is empty");
  }
  if (entries.length !== EXPECTED_MANIFEST_ENTRIES) {
    throw new Error(
      `KAI-219E2 manifest must contain exactly ${EXPECTED_MANIFEST_ENTRIES} entries; found ${entries.length}`,
    );
  }
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const manifestIds = new Set(entries.map((entry) => entry.id));
  const uncoveredAbsent = destinations
    .filter(
      (destination) =>
        destination.admission === undefined && !manifestIds.has(destination.id),
    )
    .map((destination) => destination.id);
  if (uncoveredAbsent.length > 0) {
    throw new Error(
      `KAI-219E2 manifest does not cover absent catalogue records: ${uncoveredAbsent.join(", ")}`,
    );
  }
  const facts = new Map<string, AdmissionCostFact>();
  for (const entry of entries) {
    if (facts.has(entry.id)) {
      throw new Error(`${entry.id}: duplicate manifest ID`);
    }
    const destination = byId.get(entry.id);
    if (!destination) {
      throw new Error(`${entry.id}: not found in catalogue`);
    }
    facts.set(entry.id, buildFact(entry, destination));
  }
  return facts;
}

export function determineState(
  entries: ManifestEntry[],
  destinations: AdmissionDestination[],
): {
  state: AuthoringState;
  facts: Map<string, AdmissionCostFact>;
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
    if (destination.admission === undefined) {
      absent.push(entry.id);
    } else if (factsEqual(destination.admission, expected)) {
      correct.push(entry.id);
    } else {
      conflicting.push(entry.id);
    }
  }

  const state: AuthoringState =
    absent.length === entries.length
      ? "STATE A"
      : correct.length === entries.length
        ? "STATE B"
        : "STATE C";
  return { state, facts, absent, correct, conflicting };
}

export function applyManifest(
  destinations: AdmissionDestination[],
  entries: ManifestEntry[],
): { state: AuthoringState; changed: number } {
  const result = determineState(entries, destinations);
  if (result.state === "STATE C") {
    throw new Error(
      `KAI-219E2 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }
  if (result.state === "STATE B") {
    return { state: result.state, changed: 0 };
  }
  for (const entry of entries) {
    const destination = destinations.find((item) => item.id === entry.id)!;
    destination.admission = result.facts.get(entry.id)!;
  }
  return { state: result.state, changed: entries.length };
}

function main(): void {
  const destinations = readJson<AdmissionDestination[]>(INDEX_PATH);
  const entries = readJson<ManifestEntry[]>(MANIFEST_PATH);
  const result = determineState(entries, destinations);
  const shouldWrite = process.argv.includes("--write");

  if (result.state === "STATE C") {
    throw new Error(
      `KAI-219E2 STATE C: refusing mutation; absent=${result.absent.length}, correct=${result.correct.length}, conflicting=${result.conflicting.length}`,
    );
  }

  if (shouldWrite && result.state === "STATE A") {
    applyManifest(destinations, entries);
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(
      `KAI-219E2 ${result.state}: authored ${entries.length} admission facts`,
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

if (import.meta.main) {
  main();
}
