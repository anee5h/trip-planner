import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

/**
 * A root is explicitly standalone when its scope is regional, multi-municipal,
 * island-wide, or otherwise cannot be represented by one exact city hub.
 * This prevents a false nearby-city relationship while ensuring no POI is
 * left as an unclassified graph orphan.
 */
const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];

let classified = 0;
for (const destination of destinations) {
  if (
    destination.role === "hub" ||
    destination.relationships?.parentDestinationId
  ) {
    continue;
  }
  destination.role = "standalone";
  destination.placeType = "destination";
  classified += 1;
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(`Classified ${classified} deliberate standalone roots.`);
