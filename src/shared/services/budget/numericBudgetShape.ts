/**
 * KAI-214 — shared valid numeric-budget shape predicate (single source of
 * truth for "does this record have a numeric budget the runtime can
 * actually consume").
 *
 * Used by BOTH layers so they cannot drift:
 *   - budgetState.ts  (hasStoredNumericBudget / hasNumericRange /
 *     hasBreakdown — the semantic runtime layer)
 *   - data-quality-rules.ts  (KAI214_NUMERIC_STATE_WITHOUT_NUMBERS CI
 *     invariant for verified_paid / documented_estimate)
 *
 * A VALID stored numeric budget is EITHER:
 *   A. a valid range: budgetMin and budgetMax both finite non-negative
 *      with budgetMin <= budgetMax; OR
 *   B. a valid complete breakdown: transport/tickets/food/cafe all finite
 *      non-negative.
 *
 * A LONE budgetMin / budgetRecommended / budgetMax / partial breakdown does
 * NOT satisfy the contract — presence is not shape.
 *
 * Dependency-neutral: pure functions on the Destination shape (relative
 * type import), importable from both src runtime code and scripts/ CI.
 */

import type { Destination } from "@/shared/types/destination";

/** A number that is finite and >= 0 (NaN/negative/Infinity are invalid). */
export function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** A valid ordered range: both bounds finite non-negative, min <= max. */
export function hasValidNumericRange(d: Destination): boolean {
  return (
    isFiniteNonNegative(d.budgetMin) &&
    isFiniteNonNegative(d.budgetMax) &&
    d.budgetMin <= d.budgetMax
  );
}

/** A valid complete breakdown: all four components finite non-negative. */
export function hasValidCompleteBreakdown(d: Destination): boolean {
  return Boolean(
    d.budgetBreakdown &&
    [
      d.budgetBreakdown.transport,
      d.budgetBreakdown.tickets,
      d.budgetBreakdown.food,
      d.budgetBreakdown.cafe,
    ].every(isFiniteNonNegative),
  );
}

/**
 * THE valid stored numeric-budget predicate: range OR complete breakdown.
 * This is the single contract for "runtime can consume this number".
 */
export function hasValidStoredNumericBudget(d: Destination): boolean {
  return hasValidNumericRange(d) || hasValidCompleteBreakdown(d);
}
