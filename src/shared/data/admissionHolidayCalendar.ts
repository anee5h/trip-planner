const COVERAGE_START = "2026-01-01";
const COVERAGE_END = "2027-12-31";

const JAPAN_NATIONAL_HOLIDAY_DATES = new Set([
  "2026-01-01",
  "2026-01-12",
  "2026-02-11",
  "2026-02-23",
  "2026-03-20",
  "2026-04-29",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-07-20",
  "2026-08-11",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-10-12",
  "2026-11-03",
  "2026-11-23",
  "2027-01-01",
  "2027-01-11",
  "2027-02-11",
  "2027-02-23",
  "2027-03-21",
  "2027-03-22",
  "2027-04-29",
  "2027-05-03",
  "2027-05-04",
  "2027-05-05",
  "2027-07-19",
  "2027-08-11",
  "2027-09-20",
  "2027-09-23",
  "2027-10-11",
  "2027-11-03",
  "2027-11-23",
]);

export type JapanHolidayStatus = "holiday" | "not_holiday" | "unknown";

/** Admission-only holiday tier support; dates outside the extract stay unknown. */
export function getJapanHolidayStatus(date: string): JapanHolidayStatus {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "unknown";
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date < COVERAGE_START ||
    date > COVERAGE_END
  ) {
    return "unknown";
  }
  return JAPAN_NATIONAL_HOLIDAY_DATES.has(date) ? "holiday" : "not_holiday";
}
