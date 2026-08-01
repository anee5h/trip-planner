import type { HomepageTripDuration } from "./PlannerBudgetPolicy";

export type ForecastDateSelection =
  { type: "today" } | { type: "tomorrow" } | { type: "custom"; date: string };

export interface DefaultDurationOptions {
  selection: ForecastDateSelection;
  currentTime?: Date;
  timeZone?: string;
}

export function getDefaultTripDuration({
  selection,
  currentTime = new Date(),
  timeZone = "Asia/Tokyo",
}: DefaultDurationOptions): HomepageTripDuration {
  if (selection.type !== "today") return "fullDay";

  const hourStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(currentTime);
  const hour = parseInt(hourStr, 10);

  if (hour < 12) return "fullDay";
  if (hour < 16) return "halfDay";
  return "shortOuting";
}
