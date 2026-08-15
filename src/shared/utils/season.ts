export type Season = "spring" | "summer" | "autumn" | "winter";

export const JAPAN_TIME_ZONE = "Asia/Tokyo";

export interface JapanDateParts {
  year: number;
  month: number;
  day: number;
}

/** Returns the calendar date represented in Japan Standard Time. */
export function getJapanDateParts(
  value: Date | string = new Date(),
): JapanDateParts {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return { year, month, day };
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function getJapanDateIso(value: Date | string = new Date()): string {
  const { year, month, day } = getJapanDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getJapanWeekday(value: Date | string = new Date()): number {
  const { year, month, day } = getJapanDateParts(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Returns the current calendar season based on fixed month ranges.
 * This is deliberately independent of live weather — a cold, rainy July
 * afternoon is still calendar-summer.
 *
 * Spring:  Mar – May  (months 3–5)
 * Summer:  Jun – Aug  (months 6–8)
 * Autumn:  Sep – Nov  (months 9–11)
 * Winter:  Dec – Feb  (months 12, 1, 2)
 */
export function getFixedSeason(date: Date | string = new Date()): Season {
  const month = getJapanDateParts(date).month;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter"; // Dec (12), Jan (1), Feb (2)
}
