import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import { BUDGET_TIER_LIMITS, type BudgetTier } from "@/shared/types/planner";

/**
 * PLN-001: budgetTier is the canonical planner state.
 * The numeric budget is always derived from the tier to prevent impossible
 * combinations (e.g., economy tier with a ¥75,000 budget).
 *
 * PLN-004: Default values are sourced from constants so that Home and the
 * Explorer reset to exactly the same state.
 */
export const DEFAULT_PLANNER_BUDGET_TIER: BudgetTier = "standard";

export function useTripPlannerState(user: User | null) {
  const [tripType, setTripType] = useState<string>("any");
  const [weather, setWeather] = useState<"any" | "rainy" | "hot" | "cold">(
    "any",
  );
  const [budgetTier, setBudgetTier] = useState<BudgetTier>(
    DEFAULT_PLANNER_BUDGET_TIER,
  );
  const [carMode, setCarMode] = useState<string>("none");
  const [publicModes, setPublicModes] = useState<string[]>([
    "train",
    "shinkansen",
    "bus",
    "flight",
  ]);
  const [partySize, setPartySize] = useState<number>(2);

  useEffect(() => {
    if (user?.user_metadata?.preferences) {
      setCarMode(user.user_metadata.preferences.carMode || "none");
      setPublicModes(
        user.user_metadata.preferences.publicModes || [
          "train",
          "shinkansen",
          "bus",
          "flight",
        ],
      );
      setPartySize(user.user_metadata.preferences.partySize || 2);
    }
  }, [user]);

  // PLN-001: numeric budget is always derived — no impossible combinations possible.
  const budget = BUDGET_TIER_LIMITS[budgetTier];

  return {
    tripType,
    setTripType,
    weather,
    setWeather,
    budget,
    budgetTier,
    setBudgetTier,
    carMode,
    setCarMode,
    publicModes,
    setPublicModes,
    partySize,
    setPartySize,
    tripDuration: "any" as TripDuration,
  };
}
