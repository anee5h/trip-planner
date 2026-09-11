#!/usr/bin/env node
/**
 * KAI-290 — writes the committed eligibility coverage artifacts.
 *
 * Kept separate from the audit module so the audit stays pure and CLI-runnable,
 * while artifact generation (which touches disk, and runs Prettier when present)
 * is one explicit, reproducible step.
 *
 * Emits into `qa/kai-290/`. Prettier is applied when available, because
 * everything under `qa/` is covered by the repo-wide `format:check` gate.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEligibilityReport,
  loadCatalogueRecords,
  renderEligibilityMarkdown,
} from "./kai-290-odpt-eligibility.mjs";

const OUT_DIR = "qa/kai-290";
const JSON_PATH = `${OUT_DIR}/odpt-eligibility.json`;
const MD_PATH = `${OUT_DIR}/odpt-eligibility.md`;

async function formatJson(text) {
  try {
    const { format } = await import("prettier");
    return await format(text, { parser: "json" });
  } catch {
    return text;
  }
}

async function formatMarkdown(text) {
  try {
    const { format } = await import("prettier");
    return await format(text, { parser: "markdown" });
  } catch {
    return text;
  }
}

const records = loadCatalogueRecords();
const report = buildEligibilityReport(records, {
  // Verified on current main by the audit documented in
  // docs/kai-290-odpt-2d-integration-readiness.md. Declared explicitly so the
  // report cannot silently claim eligibility it has not measured.
  originIdentity: "unavailable",
  departureWindow: "unavailable",
  // A service date EXISTS deterministically in planner/trip-context flows but not
  // on every direct-navigation request, so it is `flow_dependent` rather than a
  // catalogue-wide false.
  serviceDate: "flow_dependent",
  // The cohort is evaluated for the catalogue as a whole: no flow is assumed.
  eligibilityScope: "catalogue",
});

/**
 * REPRODUCIBILITY: the committed artifact contains NO ambient environment input.
 *
 * An earlier version recorded `baseCommit: process.env.GITHUB_SHA ?? null`, which
 * meant identical committed inputs produced different bytes locally and in CI —
 * breaking the byte-identical regeneration contract this artifact claims. The
 * commit an artifact was generated at is a property of the RUN, not of the data,
 * so it is not written here at all. Regeneration is therefore environment
 * independent by construction.
 */
const artifact = {
  schemaVersion: 1,
  generatedBy: "scripts/audit/kai-290-odpt-eligibility.mjs",
  // Stated explicitly so the artifact cannot be read as a live measurement.
  method: "offline_catalogue_scan",
  networkCalls: 0,
  providerCalls: 0,
  ...report,
};

mkdirSync(resolve(OUT_DIR), { recursive: true });
writeFileSync(
  resolve(JSON_PATH),
  await formatJson(`${JSON.stringify(artifact, null, 2)}\n`),
  "utf8",
);
writeFileSync(
  resolve(MD_PATH),
  await formatMarkdown(`${renderEligibilityMarkdown(report)}\n`),
  "utf8",
);

process.stdout.write(
  `wrote ${JSON_PATH} and ${MD_PATH}\n` +
    `  total=${report.totalCatalogueRecords} ` +
    `exact=${report.destinationAnchors.exact} ` +
    `resolvable=${report.destinationAnchors.deterministicallyResolvable} ` +
    `ambiguous=${report.destinationAnchors.ambiguous} ` +
    `unavailable=${report.destinationAnchors.unavailable} ` +
    `serviceDate=${report.inputs.serviceDate.availability} ` +
    `scope=${report.eligibleCohortScope} ` +
    `eligibleCohort=${report.userFacingEligibleCohort}\n`,
);
