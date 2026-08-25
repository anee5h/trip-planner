import type { BudgetTier } from "@/shared/types/planner";
import type { CarMode } from "@/shared/utils/carMode";

export type TripDuration =
  "any" | "shortOuting" | "halfDay" | "fullDay" | "weekend";

export type HomepageTripDuration = Exclude<TripDuration, "any" | "weekend">;
export type TripMode = "day_trip" | "weekend_2d1n";

export type ForecastDateSelection =
  { type: "today" } | { type: "tomorrow" } | { type: "custom"; date: string };

export interface PlannerTransportSelection {
  /** Existing public sub-mode selection; never changed by car toggles. */
  publicModes: string[];
  /** High-level preference that gates the configured public mode set. */
  publicTransport: boolean;
  /** One car access strategy; personal and rental car remain exclusive. */
  carMode: CarMode;
}

export interface PlannerControlsState extends PlannerTransportSelection {
  vibe: string;
  tripDuration: HomepageTripDuration;
  partySize: number;
  budgetTier: BudgetTier;
  tripMode: TripMode;
  accommodationAllowance: number;
}

export const DEFAULT_PLANNER_BUDGET_TIER: BudgetTier = "standard";
export const DEFAULT_HOME_TRIP_DURATION: HomepageTripDuration = "halfDay";
export const DEFAULT_ACCOMMODATION_ALLOWANCE = 15_000;
export const MAX_ACCOMMODATION_ALLOWANCE = 500_000;

export const ACCOMMODATION_ALLOWANCE_PRESETS = {
  economy: 8_000,
  standard: DEFAULT_ACCOMMODATION_ALLOWANCE,
  comfortable: 25_000,
} as const;
export type AccommodationAllowancePreset =
  keyof typeof ACCOMMODATION_ALLOWANCE_PRESETS;

export function createDefaultPlannerControls(): PlannerControlsState {
  return {
    vibe: "any",
    tripDuration: DEFAULT_HOME_TRIP_DURATION,
    partySize: 2,
    budgetTier: DEFAULT_PLANNER_BUDGET_TIER,
    publicModes: [],
    publicTransport: true,
    carMode: "none",
    tripMode: "day_trip",
    accommodationAllowance: DEFAULT_ACCOMMODATION_ALLOWANCE,
  };
}

export function isValidAccommodationAllowance(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_ACCOMMODATION_ALLOWANCE
  );
}

/** Normalize a URL date without importing recommendation or transport code. */
export function normalizeTravelDateParam(
  value: string | null | undefined,
): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (value < todayIso) return undefined;
  return value;
}

export type { BudgetTier, CarMode };
