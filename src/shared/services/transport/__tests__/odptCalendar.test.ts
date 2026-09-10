import { describe, expect, it } from "vitest";
import type { OdptCalendar, OdptProvenance } from "../OdptProvider";
import {
  ODPT_CALENDAR_HOLIDAY,
  ODPT_CALENDAR_SATURDAY_HOLIDAY,
  ODPT_CALENDAR_WEEKDAY,
  calendarDateKey,
  parseCalendarDuration,
  resolveApplicableCalendars,
} from "../odptCalendar";

const PROVENANCE: OdptProvenance = {
  provider: "odpt",
  providerId: ODPT_CALENDAR_WEEKDAY,
  ucode: "urn:ucode:_00001C000000000000010000030FD801",
  generatedAt: "2026-09-01T00:00:00+09:00",
  issuedAt: null,
  validUntil: null,
  fetchedAt: "2026-09-10T00:00:00.000Z",
  sourceResource: "odpt:Calendar",
  sourceUrl: "https://api.odpt.org/api/v4/odpt:Calendar",
  coverage: "unknown",
};

function calendar(
  sameAs: string,
  overrides: Partial<OdptCalendar> = {},
): OdptCalendar {
  return {
    id: sameAs,
    sameAs,
    ucode: null,
    title: null,
    calendarTitle: null,
    day: [],
    duration: null,
    isSpecific: sameAs.startsWith("odpt.Calendar:Specific."),
    date: null,
    provenance: { ...PROVENANCE, providerId: sameAs },
    ...overrides,
  };
}

// 2026-09-14 is a Monday; 2026-09-12 a Saturday; 2026-09-13 a Sunday.
const MONDAY = "2026-09-14";
const TUESDAY = "2026-09-15";
const SATURDAY = "2026-09-12";
const SUNDAY = "2026-09-13";

/** A holiday calendar that marks one specific Monday as a holiday. */
const HOLIDAYS = calendar(ODPT_CALENDAR_HOLIDAY, {
  day: ["2026-09-21", "2026-09-22"],
});

const BASE_CALENDARS = [
  calendar(ODPT_CALENDAR_WEEKDAY),
  HOLIDAYS,
  calendar(ODPT_CALENDAR_SATURDAY_HOLIDAY),
  calendar("odpt.Calendar:Saturday"),
  calendar("odpt.Calendar:Sunday"),
];

describe("calendarDateKey", () => {
  it("normalizes a date, a date-time and a Date", () => {
    expect(calendarDateKey("2026-09-14")).toBe("2026-09-14");
    expect(calendarDateKey("2026-09-14T08:30:00+09:00")).toBe("2026-09-14");
    expect(calendarDateKey(new Date(Date.UTC(2026, 8, 14)))).toBe("2026-09-14");
  });

  it("rejects an unparseable value", () => {
    expect(calendarDateKey("not-a-date")).toBeNull();
    expect(calendarDateKey("")).toBeNull();
  });
});

