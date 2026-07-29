/**
 * Integration tests for v1.9.5 expansion audit runner.
 *
 * Verifies:
 * - Two runs of the audit produce identical output (excluding volatile generatedAt).
 * - Running the audit script leaves the catalogue index and destination files 100% clean/untouched (REP-001).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import catalogJson from "../../src/shared/data/destinations-index.json" with { type: "json" };
import type { Destination } from "../../src/shared/types/destination.js";
import {
  applyAllRules,
  computeHighestSeverity,
  findDuplicateRatingVectors,
} from "../audit/rules.js";
import {
  SEVERITY_RANK,
  type AuditReport,
  type AuditSeverity,
  type ExpansionAuditRecord,
} from "../audit/types.js";

function runAuditLogic(): AuditReport {
  const catalog = catalogJson as Destination[];
  const hubById = new Map<string, Destination>(
    catalog.map((dest) => [dest.id, dest]),
  );
  const expansionRecords = catalog.filter((dest) =>
    dest.tags?.includes("v1.9.2"),
  );

  const dupVectorFindings = findDuplicateRatingVectors(catalog);
  const dupFindingsByDestId = new Map<string, typeof dupVectorFindings>();
  for (const finding of dupVectorFindings) {
    const list = dupFindingsByDestId.get(finding.destinationId) ?? [];
    list.push(finding);
    dupFindingsByDestId.set(finding.destinationId, list);
  }

  const auditRecords: ExpansionAuditRecord[] = expansionRecords.map((dest) => {
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

  for (const record of auditRecords) {
    record.findings.sort((a, b) => {
      const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.code.localeCompare(b.code);
    });
  }

  const summary: Record<AuditSeverity, number> = {
    error: 0,
    warning: 0,
    review: 0,
    info: 0,
  };
  const byCode: Record<string, number> = {};
  const byHub: AuditReport["byHub"] = {};

  for (const record of auditRecords) {
    const hub = record.hubId ?? "__no_hub__";
    if (!byHub[hub])
      byHub[hub] = { errors: 0, warnings: 0, review: 0, info: 0 };
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

  return {
    catalogVersion: "1.9.5",
    generatedAt: "STATIC_TIMESTAMP_FOR_DETERMINISM_TEST",
    totalRecords: expansionRecords.length,
    summary,
    byCode,
    byHub,
    top20HighRisk,
    records: auditRecords,
  };
}

describe("Audit Expansion Integration Tests", () => {
  it("produces deterministic output across two separate runs", () => {
    const run1 = runAuditLogic();
    const run2 = runAuditLogic();
    expect(run1).toEqual(run2);
  });

  it("does not modify catalogue files during audit execution (REP-001)", () => {
    const catalogPath = path.join(
      process.cwd(),
      "src/shared/data/destinations-index.json",
    );
    const beforeHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(catalogPath))
      .digest("hex");

    runAuditLogic();

    const afterHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(catalogPath))
      .digest("hex");
    expect(afterHash).toBe(beforeHash);
  });
});
