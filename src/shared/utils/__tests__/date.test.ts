import { describe, expect, it } from "vitest";
import { formatTripDateRange } from "../date";

describe("formatTripDateRange", () => {
  it("formats a canonical single-day trip in English", () => {
    expect(formatTripDateRange("2026-08-08", undefined, "en")).toBe(
      "Aug 8, 2026",
    );
  });

  it("formats a canonical range without repeating the month and year", () => {
    expect(formatTripDateRange("2026-09-19", "2026-09-20", "en")).toBe(
      "Sep 19–20, 2026",
    );
  });

  it("formats canonical dates in Japanese", () => {
    expect(formatTripDateRange("2026-09-19", "2026-09-20", "ja")).toBe(
      "2026年9月19日〜20日",
    );
  });
});
