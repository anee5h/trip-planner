/**
 * KAI-219A — dependency-neutral runtime validator for KAI-218 scoped cost
 * facts (admission / localTransport).
 *
 * ONE validator, used by ALL production fact consumers (TripCostEngine,
 * GeneratedPlanCostService, the legacy projection) so no consumer maintains
 * divergent partial validation rules. Pure, deterministic, no I/O, no
 * imports from the rest of the app (dependency-neutral: only the fact
 * types + plain Date parsing).
 *
 * Contract (mirrors the KAI-218* PREVENTIVE_CODES authoring validators):
 *   - An INVALID persisted fact is rejected at runtime → consumers must
 *     treat it as UNAVAILABLE (never numeric, never Free, never promoted).
 *   - verified_free requires bounded [0,0] + verified_source provenance +
 *     explicit KAI-214 free evidence + sourceUrls + valid checkedAt.
 *   - verified_paid requires bounded (finite, min>=0, max>=min, NON-zero
 *     range) + verified_source + sourceUrls + valid checkedAt.
 *   - documented_estimate requires model provenance + bounded/open_ended
 *     with valid numeric shape.
 *   - variable_price requires reasonCode; bounded → verified_source +
 *     sourceUrls + valid checkedAt; open_ended → finite from >= 0;
 *     variable → valid state/shape combination.
 *   - not_applicable requires cost.kind not_applicable + reason.
 *   - unavailable requires cost.kind unavailable + reason.
 *   - LocalTransport: verified_required_access → finite fare [min,max]
 *     (min>=0, max>=min) + sourceUrls + basis + valid checkedAt (+
 *     positive/default review interval); bounded_defensible_access →
 *     valid fare + finite non-negative distance + sourceUrls;
 *     verified_walking → explicit walkingEvidence (no manufactured fare);
 *   - not_applicable/unavailable → valid required fields.
 */
import { hasVerifiedFreeEvidence } from "./freeEvidence";

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

// KAI-219A contract (Fix 2): the FREE rule is the SHARED dependency-neutral
// hasVerifiedFreeEvidence() from freeEvidence.ts — the SAME rule used by
// budgetState (runtime) and data-quality-rules (authoring CI). NO second
// free-evidence regex exists in this module.

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * KAI-219A contract (Fix 5) + KAI-219D1 (S3): strict YYYY-MM-DD + calendar
 * round-trip. The SINGLE shared strict-date implementation — used by
 * factValidation (runtime), data-quality-rules (authoring CI), and the
 * D1 migration authoring. No second date implementation exists.
 * Date.parse alone accepts impossible/ambiguous inputs (2026-02-30,
 * 01/02/2026); checkedAt must be an unambiguous real calendar date.
 */
export function isValidCheckedAtDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Round-trip: the parsed date must have the SAME Y/M/D (rejects
  // 2026-02-30 → 2026-03-02, 2026-04-31, etc.).
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function isNonEmptyUrlList(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((u) => typeof u === "string" && u.length > 0)
  );
}

function isValidReviewInterval(v: unknown): boolean {
  if (v === undefined) return true; // default 12
  return isFiniteNumber(v) && v > 0;
}

/** Bounded numeric shape: finite, min>=0, max>=min. */
function isValidBounded(min: unknown, max: unknown): boolean {
  return isFiniteNumber(min) && isFiniteNumber(max) && min >= 0 && max >= min;
}

/**
 * Validates an AdmissionCostFact. Returns { valid: true } or
 * { valid: false, reason } — consumers fail closed to unavailable.
 */
