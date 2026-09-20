import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

type Destination = Record<string, any> & { id: string; kind: string };
const ROOT = process.cwd();
const BASE_SHA = "07ea8de3bbbbca3a53962c4211703acb27432346";
const INDEX_PATH = "src/shared/data/destinations-index.json";
const JSON_PATH = "scripts/audit/kai-151-p1a-impact.json";
const MARKDOWN_PATH = "docs/audits/2026-09-05-kai-151-p1a.md";
const TARGET_KINDS = new Set(["castle", "temple", "shrine"]);

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), "utf8"));
}

function stable(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatJson(value: unknown): string {
  return execFileSync("npx", ["prettier", "--stdin-filepath", JSON_PATH], {
    cwd: ROOT,
    encoding: "utf8",
    input: `${JSON.stringify(value, null, 2)}\n`,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function readBaseIndex(): Destination[] {
  return JSON.parse(
    execFileSync("git", ["show", `${BASE_SHA}:${INDEX_PATH}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }),
  ) as Destination[];
}

function missingStructuredSeason(rows: Destination[]): string[] {
  return rows
    .filter(
      (row) =>
        TARGET_KINDS.has(row.kind) &&
        row.season == null &&
        row.bestMonths == null,
    )
    .map((row) => row.id)
    .sort();
}

function seasonFields(row: Destination): Record<string, unknown> {
  return {
    bestSeason: row.bestSeason ?? null,
    bestMonths: row.bestMonths ?? null,
    season: row.season ?? null,
    seasonMetadata: row.seasonMetadata ?? null,
  };
}

function hasExplicitP1BSeasonEvidence(row: Destination): boolean {
  const basis = row.seasonMetadata?.basis;
  return (
    typeof basis === "string" &&
    basis.includes("KAI-151 Phase P1-B authoritative thematic evidence")
  );
}

function build(): { json: string; markdown: string } {
  const before = readBaseIndex();
  const after = readJson(INDEX_PATH) as Destination[];
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterById = new Map(after.map((row) => [row.id, row]));
  const beforeMissing = missingStructuredSeason(before);
  const afterMissing = missingStructuredSeason(after);
  const seasonChangedIds = [...afterById.keys()]
    .filter(
      (id) =>
        stable(seasonFields(beforeById.get(id)!)) !==
        stable(seasonFields(afterById.get(id)!)),
    )
    .sort();
  const changedIds = seasonChangedIds.filter((id) =>
    beforeMissing.includes(id),
  );
  const outOfCohortSeasonChanges = seasonChangedIds
    .filter((id) => !beforeMissing.includes(id))
    .map((id) => ({
      id,
      provenance: hasExplicitP1BSeasonEvidence(afterById.get(id)!)
        ? "KAI-151 P1-B authoritative thematic evidence"
        : null,
    }));
  const changedKeys = Object.fromEntries(
    changedIds.map((id) => [
      id,
      Object.keys(seasonFields(afterById.get(id)!)).filter(
        (key) =>
          stable(seasonFields(beforeById.get(id)!)[key]) !==
          stable(seasonFields(afterById.get(id)!)[key]),
      ),
    ]),
  );
  const review = readJson("scripts/audit/kai-151-p1a-season-review.json");
  const report = {
    schemaVersion: 2,
    baseSha: BASE_SHA,
    catalogueCount: after.length,
    cohort: {
      predicate:
        'kind in ["castle", "temple", "shrine"] and season == null and bestMonths == null',
      candidateCount: review.summary.candidateCount,
      beforeMissingStructuredSeasonCount: beforeMissing.length,
      afterMissingStructuredSeasonCount: afterMissing.length,
      residualCount: afterMissing.length,
      mutatedCount: changedIds.length,
      changedIds,
      changedKeys,
    },
    outOfCohortSeasonChanges,
    invariants: {
      uniqueIds: new Set(after.map((row) => row.id)).size === after.length,
      catalogueCountUnchanged: before.length === after.length,
      p1aChangesWithinCohort: changedIds.every((id) =>
        beforeMissing.includes(id),
      ),
      outOfCohortChangesHaveExplicitProvenance: outOfCohortSeasonChanges.every(
        ({ provenance }) => provenance !== null,
      ),
      residualIds: afterMissing,
    },
  };
  const json = formatJson(report);
  const newline = String.fromCharCode(10);
  const outOfCohortLines = outOfCohortSeasonChanges.map(
    ({ id, provenance }) =>
      `- ${id} — ${provenance ?? "unclassified season provenance"}`,
  );
  const markdown = [
    "# KAI-151 P1-A season evidence impact",
    "",
    `Base: ${BASE_SHA}`,
    `Catalogue: **${after.length}** records (unchanged)`,
    "",
    "## Cohort",
    "",
    `Predicate: ${report.cohort.predicate}`,
    "",
    `- Before missing structured season: **${beforeMissing.length}**`,
    `- Source-backed P1-A mutations: **${changedIds.length}**`,
    `- After missing structured season: **${afterMissing.length}**`,
    `- Residual rows: **${afterMissing.length}**`,
    "",
    "## P1-A mutated records",
    "",
    ...changedIds.map((id) => `- ${id}`),
    "",
    `Each of the ${changedIds.length} accepted rows received only bestSeason, bestMonths, season, and KAI-151 manual provenance metadata. The remaining ${afterMissing.length} cohort rows remain unknown or conflicting; generic seasonal language was not promoted to structured fields.`,
    "",
    "## Post-baseline changes outside the P1-A cohort",
    "",
    "These changes are excluded from the P1-A mutation count. They are reported explicitly so cumulative changes after the fixed baseline cannot be mistaken for P1-A evidence.",
    "",
    ...(outOfCohortLines.length > 0 ? outOfCohortLines : ["None."]),
    "",
    "## Invariants",
    "",
    `- Unique IDs: **${report.invariants.uniqueIds ? "pass" : "fail"}**`,
    `- Catalogue count unchanged: **${report.invariants.catalogueCountUnchanged ? "pass" : "fail"}**`,
    `- P1-A changes remain within the declared cohort: **${report.invariants.p1aChangesWithinCohort ? "pass" : "fail"}**`,
    `- Out-of-cohort changes have explicit provenance: **${report.invariants.outOfCohortChangesHaveExplicitProvenance ? "pass" : "fail"}**`,
  ].join(newline);
  return { json, markdown };
}

const output = build();
const check = process.argv.includes("--check");
for (const [filePath, content] of [
  [JSON_PATH, output.json],
  [MARKDOWN_PATH, output.markdown],
] as const) {
  const absolute = path.join(ROOT, filePath);
  if (check) {
    if (
      !fs.existsSync(absolute) ||
      fs.readFileSync(absolute, "utf8") !== content
    ) {
      throw new Error(
        `${filePath} is stale; run npm run audit:kai-151-p1a-impact`,
      );
    }
  } else {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
}
console.log(
  `${check ? "KAI-151 P1-A impact is current" : "Wrote KAI-151 P1-A impact artifacts"}: ${JSON_PATH}, ${MARKDOWN_PATH}`,
);
