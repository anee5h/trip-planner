import fs from "node:fs";
import { getTravelDurationEvidence } from "../src/shared/services/recommendation/TripDurationService";

const index = JSON.parse(
  fs.readFileSync("src/shared/data/destinations-index.json", "utf8"),
);
const TOKYO = { lat: 35.6812, lng: 139.7671 };

const cases: Array<[string, string]> = [
  ["gunma-shima-onsen", "Shima Onsen (Gunma NW, Nakanojo)"],
  ["hakone-town", "Hakone (Kanagawa)"],
  ["fujikawaguchiko-town", "Fujikawaguchiko (Yamanashi)"],
  ["tomioka-silk-mill-gunma", "Tomioka Silk Mill (Gunma south)"],
  ["fukushima-city", "Fukushima City (long mainland)"],
  ["sado-island", "Sado Island (cross-water, must stay unknown)"],
];

for (const [id, label] of cases) {
  const d = index.find((x: any) => x.id === id);
  if (!d) {
    console.log(`${label} (${id}): NOT FOUND`);
    continue;
  }
  const result = getTravelDurationEvidence(d, { homeStationCoords: TOKYO }, [
    "car",
  ]);
  const range = result.estimate?.timeRange;
  const text = range
    ? `~${range[0]}–${range[1]} min (${result.evidence}, ${result.estimate?.mode})`
    : `${result.evidence} — travel time unavailable`;
  console.log(`${label}: ${text}`);
}
