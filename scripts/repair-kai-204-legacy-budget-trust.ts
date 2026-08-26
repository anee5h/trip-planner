/**
 * KAI-204 Phase 3 — deterministic legacy budget provenance tagging.
 *
 * Tags every record that carries numeric budget values WITHOUT trustworthy
 * provenance with an explicit `budgetMetadata.method = "legacy"` marker:
 *
 *   - numeric budget fields exist (min/rec/max and/or breakdown);
 *   - budgetMetadata is absent;
 *   - NOT hub-class (kind city/ward/town/village or role hub — those have
 *     the documented tickets=0 class convention, a different trust story);
 *   - NOT ledger-backed (ticketEvidence — already repaired in Phase 2);
 *   - NOT ambiguous-evidence kind (already left unknown in Phase 2).
 *
 * The `legacy` marker means: "numbers exist in storage for historical/
 * migration/debugging value, but their provenance is UNKNOWN and they must
 * NOT be consumed as trusted by display/scoring/filtering/planning." This
 * separates STORAGE from TRUST (the numbers are preserved, consumption is
 * gated at the semantic boundary by the runtime trust helpers).
 *
 * Deterministic and idempotent: a second run produces zero diff.
 *
 * Run:
 *   npx tsx scripts/repair-kai-204-legacy-budget-trust.ts --check  (preview)
 *   npx tsx scripts/repair-kai-204-legacy-budget-trust.ts           (write)
 */

import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../src/shared/types/destination";

const rootDir = process.cwd();
const indexPath = path.join(rootDir, "src/shared/data/destinations-index.json");
const truthPath = path.join(
  rootDir,
  "scripts/audit/kai-89-calibration-truth.json",
);

const HUB_KINDS = new Set(["city", "ward", "town", "village"]);

const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];
const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as {
  ticketEvidence?: Record<string, { jpy?: number; kind?: string }>;
};
const ticket = truth.ticketEvidence ?? {};

const AMBIGUOUS_KINDS = new Set([
  "FIXED_PAID_WITH_BUNDLE",
  "FIXED_ENTRY_PLUS_ACTIVITIES",
  "FREE_AREA_SEPARATE_PAID_FACILITIES",
  "FREE_ENTRY_PAID_EXPERIENCES",
  "FREE_ENTRY_PAY_PER_RIDE",
  "FREE_ENTRY_PURCHASES_VARIABLE",
  "FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL",
]);

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function hasNumericBudget(d: Destination): boolean {
  return (
    [d.budgetMin, d.budgetMax, d.budgetRecommended].some(isFiniteNonNegative) ||
    Boolean(
      d.budgetBreakdown &&
      ["transport", "tickets", "food", "cafe"].some((k) =>
        isFiniteNonNegative((d.budgetBreakdown as Record<string, unknown>)[k]),
      ),
    )
  );
}

const isHub = (d: Destination): boolean =>
  HUB_KINDS.has(d.kind ?? "") || d.role === "hub";

// ---- Classify the legacy cohort ----
const tagged: string[] = [];
const skipped: Array<{ id: string; reason: string }> = [];

for (const d of destinations) {
  if (d.budgetMetadata) continue; // already has provenance
  if (!hasNumericBudget(d)) continue; // nothing to tag
  if (isHub(d)) {
    skipped.push({ id: d.id, reason: "hub-class (convention, not legacy)" });
    continue;
  }
  const ev = ticket[d.id];
  if (ev && !AMBIGUOUS_KINDS.has(ev.kind ?? "")) {
    skipped.push({
      id: d.id,
      reason: `ledger-backed (${ev.kind ?? "?"}) — Phase 2 repaired`,
    });
    continue;
  }
  if (ev && AMBIGUOUS_KINDS.has(ev.kind ?? "")) {
    // Ambiguous ledger evidence (bundle/activities/free-area kinds): the
    // record's numbers are legacy and NOT trustworthy — the ledger itself
    // flags the product ambiguity (e.g. "Do not use View Land fee as
    // Amanohashidate site admission"). Tag legacy so the numbers stop
    // behaving as verified.
    skipped.push({
      id: d.id,
      reason: `ambiguous-ledger (${ev.kind ?? "?"}) — tagging legacy (numbers not trusted)`,
    });
    // fall through to tag
  }
  d.budgetMetadata = {
    method: "legacy",
    confidence: "unknown",
    basis:
      "legacy numeric budget without recoverable provenance (KAI-204 phase 3); numbers preserved for storage, not trusted for consumption",
  };
  tagged.push(d.id);
}

const out = `${JSON.stringify(destinations, null, 2)}\n`;

if (process.argv.includes("--check")) {
  console.log(`KAI-204 legacy trust tagging preview (--check, no writes)`);
  console.log(`would tag ${tagged.length} records as legacy`);
  console.log(`skipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  ${s.id} — ${s.reason}`);
} else {
  fs.writeFileSync(indexPath, out);
  console.log(
    `KAI-204 legacy tagging applied: ${tagged.length} records tagged legacy`,
  );
  console.log(
    `skipped ${skipped.length}: ${skipped.map((s) => s.id).join(", ")}`,
  );
}
