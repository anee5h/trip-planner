import { describe, expect, it } from "vitest";
import { getTabWeatherSummary } from "./WeatherTabService";

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
