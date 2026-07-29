import fs from "node:fs";
import path from "node:path";

const ids = [
  "amanohashidate-kyoto",
  "arima-onsen",
  "atsuta-shrine-nagoya",
  "bitchu-matsuyama-castle",
  "gero-onsen",
  "hakodate-night-view",
  "himeji-castle",
  "hirosaki-castle",
  "ise-grand-shrine",
  "izumo-taisha",
  "kairakuen-mito",
  "kegon-falls-nikko",
  "kobe-maya-night-view",
  "korakuen-okayama",
  "kumamoto-castle",
  "kyoto-historic",
  "marugame-castle",
  "matsue-castle",
  "matsushima-bay",
  "miyajima-itsukushima",
  "mount-inasa-nagasaki",
  "nachi-falls-wakayama",
  "nara-park-todaiji",
  "nijo-castle-kyoto",
  "osaka-castle",
  "uwajima-castle",
  "kinosaki-onsen",
  "kochi-castle",
  "matsuyama-castle-ehime",
  "mount-yoshino-nara",
];

const root = process.cwd();
const indexPath = path.join(root, "src/shared/data/destinations-index.json");
const detailDir = path.join(root, "public/data/destinations");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Array<
  Record<string, any>
>;
const byId = new Map(index.map((destination) => [destination.id, destination]));

for (const id of ids) {
  const records = [
    byId.get(id),
    JSON.parse(fs.readFileSync(path.join(detailDir, `${id}.json`), "utf8")),
  ];
  for (const destination of records) {
    if (!destination || !destination.ratings)
      throw new Error(`Missing rating record: ${id}`);
    const values = Object.values(destination.ratings) as unknown[];
    if (
      values.some(
        (value) => typeof value !== "number" || value < 0 || value > 5,
      )
    ) {
      throw new Error(`Unexpected source rating for ${id}`);
    }
    destination.ratings = Object.fromEntries(
      Object.entries(destination.ratings).map(([key, value]) => [
        key,
        Math.round((value as number) * 20) / 10,
      ]),
    );
    if (typeof destination.rating === "number")
      destination.rating = Math.round(destination.rating * 20) / 10;
    destination.ratingsSchemaVersion = 2;
  }
}

fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
for (const id of ids) {
  const file = path.join(detailDir, `${id}.json`);
  const detail = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    any
  >;
  const source = byId.get(id)!;
  detail.ratings = source.ratings;
  if (typeof detail.rating === "number") detail.rating = source.rating;
  detail.ratingsSchemaVersion = 2;
  fs.writeFileSync(file, `${JSON.stringify(detail, null, 2)}\n`);
}

console.log(`Normalized ${ids.length} legacy rating records.`);
