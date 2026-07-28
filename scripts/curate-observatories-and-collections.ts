import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const OBSERVATORY_IDS = [
  "tokyo-skytree-sumida",
  "tokyo-tower-minato",
  "shibuya-sky-shibuya",
  "roppongi-hills-tokyo-city-view",
  "sunshine-60-observatory-ikebukuro",
  "yokohama-landmark-tower-sky-garden",
  "yokohama-marine-tower",
  "abeno-harukas-300-osaka",
  "mirai-tower-nagoya",
  "higashiyama-sky-tower-nagoya",
  "nagoya-port-tower",
  "kobe-maya-night-view",
  "hakodate-night-view",
  "toki-messe-tower-niigata",
  "chiba-port-tower",
  "oarai-marine-tower",
] as const;

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];
const ids = new Set(destinations.map((destination) => destination.id));
const missing = OBSERVATORY_IDS.filter((id) => !ids.has(id));
if (missing.length)
  throw new Error(`Missing observatory records: ${missing.join(", ")}`);

for (const destination of destinations) {
  destination.collections = (destination.collections || []).filter(
    (membership) =>
      !(
        destination.id === "teamlab-planets" &&
        membership.collectionId === "art-islands-japan"
      ),
  );
  if (
    !OBSERVATORY_IDS.includes(
      destination.id as (typeof OBSERVATORY_IDS)[number],
    )
  )
    continue;
  if (
    !destination.collections.some(
      (membership) => membership.collectionId === "japan-observatories-towers",
    )
  ) {
    destination.collections.push({
      collectionId: "japan-observatories-towers",
      confirmed: true,
    });
  }
}
fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
