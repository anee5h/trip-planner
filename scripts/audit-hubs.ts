import destinations from "../src/shared/data/destinations-index.json";

console.log("=== HUB & DESTINATION RELATIONSHIP AUDIT ===");

const destMap = new Map(destinations.map((d) => [d.id, d]));

// Collect all unique parentDestinationIds referenced
const parentIds = new Set<string>();
for (const d of destinations) {
  if (d.relationships?.parentDestinationId) {
    parentIds.add(d.relationships.parentDestinationId);
  }
}

console.log(`Total Destinations: ${destinations.length}`);
console.log(`Total Parent Hubs Referenced: ${parentIds.size}`);

console.log("\nRegistered Parent Hubs & Child Count:");
for (const hubId of parentIds) {
  const hub = destMap.get(hubId);
  const children = destinations.filter(
    (d) => d.relationships?.parentDestinationId === hubId,
  );
  if (hub) {
    console.log(
      ` - Hub: [${hub.id}] "${hub.name}" (${hub.prefecture}) -> ${children.length} child attractions`,
    );
    for (const child of children) {
      console.log(`     └─ Child: [${child.id}] "${child.name}"`);
    }
  } else {
    console.log(
      ` - DANGLING HUB ID: [${hubId}] referenced by ${children.length} destinations`,
    );
  }
}

console.log(
  "\nDestinations without parent links (Top-level cities/destinations):",
);
const topLevel = destinations.filter(
  (d) => !d.relationships?.parentDestinationId,
);
console.log(`Total Top-level Destinations: ${topLevel.length}`);

console.log("\nVerification Complete.");
