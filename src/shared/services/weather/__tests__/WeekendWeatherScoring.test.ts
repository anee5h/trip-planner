import { describe, expect, it } from "vitest";
import { evaluateWeekendWeather } from "../WeekendWeatherScoring";

describe("evaluateWeekendWeather", () => {
  it("two good days rank above one good + one severe", () => {
    const good = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "clear" },
      { condition: "cloudy" },
    ]);
    const oneBad = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "clear" },
      { condition: "stormy" },
    ]);
    expect(good.score).toBe(0);
    expect(good.summary).toBe("good");
    expect(oneBad.score).toBeLessThan(0);
    expect(oneBad.summary).toBe("poor");
    expect(good.score).toBeGreaterThan(oneBad.score);
  });

  it("outdoor destination (indoorPercent 0) receives a stronger penalty than mixed (50) / indoor (100) for the same stormy day", () => {
    const outdoor = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "stormy" },
    ]);
    const mixed = evaluateWeekendWeather({ indoorPercent: 50 }, [
      { condition: "stormy" },
    ]);
    const indoor = evaluateWeekendWeather({ indoorPercent: 100 }, [
      { condition: "stormy" },
    ]);
    // All should be negative, but outdoor is most negative (most penalized)
    expect(outdoor.score).toBeLessThan(0);
    expect(mixed.score).toBeLessThan(0);
    expect(indoor.score).toBeLessThan(0);
    expect(outdoor.score).toBeLessThan(mixed.score);
    expect(mixed.score).toBeLessThan(indoor.score);
  });

  it("rainy < stormy severity", () => {
    const rainy = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "rainy" },
    ]);
    const stormy = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "stormy" },
    ]);
    expect(rainy.score).toBeLessThan(0);
    expect(stormy.score).toBeLessThan(0);
    // stormy is more negative (worse) than rainy
    expect(stormy.score).toBeLessThan(rainy.score);
  });

  it("missing/unknown days are neutral", () => {
    // Unknown condition
    const unknown = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "unknown" },
    ]);
    expect(unknown.score).toBe(0);
    expect(unknown.summary).toBe("good");

    // Empty days → unknown summary
    const empty = evaluateWeekendWeather({ indoorPercent: 0 }, []);
    expect(empty.score).toBe(0);
    expect(empty.summary).toBe("unknown");
  });

  it("badDayIndices are correct", () => {
    // Day 2 (index 1) is stormy
    const result = evaluateWeekendWeather({ indoorPercent: 0 }, [
      { condition: "clear" },
      { condition: "stormy" },
    ]);
    expect(result.badDayIndices).toEqual([1]);
  });

  it("summary is mixed when indoor >= 70 with a bad day", () => {
    const result = evaluateWeekendWeather({ indoorPercent: 70 }, [
      { condition: "rainy" },
    ]);
    expect(result.summary).toBe("mixed");
    expect(result.badDayIndices).toEqual([0]);
  });

  it("summary is poor when indoor < 70 with a bad day", () => {
    const result = evaluateWeekendWeather({ indoorPercent: 69 }, [
      { condition: "rainy" },
    ]);
    expect(result.summary).toBe("poor");
    expect(result.badDayIndices).toEqual([0]);
  });
});
