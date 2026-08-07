/**
 * check:catalog-warnings — catalogue integrity audit + warning baseline gate.
 *
 * Runs the same pure audit as `audit:catalog-integrity` (read-only, no
 * network) and compares warning-severity findings against the committed
 * baseline (scripts/audit/catalog-warnings-baseline.json):
 *
 *   • audit errors                      → fail
 *   • new warning fingerprints          → fail (even when another warning
 *                                           was removed; the baseline is
 *                                           per-instance debt, not a total)
 *   • removed fingerprints              → pass (improvement); suggests the
 *                                           deliberate baseline update
 *   • `--update`                        → rewrite the baseline from the
 *                                           current report, but only when no
 *                                           new fingerprints exist
 *
 * Exit codes: 0 pass, 1 fail. Never writes catalogue data; --update writes
 * only the baseline file.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { runAudit, type AuditFinding } from "./audit/catalog-integrity.js";
import { loadCatalogInputs } from "./audit/catalog-inputs.js";
import {
  buildBaseline,
  compareToBaseline,
  updateBaseline,
  validateBaseline,
  warningFingerprint,
  type CatalogWarningsBaseline,
} from "./audit/catalog-baseline.js";

export const DEFAULT_BASELINE_PATH = path.join(
  "scripts",
  "audit",
  "catalog-warnings-baseline.json",
);

export interface WarningsCheckOptions {
  rootDir?: string;
  baselinePath?: string;
  update?: boolean;
}

function printFindings(label: string, findings: AuditFinding[]): void {
  for (const f of findings) {
    console.log(`  ${label} ${warningFingerprint(f)} — ${f.message}`);
  }
}

function printGuidance(): void {
  console.log(`
Baseline policy (scripts/audit/catalog-warnings-baseline.json):
  • Fingerprints are "<CODE>:<destinationId>[:<identity>]" — the identity is
    a canonical structured description of the violation (relationship key +
    referenced destination, sorted id sets, ...), so two different warnings
    never share a fingerprint even with the same code and destination.
    Messages, paths, distances and ordering never affect them, so prose
    churn cannot move the set and a warning can never be silently exchanged
    for a different one.
  • New warning identities fail the check even when the total warning count
    is unchanged; the baseline is per-violation debt with per-violation
    instance counts, never one integer.
  • Fewer instances of a fingerprint are improvements and pass. After
    verified sanitation work that removes warnings, update the baseline in
    the same PR:
        npm run check:catalog-warnings:update
    then review the scripts/audit/catalog-warnings-baseline.json diff and
    commit it. The update command refuses to run while new warning instances
    exist, so the accepted debt can only shrink.
  • Audit errors always fail. CI never regenerates the baseline.`);
}

export async function runWarningsCheck(
  options: WarningsCheckOptions = {},
): Promise<number> {
  const rootDir = options.rootDir ?? process.cwd();
  const baselinePath = path.resolve(
    rootDir,
    options.baselinePath ?? DEFAULT_BASELINE_PATH,
  );

  const { destinations, details, metaEntries } = loadCatalogInputs(rootDir);
  const report = runAudit(destinations, details, metaEntries);

  console.log(`\n🧭 Catalogue integrity audit + warning baseline`);
  console.log(`===============================================`);
  console.log(
    `Audit: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info ` +
      `(${report.scanned.destinations} destinations, ${report.scanned.detailFiles} detail files)`,
  );

  // Stage 1 — audit errors are always fatal.
  if (report.summary.errors > 0) {
    console.error(
      `\n❌ Stage failed: audit — ${report.summary.errors} error(s) found.`,
    );
    printFindings(
      "ERROR",
      report.findings.filter((f) => f.severity === "error"),
    );
    console.log(`\nReproduce locally:\n  npm run check:catalog-ci`);
    printGuidance();
    return 1;
  }

  // Stage 2 — warning baseline comparison.
  if (!fs.existsSync(baselinePath)) {
    if (options.update) {
      // Bootstrap: create the baseline from the current (triage-passed)
      // report. CI never runs --update, so this is a local-only path.
      const next = buildBaseline(report);
      const instanceCount = Object.values(next.warningFingerprints).reduce(
        (sum, n) => sum + n,
        0,
      );
      fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
      console.log(
        `\n✔ Baseline created: ${instanceCount} warning instances from the current audit.`,
      );
      console.log(`   Wrote ${baselinePath}`);
      return 0;
    }
    console.error(`\n❌ Stage failed: baseline — ${baselinePath} is missing.`);
    console.error(
      `   After triaging the warnings above, create the baseline once with:\n     npm run check:catalog-warnings:update`,
    );
    return 1;
  }

  let committed: CatalogWarningsBaseline;
  try {
    committed = JSON.parse(
      fs.readFileSync(baselinePath, "utf-8"),
    ) as CatalogWarningsBaseline;
  } catch (err) {
    console.error(
      `\n❌ Stage failed: baseline — cannot parse ${baselinePath}:`,
      (err as Error).message,
    );
    return 1;
  }
  const validationIssue = validateBaseline(committed);
  if (validationIssue) {
    console.error(`\n❌ Stage failed: baseline — ${validationIssue}`);
    return 1;
  }

  if (options.update) {
    const next = updateBaseline(report, committed);
    if ("refusal" in next) {
      console.error(`\n❌ Baseline not updated — ${next.refusal}`);
      printGuidance();
      return 1;
    }
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(next.baseline, null, 2)}\n`,
    );
    const removed = compareToBaseline(report, committed).reduced;
    console.log(
      `\n✔ Baseline updated: ${Object.values(committed.warningFingerprints).reduce((s, n) => s + n, 0)} → ${Object.values(next.baseline.warningFingerprints).reduce((s, n) => s + n, 0)} warning instances` +
        (removed.length > 0
          ? ` (${removed.length} fingerprint(s) reduced)`
          : ""),
    );
    console.log(`   Wrote ${baselinePath}`);
    console.log(`   Review the diff and commit it with the sanitation work.`);
    return 0;
  }

  const cmp = compareToBaseline(report, committed);

  // Per-code counts for reviewability.
  const currentByCode: Record<string, number> = {};
  for (const f of report.findings) {
    if (f.severity !== "warning") continue;
    currentByCode[f.code] = (currentByCode[f.code] ?? 0) + 1;
  }
  console.log(`\nWarning counts by code (baseline → now):`);
  for (const code of [
    ...new Set([
      ...Object.keys(committed.warningsByCode),
      ...Object.keys(currentByCode),
    ]),
  ].sort()) {
    const before = committed.warningsByCode[code] ?? 0;
    const after = currentByCode[code] ?? 0;
    const marker = after > before ? "  ⚠️" : after < before ? "  ✔" : "";
    console.log(`  ${code.padEnd(34)} ${before} → ${after}${marker}`);
  }

  let failed = false;
  if (cmp.added.length > 0) {
    failed = true;
    console.error(
      `\n❌ Stage failed: baseline — ${cmp.added.length} new warning instance(s) vs ${baselinePath}.`,
    );
    printFindings("NEW ", cmp.added);
  }
  if (cmp.reduced.length > 0) {
    console.log(
      `\nℹ ${cmp.reduced.length} fingerprint(s) have fewer instances than the baseline (improvement):`,
    );
    for (const fp of cmp.reduced) console.log(`  GONE ${fp}`);
    console.log(
      `   If intentional and permanent, update the committed baseline in this PR:\n     npm run check:catalog-warnings:update`,
    );
  }

  if (failed) {
    console.log(`\nReproduce locally:\n  npm run check:catalog-ci`);
    printGuidance();
    return 1;
  }

  console.log(
    `\n✔ Baseline: ${cmp.reduced.length > 0 ? "no new warning instances; " : ""}all ${report.summary.warnings} warnings are accepted debt.`,
  );
  return 0;
}

// CLI entry (guarded so check-catalog-ci.ts can import runWarningsCheck).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const update = process.argv.includes("--update");
  const code = await runWarningsCheck({ update });
  process.exit(code);
}
