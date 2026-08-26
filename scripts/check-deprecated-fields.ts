/**
 * check-deprecated-fields — KAI-218A no-new-debt ratchet for deprecated
 * generic budget-field authoring.
 *
 * Reads the committed catalogue (destinations-index.json), counts how many
 * records still AUTHOR the deprecated fields (budgetMin/budgetRecommended/
 * budgetMax + budgetBreakdown.{transport,food,cafe}), and compares against
 * the committed baseline (scripts/audit/deprecated-fields-baseline.json).
 *
 *   • current <= baseline  → pass (shrink-only: flat or improvement)
 *   • current > baseline   → fail (new deprecated-field debt)
 *   • `--update`           → rewrite the baseline from the current counts,
 *                            but REFUSES when any count grew (shrink-only)
 *
 * Exit codes: 0 pass, 1 fail. Never writes catalogue data; --update writes
 * only the baseline file. Wired into check:catalog-ci.
 */

import fs from "fs";
import path from "path";
import { loadCatalogInputs } from "./audit/catalog-inputs.js";
import { countDeprecatedFieldAuthors } from "./audit/deprecated-field-authors.js";

// Relative to the repo root (matching check-catalog-warnings.ts).
const BASELINE_PATH = path.join(
  "scripts",
  "audit",
  "deprecated-fields-baseline.json",
);

function resolveBaselinePath(rootDir: string): string {
  return path.resolve(rootDir, BASELINE_PATH);
}

interface Baseline {
  schemaVersion: number;
  counts: {
    rangeWriters: number;
    breakdownWriters: number;
    transportOrFoodOrCafeWriters: number;
  };
}

function writeBaseline(baseline: Baseline, baselinePath: string): void {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(baseline, null, 2)}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const update = process.argv.includes("--update");
  const rootDir = process.cwd();
  const baselinePath = resolveBaselinePath(rootDir);

  const inputs = await loadCatalogInputs(rootDir);
  const counts = countDeprecatedFieldAuthors(inputs.destinations);

  let baseline: Baseline;
  try {
    const raw = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as Baseline;
    // Validate the baseline shape: a malformed baseline must FAIL (never
    // silently rewritten to the current counts — that would let the
    // baseline be raised by accident).
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.schemaVersion !== "number" ||
      !raw.counts ||
      typeof raw.counts.rangeWriters !== "number" ||
      typeof raw.counts.breakdownWriters !== "number" ||
      typeof raw.counts.transportOrFoodOrCafeWriters !== "number"
    ) {
      console.error(
        `[deprecated-fields] FAIL: baseline at ${baselinePath} is missing or malformed.\n` +
          `  Commit a valid baseline (schemaVersion 1 + counts). A missing/malformed\n` +
          `  baseline must never be silently rewritten — that would fail the ratchet open.`,
      );
      process.exit(1);
    }
    baseline = raw;
  } catch {
    console.error(
      `[deprecated-fields] FAIL: baseline at ${baselinePath} is missing or unreadable.\n` +
        `  Commit a valid baseline (schemaVersion 1 + counts). A missing baseline\n` +
        `  must never be silently rewritten — that would fail the ratchet open.`,
    );
    process.exit(1);
  }

  const grew =
    counts.rangeWriters > baseline.counts.rangeWriters ||
    counts.breakdownWriters > baseline.counts.breakdownWriters ||
    counts.transportOrFoodOrCafeWriters >
      baseline.counts.transportOrFoodOrCafeWriters;

  if (update) {
    if (grew) {
      console.error(
        `[deprecated-fields] REFUSED: deprecated-field authoring GREW (baseline ${JSON.stringify(
          baseline.counts,
        )} → current ${JSON.stringify({
          rangeWriters: counts.rangeWriters,
          breakdownWriters: counts.breakdownWriters,
          transportOrFoodOrCafeWriters: counts.transportOrFoodOrCafeWriters,
        })}). Shrink-only: fix the new debt, do not raise the baseline.`,
      );
      process.exit(1);
    }
    writeBaseline(
      {
        schemaVersion: baseline.schemaVersion,
        counts: {
          rangeWriters: counts.rangeWriters,
          breakdownWriters: counts.breakdownWriters,
          transportOrFoodOrCafeWriters: counts.transportOrFoodOrCafeWriters,
        },
      },
      baselinePath,
    );
    console.log(
      `[deprecated-fields] baseline updated (shrink-only): ${JSON.stringify(
        baseline.counts,
      )} → ${JSON.stringify({
        rangeWriters: counts.rangeWriters,
        breakdownWriters: counts.breakdownWriters,
        transportOrFoodOrCafeWriters: counts.transportOrFoodOrCafeWriters,
      })}`,
    );
    return;
  }

  if (grew) {
    console.error(
      `[deprecated-fields] FAIL: deprecated-field authoring GREW beyond baseline.\n` +
        `  baseline: ${JSON.stringify(baseline.counts)}\n` +
        `  current:  ${JSON.stringify({
          rangeWriters: counts.rangeWriters,
          breakdownWriters: counts.breakdownWriters,
          transportOrFoodOrCafeWriters: counts.transportOrFoodOrCafeWriters,
        })}\n` +
        `  KAI-218 retirement contract: new/changed destinations must author scoped\n` +
        `  cost facts (admission/localTransport), never the generic budget fields.\n` +
        `  Run with --update ONLY after removing the new debt (shrink-only).`,
    );
    process.exit(1);
  }

  console.log(
    `[deprecated-fields] OK (shrink-only flat/improved): ${JSON.stringify({
      rangeWriters: counts.rangeWriters,
      breakdownWriters: counts.breakdownWriters,
      transportOrFoodOrCafeWriters: counts.transportOrFoodOrCafeWriters,
    })} (baseline ${JSON.stringify(baseline.counts)})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
