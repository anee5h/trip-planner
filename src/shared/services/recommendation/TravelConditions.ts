import type { Destination } from "@/shared/types/destination";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";
import {
  getNextCalendarDate,
  travelDateToDate,
} from "@/shared/utils/travelDate";
import type { TripMode } from "./RecommendationContext";
import type { MatchReason } from "./RecommendationTypes";

export { normalizeTravelDateParam } from "@/shared/types/homePlannerState";
import { evaluateSeasonalSuitability } from "./SeasonalSuitabilityService";
import { isFerryTripAvailable } from "@/shared/services/transport/FerryTransportEstimator";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";

/**
 * One shared date-selection model for Home, Destinations, URL state,
 * recommendation context and View-all links. A trip is always anchored on
 * Day 1; 2D1N derives Day 2 as the following calendar date (month/year/leap
 * rollover handled by getNextCalendarDate). Day 2 is never serialized.
 */
export interface TravelDateSelection {
  /** YYYY-MM-DD local calendar date. */
  day1: string;
  /** Derived next calendar date; only present for 2D1N. */
  day2?: string;
}

export type TravelConditionSource =
  "forecast" | "mixed" | "seasonal" | "unknown";

export interface TravelConditionEvaluation {
  source: TravelConditionSource;
  scoreDelta: number;
  reasons: MatchReason[];
  dates: string[];
}

/**
 * Derives the trip dates for a trip mode. Day trips evaluate only the
 * selected date; 2D1N always evaluates the selected date plus the following
 * calendar date. A third day never enters the model.
 */
export {
  getNextCalendarDate,
  travelDateToDate,
} from "@/shared/utils/travelDate";

export function deriveTripDates(
  day1: string,
  tripMode: TripMode,
): TravelDateSelection {
  if (tripMode === "weekend_2d1n") {
    return { day1, day2: getNextCalendarDate(day1) };
  }
  return { day1 };
}

/**
 * Canonical trip-date transport eligibility, shared by Home and the
 * Destinations explorer (one authority, never two).
 *
 * `modes` are the actual origin-aware authorized modes from getValidModes
 * — never static destination.transportOptions. When the trip depends on
 * the ferry (ferry is the ONLY authorized mode), the ferry must cover
 * every travel day: outbound on Day 1 and the return leg on Day 2 (or the
 * same day for day trips), with directionality respected. A destination
 * with an independently valid non-ferry mode stays eligible without the
 * ferry. No origin means no ferry claim to enforce.
 */
export function isTripDatesTransportEligible(
  dest: Destination,
  modes: readonly string[],
  homeCoords: { lat: number; lng: number } | undefined,
  travelDates: TravelDateSelection,
): boolean {
  if (!modes.includes("ferry")) return true;
  // A non-ferry alternative is independently valid ONLY when the canonical
  // origin-aware transport service returns an estimate for one of the
  // non-ferry modes. Static transportOptions support or a topology presence
  // alone is not a route; catchment estimates retain verified corridor
  // provenance in the returned object.
  if (homeCoords) {
    const nonFerryModes = modes.filter((mode) => mode !== "ferry");
    if (nonFerryModes.length > 0) {
      const alternative = getOriginAwareTransportEstimate(
        dest,
        { homeStationCoords: homeCoords },
        nonFerryModes,
      );
      if (alternative) return true;
    }
  }
  if (!homeCoords) return true;
  const dates = [travelDateToDate(travelDates.day1)];
  if (travelDates.day2) dates.push(travelDateToDate(travelDates.day2));
  return isFerryTripAvailable(dest, homeCoords, dates);
}

