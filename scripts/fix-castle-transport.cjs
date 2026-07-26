const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(filePath, "utf8"));

console.log(`Loaded ${destinations.length} destinations.`);

const transportDefaults = {
  "nagoya-castle-aichi": { train: 100, shinkansen: 40 },
  "hachioji-castle-tokyo": { train: 60 },
  "nikko-toshogu-shrine-tochigi": { train: 120 },
  "matsumoto-castle-nagano": { train: 160 },
  "inuyama-castle-aichi": { train: 110 },
};

let fixesApplied = 0;

for (const dest of destinations) {
  if (transportDefaults[dest.id]) {
    dest.transportOptions = transportDefaults[dest.id];
    fixesApplied++;
    console.log(`Added transportOptions to ${dest.id}`);
  }
}

fs.writeFileSync(filePath, JSON.stringify(destinations, null, 2), "utf8");
console.log(`Applied ${fixesApplied} transportOptions schema fixes.`);
