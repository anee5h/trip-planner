#!/usr/bin/env tsx
/**
 * KAI-323 — read-only official-source admission pilot.
 *
 * Inputs are sanitized, manually reviewed research records under qa/kai-323/.
 * This tool never writes the canonical catalogue or calls Apify. It generates
 * deterministic baseline/proposal artifacts and exposes small pure parsers for
 * fixture tests.
 */
import fs from "node:fs";
import path from "node:path";

type JsonObject = Record<string, unknown>;

export type ExtractionStatus =
  "verified" | "verified_variable" | "manual_review" | "unresolved" | "failed";

export interface SourceRegistryEntry {
  destinationId: string;
  sourceUrl: string;
  sourceLanguage: "en" | "ja";
  robotsUrl: string;
  robotsStatus: number | null;
  robotsBlockedAll: boolean;
  technicalStatus: number | null;
  technicalResult: string;
  termsStatus: "not_located";
  automationEligibility: "manual_review_required";
}

export interface ExtractionRecord {
  destinationId: string;
  sourceUrl: string;
  sourceLanguage: "en" | "ja";
  collectedAt: string;
  currency: "JPY";
  originalPriceText: string | null;
  adultPrice: number | null;
  childPrice: number | null;
  onlinePrice: number | null;
  counterPrice: number | null;
  minimumPrice: number | null;
  maximumPrice: number | null;
  validFrom: string | null;
  validUntil: string | null;
  weekdayOrWeekend: string | null;
  timeSlotConditions: string | null;
  ticketProduct: string;
  extractionStatus: ExtractionStatus;
  failureReason: string | null;
  manualVerified: boolean;
  verificationNote?: string;
}

const ROOT = process.cwd();
const QA_DIR = path.join(ROOT, "qa/kai-323");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");
const REGISTRY_PATH = path.join(QA_DIR, "source-registry.json");
const EXTRACTIONS_PATH = path.join(QA_DIR, "extraction-results.json");
const BASELINE_JSON = path.join(QA_DIR, "baseline.json");
const BASELINE_MD = path.join(QA_DIR, "baseline.md");
const PROPOSALS_JSON = path.join(QA_DIR, "proposed-updates.json");
const PROPOSALS_MD = path.join(QA_DIR, "proposed-updates.md");
const BASE_SHA = "a94556fcf2718a05a90c69df878c7c2b44779492";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(
      `${label} contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`,
    );
  }
}

