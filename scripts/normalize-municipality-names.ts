import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];

const CITY_OVERRIDES: Record<string, string> = {
  "hachioji-tokyo": "Hachioji City",
  "tachikawa-tokyo": "Tachikawa City",
  "nagano-city": "Nagano City",
  "yokohama-city": "Yokohama City",
};

for (const destination of destinations) {
  if (destination.role !== "hub") continue;
  const kind = destination.kind;
  if (CITY_OVERRIDES[destination.id]) {
    destination.name = CITY_OVERRIDES[destination.id];
    destination.kind = "city";
    continue;
  }
  if (kind === "city" && !destination.name.endsWith(" City")) {
    destination.name = `${destination.name} City`;
  }
  if (kind === "town" && !destination.name.endsWith(" Town")) {
    destination.name = `${destination.name} Town`;
  }
  if (kind === "village" && !destination.name.endsWith(" Village")) {
    destination.name = `${destination.name} Village`;
  }
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
