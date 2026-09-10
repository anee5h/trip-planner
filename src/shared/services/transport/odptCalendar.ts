/**
 * KAI-290 — ODPT service-calendar resolution.
 *
 * ODPT `odpt:Calendar` is not a weekday/saturday/holiday enum. API v4.16
 * §2.3.1 documents real precedence rules, and they decide which timetable
 * applies to a travel date:
 *
 *   1. `Specific.*` calendars take precedence over base calendars.
 *   2. When the base classification holiday (Holiday) overlaps Saturday
 *      (Saturday), the holiday takes precedence.
 *   3. When more than one specific calendar is applicable, that date's
 *      timetable is a MERGE of those specific calendars.
 *
 * This module is pure: it never fetches anything. Callers pass the calendars
 * they obtained through the ODPT provider boundary.
 *
 * Conservative by design: when the evidence does not settle the question — for
 * example the date is a weekday but no Holiday calendar was supplied, so
 * "weekday excluding holidays" cannot be confirmed — the result is reported as
 * ambiguous with a reason rather than silently choosing a calendar.
 */

import type { OdptCalendar } from "./OdptProvider";

export type { OdptCalendar };

export type CalendarResolutionStatus = "resolved" | "none" | "ambiguous";

export type CalendarEffectiveSource = "specific" | "base" | "none";

/** Which documented rule produced the effective calendar set. */
export type CalendarRule =
  | "specific_overrides_base"
  | "holiday_over_saturday"
  | "base_classification"
  | "no_applicable_calendar"
  | "ambiguous";

export interface CalendarResolution {
  /** The date the resolution was computed for, `YYYY-MM-DD`. */
  readonly date: string;
  /** JavaScript `getDay()` convention: 0 = Sunday. */
  readonly weekday: number;
  readonly status: CalendarResolutionStatus;
  readonly effective: CalendarEffectiveSource;
  readonly rule: CalendarRule;
  /** Every calendar that applies, already precedence-filtered. */
  readonly applicable: readonly OdptCalendar[];
  /** Applicable `Specific.*` calendars (merge these timetables). */
  readonly specific: readonly OdptCalendar[];
  /** Applicable base calendars, highest precedence first. */
  readonly base: readonly OdptCalendar[];
  /** The single winning calendar when the evidence settles it. */
  readonly primary: OdptCalendar | null;
  /** Whether holiday evidence was available for this resolution. */
  readonly holidayEvidence: "present" | "absent" | "not-needed";
  /** Human-readable reasons, always populated for a non-resolved status. */
  readonly notes: readonly string[];
}

const WEEKDAY_NAMES = [
  "odpt.Calendar:Sunday",
  "odpt.Calendar:Monday",
  "odpt.Calendar:Tuesday",
  "odpt.Calendar:Wednesday",
  "odpt.Calendar:Thursday",
  "odpt.Calendar:Friday",
  "odpt.Calendar:Saturday",
];

export const ODPT_CALENDAR_WEEKDAY = "odpt.Calendar:Weekday";
export const ODPT_CALENDAR_HOLIDAY = "odpt.Calendar:Holiday";
export const ODPT_CALENDAR_SATURDAY_HOLIDAY = "odpt.Calendar:SaturdayHoliday";

/**
 * Base-calendar precedence, highest first. API v4.16 documents Holiday over
 * Saturday explicitly; `Holiday` also defines itself as including Sunday, so it
 * outranks the individual weekday calendars. `Weekday` is last because it is
 * defined by exclusion ("excluding holidays").
 */
const BASE_PRECEDENCE = [
  ODPT_CALENDAR_HOLIDAY,
  ODPT_CALENDAR_SATURDAY_HOLIDAY,
  "odpt.Calendar:Sunday",
  "odpt.Calendar:Saturday",
  "odpt.Calendar:Monday",
  "odpt.Calendar:Tuesday",
  "odpt.Calendar:Wednesday",
  "odpt.Calendar:Thursday",
  "odpt.Calendar:Friday",
  ODPT_CALENDAR_WEEKDAY,
];

function precedenceOf(sameAs: string): number {
  const index = BASE_PRECEDENCE.indexOf(sameAs);
  return index === -1 ? BASE_PRECEDENCE.length : index;
}

/** Parses `YYYY-MM-DD` (or an ISO date-time) into a UTC day key. */
export function calendarDateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : match[1];
}

function weekdayOf(dateKey: string): number | null {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).getUTCDay();
}

/** Parses the `start/end` ISO8601 period of `odpt:duration`. */
export function parseCalendarDuration(
  duration: string | null,
): { start: string; end: string } | null {
  if (typeof duration !== "string") return null;
  const [startRaw, endRaw] = duration.split("/");
  const start = calendarDateKey(startRaw ?? "");
  const end = calendarDateKey(endRaw ?? "");
  if (!start || !end) return null;
  return { start, end };
}

export interface ResolveCalendarOptions {
  /**
   * Treat a missing Holiday calendar as fatal to weekday resolution. Defaults
   * to true so consumers never silently assume "not a holiday".
   */
  readonly requireHolidayEvidence?: boolean;
}

/**
 * Resolves which ODPT calendars apply to a travel date.
 *
 * @param date travel date (`YYYY-MM-DD`, ISO date-time, or Date)
 * @param calendars calendars obtained via the ODPT provider boundary
 */
