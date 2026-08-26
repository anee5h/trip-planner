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
 * normalizer derives them deterministically from `method` + numeric fields
 * (the TRANSITIONAL path — existing catalogue debt, baselined in CI).
 *
 * FAIL-CLOSED CONTRACT (KAI-214 blockers):
 *   - Explicit-state records NEVER reconstruct missing provenance from the
 *     legacy method. provenance = bm.provenance ?? "none".
 *   - Trust is derived ONLY from a VALID state/provenance pair. Malformed
 *     explicit combinations are UNTRUSTED at runtime even though CI also
 *     reports them.
 *   - isVerifiedFree requires normalized state verified_free + verified
 *     source provenance + explicit free evidence (shared rule).
 *   - hasDisplayableBudget means "may be presented as a user-facing
 *     price/estimate" (trusted or trusted-estimate ONLY). Storage presence
 *     is a separate concept: hasStoredNumericBudget.
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
 * Shared verified-free evidence rule (single source of truth).
 * Free is NEVER inferred from a zero numeric value, missing admission,
 * tags, kind, or absent data — it requires EXPLICIT free evidence in the
 * basis. EN ("free", "no admission", "no entry fee") and JA (無料, 入場無料,
 * 無料開放) evidence both qualify.
 */
export function hasVerifiedFreeEvidence(
  basis: string | undefined,
  tickets: number | undefined,
): boolean {
  if (tickets !== undefined && tickets > 0) return false;
  if (!basis) return false;
  // Negative evidence ("not free", "no longer free", "free but admission
  // applies" edge cases) must NOT qualify. Check negation FIRST.
  if (
    /\bnot free\b|not.*free|no longer free|charges apply|admission applies|tickets required|fee applies/i.test(
      basis,
    )
  ) {
    return false;
  }
  return /free|no admission|no entry fee|無料|入場無料|無料開放/i.test(basis);
}

/**
 * Deterministic mapping from the legacy `method` + numeric fields to the
 * permanent VALUE STATE. Used only when `budgetMetadata.state` is absent
 * (backward-compatible transitional path — KAI-214).
 */
function deriveStateFromMethod(
  d: Destination,
  method: "model" | "manual" | "unknown" | "legacy" | "absent",
): BudgetValueState {
  switch (method) {
    case "manual": {
      if (!hasNumericRange(d) && !hasBreakdown(d)) return "unavailable";
      const tickets = d.budgetBreakdown?.tickets;
      if (
        (tickets ?? 0) === 0 &&
        hasVerifiedFreeEvidence(d.budgetMetadata?.basis, tickets)
      ) {
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
 * Stable reason code derivation for the transitional mapping. CONSERVATIVE:
 * it never manufactures specificity. "volatile/destination-dependent/
 * origin-dependent" basis text does NOT establish date-variable pricing —
 * KAI-218 owns real evidence-based variable/not-applicable classification.
 * Until then those map to transitional_unclassified (or source_missing when
 * genuinely no signal exists).
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
          // Conservative: the basis signals instability but does not
          // establish DATE/SEASON variation specifically.
          return "transitional_unclassified";
        }
        return "source_missing";
      }
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

/** Trust derived from a VALID state/provenance pair (fail-closed). */
function trustForStateProvenance(
  state: BudgetValueState,
  provenance: BudgetProvenance,
  freeEvidence: boolean,
): NormalizedBudgetState["trustLevel"] {
  switch (state) {
    case "verified_paid":
      return provenance === "verified_source" ? "trusted" : "untrusted";
    case "verified_free":
      // verified_free requires verified source provenance AND explicit
      // free evidence. Missing either → untrusted.
      return provenance === "verified_source" && freeEvidence
        ? "trusted"
        : "untrusted";
    case "documented_estimate":
      return provenance === "model" ? "trusted_estimate" : "untrusted";
    case "variable_price":
    case "not_applicable":
    case "unavailable":
    case "legacy_unverified":
      return "untrusted";
  }
}

/**
 * The single entry point for normalized budget state. O(1), pure,
 * deterministic. Prefers explicit `budgetMetadata.state` when authored
 * (fail-closed on malformed combinations); falls back to the deterministic
 * transitional mapping for existing method-only records.
 */
export function normalizeBudgetState(d: Destination): NormalizedBudgetState {
  const bm = d.budgetMetadata;
  const method = bm?.method ?? "absent";
  const tickets = d.budgetBreakdown?.tickets;

  // Forward path: explicit multi-axis state authored on the record.
  if (bm?.state) {
    // FAIL CLOSED: never reconstruct missing provenance from legacy method.
    const provenance = bm.provenance ?? "none";
    const freeEvidence =
      bm.state === "verified_free"
        ? hasVerifiedFreeEvidence(bm.basis, tickets)
        : false;
    return {
      state: bm.state,
      provenance,
      reasonCode: bm.reasonCode,
      trustLevel: trustForStateProvenance(bm.state, provenance, freeEvidence),
      hasNumericRange: hasNumericRange(d),
      hasBreakdown: hasBreakdown(d),
      sourceMethod: method,
    };
  }

  // Transitional path: derive from method + fields (existing debt).
  const state = deriveStateFromMethod(d, method);
  const provenance = deriveProvenance(method);
  const freeEvidence =
    state === "verified_free"
      ? hasVerifiedFreeEvidence(bm?.basis, tickets)
      : false;
  return {
    state,
    provenance,
    reasonCode: deriveReasonCode(d, method, state),
    trustLevel: trustForStateProvenance(state, provenance, freeEvidence),
    hasNumericRange: hasNumericRange(d),
    hasBreakdown: hasBreakdown(d),
    sourceMethod: method,
  };
}

// ---- Semantic helpers (centralized contract) ----

/**
 * A verified free destination: normalized state verified_free AND verified
 * source provenance AND explicit free evidence. No weaker fallback — a
 * manual zero-ticket record with any non-free basis text is NOT free.
 */
export function isVerifiedFree(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return (
    s.state === "verified_free" &&
    s.provenance === "verified_source" &&
    s.trustLevel === "trusted"
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
  return normalizeBudgetState(d).state === "unavailable";
}

/**
 * Numbers exist PHYSICALLY in the record (storage semantics). This is for
 * audit/migration/debugging only — it says NOTHING about trust or display.
 */
export function hasStoredNumericBudget(d: Destination): boolean {
  return hasNumericRange(d) || hasBreakdown(d);
}

/**
 * The budget MAY be presented as a user-facing price/estimate. Requires a
 * TRUSTED or TRUSTED_ESTIMATE semantic state — legacy/unknown/absent
 * numeric storage is NEVER displayable (KAI-204 storage-vs-trust split).
 */
export function hasDisplayableBudget(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return s.trustLevel !== "untrusted" && (s.hasNumericRange || s.hasBreakdown);
}

/**
 * The budget is sortable: a trusted numeric value (verified or model).
 * Untrusted legacy/unknown/absent values are never sortable.
 */
export function hasSortableBudget(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return s.trustLevel !== "untrusted" && (s.hasNumericRange || s.hasBreakdown);
}

/**
 * Trusted numeric budget (verified source or documented model estimate).
 * Backed by the NORMALIZED semantic state (not the legacy method) so it can
 * never disagree with hasSortableBudget/hasDisplayableBudget.
 */
export function hasTrustedNumericBudget(d: Destination): boolean {
  const s = normalizeBudgetState(d);
  return s.trustLevel !== "untrusted" && (s.hasNumericRange || s.hasBreakdown);
}
