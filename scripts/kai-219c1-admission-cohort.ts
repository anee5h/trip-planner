/**
 * KAI-219C1 — clear fixed-paid attractions admission cohort.
 *
 * Authors verified_paid (or bounded variable_price) admission facts for
 * the candidate records identified by the read-only investigation, using
 * ONLY source-backed evidence (official operator/municipality/prefecture/
 * government/tourism pages, committed notes, kai-89 ledger).
 *
 * Deterministic + fail-closed:
 *   - The candidate manifest is a committed JSON (scripts/audit/kai-219c1-
 *     candidates.json) with {id, jpy|min|max, scope, sourceUrls,
 *     checkedAt, basis} per record.
 *   - Each candidate MUST currently be admission-absent; if a candidate
 *     already has a fact → FAIL CLOSED (never overwrite).
 *   - A source URL is required for every source-backed classification.
 *   - Idempotent: re-running on already-migrated data validates STATE B
 *     (all expected facts present → exit 0 → zero diff).
 *
 * Run: npx tsx scripts/kai-219c1-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Destination,
  AdmissionCostFact,
} from "../src/shared/types/destination";
import { normalizeBudgetState } from "../src/shared/services/budget/budgetState";
import { getEffectiveBudgetBreakdown } from "../src/shared/services/budget/BudgetService";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219c1-candidates.json",
);

interface ManifestEntry {
  id: string;
  jpy?: number;
  min?: number;
  max?: number;
  scope: string;
  sourceUrls: string[];
  checkedAt: string;
  basis: string;
  state?: "verified_paid" | "variable_price";
}

function load(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
}

function isTransitionalNumericUsed(d: Destination): boolean {
  if (d.admission) return false;
  const norm = normalizeBudgetState(d);
  const trusted =
    norm.trustLevel === "trusted" || norm.trustLevel === "trusted_estimate";
  if (!trusted) return false;
  const projected = getEffectiveBudgetBreakdown(d);
  return (
    projected !== null &&
    typeof projected.tickets === "number" &&
    Number.isFinite(projected.tickets)
  );
}

function buildFact(entry: ManifestEntry, d: Destination): AdmissionCostFact {
  if (entry.sourceUrls.length === 0) {
    throw new Error(
      `KAI-219C1 FAIL-CLOSED: ${entry.id} has no source URL — refusing to author without source-backed evidence.`,
    );
  }
  const state = entry.state ?? "verified_paid";
  if (state === "variable_price") {
    if (entry.min === undefined || entry.max === undefined) {
      throw new Error(
        `KAI-219C1 FAIL-CLOSED: ${entry.id} variable_price requires an official bounded [min,max].`,
      );
    }
    return {
      state: "variable_price",
      provenance: "verified_source",
      reasonCode: "price_variable_by_date",
      cost: { kind: "bounded", min: entry.min, max: entry.max },
      scope: entry.scope as "general_entry",
      basis: entry.basis,
      sourceUrls: entry.sourceUrls,
      checkedAt: entry.checkedAt,
      reviewIntervalMonths: 12,
    };
  }
  // verified_paid
  if (entry.jpy === undefined || entry.jpy <= 0) {
    throw new Error(
      `KAI-219C1 FAIL-CLOSED: ${entry.id} verified_paid requires a positive adult general-entry price.`,
    );
  }
  return {
    state: "verified_paid",
    provenance: "verified_source",
    cost: { kind: "bounded", min: entry.jpy, max: entry.jpy },
    scope: entry.scope as "general_entry",
    basis: entry.basis,
    sourceUrls: entry.sourceUrls,
    checkedAt: entry.checkedAt,
    reviewIntervalMonths: 12,
  };
}

function factsEqual(
  a: AdmissionCostFact | undefined,
  b: AdmissionCostFact,
): boolean {
  return !!a && JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const destinations = load();
  const manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, "utf8"),
  ) as ManifestEntry[];
  const byId = new Map(destinations.map((d) => [d.id, d]));

  // Manifest IDs must all exist in the catalogue.
  const missing = manifest.filter((e) => !byId.has(e.id));
  if (missing.length > 0) {
    throw new Error(
      `KAI-219C1 FAIL-CLOSED: manifest IDs not in catalogue: ${missing.map((m) => m.id).join(", ")}`,
    );
  }

  // Partition: STATE A (all absent) vs STATE B (all already have the
  // expected fact) vs STATE C (mixed/mismatch → fail closed).
  const absent = manifest.filter((e) => !byId.get(e.id)!.admission);
  const present = manifest.filter((e) => !!byId.get(e.id)!.admission);
  const allExpected = manifest.every((e) => {
    const d = byId.get(e.id)!;
    return d.admission && factsEqual(d.admission, buildFact(e, d));
  });

  if (present.length > 0 && !allExpected) {
    const bad = manifest.filter((e) => {
      const d = byId.get(e.id)!;
      return d.admission && !factsEqual(d.admission, buildFact(e, d));
    });
    throw new Error(
      `KAI-219C1 FAIL-CLOSED: ${bad.length} candidate(s) already have a DIFFERENT admission fact (${bad
        .slice(0, 5)
        .map((b) => b.id)
        .join(", ")}). Never overwrite — fix the manifest or the facts.`,
    );
  }

  if (allExpected && absent.length === 0) {
    console.log(
      `KAI-219C1 STATE B: all ${manifest.length} candidates already carry the expected facts — validated, no changes (zero diff).`,
    );
    return;
  }

  // STATE A: author the absent candidates.
  const counts = { verified_paid: 0, variable_price: 0 };
  for (const e of absent) {
    const d = byId.get(e.id)!;
    const fact = buildFact(e, d);
    d.admission = fact;
    if (fact.state === "verified_paid") counts.verified_paid += 1;
    else counts.variable_price += 1;
  }

  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
  console.log(
    JSON.stringify({ state: "A", authored: absent.length, ...counts }, null, 2),
  );
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { buildFact, factsEqual, main as runC1Migration };
