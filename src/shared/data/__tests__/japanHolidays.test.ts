import { describe, expect, it } from "vitest";
import {
  JAPAN_HOLIDAY_COVERAGE,
  JAPAN_NATIONAL_HOLIDAYS,
} from "../japanHolidays";

describe("Japan national holidays", () => {
  const dates = JAPAN_NATIONAL_HOLIDAYS.map(({ date }) => date);

  it("has unique, sorted dates inside coverage", () => {
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual([...dates].sort());
    for (const date of dates) {
      expect(date >= JAPAN_HOLIDAY_COVERAGE.start).toBe(true);
      expect(date <= JAPAN_HOLIDAY_COVERAGE.end).toBe(true);
    }
  });

  it("has non-empty English and Japanese names", () => {
    for (const { en, ja } of JAPAN_NATIONAL_HOLIDAYS) {
      expect(en.trim()).not.toBe("");
      expect(ja.trim()).not.toBe("");
    }
  });

  it("has the expected count per year", () => {
    const count = (year: string) =>
      dates.filter((date) => date.startsWith(year)).length;
    expect(count("2026")).toBe(18);
    expect(count("2027")).toBe(17);
  });
});
