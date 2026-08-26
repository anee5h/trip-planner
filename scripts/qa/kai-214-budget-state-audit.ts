/**
 * KAI-214 — deterministic budget-state taxonomy audit.
 *
 * Assigns every catalogue destination exactly ONE normalized budget state
 * (per budgetState.ts normalizeBudgetState) and reports:
 *   - by VALUE STATE (paid / free / estimate / variable / not-applicable /
 *     unavailable / legacy)
 *   - by PROVENANCE (verified-source / model / legacy / none / transitional)
 *   - invalid combinations (contradictory state+provenance, numeric-without-
 *     provenance, zero-without-free-evidence, etc.)
 *
 * The totals reconcile exactly to the current catalogue size (dynamic —
 * never hardcoded).
 *
 * Run:
 *   npx tsx scripts/qa/kai-214-budget-state-audit.ts          (human)
 *   npx tsx scripts/qa/kai-214-budget-state-audit.ts --json   (machine)
 * Deterministic: two runs produce byte-identical JSON (except generatedAt).
 */

import fs from "node:fs";
import path from "node:path";
import type {
  BudgetProvenance,
  BudgetReasonCode,
  BudgetValueState,
  Destination,
} from "../../src/shared/types/destination";
import { normalizeBudgetState } from "../../src/shared/services/budget/budgetState";

const rootDir = process.cwd();
const indexPath = path.join(rootDir, "src/shared/data/destinations-index.json");
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];

const isFiniteNonNegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

interface InvalidCombo {
  id: string;
  code: string;
  detail: string;
}

const invalids: InvalidCombo[] = [];

// ---- per-record normalized state ----
interface StateRecord {
  id: string;
  state: BudgetValueState;
  provenance: BudgetProvenance;
  reasonCode?: BudgetReasonCode;
  trustLevel: string;
  sourceMethod: string;
}

const records: StateRecord[] = [];

for (const d of destinations) {
  const n = normalizeBudgetState(d);

  // ---- invalid combination checks (KAI-214 hard contract) ----
  const bm = d.budgetMetadata;
  const hasNums =
    d.budgetMin !== undefined ||
    d.budgetRecommended !== undefined ||
    d.budgetMax !== undefined ||
    d.budgetBreakdown !== undefined;

  // numeric-without-provenance (absent metadata + numbers)
  if (!bm && hasNums) {
    invalids.push({
      id: d.id,
      code: "NUMERIC_WITHOUT_PROVENANCE",
      detail: "numeric budget fields with absent budgetMetadata",
    });
  }
  // trusted state with absent provenance
  if (
    bm?.state &&
    (bm.state === "verified_paid" || bm.state === "verified_free") &&
    !bm.provenance
  ) {
    invalids.push({
      id: d.id,
      code: "TRUSTED_STATE_WITHOUT_PROVENANCE",
      detail: `state ${bm.state} requires explicit provenance`,
    });
  }
  // verified free without evidence
  if (bm?.state === "verified_free" && !/free|無料/i.test(bm.basis ?? "")) {
    invalids.push({
      id: d.id,
      code: "VERIFIED_FREE_WITHOUT_EVIDENCE",
      detail: "verified_free state requires free evidence in basis",
    });
  }
  // legacy with trusted confidence
  if (bm?.method === "legacy" && bm.confidence === "high") {
    invalids.push({
      id: d.id,
      code: "LEGACY_WITH_TRUSTED_CONFIDENCE",
      detail: "legacy must never carry high confidence",
    });
  }
  // unavailable with trusted numeric fields
  if (
    (bm?.state === "unavailable" || bm?.method === "unknown") &&
    hasNums &&
    !["legacy"].includes(bm?.method ?? "")
  ) {
    // unknown + numbers is already an error in the KAI-89 two-truths rule;
    // state unavailable + numbers is contradictory unless legacy
    invalids.push({
      id: d.id,
      code: "UNAVAILABLE_WITH_NUMERIC",
      detail: "unavailable state coexists with numeric budget fields",
    });
  }
  // invalid range ordering
  if (
    isFiniteNonNegative(d.budgetMin) &&
    isFiniteNonNegative(d.budgetMax) &&
    d.budgetMin > d.budgetMax
  ) {
    invalids.push({
      id: d.id,
      code: "INVALID_RANGE_ORDER",
      detail: `budgetMin ${d.budgetMin} > budgetMax ${d.budgetMax}`,
    });
  }
  // NaN/negative
  for (const [k, v] of Object.entries({
    budgetMin: d.budgetMin,
    budgetRecommended: d.budgetRecommended,
    budgetMax: d.budgetMax,
  })) {
    if (v !== undefined && (Number.isNaN(v) || v < 0)) {
      invalids.push({
        id: d.id,
        code: "NON_FINITE_OR_NEGATIVE",
        detail: `${k}=${v}`,
      });
    }
  }
  // zero without free evidence (min=0 && max=0 without manual/model free)
  if (
    d.budgetMin === 0 &&
    d.budgetMax === 0 &&
    !["manual", "model"].includes(bm?.method ?? "")
  ) {
    invalids.push({
      id: d.id,
      code: "ZERO_WITHOUT_FREE_EVIDENCE",
      detail: "min=0/max=0 without trusted provenance",
    });
  }

  records.push({
    id: d.id,
    state: n.state,
    provenance: n.provenance,
    reasonCode: n.reasonCode,
    trustLevel: n.trustLevel,
    sourceMethod: n.sourceMethod,
  });
}

// ---- aggregate ----
const byState: Record<string, number> = {};
const byProvenance: Record<string, number> = {};
const byReason: Record<string, number> = {};
const byTrust: Record<string, number> = {};
const byMethod: Record<string, number> = {};
for (const r of records) {
  byState[r.state] = (byState[r.state] ?? 0) + 1;
  byProvenance[r.provenance] = (byProvenance[r.provenance] ?? 0) + 1;
  if (r.reasonCode) byReason[r.reasonCode] = (byReason[r.reasonCode] ?? 0) + 1;
  byTrust[r.trustLevel] = (byTrust[r.trustLevel] ?? 0) + 1;
  byMethod[r.sourceMethod] = (byMethod[r.sourceMethod] ?? 0) + 1;
}

const total = records.length;
const reconciled = Object.values(byState).reduce((a, b) => a + b, 0);
if (reconciled !== total) {
  throw new Error(
    `KAI-214 audit reconciliation FAILED: states sum ${reconciled} != catalogue ${total}`,
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  total,
  byState,
  byProvenance,
  byReason,
  byTrust,
  byMethod,
  invalidCombinations: invalids,
  invalidCount: invalids.length,
  reconciled: reconciled === total,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log("KAI-214 budget-state taxonomy audit");
  console.log("====================================");
  console.log(`total catalogue: ${total}`);
  console.log("\nby VALUE STATE:");
  for (const [k, v] of Object.entries(byState).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log("\nby PROVENANCE:");
  for (const [k, v] of Object.entries(byProvenance).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log("\nby TRUST LEVEL:");
  for (const [k, v] of Object.entries(byTrust).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log("\nby reason code:");
  for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }
  console.log("\ninvalid combinations:", invalids.length);
  for (const inv of invalids.slice(0, 20)) {
    console.log(`  [${inv.code}] ${inv.id} — ${inv.detail}`);
  }
  if (invalids.length > 20) {
    console.log(`  ... and ${invalids.length - 20} more`);
  }
  console.log(`\nreconciled: ${reconciled} === ${total} ✓`);
}
