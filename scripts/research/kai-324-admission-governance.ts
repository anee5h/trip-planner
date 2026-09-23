#!/usr/bin/env tsx
/**
 * KAI-324 — provenance, conflict detection, and approval gates.
 *
 * This module evaluates the merged KAI-323 research artifacts without writing
 * the canonical catalogue. It produces append-only decision records and a
 * deterministic dry-run report. The file-publish helpers require a reviewed
 * approval artifact and are exercised only against temporary fixtures in tests.
 */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasVerifiedFreeEvidence } from "../../src/shared/services/budget/freeEvidence";
import { validateAdmissionFact } from "../../src/shared/services/budget/factValidation";
import type {
  ExtractionRecord,
  SourceRegistryEntry,
} from "./kai-323-admission-pilot";

type JsonObject = Record<string, unknown>;

export type GovernanceDecision = "approved" | "held_for_review" | "rejected";
export type Confidence = "high" | "medium" | "low";
export type AdmissionCandidateState =
  "verified_paid" | "verified_free" | "variable_price";

export interface KAI323ProposalRecord {
  destinationId: string;
  existing: JsonObject;
  extracted: JsonObject;
  proposedAction: string;
  productionCatalogueChanged: boolean;
}

export interface GovernanceExtraction extends ExtractionRecord {
  /** Optional KAI-324 fields. They are absent from KAI-323 by design. */
  admissionScope?: string;
  visitorCategory?: string;
  taxBasis?: "tax_inclusive" | "tax_exclusive" | "unknown";
  verificationDate?: string;
}

export interface SourceEvidence {
  sourceUrl: string;
  sourceType: "official";
  sourceLanguage: "en" | "ja";
  quotation: string | null;
  quotationSanitized: boolean;
  sourceRegistryUrl: string | null;
  registryTechnicalStatus: number | null;
  registryTechnicalResult: string | null;
  manualVerified: boolean;
  robotsUrl: string | null;
  robotsStatus: number | null;
  robotsBlockedAll: boolean | null;
  termsStatus: string | null;
  automationEligibility: string | null;
  collectionPermission: "manual_one_time_only" | "unknown_or_blocked";
}

export interface DecisionHistoryEntry {
  event: "kai323_proposal" | "kai324_evaluation" | "kai324_manual_approval";
  at: string | null;
  decision: string;
  actorOrRule: string;
  reason: string;
}

export interface FieldChange {
  fieldPath: "/admission";
  existingValue: unknown;
  proposedValue: JsonObject;
}

export interface GovernanceRecord {
  destinationId: string;
  extractionStatus: string;
  manualVerified: boolean;
  productionCatalogueChanged: boolean;
  fieldPath: "/admission";
  existingValue: unknown;
  proposedValue: JsonObject | null;
  sourceEvidence: SourceEvidence;
  dates: {
    extractedAt: string | null;
    verifiedAt: string | null;
    validFrom: string | null;
    validUntil: string | null;
  };
  pricing: {
    currency: string | null;
    taxBasis: string | null;
    ticketProduct: string | null;
    visitorCategory: string | null;
    conditions: string | null;
    weekdayOrWeekend: string | null;
    onlinePrice: number | null;
    counterPrice: number | null;
    observedAdultPrice: number | null;
    observedChildPrice: number | null;
  };
  confidence: Confidence;
  decision: GovernanceDecision;
  reviewerOrRule: string;
  reasonCodes: string[];
  reason: string;
  validation: {
    valid: boolean;
    issues: string[];
  };
  proposedFieldChanges: FieldChange[];
  currentFactUntouched: boolean;
  decisionHistory: DecisionHistoryEntry[];
  priorKAI323Action: string;
}

export interface GovernanceReport {
  schemaVersion: 1;
  ticket: "KAI-324";
  catalogueBaseSha: string;
  catalogueBaseVerified: boolean;
  sourceArtifactBaseSha: string;
  catalogueSha256: string;
  readOnly: true;
  inputArtifacts: string[];
  ownership: {
    canonicalCatalogue: string;
    derivedCatalogueAssets: string[];
    admissionValidator: string;
    budgetConsumers: string[];
    eventualPublishTarget: string;
  };
  counts: {
    total: number;
    approved: number;
    heldForReview: number;
    rejected: number;
    kai323AcceptedCandidates: number;
    currentFactsUntouched: number;
  };
  kai323Validation: {
    cohortSize: number;
    baselineRecords: number;
    proposalRecords: number;
    extractionRecords: number;
    sourceRegistryRecords: number;
    actionCounts: Record<string, number>;
    acceptedManualRecords: number;
  };
  records: GovernanceRecord[];
  untouchedDestinationIds: string[];
}

export interface ApprovalArtifact {
  schemaVersion: 1;
  ticket: "KAI-324";
  reportSha256: string;
  catalogueSha256: string;
  reviewedAt: string;
  reviewedBy: string;
  explicitPublishConfirmation: true;
  approvedDestinationIds: string[];
}

export interface ManualReviewDecision {
  destinationId: string;
  sourceUrl: string;
  evidenceSha256: string;
  revalidatedAt: string;
  reviewerNote: string;
}

export interface ManualReviewArtifact {
  schemaVersion: 1;
  ticket: "KAI-324";
  reportSha256: string;
  catalogueSha256: string;
  reviewedAt: string;
  reviewedBy: string;
  explicitManualApproval: true;
  decisions: ManualReviewDecision[];
}

export interface PublishResult {
  changed: boolean;
  backupCreated: boolean;
  outputPath: string;
  approvedDestinationIds: string[];
}

const ROOT = process.cwd();
const QA_DIR = path.join(ROOT, "qa/kai-324");
const KAI323_DIR = path.join(ROOT, "qa/kai-323");
const CATALOGUE_PATH = path.join(
  ROOT,
  "src/shared/data/destinations-index.json",
);
const REGISTRY_PATH = path.join(KAI323_DIR, "source-registry.json");
const EXTRACTIONS_PATH = path.join(KAI323_DIR, "extraction-results.json");
const BASELINE_PATH = path.join(KAI323_DIR, "baseline.json");
const PROPOSALS_PATH = path.join(KAI323_DIR, "proposed-updates.json");
const REPORT_JSON_PATH = path.join(QA_DIR, "decision-report.json");
const REPORT_MD_PATH = path.join(QA_DIR, "decision-report.md");
const CATALOGUE_BASE_SHA = "c25fb10ad594b539799d23e1edc7cd60f3051393";
const SOURCE_ARTIFACT_BASE_SHA = "a94556fcf2718a05a90c69df878c7c2b44779492";
const EVALUATION_DATE = "2026-09-23";
const MAX_SOURCE_AGE_DAYS = 365;
const KAI323_ACTIONS = new Set([
  "manual_review",
  "no_new_evidence_keep_current",
  "price_matches_review_scope",
  "remain_unknown",
  "review_required_conflict_or_scope",
  "review_required_variable_product",
]);

const REQUIRED_INPUT_ARTIFACTS = [
  "qa/kai-323/baseline.json",
  "qa/kai-323/proposed-updates.json",
  "qa/kai-323/extraction-results.json",
  "qa/kai-323/source-registry.json",
];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function reportSha256(report: GovernanceReport): string {
  return crypto.createHash("sha256").update(stableJson(report)).digest("hex");
}