describe("parseCalendarDuration", () => {
  it("parses the odpt:duration ISO8601 period", () => {
    expect(parseCalendarDuration("2026-01-01/2026-12-31")).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("returns null for absent or malformed periods", () => {
    expect(parseCalendarDuration(null)).toBeNull();
    expect(parseCalendarDuration("2026-01-01")).toBeNull();
  });
});

describe("resolveApplicableCalendars — documented precedence (§2.3.1)", () => {
  it("resolves an ordinary weekday to the Weekday base calendar", () => {
    const result = resolveApplicableCalendars(MONDAY, BASE_CALENDARS);
    expect(result.status).toBe("resolved");
    expect(result.effective).toBe("base");
    expect(result.rule).toBe("base_classification");
    expect(result.applicable.map((entry) => entry.sameAs)).toEqual([
      ODPT_CALENDAR_WEEKDAY,
    ]);
    expect(result.primary?.sameAs).toBe(ODPT_CALENDAR_WEEKDAY);
    expect(result.holidayEvidence).toBe("present");
  });

  it("resolves a Tuesday to the Weekday base calendar", () => {
    const result = resolveApplicableCalendars(TUESDAY, BASE_CALENDARS);
    expect(result.status).toBe("resolved");
    expect(result.applicable.map((entry) => entry.sameAs)).toEqual([
      ODPT_CALENDAR_WEEKDAY,
    ]);
  });

  it("resolves a plain Saturday to Saturday/SaturdayHoliday, not Weekday", () => {
    const result = resolveApplicableCalendars(SATURDAY, BASE_CALENDARS);
    expect(result.status).toBe("resolved");
    expect(result.applicable.map((entry) => entry.sameAs)).toContain(
      "odpt.Calendar:Saturday",
    );
    expect(result.applicable.map((entry) => entry.sameAs)).not.toContain(
      ODPT_CALENDAR_WEEKDAY,
    );
  });

  it("resolves a Sunday to Holiday (which the spec defines as including Sunday)", () => {
    const result = resolveApplicableCalendars(SUNDAY, BASE_CALENDARS);
    expect(result.status).toBe("resolved");
    const identities = result.applicable.map((entry) => entry.sameAs);
    expect(identities).toContain(ODPT_CALENDAR_HOLIDAY);
    expect(identities).not.toContain(ODPT_CALENDAR_WEEKDAY);
  });

  it("resolves a listed holiday date to Holiday even on a weekday", () => {
    const result = resolveApplicableCalendars("2026-09-21", BASE_CALENDARS);
    expect(result.status).toBe("resolved");
    expect(result.applicable.map((entry) => entry.sameAs)).toContain(
      ODPT_CALENDAR_HOLIDAY,
    );
  });

  it("gives Holiday precedence over Saturday when both apply", () => {
    // The specification: "If the base className holiday (Holiday) overlaps with
    // Saturday (Saturday), the holiday takes precedence."
    const saturdayHoliday = calendar(ODPT_CALENDAR_HOLIDAY, {
      day: [SATURDAY],
    });
    const calendars = [
      calendar(ODPT_CALENDAR_WEEKDAY),
      saturdayHoliday,
      calendar(ODPT_CALENDAR_SATURDAY_HOLIDAY),
      calendar("odpt.Calendar:Saturday"),
    ];
    const result = resolveApplicableCalendars(SATURDAY, calendars);
    expect(result.status).toBe("resolved");
    expect(result.rule).toBe("holiday_over_saturday");
    // Holiday must be ordered first so a consumer taking the head gets Holiday.
    expect(result.primary?.sameAs).toBe(ODPT_CALENDAR_HOLIDAY);
    expect(result.applicable[0].sameAs).toBe(ODPT_CALENDAR_HOLIDAY);
    expect(result.applicable.map((entry) => entry.sameAs)).toContain(
      "odpt.Calendar:Saturday",
    );
    expect(result.notes).toContain("holiday_precedence_applied");
  });

  it("lets a Specific calendar override the base calendar", () => {
    const specific = calendar("odpt.Calendar:Specific.Toei.MarketHoliday", {
      day: [MONDAY],
    });
    const result = resolveApplicableCalendars(MONDAY, [
      ...BASE_CALENDARS,
      specific,
    ]);
    expect(result.status).toBe("resolved");
    expect(result.effective).toBe("specific");
    expect(result.rule).toBe("specific_overrides_base");
    expect(result.applicable.map((entry) => entry.sameAs)).toEqual([
      "odpt.Calendar:Specific.Toei.MarketHoliday",
    ]);
    // The base Weekday calendar must NOT leak into a specific-run day.
    expect(result.applicable.map((entry) => entry.sameAs)).not.toContain(
      ODPT_CALENDAR_WEEKDAY,
    );
    expect(result.base).toEqual([]);
  });

  it("merges multiple applicable Specific calendars", () => {
    const first = calendar("odpt.Calendar:Specific.Toei.MarketHoliday", {
      day: [MONDAY],
    });
    const second = calendar("odpt.Calendar:Specific.JR-East.Event", {
      day: [MONDAY],
    });
    const result = resolveApplicableCalendars(MONDAY, [
      ...BASE_CALENDARS,
      first,
      second,
    ]);
    expect(result.status).toBe("resolved");
    expect(result.effective).toBe("specific");
    expect(result.specific).toHaveLength(2);
    expect(result.primary).toBeNull();
    expect(result.notes).toContain("multiple_specific_calendars_merge");
    // Both must be returned so the caller can merge their timetables.
    expect(result.applicable.map((entry) => entry.sameAs).sort()).toEqual([
      "odpt.Calendar:Specific.JR-East.Event",
      "odpt.Calendar:Specific.Toei.MarketHoliday",
    ]);
  });

  it("reports no applicable calendar rather than inventing one", () => {
    const result = resolveApplicableCalendars(MONDAY, [
      calendar(ODPT_CALENDAR_HOLIDAY, { day: [] }),
      calendar("odpt.Calendar:Sunday"),
    ]);
    expect(result.status).toBe("none");
    expect(result.rule).toBe("no_applicable_calendar");
    expect(result.applicable).toEqual([]);
    expect(result.primary).toBeNull();
  });

  it("does not apply a Specific calendar whose day list excludes the date", () => {
    const specific = calendar("odpt.Calendar:Specific.Toei.MarketHoliday", {
      day: ["2026-09-16"],
    });
    const result = resolveApplicableCalendars(MONDAY, [
      ...BASE_CALENDARS,
      specific,
    ]);
    expect(result.effective).toBe("base");
    expect(result.applicable.map((entry) => entry.sameAs)).toEqual([
      ODPT_CALENDAR_WEEKDAY,
    ]);
  });
});

describe("resolveApplicableCalendars — no silent choice under ambiguity", () => {
  it("reports ambiguity when holiday evidence is absent for a weekday", () => {
    // Without a Holiday calendar, "Weekdays (Monday to Friday, excluding
    // holidays)" cannot be confirmed. Choosing Weekday would be a guess.
    const result = resolveApplicableCalendars(MONDAY, [
      calendar(ODPT_CALENDAR_WEEKDAY),
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.rule).toBe("ambiguous");
    expect(result.applicable).toEqual([]);
    expect(result.primary).toBeNull();
    expect(result.holidayEvidence).toBe("absent");
    expect(result.notes).toContain("holiday_calendar_evidence_absent");
  });

  it("resolves the same weekday once holiday evidence is supplied", () => {
    const result = resolveApplicableCalendars(MONDAY, [
      calendar(ODPT_CALENDAR_WEEKDAY),
      HOLIDAYS,
    ]);
    expect(result.status).toBe("resolved");
    expect(result.primary?.sameAs).toBe(ODPT_CALENDAR_WEEKDAY);
  });

  it("can be told not to require holiday evidence", () => {
    const result = resolveApplicableCalendars(
      MONDAY,
      [calendar(ODPT_CALENDAR_WEEKDAY)],
      { requireHolidayEvidence: false },
    );
    expect(result.status).toBe("resolved");
    expect(result.holidayEvidence).toBe("absent");
  });

  it("treats a specific calendar with no date evidence as a data-quality note", () => {
    const vague = calendar("odpt.Calendar:Specific.Toei.MarketHoliday");
    const result = resolveApplicableCalendars(MONDAY, [
      ...BASE_CALENDARS,
      vague,
    ]);
    // It cannot be applied, and that is recorded rather than assumed.
    expect(result.effective).toBe("base");
    expect(result.notes).toContain(
      "specific_without_date_evidence:odpt.Calendar:Specific.Toei.MarketHoliday",
    );
  });

  it("ignores a calendar whose validity period has expired", () => {
    const expired = calendar(ODPT_CALENDAR_WEEKDAY, {
      duration: "2017-01-01/2017-12-31",
    });
    const result = resolveApplicableCalendars(MONDAY, [expired, HOLIDAYS]);
    expect(result.applicable).toEqual([]);
    expect(result.status).toBe("none");
  });

  it("applies a calendar whose validity period covers the date", () => {
    const current = calendar(ODPT_CALENDAR_WEEKDAY, {
      duration: "2026-01-01/2026-12-31",
    });
    const result = resolveApplicableCalendars(MONDAY, [current, HOLIDAYS]);
    expect(result.status).toBe("resolved");
    expect(result.primary?.sameAs).toBe(ODPT_CALENDAR_WEEKDAY);
  });

  it("flags an unknown calendar identity instead of guessing its rule", () => {
    const unknown = calendar("odpt.Calendar:SomethingElse");
    const result = resolveApplicableCalendars(MONDAY, [
      calendar(ODPT_CALENDAR_WEEKDAY),
      HOLIDAYS,
      unknown,
    ]);
    expect(result.notes).toContain(
      "unknown_calendar:odpt.Calendar:SomethingElse",
    );
    expect(result.applicable.map((entry) => entry.sameAs)).not.toContain(
      "odpt.Calendar:SomethingElse",
    );
  });

  it("reports an unparseable date as ambiguous rather than defaulting", () => {
    const result = resolveApplicableCalendars("garbage", BASE_CALENDARS);
    expect(result.status).toBe("ambiguous");
    expect(result.notes).toContain("unparseable_date");
  });

  it("returns a weekday index in getDay() convention", () => {
    expect(resolveApplicableCalendars(MONDAY, BASE_CALENDARS).weekday).toBe(1);
    expect(resolveApplicableCalendars(SATURDAY, BASE_CALENDARS).weekday).toBe(
      6,
    );
    expect(resolveApplicableCalendars(SUNDAY, BASE_CALENDARS).weekday).toBe(0);
  });

  it("handles an empty calendar list without throwing", () => {
    const result = resolveApplicableCalendars(MONDAY, []);
    expect(result.status).toBe("ambiguous");
    expect(result.effective).toBe("none");
  });
});

describe("resolveApplicableCalendars — does not simplify ODPT semantics", () => {
  it("never derives a weekday/saturday/holiday enum on the calendar record", () => {
    const result = resolveApplicableCalendars(MONDAY, BASE_CALENDARS);
    const record = result.primary as OdptCalendar & Record<string, unknown>;
    expect(record.sameAs).toBe(ODPT_CALENDAR_WEEKDAY);
    expect(record).not.toHaveProperty("weekdayType");
    expect(record).not.toHaveProperty("isSaturday");
  });

  it("preserves the raw ODPT identity of every applicable calendar", () => {
    const specific = calendar("odpt.Calendar:Specific.Toei.MarketHoliday", {
      day: [MONDAY],
    });
    const result = resolveApplicableCalendars(MONDAY, [
      ...BASE_CALENDARS,
      specific,
    ]);
    for (const entry of result.applicable) {
      expect(entry.sameAs.startsWith("odpt.Calendar:")).toBe(true);
    }
  });
});
