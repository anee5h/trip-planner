/**
 * Catalogue warning baseline — pure comparison and update logic.
 *
 * The baseline (scripts/audit/catalog-warnings-baseline.json) is the
 * committed ledger of warning-severity findings accepted on `main`.
 *
 * BASELINE-001: A fingerprint is "<CODE>:<targetId>". Messages, paths,
 *               distances, timestamps, and ordering are deliberately
 *               excluded, so unrelated prose churn can never move the set.
 * BASELINE-002: The baseline is per-record debt with per-record instance
 *               counts (a record can carry several findings of one code,
 *               e.g. one REL_CROSS_PREFECTURE_REF per relationship key).
 *               A fingerprint with more instances than the baseline records
 *               fails even when another warning was removed, so neither the
 *               "same total count" nor the "same record, extra instance"
 *               loophole exists.
 * BASELINE-003: Fewer instances of a fingerprint is an improvement and
 *               passes; the update command refuses to run while any
 *               fingerprint has MORE instances than the baseline, so the
 *               accepted debt can only shrink (monotone non-increasing).
 * BASELINE-004: CI never writes the baseline file. Only the explicit
 *               `check:catalog-warnings --update` command may rewrite it,
 *               and only for removals.
 */

import type { AuditFinding, AuditReport } from "./catalog-integrity.js";

export const CATALOG_BASELINE_SCHEMA_VERSION = 1;

export interface CatalogWarningsBaseline {
  schemaVersion: number;
  /** Audit error count allowed on main. Must be 0; kept for reviewability. */
  errors: number;
  /** Warning counts per finding code (warning severity only). */
  warningsByCode: Record<string, number>;
  /** Per-record instance counts: "<CODE>:<targetId>" → number of findings. */
  warningFingerprints: Record<string, number>;
}

export function warningFingerprint(finding: AuditFinding): string {
  return `${finding.code}:${finding.targetId}`;
}

export function buildBaseline(report: AuditReport): CatalogWarningsBaseline {
  const warnings = report.findings.filter((f) => f.severity === "warning");
  const warningsByCode: Record<string, number> = {};
  const fingerprints: Record<string, number> = {};
  for (const w of warnings) {
    warningsByCode[w.code] = (warningsByCode[w.code] ?? 0) + 1;
    const fp = warningFingerprint(w);
    fingerprints[fp] = (fingerprints[fp] ?? 0) + 1;
  }
  return {
    schemaVersion: CATALOG_BASELINE_SCHEMA_VERSION,
    errors: report.summary.errors,
    warningsByCode,
    warningFingerprints: Object.fromEntries(
      Object.entries(fingerprints).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export interface BaselineComparison {
  /** Audit error findings in the current report (always fatal). */
  errors: number;
  /**
   * Warning instances beyond the baseline count for their fingerprint
   * (always fatal). Sorted like audit findings.
   */
  added: AuditFinding[];
  /** Fingerprints with FEWER instances than the baseline (improvements). */
  reduced: string[];
}

export function compareToBaseline(
  report: AuditReport,
  baseline: CatalogWarningsBaseline,
): BaselineComparison {
  const warnings = report.findings
    .filter((f) => f.severity === "warning")
    .sort(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        a.targetId.localeCompare(b.targetId) ||
        a.message.localeCompare(b.message),
    );

  // Baseline instance counts per fingerprint; unknown fingerprints count 0.
  const baselineCounts = new Map<string, number>(
    Object.entries(baseline.warningFingerprints),
  );
  const currentCounts = new Map<string, number>();
  for (const w of warnings) {
    const fp = warningFingerprint(w);
    currentCounts.set(fp, (currentCounts.get(fp) ?? 0) + 1);
  }

  // A finding is "added" when it is an instance beyond the baseline count
  // for its fingerprint (the Nth instance where N > baseline count).
  const added: AuditFinding[] = [];
  const seen = new Map<string, number>();
  for (const w of warnings) {
    const fp = warningFingerprint(w);
    const index = seen.get(fp) ?? 0;
    seen.set(fp, index + 1);
    if (index >= (baselineCounts.get(fp) ?? 0)) added.push(w);
  }

  const reduced = [...baselineCounts]
    .filter(([fp, count]) => (currentCounts.get(fp) ?? 0) < count)
    .map(([fp]) => fp)
    .sort();

  return { errors: report.summary.errors, added, reduced };
}

/** Returns a human-readable problem, or null when the file is well-formed. */
export function validateBaseline(
  baseline: CatalogWarningsBaseline,
): string | null {
  if (baseline.schemaVersion !== CATALOG_BASELINE_SCHEMA_VERSION) {
    return `Unsupported baseline schemaVersion ${baseline.schemaVersion} (expected ${CATALOG_BASELINE_SCHEMA_VERSION}); regenerate the baseline.`;
  }
  if (baseline.errors !== 0) {
    return `Baseline records ${baseline.errors} accepted audit error(s); errors are never acceptable.`;
  }
  for (const [fp, count] of Object.entries(baseline.warningFingerprints)) {
    if (!Number.isInteger(count) || count < 1) {
      return `Baseline fingerprint '${fp}' has invalid instance count ${count}; regenerate the baseline.`;
    }
  }
  const counted = Object.values(baseline.warningFingerprints).reduce(
    (sum, n) => sum + n,
    0,
  );
  const byCodeSum = Object.values(baseline.warningsByCode).reduce(
    (sum, n) => sum + n,
    0,
  );
  if (counted !== byCodeSum) {
    return "Baseline warningsByCode counts disagree with warningFingerprints; regenerate the baseline.";
  }
  return null;
}

export type BaselineUpdateResult =
  { baseline: CatalogWarningsBaseline } | { refusal: string };

/**
 * Returns the next baseline only when no fingerprint has more instances than
 * the committed baseline (fewer instances and equal sets are allowed).
 * Refuses otherwise, so accepted debt can only shrink.
 */
export function updateBaseline(
  report: AuditReport,
  committed: CatalogWarningsBaseline,
): BaselineUpdateResult {
  const cmp = compareToBaseline(report, committed);
  if (cmp.added.length > 0) {
    return {
      refusal: `Refusing to update the baseline: ${cmp.added.length} new warning instance(s) would be accepted (e.g. ${warningFingerprint(cmp.added[0])}). Fix the new warnings first; the baseline records accepted debt and can only shrink.`,
    };
  }
  return { baseline: buildBaseline(report) };
}
