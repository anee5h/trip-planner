import {
  JAPAN_HOLIDAY_COVERAGE,
  JAPAN_NATIONAL_HOLIDAYS,
} from "./japanHolidays";

const JAPAN_NATIONAL_HOLIDAY_DATES = new Set(
  JAPAN_NATIONAL_HOLIDAYS.map(({ date }) => date),
);

export type JapanHolidayStatus = "holiday" | "not_holiday" | "unknown";

/** Admission-only holiday tier support; dates outside the extract stay unknown. */
export function getJapanHolidayStatus(date: string): JapanHolidayStatus {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "unknown";
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date < JAPAN_HOLIDAY_COVERAGE.start ||
    date > JAPAN_HOLIDAY_COVERAGE.end
  ) {
    return "unknown";
  }
  return JAPAN_NATIONAL_HOLIDAY_DATES.has(date) ? "holiday" : "not_holiday";
}
