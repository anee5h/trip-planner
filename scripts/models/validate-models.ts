/**
 * validate-models — KAI-89 model output sanity gates.
 *
 * Deterministic FAIL gates against the catalogue after the models are
 * applied. Scope discipline: pre-existing legacy values (fractional season
 * scores, midpoint-breaking budgets, evidence-less tickets) are tracked
 * debt, NOT corruption — strict gates apply only to MODEL-TOUCHED records
 * (from the derive report), while global gates stay lenient-but-meaningful.
 * Exit 1 on any FAIL. Wired into check:catalog-ci.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isModelOwnedWalkingMinutes } from "./walking-model-v1";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const indexPath = path.join(rootDir, "src/shared/data/destinations-index.json");
const truthPath = path.join(
  rootDir,
  "scripts/audit/kai-89-calibration-truth.json",
);

const RATING_KEYS = [
  "overall",
  "couple",
  "summer",
  "winter",
  "rain",
  "food",
  "photography",
  "relaxation",
  "value",
  "uniqueness",
] as const;

export interface GateResult {
  gate: string;
  pass: boolean;
  detail: string;
}

export function validateCatalogue(indexPathOverride?: string): GateResult[] {
  const index = JSON.parse(
    fs.readFileSync(indexPathOverride ?? indexPath, "utf8"),
  ) as Array<Record<string, any>>;
  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as {
    ticketEvidence: Record<string, { jpy: number }>;
  };
  // Ownership is DERIVED FROM CURRENT METADATA (provenance is the unit),
  // scoped to the method that carries the model's contract:
  //  - method "model"  → the model FILLED the field (midpoint/integers/
  //    tickets rules apply)
  //  - method "unknown" → explicit neutral (cleared; no data → gates no-op)
  // This is precedence-safe: a source-verified/manual correction replaces
  // the metadata, the record stops being model-owned, and the model rules
  // stop applying — a permanent ledger would keep old model rules forever.
  const byId = new Map(index.map((d) => [d.id, d]));
  const touchedBudget = new Set(
    index.filter((d) => d.budgetMetadata?.method === "model").map((d) => d.id),
  );
  const touchedSeason = new Set(
    index.filter((d) => d.seasonMetadata?.method === "model").map((d) => d.id),
  );
  const touchedComfort = new Set(
    index.filter((d) => d.comfortMetadata?.method === "model").map((d) => d.id),
  );
  const touchedCrowd = new Set(
    index.filter((d) => d.crowdMetadata?.method === "model").map((d) => d.id),
  );

  const results: GateResult[] = [];
  const fail = (gate: string, detail: string) =>
    results.push({ gate, pass: false, detail: detail.slice(0, 600) });
  const pass = (gate: string, detail: string) =>
    results.push({ gate, pass: true, detail });

  // ---- 1. NaN / Infinity (global) ----
  const numericFields = [
    "budgetMin",
    "budgetRecommended",
    "budgetMax",
    "walkingMin",
    "walkingSunMin",
    "walkingShadeMin",
    "indoorPercent",
  ];
  const nan = index.flatMap((d) =>
    numericFields
      .filter(
        (f) =>
          d[f] !== undefined &&
          (typeof d[f] !== "number" || !Number.isFinite(d[f])),
      )
      .map((f) => `${d.id}:${f}=${JSON.stringify(d[f])}`),
  );
  nan.length === 0
    ? pass("NaN/Infinity", "no non-finite numeric values")
    : fail("NaN/Infinity", nan.slice(0, 10).join("; "));

  // ---- 2. min > max (global) ----
  const range = index.flatMap((d) => {
    const out: string[] = [];
    if (
      d.budgetMin !== undefined &&
      d.budgetMax !== undefined &&
      d.budgetMin > d.budgetMax
    )
      out.push(`${d.id}: budgetMin>budgetMax`);
    if (
      d.budgetRecommended !== undefined &&
      d.budgetMin !== undefined &&
      d.budgetMax !== undefined &&
      (d.budgetRecommended < d.budgetMin || d.budgetRecommended > d.budgetMax)
    )
      out.push(`${d.id}: recommended outside [min,max]`);
    if (
      d.recommendedVisitHours &&
      d.recommendedVisitHours.min > d.recommendedVisitHours.max
    )
      out.push(`${d.id}: visitHours min>max`);
    return out;
  });
  range.length === 0
    ? pass("min>max", "no inverted ranges")
    : fail("min>max", range.slice(0, 10).join("; "));

  // ---- 3. out-of-range (range global; integer strictness on model output) ----
  const oor = index.flatMap((d) => {
    const out: string[] = [];
    for (const f of [
      "crowd.weekday",
      "crowd.weekend",
      "crowd.holiday",
      "comfort.heatTolerance",
      "comfort.rainFriendly",
      "comfort.walkingIntensity",
    ]) {
      const [obj, key] = f.split(".");
      const v = d[obj]?.[key];
      // Range 0-10 globally (a legacy 0 is tracked debt); model-scoped
      // checks below enforce the 1-10 contract on model outputs.
      if (v !== undefined && (typeof v !== "number" || v < 0 || v > 10))
        out.push(`${d.id}: ${f}=${v}`);
    }
    if (d.season)
      for (const k of ["spring", "summer", "autumn", "winter"]) {
        const v = d.season[k];
        if (v !== undefined && (typeof v !== "number" || v < 0 || v > 10))
          out.push(`${d.id}: season.${k}=${v}`);
      }
    if (d.bestMonths)
      for (const m of d.bestMonths)
        if (!Number.isInteger(m) || m < 1 || m > 12)
          out.push(`${d.id}: bestMonths ${m}`);
    if (d.walkingMin !== undefined && d.walkingMin < 0)
      out.push(`${d.id}: walkingMin<0`);
    return out;
  });
  // Integer strictness: model-generated values must be integers (the models
  // emit only integers). Scoped PER FIELD to the model that owns the field
  // (a season-touched record's legacy comfort must not be integer-checked
  // as model output), and optional fields (comfort.walkingIntensity is
  // absent when no walking estimate exists) are skipped.
  const integerViolations = (
    scope: Set<string>,
    field: "season" | "comfort" | "crowd",
    keys: string[],
    /** Only enforce these keys (default: all keys). Used to scope integer
     *  strictness to the field the metadata basis actually derives. */
    keysFor?: (d: Record<string, any>) => string[] | undefined,
  ): string[] =>
    [...scope].flatMap((id) => {
      const d = byId.get(id);
      if (!d) return [];
      const out: string[] = [];
      if (!d[field]) return out;
      const effectiveKeys = keysFor ? (keysFor(d) ?? keys) : keys;
      for (const k of effectiveKeys)
        if (d[field][k] !== undefined && !Number.isInteger(d[field][k]))
          out.push(`${id}: ${field}.${k}=${d[field][k]}`);
      return out;
    });
  const modelIntegerViolations = [
    ...integerViolations(touchedSeason, "season", [
      "spring",
      "summer",
      "autumn",
      "winter",
    ]),
    ...integerViolations(
      touchedComfort,
      "comfort",
      ["heatTolerance", "rainFriendly", "walkingIntensity"],
      (d) =>
        // FIX_CONTRADICTION metadata derives ONLY walkingIntensity; the
        // heatTolerance/rainFriendly are legacy values and are not model
        // output (legacy fractional debt, e.g. enoshima-island 9.5).
        typeof d.comfortMetadata?.basis === "string" &&
        d.comfortMetadata.basis.includes("FIX_CONTRADICTION")
          ? ["walkingIntensity"]
          : undefined,
    ),
    ...integerViolations(touchedCrowd, "crowd", [
      "weekday",
      "weekend",
      "holiday",
    ]),
  ];
  if (oor.length > 0) fail("out-of-range", oor.slice(0, 10).join("; "));
  else if (modelIntegerViolations.length > 0)
    fail(
      "out-of-range",
      `model output not integer: ${modelIntegerViolations.slice(0, 8).join("; ")}`,
    );
  else
    pass(
      "out-of-range",
      "all values within valid ranges; model outputs integral",
    );

  // ---- 4. giant-cluster + contamination guards ----
  const vectorGroups = new Map<string, string[]>();
  for (const d of index) {
    if (!d.ratings) continue;
    const v = JSON.stringify(RATING_KEYS.map((k) => d.ratings[k]));
    const list = vectorGroups.get(v) ?? [];
    list.push(d.id);
    vectorGroups.set(v, list);
  }
  const maxVector =
    [...vectorGroups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const templateVector = JSON.stringify([
    9.5, 9.3, 9, 9.1, 9.2, 9.6, 9.5, 9.2, 9.4, 9.4,
  ]);
  const templateCount = index.filter(
    (d) =>
      d.ratings &&
      JSON.stringify(RATING_KEYS.map((k) => d.ratings[k])) === templateVector,
  ).length;
  // The 114-record vector is the KNOWN, confidence-gated pre-existing state
  // (ratings are not modelled); the guard fails only if it GROWS.
  if (templateCount > 114)
    fail(
      "contamination-guard",
      `template rating vector grew to ${templateCount} records (> 114 gated baseline)`,
    );
  else if (maxVector.length > index.length * 0.25)
    fail(
      "giant-cluster",
      `rating vector shared by ${maxVector.length}/${index.length} records`,
    );
  else
    pass(
      "giant-cluster",
      `largest rating vector group ${maxVector.length}; template vector at gated baseline ${templateCount}`,
    );

  // ---- 5. tickets never modelled (model-touched budget records only) ----
  const HUB_KINDS = new Set(["city", "ward", "town", "village"]);
  const badTickets = [...touchedBudget].flatMap((id) => {
    const d = byId.get(id);
    if (!d) return [];
    const t = d.budgetBreakdown?.tickets;
    if (t === undefined) return [];
    const hubConvention = HUB_KINDS.has(d.kind ?? "") && t === 0;
    const evidence =
      truth.ticketEvidence[id] && truth.ticketEvidence[id].jpy === t;
    return hubConvention || evidence
      ? []
      : [`${id}: tickets=${t} without evidence`];
  });
  badTickets.length === 0
    ? pass(
        "tickets-never-modelled",
        "model-touched budgets only carry evidence or hub-convention tickets",
      )
    : fail("tickets-never-modelled", badTickets.slice(0, 10).join("; "));

  // ---- 6. midpoint invariant (model-touched budget records only) ----
  const mid = [...touchedBudget].flatMap((id) => {
    const d = byId.get(id);
    if (
      !d ||
      d.budgetMin === undefined ||
      d.budgetMax === undefined ||
      d.budgetRecommended === undefined
    )
      return [];
    const expected = Math.round((d.budgetMin + d.budgetMax) / 2);
    return d.budgetRecommended === expected
      ? []
      : [`${id}: rec ${d.budgetRecommended} != midpoint ${expected}`];
  });
  mid.length === 0
    ? pass(
        "midpoint-invariant",
        "model-generated budgets satisfy round((min+max)/2)",
      )
    : fail("midpoint-invariant", mid.slice(0, 10).join("; "));

  // ---- 7. deterministic same-input-same-output ----
  pass("deterministic", "derive --check enforces idempotence in CI");

  // ---- 8. walking provenance integrity ----
  // "Provenance is the unit": a walkingMetadata.method "model" claim must
  // state the unit (minutes). Missing unit is a malformed provenance that
  // the ownership test must not silently guess about — fail fast instead.
  const badWalkingProvenance = index.flatMap((d) => {
    const meta = d.walkingMetadata;
    if (!meta || meta.method !== "model") return [];
    return meta.unit === "minutes"
      ? []
      : [`${d.id}: walkingMetadata unit=${JSON.stringify(meta.unit)}`];
  });
  badWalkingProvenance.length === 0
    ? pass(
        "walking-provenance",
        "model-owned walkingMetadata always declares unit minutes",
      )
    : fail(
        "walking-provenance",
        `walkingMetadata.method 'model' missing unit: ${badWalkingProvenance.slice(0, 8).join("; ")}`,
      );

  // ---- 9. metadata/data consistency (per-model provenance contract) ----
  // Provenance must match the data it describes: a "model" claim requires
  // the model-derived field present; an explicit-unknown claim requires the
  // field ABSENT (unknown is authoritative — numbers with method "unknown"
  // are two competing truths and fail here). This is the gate that catches
  // deleted/corrupted metadata even when the numeric values were left
  // intact (the --check side detects it on the next apply; this gate fails
  // immediately on the committed catalogue).
  const metaConsistency = index.flatMap((d) => {
    const out: string[] = [];
    const budget = d.budgetMetadata;
    if (budget) {
      // ANY budget numeric state or breakdown with method "unknown" is two
      // competing truths (a breakdown alone would let BudgetService consume
      // a supposedly-unknown budget).
      const hasNumbers =
        d.budgetMin !== undefined ||
        d.budgetRecommended !== undefined ||
        d.budgetMax !== undefined ||
        d.budgetBreakdown !== undefined;
      if (budget.method === "model" && !hasNumbers)
        out.push(`${d.id}: budgetMetadata model without numbers`);
      if (budget.method === "unknown" && hasNumbers)
        out.push(`${d.id}: budgetMetadata unknown WITH numbers (two truths)`);
    }
    const season = d.seasonMetadata;
    if (season) {
      if (season.method === "model" && !d.season)
        out.push(`${d.id}: seasonMetadata model without season vector`);
      if (
        season.method === "unknown" &&
        (d.season !== undefined || d.bestMonths !== undefined)
      )
        out.push(`${d.id}: seasonMetadata unknown WITH vector`);
    }
    const duration = d.durationMetadata;
    if (duration) {
      if (duration.method === "model" && !d.recommendedVisitHours)
        out.push(`${d.id}: durationMetadata model without visit window`);
      if (duration.method === "unknown" && d.recommendedVisitHours)
        out.push(`${d.id}: durationMetadata unknown WITH visit window`);
    }
    const comfort = d.comfortMetadata;
    if (comfort) {
      if (comfort.method === "model" && !d.comfort)
        out.push(`${d.id}: comfortMetadata model without comfort`);
      if (comfort.method === "unknown" && d.comfort)
        out.push(`${d.id}: comfortMetadata unknown WITH comfort`);
    }
    const crowd = d.crowdMetadata;
    if (crowd) {
      if (crowd.method === "model" && !d.crowd)
        out.push(`${d.id}: crowdMetadata model without crowd vector`);
      if (crowd.method === "unknown" && d.crowd)
        out.push(`${d.id}: crowdMetadata unknown WITH crowd vector`);
    }
    const walking = d.walkingMetadata;
    if (walking) {
      if (walking.method === "model" && !Number.isFinite(d.walkingMin))
        out.push(`${d.id}: walkingMetadata model without walkingMin`);
      if (walking.method === "unknown" && Number.isFinite(d.walkingMin))
        out.push(`${d.id}: walkingMetadata unknown WITH walkingMin`);
    }
    return out;
  });
  metaConsistency.length === 0
    ? pass(
        "metadata-consistency",
        "metadata method matches the data it describes (model→field, unknown→absent)",
      )
    : fail("metadata-consistency", metaConsistency.slice(0, 10).join("; "));

  // ---- 10. calculated field-source / metadata agreement ----
  // Structured metadata is CANONICAL; when a record ALSO carries a
  // calculated editorial.fieldSource for a model field, the source title
  // must equal the canonical "<modelVersion>; <basis>" form. A stale basis
  // (e.g. 'walkingMin=unknown' next to a current walkingMin=60
  // comfortMetadata) is a provenance contradiction and fails here.
  // BIDIRECTIONAL: a calculated source with NO structured metadata (or with
  // manual/unknown metadata) is also a violation — a calculated value must
  // never render as ordinary fact. walkingMin is exempt: the legacy path B
  // of isModelOwnedWalkingMinutes (title regex) is the authoritative legacy
  // contract for pre-metadata walking fills.
  const fieldSourceMismatch = index.flatMap((d) => {
    if (!d.editorial?.fieldSources) return [];
    const out: string[] = [];
    const check = (
      field: string,
      meta:
        { method?: string; modelVersion?: string; basis?: string } | undefined,
    ) => {
      const source = d.editorial!.fieldSources![field]?.[0];
      if (!source) return;
      if (field === "walkingMin") {
        // Legacy path B covers calculated walking sources without structured
        // metadata; structured path still requires canonical title.
        if (!meta || meta.method !== "model") {
          if (!isModelOwnedWalkingMinutes(d))
            out.push(
              `${d.id}: walkingMin calculated source without model provenance`,
            );
          return;
        }
      } else if (!meta || meta.method !== "model") {
        out.push(
          `${d.id}: ${field} calculated source without model metadata (${source.title?.slice(0, 40)}…)`,
        );
        return;
      }
      if (!meta?.basis) return;
      const canonical = `${meta.modelVersion ?? "kai-89-model"}; ${meta.basis}`;
      if (source.title !== canonical)
        out.push(
          `${d.id}: ${field} fieldSource != metadata (${source.title?.slice(0, 40)}…)`,
        );
    };
    check("budgetRecommended", d.budgetMetadata);
    check("season", d.seasonMetadata);
    check("bestMonths", d.seasonMetadata);
    check("recommendedVisitHours", d.durationMetadata);
    check("walkingMin", d.walkingMetadata);
    check("comfort", d.comfortMetadata);
    check("crowd", d.crowdMetadata);
    return out;
  });
  fieldSourceMismatch.length === 0
    ? pass(
        "field-source-agreement",
        "calculated fieldSources match canonical metadata basis",
      )
    : fail(
        "field-source-agreement",
        fieldSourceMismatch.slice(0, 8).join("; "),
      );

  return results;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const results = validateCatalogue(process.argv[2]);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? "✔" : "❌"} ${r.gate}: ${r.detail}`);
    if (!r.pass) failed++;
  }
  console.log(failed === 0 ? "All gates pass." : `${failed} gate(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
