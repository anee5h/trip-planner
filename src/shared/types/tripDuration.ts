/**
 * Canonical planner duration values and their derived trip semantics.
 *
 * The fixed values are the options currently exposed by the planner. The
 * overnight grammar intentionally accepts future values such as `4d3n`, so
 * adding a duration does not require another trip-mode state machine.
 */

export const HOME_TRIP_DURATION_OPTIONS = [
  "shortOuting",
  "halfDay",
  "fullDay",
  "2d1n",
  "3d2n",
] as const;

export type DayTripDuration = Extract<
  (typeof HOME_TRIP_DURATION_OPTIONS)[number],
  "shortOuting" | "halfDay" | "fullDay"
>;
export type OvernightTripDuration = `${number}d${number}n`;
export type HomepageTripDuration = (typeof HOME_TRIP_DURATION_OPTIONS)[number];
export type ExplorerTripDuration = "any" | HomepageTripDuration;
export type TripDuration = ExplorerTripDuration | OvernightTripDuration;
export const DEFAULT_HOME_TRIP_DURATION: HomepageTripDuration = "halfDay";

export interface TripDurationSemantics {
  duration: TripDuration;
  days: number;
  nights: number;
  /** Maximum total hours for a same-day duration. */
  maxHours?: number;
  isOvernight: boolean;
}

const DAY_DURATION_SEMANTICS: Record<
  Exclude<TripDuration, "any" | OvernightTripDuration>,
  Omit<TripDurationSemantics, "duration">
> = {
  shortOuting: { days: 1, nights: 0, maxHours: 4, isOvernight: false },
  halfDay: { days: 1, nights: 0, maxHours: 7.5, isOvernight: false },
  fullDay: { days: 1, nights: 0, maxHours: 14, isOvernight: false },
};

const OVERNIGHT_DURATION_PATTERN = /^(\d+)d(\d+)n$/;

function parseOvernightDuration(
  value: string,
): { days: number; nights: number } | undefined {
  const match = OVERNIGHT_DURATION_PATTERN.exec(value);
  if (!match) return undefined;
  const days = Number(match[1]);
  const nights = Number(match[2]);
  if (
    !Number.isSafeInteger(days) ||
    !Number.isSafeInteger(nights) ||
    days < 2 ||
    nights < 1 ||
    days !== nights + 1
  ) {
    return undefined;
  }
  return { days, nights };
}

export function isTripDuration(value: unknown): value is TripDuration {
  return (
    value === "any" || getTripDurationSemantics(value as string) !== undefined
  );
}

export function getTripDurationSemantics(
  duration: TripDuration | string,
): TripDurationSemantics | undefined {
  if (duration === "any") {
    return {
      duration: "any",
      days: 1,
      nights: 0,
      isOvernight: false,
    };
  }
  const daySemantics =
    DAY_DURATION_SEMANTICS[duration as keyof typeof DAY_DURATION_SEMANTICS];
  if (daySemantics)
    return { duration: duration as TripDuration, ...daySemantics };

  const overnight = parseOvernightDuration(duration);
  return overnight
    ? {
        duration: duration as TripDuration,
        ...overnight,
        isOvernight: true,
      }
    : undefined;
}

/**
 * Normalize canonical and legacy URL/persisted values. Legacy trip mode is an
 * input only; callers should store/serialize the returned duration instead.
 */
export function normalizeTripDuration(
  value: unknown,
): TripDuration | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "weekend" || value === "weekend_2d1n") return "2d1n";
  if (value === "day_trip") return "halfDay";
  if (value === "dayTrip") return "fullDay";
  return getTripDurationSemantics(value)?.duration;
}

export function isHomepageTripDuration(
  value: unknown,
): value is HomepageTripDuration {
  return (
    typeof value === "string" &&
    (HOME_TRIP_DURATION_OPTIONS as readonly string[]).includes(value)
  );
}

/** Normalize only values currently exposed by the homepage planner. */
export function normalizeHomepageTripDuration(
  value: unknown,
): HomepageTripDuration | undefined {
  const normalized = normalizeTripDuration(value);
  return isHomepageTripDuration(normalized) ? normalized : undefined;
}

/** Normalize only values currently accepted by Explorer URL/state input. */
export function normalizeExplorerTripDuration(
  value: unknown,
): ExplorerTripDuration | undefined {
  if (value === "any") return "any";
  return normalizeHomepageTripDuration(value);
}

export function getTripDays(duration: TripDuration | string): number {
  return getTripDurationSemantics(duration)?.days ?? 1;
}

export function getTripNights(duration: TripDuration | string): number {
  return getTripDurationSemantics(duration)?.nights ?? 0;
}

export function isOvernightDuration(duration: TripDuration | string): boolean {
  return getTripNights(duration) > 0;
}
