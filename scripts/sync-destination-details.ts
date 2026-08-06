import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailsDirectory = path.join(process.cwd(), "public/data/destinations");
const metaPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-meta.json",
);

function main() {
  fs.mkdirSync(detailsDirectory, { recursive: true });

  const destinationsIndex = JSON.parse(
    fs.readFileSync(indexPath, "utf-8"),
  ) as Destination[];

  for (const destination of destinationsIndex) {
    const detailPath = path.join(detailsDirectory, `${destination.id}.json`);
    fs.writeFileSync(detailPath, `${JSON.stringify(destination, null, 2)}\n`);
  }

  // destinations-meta.json is a derived store file (pipeline Stage 5
  // mapping). It is regenerated here with the same mapping so the sync
  // step is the single generator for both derived files; the legacy
  // pipeline (scripts/pipeline.cjs) is not runnable end-to-end (its Stage 1
  // fails on legacy records lacking budget fields).
  const metaData = destinationsIndex.map((d) => ({
    id: d.id,
    name: d.name,
    prefecture: d.prefecture,
    region: d.region || "Other",
    role: d.role || "poi",
    kind: d.kind || "attraction",
    status: d.status || "verified",
    relationships: d.relationships || {},
  }));
  metaData.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(metaPath, `${JSON.stringify(metaData, null, 2)}\n`);

  console.log(
    `Synced ${destinationsIndex.length} destination detail files and destinations-meta.json.`,
  );
}

main();
