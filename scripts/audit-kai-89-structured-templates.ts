import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import type { Destination } from "../src/shared/types/destination.js";

const MIN_CLUSTER_SIZE = 3;
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const catalogPath = path.join(
  rootDir,
  "src/shared/data/destinations-index.json",
);
const reportPath = path.join(
  rootDir,
  "scripts/audit/kai-89-structured-template-audit.json",
);

type Category =
  | "ratings"
  | "budget"
  | "visitDuration"
  | "walking"
  | "season"
  | "transport"
  | "crowd"
  | "comfort";

const selectors: Record<Category, (destination: Destination) => unknown> = {
  ratings: (d) => d.ratings,
  budget: (d) =>
    d.budgetMin !== undefined ||
    d.budgetRecommended !== undefined ||
    d.budgetMax !== undefined ||
    d.budgetBreakdown !== undefined
      ? {
          budgetMin: d.budgetMin,
          budgetRecommended: d.budgetRecommended,
          budgetMax: d.budgetMax,
          budgetBreakdown: d.budgetBreakdown,
        }
      : undefined,
  visitDuration: (d) => d.recommendedVisitHours,
  walking: (d) =>
    d.walkingMin !== undefined ||
    d.walkingSunMin !== undefined ||
    d.walkingShadeMin !== undefined
      ? {
          walkingMin: d.walkingMin,
          walkingSunMin: d.walkingSunMin,
          walkingShadeMin: d.walkingShadeMin,
        }
      : undefined,
  season: (d) =>
    d.season !== undefined || d.bestMonths !== undefined
      ? { season: d.season, bestMonths: d.bestMonths }
      : undefined,
  transport: (d) => d.transportOptions,
  crowd: (d) => d.crowd,
  comfort: (d) => d.comfort,
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function signature(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function buildReport(destinations: Destination[]) {
  const categories = Object.entries(selectors).map(([category, select]) => {
    const groups = new Map<string, string[]>();
    for (const destination of destinations) {
      const value = select(destination);
      if (value === undefined) continue;
      const key = signature(value);
      const ids = groups.get(key) ?? [];
      ids.push(destination.id);
      groups.set(key, ids);
    }

    const clusters = [...groups.entries()]
      .filter(([, ids]) => ids.length >= MIN_CLUSTER_SIZE)
      .map(([value, ids]) => ({
        id: createHash("sha256")
          .update(`${category}:${value}`)
          .digest("hex")
          .slice(0, 12),
        severity: category === "ratings" ? "warning" : "review",
        count: ids.length,
        ids: ids.sort(),
        value: JSON.parse(value) as unknown,
      }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    const affectedIds = [
      ...new Set(clusters.flatMap((cluster) => cluster.ids)),
    ].sort();
    return {
      category,
      severity: category === "ratings" ? "warning" : "review",
      clusterCount: clusters.length,
      affectedRecordCount: affectedIds.length,
      affectedIds,
      clusters,
    };
  });

  const allAffectedIds = [
    ...new Set(categories.flatMap((category) => category.affectedIds)),
  ].sort();
  const missingRatingMetadataIds = destinations
    .filter((destination) => destination.ratingMetadata === undefined)
    .map((destination) => destination.id)
    .sort();

  return {
    audit: "KAI-89 structured template audit",
    schemaVersion: 1,
    auditedAt: "2026-08-13",
    rule: `Exact canonical-value clusters with at least ${MIN_CLUSTER_SIZE} records; absent values are excluded. Clusters indicate review risk, not proof that every repeated value is wrong.`,
    totalRecords: destinations.length,
    summary: {
      categoryCount: categories.length,
      clusterCount: categories.reduce(
        (sum, item) => sum + item.clusterCount,
        0,
      ),
      affectedRecordCount: allAffectedIds.length,
      affectedIds: allAffectedIds,
      ratingConfidenceGate: {
        missingMetadataRecordCount: missingRatingMetadataIds.length,
        implicitFullTrustBefore: missingRatingMetadataIds.length,
        implicitFullTrustAfter: 0,
        appliedReliability: 0.5,
        affectedIds: missingRatingMetadataIds,
      },
      remainingManualDebt: {
        genericTemplateCopyRecords: 81,
        missingBudgetRecords: 226,
        missingSeasonRecords: 217,
      },
    },
    categories,
  };
}

const destinations = JSON.parse(
  fs.readFileSync(catalogPath, "utf8"),
) as Destination[];
const output = await format(JSON.stringify(buildReport(destinations)), {
  parser: "json",
});

if (process.argv.includes("--check")) {
  const committed = fs.existsSync(reportPath)
    ? fs.readFileSync(reportPath, "utf8")
    : "";
  if (committed !== output) {
    console.error(
      "KAI-89 structured-template audit is stale. Run npm run audit:kai-89-structured-templates.",
    );
    process.exit(1);
  }
  console.log("KAI-89 structured-template audit is current.");
} else {
  fs.writeFileSync(reportPath, output);
  console.log(`Wrote ${path.relative(rootDir, reportPath)}.`);
}
