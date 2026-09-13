export const JAPAN_TRANSIT_TIME_ZONE = "Asia/Tokyo" as const;

export type ScheduledRoutingTemporalSource =
  | "explicit_user_selected_trip_date_time"
  | "explicit_planner_generated_time_window"
  | "persisted_itinerary_time"
  | "controlled_internal_test_fixture";

export type ScheduledRoutingServiceDate = string & {
  readonly __scheduledRoutingServiceDate: unique symbol;
};

export type ScheduledRoutingServiceDaySeconds = number & {
  readonly __scheduledRoutingServiceDaySeconds: unique symbol;
};

export interface ScheduledRoutingTemporalProvenance {
  readonly source: ScheduledRoutingTemporalSource;
  readonly timeZone: typeof JAPAN_TRANSIT_TIME_ZONE;
  readonly evidenceId?: string;
}

export interface ScheduledRoutingTemporalContext {
  /** Japan-local GTFS service date, independent of a JavaScript Date. */
  readonly serviceDate: ScheduledRoutingServiceDate;
  /** Absolute seconds from the start of the service date; may exceed 86400. */
  readonly earliestDepartureServiceSeconds: ScheduledRoutingServiceDaySeconds;
  readonly provenance: ScheduledRoutingTemporalProvenance;
}

export interface ScheduledRoutingTemporalQuery {
  /** Strict YYYY-MM-DD service date; null/undefined means not supplied. */
  readonly serviceDate: string | null | undefined;
  /** Strict H+:MM[:SS] service-day notation; null/undefined means missing. */
  readonly earliestDepartureTime: string | null | undefined;
  readonly source: ScheduledRoutingTemporalSource;
  readonly evidenceId?: string;
}

export type ScheduledServiceDayTimeResolution =
  | {
      readonly status: "resolved";
      readonly serviceDaySeconds: ScheduledRoutingServiceDaySeconds;
    }
  | {
      readonly status: "invalid_query";
      readonly reason: "invalid_departure_time";
    };

export type ScheduledRoutingTemporalUnresolvedReason =
  "missing_service_date" | "missing_departure_time";

export type ScheduledRoutingTemporalInvalidReason =
  "invalid_service_date" | "invalid_departure_time" | "invalid_source";

export type ScheduledRoutingTemporalResolution =
  | {
      readonly status: "resolved";
      readonly context: ScheduledRoutingTemporalContext;
    }
  | {
      readonly status: "unresolved";
      readonly reason: ScheduledRoutingTemporalUnresolvedReason;
    }
  | {
      readonly status: "invalid_query";
      readonly reason: ScheduledRoutingTemporalInvalidReason;
    };

export interface ScheduledRoutingTemporalPlan {
  readonly outbound: ScheduledRoutingTemporalContext;
  readonly return?: ScheduledRoutingTemporalContext;
}

export interface ScheduledRoutingTemporalPlanQuery {
  readonly outbound: ScheduledRoutingTemporalQuery;
  readonly return?: ScheduledRoutingTemporalQuery | null;
}

export type ScheduledRoutingTemporalPlanResolution =
  | {
      readonly status: "resolved";
      readonly plan: ScheduledRoutingTemporalPlan;
    }
  | {
      readonly status: "unresolved";
      readonly leg: "outbound" | "return";
      readonly reason: ScheduledRoutingTemporalUnresolvedReason;
    }
  | {
      readonly status: "invalid_query";
      readonly leg: "outbound" | "return";
      readonly reason: ScheduledRoutingTemporalInvalidReason;
    };

const SOURCES: readonly ScheduledRoutingTemporalSource[] = [
  "explicit_user_selected_trip_date_time",
  "explicit_planner_generated_time_window",
  "persisted_itinerary_time",
  "controlled_internal_test_fixture",
];

function isSource(value: unknown): value is ScheduledRoutingTemporalSource {
  return (
    typeof value === "string" &&
    SOURCES.includes(value as ScheduledRoutingTemporalSource)
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Strict Gregorian validation for a Japan-local service-date string. */
export function isScheduledRoutingServiceDate(
  value: unknown,
): value is ScheduledRoutingServiceDate {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

/**
 * Parse explicit service-day notation without Date or clock arithmetic.
 * Hours are intentionally unbounded by 24 so GTFS 24:00+ values stay
 * absolute. Minutes and seconds remain ordinary 0..59 fields.
 */
export function resolveServiceDayTime(
  value: string | null | undefined,
): ScheduledServiceDayTimeResolution {
  if (typeof value !== "string") {
    return { status: "invalid_query", reason: "invalid_departure_time" };
  }
  const match = /^(\d+):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (match === null) {
    return { status: "invalid_query", reason: "invalid_departure_time" };
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  if (
    !Number.isSafeInteger(hours) ||
    hours < 0 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return { status: "invalid_query", reason: "invalid_departure_time" };
  }
  const total = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isSafeInteger(total)) {
    return { status: "invalid_query", reason: "invalid_departure_time" };
  }
  return {
    status: "resolved",
    serviceDaySeconds: total as ScheduledRoutingServiceDaySeconds,
  };
}

function missing(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === "";
}

/** Resolve one explicit date/time pair. No current-time or date defaults exist. */
export function resolveScheduledRoutingTemporalContext(
  input: ScheduledRoutingTemporalQuery,
): ScheduledRoutingTemporalResolution {
  if (!isSource(input.source)) {
    return { status: "invalid_query", reason: "invalid_source" };
  }
  if (missing(input.serviceDate)) {
    return { status: "unresolved", reason: "missing_service_date" };
  }
  if (!isScheduledRoutingServiceDate(input.serviceDate)) {
    return { status: "invalid_query", reason: "invalid_service_date" };
  }
  if (missing(input.earliestDepartureTime)) {
    return { status: "unresolved", reason: "missing_departure_time" };
  }
  const time = resolveServiceDayTime(input.earliestDepartureTime);
  if (time.status !== "resolved") {
    return time;
  }
  return {
    status: "resolved",
    context: {
      serviceDate: input.serviceDate,
      earliestDepartureServiceSeconds: time.serviceDaySeconds,
      provenance: {
        source: input.source,
        timeZone: JAPAN_TRANSIT_TIME_ZONE,
        ...(input.evidenceId === undefined
          ? {}
          : { evidenceId: input.evidenceId }),
      },
    },
  };
}

function planFailure(
  resolution: Exclude<
    ScheduledRoutingTemporalResolution,
    { status: "resolved" }
  >,
  leg: "outbound" | "return",
): Exclude<ScheduledRoutingTemporalPlanResolution, { status: "resolved" }> {
  if (resolution.status === "unresolved") {
    return { status: "unresolved", leg, reason: resolution.reason };
  }
  return { status: "invalid_query", leg, reason: resolution.reason };
}

/** Resolve outbound and optional return contexts independently. */
export function resolveScheduledRoutingTemporalPlan(
  input: ScheduledRoutingTemporalPlanQuery,
): ScheduledRoutingTemporalPlanResolution {
  const outbound = resolveScheduledRoutingTemporalContext(input.outbound);
  if (outbound.status !== "resolved") return planFailure(outbound, "outbound");
  if (input.return === undefined || input.return === null) {
    return { status: "resolved", plan: { outbound: outbound.context } };
  }
  const returnResolution = resolveScheduledRoutingTemporalContext(input.return);
  if (returnResolution.status !== "resolved") {
    return planFailure(returnResolution, "return");
  }
  return {
    status: "resolved",
    plan: { outbound: outbound.context, return: returnResolution.context },
  };
}
