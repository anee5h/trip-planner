import type {
  ForecastDateSelection,
  HomepageTripDuration,
} from "@/shared/types/homePlannerState";

export type { ForecastDateSelection } from "@/shared/types/homePlannerState";

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
