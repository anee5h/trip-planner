import { describe, expect, it } from "vitest";
import { resolveDateTabSelection } from "../useWeatherContext";
import type { WeatherTabContext } from "@/shared/services/weather/WeatherTabService";

function makeContext(): WeatherTabContext {
  const tabs = [
    { id: "today", label: "Today", dates: ["2026-08-12"] },
    { id: "tomorrow", label: "Tomorrow", dates: ["2026-08-13"] },
    {
      id: "this_weekend",
      label: "This Weekend",
      dates: ["2026-08-15", "2026-08-16"],
    },
  ];

  return {
    tabs,
    activeTabId: "today",
    activeTab: tabs[0],
    forecastMap: new Map(),
    availableDates: [],
    minDate: "2026-08-12",
    maxDate: "2026-08-21",
  };
}

describe("resolveDateTabSelection", () => {
  it("keeps Sat Aug 15, Sun Aug 16, and Mon Aug 17 as exact dates", () => {
    const context = makeContext();

    for (const date of ["2026-08-15", "2026-08-16", "2026-08-17"]) {
      const result = resolveDateTabSelection(context, date);

      expect(result.customDate).toBe(date);
      expect(result.activeTabId).toBe(`custom_${date}`);
      expect(result.tabs.at(-1)).toMatchObject({
        id: `custom_${date}`,
        dates: [date],
        isCustom: true,
      });
    }
  });

  it("preserves the Today and Tomorrow quick-date tabs", () => {
    const context = makeContext();

    expect(resolveDateTabSelection(context, "2026-08-12")).toMatchObject({
      activeTabId: "today",
      customDate: null,
    });
    expect(resolveDateTabSelection(context, "2026-08-13")).toMatchObject({
      activeTabId: "tomorrow",
      customDate: null,
    });
  });
});
