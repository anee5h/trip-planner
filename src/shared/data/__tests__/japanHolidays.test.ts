import { describe, expect, it } from "vitest";
import {
  JAPAN_HOLIDAY_COVERAGE,
  JAPAN_NATIONAL_HOLIDAYS,
} from "../japanHolidays";

// Independent copy of the Cabinet Office dates so a wrong date in the dataset fails.
const EXPECTED_DATES = [
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
];

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

  it("matches the Cabinet Office dates exactly", () => {
    expect(dates).toEqual(EXPECTED_DATES);
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
