import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";
import {
  getTripDays,
  getTripNights,
  type TripDuration,
} from "@/shared/types/tripDuration";
import { ACCOMMODATION_PROFILES } from "@/shared/services/budget/tripEstimateEngine";

export type { HomepageTripDuration } from "@/shared/types/tripDuration";

export const PER_PERSON_DAILY_LIMITS = {
  economy: BUDGET_TIER_LIMITS.economy / 2,
  standard: BUDGET_TIER_LIMITS.standard / 2,
  comfortable: BUDGET_TIER_LIMITS.comfortable / 2,
  luxury: Number.POSITIVE_INFINITY,
} satisfies Record<BudgetTier, number>;

export const DURATION_BUDGET_MULTIPLIERS = {
  shortOuting: 0.5,
  halfDay: 0.75,
  fullDay: 1.0,
} as const satisfies Record<"shortOuting" | "halfDay" | "fullDay", number>;

/**
 * Planner budget is a party-total cap. The lodging part uses the same
 * Budget-v2 party-total-per-night profile as the estimate engine, so the
 * planner never invents a second hotel band or scales lodging by party size.
 */
export type BudgetPolicyDuration = TripDuration | "any";

export function getPlannerBudgetLimit(
  tier: BudgetTier,
  partySize: number,
  duration: BudgetPolicyDuration,
): number {
  if (tier === "luxury") return Number.POSITIVE_INFINITY;
  const dailyLimit =
    PER_PERSON_DAILY_LIMITS[tier] ?? PER_PERSON_DAILY_LIMITS.standard;
  const effectiveDuration = duration === "any" ? "fullDay" : duration;
  const days = getTripDays(effectiveDuration);
  const nights = getTripNights(effectiveDuration);
  const daySpend =
    nights > 0
      ? dailyLimit * partySize * days
      : dailyLimit *
        partySize *
        (DURATION_BUDGET_MULTIPLIERS[
          duration as keyof typeof DURATION_BUDGET_MULTIPLIERS
        ] ?? 1);
  const accommodation = ACCOMMODATION_PROFILES[tier][1] * nights;
  return Math.round(daySpend + accommodation);
}
