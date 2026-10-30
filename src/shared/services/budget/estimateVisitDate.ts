import { deriveTripDates } from "@/shared/services/recommendation/TravelConditions";
import type { TripDuration } from "@/shared/types/tripDuration";
import { isValidCheckedAtDate } from "./factValidation";

export function resolveEstimateVisitDate(
  travelDate: string | undefined,
  duration: TripDuration,
): string | undefined {
  if (!travelDate || !isValidCheckedAtDate(travelDate)) return undefined;
  try {
    return deriveTripDates(travelDate, duration).day1;
  } catch {
    return undefined;
  }
}
