/**
 * derive:destination-models — KAI-89 deterministic catalogue models.
 *
 * Orchestrates the field models (budget/season/duration/walking/comfort/
 * crowd/transport) over the ELIGIBLE records only (template or unknown
 * fields under the KAI-89 dispositions), enforcing override precedence:
 * source-verified and trusted records are never touched. Every change
 * carries provenance (editorial.fieldSources with type "calculated",
 * seasonMetadata/transportMetadata).
 *
 * Modes:
 *   dry-run (default) — print the change plan + counts, write
 *     scripts/models/derive-report.json, NO index changes.
 *   --apply         — write the index (plus the report).
 *   --check         — fail (exit 1) if applying would change the index
 *                     (CI staleness gate; idempotence guard).
 *
 * Run: npm run derive:destination-models [--apply|--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Destination } from "../src/shared/types/destination";
import { loadTruth } from "./models/calibration";
import { budgetModel } from "./models/budget-model-v1";
import { seasonModel } from "./models/season-model-v1";
import { durationModel } from "./models/duration-model-v1";
import { walkingModel } from "./models/walking-model-v1";
import { comfortModel, crowdModel } from "./models/comfort-crowd-model-v1";
import { transportModel } from "./models/transport-access-v1";
import type { TransportMode } from "../src/shared/services/transport/types";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const indexPath = path.join(rootDir, "src/shared/data/destinations-index.json");
const dispositionsPath = path.join(
  rootDir,
  "scripts/audit/kai-89-dispositions.json",
);
const reportPath = path.join(rootDir, "scripts/models/derive-report.json");

interface Change {
  id: string;
  model: string;
  action: string;
  reason: string;
  fields: string[];
}

function addFieldSource(d: Destination, field: string, summary: string) {
  // Never CREATE an editorial block: a fabricated lifecycle would falsely
  // de-gate records from reviewed-content discovery. Records without an
  // editorial block keep their provenance in the derive report +
  // dispositions + seasonMetadata/transportMetadata instead.
  if (!d.editorial) return;
  if (!d.editorial.fieldSources) d.editorial.fieldSources = {};
  d.editorial.fieldSources[field] = [
    {
      type: "calculated",
      url: "catalogue-model://kai-89",
      title: summary,
      accessedAt: "2026-08-14",
    },
  ];
}

function main() {
  const apply = process.argv.includes("--apply");
  const check = process.argv.includes("--check");
  const destinations = JSON.parse(
    fs.readFileSync(indexPath, "utf8"),
  ) as Destination[];
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const truth = loadTruth();
  const dispositions = JSON.parse(
    fs.readFileSync(dispositionsPath, "utf8"),
  ) as {
    clusters: Record<string, { action: string }>;
  };
  const audit = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, "scripts/audit/kai-89-structured-template-audit.json"),
      "utf8",
    ),
  ) as {
    categories: Array<{
      category: string;
      clusters: Array<{ id: string; ids: string[] }>;
    }>;
  };
  const corrections = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, "scripts/audit/kai-89-corrections.json"),
      "utf8",
    ),
  ) as { sections: Record<string, Array<{ id: string }> | undefined> };
  const topology = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, "src/shared/data/transport-topology.json"),
      "utf8",
    ),
  ) as { zones: Array<{ id: string; localModes: string[] }> };
  const zoneLocalModes = new Map<string, readonly TransportMode[]>(
    topology.zones.map((z) => [z.id, z.localModes as TransportMode[]]),
  );

  // ---- eligibility: records in manual-review clusters per field ----
  // model-estimate clusters are ALSO eligible: the models must be able to
  // re-derive their own outputs (idempotent — same input, same output), and
  // downstream derivations (comfort from walkingMin) depend on the walking
  // model owning its filled values.
  const manualByField: Record<string, Set<string>> = {};
  for (const cat of audit.categories) {
    const set = new Set<string>();
    for (const cl of cat.clusters) {
      const action = dispositions.clusters[`${cat.category}:${cl.id}`]?.action;
      if (action === "manual-review" || action === "model-estimate") {
        for (const id of cl.ids) set.add(id);
      }
    }
    manualByField[cat.category] = set;
  }
  const budgetEligible = new Set(manualByField.budget ?? []);
  // Records without a budget (published non-hub, unmarked) are eligible so
  // the budget model can either fill them (verified ticket + sufficient
  // peers) or write the explicit-unknown marker (owner policy: unknown stays
  // unknown, but it must be MARKED neutral, not silently missing).
  for (const d of destinations) {
    if (
      d.status === "published" &&
      d.role !== "hub" &&
      d.budgetRecommended === undefined &&
      d.budgetMetadata?.method !== "unknown"
    ) {
      budgetEligible.add(d.id);
    }
  }
  const seasonEligible = new Set(manualByField.season ?? []);
  for (const d of destinations)
    if (!d.season || !d.bestMonths?.length) seasonEligible.add(d.id);
  const durationEligible = new Set(manualByField.visitDuration ?? []);
  const walkingEligible = new Set(manualByField.walking ?? []);
  for (const d of destinations)
    if (d.walkingMin === undefined) walkingEligible.add(d.id);
  const comfortEligible = new Set(manualByField.comfort ?? []);
  const crowdEligible = new Set(manualByField.crowd ?? []);
  const transportEligible = new Set(manualByField.transport ?? []);

  const trustedWalking = new Set(truth.trusted.walking ?? []);
  const sourceVerifiedTransport = new Set<string>();
  for (const c of corrections.sections.transportCorrections ?? [])
    sourceVerifiedTransport.add(c.id);
  for (const id of [
    "naha-city",
    "kokusai-dori-naha",
    "naminoue-shrine-naha",
    "fukushuen-garden-naha",
  ])
    sourceVerifiedTransport.add(id);

  const childCountById = new Map<string, number>();
  for (const d of destinations) {
    const parent = d.relationships?.parentDestinationId;
    if (parent)
      childCountById.set(parent, (childCountById.get(parent) ?? 0) + 1);
  }

  const changes: Change[] = [];
  const touch = (
    d: Destination,
    model: string,
    action: string,
    reason: string,
    fields: string[],
  ) => {
    changes.push({ id: d.id, model, action, reason, fields });
  };
  const changed = (before: unknown, after: unknown) =>
    JSON.stringify(before) !== JSON.stringify(after);
  // Persistent model-touched ledger: every record each model made a decision
  // for this run (even when the value was already applied), consumed by the
  // disposition builder and validate-models for model-scoped classification.
  const touchedByModel: Record<string, string[]> = {};
  const markTouched = (model: string, id: string) => {
    (touchedByModel[model] ??= []).push(id);
  };

  for (const d of destinations) {
    const beforeBudget = {
      min: d.budgetMin,
      rec: d.budgetRecommended,
      max: d.budgetMax,
      breakdown: d.budgetBreakdown,
    };
    const b = budgetModel(d, budgetEligible, destinations, truth);
    if (b.action !== "keep") markTouched("budget-model-v1", d.id);
    if (b.action === "fill" && b.budget) {
      d.budgetMin = b.budget.budgetMin;
      d.budgetRecommended = b.budget.budgetRecommended;
      d.budgetMax = b.budget.budgetMax;
      d.budgetBreakdown = b.budget.breakdown;
      // budgetMetadata written unconditionally (idempotent): already-filled
      // records must keep their model provenance marker.
      if (d.budgetMetadata?.method !== "model") {
        d.budgetMetadata = {
          method: "model",
          modelVersion: "budget-model-v1",
          confidence: b.confidence,
          basis: b.reason,
        };
      }
      if (
        changed(beforeBudget, {
          min: d.budgetMin,
          rec: d.budgetRecommended,
          max: d.budgetMax,
          breakdown: d.budgetBreakdown,
        })
      ) {
        addFieldSource(d, "budgetRecommended", `budget-model-v1; ${b.reason}`);
        touch(d, "budget-model-v1", "fill", b.reason, [
          "budgetMin",
          "budgetRecommended",
          "budgetMax",
          "budgetBreakdown",
        ]);
      }
    } else if (b.action === "keep" && b.reason.includes("verified ticket")) {
      // Verified admission preserved but no model budget (insufficient peers):
      // mark explicit-unknown so the record is not counted as missing.
      if (d.budgetMetadata?.method !== "unknown") {
        d.budgetMetadata = {
          method: "unknown",
          modelVersion: "budget-model-v1",
          confidence: "unknown",
          basis: b.reason,
        };
      }
    } else if (b.action === "clear-to-unknown") {
      const before = {
        min: d.budgetMin,
        rec: d.budgetRecommended,
        max: d.budgetMax,
        breakdown: d.budgetBreakdown,
      };
      delete (d as Partial<Destination>).budgetMin;
      delete (d as Partial<Destination>).budgetRecommended;
      delete (d as Partial<Destination>).budgetMax;
      delete (d as Partial<Destination>).budgetBreakdown;
      // budgetMetadata is written unconditionally (idempotent): records
      // already cleared by a previous run must still carry the explicit
      // unknown marker so validators treat it as neutral, not missing.
      if (d.budgetMetadata?.method !== "unknown") {
        d.budgetMetadata = {
          method: "unknown",
          modelVersion: "budget-model-v1",
          confidence: "unknown",
          basis: b.reason,
        };
      }
      if (
        changed(before, {
          min: d.budgetMin,
          rec: d.budgetRecommended,
          max: d.budgetMax,
          breakdown: d.budgetBreakdown,
        })
      ) {
        touch(d, "budget-model-v1", "clear-to-unknown", b.reason, [
          "budgetMin",
          "budgetRecommended",
          "budgetMax",
          "budgetBreakdown",
        ]);
      }
    }

    const beforeSeason = {
      season: d.season,
      bestMonths: d.bestMonths,
      bestSeason: d.bestSeason,
    };
    const s = seasonModel(d, seasonEligible);
    if (s.action !== "keep") markTouched("season-model-v1", d.id);
    if (s.action === "set" && s.season) {
      d.season = s.season;
      d.bestMonths = s.bestMonths;
      if (s.bestSeason) d.bestSeason = s.bestSeason;
      d.seasonMetadata = {
        method: "model",
        modelVersion: s.metadata.modelVersion,
        confidence: s.metadata.confidence,
        basis: s.metadata.basis,
      };
      if (
        changed(beforeSeason, {
          season: d.season,
          bestMonths: d.bestMonths,
          bestSeason: d.bestSeason,
        })
      ) {
        touch(d, "season-model-v1", "set", s.reason, [
          "season",
          "bestMonths",
          "bestSeason",
        ]);
      }
    } else if (s.action === "neutralize") {
      delete (d as Partial<Destination>).season;
      delete (d as Partial<Destination>).bestMonths;
      delete (d as Partial<Destination>).bestSeason;
      d.seasonMetadata = {
        method: "unknown",
        modelVersion: s.metadata.modelVersion,
        confidence: "unknown",
        basis: s.metadata.basis,
      };
      if (
        changed(beforeSeason, {
          season: d.season,
          bestMonths: d.bestMonths,
          bestSeason: d.bestSeason,
        })
      ) {
        touch(d, "season-model-v1", "neutralize", s.reason, [
          "season",
          "bestMonths",
          "bestSeason",
        ]);
      }
    }

    // Season vector for source-corrected bestMonths (ledger R0.5): records
    // whose bestMonths are source-verified must not keep the all-12
    // template vector that contradicts them (e.g. abashiri drift-ice
    // [1,2,3] with summer-biased template scores). The vector is derived
    // from the bestMonths peak season.
    if (s.action === "keep" || s.action === "neutralize") {
      const sourceBestMonths = corrections.sections.seasonBestMonths ?? [];
      const entry = sourceBestMonths.find((c) => c.id === d.id);
      if (entry && Array.isArray(d.bestMonths) && d.bestMonths.length > 0) {
        const seasonScores = { spring: 5, summer: 5, autumn: 5, winter: 5 };
        const monthToSeason: Record<
          number,
          "spring" | "summer" | "autumn" | "winter"
        > = {
          3: "spring",
          4: "spring",
          5: "spring",
          6: "summer",
          7: "summer",
          8: "summer",
          9: "autumn",
          10: "autumn",
          11: "autumn",
          12: "winter",
          1: "winter",
          2: "winter",
        };
        for (const m of d.bestMonths) seasonScores[monthToSeason[m]] += 2;
        const peak = (
          Object.entries(seasonScores) as Array<
            [keyof typeof seasonScores, number]
          >
        ).sort((a, b) => b[1] - a[1])[0][0];
        const vector = { spring: 5, summer: 5, autumn: 5, winter: 5 };
        vector[peak] = 10;
        const secondary = (
          Object.entries(seasonScores) as Array<
            [keyof typeof seasonScores, number]
          >
        ).sort((a, b) => b[1] - a[1])[1];
        if (secondary[1] > 5) vector[secondary[0]] = 8;
        d.season = vector;
        d.seasonMetadata = {
          method: "model",
          modelVersion: "season-model-v1",
          confidence: "medium",
          basis: `source-corrected bestMonths ${JSON.stringify(d.bestMonths)} (ledger seasonBestMonths)`,
        };
        if (
          changed(beforeSeason, {
            season: d.season,
            bestMonths: d.bestMonths,
            bestSeason: d.bestSeason,
          })
        ) {
          touch(
            d,
            "season-model-v1",
            "set",
            "vector derived from source-corrected bestMonths peak",
            ["season"],
          );
        }
      }
    }

    const beforeDur = d.recommendedVisitHours;
    const dur = durationModel(d, durationEligible, childCountById);
    if (dur.action !== "keep") markTouched(dur.modelVersion, d.id);
    if (dur.action === "set" && dur.visitHours) {
      d.recommendedVisitHours = dur.visitHours;
      if (changed(beforeDur, d.recommendedVisitHours)) {
        addFieldSource(
          d,
          "recommendedVisitHours",
          `${dur.modelVersion}; ${dur.reason}`,
        );
        touch(d, dur.modelVersion, "set", dur.reason, [
          "recommendedVisitHours",
        ]);
      }
    }

    const w = walkingModel(d, walkingEligible, trustedWalking);
    if (w.action !== "keep") markTouched("walking-model-v1", d.id);
    let walkingMinutes: number | undefined;
    if (w.action === "convert" || w.action === "fill") {
      const before = { min: d.walkingMin, intensity: d.walkingIntensity };
      d.walkingMin = w.walkingMin;
      d.walkingIntensity = w.walkingIntensity;
      walkingMinutes = w.walkingMin;
      if (
        changed(before, { min: d.walkingMin, intensity: d.walkingIntensity })
      ) {
        addFieldSource(d, "walkingMin", `walking-model-v1; ${w.reason}`);
        touch(d, "walking-model-v1", w.action, w.reason, [
          "walkingMin",
          "walkingIntensity",
        ]);
      }
    } else if (w.action === "clear") {
      const before = {
        min: d.walkingMin,
        sun: d.walkingSunMin,
        shade: d.walkingShadeMin,
      };
      if (w.walkingSunMin !== undefined) {
        delete (d as Partial<Destination>).walkingSunMin;
        delete (d as Partial<Destination>).walkingShadeMin;
      }
      if (w.walkingMin === 0) delete (d as Partial<Destination>).walkingMin;
      if (
        changed(before, {
          min: d.walkingMin,
          sun: d.walkingSunMin,
          shade: d.walkingShadeMin,
        })
      ) {
        touch(
          d,
          "walking-model-v1",
          "clear",
          w.reason,
          w.walkingSunMin !== undefined
            ? ["walkingSunMin", "walkingShadeMin"]
            : ["walkingMin"],
        );
      }
    } else {
      // Legacy values < 300 are minute-scale; metre-typed legacy values
      // (>= 300) are unit-invalid and must not produce an intensity. Values
      // WRITTEN by the walking model above are minutes by construction.
      walkingMinutes =
        Number.isFinite(d.walkingMin) && d.walkingMin < 300
          ? d.walkingMin
          : undefined;
    }

    const beforeComfort = d.comfort;
    const c = comfortModel(d, comfortEligible, walkingMinutes);
    if (c.action !== "keep") markTouched("comfort-model-v1", d.id);
    if (c.action === "set" && c.comfort) {
      d.comfort = c.comfort;
      if (changed(beforeComfort, d.comfort)) {
        addFieldSource(d, "comfort", `comfort-model-v1; ${c.reason}`);
        touch(d, "comfort-model-v1", "set", c.reason, ["comfort"]);
      }
    } else if (
      d.comfort &&
      (d.comfort.walkingIntensity < 1 || d.comfort.walkingIntensity > 10)
    ) {
      // FIX_CONTRADICTION (workbook P0): impossible walkingIntensity values
      // (step-scale contamination like 12/20) are corrected by deriving the
      // intensity from walkingMin, never by clamping the corrupt value.
      d.comfort = {
        ...d.comfort,
        walkingIntensity:
          walkingMinutes !== undefined
            ? Math.max(
                1,
                Math.min(
                  10,
                  walkingMinutes <= 45 ? 3 : walkingMinutes <= 95 ? 5 : 8,
                ),
              )
            : 5,
      };
      if (changed(beforeComfort, d.comfort)) {
        addFieldSource(
          d,
          "comfort",
          `comfort-model-v1; FIX_CONTRADICTION impossible walkingIntensity derived from walkingMin`,
        );
        touch(
          d,
          "comfort-model-v1",
          "fix-contradiction",
          "impossible walkingIntensity corrected",
          ["comfort.walkingIntensity"],
        );
      }
    }

    const beforeCrowd = d.crowd;
    const cr = crowdModel(d, crowdEligible);
    if (cr.action !== "keep") markTouched("crowd-model-v1", d.id);
    if (cr.action === "set" && cr.crowd) {
      d.crowd = cr.crowd;
      if (changed(beforeCrowd, d.crowd)) {
        addFieldSource(d, "crowd", `crowd-model-v1; ${cr.reason}`);
        touch(d, "crowd-model-v1", "set", cr.reason, ["crowd"]);
      }
    }

    const beforeTransportMeta = d.transportMetadata;
    const t = transportModel(
      d,
      transportEligible,
      sourceVerifiedTransport,
      zoneLocalModes,
    );
    if (t.action !== "keep") markTouched("transport-access-v1", d.id);
    if (t.action === "tag" && t.metadata) {
      d.transportMetadata = t.metadata;
      if (changed(beforeTransportMeta, d.transportMetadata)) {
        touch(d, "transport-access-v1", "tag", t.reason, ["transportMetadata"]);
      }
    }
  }

  // ---- model-output cluster detection (stable: pure-function value equality) ----
  // A cluster whose members' CURRENT field values all equal the model's
  // deterministic output for that field is a documented model-estimate
  // cluster (used by the disposition builder; independent of eligibility).
  const auditForClusters = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, "scripts/audit/kai-89-structured-template-audit.json"),
      "utf8",
    ),
  ) as {
    categories: Array<{
      category: string;
      clusters: Array<{ id: string; ids: string[] }>;
    }>;
  };
  const modelClusterIds: string[] = [];
  for (const cat of auditForClusters.categories) {
    for (const cl of cat.clusters) {
      const allMatch = cl.ids.every((id) => {
        const rec = byId.get(id);
        if (!rec) return false;
        switch (cat.category) {
          case "budget": {
            const out = budgetModel(rec, new Set([id]), destinations, truth);
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
                JSON.stringify(rec.bestMonths) ===
                  JSON.stringify(out.bestMonths)
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
      if (cl.ids.length > 0 && allMatch)
        modelClusterIds.push(`${cat.category}:${cl.id}`);
    }
  }

  const report = {
    modelVersion: "kai-89-models-v1",
    generatedAt: "2026-08-14",
    changes: changes.length,
    byModel: Object.entries(
      changes.reduce<Record<string, number>>((acc, c) => {
        acc[c.model] = (acc[c.model] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]),
    sample: changes.slice(0, 25).map((c) => ({ ...c })),
    // Full change list consumed by validate-models.ts gates (model-scoped).
    allChanges: changes.map((c) => ({
      id: c.id,
      model: c.model,
      action: c.action,
      fields: c.fields,
    })),
    touchedRecords: touchedByModel,
    modelClusterIds,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (apply) {
    fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(`Applied ${changes.length} model changes. Index written.`);
  } else if (check) {
    if (changes.length > 0) {
      console.error(
        `KAI-89 model outputs are stale: ${changes.length} change(s) pending. Run npm run derive:destination-models --apply.`,
      );
      process.exit(1);
    }
    console.log("KAI-89 model outputs are current.");
  } else {
    console.log(
      `Dry run: ${changes.length} changes pending. See ${path.relative(rootDir, reportPath)}.`,
    );
  }
}

main();
