/**
 * v1.9.5 Expansion audit entrypoint.
 *
 * Replaces the v1.9.4 63-line script with a structured audit that:
 * - Emits typed findings with stable codes, severities, and field paths (AUD-001..004)
 * - Separates editorial review status from semantic defects (AUD-003)
 * - Aggregates findings by hub and finding code (AUD-005)
 * - Sorts output deterministically (AUD-006)
 * - Supports --severity, --hub, and --format CLI flags
 *
 * Usage:
 *   npm run audit:v192-expansion-data
 *   npm run audit:v192-expansion-data -- --severity warning
 *   npm run audit:v192-expansion-data -- --hub kyoto-city
 *   npm run audit:v192-expansion-data -- --format json,csv
 */

import fs from "node:fs";
import path from "node:path";
import catalogJson from "../src/shared/data/destinations-index.json" with { type: "json" };
import type { Destination } from "../src/shared/types/destination.js";
import {
  applyAllRules,
  computeHighestSeverity,
  findDuplicateRatingVectors,
} from "./audit/rules.js";
import {
  SEVERITY_RANK,
  type AuditReport,
  type AuditSeverity,
  type ExpansionAuditCode,
  type ExpansionAuditRecord,
} from "./audit/types.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const getFlag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : undefined;
};

const filterSeverity = getFlag("severity") as AuditSeverity | undefined;
const filterHub = getFlag("hub");
const formatArg = getFlag("format") ?? "json";
const formats = formatArg.split(",").map((s) => s.trim());

// ---------------------------------------------------------------------------
// Build lookup structures
// ---------------------------------------------------------------------------

const catalog = catalogJson as Destination[];

const hubById = new Map<string, Destination>(
  catalog.map((dest) => [dest.id, dest]),
);

// Only audit v1.9.2 expansion records (tagged with "v1.9.2")
const expansionRecords = catalog.filter((dest) =>
  dest.tags?.includes("v1.9.2"),
);

// Run cross-record rules across the whole catalogue
const dupVectorFindings = findDuplicateRatingVectors(catalog);
const dupFindingsByDestId = new Map<string, typeof dupVectorFindings>();
for (const finding of dupVectorFindings) {
  const list = dupFindingsByDestId.get(finding.destinationId) ?? [];
  list.push(finding);
  dupFindingsByDestId.set(finding.destinationId, list);
}

// ---------------------------------------------------------------------------
// Run rules and build record list (AUD-006: deterministic sort)
// ---------------------------------------------------------------------------

const auditRecords: ExpansionAuditRecord[] = expansionRecords.map((dest) => {
  // AUD-003: editorial lifecycle → editorialStatus field, not a finding.
  const editorialStatus: ExpansionAuditRecord["editorialStatus"] =
    dest.editorial?.lifecycle === "approved" ||
    dest.editorial?.lifecycle === "published"
      ? "reviewed"
      : dest.editorial?.lifecycle === "in_review" ||
          dest.editorial?.lifecycle === "draft"
        ? "review_required"
        : "unknown";

  const findings = [
    ...applyAllRules(dest, hubById),
    ...(dupFindingsByDestId.get(dest.id) ?? []),
  ];

  return {
    destinationId: dest.id,
    hubId: dest.relationships?.parentDestinationId,
    editorialStatus,
    findings,
    highestSeverity: computeHighestSeverity(findings),
  };
});

// AUD-006: Deterministic sort — severity rank → hubId → destinationId
auditRecords.sort((a, b) => {
  const sevA =
    a.highestSeverity === "none"
      ? 999
      : SEVERITY_RANK[a.highestSeverity as AuditSeverity];
  const sevB =
    b.highestSeverity === "none"
      ? 999
      : SEVERITY_RANK[b.highestSeverity as AuditSeverity];
  if (sevA !== sevB) return sevA - sevB;
  const hubCompare = (a.hubId ?? "").localeCompare(b.hubId ?? "");
  if (hubCompare !== 0) return hubCompare;
  return a.destinationId.localeCompare(b.destinationId);
});

// Also sort findings within each record
for (const record of auditRecords) {
  record.findings.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.code.localeCompare(b.code);
  });
}

