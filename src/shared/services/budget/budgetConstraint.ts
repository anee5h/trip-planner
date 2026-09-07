import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";
import type { TripBudget } from "@/shared/context/TripContext";

/**
 * KAI-279 canonical budget constraint.
 *
 * A traveller's budget is ALWAYS a whole-trip, whole-party yen constraint:
 *
 *   none     — Any budget / flexible: no affordability constraint at all.
 *   preset   — Economy / Standard / Comfortable: the canonical flat
 *              party-total ceilings (¥50k / ¥100k / ¥200k) that never scale
 *              with party size or trip duration.
 *   custom   — an exact user-entered party-total cap.
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

const PRESET_TIERS: readonly BudgetTier[] = [
  "economy",
  "standard",
  "comfortable",
];

/**
 * Normalize any TripBudget into the explicit constraint vocabulary. A cap
 * whose value equals its tier ceiling is a preset; any other finite cap is a
 * custom party-total cap; any/flexible/absent is no constraint.
 */
export function resolveBudgetConstraint(
  budget: TripBudget | undefined,
): ResolvedBudgetConstraint {
  if (!budget || budget.kind === "any") return { kind: "none" };
  const tier = budget.tier;
  if (tier === "luxury") return { kind: "none" };
  const cap = budget.cap;
  if (!Number.isFinite(cap)) return { kind: "none" };
  if (tier && (PRESET_TIERS as readonly string[]).includes(tier)) {
    if (cap === BUDGET_TIER_LIMITS[tier as BudgetTier]) {
      return { kind: "preset", preset: tier as BudgetTier, capYen: cap };
    }
    return { kind: "custom", capYen: cap };
  }
  return { kind: "custom", capYen: cap };
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
