const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(filePath, "utf8"));

const destMap = new Map(destinations.map((d) => [d.id, d]));

let issues = 0;

for (const dest of destinations) {
  const parentId = dest.relationships?.parentDestinationId;
  if (!parentId) continue;

  const parent = destMap.get(parentId);

  // 1. Parent exists
  if (!parent) {
    console.error(`❌ [${dest.id}] Parent '${parentId}' does not exist!`);
    issues++;
    continue;
  }

  // 2. Parent role is hub
  if (parent.role !== "hub") {
    console.warn(
      `⚠️ [${dest.id}] Parent '${parentId}' role is '${parent.role}', expected 'hub'!`,
    );
  }

  // 3. Prefecture match
  if (parent.prefecture !== dest.prefecture) {
    console.error(
      `❌ [${dest.id}] Prefecture mismatch: child '${dest.prefecture}' vs parent '${parent.prefecture}'!`,
    );
    issues++;
  }

  // 4. Check for suspicious 'chiyoda-city' assignments
  if (parentId === "chiyoda-city") {
    const isChiyoda =
      dest.name.includes("Chiyoda") ||
      dest.name.includes("Akihabara") ||
      dest.name.includes("Imperial Palace") ||
      dest.name.includes("Kanda") ||
      dest.name.includes("Marunouchi") ||
      dest.name.includes("Jimbocho") ||
      dest.name.includes("Yasukuni") ||
      dest.name.includes("Hibiya") ||
      dest.name.includes("Nagatacho");
    if (!isChiyoda) {
      console.warn(
        `❓ [${dest.id}] '${dest.name}' (${dest.prefecture}) has parent 'chiyoda-city' — verify if correct!`,
      );
    }
  }
}

console.log(`\nAudit complete. Found ${issues} critical errors.`);
