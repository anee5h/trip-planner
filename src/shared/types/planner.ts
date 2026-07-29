export type Vibe =
  "any" | "food" | "nature" | "history" | "art" | "sea" | "cool" | "themepark";

export type PartyProfile = "solo" | "couple" | "group";
export type DiningStyle = "budget" | "standard" | "premium";
export type PriceRange = readonly [min: number, max: number];

export const PARTY_SIZE: Record<PartyProfile, number> = {
  solo: 1,
  couple: 2,
  group: 4,
};

export const MEAL_PRICE_RANGES = {
  budget: {
    breakfast: [500, 800],
    lunch: [800, 1300],
    dinner: [1000, 1800],
  },
  standard: {
    breakfast: [800, 1500],
    lunch: [1200, 2000],
    dinner: [2000, 4000],
  },
  premium: {
    breakfast: [1500, 2500],
    lunch: [2500, 5000],
    dinner: [5000, 12000],
  },
} as const satisfies Record<
  DiningStyle,
  Record<"breakfast" | "lunch" | "dinner", PriceRange>
>;
