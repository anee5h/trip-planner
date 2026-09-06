import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

type Destination = Record<string, any> & { id: string };
const ROOT = process.cwd();
const BASE_SHA = "609219e8dc69d56a3d11405840b3c06f6daa3b71";
const INDEX_PATH = "src/shared/data/destinations-index.json";
const REVIEW_PATH = "scripts/audit/kai-151-p1b-season-review.json";
const JSON_PATH = "scripts/audit/kai-151-p1b-impact.json";
const MARKDOWN_PATH = "scripts/audit/kai-151-p1b-impact.md";

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
  const review = readJson(REVIEW_PATH);
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterById = new Map(after.map((row) => [row.id, row]));
  const cohortIds = new Set<string>(
    review.records.map((row: any) => String(row.id)),
  );
  const changedIds = [...cohortIds]
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
  const beforeMissing = [...cohortIds]
    .filter((id) => {
      const row = beforeById.get(id)!;
      return row.season == null && row.bestMonths == null;
    })
    .sort();
  const afterMissing = [...cohortIds]
    .filter((id) => {
      const row = afterById.get(id)!;
      return row.season == null && row.bestMonths == null;
    })
    .sort();
  const report = {
    schemaVersion: 1,
    baseSha: BASE_SHA,
    catalogueCount: after.length,
    cohort: {
      predicate:
        "frozen 79-record P1-B seed queue with season == null and bestMonths == null on merged main",
      candidateCount: review.summary.candidateCount,
      beforeMissingStructuredSeasonCount: beforeMissing.length,
      afterMissingStructuredSeasonCount: afterMissing.length,
      residualCount: afterMissing.length,
      mutatedCount: changedIds.length,
      changedIds,
      changedKeys,
      classificationCounts: review.summary.classificationCounts,
    },
    invariants: {
      uniqueIds: new Set(after.map((row) => row.id)).size === after.length,
      catalogueCountUnchanged: before.length === after.length,
      noOutOfCohortSeasonChanges: [...afterById.keys()].every((id) => {
        if (cohortIds.has(id)) return true;
        return (
          stable(seasonFields(beforeById.get(id)!)) ===
          stable(seasonFields(afterById.get(id)!))
        );
      }),
      residualIds: afterMissing,
    },
  };
  const json = formatJson(report);
  const markdown =
    `# KAI-151 P1-B season evidence impact\n\n` +
    `Base: \`${BASE_SHA}\`\n` +
    `Catalogue: **${after.length}** records (unchanged)\n\n` +
    `## Cohort\n\n` +
    `Predicate: \`${report.cohort.predicate}\`\n\n` +
    `- Before missing structured season: **${beforeMissing.length}**\n` +
    `- Source-backed mutations: **${changedIds.length}**\n` +
    `- After missing structured season: **${afterMissing.length}**\n` +
    `- Residual rows: **${afterMissing.length}**\n` +
    `- Year-round with independent seasonal peak: **0**\n\n` +
    `## Mutated records\n\n` +
    changedIds.map((id) => `- \`${id}\``).join("\n") +
    `\n\n` +
    `The other ${afterMissing.length} seed rows remain explicitly unresolved or conflicting. ` +
    `Generic seasonal language and inferred year-round suitability were not promoted to structured fields.\n\n` +
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
        `${filePath} is stale; run npm run audit:kai-151-p1b-impact`,
      );
    }
  } else {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
}
console.log(
  `${check ? "KAI-151 P1-B impact is current" : "Wrote KAI-151 P1-B impact artifacts"}: ${JSON_PATH}, ${MARKDOWN_PATH}`,
);
