export type Vibe =
  "any" | "food" | "nature" | "history" | "art" | "sea" | "cool" | "themepark";

export type PartyProfile = "solo" | "couple" | "group";
export type BudgetTier = "economy" | "standard" | "comfortable" | "luxury";
export type PriceRange = readonly [min: number, max: number];

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
  economy: 20000,
  standard: 40000,
  comfortable: 75000,
  luxury: 150000,
};

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
