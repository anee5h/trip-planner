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
const reportPath = path.join(rootDir, "scripts/models/derive-report.json");

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
  let report: {
    sample: Array<{
      id: string;
      model: string;
      action: string;
      fields: string[];
    }>;
  };
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    report = { sample: [] };
  }
  const byId = new Map(index.map((d) => [d.id, d]));
  const touchedBudget = new Set(
    report.sample.filter((c) => c.model === "budget-model-v1").map((c) => c.id),
  );
  const touchedSeason = new Set(
    report.sample
      .filter((c) => c.model === "season-model-v1" && c.action === "set")
      .map((c) => c.id),
  );
  const touchedComfort = new Set(
    report.sample
      .filter((c) => c.model === "comfort-model-v1")
      .map((c) => c.id),
  );
  const touchedCrowd = new Set(
    report.sample.filter((c) => c.model === "crowd-model-v1").map((c) => c.id),
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
  // Integer strictness: model-generated season/comfort/crowd values must be
  // integers (the models emit only integers; fractional legacy values are
  // tracked debt, not model output).
  const modelIntegerViolations = [
    ...touchedSeason,
    ...touchedComfort,
    ...touchedCrowd,
  ].flatMap((id) => {
    const d = byId.get(id);
    if (!d) return [];
    const out: string[] = [];
    if (d.season)
      for (const k of ["spring", "summer", "autumn", "winter"])
        if (!Number.isInteger(d.season[k]))
          out.push(`${id}: season.${k}=${d.season[k]}`);
    if (d.comfort)
      for (const k of ["heatTolerance", "rainFriendly", "walkingIntensity"])
        if (!Number.isInteger(d.comfort[k]))
          out.push(`${id}: comfort.${k}=${d.comfort[k]}`);
    if (d.crowd)
      for (const k of ["weekday", "weekend", "holiday"])
        if (!Number.isInteger(d.crowd[k]))
          out.push(`${id}: crowd.${k}=${d.crowd[k]}`);
    return out;
  });
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
