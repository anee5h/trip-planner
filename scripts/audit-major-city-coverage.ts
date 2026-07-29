import fs from "fs";
import path from "path";
import destinations from "../src/shared/data/destinations-index.json";
import type { Destination } from "../src/shared/types/destination";
import { V192_CITY_EXPANSION } from "./v1.9.2-major-city-manifest";

const catalog = destinations as Destination[];
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const names = new Map<string, Destination[]>();
for (const destination of catalog) {
  for (const value of [
    destination.id,
    destination.name,
    destination.nameJa,
    ...(destination.aliases || []),
  ]) {
    if (!value) continue;
    const key = normalize(value);
    names.set(key, [...(names.get(key) || []), destination]);
  }
}

const report = V192_CITY_EXPANSION.map((target) => {
  const currentChildren = catalog.filter(
    (destination) =>
      destination.relationships?.parentDestinationId === target.hubId,
  );
  const candidates = target.candidates.map((candidate) => {
    const matches = names.get(normalize(candidate.name)) || [];
    return {
      ...candidate,
      matches: matches.map((destination) => ({
        id: destination.id,
        name: destination.name,
        parentDestinationId:
          destination.relationships?.parentDestinationId ?? null,
      })),
      decision:
        matches.length === 0
          ? "add"
          : matches.length === 1
            ? "enrich-or-link"
            : "manual-duplicate-review",
    };
  });
  return {
    hubId: target.hubId,
    importance: catalog.find(({ id }) => id === target.hubId)?.importance,
    currentChildren: currentChildren.map(({ id }) => id),
    targetChildren: target.minimumChildren,
    missingCategories: [],
    standaloneCandidates: candidates
      .filter(({ matches }) =>
        matches.some(({ parentDestinationId }) => !parentDestinationId),
      )
      .map(({ name }) => name),
    expansionPriority: Math.max(
      0,
      target.minimumChildren - currentChildren.length,
    ),
    candidates,
  };
});

const outputPath = path.join(
  process.cwd(),
  "reports",
  "city-hub-coverage-report.json",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${report.length} hub audits to ${outputPath}`);
