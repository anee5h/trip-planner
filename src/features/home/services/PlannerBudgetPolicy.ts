import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";

export type { HomepageTripDuration } from "@/shared/types/tripDuration";

/**
 * KAI-279: planner budget is a WHOLE-TRIP party-total cap. The tier ceilings
 * (economy ¥50,000 / standard ¥100,000 / comfortable ¥200,000) are flat and
 * never scale with party size or trip duration — the canonical TripEstimate
 * scales with party/duration and is assessed against the SAME cap. Overnight
 * accommodation is never added on top here: the estimate engine already
 * includes the canonical party-total-per-night accommodation profile exactly
 * once.
 *
 * The partySize/duration parameters are retained for call-site compatibility
 * but have no effect on the returned ceiling.
 */
export function getPlannerBudgetLimit(
  tier: BudgetTier,
  _partySize: number,
  _duration: unknown,
): number {
  return BUDGET_TIER_LIMITS[tier];
}
