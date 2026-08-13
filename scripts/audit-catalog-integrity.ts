/**
 * audit:catalog-integrity — read-only catalogue integrity audit.
 *
 * The audit NEVER rewrites catalogue data. It reports:
 *   A  relationship integrity
 *   B  geographic suspicion (signals only, never auto-fixes)
 *   C  duration/timing completeness
 *   D  municipality and naming consistency
 *   E  source/generated-file consistency
 *   F  recommendation-impact summary for relationship candidates
 *
 * Usage:
 *   npm run audit:catalog-integrity
 *   npm run audit:catalog-integrity -- --prefecture Okayama
 *   npm run audit:catalog-integrity -- --destination kurashiki-city
 *   npm run audit:catalog-integrity -- --json
 *   npm run audit:catalog-integrity -- --output reports/catalog-integrity-audit.json
 *   npm run audit:catalog-integrity -- --strict
 *
 * Output: console summary by default; --json prints machine-readable JSON to
 * stdout; --output <path> writes the JSON report to an explicit file. The
 * command never writes a report file implicitly, so a tracked tree cannot
 * churn from a plain run.
 *
 * Exit codes: 1 when errors are found (or warnings with --strict), else 0.
 * No network access is required.
 */

import fs from "fs";
import path from "path";
import { runAudit, type AuditReport } from "./audit/catalog-integrity.js";
import { loadCatalogInputs } from "./audit/catalog-inputs.js";

const args = process.argv.slice(2);
const getFlag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
};
const hasFlag = (name: string): boolean => args.includes(`--${name}`);

function main(): void {
  if (hasFlag("help") || hasFlag("h")) {
    console.log(`Catalogue integrity audit (read-only)

Options:
  --prefecture <name>  Restrict findings to destinations in a prefecture
  --destination <id>   Restrict findings to one destination
  --json               Print machine-readable JSON to stdout
  --output <path>      Write the JSON report to an explicit file
  --strict             Exit non-zero on warnings as well as errors
  --help               Show this help`);
    return;
  }

  const rootDir = process.cwd();
  const { destinations, details, metaEntries, collections } =
    loadCatalogInputs(rootDir);

  // The pure audit is deterministic; the real timestamp is attached here.
  const report: AuditReport = runAudit(
    destinations,
    details,
    metaEntries,
    {
      prefecture: getFlag("prefecture"),
      destinationId: getFlag("destination"),
      generatedAt: new Date().toISOString(),
    },
    collections,
  );

  if (hasFlag("json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`\n🧭 Catalogue Integrity Audit (read-only)`);
    console.log(`===========================================`);
    console.log(
      `Scanned: ${report.scanned.destinations} destinations, ${report.scanned.detailFiles} detail files`,
    );
    console.log(
      `Summary: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info\n`,
    );
    for (const f of report.findings) {
      const prefix =
        f.severity === "error" ? "❌" : f.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(
        `${prefix} [${f.category}] (${f.code}) ${f.targetId} — ${f.message}`,
      );
    }
    if (report.findings.length === 0) {
      console.log("No findings.");
    }
    const impacted = Object.keys(report.impact);
    if (
      impacted.length > 0 &&
      !getFlag("prefecture") &&
      !getFlag("destination")
    ) {
      console.log(
        `\nRecommendation-impact summary (${impacted.length} records with relationship data):`,
      );
      for (const id of impacted.sort()) {
        const im = report.impact[id];
        console.log(
          `  ${id}: parent places=${im.parentPlaceCount}, weekend capacity=${im.parentWeekendCapacityMinutes}min (eligible=${im.parentWeekendEligible}), city filter=${im.childCityFilterMunicipalityId ?? "n/a"}, contained=${im.childContainedByParent}, featured=${im.childFeaturedByParent}, itinerary candidate=${im.childItineraryCandidate}, featured-only refs=[${im.featuredOnlyRefs.join(", ")}], nearby grouping=${im.childInNearbyGrouping}`,
        );
      }
    }
  }

  const outputPath = getFlag("output");
  if (outputPath) {
    const resolved = path.resolve(rootDir, outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`);
  }

  const failed =
    report.summary.errors > 0 ||
    (hasFlag("strict") && report.summary.warnings > 0);
  process.exit(failed ? 1 : 0);
}

main();
