import fs from "fs";
import path from "path";
import destinationsIndex from "../src/shared/data/destinations-index.json";
import type { Destination } from "../src/shared/types/destination";

const detailsDirectory = path.join(process.cwd(), "public/data/destinations");

function main() {
  fs.mkdirSync(detailsDirectory, { recursive: true });

  for (const destination of destinationsIndex as Destination[]) {
    const detailPath = path.join(detailsDirectory, `${destination.id}.json`);
    fs.writeFileSync(detailPath, `${JSON.stringify(destination, null, 2)}\n`);
  }

  console.log(
    `Synced ${(destinationsIndex as Destination[]).length} destination detail files.`,
  );
}

main();
