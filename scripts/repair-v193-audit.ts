import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import catalogJson from "../src/shared/data/destinations-index.json";
import type { Destination } from "../src/shared/types/destination";

const root = process.cwd();
const indexPath = path.join(root, "src/shared/data/destinations-index.json");
const detailsDirectory = path.join(root, "public/data/destinations");
const auditSummary =
  "Canonicalized type, localized categories, budgets, ratings, and transport semantics";

const baseline = JSON.parse(
  execFileSync(
    "git",
    ["show", "v1.9.2:src/shared/data/destinations-index.json"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  ),
) as Destination[];
const baselineById = new Map(
  baseline.map((destination) => [destination.id, destination]),
);
const catalog = structuredClone(catalogJson) as Destination[];

const canonicalWeatherDependence = (value: string | undefined) => {
  const normalized = value?.toLowerCase();
  if (
    normalized === "low" ||
    normalized === "moderate" ||
    normalized === "high"
  )
    return normalized;
  if (normalized === "medium") return "moderate";
  return undefined;
};

for (const destination of catalog) {
  if (!destination.tags?.includes("v1.9.2")) continue;
  const previous = baselineById.get(destination.id);
  if (!previous)
    throw new Error(`Missing v1.9.2 baseline for ${destination.id}`);

  for (const field of [
    "kind",
    "categories",
    "tags",
    "indoorPercent",
    "comfort",
    "ratings",
    "transportOptions",
    "totalTripHours",
    "budgetBreakdown",
  ] as const) {
    destination[field] = structuredClone(previous[field]);
  }
  destination.weatherDependence = canonicalWeatherDependence(
    previous.weatherDependence,
  );
  destination.ratingMetadata = {
    rubricVersion: 1,
    method: "assisted",
    confidence: "low",
  };
  destination.status = "beta";
  if (destination.editorial) {
    const changes = (destination.editorial.changes || []).filter(
      (change) => change.summary !== auditSummary,
    );
    changes.push({
      changedAt: "2026-07-29",
      changedBy: "TabiMap data audit",
      summary: auditSummary,
      method: "assisted",
    });
    destination.editorial.changes = changes;
    destination.editorial.lifecycle = "in_review";
    destination.editorial.freshness = "review_due";
    destination.editorial.changeSummary =
      "v1.9.3 semantic audit; awaiting individual editorial review";
    delete destination.editorial.reviewedAt;
    delete destination.editorial.reviewedBy;
  }
}

const ameya = catalog.find(({ id }) => id === "ameya-yokocho");
if (ameya) {
  ameya.kind = "shopping";
  ameya.categories = ["Shopping", "Food"];
  ameya.tags = Array.from(new Set([...ameya.tags, "Shopping", "Food"]));
  ameya.highlights = ameya.categories;
  if (ameya.content) {
    ameya.content.en.highlights = ameya.categories;
    ameya.content.ja.highlights = ["ショッピング", "グルメ"];
  }
  if (ameya.budgetBreakdown) {
    ameya.budgetBreakdown.tickets = 0;
    ameya.budgetRecommended = Object.values(ameya.budgetBreakdown).reduce(
      (total, value) => total + value,
      0,
    );
  }
}

for (const id of ["boso-no-mura", "chiba-sawara", "katori-jingu"]) {
  const destination = catalog.find((item) => item.id === id);
  if (!destination) continue;
  delete destination.relationships?.parentDestinationId;
  destination.role = "standalone";
  delete destination.areaId;
}
const narita = catalog.find(({ id }) => id === "narita-city");
if (narita?.relationships) {
  const related = ["boso-no-mura", "chiba-sawara", "katori-jingu"];
  narita.relationships.featuredDestinationIds =
    narita.relationships.featuredDestinationIds?.filter(
      (id) => !related.includes(id),
    );
  narita.relationships.relatedDestinationIds = Array.from(
    new Set([
      ...(narita.relationships.relatedDestinationIds || []),
      ...related,
    ]),
  );
}
const animalKingdom = catalog.find(({ id }) => id === "kobe-animal-kingdom");
if (animalKingdom) animalKingdom.areaId = "port-island";

fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
for (const destination of catalog.filter(
  (item) => item.tags?.includes("v1.9.2") || item.id === "narita-city",
)) {
  fs.writeFileSync(
    path.join(detailsDirectory, `${destination.id}.json`),
    `${JSON.stringify(destination, null, 2)}\n`,
  );
}

console.log(
  "Restored v1.9.2 operational data for 160 assisted expansion records.",
);
