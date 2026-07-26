const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(filePath, "utf8"));

console.log(`Loaded ${destinations.length} destinations.`);

let fixesApplied = 0;

for (const dest of destinations) {
  if (dest.id === "tokyo-metropolitan-government-building-shinjuku") {
    dest.relationships.parentDestinationId = "shinjuku-city";
    fixesApplied++;
    console.log(`Updated ${dest.id} parent to shinjuku-city`);
  } else if (
    dest.id === "ikebukuro-toshima" ||
    dest.id === "sunshine-60-observatory-ikebukuro"
  ) {
    dest.relationships.parentDestinationId = "toshima-city";
    fixesApplied++;
    console.log(`Updated ${dest.id} parent to toshima-city`);
  } else if (dest.id === "ghibli-museum") {
    delete dest.relationships.parentDestinationId;
    fixesApplied++;
    console.log(`Removed incorrect parent from ${dest.id}`);
  } else if (dest.id === "odaiba-minato" || dest.id === "joypolis") {
    dest.relationships.parentDestinationId = "minato-city";
    fixesApplied++;
    console.log(`Updated ${dest.id} parent to minato-city`);
  } else if (dest.id === "amanohashidate-kyoto") {
    delete dest.relationships.parentDestinationId;
    fixesApplied++;
    console.log(`Removed incorrect parent from ${dest.id}`);
  } else if (dest.id === "jogashima") {
    delete dest.relationships.parentDestinationId;
    fixesApplied++;
    console.log(`Removed incorrect parent from ${dest.id}`);
  }
}

fs.writeFileSync(filePath, JSON.stringify(destinations, null, 2), "utf8");
console.log(
  `Applied ${fixesApplied} relationship data fixes to destinations-index.json.`,
);
