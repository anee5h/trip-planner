import { describe, expect, it } from "vitest";
import {
  getTabWeatherSummary,
  getNextCalendarDate,
  getForecastDaysForRange,
  type DayForecastData,
} from "./WeatherTabService";

describe("getTabWeatherSummary", () => {
  it("does not fabricate weather when forecast data is unavailable", () => {
    expect(
      getTabWeatherSummary(
        { id: "today", label: "Today", dates: ["2026-07-29"] },
        new Map(),
      ),
    ).toBeNull();
  });
});

describe("getNextCalendarDate", () => {
  it("advances a mid-month date", () => {
    expect(getNextCalendarDate("2026-07-15")).toBe("2026-07-16");
  });

  it("handles month-end rollover", () => {
    expect(getNextCalendarDate("2026-08-31")).toBe("2026-09-01");
  });

  it("handles year-end rollover", () => {
    expect(getNextCalendarDate("2026-12-31")).toBe("2027-01-01");
  });

  it("handles leap year: Feb 28 → Feb 29", () => {
    expect(getNextCalendarDate("2028-02-28")).toBe("2028-02-29");
  });

  it("handles leap year: Feb 29 → Mar 1", () => {
    expect(getNextCalendarDate("2028-02-29")).toBe("2028-03-01");
  });

  it("handles non-leap year Feb 28 → Mar 1", () => {
    expect(getNextCalendarDate("2027-02-28")).toBe("2027-03-01");
  });

  it("throws on malformed input", () => {
    expect(() => getNextCalendarDate("not-a-date")).toThrow();
    expect(() => getNextCalendarDate("2026-13-01")).toThrow();
  });
});

describe("getForecastDaysForRange", () => {
  function makeMap(entries: [string, number][]): Map<string, DayForecastData> {
    const m = new Map<string, DayForecastData>();
    for (const [date, temp] of entries) {
      m.set(date, {
        date,
        maxTemp: temp,
        minTemp: temp - 5,
        weatherCode: 0,
        desc: "Clear",
        icon: "sun",
      });
    }
    return m;
  }

  it("returns both days when both are present", () => {
    const map = makeMap([
      ["2026-08-08", 30],
      ["2026-08-09", 28],
    ]);
    const result = getForecastDaysForRange(map, "2026-08-08", 2);
    expect(result).toHaveLength(2);
    expect(result[0].maxTemp).toBe(30);
    expect(result[1].maxTemp).toBe(28);
  });

  it("skips missing second day", () => {
    const map = makeMap([["2026-08-08", 30]]);
    const result = getForecastDaysForRange(map, "2026-08-08", 2);
    expect(result).toHaveLength(1);
    expect(result[0].maxTemp).toBe(30);
  });

  it("returns only present days when start is missing but next day exists", () => {
    const map = makeMap([["2026-08-09", 28]]);
    const result = getForecastDaysForRange(map, "2026-08-08", 2);
    // Missing start skipped; second day found
    expect(result).toHaveLength(1);
    expect(result[0].maxTemp).toBe(28);
  });

  it("returns empty when no dates in range are present", () => {
    const map = makeMap([["2026-08-10", 28]]);
    const result = getForecastDaysForRange(map, "2026-08-08", 2);
    expect(result).toHaveLength(0);
  });

  it("respects dayCount 1", () => {
    const map = makeMap([
      ["2026-08-08", 30],
      ["2026-08-09", 28],
    ]);
    const result = getForecastDaysForRange(map, "2026-08-08", 1);
    expect(result).toHaveLength(1);
    expect(result[0].maxTemp).toBe(30);
  });
});
