import {
  getJapanDateIso,
  getJapanDateParts,
  getJapanWeekday,
} from "@/shared/utils/season";

export type BusyPeriodCueKind =
  "nationalHoliday" | "weekend" | "peakSeason" | "localEvent";

export interface LocalizedBusyPeriodText {
  en: string;
  ja: string;
}

export interface BusyPeriodCue {
  id: string;
  kind: BusyPeriodCueKind;
  dateRange: readonly [string, string];
  reason: LocalizedBusyPeriodText;
  evidence: LocalizedBusyPeriodText;
  source: LocalizedBusyPeriodText;
  sourceUrl?: string;
  reviewedAt: string;
  expiresAt: string;
}

interface NationalHoliday {
  date: string;
  name: LocalizedBusyPeriodText;
}

interface CuratedPeakPeriod {
  id: string;
  destinationIds: readonly string[];
  startMonthDay: string;
  endMonthDay: string;
  reason: LocalizedBusyPeriodText;
  evidence: LocalizedBusyPeriodText;
  source: LocalizedBusyPeriodText;
  sourceUrl: string;
  reviewedAt: string;
  expiresAt: string;
}

/** Cabinet Office national-holiday extract committed for the beta calendar. */
export const JAPAN_HOLIDAY_DATA_VERSION = "cabinet-office-2026.1";
const JAPAN_HOLIDAY_SOURCE: LocalizedBusyPeriodText = {
  en: "Japan Cabinet Office national-holiday calendar (2026 extract)",
  ja: "日本の内閣府・国民の祝日カレンダー（2026年版）",
};
const JAPAN_HOLIDAY_SOURCE_URL =
  "https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html";

const JAPAN_NATIONAL_HOLIDAYS: readonly NationalHoliday[] = [
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
].map(([date, en, ja]) => ({ date, name: { en, ja } }));

/** Small beta set; this is presentation evidence, never a score input. */
export const CURATED_PEAK_PERIODS: readonly CuratedPeakPeriod[] = [
  {
    id: "shinjuku-gyoen-cherry-blossom",
    destinationIds: ["shinjuku-gyo-en"],
    startMonthDay: "03-15",
    endMonthDay: "04-15",
    reason: {
      en: "Cherry blossom peak season",
      ja: "桜の見頃シーズン",
    },
    evidence: {
      en: "Official garden guidance identifies spring cherry blossoms as a peak visiting period.",
      ja: "庭園公式案内で、春の桜が見頃の時期として案内されています。",
    },
    source: {
      en: "Shinjuku Gyoen National Garden seasonal guidance",
      ja: "新宿御苑の季節案内",
    },
    sourceUrl: "https://www.env.go.jp/garden/shinjukugyoen/english/index.html",
    reviewedAt: "2026-08-01",
    expiresAt: "2027-04-30",
  },
];

function monthDayInRange(monthDay: string, start: string, end: string) {
  return start <= end
    ? monthDay >= start && monthDay <= end
    : monthDay >= start || monthDay <= end;
}

function nationalHolidayCue(holiday: NationalHoliday): BusyPeriodCue {
  return {
    id: `holiday-${holiday.date}`,
    kind: "nationalHoliday",
    dateRange: [holiday.date, holiday.date],
    reason: holiday.name,
    evidence: {
      en: `${holiday.name.en} is listed in the ${JAPAN_HOLIDAY_DATA_VERSION} local holiday extract.`,
      ja: `${holiday.name.ja}は、日本の2026年版祝日データに記載されています。`,
    },
    source: JAPAN_HOLIDAY_SOURCE,
    sourceUrl: JAPAN_HOLIDAY_SOURCE_URL,
    reviewedAt: "2026-08-01",
    expiresAt: "2026-12-31",
  };
}

export function getBusyPeriodCues(
  destinationId: string,
  referenceDate: Date | string = new Date(),
): BusyPeriodCue[] {
  const date = getJapanDateIso(referenceDate);
  const { year, month, day } = getJapanDateParts(referenceDate);
  const cues: BusyPeriodCue[] = [];
  const holiday = JAPAN_NATIONAL_HOLIDAYS.find((item) => item.date === date);
  if (holiday) cues.push(nationalHolidayCue(holiday));

  const monthDay = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  for (const period of CURATED_PEAK_PERIODS) {
    if (
      period.destinationIds.includes(destinationId) &&
      monthDayInRange(monthDay, period.startMonthDay, period.endMonthDay) &&
      date <= period.expiresAt
    ) {
      cues.push({
        id: period.id,
        kind: "peakSeason",
        dateRange: [
          `${year}-${period.startMonthDay}`,
          `${year}-${period.endMonthDay}`,
        ],
        reason: period.reason,
        evidence: period.evidence,
        source: period.source,
        sourceUrl: period.sourceUrl,
        reviewedAt: period.reviewedAt,
        expiresAt: period.expiresAt,
      });
    }
  }

  if (
    getJapanWeekday(referenceDate) === 0 ||
    getJapanWeekday(referenceDate) === 6
  ) {
    cues.push({
      id: `weekend-${date}`,
      kind: "weekend",
      dateRange: [date, date],
      reason: { en: "Weekend", ja: "週末" },
      evidence: {
        en: "The date falls on Saturday or Sunday in Japan Standard Time.",
        ja: "日本標準時で土曜日または日曜日にあたります。",
      },
      source: {
        en: "Japan Standard Time calendar",
        ja: "日本標準時カレンダー",
      },
      reviewedAt: "2026-08-01",
      expiresAt: "2099-12-31",
    });
  }

  return cues;
}

export function formatBusyPeriodDateRange(
  dateRange: readonly [string, string],
  locale: "en" | "ja",
): string {
  const format = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
      timeZone: "Asia/Tokyo",
      month: "short",
      day: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  };
  const start = format(dateRange[0]);
  const end = format(dateRange[1]);
  if (start === end) return start;
  return locale === "ja" ? `${start}〜${end}` : `${start} – ${end}`;
}
