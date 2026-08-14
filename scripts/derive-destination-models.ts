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
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Destination } from "../src/shared/types/destination";
import { loadTruth } from "./models/calibration";
import { budgetModel } from "./models/budget-model-v1";
import { seasonModel } from "./models/season-model-v1";
import { durationModel } from "./models/duration-model-v1";
import {
  walkingModel,
  isModelOwnedWalkingMinutes,
} from "./models/walking-model-v1";
import { comfortModel, crowdModel } from "./models/comfort-crowd-model-v1";
import { transportModel } from "./models/transport-access-v1";
import type { TransportMode } from "../src/shared/services/transport/types";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// ---------------------------------------------------------------------------
// Report state (pure; exported for tests)
// ---------------------------------------------------------------------------

export interface ReportShape {
  modelVersion: string;
  generatedAt: string;
  pendingChanges: number;
  pendingByModel: Array<[string, number]>;
  touchedRecords: Record<string, string[]>;
  modelClusterIds: string[];
  historyNote: string;
  lastApplied:
    | {
        at: string | null;
        changeCount: number | null;
        byModel: Array<[string, number]>;
        note?: string;
        sample?: Array<{
          id: string;
          model: string;
          action: string;
          reason: string;
        }>;
      }
    | undefined;
}

export interface ReportChange {
  id: string;
  model: string;
  action: string;
  reason: string;
  fields: string[];
}

const HISTORY_NOTE =
  "Migration evidence from applies before the KAI-89 final correction pass was overwritten by a zero-change apply; preserved evidence starts at the first non-zero apply after this fix.";

/**
 * Decide the next report state. PURE: never writes, never mutates inputs.
 *
 * lastApplied semantics (owner review):
 *  - --check writes nothing (caller enforces) and never alters state;
 *  - --apply with changes.length > 0 records the migration evidence
 *    (timestamp, count, byModel, representative sample);
 *  - --apply with changes.length === 0 PRESERVES the committed lastApplied
 *    exactly — a converged catalogue must not erase the migration record.
 */