export function validateAdmissionFact(
  fact: Readonly<{
    state?: string;
    provenance?: string;
    reasonCode?: string;
    cost?: { kind?: string; min?: number; max?: number; from?: number };
    basis?: string;
    sourceUrls?: readonly string[];
    checkedAt?: string;
    reviewIntervalMonths?: number;
  }>,
): ValidationResult {
  const { state, provenance, cost } = fact;
  if (!state || !provenance || !cost) {
    return { valid: false, reason: "missing_state_provenance_or_cost" };
  }
  if (!isValidReviewInterval(fact.reviewIntervalMonths)) {
    return { valid: false, reason: "invalid_review_interval" };
  }

  switch (state) {
    case "verified_paid": {
      if (cost.kind !== "bounded") {
        return { valid: false, reason: "verified_paid_not_bounded" };
      }
      if (!isValidBounded(cost.min, cost.max)) {
        return { valid: false, reason: "verified_paid_invalid_range" };
      }
      // Zero range rejected as paid — a ¥0 paid fact is not a paid fact.
      if (cost.min === 0 && cost.max === 0) {
        return { valid: false, reason: "verified_paid_zero_range" };
      }
      if (provenance !== "verified_source") {
        return { valid: false, reason: "verified_paid_not_verified_source" };
      }
      if (!isNonEmptyUrlList(fact.sourceUrls)) {
        return { valid: false, reason: "verified_paid_missing_source_urls" };
      }
      if (!isValidCheckedAtDate(fact.checkedAt)) {
        return { valid: false, reason: "verified_paid_invalid_checked_at" };
      }
      return { valid: true };
    }
    case "verified_free": {
      if (cost.kind !== "bounded" || cost.min !== 0 || cost.max !== 0) {
        return { valid: false, reason: "verified_free_not_zero" };
      }
      if (provenance !== "verified_source") {
        return { valid: false, reason: "verified_free_not_verified_source" };
      }
      // KAI-219A contract (Fix 2): the SHARED hasVerifiedFreeEvidence()
      // rule — positive evidence required AND negative evidence
      // ("not free", "tickets required") rejects. Same rule as authoring CI.
      if (!hasVerifiedFreeEvidence(fact.basis, cost.min)) {
        return { valid: false, reason: "verified_free_missing_evidence" };
      }
      if (!isNonEmptyUrlList(fact.sourceUrls)) {
        return { valid: false, reason: "verified_free_missing_source_urls" };
      }
      if (!isValidCheckedAtDate(fact.checkedAt)) {
        return { valid: false, reason: "verified_free_invalid_checked_at" };
      }
      return { valid: true };
    }
    case "documented_estimate": {
      if (provenance !== "model") {
        return { valid: false, reason: "documented_estimate_not_model" };
      }
      if (cost.kind === "bounded") {
        return isValidBounded(cost.min, cost.max)
          ? { valid: true }
          : { valid: false, reason: "documented_estimate_invalid_bounded" };
      }
      if (cost.kind === "open_ended") {
        return isFiniteNumber(cost.from) && cost.from >= 0
          ? { valid: true }
          : { valid: false, reason: "documented_estimate_invalid_open_ended" };
      }
      return { valid: false, reason: "documented_estimate_wrong_shape" };
    }
    case "variable_price": {
      if (!fact.reasonCode) {
        return { valid: false, reason: "variable_price_missing_reason" };
      }
      if (cost.kind === "bounded") {
        // Bounded official range: verified_source + sourceUrls + checkedAt.
        if (!isValidBounded(cost.min, cost.max)) {
          return { valid: false, reason: "variable_price_invalid_bounded" };
        }
        if (provenance !== "verified_source") {
          return {
            valid: false,
            reason: "variable_price_bounded_not_verified",
          };
        }
        if (!isNonEmptyUrlList(fact.sourceUrls)) {
          return {
            valid: false,
            reason: "variable_price_bounded_missing_urls",
          };
        }
        if (!isValidCheckedAtDate(fact.checkedAt)) {
          return { valid: false, reason: "variable_price_invalid_checked_at" };
        }
        return { valid: true };
      }
      if (cost.kind === "open_ended") {
        return isFiniteNumber(cost.from) && cost.from >= 0
          ? { valid: true }
          : { valid: false, reason: "variable_price_invalid_from" };
      }
      if (cost.kind === "variable") {
        return { valid: true };
      }
      return { valid: false, reason: "variable_price_wrong_shape" };
    }
    case "not_applicable": {
      if (cost.kind !== "not_applicable") {
        return { valid: false, reason: "not_applicable_wrong_shape" };
      }
      if (!fact.reasonCode) {
        return { valid: false, reason: "not_applicable_missing_reason" };
      }
      return { valid: true };
    }
    case "unavailable": {
      if (cost.kind !== "unavailable") {
        return { valid: false, reason: "unavailable_wrong_shape" };
      }
      if (!fact.reasonCode) {
        return { valid: false, reason: "unavailable_missing_reason" };
      }
      return { valid: true };
    }
    default:
      return { valid: false, reason: "unknown_state" };
  }
}

