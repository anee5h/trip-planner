/**
 * KAI-214 — budget-state taxonomy: semantic normalization layer.
 *
 * Separates the overloaded `budgetMetadata.method` single axis into the
 * permanent multi-axis contract:
 *
 *   VALUE STATE   (what the budget IS:  paid / free / estimate / variable /
 *                 not-applicable / unavailable / legacy-unverified)
 *   PROVENANCE   (where it came from:  verified-source / model / legacy /
 *                 transitional / none)
 *   REASON CODE  (stable machine-readable reason for non-numeric states)
 *
 * `method` remains the backward-compatible single-axis marker. When the new
 * explicit fields (`state`/`provenance`/`reasonCode`) are ABSENT, the
 * normalizer derives them deterministically from `method` + numeric fields.
 * New production data must author `state` explicitly; CI forbids new
 * records that rely on the transitional normalization path.
 *
 * Pure, deterministic, O(1) per destination — safe for render-time use.
 */

import type {
  BudgetProvenance,
  BudgetReasonCode,
  BudgetValueState,
  Destination,
  NormalizedBudgetState,
} from "@/shared/types/destination";
import { hasTrustedBudgetProvenance } from "./BudgetService";

const isFiniteNonNegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const hasNumericRange = (d: Destination): boolean =>
  isFiniteNonNegative(d.budgetMin) &&
  isFiniteNonNegative(d.budgetMax) &&
  d.budgetMin <= d.budgetMax;

const hasBreakdown = (d: Destination): boolean =>
  Boolean(
    d.budgetBreakdown &&
    [
      d.budgetBreakdown.transport,
      d.budgetBreakdown.tickets,
      d.budgetBreakdown.food,
      d.budgetBreakdown.cafe,
    ].every(isFiniteNonNegative),
  );

/**
 * Deterministic mapping from the legacy `method` + numeric fields to the
 * permanent VALUE STATE. Used only when `budgetMetadata.state` is absent
 * (backward-compatible transitional path — KAI-214).
 *
 * Manual records with a breakdown/range are source-backed (verified paid or
 * verified free depends on ticket evidence — resolved in getReasonForManual).
 * Model records are documented estimates. Legacy records are legacy
 * unverified. Unknown records are unavailable (transitional reason).
 * Absent metadata with numbers is a transitional unavailable state; absent
 * without numbers is unavailable.
 */
function deriveStateFromMethod(
  d: Destination,
  method: "model" | "manual" | "unknown" | "legacy" | "absent",
): BudgetValueState {
  switch (method) {
    case "manual": {
      if (!hasNumericRange(d) && !hasBreakdown(d)) return "unavailable";
      // Manual records with tickets=0 and explicit free evidence in the
      // basis are VERIFIED FREE (never inferred — evidence required).
      const tickets = d.budgetBreakdown?.tickets ?? d.budgetMin ?? 1;
      const basis = d.budgetMetadata?.basis ?? "";
      if (tickets === 0 && /free|無料|¥0|jpy.?0/i.test(basis)) {
        return "verified_free";
      }
      return "verified_paid";
    }
    case "model":
      return "documented_estimate";
    case "legacy":
      return "legacy_unverified";
    case "unknown":
      return "unavailable";
    case "absent":
      return "unavailable";
  }
}

function deriveProvenance(
  method: "model" | "manual" | "unknown" | "legacy" | "absent",
): BudgetProvenance {
  switch (method) {
    case "manual":
      return "verified_source";
    case "model":
      return "model";
    case "legacy":
      return "legacy";
    case "unknown":
    case "absent":
      return "none";
  }
}

/**
 * Stable reason code derivation for the transitional mapping. This is a
 * conservative, evidence-based projection — it never fabricates a more
 * specific classification than the data supports. KAI-218 performs the real
 * variable/not-applicable classification.
 */
