/**
 * classify-dispositions — KAI-89 disposition builder (model-aware).
 *
 * Rebuilds scripts/audit/kai-89-dispositions.json from the CURRENT audit +
 * CURRENT index + agent classifications. Model-estimate clusters are
 * detected by PURE-FUNCTION value equality (run each field model on every
 * member; if every member's current value equals the model output, the
 * cluster is a documented model estimate). Self-contained and stable:
 * classification depends only on the deterministic models, never on the
 * derive report or a prior dispositions state.
 *
 * Run: npm run rebuild:kai-89-dispositions (after catalogue/model changes)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Destination } from "../../src/shared/types/destination";
import { loadTruth } from "./calibration";
import { budgetModel } from "./budget-model-v1";
import { seasonModel } from "./season-model-v1";
import { durationModel } from "./duration-model-v1";
import { walkingModel } from "./walking-model-v1";
import { comfortModel, crowdModel } from "./comfort-crowd-model-v1";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const index = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as Destination[];
const byId = new Map(index.map((d) => [d.id, d]));
const truth = loadTruth();
const audit = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "scripts/audit/kai-89-structured-template-audit.json"),
    "utf8",
  ),
) as {
  categories: Array<{
    category: string;
    clusters: Array<{
      id: string;
      ids: string[];
      count: number;
      value: unknown;
    }>;
  }>;
};
const corr = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "scripts/audit/kai-89-corrections.json"),
    "utf8",
  ),
) as {
  sections: Record<string, Array<{ id: string }> | undefined>;
};
const A = JSON.parse(
  fs.readFileSync("/tmp/kai89-audit/AgentA-ratings.json", "utf8"),
);
const B = JSON.parse(
  fs.readFileSync("/tmp/kai89-audit/AgentB-budget.json", "utf8"),
);
const C = JSON.parse(
  fs.readFileSync("/tmp/kai89-audit/AgentC-transport.json", "utf8"),
);
const D = JSON.parse(
  fs.readFileSync("/tmp/kai89-audit/AgentD-season-crowd-duration.json", "utf8"),
);

const idsOf = (list: Array<{ id: string } | string> | undefined) =>
  new Set(
    (list ?? [])
      .filter((i) => typeof i === "string" || i?.id)
      .map((i) => (typeof i === "string" ? i : i.id)),
  );
const correctedByCat: Record<string, Set<string>> = {
  ratings: idsOf(corr.sections.ratingMetadataDowngrade),
  budget: new Set([
    ...idsOf(corr.sections.budgetTicketCorrections),
    ...idsOf(corr.sections.budgetRebalanceOnly),
  ]),
  transport: idsOf(corr.sections.transportCorrections),
  season: idsOf(corr.sections.seasonBestMonths),
  visitDuration: new Set(),
  crowd: new Set(),
  comfort: new Set(),
  walking: new Set(),
};

const agentClusters: Record<
  string,
  Array<{ ids: Set<string>; category: string; reason: string }>
> = {
  ratings: A.perClusterClassification.map((c: any) => ({
    ids: new Set(c.ids ?? c.affectedIds ?? []),
    category: c.category,
    reason: (c.reason ?? "").slice(0, 300),
  })),
  budget: B.clusterClassification.map((c: any) => ({
    ids: new Set(c.ids ?? []),
    category: "B",
    reason: (c.rootCause ?? c.editorialNote ?? "").slice(0, 300),
  })),
  transport: C.clusters.map((c: any) => ({
    ids: new Set(c.ids.map((r: any) => (typeof r === "string" ? r : r.id))),
    category: c.class ?? "E",
    reason: (c.rootCause ?? c.rationale ?? "").slice(0, 300),
  })),
};
for (const cat of ["season", "visitDuration", "crowd", "comfort", "walking"]) {
  agentClusters[cat] = (D.subcategories[cat] ?? []).map((c: any) => ({
    ids: new Set(c.ids ?? []),
    category: c.category ?? "E",
    reason: (c.rootCause ?? c.note ?? "").slice(0, 300),
  }));
}

const trustedWalking = new Set(truth.trusted.walking ?? []);
const childCountById = new Map<string, number>();
for (const d of index) {
  const parent = d.relationships?.parentDestinationId;
  if (parent) childCountById.set(parent, (childCountById.get(parent) ?? 0) + 1);
}

/** Pure-function value equality: does every member's current value equal the model output? */
function isModelCluster(category: string, ids: string[]): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const rec = byId.get(id);
    if (!rec) return false;
    switch (category) {
      case "budget": {
        const out = budgetModel(rec, new Set([id]), index, truth);
        if (out.action !== "fill" || !out.budget) return false;
        return (
          rec.budgetMin === out.budget.budgetMin &&
          rec.budgetRecommended === out.budget.budgetRecommended &&
          rec.budgetMax === out.budget.budgetMax &&
          JSON.stringify(rec.budgetBreakdown) ===
            JSON.stringify(out.budget.breakdown)
        );
      }
      case "season": {
        const out = seasonModel(rec, new Set([id]));
        if (out.action === "set" && out.season) {
          return (
            JSON.stringify(rec.season) === JSON.stringify(out.season) &&
            JSON.stringify(rec.bestMonths) === JSON.stringify(out.bestMonths)
          );
        }
        if (out.action === "neutralize") {
          return (
            rec.season === undefined &&
            rec.bestMonths === undefined &&
            rec.seasonMetadata?.method === "unknown"
          );
        }
        return false;
      }
      case "visitDuration": {
        const out = durationModel(rec, new Set([id]), childCountById);
        return (
          out.action === "set" &&
          out.visitHours &&
          rec.recommendedVisitHours?.min === out.visitHours.min &&
          rec.recommendedVisitHours.max === out.visitHours.max
        );
      }
      case "walking": {
        const out = walkingModel(rec, new Set([id]), trustedWalking);
        if (out.action === "fill" || out.action === "convert")
          return rec.walkingMin === out.walkingMin;
        if (out.action === "clear" && out.walkingSunMin !== undefined)
          return rec.walkingSunMin === undefined;
        return false;
      }
      case "comfort": {
        const minutes =
          Number.isFinite(rec.walkingMin) && rec.walkingMin < 300
            ? rec.walkingMin
            : undefined;
        const out = comfortModel(rec, new Set([id]), minutes);
        return (
          out.action === "set" &&
          out.comfort &&
          JSON.stringify(rec.comfort) === JSON.stringify(out.comfort)
        );
      }
      case "crowd": {
        const out = crowdModel(rec, new Set([id]));
        return (
          out.action === "set" &&
          out.crowd &&
          JSON.stringify(rec.crowd) === JSON.stringify(out.crowd)
        );
      }
      default:
        return false;
    }
  });
}

