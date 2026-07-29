const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/apply-official-website-qa.cjs <csv-path>");
  process.exit(1);
}

const destinationPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(destinationPath, "utf8"));

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] || ""]),
    );
  });
}

const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), "utf8"));
const accessedAt = new Date().toISOString().slice(0, 10);
let updated = 0;
let skipped = 0;

for (const row of rows) {
  const destination = destinations.find(
    (item) => item.id === row["Destination ID"],
  );
  const url = row["Official Website URL"].trim();
  if (!destination || row["QA Status"] !== "OK" || !/^https?:\/\//i.test(url)) {
    skipped++;
    continue;
  }

  destination.officialWebsite = url;
  destination.editorial = destination.editorial || {
    lifecycle: "legacy",
    sources: [],
  };
  const fieldSources = destination.editorial.fieldSources || {};
  const source = {
    type: "official",
    url,
    title: `Official website for ${destination.name}`,
    accessedAt,
  };
  destination.editorial.fieldSources = {
    ...fieldSources,
    officialWebsite: [source],
  };
  if (!destination.editorial.sources.some((item) => item.url === url)) {
    destination.editorial.sources = [...destination.editorial.sources, source];
  }
  updated++;
}

fs.writeFileSync(destinationPath, JSON.stringify(destinations, null, 2) + "\n");
console.log(`Updated ${updated} official websites; skipped ${skipped} rows.`);

const sync = spawnSync("npm", ["run", "sync-destination-details"], {
  stdio: "inherit",
});
process.exit(sync.status || 0);
