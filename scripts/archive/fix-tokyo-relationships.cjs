const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(filePath, "utf8"));

console.log(`Loaded ${destinations.length} destinations.`);

const parentFixes = {
  "akasaka-minato": "minato-city",
  "takanawa-gateway-minato": "minato-city",
  "teamlab-planets": "koto-city",
  "harry-potter-studio": "nerima-city",
};

const removeParents = [
  "chofu-tokyo",
  "hachioji-tokyo",
  "machida-tokyo",
  "tachikawa-tokyo",
  "ome-tokyo",
  "tokyo-hinohara",
  "tokyo-mt-mitake",
  "tokyo-okutama",
  "yomiuriland",
];

let fixesApplied = 0;

for (const dest of destinations) {
  if (parentFixes[dest.id]) {
    if (!dest.relationships) dest.relationships = {};
    dest.relationships.parentDestinationId = parentFixes[dest.id];
    fixesApplied++;
    console.log(`Updated parent of ${dest.id} -> ${parentFixes[dest.id]}`);
  } else if (removeParents.includes(dest.id)) {
    if (dest.relationships && dest.relationships.parentDestinationId) {
      delete dest.relationships.parentDestinationId;
      fixesApplied++;
      console.log(`Removed invalid parent from ${dest.id}`);
    }
  }
}

fs.writeFileSync(
  filePath,
  JSON.stringify(destinations, null, 2) + "\n",
  "utf8",
);
console.log(`Successfully applied ${fixesApplied} relationship fixes.`);