function jsonSha256(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function verifyCatalogueBase(catalogue: readonly JsonObject[]): boolean {
  try {
    const baseText = execFileSync(
      "git",
      ["show", `${CATALOGUE_BASE_SHA}:src/shared/data/destinations-index.json`],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return jsonSha256(JSON.parse(baseText)) === jsonSha256(catalogue);
  } catch {
    return false;
  }
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidDate(value: string | null): boolean {
  if (typeof value !== "string") return value === null;
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dayDifference(later: string, earlier: string): number {
  const laterMs = Date.parse(`${later}T00:00:00Z`);
  const earlierMs = Date.parse(`${earlier}T00:00:00Z`);
  return Math.floor((laterMs - earlierMs) / 86_400_000);
}

function isHttpsUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function pushIssue(issues: string[], code: string): void {
  if (!issues.includes(code)) issues.push(code);
}

function markdownSafe(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  })
    .join("")
    .replace(/[\\`*_#[\]<>]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteSnippet(value: string | null): string | null {
  if (!value) return null;
  const sanitized = markdownSafe(value);
  return sanitized.length <= 500 ? sanitized : `${sanitized.slice(0, 497)}...`;
}

function normalizedExtraction(
  extraction: GovernanceExtraction,
): GovernanceExtraction {
  // The raw extraction artifact is authoritative. The proposal artifact is
  // compared separately and any mismatch becomes a blocking decision issue;
  // proposal fields must never silently override source evidence.
  return extraction;
}

function buildProposedAdmission(
  extraction: GovernanceExtraction,
  existing: JsonObject | null,
): JsonObject | null {
  const adultPrice = asNullableNumber(extraction.adultPrice);
  if (extraction.extractionStatus === "verified_variable") {
    return {
      state: "variable_price",
      provenance: "verified_source",
      reasonCode: "price_variable_by_date",
      cost: { kind: "variable" },
      scope:
        extraction.admissionScope ??
        asString(existing?.scope) ??
        "general_entry",
      basis: extraction.originalPriceText,
      sourceUrls: [extraction.sourceUrl],
      checkedAt: extraction.verificationDate,
    };
  }
  if (extraction.extractionStatus !== "verified" || adultPrice === null) {
    return null;
  }
  const isExplicitFree =
    adultPrice === 0 &&
    hasVerifiedFreeEvidence(
      extraction.originalPriceText ?? undefined,
      adultPrice,
    );
  const state: AdmissionCandidateState = isExplicitFree
    ? "verified_free"
    : "verified_paid";
  return {
    state,
    provenance: "verified_source",
    ...(isExplicitFree ? {} : { reasonCode: undefined }),
    cost: { kind: "bounded", min: adultPrice, max: adultPrice },
    scope:
      extraction.admissionScope ?? asString(existing?.scope) ?? "general_entry",
    basis: extraction.originalPriceText,
    sourceUrls: [extraction.sourceUrl],
    checkedAt: extraction.verificationDate,
  };
}

function validateIdentity(
  destinationId: string,
  catalogueById: ReadonlyMap<string, JsonObject>,
  extraction: GovernanceExtraction,
  registry: SourceRegistryEntry | undefined,
  issues: string[],
): void {
  if (!catalogueById.has(destinationId)) {
    pushIssue(issues, "destination_identity_missing");
  }
  if (!registry) {
    pushIssue(issues, "source_registry_missing");
    return;
  }
  if (extraction.sourceUrl !== registry.sourceUrl) {
    pushIssue(issues, "source_url_drift");
  }
  if (
    extraction.sourceLanguage !== "en" &&
    extraction.sourceLanguage !== "ja"
  ) {
    pushIssue(issues, "source_language_invalid");
  }
  if (extraction.sourceLanguage !== registry.sourceLanguage) {
    pushIssue(issues, "source_language_mismatch");
  }
  if (registry.technicalStatus !== 200) {
    pushIssue(issues, "source_access_degraded");
  }
  if (
    registry.robotsStatus !== 200 ||
    registry.robotsBlockedAll === true ||
    typeof registry.technicalResult !== "string" ||
    registry.technicalResult.trim().length === 0
  ) {
    pushIssue(issues, "source_not_eligible_for_auto_approval");
  }
  if (!isHttpsUrl(extraction.sourceUrl)) {
    pushIssue(issues, "source_url_invalid");
  }
}

function proposalArtifactIssues(
  proposal: KAI323ProposalRecord,
  extraction: GovernanceExtraction,
): string[] {
  const checks: Array<[string, unknown, unknown]> = [
    ["sourceUrl", proposal.extracted.sourceUrl, extraction.sourceUrl],
    ["status", proposal.extracted.status, extraction.extractionStatus],
    [
      "originalPriceText",
      proposal.extracted.originalPriceText,
      extraction.originalPriceText,
    ],
    ["adultPrice", proposal.extracted.adultPrice, extraction.adultPrice],
    ["childPrice", proposal.extracted.childPrice, extraction.childPrice],
    ["onlinePrice", proposal.extracted.onlinePrice, extraction.onlinePrice],
    ["counterPrice", proposal.extracted.counterPrice, extraction.counterPrice],
    ["minimumPrice", proposal.extracted.minimumPrice, extraction.minimumPrice],
    ["maximumPrice", proposal.extracted.maximumPrice, extraction.maximumPrice],
    [
      "ticketProduct",
      proposal.extracted.ticketProduct,
      extraction.ticketProduct,
    ],
    [
      "conditions",
      proposal.extracted.conditions,
      extraction.timeSlotConditions,
    ],
    [
      "weekdayOrWeekend",
      proposal.extracted.weekdayOrWeekend,
      extraction.weekdayOrWeekend,
    ],
    [
      "failureReason",
      proposal.extracted.failureReason,
      extraction.failureReason,
    ],
    [
      "manualVerified",
      proposal.extracted.manualVerified,
      extraction.manualVerified,
    ],
  ];
  return checks
    .filter(([, proposalValue]) => proposalValue !== undefined)
    .filter(
      ([, proposalValue, extractionValue]) =>
        stableJson(proposalValue) !== stableJson(extractionValue),
    )
    .map(([field]) => `kai323_${field}_mismatch`);
}

function validateDates(
  extraction: GovernanceExtraction,
  issues: string[],
): void {
  if (!isValidDate(extraction.collectedAt))
    pushIssue(issues, "extracted_at_invalid");
  if (
    isValidDate(extraction.collectedAt) &&
    extraction.collectedAt > EVALUATION_DATE
  ) {
    pushIssue(issues, "collection_date_future");
  }
  if (!isValidDate(extraction.verificationDate ?? null))
    pushIssue(issues, "verified_at_invalid");
  if (!isValidDate(extraction.validFrom))
    pushIssue(issues, "valid_from_invalid");
  if (!isValidDate(extraction.validUntil))
    pushIssue(issues, "valid_until_invalid");
  if (
    extraction.validFrom &&
    extraction.validUntil &&
    extraction.validFrom > extraction.validUntil
  ) {
    pushIssue(issues, "validity_window_reversed");
  }
  if (extraction.verificationDate && isValidDate(extraction.verificationDate)) {
    if (
      isValidDate(extraction.collectedAt) &&
      extraction.verificationDate < extraction.collectedAt
    ) {
      pushIssue(issues, "verification_before_collection");
    }
    if (extraction.verificationDate > EVALUATION_DATE) {
      pushIssue(issues, "verification_date_future");
    } else if (
      dayDifference(EVALUATION_DATE, extraction.verificationDate) >
      MAX_SOURCE_AGE_DAYS
    ) {
      pushIssue(issues, "source_evidence_stale");
    }
  }
  if (
    extraction.validUntil &&
    isValidDate(extraction.validUntil) &&
    extraction.validUntil < EVALUATION_DATE
  ) {
    pushIssue(issues, "source_validity_expired");
  }
  if (
    extraction.validFrom &&
    isValidDate(extraction.validFrom) &&
    extraction.validFrom > EVALUATION_DATE
  ) {
    pushIssue(issues, "source_validity_not_started");
  }
}

function validateCandidate(
  extraction: GovernanceExtraction,
  existing: JsonObject | null,
  proposalAction: string,
  registry: SourceRegistryEntry | undefined,
  proposedAdmission: JsonObject | null,
  issues: string[],
): void {
  validateDates(extraction, issues);
  if (extraction.currency !== "JPY") pushIssue(issues, "currency_not_jpy");
  if (typeof extraction.ticketProduct !== "string") {
    pushIssue(issues, "product_malformed");
  } else if (!extraction.ticketProduct.trim()) {
    pushIssue(issues, "product_missing");
  }
  if (
    typeof extraction.originalPriceText !== "string" ||
    !extraction.originalPriceText.trim()
  )
    pushIssue(issues, "evidence_quotation_missing");

  if (
    extraction.extractionStatus === "failed" ||
    extraction.extractionStatus === "unresolved"
  ) {
    pushIssue(issues, "source_failure_or_unresolved");
    return;
  }
  if (extraction.extractionStatus === "manual_review") {
    pushIssue(issues, "manual_review_required");
    return;
  }
  if (!proposedAdmission) {
    pushIssue(issues, "structured_amount_missing");
    return;
  }
  const canonicalValidation = validateAdmissionFact(proposedAdmission);
  if (!canonicalValidation.valid) {
    pushIssue(
      issues,
      `canonical_admission_invalid:${canonicalValidation.reason ?? "unknown"}`,
    );
  }
  if (
    !registry ||
    registry.technicalStatus !== 200 ||
    registry.robotsStatus !== 200 ||
    registry.robotsBlockedAll === true ||
    typeof registry.technicalResult !== "string" ||
    registry.technicalResult.trim().length === 0
  ) {
    pushIssue(issues, "source_not_eligible_for_auto_approval");
  }
  if (
    !existing ||
    typeof existing.state !== "string" ||
    !asObject(existing.cost)
  ) {
    pushIssue(issues, "existing_admission_malformed");
  }
  if (extraction.manualVerified !== true)
    pushIssue(issues, "manual_verification_missing");
  if (
    typeof extraction.admissionScope !== "string" ||
    !extraction.admissionScope
  )
    pushIssue(issues, "admission_scope_missing");
  if (
    typeof extraction.visitorCategory !== "string" ||
    !extraction.visitorCategory
  )
    pushIssue(issues, "visitor_category_missing");
  if (
    extraction.taxBasis !== "tax_inclusive" &&
    extraction.taxBasis !== "tax_exclusive" &&
    extraction.taxBasis !== "unknown"
  ) {
    pushIssue(issues, "tax_basis_missing");
  }
  if (!extraction.verificationDate)
    pushIssue(issues, "verification_date_missing");
  if (extraction.extractionStatus === "verified_variable") {
    pushIssue(issues, "variable_or_date_dependent");
  }
  if (extraction.taxBasis === "unknown") {
    pushIssue(issues, "tax_basis_unknown");
  }
  if (extraction.childPrice !== null) {
    pushIssue(issues, "age_band_requires_review");
  }
  if (extraction.onlinePrice !== null || extraction.counterPrice !== null) {
    pushIssue(issues, "channel_price_requires_review");
  }
  if (extraction.weekdayOrWeekend !== null) {
    pushIssue(issues, "weekday_condition_requires_review");
  }

  const scopeText = `${extraction.ticketProduct} ${extraction.timeSlotConditions ?? ""}`;
  if (
    /bundle|combined|premium|surcharge|dynamic|date|time|online|counter|advance|reservation|age|child|student|separate|from|current displayed/i.test(
      scopeText,
    )
  ) {
    pushIssue(issues, "pricing_scope_requires_review");
  }

  const currentState = asString(existing?.state);
  const currentProvenance = asString(existing?.provenance);
  const currentCost = asObject(existing?.cost);
  const currentCostKind = asString(currentCost?.kind);
  const currentMinimum = asNullableNumber(currentCost?.min);
  const currentMaximum = asNullableNumber(currentCost?.max);
  const candidateCost = asObject(proposedAdmission.cost);
  const candidateMinimum = asNullableNumber(candidateCost?.min);
  const candidateMaximum = asNullableNumber(candidateCost?.max);

  if (currentState && proposedAdmission.state !== currentState) {
    pushIssue(issues, "trusted_state_conflict");
  }
  if (currentProvenance !== "verified_source") {
    pushIssue(issues, "trusted_provenance_conflict");
  }
  if (
    currentCostKind === "bounded" &&
    candidateCost?.kind === "bounded" &&
    (currentMinimum !== candidateMinimum || currentMaximum !== candidateMaximum)
  ) {
    pushIssue(issues, "trusted_price_conflict");
  }
  if (
    extraction.admissionScope &&
    asString(existing?.scope) !== extraction.admissionScope
  ) {
    pushIssue(issues, "trusted_scope_conflict");
  }
  const existingSourceUrls = Array.isArray(existing?.sourceUrls)
    ? existing.sourceUrls.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  if (!existingSourceUrls.includes(extraction.sourceUrl)) {
    pushIssue(issues, "source_not_currently_trusted");
  }
  const existingProduct = asString(existing?.ticketProduct);
  if (!existingProduct) {
    pushIssue(issues, "existing_product_metadata_missing");
  } else if (existingProduct !== extraction.ticketProduct) {
    pushIssue(issues, "ticket_product_conflict");
  }
  const existingVisitorCategory = asString(existing?.visitorCategory);
  if (!existingVisitorCategory) {
    pushIssue(issues, "existing_visitor_category_missing");
  } else if (existingVisitorCategory !== extraction.visitorCategory) {
    pushIssue(issues, "visitor_category_conflict");
  }
  const existingTaxBasis = asString(existing?.taxBasis);
  if (!existingTaxBasis) {
    pushIssue(issues, "existing_tax_basis_missing");
  } else if (existingTaxBasis !== extraction.taxBasis) {
    pushIssue(issues, "tax_basis_conflict");
  }
  if (registry && registry.automationEligibility !== "manual_review_required") {
    pushIssue(issues, "source_automation_policy_missing");
  }
  if (
    extraction.adultPrice !== null &&
    (!Number.isInteger(extraction.adultPrice) || extraction.adultPrice < 0)
  ) {
    pushIssue(issues, "adult_price_invalid");
  }
  if (
    extraction.childPrice !== null &&
    (!Number.isInteger(extraction.childPrice) || extraction.childPrice < 0)
  ) {
    pushIssue(issues, "child_price_invalid");
  }
  for (const [label, value] of [
    ["online_price", extraction.onlinePrice],
    ["counter_price", extraction.counterPrice],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      pushIssue(issues, `${label}_invalid`);
    }
  }
  if (
    (extraction.minimumPrice === null) !==
    (extraction.maximumPrice === null)
  ) {
    pushIssue(issues, "observed_range_incomplete");
  }
  if (
    extraction.minimumPrice !== null &&
    extraction.maximumPrice !== null &&
    (extraction.minimumPrice > extraction.maximumPrice ||
      extraction.minimumPrice < 0)
  ) {
    pushIssue(issues, "observed_range_invalid");
  }
  if (proposalAction === "price_matches_review_scope") {
    pushIssue(issues, "kai323_scope_review_required");
  }
  if (
    extraction.adultPrice === 0 &&
    !hasVerifiedFreeEvidence(extraction.originalPriceText ?? undefined, 0)
  ) {
    pushIssue(issues, "zero_without_explicit_free_evidence");
  }
}

function decisionFor(
  extraction: GovernanceExtraction,
  proposedAdmission: JsonObject | null,
  issues: readonly string[],
): GovernanceDecision {
  if (
    issues.includes("destination_identity_missing") ||
    issues.includes("source_registry_missing") ||
    issues.includes("input_claims_catalogue_changed") ||
    issues.includes("production_change_flag_invalid")
  ) {
    return "rejected";
  }
  if (extraction.extractionStatus === "manual_review") return "held_for_review";
  if (!proposedAdmission) return "rejected";
  return issues.length === 0 ? "approved" : "held_for_review";
}

function reasonFor(
  decision: GovernanceDecision,
  issues: readonly string[],
): string {
  if (decision === "approved") {
    return "Explicit KAI-324 equivalence rule passed: complete provenance, exact source identity, explicit product/category/conditions, valid dates, and no trusted-state conflict.";
  }
  if (decision === "rejected") {
    return issues.includes("source_failure_or_unresolved")
      ? "No defensible new admission fact was produced; the existing catalogue fact remains untouched."
      : "The proposed replacement was rejected because no publishable admission fact was available; the existing catalogue fact remains untouched.";
  }
  return "A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.";
}

function reviewerFor(decision: GovernanceDecision): string {
  if (decision === "approved") return "KAI-324 automatic-equivalence-rule-v1";
  if (decision === "rejected")
    return "KAI-324 no-new-evidence-preservation-rule-v1";
  return "KAI-324 manual-review-queue-v1";
}

function confidenceFor(decision: GovernanceDecision): Confidence {
  if (decision === "approved") return "high";
  if (decision === "held_for_review") return "medium";
  return "low";
}

function buildHistory(
  proposal: KAI323ProposalRecord,
  extraction: GovernanceExtraction,
  decision: GovernanceDecision,
  reason: string,
): DecisionHistoryEntry[] {
  return [
    {
      event: "kai323_proposal",
      at: extraction.collectedAt,
      decision: proposal.proposedAction,
      actorOrRule: "KAI-323 deterministic research proposal",
      reason:
        "Preserved from qa/kai-323/proposed-updates.json; not an approval record.",
    },
    {
      event: "kai324_evaluation",
      at: extraction.verificationDate ?? extraction.collectedAt,
      decision,
      actorOrRule: reviewerFor(decision),
      reason,
    },
  ];
}

function buildRecord(
  proposal: KAI323ProposalRecord,
  extraction: GovernanceExtraction,
  registry: SourceRegistryEntry | undefined,
  destination: JsonObject | undefined,
  catalogueById: ReadonlyMap<string, JsonObject>,
): GovernanceRecord {
  const existingValue = destination?.admission ?? null;
  const existing = asObject(existingValue);
  const proposedAdmission = buildProposedAdmission(extraction, existing);
  const issues: string[] = [];
  issues.push(...proposalArtifactIssues(proposal, extraction));
  if (proposal.productionCatalogueChanged !== false) {
    pushIssue(issues, "production_change_flag_invalid");
  }
  if (proposal.productionCatalogueChanged === true) {
    pushIssue(issues, "input_claims_catalogue_changed");
  }
  validateIdentity(
    proposal.destinationId,
    catalogueById,
    extraction,
    registry,
    issues,
  );
  validateCandidate(
    extraction,
    existing,
    proposal.proposedAction,
    registry,
    proposedAdmission,
    issues,
  );
  const decision = decisionFor(extraction, proposedAdmission, issues);
  const reason = reasonFor(decision, issues);
  const fieldChanges: FieldChange[] = proposedAdmission
    ? [
        {
          fieldPath: "/admission",
          existingValue: existingValue,
          proposedValue: proposedAdmission,
        },
      ]
    : [];
  const registryUrl = registry?.sourceUrl ?? null;
  const collectionPermission: SourceEvidence["collectionPermission"] =
    registry?.technicalStatus === 200 &&
    registry?.robotsStatus === 200 &&
    registry.robotsBlockedAll === false
      ? "manual_one_time_only"
      : "unknown_or_blocked";
  return {
    destinationId: proposal.destinationId,
    productionCatalogueChanged: proposal.productionCatalogueChanged,
    fieldPath: "/admission",
    existingValue: existingValue,
    proposedValue: proposedAdmission,
    sourceEvidence: {
      sourceUrl: extraction.sourceUrl,
      sourceType: "official",
      sourceLanguage: extraction.sourceLanguage,
      quotation: quoteSnippet(extraction.originalPriceText),
      quotationSanitized: true,
      sourceRegistryUrl: registryUrl,
      registryTechnicalStatus: registry?.technicalStatus ?? null,
      registryTechnicalResult: registry?.technicalResult ?? null,
      manualVerified: extraction.manualVerified,
      robotsUrl: registry?.robotsUrl ?? null,
      robotsStatus: registry?.robotsStatus ?? null,
      robotsBlockedAll: registry?.robotsBlockedAll ?? null,
      termsStatus: registry?.termsStatus ?? null,
      automationEligibility: registry?.automationEligibility ?? null,
      collectionPermission,
    },
    extractionStatus: extraction.extractionStatus,
    manualVerified: extraction.manualVerified,
    dates: {
      extractedAt: extraction.collectedAt,
      verifiedAt: extraction.verificationDate ?? null,
      validFrom: extraction.validFrom,
      validUntil: extraction.validUntil,
    },
    pricing: {
      currency: extraction.currency,
      taxBasis: extraction.taxBasis ?? null,
      ticketProduct: extraction.ticketProduct || null,
      visitorCategory: extraction.visitorCategory ?? null,
      conditions: extraction.timeSlotConditions,
      weekdayOrWeekend: extraction.weekdayOrWeekend,
      onlinePrice: extraction.onlinePrice,
      counterPrice: extraction.counterPrice,
      observedAdultPrice: extraction.adultPrice,
      observedChildPrice: extraction.childPrice,
    },
    confidence: confidenceFor(decision),
    decision,
    reviewerOrRule: reviewerFor(decision),
    reasonCodes: issues,
    reason,
    validation: { valid: issues.length === 0, issues },
    proposedFieldChanges: fieldChanges,
    currentFactUntouched: proposal.productionCatalogueChanged === false,
    decisionHistory: buildHistory(proposal, extraction, decision, reason),
    priorKAI323Action: proposal.proposedAction,
  };
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(
      `${label} contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`,
    );
  }
}

function countActions(
  proposals: readonly KAI323ProposalRecord[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    counts.set(
      proposal.proposedAction,
      (counts.get(proposal.proposedAction) ?? 0) + 1,
    );
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function baselineAdmissionSnapshot(value: unknown): JsonObject | null {
  const admission = asObject(value);
  if (!admission) return null;
  const cost = asObject(admission.cost);
  return {
    state: admission.state ?? null,
    provenance: admission.provenance ?? null,
    reasonCode: admission.reasonCode ?? null,
    costKind: cost?.kind ?? null,
    minimumPrice: cost?.min ?? null,
    maximumPrice: cost?.max ?? null,
    scope: admission.scope ?? null,
    sourceUrls: admission.sourceUrls ?? [],
    checkedAt: admission.checkedAt ?? null,
    basis: admission.basis ?? null,
  };
}

function validateKAI323Artifacts(input: BuildReportInput): {
  cohortSize: number;
  baselineRecords: number;
  proposalRecords: number;
  extractionRecords: number;
  sourceRegistryRecords: number;
  actionCounts: Record<string, number>;
  acceptedManualRecords: number;
} {
  const baselineRecords = Array.isArray(input.baseline.records)
    ? input.baseline.records
    : [];
  const proposalRecords = Array.isArray(input.proposalsArtifact.records)
    ? input.proposalsArtifact.records
    : [];
  const requireArtifact = (artifact: JsonObject, label: string): void => {
    if (
      artifact.schemaVersion !== 1 ||
      artifact.ticket !== "KAI-323" ||
      artifact.baseSha !== SOURCE_ARTIFACT_BASE_SHA ||
      artifact.readOnly !== true
    ) {
      throw new Error(`${label} has an invalid KAI-323 identity or base`);
    }
  };
  requireArtifact(input.baseline, "KAI-323 baseline");
  requireArtifact(input.proposalsArtifact, "KAI-323 proposals");
  const cohortSize = input.proposalsArtifact.cohortSize;
  if (
    typeof cohortSize !== "number" ||
    !Number.isInteger(cohortSize) ||
    cohortSize < 1 ||
    input.baseline.cohortSize !== cohortSize ||
    cohortSize !== baselineRecords.length ||
    cohortSize !== proposalRecords.length ||
    cohortSize !== input.proposals.length ||
    cohortSize !== input.extractions.length ||
    cohortSize !== input.registry.length
  ) {
    throw new Error("KAI-323 artifact cohort counts do not agree");
  }
  const baselineIds = baselineRecords.map((record) =>
    String(asObject(record)?.destinationId),
  );
  const proposalIds = proposalRecords.map((record) =>
    String(asObject(record)?.destinationId),
  );
  const extractionIds = input.extractions.map((record) => record.destinationId);
  const registryIds = input.registry.map((record) => record.destinationId);
  const catalogueById = new Map(
    input.catalogue.map((record) => [String(record.id), record]),
  );
  if (
    input.extractions.some(
      (record) =>
        typeof record.destinationId !== "string" ||
        record.destinationId.length === 0 ||
        typeof record.manualVerified !== "boolean" ||
        ![
          "verified",
          "verified_variable",
          "manual_review",
          "unresolved",
          "failed",
        ].includes(record.extractionStatus),
    )
  ) {
    throw new Error("KAI-323 extraction IDs or manual flags are malformed");
  }
  if (
    input.registry.some(
      (record) =>
        typeof record.destinationId !== "string" ||
        record.destinationId.length === 0 ||
        typeof record.sourceUrl !== "string" ||
        (record.sourceLanguage !== "en" && record.sourceLanguage !== "ja") ||
        typeof record.robotsBlockedAll !== "boolean" ||
        (record.robotsStatus !== null &&
          typeof record.robotsStatus !== "number") ||
        (record.technicalStatus !== null &&
          typeof record.technicalStatus !== "number"),
    )
  ) {
    throw new Error("KAI-323 source registry identity is malformed");
  }
  for (const [label, ids] of [
    ["baseline", baselineIds],
    ["proposals", proposalIds],
    ["extractions", extractionIds],
    ["source registry", registryIds],
  ] as const) {
    assertUniqueIds(ids, `KAI-323 ${label}`);
  }
  const sortedIds = (ids: readonly string[]) => [...ids].sort();
  if (
    stableJson(sortedIds(baselineIds)) !== stableJson(sortedIds(proposalIds)) ||
    stableJson(sortedIds(proposalIds)) !==
      stableJson(sortedIds(extractionIds)) ||
    stableJson(sortedIds(extractionIds)) !== stableJson(sortedIds(registryIds))
  ) {
    throw new Error("KAI-323 artifact destination IDs do not agree");
  }
  if (stableJson(proposalRecords) !== stableJson(input.proposals)) {
    throw new Error("KAI-323 proposal records do not match their artifact");
  }
  const requiredProposalFields = [
    "status",
    "sourceUrl",
    "ticketProduct",
    "adultPrice",
    "childPrice",
    "onlinePrice",
    "counterPrice",
    "minimumPrice",
    "maximumPrice",
    "originalPriceText",
    "conditions",
    "failureReason",
    "manualVerified",
  ];
  if (
    input.proposals.some((proposal) =>
      requiredProposalFields.some(
        (field) =>
          !Object.prototype.hasOwnProperty.call(proposal.extracted, field),
      ),
    )
  ) {
    throw new Error("KAI-323 proposal extraction projection is incomplete");
  }
  if (
    input.proposals.some(
      (proposal) =>
        typeof proposal.proposedAction !== "string" ||
        !KAI323_ACTIONS.has(proposal.proposedAction),
    )
  ) {
    throw new Error("KAI-323 proposal action is unsupported");
  }
  for (const baselineRecord of baselineRecords) {
    const record = asObject(baselineRecord);
    const destinationId = asString(record?.destinationId);
    const destination = destinationId
      ? catalogueById.get(destinationId)
      : undefined;
    if (!destination) {
      throw new Error(
        `KAI-323 baseline destination is missing: ${destinationId}`,
      );
    }
    if (record?.currentAdmission === undefined) {
      throw new Error(
        `KAI-323 baseline admission snapshot is missing: ${destinationId}`,
      );
    }
    const expected = record.currentAdmission;
    const actual = baselineAdmissionSnapshot(destination.admission);
    if (stableJson(expected) !== stableJson(actual)) {
      throw new Error(`KAI-323 baseline admission drift: ${destinationId}`);
    }
  }
  const baselineById = new Map(
    baselineRecords.map((record) => {
      const object = asObject(record);
      return [String(object?.destinationId), object];
    }),
  );
  for (const proposal of input.proposals) {
    const baseline = baselineById.get(proposal.destinationId);
    if (
      baseline?.currentAdmission !== undefined &&
      stableJson(proposal.existing) !== stableJson(baseline.currentAdmission)
    ) {
      throw new Error(
        `KAI-323 proposal existing-value drift: ${proposal.destinationId}`,
      );
    }
  }
  const actionCounts = countActions(input.proposals);
  const declaredCounts = asObject(input.proposalsArtifact.counts);
  if (
    !declaredCounts ||
    stableJson(declaredCounts) !== stableJson(actionCounts)
  ) {
    throw new Error("KAI-323 proposal action counts do not agree");
  }
  return {
    cohortSize,
    baselineRecords: baselineRecords.length,
    proposalRecords: proposalRecords.length,
    extractionRecords: input.extractions.length,
    sourceRegistryRecords: input.registry.length,
    actionCounts,
    acceptedManualRecords: input.extractions.filter(
      (record) => record.manualVerified === true,
    ).length,
  };
}

function assertCatalogueArray(
  value: unknown,
  label: string,
): asserts value is JsonObject[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty catalogue array`);
  }
  if (
    value.some(
      (record) =>
        !asObject(record) ||
        typeof (record as JsonObject).id !== "string" ||
        ((record as JsonObject).id as string).trim().length === 0,
    )
  ) {
    throw new Error(`${label} contains malformed destination records`);
  }
  assertUniqueIds(
    value.map((record) => String((record as JsonObject).id)),
    label,
  );
}

export interface BuildReportInput {
  catalogue: readonly JsonObject[];
  baseline: JsonObject;
  proposalsArtifact: JsonObject;
  proposals: readonly KAI323ProposalRecord[];
  extractions: readonly GovernanceExtraction[];
  registry: readonly SourceRegistryEntry[];
}

export function buildGovernanceReport(
  input: BuildReportInput,
): GovernanceReport {
  assertCatalogueArray(input.catalogue, "catalogue");
  if (
    input.proposals.some(
      (record) =>
        typeof record.destinationId !== "string" ||
        record.destinationId.trim().length === 0,
    )
  ) {
    throw new Error("proposal destination IDs are malformed");
  }
  assertUniqueIds(
    input.catalogue.map((record) => String(record.id)),
    "catalogue",
  );
  assertUniqueIds(
    input.proposals.map((record) => record.destinationId),
    "KAI-323 proposals",
  );
  assertUniqueIds(
    input.extractions.map((record) => record.destinationId),
    "KAI-323 extractions",
  );
  assertUniqueIds(
    input.registry.map((record) => record.destinationId),
    "KAI-323 source registry",
  );
  const kai323Validation = validateKAI323Artifacts(input);
  const catalogueById = new Map(
    input.catalogue.map((record) => [String(record.id), record]),
  );
  const extractionById = new Map(
    input.extractions.map((record) => [record.destinationId, record]),
  );
  const registryById = new Map(
    input.registry.map((record) => [record.destinationId, record]),
  );
  const records = input.proposals
    .map((proposal) => {
      const extraction = extractionById.get(proposal.destinationId);
      if (!extraction) {
        throw new Error(`Missing extraction record: ${proposal.destinationId}`);
      }
      return buildRecord(
        proposal,
        normalizedExtraction(extraction),
        registryById.get(proposal.destinationId),
        catalogueById.get(proposal.destinationId),
        catalogueById,
      );
    })
    .sort((left, right) =>
      left.destinationId.localeCompare(right.destinationId),
    );
  const counts = {
    total: records.length,
    approved: records.filter((record) => record.decision === "approved").length,
    heldForReview: records.filter(
      (record) => record.decision === "held_for_review",
    ).length,
    rejected: records.filter((record) => record.decision === "rejected").length,
    kai323AcceptedCandidates: kai323Validation.acceptedManualRecords,
    currentFactsUntouched: records.filter(
      (record) => record.currentFactUntouched,
    ).length,
  };
  return {
    schemaVersion: 1,
    ticket: "KAI-324",
    catalogueBaseSha: CATALOGUE_BASE_SHA,
    catalogueBaseVerified: verifyCatalogueBase(input.catalogue),
    sourceArtifactBaseSha: SOURCE_ARTIFACT_BASE_SHA,
    catalogueSha256: jsonSha256(input.catalogue),
    readOnly: true,
    inputArtifacts: REQUIRED_INPUT_ARTIFACTS,
    ownership: {
      canonicalCatalogue: "src/shared/data/destinations-index.json",
      derivedCatalogueAssets: [
        "src/shared/data/destinations-index.lite.json",
        "src/shared/data/destination-relationships.json",
        "public/data/destinations.json",
      ],
      admissionValidator: "src/shared/services/budget/factValidation.ts",
      budgetConsumers: [
        "src/shared/services/budget/tripEstimateEngine.ts",
        "src/shared/services/budget/BudgetService.ts",
        "src/shared/services/budget/GeneratedPlanCostService.ts",
      ],
      eventualPublishTarget:
        "Destination.admission in src/shared/data/destinations-index.json",
    },
    counts,
    kai323Validation,
    records,
    untouchedDestinationIds: records
      .filter((record) => record.currentFactUntouched)
      .map((record) => record.destinationId),
  };
}

export function manualReviewEvidenceSha256(record: GovernanceRecord): string {
  return jsonSha256({
    sourceUrl: record.sourceEvidence.sourceUrl,
    quotation: record.sourceEvidence.quotation,
  });
}

function assertManualReviewArtifact(
  report: GovernanceReport,
  catalogue: readonly JsonObject[],
  artifact: ManualReviewArtifact,
): void {
  if (
    report.readOnly !== true ||
    report.catalogueBaseVerified !== true ||
    artifact.schemaVersion !== 1 ||
    artifact.ticket !== "KAI-324" ||
    artifact.explicitManualApproval !== true ||
    typeof artifact.reviewedBy !== "string" ||
    artifact.reviewedBy.trim().length === 0 ||
    !isValidDate(artifact.reviewedAt) ||
    artifact.reviewedAt > EVALUATION_DATE ||
    !Array.isArray(artifact.decisions)
  ) {
    throw new Error("manual review artifact is malformed");
  }
  if (
    artifact.reportSha256 !== reportSha256(report) ||
    artifact.catalogueSha256 !== report.catalogueSha256 ||
    jsonSha256(catalogue) !== report.catalogueSha256
  ) {
    throw new Error("manual review artifact snapshot does not match");
  }
  assertCatalogueArray(catalogue, "catalogue");
  assertUniqueIds(
    artifact.decisions.map((decision) => decision.destinationId),
    "manual review decisions",
  );
}

export function promoteManualReview(
  report: GovernanceReport,
  catalogue: readonly JsonObject[],
  artifact: ManualReviewArtifact,
): GovernanceReport {
  assertManualReviewArtifact(report, catalogue, artifact);
  const promoted = structuredClone(report);
  for (const decision of artifact.decisions) {
    if (
      typeof decision.destinationId !== "string" ||
      typeof decision.sourceUrl !== "string" ||
      typeof decision.evidenceSha256 !== "string" ||
      typeof decision.revalidatedAt !== "string" ||
      typeof decision.reviewerNote !== "string" ||
      decision.reviewerNote.trim().length === 0 ||
      !/^[a-f0-9]{64}$/.test(decision.evidenceSha256) ||
      !isValidDate(decision.revalidatedAt) ||
      decision.revalidatedAt > EVALUATION_DATE
    ) {
      throw new Error("manual review decision is malformed");
    }
    const index = promoted.records.findIndex(
      (record) => record.destinationId === decision.destinationId,
    );
    if (index < 0) throw new Error("manual review destination is missing");
    const record = promoted.records[index];
    if (record.decision === "rejected") {
      throw new Error("rejected records require new evidence before promotion");
    }
    if (record.decision !== "held_for_review") {
      throw new Error("only held records can be manually promoted");
    }
    if (
      record.sourceEvidence.sourceUrl !== decision.sourceUrl ||
      manualReviewEvidenceSha256(record) !== decision.evidenceSha256
    ) {
      throw new Error("manual review evidence does not match the report");
    }
    if (record.sourceEvidence.collectionPermission !== "manual_one_time_only") {
      throw new Error("manual review source is blocked or unknown");
    }
    if (!record.proposedValue) {
      throw new Error("manual review candidate has no proposed admission");
    }
    const validation = validateAdmissionFact(record.proposedValue);
    if (!validation.valid) {
      throw new Error(
        `manual review candidate is not a valid admission fact: ${validation.reason ?? "unknown"}`,
      );
    }
    promoted.records[index] = {
      ...record,
      decision: "approved",
      confidence: "high",
      reviewerOrRule: `KAI-324 manual-review-approved:${artifact.reviewedBy}`,
      reason: decision.reviewerNote,
      reasonCodes: [...record.reasonCodes, "manual_review_revalidated"],
      validation: { valid: true, issues: [] },
      decisionHistory: [
        ...record.decisionHistory,
        {
          event: "kai324_manual_approval",
          at: decision.revalidatedAt,
          decision: "approved",
          actorOrRule: `manual:${artifact.reviewedBy}`,
          reason: decision.reviewerNote,
        },
      ],
    };
  }
  const records = promoted.records;
  promoted.counts = {
    ...promoted.counts,
    approved: records.filter((record) => record.decision === "approved").length,
    heldForReview: records.filter(
      (record) => record.decision === "held_for_review",
    ).length,
    rejected: records.filter((record) => record.decision === "rejected").length,
  };
  return promoted;
}

export function renderGovernanceMarkdown(report: GovernanceReport): string {
  const lines = [
    "# KAI-324 — Provenance and approval dry run",
    "",
    `Catalogue base: \`${report.catalogueBaseSha}\` (verified: ${report.catalogueBaseVerified ? "yes" : "no"})`,
    `KAI-323 artifact base: \`${report.sourceArtifactBaseSha}\``,
    `Catalogue snapshot SHA-256: \`${report.catalogueSha256}\``,
    `KAI-323 validated artifacts: ${report.kai323Validation.baselineRecords}/${report.kai323Validation.proposalRecords}/${report.kai323Validation.extractionRecords}/${report.kai323Validation.sourceRegistryRecords} records; accepted/manual: ${report.kai323Validation.acceptedManualRecords}`,
    "",
    "This is a deterministic, read-only evaluation. It does not mutate the canonical catalogue, derived assets, Supabase, budget calculations, or production services.",
    "",
    "## Ownership",
    "",
    `- Canonical admission source of truth: \`${report.ownership.canonicalCatalogue}\` (\`Destination.admission\`)`,
    `- Validator: \`${report.ownership.admissionValidator}\``,
    `- Budget consumers: ${report.ownership.budgetConsumers.map((value) => `\`${value}\``).join(", ")}`,
    `- Eventual approved publish target: \`${report.ownership.eventualPublishTarget}\``,
    "- This PR does not execute that publish.",
    "",
    "## Decision counts",
    "",
    `- Total KAI-323 records evaluated: **${report.counts.total}**`,
    `- Automatically approved: **${report.counts.approved}**`,
    `- Held for manual review: **${report.counts.heldForReview}**`,
    `- Rejected proposed replacements: **${report.counts.rejected}**`,
    `- KAI-323 accepted research candidates represented: **${report.counts.kai323AcceptedCandidates}**; none are automatically approved by this gate.`,
    `- Existing admission facts explicitly untouched: **${report.counts.currentFactsUntouched}**`,
    "",
    "## Rules",
    "",
    "- Automatic approval requires exact destination identity, an HTTPS official source matching the registry, successful source access, sanitized evidence, explicit product/category/scope/tax/date metadata, valid JPY values, manual verification, equivalence with the trusted current fact, and no conflict.",
    "- Variable, date/time-dependent, bundled, premium, online/counter, age-band, changed-source, stale, or condition-ambiguous facts are held.",
    "- Failed/unresolved source results are rejected as replacements; they never clear or downgrade the existing fact.",
    "- Free requires explicit free evidence; zero or missing prices are not free.",
    "- `observedMinimum`/`observedMaximum` from KAI-323 parser output are not treated as admission bounds.",
    "",
    "## Decision trails",
    "",
  ];
  for (const record of report.records) {
    lines.push(
      `### ${markdownSafe(record.destinationId)}`,
      `- Decision: **${record.decision}**`,
      `- Prior KAI-323 action: \`${markdownSafe(record.priorKAI323Action)}\``,
      `- Confidence: ${record.confidence}`,
      `- Source: ${markdownSafe(record.sourceEvidence.sourceUrl)} (${markdownSafe(record.sourceEvidence.registryTechnicalResult ?? "no registry result")})`,
      `- Evidence quotation: ${record.sourceEvidence.quotation ? `“${record.sourceEvidence.quotation}”` : "none"}`,
      `- Reason: ${record.reason}`,
      `- Validation issues: ${record.reasonCodes.length > 0 ? record.reasonCodes.map((value) => `\`${value}\``).join(", ") : "none"}`,
      `- Proposed field changes: ${record.proposedFieldChanges.length > 0 ? "`/admission` candidate retained for review" : "none"}`,
      `- Existing fact untouched: **${record.currentFactUntouched ? "yes" : "no"}**`,
      "",
    );
  }
  lines.push(
    "## Publish boundary",
    "",
    "The publish helper requires a separate reviewed approval artifact containing the deterministic report SHA, reviewer, review date, explicit confirmation, and approved destination IDs. It validates every approved change before writing, writes a backup, uses an atomic file replacement, is idempotent, and supports restoring the backup. No approval artifact or production publish was executed in this PR.",
  );
  return `${lines.join("\n")}\n`;
}

function assertApprovalMatches(
  report: GovernanceReport,
  approval: ApprovalArtifact,
  catalogue: readonly JsonObject[],
): void {
  if (report.readOnly !== true || report.catalogueBaseVerified !== true) {
    throw new Error("decision report is not a verified read-only report");
  }
  if (report.schemaVersion !== 1 || report.ticket !== "KAI-324") {
    throw new Error("decision report identity is invalid");
  }
  if (
    report.sourceArtifactBaseSha !== SOURCE_ARTIFACT_BASE_SHA ||
    report.catalogueBaseSha !== CATALOGUE_BASE_SHA
  ) {
    throw new Error("decision report base identity is invalid");
  }
  if (
    !approval ||
    typeof approval !== "object" ||
    approval.schemaVersion !== 1 ||
    approval.ticket !== "KAI-324"
  ) {
    throw new Error("invalid KAI-324 approval artifact identity");
  }
  if (approval.explicitPublishConfirmation !== true) {
    throw new Error("explicit publish confirmation is required");
  }
  if (
    typeof approval.reviewedAt !== "string" ||
    typeof approval.reviewedBy !== "string" ||
    typeof approval.reportSha256 !== "string" ||
    typeof approval.catalogueSha256 !== "string" ||
    !Array.isArray(approval.approvedDestinationIds) ||
    !approval.approvedDestinationIds.every(
      (id) => typeof id === "string" && id.length > 0,
    )
  ) {
    throw new Error("approval artifact fields are malformed");
  }
  if (
    !/^[a-f0-9]{64}$/.test(approval.reportSha256) ||
    !/^[a-f0-9]{64}$/.test(approval.catalogueSha256)
  ) {
    throw new Error("approval artifact hashes are malformed");
  }
  if (
    !isValidDate(approval.reviewedAt) ||
    approval.reviewedAt > EVALUATION_DATE ||
    approval.reviewedBy.trim().length === 0
  ) {
    throw new Error("reviewer and valid review date are required");
  }
  if (approval.reportSha256 !== reportSha256(report)) {
    throw new Error("approval artifact does not match the decision report");
  }
  if (approval.catalogueSha256 !== report.catalogueSha256) {
    throw new Error("approval artifact does not match the catalogue snapshot");
  }
  if (jsonSha256(catalogue) !== report.catalogueSha256) {
    throw new Error("catalogue input does not match the approved snapshot");
  }
  assertCatalogueArray(catalogue, "catalogue");
  assertUniqueIds(approval.approvedDestinationIds, "approved destination IDs");
  const approvedReportIds = report.records
    .filter((record) => record.decision === "approved")
    .map((record) => record.destinationId)
    .sort();
  const approvedArtifactIds = [...approval.approvedDestinationIds].sort();
  if (stableJson(approvedArtifactIds) !== stableJson(approvedReportIds)) {
    throw new Error("approval IDs must exactly match automatic approvals");
  }
}

export function applyApprovedChanges(
  catalogue: readonly JsonObject[],
  report: GovernanceReport,
  approval: ApprovalArtifact,
): JsonObject[] {
  assertApprovalMatches(report, approval, catalogue);
  const prepared = report.records
    .filter((candidate) => candidate.decision === "approved")
    .map((record) => {
      if (record.fieldPath !== "/admission") {
        throw new Error(`unsupported approved field path: ${record.fieldPath}`);
      }
      const index = catalogue.findIndex(
        (candidate) => String(candidate.id) === record.destinationId,
      );
      const change = record.proposedFieldChanges[0];
      if (
        record.proposedFieldChanges.length !== 1 ||
        !change ||
        change.fieldPath !== "/admission"
      ) {
        throw new Error(
          `approved destination has invalid field changes: ${record.destinationId}`,
        );
      }
      const currentAdmission =
        index >= 0 ? (catalogue[index].admission ?? null) : null;
      if (index < 0 || !change) {
        throw new Error(
          `approved destination cannot be applied: ${record.destinationId}`,
        );
      }
      if (
        stableJson(currentAdmission) !== stableJson(record.existingValue) ||
        stableJson(change.existingValue) !== stableJson(record.existingValue) ||
        stableJson(change.proposedValue) !== stableJson(record.proposedValue) ||
        !asObject(change.proposedValue)
      ) {
        throw new Error(
          `approved destination state changed: ${record.destinationId}`,
        );
      }
      return { index, proposedValue: change.proposedValue };
    });
  const output = catalogue.map((record) => ({ ...record }));
  for (const change of prepared) {
    output[change.index] = {
      ...output[change.index],
      admission: change.proposedValue,
    };
  }
  return output;
}

function writeAtomicJson(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  let temporaryPath = "";
  let descriptor = -1;
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
      try {
        descriptor = fs.openSync(
          candidate,
          fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
          0o600,
        );
        temporaryPath = candidate;
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
      }
    }
    if (descriptor < 0 || !temporaryPath) {
      throw new Error("could not allocate an exclusive temporary file");
    }
    fs.writeFileSync(descriptor, stableJson(value), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = -1;
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor >= 0) fs.closeSync(descriptor);
    if (temporaryPath && fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

interface BackupEnvelope {
  schemaVersion: 1;
  targetPath: string;
  existed: boolean;
  content: JsonObject[] | null;
  contentSha256: string | null;
  publishedOutputSha256: string;
}

function resolvedPathWithRealParent(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const suffix = [path.basename(absolutePath)];
  let parent = path.dirname(absolutePath);
  while (!fs.existsSync(parent)) {
    suffix.unshift(path.basename(parent));
    parent = path.dirname(parent);
  }
  return path.join(fs.realpathSync(parent), ...suffix);
}

function hasProductionInode(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const target = fs.statSync(filePath);
  const stack = [
    path.resolve(ROOT, "src/shared/data"),
    path.resolve(ROOT, "public/data"),
  ];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (!directory || !fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const candidate = fs.statSync(entryPath);
        if (candidate.dev === target.dev && candidate.ino === target.ino) {
          return true;
        }
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      const candidate = fs.statSync(entryPath);
      if (candidate.dev === target.dev && candidate.ino === target.ino) {
        return true;
      }
    }
  }
  return false;
}

function hasSymlinkComponent(filePath: string): boolean {
  const absolutePath = path.resolve(filePath);
  const parsed = path.parse(absolutePath);
  let current = parsed.root;
  for (const component of absolutePath
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, component);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return true;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") continue;
      throw error;
    }
  }
  return false;
}

function assertSafePublishPath(filePath: string): void {
  const absolutePath = path.resolve(filePath);
  const canonicalPath = path.resolve(CATALOGUE_PATH);
  if (hasSymlinkComponent(filePath)) {
    throw new Error("symlink path components are not allowed");
  }
  if (absolutePath === canonicalPath) {
    throw new Error("production catalogue publish is disabled in KAI-324");
  }
  const productionDirectories = [
    path.resolve(ROOT, "src/shared/data"),
    path.resolve(ROOT, "public/data"),
  ];
  if (
    productionDirectories.some(
      (directory) =>
        absolutePath === directory ||
        absolutePath.startsWith(`${directory}${path.sep}`),
    )
  ) {
    throw new Error("production data paths are disabled in KAI-324");
  }
  const resolvedPath = resolvedPathWithRealParent(filePath);
  if (
    productionDirectories.some(
      (directory) =>
        resolvedPath === directory ||
        resolvedPath.startsWith(`${directory}${path.sep}`),
    )
  ) {
    throw new Error("publish path resolves inside production data");
  }
  if (resolvedPath === canonicalPath) {
    throw new Error("publish path resolves to the production catalogue");
  }
  if (hasProductionInode(absolutePath)) {
    throw new Error("hard-link publish targets must not alias production data");
  }
  if (
    fs.existsSync(absolutePath) &&
    fs.statSync(absolutePath).ino === fs.statSync(canonicalPath).ino &&
    fs.statSync(absolutePath).dev === fs.statSync(canonicalPath).dev
  ) {
    throw new Error("hard-link publish targets are not allowed");
  }
  if (
    fs.existsSync(absolutePath) &&
    fs.lstatSync(absolutePath).isSymbolicLink()
  ) {
    throw new Error("symlink publish targets are not allowed");
  }
}

function assertDistinctPublishPaths(paths: readonly string[]): void {
  const resolved = paths.map((value) => path.resolve(value));
  if (new Set(resolved).size !== resolved.length) {
    throw new Error("catalogue, output, and backup paths must be distinct");
  }
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      if (!fs.existsSync(paths[left]) || !fs.existsSync(paths[right])) continue;
      const leftStat = fs.statSync(paths[left]);
      const rightStat = fs.statSync(paths[right]);
      if (leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino) {
        throw new Error(
          "catalogue, output, and backup hard links must be distinct",
        );
      }
    }
  }
}

export function restoreCatalogueBackup(
  targetPath: string,
  backupPath: string,
): void {
  assertSafePublishPath(targetPath);
  assertSafePublishPath(backupPath);
  assertDistinctPublishPaths([targetPath, backupPath]);
  if (!fs.existsSync(backupPath))
    throw new Error("catalogue backup is missing");
  const backup = JSON.parse(
    fs.readFileSync(backupPath, "utf8"),
  ) as BackupEnvelope;
  if (
    backup.schemaVersion !== 1 ||
    backup.targetPath !== path.resolve(targetPath)
  ) {
    throw new Error("catalogue backup target does not match");
  }
  if (typeof backup.existed !== "boolean") {
    throw new Error("catalogue backup existence flag is malformed");
  }
  if (
    backup.existed &&
    (!Array.isArray(backup.content) ||
      backup.content.some(
        (record) =>
          !asObject(record) ||
          typeof (record as JsonObject).id !== "string" ||
          ((record as JsonObject).id as string).trim().length === 0,
      ))
  ) {
    throw new Error("catalogue backup content is malformed");
  }
  if (!backup.existed && backup.content !== null) {
    throw new Error(
      "catalogue backup content must be null for an absent target",
    );
  }
  if (backup.existed) {
    if (!backup.content) throw new Error("catalogue backup content is missing");
    assertCatalogueArray(backup.content, "restored catalogue");
  }
  if (backup.existed && backup.contentSha256 !== jsonSha256(backup.content)) {
    throw new Error("catalogue backup content digest does not match");
  }
  if (!backup.existed && backup.contentSha256 !== null) {
    throw new Error(
      "catalogue backup digest must be null for an absent target",
    );
  }
  if (
    typeof backup.publishedOutputSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(backup.publishedOutputSha256)
  ) {
    throw new Error("published output hash is malformed");
  }
  const targetExists = fs.existsSync(targetPath);
  if (targetExists) {
    const currentTarget: unknown = JSON.parse(
      fs.readFileSync(targetPath, "utf8"),
    );
    assertCatalogueArray(currentTarget, "current published output");
    if (jsonSha256(currentTarget) !== backup.publishedOutputSha256) {
      throw new Error("published output changed since approval");
    }
  } else if (backup.existed) {
    throw new Error("published output is missing since approval");
  }
  if (backup.existed) {
    if (!backup.content) throw new Error("catalogue backup content is missing");
    writeAtomicJson(targetPath, backup.content);
  } else if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath);
  }
}

export function publishApprovedCatalogue(options: {
  cataloguePath: string;
  outputPath: string;
  backupPath: string;
  catalogue: readonly JsonObject[];
  report: GovernanceReport;
  approval: ApprovalArtifact;
}): PublishResult {
  assertSafePublishPath(options.cataloguePath);
  assertSafePublishPath(options.outputPath);
  assertSafePublishPath(options.backupPath);
  assertDistinctPublishPaths([
    options.cataloguePath,
    options.outputPath,
    options.backupPath,
  ]);
  if (!fs.existsSync(options.cataloguePath)) {
    throw new Error("catalogue input is missing");
  }
  const inputText = fs.readFileSync(options.cataloguePath, "utf8");
  if (inputText !== stableJson(options.catalogue)) {
    throw new Error("catalogue file does not match provided snapshot");
  }
  const nextCatalogue = applyApprovedChanges(
    options.catalogue,
    options.report,
    options.approval,
  );
  const nextText = stableJson(nextCatalogue);
  if (fs.existsSync(options.outputPath)) {
    const existingText = fs.readFileSync(options.outputPath, "utf8");
    if (existingText === nextText) {
      return {
        changed: false,
        backupCreated: false,
        outputPath: options.outputPath,
        approvedDestinationIds: options.approval.approvedDestinationIds,
      };
    }
  }
  const targetExists = fs.existsSync(options.outputPath);
  let priorOutput: JsonObject[] | null = null;
  if (targetExists) {
    const parsedOutput: unknown = JSON.parse(
      fs.readFileSync(options.outputPath, "utf8"),
    );
    assertCatalogueArray(parsedOutput, "existing output target");
    priorOutput = parsedOutput;
  }
  const backup: BackupEnvelope = {
    schemaVersion: 1,
    targetPath: path.resolve(options.outputPath),
    existed: targetExists,
    content: priorOutput,
    contentSha256: targetExists ? jsonSha256(priorOutput) : null,
    publishedOutputSha256: jsonSha256(nextCatalogue),
  };
  writeAtomicJson(options.backupPath, backup);
  writeAtomicJson(options.outputPath, nextCatalogue);
  return {
    changed: true,
    backupCreated: true,
    outputPath: options.outputPath,
    approvedDestinationIds: options.approval.approvedDestinationIds,
  };
}

export function loadActualGovernanceReport(): GovernanceReport {
  const catalogue = readJson<JsonObject[]>(CATALOGUE_PATH);
  const baseline = readJson<JsonObject>(BASELINE_PATH);
  const proposalsFile = readJson<JsonObject>(PROPOSALS_PATH);
  const proposals = Array.isArray(proposalsFile.records)
    ? (proposalsFile.records as KAI323ProposalRecord[])
    : [];
  const extractions = readJson<GovernanceExtraction[]>(EXTRACTIONS_PATH);
  const registry = readJson<SourceRegistryEntry[]>(REGISTRY_PATH);
  return buildGovernanceReport({
    catalogue,
    baseline,
    proposalsArtifact: proposalsFile,
    proposals,
    extractions,
    registry,
  });
}

function writeReportFiles(report: GovernanceReport): void {
  fs.mkdirSync(QA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON_PATH, stableJson(report), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, renderGovernanceMarkdown(report), "utf8");
}

function parseArg(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function runCli(args: readonly string[]): void {
  const report = loadActualGovernanceReport();
  if (args.includes("--publish")) {
    const approvalPath = parseArg(args, "--approval-artifact");
    const inputPath = parseArg(args, "--input") ?? CATALOGUE_PATH;
    const outputPath = parseArg(args, "--output");
    const backupPath = parseArg(args, "--backup");
    if (!approvalPath || !outputPath || !backupPath) {
      throw new Error(
        "--publish requires --approval-artifact, --input, --output, and --backup",
      );
    }

    const approval = readJson<ApprovalArtifact>(approvalPath);
    const catalogue = readJson<JsonObject[]>(inputPath);
    const result = publishApprovedCatalogue({
      cataloguePath: inputPath,
      outputPath,
      backupPath,
      catalogue,
      report,
      approval,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const shouldWrite = args.includes("--write");
  const loaded = fs.existsSync(REPORT_JSON_PATH)
    ? readJson<GovernanceReport>(REPORT_JSON_PATH)
    : null;
  if (args.includes("--check")) {
    if (
      !loaded ||
      stableJson(loaded) !== stableJson(report) ||
      !fs.existsSync(REPORT_MD_PATH) ||
      fs.readFileSync(REPORT_MD_PATH, "utf8") !==
        renderGovernanceMarkdown(report)
    ) {
      throw new Error("KAI-324 generated report is stale; run with --write");
    }
    console.log(
      JSON.stringify(
        {
          ticket: report.ticket,
          total: report.counts.total,
          approved: report.counts.approved,
          heldForReview: report.counts.heldForReview,
          rejected: report.counts.rejected,
          currentFactsUntouched: report.counts.currentFactsUntouched,
          mode: "check",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (shouldWrite) writeReportFiles(report);
  console.log(
    JSON.stringify(
      {
        ticket: report.ticket,
        total: report.counts.total,
        approved: report.counts.approved,
        heldForReview: report.counts.heldForReview,
        rejected: report.counts.rejected,
        currentFactsUntouched: report.counts.currentFactsUntouched,
        mode: shouldWrite ? "write" : "dry-run",
      },
      null,
      2,
    ),
  );
}

const entryPath = process.argv[1]
  ? fileURLToPath(new URL(`file://${process.argv[1]}`))
  : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2));
}