// ---------------------------------------------------------------------------
// Build aggregations (AUD-005)
// ---------------------------------------------------------------------------

const summary: Record<AuditSeverity, number> = {
  error: 0,
  warning: 0,
  review: 0,
  info: 0,
};
const byCode: Partial<Record<ExpansionAuditCode, number>> = {};
const byHub: AuditReport["byHub"] = {};

for (const record of auditRecords) {
  const hub = record.hubId ?? "__no_hub__";
  if (!byHub[hub]) byHub[hub] = { errors: 0, warnings: 0, review: 0, info: 0 };

  for (const finding of record.findings) {
    summary[finding.severity]++;
    byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
    if (finding.severity === "error") byHub[hub].errors++;
    else if (finding.severity === "warning") byHub[hub].warnings++;
    else if (finding.severity === "review") byHub[hub].review++;
    else byHub[hub].info++;
  }
}

const top20HighRisk = auditRecords
  .filter((r) => r.highestSeverity !== "none" && r.highestSeverity !== "info")
  .slice(0, 20)
  .map((r) => r.destinationId);

// ---------------------------------------------------------------------------
// Build the report
// ---------------------------------------------------------------------------

const catalogVersion =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.9.5";

const report: AuditReport = {
  catalogVersion,
  generatedAt: new Date().toISOString(),
  totalRecords: expansionRecords.length,
  summary,
  byCode,
  byHub,
  top20HighRisk,
  records: auditRecords,
};

// Apply CLI filters for output (not for the stored report)
let _displayRecords = auditRecords;
if (filterHub) {
  _displayRecords = _displayRecords.filter(
    (r) => r.hubId === filterHub || r.destinationId === filterHub,
  );
}
if (filterSeverity) {
  _displayRecords = _displayRecords.filter((r) =>
    r.findings.some((f) => f.severity === filterSeverity),
  );
}

// ---------------------------------------------------------------------------
// Write outputs (REP-001: audit must not modify catalogue or destination files)
// ---------------------------------------------------------------------------

const reportDirectory = path.join(process.cwd(), "reports");
fs.mkdirSync(reportDirectory, { recursive: true });

if (formats.includes("json")) {
  const jsonPath = path.join(reportDirectory, "v192-expansion-audit.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (formats.includes("csv")) {
  const rows: string[] = [
    "destinationId,hubId,severity,findingCode,fieldPaths,currentValue,suggestedAction",
  ];
  for (const record of auditRecords) {
    for (const f of record.findings) {
      const fields = [
        record.destinationId,
        record.hubId ?? "",
        f.severity,
        f.code,
        f.fieldPaths.join("|"),
        JSON.stringify(f.evidence ?? {}),
        f.suggestedAction.replace(/,/g, ";"),
      ];
      rows.push(
        fields.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      );
    }
  }
  const csvPath = path.join(reportDirectory, "v192-expansion-audit.csv");
  fs.writeFileSync(csvPath, `${rows.join("\n")}\n`);
}

// ---------------------------------------------------------------------------
// Console summary (concise — full detail in report files)
// ---------------------------------------------------------------------------

const totalFindings =
  summary.error + summary.warning + summary.review + summary.info;
console.log(
  `\nv1.9.5 Expansion Audit — ${expansionRecords.length} records, ${totalFindings} findings`,
);
console.log(
  `  errors: ${summary.error}  warnings: ${summary.warning}  review: ${summary.review}  info: ${summary.info}`,
);
console.log(`  Report: reports/v192-expansion-audit.json\n`);

if (top20HighRisk.length > 0) {
  const top5 = auditRecords
    .filter((r) => top20HighRisk.includes(r.destinationId))
    .slice(0, 5);
  console.log("Top findings:");
  for (const record of top5) {
    const topFinding = record.findings[0];
    if (topFinding) {
      console.log(
        `  [${topFinding.severity.toUpperCase()}] ${record.destinationId}: ${topFinding.code} — ${topFinding.message}`,
      );
    }
  }
  console.log();
}

// Type declaration for vite-injected constant
declare const __APP_VERSION__: string;
