import type { AppLocale } from "@/shared/context/LocaleContext";
import type { TripMode } from "@/shared/services/recommendation/RecommendationContext";

/** Returns the next local calendar date after a YYYY-MM-DD value. */
export function getNextCalendarDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Invalid ISO date: ${isoDate}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  date.setDate(date.getDate() + 1);
  return formatDateISO(date);
}

/** Formats a Date in local time as YYYY-MM-DD. */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local-noon Date for a YYYY-MM-DD string, avoiding UTC drift. */
export function travelDateToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/** Compact localized date used by the real date picker. */
export function formatTravelDateShort(iso: string, locale: AppLocale): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (locale === "ja") return `${month}/${day}`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** Formats the compact visible date capsule shared by Home and the picker. */
export function formatCapsuleLabel(
  value: string | undefined,
  tripMode: TripMode,
  allowAnyDate: boolean | undefined,
  locale: "en" | "ja",
  todayIso: string,
  tomorrowIso: string,
  t: (key: any, options?: any) => any,
  hasExplicitSelection?: boolean,
): string {
  if (
    !hasExplicitSelection &&
    !allowAnyDate &&
    (!value || value === todayIso)
  ) {
    return t("datePicker.selectDate", { defaultValue: "Select date" });
  }

  if (!value) {
    if (allowAnyDate) {
      return t("datePicker.anyDate", { defaultValue: "Any date" });
    }
    return t("datePicker.selectDate", { defaultValue: "Select date" });
  }

  if (tripMode === "day_trip") {
    if (value === todayIso) {
      return t("datePicker.today", { defaultValue: "Today" });
    }
    if (value === tomorrowIso) {
      return t("datePicker.tomorrow", { defaultValue: "Tomorrow" });
    }
    return formatTravelDateShort(value, locale);
  }

  const day2Iso = getNextCalendarDate(value);
  if (value === todayIso && day2Iso === tomorrowIso) {
    return locale === "ja" ? "今日〜明日" : "Today – Tomorrow";
  }

  if (locale === "ja") {
    return `${formatTravelDateShort(value, "ja")}〜${formatTravelDateShort(day2Iso, "ja")}`;
  }

  const [y1, m1, d1] = value.split("-").map(Number);
  const [y2, m2, d2] = day2Iso.split("-").map(Number);
  if (y1 === y2 && m1 === m2) {
    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(new Date(y1, m1 - 1, 1));
    return `${monthName} ${d1}–${d2}`;
  }

  return `${formatTravelDateShort(value, "en")} – ${formatTravelDateShort(day2Iso, "en")}`;
}