function deriveReasonCode(
  d: Destination,
  method: "model" | "manual" | "unknown" | "legacy" | "absent",
  state: BudgetValueState,
): BudgetReasonCode | undefined {
  switch (state) {
    case "legacy_unverified":
      return "legacy_provenance_unrecovered";
    case "unavailable": {
      if (method === "unknown") {
        const basis = d.budgetMetadata?.basis ?? "";
        if (/volatile|destination-dependent|origin-dependent/i.test(basis)) {
          return "price_variable_by_date";
        }
        return "source_missing";
      }
      if (method === "absent") return "source_missing";
      if (method === "manual") return "source_missing";
      return "source_missing";
    }
    case "verified_paid":
    case "verified_free":
    case "documented_estimate":
    case "variable_price":
    case "not_applicable":
      return undefined;
  }
}

/**
 * The single entry point for normalized budget state. O(1), pure,
 * deterministic. Prefers explicit `budgetMetadata.state` when authored;
 * falls back to the deterministic transitional mapping.
 */
export function normalizeBudgetState(d: Destination): NormalizedBudgetState {
  const bm = d.budgetMetadata;
  const method = bm?.method ?? "absent";

  // Forward path: explicit multi-axis state authored on the record.
  if (bm?.state) {
    return {
      state: bm.state,
      provenance: bm.provenance ?? deriveProvenance(method),
      reasonCode: bm.reasonCode,
      trustLevel:
        bm.state === "documented_estimate"
          ? "trusted_estimate"
          : bm.state === "verified_paid" || bm.state === "verified_free"
            ? "trusted"
            : "untrusted",
      hasNumericRange: hasNumericRange(d),
      hasBreakdown: hasBreakdown(d),
      sourceMethod: method,
    };
  }

  // Transitional path: derive from method + fields.
  const state = deriveStateFromMethod(d, method);
  return {
    state,
    provenance: deriveProvenance(method),
    reasonCode: deriveReasonCode(d, method, state),
    trustLevel: hasTrustedBudgetProvenance(d)
      ? state === "documented_estimate"
        ? "trusted_estimate"
        : "trusted"
      : "untrusted",
    hasNumericRange: hasNumericRange(d),
    hasBreakdown: hasBreakdown(d),
    sourceMethod: method,
  };
}

// ---- Semantic helpers (centralized contract) ----

/** A verified free destination: explicit evidence, never inferred. */
export function isVerifiedFree(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return (
    s.state === "verified_free" ||
    (s.sourceMethod === "manual" &&
      s.trustLevel === "trusted" &&
      (d.budgetBreakdown?.tickets ?? d.budgetMin ?? 1) === 0 &&
      d.budgetMetadata?.basis !== undefined)
  );
}

/** The value state is a documented model estimate. */
export function isDocumentedEstimate(d: Destination): boolean {
  return normalizeBudgetState(d).state === "documented_estimate";
}

/** Price varies materially (date/product/package/season). Distinct from unknown. */
export function isBudgetVariable(d: Destination): boolean {
  return normalizeBudgetState(d).state === "variable_price";
}

/** A single on-site price is not conceptually applicable. */
export function isBudgetNotApplicable(d: Destination): boolean {
  return normalizeBudgetState(d).state === "not_applicable";
}

/** The budget could exist but evidence is missing (with a reason). */
export function isBudgetUnavailable(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return s.state === "unavailable";
}

/** The budget has a displayable numeric value (trusted OR untrusted storage). */
export function hasDisplayableBudget(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return s.hasNumericRange || s.hasBreakdown;
}

/**
 * The budget is sortable: a trusted numeric value (verified or model).
 * Untrusted legacy/unknown/absent values are never sortable.
 */
export function hasSortableBudget(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return s.trustLevel !== "untrusted" && (s.hasNumericRange || s.hasBreakdown);
}

/** Trusted numeric budget (verified source or documented model estimate). */
export function hasTrustedNumericBudget(d: Destination): boolean {
  return (
    hasTrustedBudgetProvenance(d) && (hasNumericRange(d) || hasBreakdown(d))
  );
}