const dispositions = {
  audit: "KAI-89 structured cluster dispositions",
  schemaVersion: 2,
  generatedAt: "2026-08-14",
  note: "Per-cluster reviewed disposition. category A-E; action: legitimate | corrected | confidence-gated | manual-review | model-estimate. model-estimate = cluster whose members all equal the documented KAI-89 model output (pure-function value equality, scripts/models/DESIGN.md); low-confidence provenance in editorial.fieldSources. The audit generator fails --check on unclassified clusters.",
  clusters: {} as Record<
    string,
    { category: string; action: string; reason: string }
  >,
};
let unmatched = 0;
let modelClusters = 0;
for (const cat of audit.categories) {
  const catCorrected = correctedByCat[cat.category] ?? new Set();
  for (const cl of cat.clusters) {
    const key = `${cat.category}:${cl.id}`;
    let entry: { category: string; action: string; reason: string };
    if (isModelCluster(cat.category, cl.ids)) {
      entry = {
        category: "C",
        action: "model-estimate",
        reason:
          "KAI-89 model estimate: all members derived by the documented model (scripts/models/DESIGN.md); low-confidence provenance in editorial.fieldSources",
      };
      modelClusters++;
    } else {
      const currentIds = new Set(cl.ids);
      let best: { category: string; reason: string } | null = null;
      let bestOverlap = 0;
      for (const ac of agentClusters[cat.category] ?? []) {
        let overlap = 0;
        for (const id of currentIds) if (ac.ids.has(id)) overlap++;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = ac;
        }
      }
      if (
        best &&
        bestOverlap >= Math.min(3, currentIds.size) &&
        bestOverlap >= 0.5 * currentIds.size
      ) {
        const hasCorrection = [...currentIds].some((id) =>
          catCorrected.has(id),
        );
        let action: string;
        if (best.category === "A") action = "legitimate";
        else if (hasCorrection) action = "corrected";
        else if (cat.category === "ratings") action = "confidence-gated";
        else action = "manual-review";
        entry = { category: best.category, action, reason: best.reason };
      } else {
        entry = {
          category: "E",
          action: "manual-review",
          reason:
            "unclassified by KAI-89 audit agents; requires editorial review",
        };
        unmatched++;
      }
    }
    dispositions.clusters[key] = entry;
  }
}
fs.writeFileSync(
  path.join(rootDir, "scripts/audit/kai-89-dispositions.json"),
  JSON.stringify(dispositions, null, 1),
);
const total = audit.categories.reduce((s, c) => s + c.clusterCount, 0);
const byAction: Record<string, number> = {};
for (const e of Object.values(dispositions.clusters))
  byAction[e.action] = (byAction[e.action] ?? 0) + 1;
console.log(
  `dispositions: ${Object.keys(dispositions.clusters).length}/${total} | model-estimate: ${modelClusters} | unmatched: ${unmatched} |`,
  JSON.stringify(byAction),
);
