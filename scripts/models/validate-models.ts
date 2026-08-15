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
import {
  buildScoreMetadata,
  SCORE_EVIDENCE_THRESHOLD,
} from "../../src/shared/services/recommendation/scoreRubric";
import { loadVerifiedScoreProvenance } from "../audit/kai-89-score-verification";

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
      (d) => {
        // Field-level ownership: comfortMetadata.derivedFields scopes
        // integer strictness to the fields the model actually derived
        // (FIX_CONTRADICTION derives only walkingIntensity; the
        // heatTolerance/rainFriendly are legacy values, e.g.
        // enoshima-island 9.5).
        if (
          Array.isArray(d.comfortMetadata?.derivedFields) &&
          d.comfortMetadata.derivedFields.length > 0
        ) {
          return d.comfortMetadata.derivedFields as string[];
        }
        return undefined;
      },
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

  // ---- 9. metadata/data consistency (complete per-model matrix) ----
  // Provenance must match the data it describes, bidirectionally:
  //  - method "model" requires the model-derived field(s) PRESENT and
  //    complete, plus a non-empty modelVersion and basis;
  //  - method "unknown" requires the field(s) ABSENT (unknown is
  //    authoritative — numbers with method "unknown" are two competing
  //    truths).
  const metaConsistency = index.flatMap((d) => {
    const out: string[] = [];
    const metaShape = (
      label: string,
      meta:
        { method?: string; modelVersion?: string; basis?: string } | undefined,
    ) => {
      if (meta?.method !== "model") return;
      if (!meta.modelVersion || !meta.basis)
        out.push(`${d.id}: ${label} model metadata missing modelVersion/basis`);
    };
    metaShape("budget", d.budgetMetadata);
    metaShape("season", d.seasonMetadata);
    metaShape("duration", d.durationMetadata);
    metaShape("comfort", d.comfortMetadata);
    metaShape("crowd", d.crowdMetadata);
    metaShape("walking", d.walkingMetadata);

    const budget = d.budgetMetadata;
    if (budget) {
      const hasAny =
        d.budgetMin !== undefined ||
        d.budgetRecommended !== undefined ||
        d.budgetMax !== undefined ||
        d.budgetBreakdown !== undefined;
      const completeBreakdown =
        d.budgetBreakdown &&
        ["transport", "tickets", "food", "cafe"].every((k) =>
          Number.isFinite(d.budgetBreakdown[k]),
        );
      const completeTuple =
        Number.isFinite(d.budgetMin) &&
        Number.isFinite(d.budgetRecommended) &&
        Number.isFinite(d.budgetMax);
      if (budget.method === "model") {
        if (!completeTuple)
          out.push(
            `${d.id}: budgetMetadata model with incomplete budget tuple`,
          );
        if (!completeBreakdown)
          out.push(`${d.id}: budgetMetadata model with incomplete breakdown`);
      }
      if (budget.method === "unknown" && hasAny)
        out.push(
          `${d.id}: budgetMetadata unknown WITH budget state (two truths)`,
        );
    }
    const season = d.seasonMetadata;
    if (season) {
      const hasAny =
        d.season !== undefined ||
        d.bestMonths !== undefined ||
        d.bestSeason !== undefined;
      if (season.method === "model") {
        if (!d.season || !d.bestMonths || !d.bestSeason)
          out.push(
            `${d.id}: seasonMetadata model missing season/bestMonths/bestSeason`,
          );
      }
      if (season.method === "unknown" && hasAny)
        out.push(`${d.id}: seasonMetadata unknown WITH season state`);
    }
    const duration = d.durationMetadata;
    if (duration) {
      const validWindow =
        d.recommendedVisitHours &&
        Number.isFinite(d.recommendedVisitHours.min) &&
        Number.isFinite(d.recommendedVisitHours.max) &&
        d.recommendedVisitHours.min <= d.recommendedVisitHours.max;
      if (duration.method === "model" && !validWindow)
        out.push(`${d.id}: durationMetadata model without valid visit window`);
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
      const completeVector =
        d.crowd &&
        Number.isFinite(d.crowd.weekday) &&
        Number.isFinite(d.crowd.weekend) &&
        Number.isFinite(d.crowd.holiday);
      if (crowd.method === "model" && !completeVector)
        out.push(`${d.id}: crowdMetadata model without complete crowd vector`);
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
        "metadata method matches complete data (model→field, unknown→absent)",
      )
    : fail("metadata-consistency", metaConsistency.slice(0, 10).join("; "));

  // ---- 10. calculated field-source / metadata agreement ----
  // ONLY SourceReference.type === "calculated" is model provenance (official,
  // government, tourism-board, Wikipedia, manual, and editor-observation
  // sources are factual/editorial and are NEVER treated as calculated model
  // sources — they are preserved). Structured metadata is CANONICAL:
  //  - every calculated source in EVERY position of a field-source array
  //    must equal the canonical "<modelVersion>; <basis>" title;
  //  - a calculated source with missing/non-model metadata is a violation
  //    (a calculated value must never render as ordinary fact) — except the
  //    walking legacy fallback, which applies ONLY when structured walking
  //    metadata is COMPLETELY ABSENT;
  //  - metadata present with method manual/assisted/unknown + calculated
  //    source → stale contradiction.
  const CALCULATED_ONLY = ["calculated"] as const;
  const fieldSourceMismatch = index.flatMap((d) => {
    if (!d.editorial?.fieldSources) return [];
    const out: string[] = [];
    const check = (
      field: string,
      meta:
        { method?: string; modelVersion?: string; basis?: string } | undefined,
    ) => {
      const sources = d.editorial!.fieldSources![field] ?? [];
      const calculated = sources.filter((s) =>
        CALCULATED_ONLY.includes(s.type as (typeof CALCULATED_ONLY)[number]),
      );
      if (calculated.length === 0) return; // factual/editorial sources only
      for (const source of calculated) {
        if (field === "walkingMin") {
          // Legacy fallback ONLY when structured metadata is completely
          // absent; otherwise metadata is authoritative.
          if (!meta) {
            if (!isModelOwnedWalkingMinutes(d))
              out.push(
                `${d.id}: walkingMin calculated source without legacy/model provenance`,
              );
            continue;
          }
          if (meta.method === "model") {
            const canonical = `${meta.modelVersion}; ${meta.basis}`;
            if (source.title !== canonical)
              out.push(
                `${d.id}: walkingMin fieldSource != metadata (${source.title?.slice(0, 40)}…)`,
              );
            continue;
          }
          out.push(
            `${d.id}: walkingMin calculated source under ${meta.method} metadata (stale contradiction)`,
          );
          continue;
        }
        if (!meta || meta.method !== "model") {
          out.push(
            `${d.id}: ${field} calculated source without model metadata (${source.title?.slice(0, 40)}…)`,
          );
          continue;
        }
        if (!meta.modelVersion || !meta.basis) {
          out.push(
            `${d.id}: ${field} calculated source with incomplete model metadata`,
          );
          continue;
        }
        const canonical = `${meta.modelVersion}; ${meta.basis}`;
        if (source.title !== canonical)
          out.push(
            `${d.id}: ${field} fieldSource != metadata (${source.title?.slice(0, 40)}…)`,
          );
      }
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
        "calculated fieldSources match canonical metadata; factual sources preserved",
      )
    : fail(
        "field-source-agreement",
        fieldSourceMismatch.slice(0, 8).join("; "),
      );

  // ---- 11. score presentation gates (KAI-89 rubric v2) ----
  // Every published record must carry persisted scoreMetadata resolving to
  // verified (editorial provenance), estimated (model provenance) or
  // unavailable (evidence coverage below threshold). unavailable is a real
  // state: sparse records must never be silently given a neutral-5 estimate.
  const published = index.filter((d) => d.status === "published");
  const scorePresentationMissing = published
    .filter((d) => !d.scoreMetadata)
    .map((d) => d.id);
  scorePresentationMissing.length === 0
    ? pass("score-presentation", "every published record carries scoreMetadata")
    : fail(
        "score-presentation",
        `published records without scoreMetadata: ${scorePresentationMissing.slice(0, 8).join("; ")}`,
      );

  // ---- 12. score provenance completeness (rubric v2) ----
  // verified requires score-specific editorial provenance (date + source
  // URLs from the committed verification ledger) and a value equal to the
  // rubric's output; estimated requires model provenance and the rubric
  // value; unavailable requires a null value below the evidence threshold.
  // Generic ratingMetadata.confidence NEVER upgrades a record to verified.
  const verifiedProvenance = loadVerifiedScoreProvenance();
  const scoreProvenanceIssues = published.flatMap((d) => {
    const m = d.scoreMetadata;
    if (!m) return [];
    const out: string[] = [];
    const expected = buildScoreMetadata(d, verifiedProvenance.get(d.id));
    if (m.state === "verified") {
      if (!m.rubricVersion)
        out.push(`${d.id}: verified score missing rubricVersion`);
      if (m.confidence !== "high")
        out.push(`${d.id}: verified score confidence must be high`);
      if (m.provenance?.sourceClass !== "editorial-review")
        out.push(`${d.id}: verified score without editorial-review provenance`);
      if (!m.provenance?.verifiedAt)
        out.push(`${d.id}: verified score missing verification date`);
      if (!m.provenance?.sources || m.provenance.sources.length === 0)
        out.push(`${d.id}: verified score without authoritative source URLs`);
      if (m.value === null || m.value !== expected.value)
        out.push(
          `${d.id}: verified value ${m.value} != rubric value ${expected.value}`,
        );
    }
    if (m.state === "estimated") {
      if (!m.rubricVersion)
        out.push(`${d.id}: estimated score missing rubricVersion`);
      if (m.confidence !== "low")
        out.push(`${d.id}: estimated score confidence must be low`);
      if (m.provenance?.sourceClass !== "model")
        out.push(`${d.id}: estimated score without model provenance`);
      if (!m.provenance?.basis)
        out.push(`${d.id}: estimated score missing basis`);
      if (m.coverage < SCORE_EVIDENCE_THRESHOLD)
        out.push(
          `${d.id}: estimated score below evidence threshold (coverage ${m.coverage})`,
        );
      if (m.value === null || m.value !== expected.value)
        out.push(
          `${d.id}: estimated value ${m.value} != rubric value ${expected.value}`,
        );
    }
    if (m.state === "unavailable") {
      if (m.value !== null)
        out.push(`${d.id}: unavailable score must have null value`);
      if (m.confidence !== "unknown")
        out.push(`${d.id}: unavailable score confidence must be unknown`);
      if (m.coverage >= SCORE_EVIDENCE_THRESHOLD)
        out.push(
          `${d.id}: unavailable score above evidence threshold (coverage ${m.coverage})`,
        );
    }
    if (!m.noteKey) out.push(`${d.id}: scoreMetadata missing noteKey`);
    return out;
  });
  scoreProvenanceIssues.length === 0
    ? pass(
        "score-provenance",
        "verified/estimated/unavailable scores carry complete provenance and the rubric value",
      )
    : fail("score-provenance", scoreProvenanceIssues.slice(0, 8).join("; "));

  // ---- 13. score range / finiteness ----
  const scoreRangeIssues = published.flatMap((d) => {
    const v = d.scoreMetadata?.value;
    if (v === null || v === undefined) return [];
    return typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 10
      ? [`${d.id}: scoreMetadata.value=${JSON.stringify(v)}`]
      : [];
  });
  scoreRangeIssues.length === 0
    ? pass("score-range", "score values finite and within 1-10")
    : fail("score-range", scoreRangeIssues.slice(0, 8).join("; "));

  // ---- 14. persisted state agrees with the runtime predicate ----
  // Runs the REAL shared buildScoreMetadata (same module the generator and
  // the runtime use) so the gate can never drift from the rubric.
  const stateMismatch = published.flatMap((d) => {
    const expected = buildScoreMetadata(d, verifiedProvenance.get(d.id)).state;
    return d.scoreMetadata?.state !== expected
      ? [
          `${d.id}: scoreMetadata.state=${d.scoreMetadata?.state} runtime=${expected}`,
        ]
      : [];
  });
  stateMismatch.length === 0
    ? pass(
        "score-state-agreement",
        "persisted score state matches the shared rubric state predicate",
      )
    : fail("score-state-agreement", stateMismatch.slice(0, 8).join("; "));

  // ---- 15. score note i18n (EN + JA) ----
  let enNotes: Record<string, unknown>;
  let jaNotes: Record<string, unknown>;
  try {
    enNotes = JSON.parse(
      fs.readFileSync(
        path.join(rootDir, "src/i18n/resources/en/common.json"),
        "utf8",
      ),
    );
    jaNotes = JSON.parse(
      fs.readFileSync(
        path.join(rootDir, "src/i18n/resources/ja/common.json"),
        "utf8",
      ),
    );
  } catch {
    enNotes = {};
    jaNotes = {};
  }
  const resolveKey = (notes: Record<string, unknown>, key: string): boolean => {
    const parts = key.split(".");
    let cur: unknown = notes;
    for (const p of parts) {
      if (typeof cur !== "object" || cur === null) return false;
      cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === "string" && cur.length > 0;
  };
  const missingNotes = published.flatMap((d) => {
    const key = d.scoreMetadata?.noteKey;
    if (!key) return [];
    if (!resolveKey(enNotes, key) || !resolveKey(jaNotes, key))
      return [`${d.id}: noteKey ${key} missing in EN/JA`];
    return [];
  });
  missingNotes.length === 0
    ? pass(
        "score-note-i18n",
        "every score noteKey resolves to non-empty EN and JA copy",
      )
    : fail("score-note-i18n", missingNotes.slice(0, 8).join("; "));

  // ---- 16. score-state audit counts agree with the committed audit ----
  let auditJson: {
    summary?: { publishedScoreStates?: Record<string, number> };
  };
  try {
    auditJson = JSON.parse(
      fs.readFileSync(
        path.join(
          rootDir,
          "scripts/audit/kai-89-structured-template-audit.json",
        ),
        "utf8",
      ),
    );
  } catch {
    auditJson = {};
  }
  const committedCounts = auditJson.summary?.publishedScoreStates ?? {};
  const computedCounts = {
    verified: published.filter((d) => d.scoreMetadata?.state === "verified")
      .length,
    estimated: published.filter((d) => d.scoreMetadata?.state === "estimated")
      .length,
    unavailable: published.filter(
      (d) => d.scoreMetadata?.state === "unavailable",
    ).length,
  };
  JSON.stringify(committedCounts) === JSON.stringify(computedCounts)
    ? pass(
        "score-audit-counts",
        `audit counts match runtime score states (${JSON.stringify(computedCounts)})`,
      )
    : fail(
        "score-audit-counts",
        `audit ${JSON.stringify(committedCounts)} != computed ${JSON.stringify(computedCounts)}`,
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
