import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailsDirectory = path.join(process.cwd(), "public/data/destinations");

function main() {
  fs.mkdirSync(detailsDirectory, { recursive: true });

  const destinationsIndex = JSON.parse(
    fs.readFileSync(indexPath, "utf-8"),
  ) as Destination[];

  for (const destination of destinationsIndex) {
    const detailPath = path.join(detailsDirectory, `${destination.id}.json`);
    fs.writeFileSync(detailPath, `${JSON.stringify(destination, null, 2)}\n`);
  }

  console.log(`Synced ${destinationsIndex.length} destination detail files.`);
}

main();
