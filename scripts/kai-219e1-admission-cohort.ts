/**
 * KAI-248 / KAI-219E1 — variable / date / product-dependent admission cohort.
 *
 * Authors variable_price admission facts for records whose CURRENT official
 * adult general-admission price genuinely varies (by date/season/product),
 * WITHOUT flattening the variability into false scalar precision.
 *
 * E1 RULES:
 *   - BOUNDED VARIABLE (verified official min+max): state variable_price,
 *     provenance verified_source, cost {kind:"bounded", min, max},
 *     reasonCode price_variable_by_date | price_variable_by_product |
 *     seasonal_pricing (only schema-supported codes). Preserve the WHOLE
 *     current normal range — never pick most-expensive / cheapest / midpoint.
 *   - OPEN ENDED: when the authoritative source only establishes "from ¥X"
 *     and no defensible upper bound exists, preserve as
 *     cost {kind:"open_ended", from} — never convert "from ¥1,000" into
 *     [1000,1000]. Open-ended remains partial/non-strict for affordability.
 *   - Never: jpy scalar for variable (a point estimate is forbidden);
 *     fabricated bounds; converting open-ended to bounded.
 *
 * Deterministic + fail-closed (same pattern as C1/C2/D1/D2):
 *   - Manifest (scripts/audit/kai-219e1-candidates.json) with explicit
 *     state / min+max OR openEndedFrom / reasonCode / scope / sourceUrls /
 *     checkedAt / basis per record.
 *   - Strict shared checkedAt validation (isValidCheckedAtDate).
 *   - STATE A (all absent) → author; STATE B (all expected) → validate,
 *     zero diff; STATE C: ANY absent+present mix, existing different fact,
 *     or malformed manifest → fail closed before writing. No incremental
 *     mixed-state authoring is permitted.
 *   - Never overwrites; idempotent rerun = zero diff.
 *
 * Run: npx tsx scripts/kai-219e1-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Destination,
  AdmissionCostFact,
} from "../src/shared/types/destination";
// KAI-219D1 (S3): the SINGLE shared strict-date implementation.
import { isValidCheckedAtDate } from "../src/shared/services/budget/factValidation";

const INDEX_PATH = path.resolve(
  process.env.KAI219E1_INDEX_PATH ??
    path.join(process.cwd(), "src/shared/data/destinations-index.json"),
);
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219e1-candidates.json",
);

interface ManifestEntry {
  id: string;
  state?: "variable_price";
  min?: number;
  max?: number;
  openEndedFrom?: number;
  reasonCode?:
    "price_variable_by_date" | "price_variable_by_product" | "seasonal_pricing";
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
      `KAI-219E1 FAIL-CLOSED: ${entry.id} has no source URL — refusing to author without source-backed evidence.`,
    );
  }
  if (!isValidCheckedAtDate(entry.checkedAt)) {
    throw new Error(
      `KAI-219E1 FAIL-CLOSED: ${entry.id} checkedAt "${entry.checkedAt}" is not a strict YYYY-MM-DD calendar date (shared isValidCheckedAtDate).`,
    );
  }
  const state = entry.state ?? "variable_price";
  if (state !== "variable_price") {
    throw new Error(
      `KAI-219E1 FAIL-CLOSED: ${entry.id} unsupported state ${state} — only variable_price is valid in E1.`,
    );
  }
  const reasonCode = entry.reasonCode;
  if (
    reasonCode !== "price_variable_by_date" &&
    reasonCode !== "price_variable_by_product" &&
    reasonCode !== "seasonal_pricing"
  ) {
    throw new Error(
      `KAI-219E1 FAIL-CLOSED: ${entry.id} variable_price requires explicit schema-supported reasonCode (price_variable_by_date | price_variable_by_product | seasonal_pricing), got ${reasonCode ?? "none"}.`,
    );
  }
  const hasRange = entry.min !== undefined || entry.max !== undefined;
  const hasOpenEnded = entry.openEndedFrom !== undefined;

  if (hasRange) {
    if (entry.min === undefined || entry.max === undefined) {
      throw new Error(
        `KAI-219E1 FAIL-CLOSED: ${entry.id} bounded variable requires BOTH min and max (official bounded range).`,
      );
    }
    if (entry.min < 0 || entry.max < entry.min) {
      throw new Error(
        `KAI-219E1 FAIL-CLOSED: ${entry.id} invalid bounded range [${entry.min}, ${entry.max}] — min>=0 and max>=min required.`,
      );
    }
    if (hasOpenEnded) {
      throw new Error(
        `KAI-219E1 FAIL-CLOSED: ${entry.id} cannot supply BOTH min/max and openEndedFrom — one value shape only.`,
      );
    }
    return {
      state: "variable_price",
      provenance: "verified_source",
      reasonCode,
      cost: { kind: "bounded", min: entry.min, max: entry.max },
      scope: entry.scope as "general_entry",
      basis: entry.basis,
      sourceUrls: entry.sourceUrls,
      checkedAt: entry.checkedAt,
      reviewIntervalMonths: 12,
    };
  }

  if (hasOpenEnded) {
    if (entry.openEndedFrom < 0) {
      throw new Error(
        `KAI-219E1 FAIL-CLOSED: ${entry.id} open_ended 'from' must be finite non-negative.`,
      );
    }
    return {
      state: "variable_price",
      provenance: "verified_source",
      reasonCode,
      cost: { kind: "open_ended", from: entry.openEndedFrom },
      scope: entry.scope as "general_entry",
      basis: entry.basis,
      sourceUrls: entry.sourceUrls,
      checkedAt: entry.checkedAt,
      reviewIntervalMonths: 12,
    };
  }

  throw new Error(
    `KAI-219E1 FAIL-CLOSED: ${entry.id} variable_price requires min+max (bounded) OR openEndedFrom (open-ended) — never a bare scalar.`,
  );
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
      `KAI-219E1 FAIL-CLOSED: manifest IDs not in catalogue: ${missing.map((m) => m.id).join(", ")}`,
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
      `KAI-219E1 FAIL-CLOSED STATE C: mixed manifest (${absent.length} absent + ${present.length} present) — incremental authoring is forbidden; the manifest must be all-absent (STATE A) or all-present-exact (STATE B).`,
    );
  }
  if (mismatched.length > 0) {
    throw new Error(
      `KAI-219E1 FAIL-CLOSED STATE C: ${mismatched.length} candidate(s) already have a DIFFERENT admission fact (${mismatched
        .slice(0, 5)
        .map((b) => b.id)
        .join(", ")}). Never overwrite — fix the manifest or the facts.`,
    );
  }

  // STATE B: all present + all expected → zero writes.
  if (allExpected && absent.length === 0) {
    console.log(
      `KAI-219E1 STATE B: all ${manifest.length} candidates already carry the expected facts — validated, no changes (zero diff).`,
    );
    return;
  }

  let authored = 0;
  for (const e of absent) {
    const d = byId.get(e.id)!;
    d.admission = buildFact(e, d);
    authored += 1;
  }

  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
  console.log(
    JSON.stringify({ state: "A", authored, variable_price: authored }, null, 2),
  );
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export type { ManifestEntry };
export { buildFact, factsEqual, main as runE1Migration };
