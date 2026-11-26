/**
 * Single Japan national-holiday dataset (Cabinet Office):
 * https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
 * Dates outside the coverage window are unknown, not "not a holiday".
 */
export const JAPAN_HOLIDAY_COVERAGE = {
  start: "2026-01-01",
  end: "2027-12-31",
} as const;

export const JAPAN_HOLIDAY_DATA_VERSION = "cabinet-office-2027.1";

export interface JapanNationalHoliday {
  date: string;
  en: string;
  ja: string;
}

export const JAPAN_NATIONAL_HOLIDAYS: readonly JapanNationalHoliday[] = (
  [
    ["2026-01-01", "New Year's Day", "元日"],
    ["2026-01-12", "Coming of Age Day", "成人の日"],
    ["2026-02-11", "National Foundation Day", "建国記念の日"],
    ["2026-02-23", "Emperor's Birthday", "天皇誕生日"],
    ["2026-03-20", "Vernal Equinox Day", "春分の日"],
    ["2026-04-29", "Showa Day", "昭和の日"],
    ["2026-05-03", "Constitution Memorial Day", "憲法記念日"],
    ["2026-05-04", "Greenery Day", "みどりの日"],
    ["2026-05-05", "Children's Day", "こどもの日"],
    ["2026-05-06", "Holiday", "休日"],
    ["2026-07-20", "Marine Day", "海の日"],
    ["2026-08-11", "Mountain Day", "山の日"],
    ["2026-09-21", "Respect for the Aged Day", "敬老の日"],
    ["2026-09-22", "Holiday", "休日"],
    ["2026-09-23", "Autumnal Equinox Day", "秋分の日"],
    ["2026-10-12", "Sports Day", "スポーツの日"],
    ["2026-11-03", "Culture Day", "文化の日"],
    ["2026-11-23", "Labor Thanksgiving Day", "勤労感謝の日"],
    ["2027-01-01", "New Year's Day", "元日"],
    ["2027-01-11", "Coming of Age Day", "成人の日"],
    ["2027-02-11", "National Foundation Day", "建国記念の日"],
    ["2027-02-23", "Emperor's Birthday", "天皇誕生日"],
    ["2027-03-21", "Vernal Equinox Day", "春分の日"],
    ["2027-03-22", "Holiday", "休日"],
    ["2027-04-29", "Showa Day", "昭和の日"],
    ["2027-05-03", "Constitution Memorial Day", "憲法記念日"],
    ["2027-05-04", "Greenery Day", "みどりの日"],
    ["2027-05-05", "Children's Day", "こどもの日"],
    ["2027-07-19", "Marine Day", "海の日"],
    ["2027-08-11", "Mountain Day", "山の日"],
    ["2027-09-20", "Respect for the Aged Day", "敬老の日"],
    ["2027-09-23", "Autumnal Equinox Day", "秋分の日"],
    ["2027-10-11", "Sports Day", "スポーツの日"],
    ["2027-11-03", "Culture Day", "文化の日"],
    ["2027-11-23", "Labor Thanksgiving Day", "勤労感謝の日"],
  ] as const
).map(([date, en, ja]) => ({ date, en, ja }));
