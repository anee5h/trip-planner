/**
 * Opening-hours verification backlog tooling (KAI-335 long tail).
 *
 * Lists the priority backlog: records whose businessHours is a specific
 * window claim with NO verification metadata. These are the records a
 * human must verify against an official source (sourceUrl + verifiedAt).
 * Hedged/open-area texts ("Open access…", "Open daily; hours vary…") are
 * already truthful and are excluded from the priority list.
 *
 * Usage:
 *   npx tsx scripts/verification/list-hours-backlog.ts         (priority)
 *   npx tsx scripts/verification/list-hours-backlog.ts --all    (full)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import destinations from "../../src/shared/data/destinations-index.json";
import { isValidIsoDate } from "../../src/shared/services/recommendation/OpeningHoursPolicy";

const list = (
  Array.isArray(destinations) ? destinations : Object.values(destinations)
) as Array<{
  id: string;
  name: string;
  nameJa?: string;
  kind?: string;
  businessHours?: string;
  openingHours?: string;
  openingHoursMetadata?: { sourceUrl?: string; verifiedAt?: string };
  officialWebsite?: string;
}>;

const SPECIFIC_WINDOW = /^\d{1,2}:\d{2}\s*[-\u2013\u2014]\s*\d{1,2}:\d{2}/;
const allFlag = process.argv.includes("--all");

const backlog = list
  .filter((d) => {
    const hours = d.businessHours ?? d.openingHours;
    if (!hours) return false;
    if (d.openingHoursMetadata) return false;
    if (allFlag) return true;
    return SPECIFIC_WINDOW.test(hours);
  })
  .map((d) => ({
    id: d.id,
    name: d.name,
    nameJa: d.nameJa ?? "",
    kind: d.kind ?? "(none)",
    hours: (d.businessHours ?? d.openingHours ?? "").slice(0, 90),
    website: d.officialWebsite ?? "",
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const outDir = "scripts/verification";
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/hours-backlog.json`;
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedFrom: "src/shared/data/destinations-index.json",
      count: backlog.length,
      records: backlog,
    },
    null,
    2,
  ) + "\n",
);
console.log(`backlog: ${backlog.length} records -> ${outPath}`);
for (const r of backlog.slice(0, allFlag ? 0 : 30)) {
  console.log(`${r.id} | ${r.kind || "(none)"} | ${r.name} | ${r.hours}`);
}
void isValidIsoDate;