export function nextReport(
  committed: Partial<ReportShape> | undefined,
  changes: ReportChange[],
  touchedByModel: Record<string, string[]>,
  modelClusterIds: string[],
  apply: boolean,
): ReportShape {
  const pendingByModel = Object.entries(
    changes.reduce<Record<string, number>>((acc, c) => {
      acc[c.model] = (acc[c.model] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]) as Array<[string, number]>;
  const report: ReportShape = {
    modelVersion: "kai-89-models-v1",
    generatedAt: "2026-08-14",
    pendingChanges: changes.length,
    pendingByModel,
    touchedRecords: touchedByModel,
    modelClusterIds,
    historyNote: committed?.historyNote ?? HISTORY_NOTE,
    lastApplied: committed?.lastApplied ?? {
      at: null,
      changeCount: null,
      byModel: [],
      note: "No non-zero migration recorded yet; pre-fix evidence was overwritten by a zero-change apply (KAI-89 final correction pass).",
    },
  };
  if (apply && changes.length > 0) {
    report.lastApplied = {
      at: new Date().toISOString().slice(0, 16),
      changeCount: changes.length,
      byModel: pendingByModel,
      sample: changes.slice(0, 25).map((c) => ({
        id: c.id,
        model: c.model,
        action: c.action,
        reason: c.reason,
      })),
    };
  }
  return report;
}
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
      metadata: d.budgetMetadata,
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
      // Metadata participates in change detection: deleting/corrupting
      // budgetMetadata with the numbers intact must fail --check (provenance
      // is part of the derived state, not decoration).
      if (
        changed(beforeBudget, {
          min: d.budgetMin,
          rec: d.budgetRecommended,
          max: d.budgetMax,
          breakdown: d.budgetBreakdown,
          metadata: d.budgetMetadata,
        })
      ) {
        addFieldSource(d, "budgetRecommended", `budget-model-v1; ${b.reason}`);
        touch(d, "budget-model-v1", "fill", b.reason, [
          "budgetMin",
          "budgetRecommended",
          "budgetMax",
          "budgetBreakdown",
          "budgetMetadata",
        ]);
      }
    } else if (b.action === "keep" && b.reason.includes("verified ticket")) {
      // Verified admission preserved but no model budget (insufficient
      // peers): the record's budget is ACCEPTED DEBT (legacy numbers with a
      // verified ticket), not unknown and not model-derived. method "manual"
      // keeps the numbers usable while the basis states the ticket fact;
      // "unknown" would create two competing truths (metadata unknown but
      // numbers present) — the budget guards treat "unknown" as authoritative
      // and would hide the verified ticket.
      const beforeMeta = d.budgetMetadata;
      if (d.budgetMetadata?.method !== "manual") {
        d.budgetMetadata = {
          method: "manual",
          modelVersion: "budget-model-v1",
          confidence: "low",
          basis: b.reason,
        };
      }
      if (changed(beforeMeta, d.budgetMetadata)) {
        touch(d, "budget-model-v1", "keep", b.reason, ["budgetMetadata"]);
      }
    } else if (b.action === "clear-to-unknown") {
      const before = {
        min: d.budgetMin,
        rec: d.budgetRecommended,
        max: d.budgetMax,
        breakdown: d.budgetBreakdown,
        metadata: d.budgetMetadata,
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
      // Obsolete field sources die with the numbers (no stale 'calculated'
      // claims on a cleared record).
      if (d.editorial?.fieldSources) {
        for (const f of [
          "budgetMin",
          "budgetRecommended",
          "budgetMax",
          "budgetBreakdown",
        ]) {
          delete d.editorial.fieldSources[f];
        }
      }
      if (
        changed(before, {
          min: d.budgetMin,
          rec: d.budgetRecommended,
          max: d.budgetMax,
          breakdown: d.budgetBreakdown,
          metadata: d.budgetMetadata,
        })
      ) {
        touch(d, "budget-model-v1", "clear-to-unknown", b.reason, [
          "budgetMin",
          "budgetRecommended",
          "budgetMax",
          "budgetBreakdown",
          "budgetMetadata",
        ]);
      }
    }

    const beforeSeason = {
      season: d.season,
      bestMonths: d.bestMonths,
      bestSeason: d.bestSeason,
      metadata: d.seasonMetadata,
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
      // seasonMetadata participates in change detection: corrupting or
      // deleting it with the vector intact must fail --check.
      if (
        changed(beforeSeason, {
          season: d.season,
          bestMonths: d.bestMonths,
          bestSeason: d.bestSeason,
          metadata: d.seasonMetadata,
        })
      ) {
        touch(d, "season-model-v1", "set", s.reason, [
          "season",
          "bestMonths",
          "bestSeason",
          "seasonMetadata",
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
      // Obsolete seasonal field sources die with the vector (no stale
      // 'calculated' claims on a neutralized record).
      if (d.editorial?.fieldSources) {
        for (const f of ["season", "bestMonths", "bestSeason"]) {
          delete d.editorial.fieldSources[f];
        }
      }
      if (
        changed(beforeSeason, {
          season: d.season,
          bestMonths: d.bestMonths,
          bestSeason: d.bestSeason,
          metadata: d.seasonMetadata,
        })
      ) {
        touch(d, "season-model-v1", "neutralize", s.reason, [
          "season",
          "bestMonths",
          "bestSeason",
          "seasonMetadata",
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
            metadata: d.seasonMetadata,
          })
        ) {
          touch(
            d,
            "season-model-v1",
            "set",
            "vector derived from source-corrected bestMonths peak",
            ["season", "seasonMetadata"],
          );
        }
      }
    }

    const beforeDur = {
      visitHours: d.recommendedVisitHours,
      metadata: d.durationMetadata,
    };
    const dur = durationModel(d, durationEligible, childCountById);
    if (dur.action !== "keep") markTouched(dur.modelVersion, d.id);
    if (dur.action === "set" && dur.visitHours) {
      d.recommendedVisitHours = dur.visitHours;
      d.durationMetadata = {
        method: "model",
        modelVersion: dur.modelVersion,
        confidence: dur.confidence,
        basis: dur.reason,
      };
      // durationMetadata participates in change detection (provenance
      // corruption with the window intact must fail --check).
      if (
        changed(beforeDur, {
          visitHours: d.recommendedVisitHours,
          metadata: d.durationMetadata,
        })
      ) {
        addFieldSource(
          d,
          "recommendedVisitHours",
          `${dur.modelVersion}; ${dur.reason}`,
        );
        touch(d, dur.modelVersion, "set", dur.reason, [
          "recommendedVisitHours",
          "durationMetadata",
        ]);
      }
    }

    const w = walkingModel(d, walkingEligible, trustedWalking);
    if (w.action !== "keep") markTouched("walking-model-v1", d.id);
    let walkingMinutes: number | undefined;
    if (w.action === "convert" || w.action === "fill") {
      const before = {
        min: d.walkingMin,
        intensity: d.walkingIntensity,
        metadata: d.walkingMetadata,
      };
      d.walkingMin = w.walkingMin;
      d.walkingIntensity = w.walkingIntensity;
      walkingMinutes = w.walkingMin;
      d.walkingMetadata = {
        method: "model",
        unit: "minutes",
        modelVersion: "walking-model-v1",
        confidence: w.confidence,
        basis: w.reason,
      };
      if (
        changed(before, {
          min: d.walkingMin,
          intensity: d.walkingIntensity,
          metadata: d.walkingMetadata,
        })
      ) {
        addFieldSource(d, "walkingMin", `walking-model-v1; ${w.reason}`);
        touch(d, "walking-model-v1", w.action, w.reason, [
          "walkingMin",
          "walkingIntensity",
          "walkingMetadata",
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
      if (w.walkingMin === 0) {
        delete (d as Partial<Destination>).walkingMin;
        // Obsolete walking sources die with the value.
        if (d.editorial?.fieldSources) {
          delete d.editorial.fieldSources.walkingMin;
        }
      }
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
      // WRITTEN by the walking model above are minutes by construction —
      // the authoritative ownership test (isModelOwnedWalkingMinutes) also
      // admits model-owned >= 300 values (300/360/480/576), so their
      // comfort.walkingIntensity stays derived.
      walkingMinutes =
        Number.isFinite(d.walkingMin) &&
        (d.walkingMin < 300 || isModelOwnedWalkingMinutes(d))
          ? d.walkingMin
          : undefined;
    }

    // ---- Split-integrity guard (ALL records, incl. non-eligible) ----
    // Data-integrity fix, not a model estimate: sun/shade splits are
    // SUBSETS of walkingMin. Batch-template splits that are unit-invalid
    // (metre-typed total with splits), violate the subset bound (sum >
    // total), or are synthetic partitions (sum ≈ total) are cleared even
    // on manual/trusted records — a wrong unit or impossible subset is
    // never kept as a fact (review: Abashiri 360/1500/2500).
    const hasSunSplit = Number.isFinite(d.walkingSunMin);
    const hasShadeSplit = Number.isFinite(d.walkingShadeMin);
    if (hasSunSplit || hasShadeSplit) {
      const splitSum =
        (hasSunSplit ? (d.walkingSunMin as number) : 0) +
        (hasShadeSplit ? (d.walkingShadeMin as number) : 0);
      // Single authoritative ownership test (walkingMetadata OR legacy
      // fieldSources) — a model-owned value >= 300 is MINUTES, never metres.
      const modelOwnedMinutes = isModelOwnedWalkingMinutes(d);
      const minIsMetre =
        Number.isFinite(d.walkingMin) &&
        (d.walkingMin as number) >= 300 &&
        !modelOwnedMinutes;
      const splitInvalid =
        Number.isFinite(d.walkingMin) === false ||
        splitSum > (d.walkingMin as number) ||
        (Number.isFinite(d.walkingMin) &&
          Math.abs(splitSum - (d.walkingMin as number)) <=
            Math.max(1, (d.walkingMin as number) * 0.05)) ||
        (minIsMetre && splitSum > 0) ||
        // No provenance at all: splits without a fieldSources entry are
        // batch-template residue (review rule: explicit provenance or clear).
        !(
          (d.editorial?.fieldSources?.walkingSunMin?.length ?? 0) > 0 ||
          (d.editorial?.fieldSources?.walkingShadeMin?.length ?? 0) > 0
        );
      if (splitInvalid) {
        const beforeSplits = { sun: d.walkingSunMin, shade: d.walkingShadeMin };
        delete (d as Partial<Destination>).walkingSunMin;
        delete (d as Partial<Destination>).walkingShadeMin;
        if (
          changed(beforeSplits, {
            sun: d.walkingSunMin,
            shade: d.walkingShadeMin,
          })
        ) {
          markTouched("walking-model-v1", d.id);
          touch(
            d,
            "walking-model-v1",
            "clear",
            "split-integrity guard: unit-invalid or synthetic sun/shade split cleared (FIX_UNIT)",
            ["walkingSunMin", "walkingShadeMin"],
          );
        }
      }
    }

    const beforeComfort = {
      comfort: d.comfort,
      metadata: d.comfortMetadata,
    };
    const c = comfortModel(d, comfortEligible, walkingMinutes);
    if (c.action !== "keep") markTouched("comfort-model-v1", d.id);
    if (c.action === "set" && c.comfort) {
      d.comfort = c.comfort;
      d.comfortMetadata = {
        method: "model",
        modelVersion: "comfort-model-v1",
        confidence: c.confidence,
        basis: c.reason,
      };
      // comfortMetadata participates in change detection (provenance
      // corruption with the vector intact must fail --check).
      if (
        changed(beforeComfort, {
          comfort: d.comfort,
          metadata: d.comfortMetadata,
        })
      ) {
        addFieldSource(d, "comfort", `comfort-model-v1; ${c.reason}`);
        touch(d, "comfort-model-v1", "set", c.reason, [
          "comfort",
          "comfortMetadata",
        ]);
      }
    } else if (c.action === "unknown") {
      // Explicit neutral: no indoorPercent input -> comfort cannot be
      // derived; the template vector is cleared (never kept as a fact).
      // Runs even when the comfort field is ALREADY absent — stale
      // fieldSources.comfort must be cleared on already-neutralized records.
      if (d.comfort !== undefined) {
        delete (d as Partial<Destination>).comfort;
      }
      if (d.editorial?.fieldSources) {
        delete d.editorial.fieldSources.comfort;
      }
      const beforeMeta = d.comfortMetadata;
      if (d.comfortMetadata?.method !== "unknown") {
        d.comfortMetadata = {
          method: "unknown",
          modelVersion: "comfort-model-v1",
          confidence: "unknown",
          basis: c.reason,
        };
      }
      if (
        d.comfort !== undefined ||
        changed(beforeMeta, d.comfortMetadata) ||
        changed(beforeComfort.metadata, d.comfortMetadata)
      ) {
        touch(d, "comfort-model-v1", "neutralize", c.reason, [
          "comfort",
          "comfortMetadata",
        ]);
      }
    } else if (
      d.comfort &&
      d.comfort.walkingIntensity !== undefined &&
      (d.comfort.walkingIntensity < 1 || d.comfort.walkingIntensity > 10)
    ) {
      // FIX_CONTRADICTION (workbook P0): impossible walkingIntensity values
      // (step-scale contamination like 12/20) are corrected by deriving the
      // intensity from walkingMin, never by clamping the corrupt value.
      // Without a walkingMin the field is removed, never defaulted to 5.
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
            : undefined,
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

    const beforeCrowd = {
      crowd: d.crowd,
      metadata: d.crowdMetadata,
      fieldSources: d.editorial?.fieldSources?.crowd,
    };
    const cr = crowdModel(d, crowdEligible);
    if (cr.action !== "keep") markTouched("crowd-model-v1", d.id);
    if (cr.action === "set" && cr.crowd) {
      d.crowd = cr.crowd;
      d.crowdMetadata = {
        method: "model",
        modelVersion: "crowd-model-v1",
        confidence: cr.confidence,
        basis: cr.reason,
      };
      if (
        changed(beforeCrowd, {
          crowd: d.crowd,
          metadata: d.crowdMetadata,
        })
      ) {
        addFieldSource(d, "crowd", `crowd-model-v1; ${cr.reason}`);
        touch(d, "crowd-model-v1", "set", cr.reason, [
          "crowd",
          "crowdMetadata",
        ]);
      }
    } else if (cr.action === "unknown") {
      // Explicit neutral: no runtime consumer; kind-derived bands would be
      // manufactured. Runs even when the crowd field is ALREADY absent —
      // stale fieldSources.crowd (claiming a calculated model result) must
      // be cleared on already-neutralized records too.
      if (d.crowd !== undefined) {
        delete (d as Partial<Destination>).crowd;
      }
      const beforeMeta = d.crowdMetadata;
      if (d.crowdMetadata?.method !== "unknown") {
        d.crowdMetadata = {
          method: "unknown",
          modelVersion: "crowd-model-v1",
          confidence: "unknown",
          basis: cr.reason,
        };
      }
      if (d.editorial?.fieldSources) {
        delete d.editorial.fieldSources.crowd;
      }
      if (
        d.crowd !== undefined ||
        changed(beforeMeta, d.crowdMetadata) ||
        changed(beforeCrowd.fieldSources, d.editorial?.fieldSources?.crowd)
      ) {
        touch(d, "crowd-model-v1", "neutralize", cr.reason, [
          "crowd",
          "crowdMetadata",
        ]);
      }
    }

    // ---- Stale-source sweep (idempotent, ALL records) ----
    // Records neutralized in an EARLIER run may no longer be eligible, so
    // the neutralize branch above never fires for them and their obsolete
    // fieldSources would survive forever (e.g. Hamarikyu/Engakuji still
    // claimed a calculated crowd model result after crowd neutralization).
    // Any record whose metadata declares the explicit-neutral state must
    // not carry a 'calculated' field source for that field.
    if (
      d.crowdMetadata?.method === "unknown" &&
      d.editorial?.fieldSources?.crowd
    ) {
      delete d.editorial.fieldSources.crowd;
      touch(
        d,
        "crowd-model-v1",
        "neutralize",
        "stale calculated crowd source cleared after neutralization",
        ["crowd"],
      );
    }
    if (
      d.comfortMetadata?.method === "unknown" &&
      d.editorial?.fieldSources?.comfort
    ) {
      delete d.editorial.fieldSources.comfort;
      touch(
        d,
        "comfort-model-v1",
        "neutralize",
        "stale calculated comfort source cleared after neutralization",
        ["comfort"],
      );
    }
    if (
      d.seasonMetadata?.method === "unknown" &&
      d.editorial?.fieldSources &&
      (d.editorial.fieldSources.season ||
        d.editorial.fieldSources.bestMonths ||
        d.editorial.fieldSources.bestSeason)
    ) {
      delete d.editorial.fieldSources.season;
      delete d.editorial.fieldSources.bestMonths;
      delete d.editorial.fieldSources.bestSeason;
      touch(
        d,
        "season-model-v1",
        "neutralize",
        "stale calculated season sources cleared after neutralization",
        ["season"],
      );
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
              Number.isFinite(rec.walkingMin) &&
              (rec.walkingMin < 300 || isModelOwnedWalkingMinutes(rec))
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

  // ---- report ----
  // The report is a committed migration/ownership artifact: it always carries
  // touchedRecords (which records each model OWNS) and modelClusterIds, plus
  // the change list of the run. --check NEVER writes anything (no side
  // effects); --apply and dry-run write the report.
  const committed = fs.existsSync(reportPath)
    ? (JSON.parse(fs.readFileSync(reportPath, "utf8")) as Partial<ReportShape>)
    : undefined;
  // Ownership is DERIVED FROM CURRENT METADATA (provenance is the unit),
  // never accumulated from past runs: a record is model-owned exactly when
  // its CURRENT metadata declares the model's modelVersion. This makes the
  // ledger self-healing AND precedence-safe — when a source-verified or
  // manual correction supersedes a model value, the metadata is replaced
  // and the record stops being model-owned (validate gates must not keep
  // applying model rules to records the model no longer owns). A permanent
  // union would fight the stated precedence rule source-verified > model.
  const ownedByMetadataModel = (modelVersion: string) => (d: Destination) =>
    d.seasonMetadata?.modelVersion === modelVersion ||
    d.budgetMetadata?.modelVersion === modelVersion ||
    d.durationMetadata?.modelVersion === modelVersion ||
    d.comfortMetadata?.modelVersion === modelVersion ||
    d.crowdMetadata?.modelVersion === modelVersion ||
    d.transportMetadata?.modelVersion === modelVersion ||
    d.walkingMetadata?.modelVersion === modelVersion;
  const LEDGER_MODELS = [
    "budget-model-v1",
    "season-model-v1",
    "duration-model-v1",
    "hub-window-model-v1",
    "walking-model-v1",
    "comfort-model-v1",
    "crowd-model-v1",
    "transport-access-v1",
  ];
  const ledgerTouchedByModel = Object.fromEntries(
    LEDGER_MODELS.map((model) => [
      model,
      destinations
        .filter((d) => ownedByMetadataModel(model)(d))
        .map((d) => d.id),
    ]),
  ) as Record<string, string[]>;
  const report = nextReport(
    committed,
    changes,
    ledgerTouchedByModel,
    modelClusterIds,
    apply,
  );

  // --check writes NOTHING (no side effects); --apply and dry-run write the
  // report exactly once, after lastApplied has been decided by nextReport.
  // ORDER: apply writes the index FIRST, then the report — the report's
  // lastApplied evidence must never claim a migration the index did not
  // receive (if the index write fails, the report stays honest).
  if (apply) {
    fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(`Applied ${changes.length} model changes. Index written.`);
    if (!check) {
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
  } else if (check) {
    if (changes.length > 0) {
      console.error(
        `KAI-89 model outputs are stale: ${changes.length} change(s) pending. Run npm run derive:destination-models --apply.`,
      );
      process.exit(1);
    }
    console.log("KAI-89 model outputs are current.");
  } else {
    if (!check) {
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(
      `Dry run: ${changes.length} changes pending. See ${path.relative(rootDir, reportPath)}.`,
    );
  }
}

// Entrypoint guard: this module exports nextReport/ReportShape for tests;
// importing it must NOT run the generator (the dry-run path writes
// derive-report.json — a side effect that would corrupt the '--check writes
// nothing' integration test). Run main() only when executed directly.
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  main();
}
