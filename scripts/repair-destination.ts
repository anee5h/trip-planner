/**
 * repair:destination — Safe, scoped, dry-runnable destination data repair.
 *
 * REP-001: The audit must remain non-destructive. This script is separate.
 * REP-002: A scope argument (--id or --finding) is required.
 * REP-003: Dry-run mode (--dry-run) prints proposed changes; no files touched.
 * REP-004: Editorial history is idempotent: no duplicate (changedAt, summary) entries.
 * REP-005: All applied changes are logged with field, old value, new value, method.
 *
 * Usage:
 *   npm run repair:destination -- --id ameya-yokocho --finding RAIN_DATA_CONFLICT --dry-run
 *   npm run repair:destination -- --finding FREE_PLACE_TICKET_COST --dry-run
 *   npm run repair:destination -- --id shibuya-crossing --finding DUPLICATE_AUDIT_HISTORY
 */

import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../src/shared/types/destination.js";
import type { AuditReport, ExpansionAuditFinding } from "./audit/types.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const getFlag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : undefined;
};
const hasFlag = (name: string): boolean => args.includes(`--${name}`);

const scopeId = getFlag("id");
const scopeFinding = getFlag("finding");
const dryRun = hasFlag("dry-run");

// REP-002: Reject unscoped repair.
if (!scopeId && !scopeFinding) {
  console.error(
    "Error: scope argument required. Use --id <destinationId> and/or --finding <CODE>.\n" +
      "Example: npm run repair:destination -- --id ameya-yokocho --finding RAIN_DATA_CONFLICT --dry-run",
  );
  process.exit(1);
}

if (dryRun) {
  console.log("Dry-run mode — no files will be modified.\n");
}

// ---------------------------------------------------------------------------
// Load audit report
// ---------------------------------------------------------------------------

const reportPath = path.join(
  process.cwd(),
  "reports/v192-expansion-audit.json",
);
if (!fs.existsSync(reportPath)) {
  console.error(
    `Error: audit report not found at ${reportPath}\nRun 'npm run audit:v192-expansion-data' first.`,
  );
  process.exit(1);
}

const report: AuditReport = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

// ---------------------------------------------------------------------------
// Select in-scope, auto-fixable findings
// ---------------------------------------------------------------------------

let findings: (ExpansionAuditFinding & { destinationId: string })[] = [];
for (const record of report.records) {
  const inIdScope = !scopeId || record.destinationId === scopeId;
  if (!inIdScope) continue;

  for (const finding of record.findings) {
    const inFindingScope = !scopeFinding || finding.code === scopeFinding;
    if (!inFindingScope) continue;
    if (!finding.autoFixable) continue;
    findings.push({ ...finding, destinationId: record.destinationId });
  }
}

if (findings.length === 0) {
  console.log(
    "No auto-fixable findings match the given scope. Nothing to repair.",
  );
  process.exit(0);
}

console.log(`Found ${findings.length} auto-fixable finding(s) in scope.\n`);

// ---------------------------------------------------------------------------
// Load catalogue and apply fixes
// ---------------------------------------------------------------------------

const catalogPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const catalog: Destination[] = JSON.parse(
  fs.readFileSync(catalogPath, "utf-8"),
);
const catalogById = new Map<string, Destination>(catalog.map((d) => [d.id, d]));

interface RepairLogEntry {
  destinationId: string;
  code: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  method: "auto";
  source: "repair:destination";
  appliedAt: string;
}

const repairLog: RepairLogEntry[] = [];
const changedAt = new Date().toISOString();

for (const finding of findings) {
  const dest = catalogById.get(finding.destinationId);
  if (!dest) {
    console.warn(`  SKIP: ${finding.destinationId} not found in catalogue`);
    continue;
  }

  console.log(
    `  [${finding.severity.toUpperCase()}] ${finding.destinationId}: ${finding.code}`,
  );
  console.log(`    Fields: ${finding.fieldPaths.join(", ")}`);

  // -------------------------------------------------------------------------
  // FREE_PLACE_TICKET_COST: reset budgetBreakdown.tickets to 0
  // -------------------------------------------------------------------------
  if (finding.code === "FREE_PLACE_TICKET_COST") {
    const oldValue = dest.budgetBreakdown?.tickets;
    const newValue = 0;
    console.log(`    tickets: ${JSON.stringify(oldValue)} → ${newValue}`);

    if (!dryRun) {
      if (dest.budgetBreakdown) {
        (dest.budgetBreakdown as Record<string, unknown>).tickets = newValue;
      }
      repairLog.push({
        destinationId: dest.id,
        code: finding.code,
        field: "budgetBreakdown.tickets",
        oldValue,
        newValue,
        method: "auto",
        source: "repair:destination",
        appliedAt: changedAt,
      });
    }
  }

  // -------------------------------------------------------------------------
  // DUPLICATE_AUDIT_HISTORY: deduplicate editorial.changes by (changedAt, summary)
  // -------------------------------------------------------------------------
  if (finding.code === "DUPLICATE_AUDIT_HISTORY") {
    const changes = dest.editorial?.changes ?? [];
    const seen = new Map<string, (typeof changes)[number]>();
    const deduped: typeof changes = [];
    for (const change of changes) {
      const key = `${change.changedAt}::${change.summary}`;
      if (!seen.has(key)) {
        seen.set(key, change);
        deduped.push(change);
      }
    }
    const removedCount = changes.length - deduped.length;
    console.log(
      `    editorial.changes: ${changes.length} entries → ${deduped.length} (removed ${removedCount} duplicate(s))`,
    );

    if (!dryRun && dest.editorial) {
      dest.editorial.changes = deduped;
      repairLog.push({
        destinationId: dest.id,
        code: finding.code,
        field: "editorial.changes",
        oldValue: changes.length,
        newValue: deduped.length,
        method: "auto",
        source: "repair:destination",
        appliedAt: changedAt,
      });
    }
  }

  // REP-004: Append idempotent editorial history entry
  if (!dryRun && dest.editorial) {
    const summary = `repair:destination applied ${finding.code}`;
    const changes = dest.editorial.changes ?? [];
    const alreadyPresent = changes.some(
      (c) => c.changedAt === changedAt && c.summary === summary,
    );
    if (!alreadyPresent) {
      changes.push({
        changedAt,
        changedBy: "repair:destination",
        summary,
        method: "assisted",
      });
      dest.editorial.changes = changes;
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Write changes if not dry-run
// ---------------------------------------------------------------------------

if (!dryRun) {
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${catalogPath}`);

  // REP-005: Write repair log
  const logDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, "repair-log.json");
  const existingLog: RepairLogEntry[] = fs.existsSync(logPath)
    ? JSON.parse(fs.readFileSync(logPath, "utf-8"))
    : [];
  fs.writeFileSync(
    logPath,
    `${JSON.stringify([...existingLog, ...repairLog], null, 2)}\n`,
  );
  console.log(`Repair log appended: ${logPath}`);
  console.log(`\n${repairLog.length} fix(es) applied.`);
} else {
  console.log(
    `\n${findings.length} fix(es) would be applied. Re-run without --dry-run to apply.`,
  );
}
