/**
 * Catalogue warning baseline — pure comparison and update logic.
 *
 * The baseline (scripts/audit/catalog-warnings-baseline.json) is the
 * committed ledger of warning-severity findings accepted on `main`.
 *
 * BASELINE-001: A fingerprint is "<CODE>:<targetId>[:<identity>]". The
 *               identity is a canonical, structured description of the
 *               violation (relationship key + referenced destination, sorted
 *               id pairs, ...), so two different violations can never share
 *               a fingerprint even when they share code and target.
 *               Messages, paths, distances, timestamps, display names and
 *               ordering are deliberately excluded: prose churn cannot move
 *               the set, and a warning can never be silently exchanged for
 *               a different warning of the same code on the same record.
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
  /** Instance counts: "<CODE>:<targetId>[:<identity>]" → number of findings. */
  warningFingerprints: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Canonical warning identity
// ---------------------------------------------------------------------------

/**
 * Stable semantic identity of a warning violation, derived deliberately from
 * structured finding.details (never from the free-form message).
 *
 * IDENTITY-001: Identity uses stable destination/municipality IDs, never
 *               display names.
 * IDENTITY-002: Arrays whose ordering is semantically irrelevant (id sets,
 *               field lists, cycle members) are sorted before joining.
 * IDENTITY-003: Calculated diagnostics (distances, counts, coordinate
 *               strings, visit-hour values) and timestamps are excluded
 *               unless they define the violation itself.
 * IDENTITY-004: Rules whose code+targetId already identifies exactly one
 *               violation return "" — the fingerprint stays
 *               "<CODE>:<targetId>".
 */
function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function joinSorted(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return [...value.map(asString)].sort().join(",");
}

function pair(a: unknown, b: unknown): string {
  return `${asString(a)}|${asString(b)}`;
}

export function warningIdentity(finding: AuditFinding): string {
  const d = finding.details ?? {};
  switch (finding.code) {
    // Relationship violations: identity is the offending link.
    case "REL_CYCLE":
      return joinSorted(d.cycle); // set of destinations in the cycle
    case "REL_DANGLING_PARENT":
    case "REL_NON_HUB_PARENT":
    case "REL_CROSS_PREFECTURE_PARENT":
    case "REL_UNPUBLISHED_PARENT":
      return asString(d.parentDestinationId);
    case "REL_CROSS_MUNICIPALITY_PARENT":
      return pair(d.childMunicipalityId, d.parentMunicipalityId);
    case "REL_DANGLING_REF":
    case "REL_DUPLICATE_REF":
    case "REL_CROSS_PREFECTURE_REF":
      return pair(d.key, d.refId);
    case "REL_SELF_REF":
      return asString(d.key);
    case "REL_CROSS_MUNICIPALITY_FEATURED":
      return asString(d.refId);
    case "REL_NON_HUB_GATEWAY":
      return asString(d.gatewayHubId);
    // Geography.
    case "GEO_DUPLICATE_COORDINATES":
      return joinSorted(d.destinationIds); // sorted pair/triple of ids
    case "GEO_CHILD_FAR_FROM_MUNI_PARENT":
      return asString(d.parentId); // distanceKm is a diagnostic, not identity
    // Timing.
    case "TIME_HUB_CAPACITY_INVALID_CHILD":
      return joinSorted(d.childIds);
    // Municipality/naming.
    case "MUNI_PREFECTURE_MISMATCH":
      return asString(d.municipalityId);
    // Source/generated consistency.
    case "SYNC_DETAIL_MISMATCH":
      return joinSorted(d.diffFields); // which fields disagree
    default:
      return "";
  }
}

/**
 * Fingerprint: "<CODE>:<targetId>" when the identity is empty, otherwise
 * "<CODE>:<targetId>:<identity>". Two findings with the same fingerprint are
 * the same violation; different violations always differ in at least one
 * component.
 */
export function warningFingerprint(finding: AuditFinding): string {
  const identity = warningIdentity(finding);
  return identity
    ? `${finding.code}:${finding.targetId}:${identity}`
    : `${finding.code}:${finding.targetId}`;
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
