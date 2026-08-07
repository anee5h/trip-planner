import fs from "node:fs";
import path from "node:path";

type RecordLike = {
  totalTripHours?: number;
  role?: string;
  recommendedVisitHours?: { min: number; max: number };
};

const root = process.cwd();
const indexPath = path.join(root, "src/shared/data/destinations-index.json");
const detailsDir = path.join(root, "public/data/destinations");

function addHours(_record: RecordLike) {
  // KAI-50: legacy `totalTripHours` semantics are ambiguous (on-site time
  // vs. a whole trip from a fixed origin), so visit hours must never be
  // derived from it. Author `recommendedVisitHours` from editorial evidence
  // instead; this script is intentionally disabled for auto-derivation.
  return false;
}

function updateFile(filePath: string) {
  const record = JSON.parse(fs.readFileSync(filePath, "utf8")) as RecordLike;
  if (!addHours(record)) return false;
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`);
  return true;
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as RecordLike[];
let updated = index.filter(addHours).length;
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

for (const file of fs.readdirSync(detailsDir)) {
  if (file.endsWith(".json") && updateFile(path.join(detailsDir, file)))
    updated++;
}

console.log(`Added recommended visit hours to ${updated} records.`);
