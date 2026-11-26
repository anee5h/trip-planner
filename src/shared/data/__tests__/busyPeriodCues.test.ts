import { describe, expect, it } from "vitest";
import { CURATED_PEAK_PERIODS, getBusyPeriodCues } from "../busyPeriodCues";
import { getJapanHolidayStatus } from "../admissionHolidayCalendar";

describe("getBusyPeriodCues", () => {
  it("returns an explainable Japanese national-holiday cue", () => {
    const [cue] = getBusyPeriodCues("any-destination", "2026-05-03");

    expect(JSON.stringify(cue)).toBe(
      JSON.stringify({
        id: "holiday-2026-05-03",
        kind: "nationalHoliday",
        dateRange: ["2026-05-03", "2026-05-03"],
        reason: {
          en: "Constitution Memorial Day",
          ja: "憲法記念日",
        },
        evidence: {
          en: "Constitution Memorial Day is listed in the cabinet-office-2027.1 local holiday extract.",
          ja: "憲法記念日は、日本の2026〜2027年版祝日データに記載されています。",
        },
        source: {
          en: "Japan Cabinet Office national-holiday calendar (2026–2027 extract)",
          ja: "日本の内閣府・国民の祝日カレンダー（2026〜2027年版）",
        },
        sourceUrl: "https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html",
        reviewedAt: "2026-08-01",
        expiresAt: "2027-12-31",
      }),
    );
  });

  it("does not add holiday cues outside the holiday extract", () => {
    expect(getBusyPeriodCues("any-destination", "2028-03-22")).toEqual([]);
  });

  it("returns a holiday cue for 2027 dates", () => {
    expect(
      getBusyPeriodCues("any-destination", "2027-01-11").map(
        ({ kind }) => kind,
      ),
    ).toContain("nationalHoliday");
  });

  it.each([2026, 2027])(
    "keeps admission and busy-period %i holidays aligned",
    (year) => {
      const cueDates = new Set<string>();
      const admissionDates = new Set<string>();
      const date = new Date(Date.UTC(year, 0, 1));
      while (date.getUTCFullYear() === year) {
        const isoDate = date.toISOString().slice(0, 10);
        if (
          getBusyPeriodCues("any-destination", isoDate).some(
            ({ kind }) => kind === "nationalHoliday",
          )
        ) {
          cueDates.add(isoDate);
        }
        if (getJapanHolidayStatus(isoDate) === "holiday") {
          admissionDates.add(isoDate);
        }
        date.setUTCDate(date.getUTCDate() + 1);
      }
      expect(admissionDates).toEqual(cueDates);
    },
  );

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
