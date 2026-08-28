/**
 * KAI-247 / KAI-219D2 — remaining verified-free + free-core admission cohort.
 *
 * Authors admission facts for the remaining high-confidence Free /
 * free-core records (a–m and t–z slices D1 did not fully cover), using
 * ONLY source-backed evidence (official operator/municipality/prefecture/
 * government/tourism pages).
 *
 * D2 DECISION MODEL (strict):
 *   - verified_free [0,0]: authoritative evidence EXPLICITLY states
 *     admission/entry is free (入場無料 / 拝観無料 / Admission free / Free
 *     admission / No admission fee). Uses the SHARED hasVerifiedFreeEvidence()
 *     (KAI-214) — no local free regex. verified_free is a NUMERIC ZERO
 *     CLAIM; the evidence bar is high. Never inferred from legacy 0 /
 *     "open" / park-kind / absence of ticket page.
 *   - not_applicable + free_area_with_optional_paid_components: the
 *     canonical destination can be experienced free; museums/rides/baths/
 *     shops/towers are OPTIONAL. Optional prices stay outside canonical
 *     admission (never folded into a [0,0]).
 *   - Public geography/infrastructure (island/road/intersection/promenade/
 *     district/town/coastline/plateau) with NO admission product is
 *     no_single_admission_product → DEFERRED to E2 (KAI-249), NOT authored
 *     here and NOT promoted to verified_free.
 *   - Transport (ferry/bus/train/parking/road toll/bike rental/shuttle) is
 *     NEVER admission evidence.
 *
 * Deterministic + fail-closed (same pattern as C1/D1):
 *   - Manifest (scripts/audit/kai-219d2-candidates.json) with explicit
 *     classification per record.
 *   - verified_free REQUIRES freeEvidence satisfying the shared
 *     hasVerifiedFreeEvidence() rule; not_applicable free-area REQUIRES
 *     optionalPaidNote.
 *   - Strict shared checkedAt validation (isValidCheckedAtDate).
 *   - STATE A (all absent) → author; STATE B (all expected) → validate,
 *     zero diff; STATE C: ANY absent+present mix, existing different fact,
 *     or malformed manifest → fail closed before writing. No incremental
 *     mixed-state authoring is permitted.
 *   - Never overwrites an existing fact; idempotent rerun = zero diff.
 *
 * Run: npx tsx scripts/kai-219d2-admission-cohort.ts
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
// KAI-219D1 (S3): the SINGLE shared strict-date implementation.
import { isValidCheckedAtDate } from "../src/shared/services/budget/factValidation";

const INDEX_PATH = path.resolve(
  process.env.KAI219D2_INDEX_PATH ??
    path.join(process.cwd(), "src/shared/data/destinations-index.json"),
);
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219d2-candidates.json",
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
      `KAI-219D2 FAIL-CLOSED: ${entry.id} has no source URL — refusing to classify without source-backed evidence.`,
    );
  }
  if (
    entry.classification !== "unavailable" &&
    !isValidCheckedAtDate(entry.checkedAt)
  ) {
    throw new Error(
      `KAI-219D2 FAIL-CLOSED: ${entry.id} checkedAt "${entry.checkedAt}" is not a strict YYYY-MM-DD calendar date (shared isValidCheckedAtDate).`,
    );
  }
  if (entry.classification === "verified_free") {
    if (!entry.freeEvidence) {
      throw new Error(
        `KAI-219D2 FAIL-CLOSED: ${entry.id} verified_free requires freeEvidence (official text establishing free required admission).`,
      );
    }
    // KAI-219D1 review (R1): ONE Free-evidence implementation only — the
    // SHARED hasVerifiedFreeEvidence(). If the evidence is NOT Free by that
    // rule, FAIL CLOSED — never transform non-Free evidence into Free
    // wording, never prepend/append "free admission" to pass validation.
    if (!hasVerifiedFreeEvidence(entry.freeEvidence, undefined)) {
      throw new Error(
        `KAI-219D2 FAIL-CLOSED: ${entry.id} freeEvidence does not satisfy the shared hasVerifiedFreeEvidence() rule ("${entry.freeEvidence}") — refusing verified_free.`,
      );
    }
    return {
      state: "verified_free",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: "general_entry",
      basis: entry.basis,
      sourceUrls: entry.sourceUrls,
      checkedAt: entry.checkedAt,
      reviewIntervalMonths: 12,
    };
  }
  if (entry.classification === "not_applicable_free_area") {
    if (!entry.optionalPaidNote) {
      throw new Error(
        `KAI-219D2 FAIL-CLOSED: ${entry.id} free-area requires optionalPaidNote (what the optional paid components are).`,
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
      `KAI-219D2 FAIL-CLOSED: manifest IDs not in catalogue: ${missing.map((m) => m.id).join(", ")}`,
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
      `KAI-219D2 FAIL-CLOSED STATE C: mixed manifest (${absent.length} absent + ${present.length} present) — incremental authoring is forbidden; the manifest must be all-absent (STATE A) or all-present-exact (STATE B).`,
    );
  }
  if (mismatched.length > 0) {
    throw new Error(
      `KAI-219D2 FAIL-CLOSED STATE C: ${mismatched.length} candidate(s) already have a DIFFERENT admission fact (${mismatched
        .slice(0, 5)
        .map((b) => b.id)
        .join(", ")}). Never overwrite — fix the manifest or the facts.`,
    );
  }

  // STATE B: all present + all expected → zero writes.
  if (allExpected && absent.length === 0) {
    console.log(
      `KAI-219D2 STATE B: all ${manifest.length} candidates already carry the expected facts — validated, no changes (zero diff).`,
    );
    return;
  }

  const counts = { verified_free: 0, not_applicable_free_area: 0 };
  for (const e of absent) {
    const d = byId.get(e.id)!;
    const fact = buildFact(e, d);
    d.admission = fact;
    if (fact.state === "verified_free") counts.verified_free += 1;
    else if (fact.state === "not_applicable")
      counts.not_applicable_free_area += 1;
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

export type { ManifestEntry };
export { buildFact, factsEqual, main as runD2Migration };
