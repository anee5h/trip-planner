import { describe, expect, it } from "vitest";
import {
  CURATED_PEAK_PERIODS,
  JAPAN_HOLIDAY_DATA_VERSION,
  getBusyPeriodCues,
} from "../busyPeriodCues";

describe("getBusyPeriodCues", () => {
  it("returns an explainable Japanese national-holiday cue", () => {
    const [cue] = getBusyPeriodCues("any-destination", "2026-05-03");

    expect(cue).toMatchObject({
      kind: "nationalHoliday",
      dateRange: ["2026-05-03", "2026-05-03"],
      source: expect.stringContaining("Cabinet Office"),
      reviewedAt: "2026-08-01",
    });
    expect(cue.evidence).toContain(JAPAN_HOLIDAY_DATA_VERSION);
    expect(cue.reason.en).toBe("Constitution Memorial Day");
    expect(cue.reason.ja).toBe("憲法記念日");
  });

  it("returns a weekend cue using Japan time", () => {
    const cues = getBusyPeriodCues("any-destination", "2026-08-15");
    expect(cues).toContainEqual(
      expect.objectContaining({
        kind: "weekend",
        dateRange: ["2026-08-15", "2026-08-15"],
      }),
    );
  });

  it("returns the curated peak-season record with date and provenance", () => {
    const cue = getBusyPeriodCues("shinjuku-gyo-en", "2026-03-20").find(
      ({ kind }) => kind === "peakSeason",
    );
    const period = CURATED_PEAK_PERIODS[0];

    expect(cue).toMatchObject({
      kind: "peakSeason",
      dateRange: ["2026-03-15", "2026-04-15"],
      sourceUrl: period.sourceUrl,
      reviewedAt: period.reviewedAt,
      expiresAt: period.expiresAt,
    });
  });

  it("keeps unknown crowd state unknown", () => {
    expect(getBusyPeriodCues("unknown-destination", "2026-08-14")).toEqual([]);
  });

  it("handles the JST midnight boundary deterministically", () => {
    expect(
      getBusyPeriodCues("any-destination", "2026-08-14T14:59:59Z"),
    ).toEqual([]);
    expect(
      getBusyPeriodCues("any-destination", "2026-08-14T15:00:00Z").map(
        ({ kind }) => kind,
      ),
    ).toContain("weekend");
  });
});
