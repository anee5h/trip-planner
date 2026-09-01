export type Vibe =
  "any" | "food" | "nature" | "history" | "art" | "sea" | "cool" | "themepark";

export type PartyProfile = "solo" | "couple" | "group";
export type BudgetTier = "economy" | "standard" | "comfortable" | "luxury";
/** Explore budget filter: "any" = no restriction (a REAL tier never doubles
 * as the unselected state); a tier caps the party-aware, transport-inclusive
 * trip cost at BUDGET_TIER_LIMITS[tier]. The `luxury` compatibility value is
 * rendered as Flexible and is intentionally unconstrained. */
export type BudgetFilter = "any" | BudgetTier;
export type PriceRange = readonly [min: number, max: number];
export type CatchmentScope = "nearby" | "wider";

export const PARTY_SIZE: Record<PartyProfile, number> = {
  solo: 1,
  couple: 2,
  group: 4,
};

export function partyProfileForSize(partySize: number): PartyProfile {
  if (partySize <= 1) return "solo";
  if (partySize === 2) return "couple";
  return "group";
}

export const BUDGET_TIER_LIMITS: Record<BudgetTier, number> = {
  // Party-total ceilings for the baseline two-person full-day context. Home
  // scales these same ceilings by party size and trip duration.
  economy: 50000,
  standard: 100000,
  comfortable: 200_000,
  luxury: Number.POSITIVE_INFINITY,
};

/** `luxury` is the persisted compatibility value for the Flexible choice. */
export function isFlexibleBudgetTier(
  tier: BudgetTier | BudgetFilter | undefined,
): boolean {
  return tier === "luxury";
}

export function budgetTierForLimit(budget: number): BudgetTier {
  if (budget <= BUDGET_TIER_LIMITS.economy) return "economy";
  if (budget <= BUDGET_TIER_LIMITS.standard) return "standard";
  if (budget <= BUDGET_TIER_LIMITS.comfortable) return "comfortable";
  return "luxury";
}

export const MEAL_PRICE_RANGES = {
  economy: {
    breakfast: [500, 800],
    lunch: [800, 1300],
    dinner: [1000, 1800],
  },
  standard: {
    breakfast: [800, 1500],
    lunch: [1200, 2000],
    dinner: [2000, 4000],
  },
  comfortable: {
    breakfast: [1500, 2500],
    lunch: [2500, 5000],
    dinner: [5000, 12000],
  },
  luxury: {
    breakfast: [2500, 4500],
    lunch: [5000, 9000],
    dinner: [10000, 25000],
  },
} as const satisfies Record<
  BudgetTier,
  Record<"breakfast" | "lunch" | "dinner", PriceRange>
>;
