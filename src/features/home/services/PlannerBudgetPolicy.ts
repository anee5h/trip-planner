import type { BudgetTier } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";

export type HomepageTripDuration = Exclude<TripDuration, "any" | "weekend">;

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
} satisfies Record<HomepageTripDuration, number>;

export function getPlannerBudgetLimit(
  tier: BudgetTier,
  partySize: number,
  duration: HomepageTripDuration,
): number {
  const dailyLimit =
    PER_PERSON_DAILY_LIMITS[tier] ?? PER_PERSON_DAILY_LIMITS.standard;
  const durationMultiplier = DURATION_BUDGET_MULTIPLIERS[duration] ?? 1.0;
  return Math.round(dailyLimit * partySize * durationMultiplier);
}
