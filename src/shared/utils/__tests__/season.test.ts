import { describe, it, expect } from "vitest";
import {
  getFixedSeason,
  getJapanDateIso,
  getJapanWeekday,
  type Season,
} from "../season";

describe("getFixedSeason", () => {
  // Helper: build a Date for the 15th of a given 1-indexed month
  const d = (month: number) => new Date(2025, month - 1, 15);

  const cases: [number, string, Season][] = [
    // Winter boundary: Jan, Feb
    [1, "January", "winter"],
    [2, "February", "winter"],
    // Spring: Mar, Apr, May
    [3, "March", "spring"],
    [4, "April", "spring"],
    [5, "May", "spring"],
    // Summer: Jun, Jul, Aug
    [6, "June", "summer"],
    [7, "July", "summer"],
    [8, "August", "summer"],
    // Autumn: Sep, Oct, Nov
    [9, "September", "autumn"],
    [10, "October", "autumn"],
    [11, "November", "autumn"],
    // Winter boundary: Dec
    [12, "December", "winter"],
  ];

  it.each(cases)("month %i (%s) → %s", (month, _label, expected) => {
    expect(getFixedSeason(d(month))).toBe(expected);
  });

  it("defaults to current date when called with no arguments", () => {
    // Just verify it returns a valid season type without throwing
    const result = getFixedSeason();
    expect(["spring", "summer", "autumn", "winter"]).toContain(result);
  });

  it("uses the Japan calendar at UTC/JST month boundaries", () => {
    expect(getFixedSeason(new Date("2026-02-28T14:59:59Z"))).toBe("winter");
    expect(getFixedSeason(new Date("2026-02-28T15:00:00Z"))).toBe("spring");
    expect(getJapanDateIso(new Date("2026-12-31T15:00:00Z"))).toBe(
      "2027-01-01",
    );
    expect(getJapanWeekday("2026-08-15")).toBe(6);
  });
});
