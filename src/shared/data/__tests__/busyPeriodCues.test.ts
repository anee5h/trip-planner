import { describe, expect, it } from "vitest";
import {
  CURATED_PEAK_PERIODS,
  JAPAN_HOLIDAY_DATA_VERSION,
  getBusyPeriodCues,
  getJapanHolidayStatus,
} from "../busyPeriodCues";

// Exhaustive expected dates copied from the official Cabinet Office 2026–2027
// calendar (https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html); this catches
// omitted substitute and citizens' holidays too.
const CABINET_OFFICE_HOLIDAYS = new Set([
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
]);

describe("getBusyPeriodCues", () => {
  it("matches every day in the official 2026–2027 holiday calendar", () => {
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
