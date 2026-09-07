import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";
import type { TripBudget } from "@/shared/context/TripContext";
import type { TripEstimateResult } from "./tripEstimateEngine";
import { evaluateAffordability } from "./tripEstimateEngine";

/**
 * KAI-279 canonical budget constraint.
 *
 * A traveller's budget is ALWAYS a whole-trip, whole-party yen constraint:
 *
 *   none     — Any budget / flexible: no affordability constraint at all.
 *   preset   — Economy / Standard / Comfortable: the canonical flat
 *              party-total ceilings (¥50k / ¥100k / ¥200k) that never scale
 *              with party size or trip duration.
 *   custom   — an exact user-entered party-total cap. Custom is FIRST CLASS:
 *              the canonical TripBudget carries an explicit kind, so a Custom
 *              ¥100,000 is never reclassified as the Standard preset and a
 *              cap chosen after Flexible is never treated as no-constraint.
 *
 * capYen is the total spend ceiling for the whole selected party and trip.
 * It is never multiplied by partySize. The canonical TripEstimate scales
 * with party size; the user's cap does not.
 *
 * This module is the SINGLE owner of preset→cap resolution. Home, Explore,
 * Detail, Compare and the recommendation pipeline consume it; they never
 * duplicate the thresholds.
 */

export type BudgetConstraintKind = "none" | "preset" | "custom";

export interface ResolvedBudgetConstraint {
  readonly kind: BudgetConstraintKind;
  /** Present only for kind === "preset" (economy|standard|comfortable). */
  readonly preset?: BudgetTier;
  /** Present for preset and custom; undefined for none. */
  readonly capYen?: number;
}

export function presetCapYen(preset: BudgetTier): number {
  return BUDGET_TIER_LIMITS[preset];
}

/**
 * Normalize any canonical TripBudget into the explicit constraint vocabulary.
 * Source is explicit in the state — the resolver never re-infers custom from
 * numeric equality against a ceiling.
 */
export function resolveBudgetConstraint(
  budget: TripBudget | undefined,
): ResolvedBudgetConstraint {
  if (!budget || budget.kind === "none") return { kind: "none" };
  if (budget.kind === "preset") {
    return {
      kind: "preset",
      preset: budget.preset,
      capYen: BUDGET_TIER_LIMITS[budget.preset],
    };
  }
  if (!Number.isFinite(budget.cap) || budget.cap <= 0) return { kind: "none" };
  return { kind: "custom", capYen: budget.cap };
}

/**
 * Flat party-total cap in yen, or undefined when there is no constraint.
 * Deliberately does not accept partySize or duration: the cap never scales.
 */
export function budgetCapYen(
  budget: TripBudget | undefined,
): number | undefined {
  const resolved = resolveBudgetConstraint(budget);
  return resolved.capYen;
}

/** Stable identity for equality/context tests and "did the constraint change". */
export function budgetConstraintKey(budget: TripBudget | undefined): string {
  const resolved = resolveBudgetConstraint(budget);
  if (resolved.kind === "preset") return `preset:${resolved.preset}`;
  if (resolved.kind === "custom") return `custom:${resolved.capYen}`;
  return "none";
}

const YEN_FORMATTER = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

/** Grouped-yen display for cap labels, e.g. 80000 → "80,000". */
export function formatYenAmount(cap: number): string {
  return YEN_FORMATTER.format(cap);
}

/**
 * KAI-279 custom-cap input parsing (Phase 4 contract).
 * Empty input, malformed input, NaN/Infinity, zero and negatives are
 * INVALID and must never commit — an empty/unfinished custom input must
 * never become ¥0 or a hard-zero budget.
 */
export function parseCustomBudgetInput(
  text: string,
): { kind: "valid"; capYen: number } | { kind: "invalid" } {
  const trimmed = text.replace(/,/g, "").trim();
  if (trimmed === "") return { kind: "invalid" };
  if (!/^\d+$/.test(trimmed)) return { kind: "invalid" };
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return { kind: "invalid" };
  return { kind: "valid", capYen: parsed };
}

/** Traveller-facing budget-fit vocabulary for a complete/partial estimate. */
export type BudgetFitState = "within" | "may_exceed" | "above" | "uncertain";

/**
 * KAI-279 Blocker-2 fix: classify affordability from the estimate of ONE
 * mode — the mode the traveller is actually viewing/selected. This function
 * deliberately receives a single estimate: it never scans alternate modes, so
 * a selected mode with partial/unresolved required costs stays UNCERTAIN even
 * when another (unselected) mode would fit the cap (KAI-277 preserved).
 *
 *   complete total, max <= cap          -> within
 *   complete total, min <= cap < max    -> may_exceed
 *   complete total, min > cap           -> above
 *   no complete total (partial/unavail) -> uncertain (never a within claim)
 */
export function classifyBudgetFit(
  estimate: Pick<TripEstimateResult, "total"> | undefined | null,
  cap: number | undefined,
): BudgetFitState {
  if (cap === undefined || !Number.isFinite(cap)) return "uncertain";
  if (!estimate?.total) return "uncertain";
  const state = evaluateAffordability(estimate, cap);
  if (state === "fits") return "within";
  if (state === "may_exceed") return "may_exceed";
  if (state === "over") return "above";
  return "uncertain";
}
