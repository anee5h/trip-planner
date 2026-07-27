export type Season = "spring" | "summer" | "autumn" | "winter";

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
export function getFixedSeason(date: Date = new Date()): Season {
  const month = date.getMonth() + 1; // getMonth() is 0-indexed; convert to 1–12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter"; // Dec (12), Jan (1), Feb (2)
}
