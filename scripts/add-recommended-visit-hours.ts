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

function addHours(record: RecordLike) {
  if (record.recommendedVisitHours || !record.totalTripHours) return false;
  const base = Math.max(1, record.totalTripHours);
  record.recommendedVisitHours = {
    min: record.role === "hub" ? base : Math.max(1, base - 1),
    max: record.role === "hub" ? base + 6 : base + 1,
  };
  return true;
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