/**
 * Validates a LocalTransportAccess fact. Returns { valid: true } or
 * { valid: false, reason } — consumers fail closed to unavailable.
 */
export function validateLocalTransportFact(
  fact: Readonly<{
    kind?: string;
    fare?: readonly [number, number] | readonly number[];
    fareBasis?: string;
    coverage?: string;
    sourceUrls?: readonly string[];
    basis?: string;
    walkingEvidence?: string;
    distanceKm?: number;
    checkedAt?: string;
    reviewIntervalMonths?: number;
    reason?: string;
    detail?: string;
  }>,
): ValidationResult {
  const { kind } = fact;
  if (!kind) return { valid: false, reason: "missing_kind" };
  if (!isValidReviewInterval(fact.reviewIntervalMonths)) {
    return { valid: false, reason: "invalid_review_interval" };
  }

  switch (kind) {
    case "verified_required_access": {
      const [min, max] = fact.fare ?? [];
      if (!isValidBounded(min, max)) {
        return { valid: false, reason: "verified_required_invalid_fare" };
      }
      // KAI-219A contract: numeric fares REQUIRE an explicit fareBasis +
      // coverage (no silent "one-way but charged once" default).
      if (
        fact.fareBasis !== "one_way" &&
        fact.fareBasis !== "round_trip" &&
        fact.fareBasis !== "required_access_total"
      ) {
        return { valid: false, reason: "verified_required_missing_fare_basis" };
      }
      if (
        fact.coverage !== "all_required_access" &&
        fact.coverage !== "segment_only"
      ) {
        return { valid: false, reason: "verified_required_missing_coverage" };
      }
      if (!isNonEmptyUrlList(fact.sourceUrls)) {
        return { valid: false, reason: "verified_required_missing_urls" };
      }
      if (!fact.basis || fact.basis.length === 0) {
        return { valid: false, reason: "verified_required_missing_basis" };
      }
      if (!isValidCheckedAtDate(fact.checkedAt)) {
        return { valid: false, reason: "verified_required_invalid_checked_at" };
      }
      return { valid: true };
    }
    case "bounded_defensible_access": {
      const [min, max] = fact.fare ?? [];
      if (!isValidBounded(min, max)) {
        return { valid: false, reason: "bounded_defensible_invalid_fare" };
      }
      // KAI-219A contract: explicit fareBasis + coverage required.
      if (
        fact.fareBasis !== "one_way" &&
        fact.fareBasis !== "round_trip" &&
        fact.fareBasis !== "required_access_total"
      ) {
        return {
          valid: false,
          reason: "bounded_defensible_missing_fare_basis",
        };
      }
      if (
        fact.coverage !== "all_required_access" &&
        fact.coverage !== "segment_only"
      ) {
        return {
          valid: false,
          reason: "bounded_defensible_missing_coverage",
        };
      }
      if (!isFiniteNumber(fact.distanceKm) || fact.distanceKm < 0) {
        return { valid: false, reason: "bounded_defensible_invalid_distance" };
      }
      if (!isNonEmptyUrlList(fact.sourceUrls)) {
        return { valid: false, reason: "bounded_defensible_missing_urls" };
      }
      return { valid: true };
    }
    case "verified_walking": {
      // ¥0 ONLY with explicit walking evidence; no manufactured fare.
      if (!fact.walkingEvidence || fact.walkingEvidence.length === 0) {
        return { valid: false, reason: "walking_missing_evidence" };
      }
      return { valid: true };
    }
    case "not_applicable": {
      if (!fact.reason || fact.reason.length === 0) {
        return { valid: false, reason: "not_applicable_missing_reason" };
      }
      return { valid: true };
    }
    case "unavailable": {
      if (!fact.reason || fact.reason.length === 0) {
        return { valid: false, reason: "unavailable_missing_reason" };
      }
      return { valid: true };
    }
    default:
      return { valid: false, reason: "unknown_kind" };
  }
}
