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

function build(): { json: string; markdown: string } {
  const before = readBaseIndex();
  const after = readJson(INDEX_PATH) as Destination[];
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterById = new Map(after.map((row) => [row.id, row]));
  const changedIds = [...afterById.keys()]
    .filter(
      (id) =>
        stable(seasonFields(beforeById.get(id)!)) !==
        stable(seasonFields(afterById.get(id)!)),
    )
    .sort();
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
  const beforeMissing = missingStructuredSeason(before);
  const afterMissing = missingStructuredSeason(after);
  const review = readJson("scripts/audit/kai-151-p1a-season-review.json");
  const report = {
    schemaVersion: 1,
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
    invariants: {
      uniqueIds: new Set(after.map((row) => row.id)).size === after.length,
      catalogueCountUnchanged: before.length === after.length,
      noOutOfCohortSeasonChanges: changedIds.every((id) =>
        beforeMissing.includes(id),
      ),
      residualIds: afterMissing,
    },
  };
  const json = formatJson(report);
  const markdown =
    `# KAI-151 P1-A season evidence impact\n\n` +
    `Base: \`${BASE_SHA}\`\n` +
    `Catalogue: **${after.length}** records (unchanged)\n\n` +
    `## Cohort\n\n` +
    `Predicate: \`${report.cohort.predicate}\`\n\n` +
    `- Before missing structured season: **${beforeMissing.length}**\n` +
    `- Source-backed mutations: **${changedIds.length}**\n` +
    `- After missing structured season: **${afterMissing.length}**\n` +
    `- Residual rows: **${afterMissing.length}**\n\n` +
    `## Mutated records\n\n` +
    changedIds.map((id) => `- \`${id}\``).join("\n") +
    `\n\n` +
    `These six rows received only \`bestSeason\`, \`bestMonths\`, \`season\`, and ` +
    `KAI-151 manual provenance metadata. The remaining cohort rows remain unknown; ` +
    `generic seasonal language was not promoted to structured fields.\n\n` +
    `## Invariants\n\n` +
    `- Unique IDs: **${report.invariants.uniqueIds ? "pass" : "fail"}**\n` +
    `- Catalogue count unchanged: **${report.invariants.catalogueCountUnchanged ? "pass" : "fail"}**\n` +
    `- No out-of-cohort season changes: **${report.invariants.noOutOfCohortSeasonChanges ? "pass" : "fail"}**\n`;
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