/** "Aug 8" / "8/8" for a YYYY-MM-DD date. */
export function formatTravelDateShort(iso: string, locale: "en" | "ja") {
  const [year, month, day] = iso.split("-").map(Number);
  if (locale === "ja") return `${month}/${day}`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** "November" / "11月" for a YYYY-MM month key. */
export function formatTravelMonth(ym: string, locale: "en" | "ja") {
  const [year, month] = ym.split("-").map(Number);
  if (locale === "ja") return `${month}月`;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(new Date(year, month - 1, 1));
}

const SEASON_LABELS_JA: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

/** Formats condition-reason params (ISO dates/months/seasons) for display. */
export function formatTravelConditionParams(
  params: Record<string, string | number> | undefined,
  locale: "en" | "ja",
): Record<string, string | number> {
  const formatted: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value !== "string") {
      formatted[key] = value;
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      formatted[key] = formatTravelDateShort(value, locale);
    } else if (/^\d{4}-\d{2}$/.test(value)) {
      formatted[key] = formatTravelMonth(value, locale);
    } else if (key === "season" && locale === "ja") {
      formatted[key] = SEASON_LABELS_JA[value] ?? value;
    } else {
      formatted[key] = value;
    }
  }
  return formatted;
}

function allDatesOf(selection: TravelDateSelection): string[] {
  return selection.day2 ? [selection.day1, selection.day2] : [selection.day1];
}

function forecastReason(days: readonly DayForecastData[]): MatchReason {
  if (days.length === 1) {
    return {
      type: "Weather",
      code: "conditionForecastDay",
      params: { date: days[0].date },
      title: "Forecast",
      description: "Live weather forecast for the selected date",
    };
  }
  return {
    type: "Weather",
    code: "conditionForecastRange",
    params: { day1: days[0].date, day2: days[days.length - 1].date },
    title: "Forecast",
    description: "Live weather forecast for both days",
  };
}

function unknownReason(missingDates: readonly string[]): MatchReason {
  const params: Record<string, string> = {};
  if (missingDates.length === 1) {
    params.date = missingDates[0];
  } else {
    params.day1 = missingDates[0];
    params.day2 = missingDates[1];
  }
  return {
    type: "Seasonal",
    code: "conditionUnknown",
    params,
    title: "No forecast or seasonal guidance available",
    description:
      "No live forecast or catalogue seasonal evidence for the selected date",
  };
}

/**
 * THE shared condition-evaluation entry point. Chooses between:
 *
 *  - forecast evaluation  — the selected dates exist in the live forecast map
 *  - seasonal evaluation  — forecast unavailable, catalogue seasonal evidence
 *                           exists (never presented as a forecast)
 *  - neutral unknown      — no forecast and no seasonal evidence; zero delta,
 *                           nothing fabricated
 *
 * The live forecast map is weather at the SELECTED ORIGIN, never destination
 * weather: it labels the calendar and never contributes destination-specific
 * weather scoring. Seasonal evaluation is destination-specific.
 * ponytail: destination-coordinate forecast fetching is a follow-up.
 *
 * For 2D1N each day is evaluated independently: a day with a forecast keeps
 * its forecast evidence while a day without one falls back to seasonal or
 * neutral, and the mixed result is labeled honestly (source "mixed").
 */
export function evaluateTravelConditions(
  dest: Destination,
  dates: TravelDateSelection,
  forecastMap?: ReadonlyMap<string, DayForecastData>,
): TravelConditionEvaluation {
  const allDates = allDatesOf(dates);
  const forecastDays = allDates
    .map((iso) => forecastMap?.get(iso))
    .filter((d): d is DayForecastData => d !== undefined);
  const missingDates = allDates.filter(
    (iso) => forecastMap?.get(iso) === undefined,
  );

  // Forecast days never contribute a destination score delta: the forecast
  // is origin weather. Only uncovered days (seasonal/unknown) do.
  let scoreDelta = 0;

  const reasons: MatchReason[] = [];
  if (forecastDays.length > 0) {
    reasons.push(forecastReason(forecastDays));
  }

  if (missingDates.length === 0) {
    return { source: "forecast", scoreDelta, reasons, dates: allDates };
  }

  const seasonal = evaluateSeasonalSuitability(dest, missingDates);
  const hasSeasonalEvidence = seasonal.evidence.length > 0;
  scoreDelta += seasonal.scoreDelta;

  if (hasSeasonalEvidence) {
    reasons.push(...seasonal.reasons);
  } else {
    reasons.push(unknownReason(missingDates));
  }

  const source: TravelConditionSource =
    missingDates.length === allDates.length
      ? hasSeasonalEvidence
        ? "seasonal"
        : "unknown"
      : "mixed";

  return { source, scoreDelta, reasons, dates: allDates };
}