export function resolveApplicableCalendars(
  date: string | Date,
  calendars: readonly OdptCalendar[],
  options: ResolveCalendarOptions = {},
): CalendarResolution {
  const requireHolidayEvidence = options.requireHolidayEvidence !== false;
  const dateKey = calendarDateKey(date);
  if (dateKey === null) {
    return {
      date: typeof date === "string" ? date : "",
      weekday: -1,
      status: "ambiguous",
      effective: "none",
      rule: "ambiguous",
      applicable: [],
      specific: [],
      base: [],
      primary: null,
      holidayEvidence: "not-needed",
      notes: ["unparseable_date"],
    };
  }
  const weekday = weekdayOf(dateKey) ?? -1;
  const notes: string[] = [];

  // Holiday evidence: an explicit Holiday calendar listing this date, or the
  // date being a Sunday (the specification defines Holiday as including Sunday).
  const holidayCalendar = calendars.find(
    (calendar) => calendar.sameAs === ODPT_CALENDAR_HOLIDAY,
  );
  const holidayEvidencePresent = holidayCalendar !== undefined;
  const isSunday = weekday === 0;
  const isSaturday = weekday === 6;
  const isWeekdayDate = weekday >= 1 && weekday <= 5;
  const isHolidayDate =
    isSunday || (holidayCalendar?.day.includes(dateKey) ?? false);

  const specific: OdptCalendar[] = [];
  const base: OdptCalendar[] = [];
  const notesForSpecificWithoutEvidence: string[] = [];

  for (const calendar of calendars) {
    const durationRange = parseCalendarDuration(calendar.duration);
    if (durationRange !== null) {
      // `odpt:duration` is a validity period, so falling outside it is proof the
      // calendar does not apply. Being inside it is not proof that it does.
      if (dateKey < durationRange.start || dateKey > durationRange.end)
        continue;
    }

    if (calendar.isSpecific) {
      if (calendar.day.includes(dateKey)) {
        specific.push(calendar);
      } else if (calendar.day.length === 0) {
        notesForSpecificWithoutEvidence.push(calendar.sameAs);
      }
      continue;
    }

    switch (calendar.sameAs) {
      case ODPT_CALENDAR_HOLIDAY:
        if (isHolidayDate) base.push(calendar);
        break;
      case ODPT_CALENDAR_SATURDAY_HOLIDAY:
        if (isSaturday || isHolidayDate) base.push(calendar);
        break;
      case ODPT_CALENDAR_WEEKDAY:
        // "Weekdays (Monday to Friday, excluding holidays)" — the exclusion
        // cannot be evaluated without holiday evidence.
        if (isWeekdayDate && !isHolidayDate) base.push(calendar);
        break;
      default: {
        const index = WEEKDAY_NAMES.indexOf(calendar.sameAs);
        if (index !== -1 && index === weekday) base.push(calendar);
        else if (index === -1)
          notes.push(`unknown_calendar:${calendar.sameAs}`);
      }
    }
  }

  for (const sameAs of notesForSpecificWithoutEvidence) {
    notes.push(`specific_without_date_evidence:${sameAs}`);
  }

  if (specific.length > 0) {
    // Rule 1 + rule 3: specific calendars win outright, and multiple applicable
    // specifics are merged by the consumer.
    return {
      date: dateKey,
      weekday,
      status: "resolved",
      effective: "specific",
      rule: "specific_overrides_base",
      applicable: specific,
      specific,
      base: [],
      primary: specific.length === 1 ? specific[0] : null,
      holidayEvidence: holidayEvidencePresent
        ? "present"
        : isWeekdayDate
          ? "absent"
          : "not-needed",
      notes:
        specific.length > 1
          ? [...notes, "multiple_specific_calendars_merge"]
          : notes,
    };
  }

  // Without holiday evidence, "weekday excluding holidays" is unprovable, and a
  // Saturday could also be an off day. Do not choose silently.
  const holidayEvidence: CalendarResolution["holidayEvidence"] =
    holidayEvidencePresent
      ? "present"
      : isWeekdayDate || isSaturday
        ? "absent"
        : "not-needed";

  const needsHolidayEvidence =
    requireHolidayEvidence &&
    !holidayEvidencePresent &&
    (isWeekdayDate || isSaturday);

  if (needsHolidayEvidence) {
    return {
      date: dateKey,
      weekday,
      status: "ambiguous",
      effective: "none",
      rule: "ambiguous",
      applicable: [],
      specific: [],
      base: [],
      primary: null,
      holidayEvidence: "absent",
      notes: [...notes, "holiday_calendar_evidence_absent"],
    };
  }

  if (base.length === 0) {
    return {
      date: dateKey,
      weekday,
      status: "none",
      effective: "none",
      rule: "no_applicable_calendar",
      applicable: [],
      specific: [],
      base: [],
      primary: null,
      holidayEvidence,
      notes,
    };
  }

  // Rule 2: order by documented precedence so a consumer picking the first entry
  // gets Holiday over Saturday, without having to re-implement the rule.
  const orderedBase = [...base].sort(
    (a, b) => precedenceOf(a.sameAs) - precedenceOf(b.sameAs),
  );
  const holidayWon = base.some(
    (calendar) => calendar.sameAs === ODPT_CALENDAR_HOLIDAY,
  );

  return {
    date: dateKey,
    weekday,
    status: "resolved",
    effective: "base",
    rule: holidayWon ? "holiday_over_saturday" : "base_classification",
    applicable: orderedBase,
    specific: [],
    base: orderedBase,
    primary: orderedBase[0],
    holidayEvidence,
    notes: holidayWon ? [...notes, "holiday_precedence_applied"] : notes,
  };
}
