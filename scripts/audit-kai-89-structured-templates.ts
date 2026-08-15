import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import type { Destination } from "../src/shared/types/destination.js";

const MIN_CLUSTER_SIZE = 3;
/**
 * Stable audit date stamped into the report. Deliberately NOT derived from
 * the clock: --check byte-compares the regenerated report with the committed
 * file, so a wall-clock date would make CI fail on UTC rollover even when no
 * catalogue data changed. Bump this only when the audit semantics or the
 * catalogue state materially change.
 */
const AUDITED_AT = "2026-08-13";
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
const dispositionsPath = path.join(
  rootDir,
  "scripts/audit/kai-89-dispositions.json",
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
  // Empty transportOptions {} is the honest "no local-access data" state for
  // ~300 records (matches collectTransportClusters in data-quality-rules.ts);
  // it is not a repeated-value risk and is excluded from clustering.
  transport: (d) =>
    d.transportOptions && Object.keys(d.transportOptions).length > 0
      ? d.transportOptions
      : undefined,
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

// Mirror of GENERIC_TEMPLATE_COPY in scripts/audit/data-quality-rules.ts.
const GENERIC_TEMPLATE_COPY =
  /visitor destination in|visitor hub in|travel hub in|A top recommended attraction in|訪問者向けの観光地|curated destination within|popular tourist spot in|popular tourist destination in|art and culture hub|有名な観光スポット|アートとカルチャーの拠点/i;
function destinationCopy(dest: Destination): string {
  return JSON.stringify({
    notes: dest.notes,
    description: dest.description,
    notesJa: dest.notesJa,
    content: dest.content,
  });
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
      .map(([value, ids]) => {
        const id = createHash("sha256")
          .update(`${category}:${value}`)
          .digest("hex")
          .slice(0, 12);
        return {
          id,
          severity: category === "ratings" ? "warning" : "review",
          count: ids.length,
          ids: ids.sort(),
          value: JSON.parse(value) as unknown,
          disposition: dispositions.clusters[`${category}:${id}`] ?? {
            category: "E",
            action: "manual-review",
            reason: "unclassified — requires editorial review",
          },
        };
      })
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
  // Manual-debt counts are COMPUTED from the data with the same predicates as
  // scripts/audit/data-quality-rules.ts (G9/G7/A codes), never hardcoded.
  const genericTemplateCopyRecords = destinations.filter((d) =>
    GENERIC_TEMPLATE_COPY.test(destinationCopy(d)),
  ).length;
  const missingBudgetRecords = destinations.filter(
    (d) =>
      d.status === "published" &&
      d.role !== "hub" &&
      d.budgetRecommended === undefined &&
      d.budgetMetadata?.method !== "unknown" &&
      d.budgetMetadata?.method !== "manual",
  ).length;
  const missingSeasonRecords = destinations.filter(
    (d) =>
      d.status === "published" &&
      d.role !== "hub" &&
      d.seasonMetadata?.method !== "unknown" &&
      (!d.season || !d.bestMonths?.length),
  ).length;
  const dispositionCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const category of categories) {
    for (const cluster of category.clusters) {
      const d = cluster.disposition;
      dispositionCounts[d.action] = (dispositionCounts[d.action] ?? 0) + 1;
      categoryCounts[d.category] = (categoryCounts[d.category] ?? 0) + 1;
    }
  }

  return {
    audit: "KAI-89 structured template audit",
    schemaVersion: 1,
    // Stable committed stamp, not the current clock (see AUDITED_AT note).
    auditedAt: AUDITED_AT,
    rule: `Exact canonical-value clusters with at least ${MIN_CLUSTER_SIZE} records; absent values are excluded (empty transportOptions {} is excluded as the honest no-data state). Clusters indicate review risk, not proof that every repeated value is wrong. Disposition per cluster is reviewed in scripts/audit/kai-89-dispositions.json.`,
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
        genericTemplateCopyRecords,
        missingBudgetRecords,
        missingSeasonRecords,
        // Deliberately neutral (explicit markers written by the KAI-89 models)
        // — distinct from missing, which is the error class above.
        explicitlyUnknownBudget: destinations.filter(
          (d) =>
            d.status === "published" && d.budgetMetadata?.method === "unknown",
        ).length,
        explicitlyUnknownSeason: destinations.filter(
          (d) =>
            d.status === "published" && d.seasonMetadata?.method === "unknown",
        ).length,
      },
      // KAI-89 3-state score presentation (finishing pass): every published
      // record resolves to verified (trusted rating metadata), estimated
      // (deterministic score from the trusted season vector), or unavailable
      // (renders a localized "Score unavailable" note — never blank, never
      // the old generic wording). Estimated values are labeled "est." and
      // never earn verified-only badges/claims.
      // KAI-89 3-state score presentation (final pass): every published
      // record carries persisted scoreMetadata (verified editorial OR
      // deterministic Overall-Destination Rubric v1 estimated). Targets:
      // 0 unavailable, 0 unresolved, 0 blank.
      publishedScoreStates: {
        verified: destinations.filter(
          (d) =>
            d.status === "published" && d.scoreMetadata?.state === "verified",
        ).length,
        estimated: destinations.filter(
          (d) =>
            d.status === "published" && d.scoreMetadata?.state === "estimated",
        ).length,
        unavailable: destinations.filter(
          (d) =>
            d.status === "published" &&
            d.scoreMetadata?.state === "unavailable",
        ).length,
      },
      dispositionCounts,
      categoryCounts,
    },
    categories,
  };
}

const destinations = JSON.parse(
  fs.readFileSync(catalogPath, "utf8"),
) as Destination[];
const dispositions = fs.existsSync(dispositionsPath)
  ? (JSON.parse(fs.readFileSync(dispositionsPath, "utf8")) as {
      clusters: Record<
        string,
        {
          category: string;
          action: string;
          reason: string;
        }
      >;
    })
  : { clusters: {} };
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
  // Every cluster must carry a reviewed disposition; an unclassified cluster
  // fails the gate so new repeated-value clusters cannot silently appear.
  const report = JSON.parse(output) as ReturnType<typeof buildReport>;
  const unclassified = report.categories.flatMap((category) =>
    category.clusters.filter(
      (cluster) =>
        cluster.disposition.reason ===
        "unclassified — requires editorial review",
    ),
  );
  if (unclassified.length > 0) {
    console.error(
      `KAI-89 gate: ${unclassified.length} cluster(s) lack a reviewed disposition:`,
    );
    for (const cluster of unclassified) {
      console.error(
        `  ${cluster.id} ${JSON.stringify(cluster.value).slice(0, 80)} (${cluster.ids.length} records)`,
      );
    }
    console.error(
      "Classify them in scripts/audit/kai-89-dispositions.json, then regenerate.",
    );
    process.exit(1);
  }
  console.log("KAI-89 structured-template audit is current.");
} else {
  fs.writeFileSync(reportPath, output);
  console.log(`Wrote ${path.relative(rootDir, reportPath)}.`);
}
