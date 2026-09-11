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
  originIdentityAvailable: false,
  departureTimeInputAvailable: false,
  serviceDateContextAvailable: false,
});

const artifact = {
  schemaVersion: 1,
  generatedBy: "scripts/audit/kai-290-odpt-eligibility.mjs",
  baseCommit: process.env.GITHUB_SHA ?? null,
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
    `eligibleCohort=${report.userFacingEligibleCohort}\n`,
);
