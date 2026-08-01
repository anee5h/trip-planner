import type { HomepageTripDuration } from "./PlannerBudgetPolicy";

export type ForecastDateSelection =
  { type: "today" } | { type: "tomorrow" } | { type: "custom"; date: string };

export interface DefaultDurationOptions {
  selection: ForecastDateSelection;
  currentTime?: Date;
  timeZone?: string;
}

export function getDefaultTripDuration({
  selection: _selection,
  currentTime: _currentTime = new Date(),
  timeZone: _timeZone = "Asia/Tokyo",
}: DefaultDurationOptions): HomepageTripDuration {
  return "halfDay";
}
