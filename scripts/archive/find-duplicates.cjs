const fs = require("fs");
const path = require("path");

/**
 * TabiMap Duplicate Destination Scanner
 *
 * Scans the central destinations index for potential duplicate entries
 * based on name similarity and coordinate distance.
 */

const indexPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const indexData = JSON.parse(fs.readFileSync(indexPath, "utf8"));

console.log("Scanning for duplicate names or close coordinates...");

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

let matches = 0;

for (let i = 0; i < indexData.length; i++) {
  const d1 = indexData[i];
  for (let j = i + 1; j < indexData.length; j++) {
    const d2 = indexData[j];

    const name1 = d1.name.toLowerCase().replace(/[^a-z]/g, "");
    const name2 = d2.name.toLowerCase().replace(/[^a-z]/g, "");
    const isNameSimilar = name1.includes(name2) || name2.includes(name1);

    let isCoordsClose = false;
    let dist = null;
    if (d1.coordinates && d2.coordinates) {
      dist = getDistance(
        d1.coordinates.lat,
        d1.coordinates.lng,
        d2.coordinates.lat,
        d2.coordinates.lng,
      );
      if (dist < 1000) {
        isCoordsClose = true;
      }
    }

    if (isNameSimilar || isCoordsClose) {
      console.log(`Potential Duplicate Match:`);
      console.log(`  1. [${d1.id}] "${d1.name}" (${d1.prefecture})`);
      console.log(`  2. [${d2.id}] "${d2.name}" (${d2.prefecture})`);
      if (dist !== null) {
        console.log(`  Distance: ${Math.round(dist)} meters`);
      }
      console.log("-----------------------------------------");
      matches++;
    }
  }
}

console.log(`Scan complete. Found ${matches} potential duplicates.`);
