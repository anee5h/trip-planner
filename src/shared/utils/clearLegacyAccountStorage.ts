const LEGACY_ACCOUNT_KEYS = [
  "trip-planner-favorites",
  "trip-planner-visited",
  "trip-planner-visited-prefs",
  "trip-planner-visited-dates",
  "trip-planner-home-station",
  "trip-planner-home-station-coords",
  "trip-planner-trips",
  "trip-planner-ratings",
] as const;

export function clearLegacyAccountStorage(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  for (const key of LEGACY_ACCOUNT_KEYS) {
    window.localStorage.removeItem(key);
  }
}
