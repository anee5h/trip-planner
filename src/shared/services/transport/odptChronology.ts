/**
 * KAI-290 — ODPT service-day chronology.
 *
 * API v4.16 §3.3.6 states the problem explicitly:
 *
 *   "If the midnight comes during transfer, odpt:arrivalTime and
 *    odpt:departureTime are expressed in time from 00:00 to 23:59, so the
 *    departure time between station A and station B is 23:58 at station A ->
 *    station B at 00:03, for example. Therefore, in order to determine if the
 *    day rolls over, it is necessary for the client to determine that the day
 *    has rolled over when the time (hour) changes from the previous station's
 *    from 23 to 0."
 *
 * So ODPT times carry no date: 00:03 after 23:58 is the NEXT service day, and
 * any duration computed without accounting for that would be hugely negative.
 *
 * Rollover is detected from SEQUENCE ORDER, never from an absolute rule. The
 * tempting shortcut "any time before 03:00 belongs to tomorrow" is wrong: it
 * would corrupt a genuine 02:00 local departure that starts a service day at
 * 02:00. This module accepts a crossing ONLY in the exact shape §3.3.6 defines —
 * previous hour 23, current hour 0, clock time moving backwards — and reports
 * every other backward step as invalid chronology rather than silently
 * repairing it or guessing a day offset the provider never promised.
 */

/**
 * The hour that must precede a midnight-crossing event (23:xx), per API v4.16
 * §3.3.6: "the day has rolled over when the time (hour) changes from the
 * previous station's from 23 to 0".
 */
export const ROLLOVER_PREVIOUS_HOUR = 23;
/** The hour that must follow a midnight-crossing event (00:xx), per §3.3.6. */
export const ROLLOVER_CURRENT_HOUR = 0;

const MINUTES_PER_DAY = 24 * 60;

export type ServiceEventKind = "arrival" | "departure" | "unknown";

export interface ServiceTimeInput {
  /** ODPT clock time, `HH:MM` or `HH:MM:SS`. Null when the field was absent. */
  readonly time: string | null;
  readonly kind?: ServiceEventKind;
  readonly station?: string | null;
}

export interface ServiceEvent {
  readonly index: number;
  readonly time: string | null;
  /** Clock minutes 0..1439, or null when the time was missing/unparseable. */
  readonly rawMinutes: number | null;
  /** Service-day minutes: rawMinutes plus any detected rollover offset. */
  readonly minutes: number | null;
  /** 0 for the first service day, 1 after a detected midnight crossing. */
  readonly dayOffset: number;
  readonly station: string | null;
  readonly kind: ServiceEventKind;
}

export type ChronologyStatus = "ok" | "rollover" | "invalid" | "empty";

export interface ChronologyResult {
  readonly status: ChronologyStatus;
  readonly events: readonly ServiceEvent[];
  /** Indexes at which a midnight crossing was detected. */
  readonly rollovers: readonly number[];
  /** Last minus first service minute. Never negative. Null when not derivable. */
  readonly durationMinutes: number | null;
  readonly hasMissingTimes: boolean;
  readonly errors: readonly string[];
  readonly notes: readonly string[];
}

