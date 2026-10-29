import { describe, expect, it } from "vitest";
import {
  CURATED_PEAK_PERIODS,
  JAPAN_HOLIDAY_DATA_VERSION,
  getBusyPeriodCues,
  getJapanHolidayStatus,
} from "../busyPeriodCues";

describe("getBusyPeriodCues", () => {
  it("classifies holidays only inside the published calendar coverage", () => {
    expect(getJapanHolidayStatus("2026-11-23")).toBe("holiday");
    expect(getJapanHolidayStatus("2026-11-24")).toBe("not_holiday");
    expect(getJapanHolidayStatus("2027-01-01")).toBe("holiday");
    expect(getJapanHolidayStatus("2028-01-03")).toBe("unknown");
    expect(getJapanHolidayStatus("2026-02-30")).toBe("unknown");
  });

  it("returns an explainable Japanese national-holiday cue", () => {
    const [cue] = getBusyPeriodCues("any-destination", "2026-05-03");

    expect(cue).toMatchObject({
      kind: "nationalHoliday",
      dateRange: ["2026-05-03", "2026-05-03"],
      source: expect.objectContaining({
        en: expect.stringContaining("Cabinet Office"),
        ja: expect.stringContaining("内閣府"),
      }),
      reviewedAt: "2026-10-29",
    });
    expect(cue.evidence.en).toContain(JAPAN_HOLIDAY_DATA_VERSION);
    expect(cue.evidence.ja).toContain(JAPAN_HOLIDAY_DATA_VERSION);
    expect(cue.reason.en).toBe("Constitution Memorial Day");
    expect(cue.reason.ja).toBe("憲法記念日");

    const nextYearCue = getBusyPeriodCues("any-destination", "2027-03-22")[0];
    expect(nextYearCue).toMatchObject({
      kind: "nationalHoliday",
      reason: { ja: "休日" },
      expiresAt: "2027-12-31",
      reviewedAt: "2026-10-29",
    });
  });

  it("returns a weekend cue using Japan time", () => {
    const cues = getBusyPeriodCues("any-destination", "2026-08-15");
    const cue = cues.find(({ kind }) => kind === "weekend");
    expect(cue).toMatchObject({
      kind: "weekend",
      dateRange: ["2026-08-15", "2026-08-15"],
      evidence: {
        ja: expect.stringContaining("日本標準時"),
      },
      source: {
        ja: expect.stringContaining("カレンダー"),
      },
    });
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
    expect(cue?.evidence.ja).toContain("桜");
    expect(cue?.source.ja).toContain("新宿御苑");
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