/** Converts a single Japanese-yen token to an integer without rounding ambiguity. */
export function normalizeJpyValue(raw: string): number | null {
  const trimmed = raw.trim().replaceAll(",", "");
  if (/^\d{1,3}(?:\.\d{3})+$/.test(trimmed)) {
    const value = Number(trimmed.replaceAll(".", ""));
    return Number.isSafeInteger(value) ? value : null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Extracts only values adjacent to an explicit JPY marker. Bare ages/counts
 * are deliberately ignored so ticket categories cannot become prices.
 */
export function parseJpyPrices(text: string): number[] {
  const values: number[] = [];
  const patterns = [
    /(?:¥|￥)\s*([\d,.]+)/gi,
    /([\d,.]+)\s*円(?![A-Za-z])/gi,
    /\bJPY\s*([\d,.]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = normalizeJpyValue(match[1]);
      if (value !== null && !values.includes(value)) values.push(value);
    }
  }
  return values.sort((a, b) => a - b);
}

export interface ParsedJpyText {
  /** Values observed next to JPY markers in arbitrary text; not a ticket range. */
  values: readonly number[];
  /** Smallest observed currency token; may be an age band/product/surcharge. */
  observedMinimum: number | null;
  /** Largest observed currency token; may be an age band/product/surcharge. */
  observedMaximum: number | null;
  fromOnly: boolean;
  /** Prevents consumers from treating text extrema as adult admission bounds. */
  semantics: "observed_currency_tokens_only";
}

/**
 * Parses currency tokens for research triage only. `observedMinimum` and
 * `observedMaximum` are text-level extrema, not an admission-price range.
 * Product/category/date interpretation belongs to the reviewed extraction
 * record and is never inferred here.
 */
export function parseJpyText(text: string): ParsedJpyText {
  const values = parseJpyPrices(text);
  const fromOnly = /(?:from|から|〜|~)\s*(?:¥|￥|JPY)?\s*[\d,.]+/i.test(text);
  return {
    values,
    observedMinimum: values.length > 0 ? values[0] : null,
    observedMaximum: values.length > 0 ? values[values.length - 1] : null,
    fromOnly,
    semantics: "observed_currency_tokens_only",
  };
}

function classifyCurrentAdmission(admission: JsonObject | undefined): string {
  if (!admission) return "unknown";
  const state = admission.state;
  const cost = (admission.cost ?? {}) as JsonObject;
  if (state === "verified_free") return "free";
  if (state === "not_applicable") return "not_applicable";
  if (state === "unavailable") return "unknown";
  if (state === "variable_price") return "variable";
  if (state === "verified_paid" && cost.kind === "bounded") {
    return cost.min === cost.max ? "fixed" : "variable";
  }
  return "unknown";
}

function currentAdmission(
  admission: JsonObject | undefined,
): JsonObject | null {
  if (!admission) return null;
  const cost = (admission.cost ?? {}) as JsonObject;
  return {
    state: admission.state ?? null,
    provenance: admission.provenance ?? null,
    reasonCode: admission.reasonCode ?? null,
    costKind: cost.kind ?? null,
    minimumPrice: cost.min ?? null,
    maximumPrice: cost.max ?? null,
    scope: admission.scope ?? null,
    sourceUrls: admission.sourceUrls ?? [],
    checkedAt: admission.checkedAt ?? null,
    basis: admission.basis ?? null,
  };
}

function investigationReason(admission: JsonObject | undefined): string {
  const classification = classifyCurrentAdmission(admission);
  switch (classification) {
    case "fixed":
      return "Existing verified fixed fact included for source freshness and product-basis review.";
    case "variable":
      return "Existing variable/date-or-product-dependent fact included to test defensible range/product separation.";
    case "free":
      return "Explicit free-entry fact included to confirm free evidence is not confused with missing data.";
    case "not_applicable":
      return "Open-area or no-single-ticket fact included to preserve N/A semantics.";
    case "unknown":
    default:
      return "Existing unavailable or unresolved fact included to test whether official evidence can recover a price.";
  }
}

export function buildBaseline(
  catalogue: readonly JsonObject[],
  registry: readonly SourceRegistryEntry[],
): JsonObject {
  assertUniqueIds(
    registry.map((entry) => entry.destinationId),
    "source registry",
  );
  if (registry.length < 20 || registry.length > 30) {
    throw new Error(
      `KAI-323 cohort must contain 20–30 records, got ${registry.length}`,
    );
  }
  const byId = new Map(catalogue.map((record) => [String(record.id), record]));
  const records = registry
    .map((source) => {
      const destination = byId.get(source.destinationId);
      if (!destination)
        throw new Error(`Missing catalogue ID: ${source.destinationId}`);
      const admission = destination.admission as JsonObject | undefined;
      return {
        destinationId: source.destinationId,
        name: destination.name ?? null,
        nameJa: destination.nameJa ?? null,
        kind: destination.kind ?? null,
        role: destination.role ?? null,
        categories: [
          ...((destination.categories as string[] | undefined) ?? []),
        ].sort(),
        currentAdmission: currentAdmission(admission),
        currentClassification: classifyCurrentAdmission(admission),
        sourceUrls: admission?.sourceUrls ?? [],
        checkedAt: admission?.checkedAt ?? null,
        investigationReason: investigationReason(admission),
      };
    })
    .sort((a, b) => a.destinationId.localeCompare(b.destinationId));
  return {
    schemaVersion: 1,
    ticket: "KAI-323",
    baseSha: BASE_SHA,
    source: "src/shared/data/destinations-index.json",
    readOnly: true,
    cohortSize: records.length,
    records,
  };
}

function compareAdultToCurrent(
  baseline: JsonObject,
  extraction: ExtractionRecord,
): string {
  const currentClassification = String(
    baseline.currentClassification ?? "unknown",
  );
  if (
    extraction.extractionStatus === "failed" ||
    extraction.extractionStatus === "unresolved"
  ) {
    return currentClassification === "unknown"
      ? "remain_unknown"
      : "no_new_evidence_keep_current";
  }
  if (extraction.extractionStatus === "manual_review") return "manual_review";
  if (extraction.extractionStatus === "verified_variable")
    return "review_required_variable_product";
  const current = baseline.currentAdmission as JsonObject | null;
  if (!current || current.state === "unavailable")
    return "review_required_new_fact";
  if (
    current.costKind === "bounded" &&
    extraction.adultPrice !== null &&
    current.minimumPrice === extraction.adultPrice &&
    current.maximumPrice === extraction.adultPrice
  ) {
    // Equal adult numbers do not prove product/scope/date equivalence. The
    // current fact has no comparable ticketProduct field, so KAI-324-style
    // provenance approval remains necessary before any catalogue mutation.
    return "price_matches_review_scope";
  }
  return "review_required_conflict_or_scope";
}

export function buildProposals(
  baseline: JsonObject,
  extractions: readonly ExtractionRecord[],
): JsonObject {
  const baselineRecords = new Map(
    (baseline.records as JsonObject[]).map((record) => [
      String(record.destinationId),
      record,
    ]),
  );
  assertUniqueIds(
    extractions.map((record) => record.destinationId),
    "extraction results",
  );
  const records = extractions
    .map((extraction) => {
      const base = baselineRecords.get(extraction.destinationId);
      if (!base)
        throw new Error(
          `Extraction has no baseline record: ${extraction.destinationId}`,
        );
      const action = compareAdultToCurrent(base, extraction);
      return {
        destinationId: extraction.destinationId,
        existing: base.currentAdmission,
        extracted: {
          status: extraction.extractionStatus,
          sourceUrl: extraction.sourceUrl,
          ticketProduct: extraction.ticketProduct,
          adultPrice: extraction.adultPrice,
          childPrice: extraction.childPrice,
          onlinePrice: extraction.onlinePrice,
          counterPrice: extraction.counterPrice,
          minimumPrice: extraction.minimumPrice,
          maximumPrice: extraction.maximumPrice,
          originalPriceText: extraction.originalPriceText,
          conditions: extraction.timeSlotConditions,
          failureReason: extraction.failureReason,
          manualVerified: extraction.manualVerified,
        },
        proposedAction: action,
        productionCatalogueChanged: false,
      };
    })
    .sort((a, b) => a.destinationId.localeCompare(b.destinationId));
  const counts = records.reduce<Record<string, number>>((result, record) => {
    result[record.proposedAction] = (result[record.proposedAction] ?? 0) + 1;
    return result;
  }, {});
  return {
    schemaVersion: 1,
    ticket: "KAI-323",
    baseSha: BASE_SHA,
    readOnly: true,
    cohortSize: records.length,
    counts: Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
    ),
    records,
  };
}

function renderBaseline(report: JsonObject): string {
  const records = report.records as JsonObject[];
  const stateCounts: Record<string, number> = {};
  for (const record of records) {
    const key = String(record.currentClassification);
    stateCounts[key] = (stateCounts[key] ?? 0) + 1;
  }
  const lines = [
    "# KAI-323 Admission Pilot Baseline",
    "",
    `Base: \`${report.baseSha}\``,
    "",
    "This is a read-only snapshot from the canonical destination catalogue. It does not modify catalogue or Supabase data.",
    "",
    `- Cohort size: **${report.cohortSize}**`,
    `- Current classifications: ${Object.entries(stateCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key} ${value}`)
      .join(", ")}`,
    "- States are preserved as fixed, variable, free, not_applicable, or unknown; unknown is never converted to free or zero.",
    "",
    "| Destination | Current state | Current value | Source/checked date | Investigation reason |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const record of records) {
    const current = record.currentAdmission as JsonObject | null;
    const value =
      current?.costKind === "bounded"
        ? `${current.minimumPrice}–${current.maximumPrice} JPY`
        : String(current?.costKind ?? "unknown");
    const source =
      Array.isArray(current?.sourceUrls) && current.sourceUrls.length > 0
        ? String(current.sourceUrls[0])
        : "none";
    lines.push(
      `| ${record.destinationId} | ${record.currentClassification} | ${value} | ${source} / ${current?.checkedAt ?? "none"} | ${record.investigationReason} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderProposals(report: JsonObject): string {
  const lines = [
    "# KAI-323 Proposed Admission Updates",
    "",
    `Base: \`${report.baseSha}\``,
    "",
    "This is a reviewed proposal only. No production catalogue or Supabase record was changed.",
    "",
    `- Cohort size: **${report.cohortSize}**`,
    `- Outcome counts: ${Object.entries(report.counts as Record<string, number>)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ")}`,
    "- A variable/date-dependent result is not converted into a fixed catalogue fee.",
    "- Different ticket products remain separate; unresolved records remain unresolved.",
    "",
    "| Destination | Existing | Extracted result | Proposed action |",
    "| --- | --- | --- | --- |",
  ];
  for (const record of report.records as JsonObject[]) {
    const extracted = record.extracted as JsonObject;
    const current = record.existing as JsonObject | null;
    const existing =
      current?.costKind === "bounded"
        ? `${current.minimumPrice}–${current.maximumPrice} JPY`
        : String(current?.costKind ?? "unknown");
    const result =
      extracted.status === "verified" ||
      extracted.status === "verified_variable"
        ? `${extracted.adultPrice ?? "?"} JPY adult; ${extracted.ticketProduct}`
        : `${extracted.status}: ${extracted.failureReason ?? "no result"}`;
    lines.push(
      `| ${record.destinationId} | ${existing} | ${result.replaceAll("|", "\\|")} | ${record.proposedAction} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function writeOrCheck(checkOnly: boolean): void {
  const registry = readJson<SourceRegistryEntry[]>(REGISTRY_PATH);
  const extractions = readJson<ExtractionRecord[]>(EXTRACTIONS_PATH);
  const catalogue = readJson<JsonObject[]>(INDEX_PATH);
  const baseline = buildBaseline(catalogue, registry);
  const proposals = buildProposals(baseline, extractions);
  const outputs: Record<string, string> = {
    [BASELINE_JSON]: stableJson(baseline),
    [BASELINE_MD]: renderBaseline(baseline),
    [PROPOSALS_JSON]: stableJson(proposals),
    [PROPOSALS_MD]: renderProposals(proposals),
  };
  const mismatches: string[] = [];
  for (const [filePath, content] of Object.entries(outputs)) {
    if (checkOnly) {
      if (
        !fs.existsSync(filePath) ||
        fs.readFileSync(filePath, "utf8") !== content
      )
        mismatches.push(filePath);
    } else {
      fs.writeFileSync(filePath, content);
    }
  }
  if (checkOnly && mismatches.length > 0) {
    throw new Error(
      `KAI-323 generated artifacts are stale: ${mismatches.join(", ")}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        cohortSize: registry.length,
        baselineRecords: (baseline.records as unknown[]).length,
        proposalRecords: (proposals.records as unknown[]).length,
        mode: checkOnly ? "check" : "write",
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--check")) writeOrCheck(true);
  else if (process.argv.includes("--write")) writeOrCheck(false);
  else {
    console.error(
      "Usage: npx tsx scripts/research/kai-323-admission-pilot.ts --write|--check",
    );
    process.exit(2);
  }
}
