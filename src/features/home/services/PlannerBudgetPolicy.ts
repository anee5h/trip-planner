import type { BudgetTier } from "@/shared/types/planner";
import {
  getTripDays,
  getTripNights,
  type HomepageTripDuration,
} from "@/shared/types/tripDuration";
import { ACCOMMODATION_PROFILES } from "@/shared/services/budget/tripEstimateEngine";

export type { HomepageTripDuration } from "@/shared/types/tripDuration";

export const PER_PERSON_DAILY_LIMITS = {
  economy: 10_000,
  standard: 20_000,
  comfortable: 35_000,
  luxury: 75_000,
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
export function getPlannerBudgetLimit(
  tier: BudgetTier,
  partySize: number,
  duration: HomepageTripDuration,
): number {
  const dailyLimit =
    PER_PERSON_DAILY_LIMITS[tier] ?? PER_PERSON_DAILY_LIMITS.standard;
  const days = getTripDays(duration);
  const nights = getTripNights(duration);
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
