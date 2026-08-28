/**
 * KAI-219D1 — verified free / free+optional admission cohort.
 *
 * Classifies admission-absent records into:
 *   - verified_free: official evidence EXPLICITLY establishes free required
 *     admission (free entry / 入場無料). [0,0] bounded + source + checkedAt.
 *   - not_applicable + free_area_with_optional_paid_components: entry itself
 *     is free AND paid activities/products are optional. Source + checkedAt
 *     + reasonCode. Optional paid components are NEVER folded into the
 *     canonical [0,0].
 *   - unavailable: free cannot be proven (no official evidence).
 *
 * Strict rules (never inferred): legacy 0, "open", park/city kind, or
 * absence of ticket info are NEVER evidence of free. A source URL is
 * REQUIRED for every source-backed classification.
 *
 * Deterministic + fail-closed (same pattern as C1):
 *   - Manifest (scripts/audit/kai-219d1-candidates.json) with explicit
 *     classification per record.
 *   - verified_free REQUIRES freeEvidence (text from the official source).
 *   - not_applicable free-area REQUIRES optionalPaidNote (what is paid).
 *   - STATE A (all absent) → author; STATE B (all already have expected
 *     fact) → validate, zero diff; STATE C (mixed/mismatch) → fail closed.
 *   - Never overwrites an existing fact; idempotent rerun = zero diff.
 *
 * Run: npx tsx scripts/kai-219d1-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Destination,
  AdmissionCostFact,
} from "../src/shared/types/destination";
// KAI-214 shared free-evidence semantics — ONE implementation (R1).
import { hasVerifiedFreeEvidence } from "../src/shared/services/budget/freeEvidence";
// KAI-219D1 (S3): the SINGLE shared strict-date implementation from
// factValidation — no second date implementation in D1.
import { isValidCheckedAtDate } from "../src/shared/services/budget/factValidation";

const INDEX_PATH = path.resolve(
  process.env.KAI219D1_INDEX_PATH ??
    path.join(process.cwd(), "src/shared/data/destinations-index.json"),
);
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219d1-candidates.json",
);

interface ManifestEntry {
  id: string;
  classification: "verified_free" | "not_applicable_free_area" | "unavailable";
  sourceUrls: string[];
  checkedAt: string;
  basis: string;
  optionalPaidNote?: string;
  freeEvidence?: string;
}

function load(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
}

function buildFact(entry: ManifestEntry, d: Destination): AdmissionCostFact {
  if (entry.classification !== "unavailable" && entry.sourceUrls.length === 0) {
    throw new Error(
      `KAI-219D1 FAIL-CLOSED: ${entry.id} has no source URL — refusing to classify without source-backed evidence.`,
    );
  }
  if (
    entry.classification !== "unavailable" &&
    !isValidCheckedAtDate(entry.checkedAt)
  ) {
    throw new Error(
      `KAI-219D1 FAIL-CLOSED: ${entry.id} checkedAt "${entry.checkedAt}" is not a strict YYYY-MM-DD calendar date (shared isValidCheckedAtDate).`,
    );
  }
  if (entry.classification === "verified_free") {
    if (!entry.freeEvidence) {
      throw new Error(
        `KAI-219D1 FAIL-CLOSED: ${entry.id} verified_free requires freeEvidence (official text establishing free required admission).`,
      );
    }
    // KAI-219D1 review (R1): ONE Free-evidence implementation only — the
    // SHARED hasVerifiedFreeEvidence() (KAI-214 semantics used at runtime
    // and in authoring CI). If the evidence is NOT Free by that rule,
    // FAIL CLOSED — never transform non-Free evidence into Free wording,
    // never prepend/append "free admission" to make validation pass.
    if (!hasVerifiedFreeEvidence(entry.freeEvidence)) {
      throw new Error(
        `KAI-219D1 FAIL-CLOSED: ${entry.id} freeEvidence does not satisfy the shared hasVerifiedFreeEvidence() rule ("${entry.freeEvidence}") — refusing verified_free.`,
      );
    }
    return {
      state: "verified_free",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: "general_entry",
      // Honest source-derived basis — the original manifest basis, no
      // appended "free admission" filler.
      basis: entry.basis,
      sourceUrls: entry.sourceUrls,
      checkedAt: entry.checkedAt,
      reviewIntervalMonths: 12,
    };
  }
  if (entry.classification === "not_applicable_free_area") {
    if (!entry.optionalPaidNote) {
      throw new Error(
        `KAI-219D1 FAIL-CLOSED: ${entry.id} free-area requires optionalPaidNote (what the optional paid components are).`,
      );
    }
    return {
      state: "not_applicable",
      provenance: "verified_source",
      reasonCode: "free_area_with_optional_paid_components",
      cost: { kind: "not_applicable" },
      scope: "open_area",
      basis: entry.basis,
      sourceUrls: entry.sourceUrls,
      checkedAt: entry.checkedAt,
    };
  }
  // unavailable
  return {
    state: "unavailable",
    provenance: "none",
    reasonCode: "legacy_provenance_unrecovered",
    cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
    scope: "general_entry",
    basis: entry.basis,
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

  const missing = manifest.filter((e) => !byId.has(e.id));
  if (missing.length > 0) {
    throw new Error(
      `KAI-219D1 FAIL-CLOSED: manifest IDs not in catalogue: ${missing.map((m) => m.id).join(", ")}`,
    );
  }

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
      `KAI-219D1 FAIL-CLOSED: ${bad.length} candidate(s) already have a DIFFERENT admission fact (${bad
        .slice(0, 5)
        .map((b) => b.id)
        .join(", ")}). Never overwrite.`,
    );
  }

  if (allExpected && absent.length === 0) {
    console.log(
      `KAI-219D1 STATE B: all ${manifest.length} candidates already carry the expected facts — validated, no changes (zero diff).`,
    );
    return;
  }

  const counts = {
    verified_free: 0,
    not_applicable_free_area: 0,
    unavailable: 0,
  };
  for (const e of absent) {
    const d = byId.get(e.id)!;
    const fact = buildFact(e, d);
    d.admission = fact;
    if (fact.state === "verified_free") counts.verified_free += 1;
    else if (fact.state === "not_applicable")
      counts.not_applicable_free_area += 1;
    else counts.unavailable += 1;
  }

  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
  console.log(
    JSON.stringify({ state: "A", authored: absent.length, ...counts }, null, 2),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export type { ManifestEntry };
export { buildFact, factsEqual, main as runD1Migration };
