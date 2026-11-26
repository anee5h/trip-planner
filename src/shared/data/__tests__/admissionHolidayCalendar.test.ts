import { describe, expect, it } from "vitest";
import { getJapanHolidayStatus } from "../admissionHolidayCalendar";
import { JAPAN_NATIONAL_HOLIDAYS } from "../japanHolidays";

const CABINET_OFFICE_HOLIDAYS = new Set(
  JAPAN_NATIONAL_HOLIDAYS.map(({ date }) => date),
);

describe("admission holiday calendar", () => {
  it("matches every day in the 2026–2027 admission holiday extract", () => {
    for (const year of [2026, 2027]) {
      const date = new Date(Date.UTC(year, 0, 1));
      while (date.getUTCFullYear() === year) {
        const isoDate = date.toISOString().slice(0, 10);
        expect(getJapanHolidayStatus(isoDate)).toBe(
          CABINET_OFFICE_HOLIDAYS.has(isoDate) ? "holiday" : "not_holiday",
        );
        date.setUTCDate(date.getUTCDate() + 1);
      }
    }
  });

  it("keeps dates outside the extract and invalid dates unknown", () => {
    expect(getJapanHolidayStatus("2028-01-03")).toBe("unknown");
    expect(getJapanHolidayStatus("2026-02-30")).toBe("unknown");
    expect(getJapanHolidayStatus("not-a-date")).toBe("unknown");
  });
});
