const fs = require("fs");
const path = require("path");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

const unescoDestinations = destinations.filter(
  (d) =>
    d.collections &&
    d.collections.some((c) => c.collectionId === "unesco-japan"),
);

console.log(`Total UNESCO tagged destinations: ${unescoDestinations.length}`);
unescoDestinations.forEach((d, idx) => {
  console.log(
    `${idx + 1}. [${d.id}] ${d.name} (${d.prefecture}) - Hero: ${d.heroImage}`,
  );
});