/** Parses an ODPT clock time into minutes past midnight. */
export function parseClockMinutes(value: string | null): number | null {
  if (typeof value !== "string") return null;
  const match = /^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Decides whether a backward step is a legitimate midnight crossing.
 *
 * API v4.16 §3.3.6 states the rule exactly: "in order to determine if the day
 * rolls over, it is necessary for the client to determine that the day has
 * rolled over when the time (hour) changes from the previous station's from 23
 * to 0", with `23:58 → 00:03` as the worked example.
 *
 * So the ONLY contract-proven crossing is: the previous event's hour is 23, the
 * current event's hour is 0, and the clock time went backwards. Anything else
 * (e.g. 22:30 → 02:00, 21:55 → 00:10, 23:58 → 01:03) is NOT proven by the
 * provider and is reported as invalid/unresolved rather than being guessed into
 * the next day. A more permissive window would be an invented heuristic: real
 * services may plausibly cross midnight without a 00:xx event, but plausible is
 * not evidence, and ODPT does not promise one. If production evidence later
 * proves another provider pattern, add that as a separate evidence-backed rule.
 */
export function isLegitimateRollover(
  previousRawMinutes: number,
  currentRawMinutes: number,
): boolean {
  const previousHour = Math.floor(previousRawMinutes / 60);
  const currentHour = Math.floor(currentRawMinutes / 60);
  return (
    previousHour === ROLLOVER_PREVIOUS_HOUR &&
    currentHour === ROLLOVER_CURRENT_HOUR &&
    currentRawMinutes < previousRawMinutes
  );
}

/**
 * Builds monotonically increasing service-day minutes for an ordered sequence.
 *
 * At most one midnight crossing is accepted. A second backward step, or a
 * backward step outside the midnight window, is reported as `invalid` so a
 * caller fails closed instead of computing a bogus duration.
 */
export function buildServiceChronology(
  sequence: readonly ServiceTimeInput[],
): ChronologyResult {
  if (sequence.length === 0) {
    return {
      status: "empty",
      events: [],
      rollovers: [],
      durationMinutes: null,
      hasMissingTimes: false,
      errors: [],
      notes: ["empty_sequence"],
    };
  }

  const events: ServiceEvent[] = [];
  const rollovers: number[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  let hasMissingTimes = false;
  let dayOffset = 0;
  let lastMinutes: number | null = null;
  let lastRawMinutes: number | null = null;
  let firstMinutes: number | null = null;
  let crossedMidnight = false;

  sequence.forEach((input, index) => {
    const rawMinutes = parseClockMinutes(input.time);
    const station = input.station ?? null;
    const kind: ServiceEventKind = input.kind ?? "unknown";

    if (rawMinutes === null) {
      hasMissingTimes = true;
      events.push({
        index,
        time: input.time ?? null,
        rawMinutes: null,
        minutes: null,
        dayOffset,
        station,
        kind,
      });
      return;
    }

    let eventDayOffset = dayOffset;
    if (lastMinutes !== null && lastRawMinutes !== null) {
      const candidate = rawMinutes + dayOffset * MINUTES_PER_DAY;
      const rawWentBackwards = rawMinutes < lastRawMinutes;
      // Once midnight has been crossed, a return to the 23:xx hour means the
      // sequence has crossed again — i.e. it spans more than one service day,
      // which this helper does not model. Comparing offset minutes alone would
      // miss that, because 23:50 (+1 day) still looks "later" than 00:03.
      const secondCrossing =
        crossedMidnight &&
        Math.floor(rawMinutes / 60) === ROLLOVER_PREVIOUS_HOUR &&
        rawWentBackwards === false;

      if (candidate < lastMinutes || secondCrossing) {
        // Went backwards. Only a midnight crossing may explain it, and only once.
        if (
          !crossedMidnight &&
          rawWentBackwards &&
          isLegitimateRollover(lastRawMinutes, rawMinutes)
        ) {
          crossedMidnight = true;
          eventDayOffset = dayOffset + 1;
          rollovers.push(index);
        } else if (crossedMidnight) {
          errors.push(`backward_chronology_after_rollover:${index}`);
        } else {
          errors.push(`invalid_backward_chronology:${index}`);
        }
      }
    }

    const minutes = rawMinutes + eventDayOffset * MINUTES_PER_DAY;
    if (firstMinutes === null) firstMinutes = minutes;
    lastMinutes = minutes;
    lastRawMinutes = rawMinutes;
    dayOffset = eventDayOffset;

    events.push({
      index,
      time: input.time ?? null,
      rawMinutes,
      minutes,
      dayOffset: eventDayOffset,
      station,
      kind,
    });
  });

  const status: ChronologyStatus =
    errors.length > 0 ? "invalid" : rollovers.length > 0 ? "rollover" : "ok";

  let durationMinutes: number | null = null;
  if (firstMinutes !== null && lastMinutes !== null) {
    // Clamped so a broken sequence can never yield a negative duration.
    durationMinutes = Math.max(0, lastMinutes - firstMinutes);
  }
  if (hasMissingTimes) notes.push("sequence_contains_missing_times");

  return {
    status,
    events,
    rollovers,
    durationMinutes,
    hasMissingTimes,
    errors,
    notes,
  };
}

/**
 * Flattens ODPT per-train timetable objects into an ordered chronology input.
 * Each stop contributes its arrival before its departure, so a dwell at the same
 * station is represented as arrival <= departure rather than a backward step.
 *
 * Only meaningful for a single train's stop sequence (`odpt:TrainTimetable`).
 * A `odpt:StationTimetable` lists many trains at ONE station and is NOT a
 * sequence — passing it here would fabricate a path that does not exist.
 */
export interface TrainTimetableObjectLike {
  readonly arrivalTime?: string | null;
  readonly arrivalStation?: string | null;
  readonly departureTime?: string | null;
  readonly departureStation?: string | null;
}

export function trainTimetableStopSequence(
  objects: readonly TrainTimetableObjectLike[],
): ServiceTimeInput[] {
  const sequence: ServiceTimeInput[] = [];
  for (const object of objects) {
    if (object.arrivalTime) {
      sequence.push({
        time: object.arrivalTime,
        kind: "arrival",
        station: object.arrivalStation ?? null,
      });
    }
    if (object.departureTime) {
      sequence.push({
        time: object.departureTime,
        kind: "departure",
        station: object.departureStation ?? object.arrivalStation ?? null,
      });
    }
  }
  return sequence;
}

export interface SplitTimetableValidation {
  readonly compatible: boolean;
  readonly hasExplicitLink: boolean;
  readonly chronologyCompatible: boolean;
  readonly reasons: readonly string[];
}

/**
 * KAI-290: checks whether two TrainTimetable records MAY be treated as an
 * explicit continuation of the same service.
 *
 * This deliberately verifies only identity/reference plus chronology. It does
 * NOT join them into a journey, and it will not infer a continuation from a
 * matching train number, train name, similar time or the same railway — API
 * v4.16 provides explicit `odpt:previousTrainTimetable` /
 * `odpt:nextTrainTimetable` links for exactly that purpose, and only those links
 * are evidence.
 */
export function validateSplitTimetablePair(
  first: {
    readonly id: string;
    readonly sameAs: string;
    readonly nextTrainTimetable?: readonly string[];
    readonly objects?: readonly TrainTimetableObjectLike[];
  },
  second: {
    readonly id: string;
    readonly sameAs: string;
    readonly previousTrainTimetable?: readonly string[];
    readonly objects?: readonly TrainTimetableObjectLike[];
  },
): SplitTimetableValidation {
  const reasons: string[] = [];

  const firstIds = new Set([first.id, first.sameAs]);
  const secondIds = new Set([second.id, second.sameAs]);

  const forwardLinked = (first.nextTrainTimetable ?? []).some((id) =>
    secondIds.has(id),
  );
  const backwardLinked = (second.previousTrainTimetable ?? []).some((id) =>
    firstIds.has(id),
  );
  const hasExplicitLink = forwardLinked || backwardLinked;
  if (!hasExplicitLink) {
    reasons.push("missing_explicit_previous_next_link");
  }

  let chronologyCompatible = false;
  const sequence = [
    ...trainTimetableStopSequence(first.objects ?? []),
    ...trainTimetableStopSequence(second.objects ?? []),
  ];
  if (sequence.length === 0) {
    reasons.push("missing_timetable_objects");
  } else {
    const chronology = buildServiceChronology(sequence);
    chronologyCompatible =
      chronology.status === "ok" || chronology.status === "rollover";
    if (!chronologyCompatible) {
      reasons.push("chronology_incompatible");
    }
    // The join point must not move backwards across the record boundary.
    const firstEnd = buildServiceChronology(
      trainTimetableStopSequence(first.objects ?? []),
    );
    const secondStart = buildServiceChronology(
      trainTimetableStopSequence(second.objects ?? []),
    );
    if (
      firstEnd.durationMinutes !== null &&
      secondStart.events.length > 0 &&
      chronology.status === "ok" &&
      (first.nextTrainTimetable ?? []).length > 0
    ) {
      const firstLast = [...firstEnd.events]
        .reverse()
        .find((event) => event.minutes !== null);
      const secondFirst = secondStart.events.find(
        (event) => event.minutes !== null,
      );
      if (
        firstLast?.rawMinutes != null &&
        secondFirst?.rawMinutes != null &&
        secondFirst.rawMinutes < firstLast.rawMinutes &&
        !isLegitimateRollover(firstLast.rawMinutes, secondFirst.rawMinutes)
      ) {
        reasons.push("join_point_backward");
        chronologyCompatible = false;
      }
    }
  }

  return {
    compatible: hasExplicitLink && chronologyCompatible,
    hasExplicitLink,
    chronologyCompatible,
    reasons,
  };
}
