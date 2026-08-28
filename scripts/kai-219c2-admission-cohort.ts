/**
 * KAI-246 / KAI-219C2 — remaining fixed-paid attractions admission cohort.
 *
 * Authors verified_paid admission facts for the remaining CLEAR fixed-paid
 * attraction candidates identified by the read-only C2 investigation
 * (official operator/municipality/prefecture/government/tourism pages).
 *
 * Deterministic + fail-closed (same pattern as C1):
 *   - The candidate manifest is a committed JSON (scripts/audit/kai-219c2-
 *     candidates.json) with {id, jpy, scope, sourceUrls, checkedAt, basis}.
 *   - verified_paid: ONLY jpy allowed (a scalar). min/max are forbidden —
 *     a scalar fact can never carry a range (variable facts go to E1).
 *   - Each candidate MUST currently be admission-absent; if a candidate
 *     already has a fact → FAIL CLOSED (never overwrite).
 *   - A source URL is required for every source-backed classification.
 *   - Strict shared checkedAt validation (isValidCheckedAtDate from
 *     factValidation — single implementation, KAI-219D1 S3 rule).
 *   - Idempotent: re-running on already-migrated data validates STATE B
 *     (all expected facts present → exit 0 → zero diff).
 *
 * Run: npx tsx scripts/kai-219c2-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Destination,
  AdmissionCostFact,
} from "../src/shared/types/destination";
// KAI-219D1 (S3): the SINGLE shared strict-date implementation from
// factValidation — no second date implementation in C2.
import { isValidCheckedAtDate } from "../src/shared/services/budget/factValidation";

const INDEX_PATH = path.resolve(
  process.env.KAI219C2_INDEX_PATH ??
    path.join(process.cwd(), "src/shared/data/destinations-index.json"),
);
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219c2-candidates.json",
);

interface ManifestEntry {
  id: string;
  jpy?: number;
  scope: string;
  sourceUrls: string[];
  checkedAt: string;
  basis: string;
}

function load(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
}

function buildFact(entry: ManifestEntry, d: Destination): AdmissionCostFact {
  if (entry.sourceUrls.length === 0) {
    throw new Error(
      `KAI-219C2 FAIL-CLOSED: ${entry.id} has no source URL — refusing to author without source-backed evidence.`,
    );
  }
  if (!isValidCheckedAtDate(entry.checkedAt)) {
    throw new Error(
      `KAI-219C2 FAIL-CLOSED: ${entry.id} checkedAt "${entry.checkedAt}" is not a strict YYYY-MM-DD calendar date (shared isValidCheckedAtDate).`,
    );
  }
  // verified_paid: ONLY jpy allowed (a scalar). min/max are forbidden —
  // a variable/range fact belongs to E1 (KAI-248), never a scalar C2 fact.
  const hasRange = entry.jpy === undefined;
  if (hasRange) {
    throw new Error(
      `KAI-219C2 FAIL-CLOSED: ${entry.id} verified_paid requires a scalar jpy — min/max (variable) facts belong to E1, never C2.`,
    );
  }
  if (entry.jpy === undefined || entry.jpy <= 0) {
    throw new Error(
      `KAI-219C2 FAIL-CLOSED: ${entry.id} verified_paid requires a positive adult general-entry price (jpy).`,
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
      `KAI-219C2 FAIL-CLOSED: manifest IDs not in catalogue: ${missing.map((m) => m.id).join(", ")}`,
    );
  }

  // Canonical STATE contract (stack-wide, no incremental authoring):
  //   STATE A: ALL manifest candidates admission-absent → author.
  //   STATE B: ALL candidates already contain EXACT expected facts →
  //            validate → zero writes → exit 0.
  //   STATE C: ANY mixture of absent + present, OR a present entry with a
  //            DIFFERENT fact, OR malformed manifest → FAIL CLOSED BEFORE
  //            WRITING. Incremental mixed-state authoring is FORBIDDEN.
  const absent = manifest.filter((e) => !byId.get(e.id)!.admission);
  const present = manifest.filter((e) => !!byId.get(e.id)!.admission);
  const mismatched = present.filter((e) => {
    const d = byId.get(e.id)!;
    return !factsEqual(d.admission, buildFact(e, d));
  });
  const allExpected = manifest.every((e) => {
    const d = byId.get(e.id)!;
    return d.admission && factsEqual(d.admission, buildFact(e, d));
  });

  // STATE C — ANY mixture (absent + present, even if the present ones
  // match) OR a different fact fails closed before any write.
  if (absent.length > 0 && present.length > 0) {
    throw new Error(
      `KAI-219C2 FAIL-CLOSED STATE C: mixed manifest (${absent.length} absent + ${present.length} present) — incremental authoring is forbidden; the manifest must be all-absent (STATE A) or all-present-exact (STATE B).`,
    );
  }
  if (mismatched.length > 0) {
    throw new Error(
      `KAI-219C2 FAIL-CLOSED STATE C: ${mismatched.length} candidate(s) already have a DIFFERENT admission fact (${mismatched
        .slice(0, 5)
        .map((b) => b.id)
        .join(", ")}). Never overwrite — fix the manifest or the facts.`,
    );
  }

  // STATE B: all present + all expected → zero writes.
  if (allExpected && absent.length === 0) {
    console.log(
      `KAI-219C2 STATE B: all ${manifest.length} candidates already carry the expected facts — validated, no changes (zero diff).`,
    );
    return;
  }

  // STATE A: ALL absent → author every candidate.
  let authored = 0;
  for (const e of absent) {
    const d = byId.get(e.id)!;
    d.admission = buildFact(e, d);
    authored += 1;
  }

  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
  console.log(
    JSON.stringify({ state: "A", authored, verified_paid: authored }, null, 2),
  );
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export type { ManifestEntry };
export { buildFact, factsEqual, main as runC2Migration };
