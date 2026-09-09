import type { Trip, TripStop } from "@/shared/types/trip";
import { generateUUID } from "@/shared/utils/uuid";
import { formatTripDateRange } from "@/shared/utils/date";

export type TripTitleLocale = "en" | "ja";

export interface SmartTripTitleInput {
  title?: string;
  startDate?: string;
  endDate?: string;
  destinationName?: string;
  region?: string;
  locale?: TripTitleLocale;
}

export type SmartTripTitleContext = Pick<
  SmartTripTitleInput,
  "destinationName" | "region" | "locale"
>;

function isCrypticDateTitle(title: string): boolean {
  return /^\d{4}$/.test(title);
}

export function buildSmartTripTitle(input: SmartTripTitleInput): string {
  const title = input.title?.trim() ?? "";
  if (title && !isCrypticDateTitle(title)) return title;

  const locale = input.locale ?? "en";
  const destinationName = input.destinationName?.trim();
  const region = input.region?.trim();
  const dateLabel = input.startDate
    ? formatTripDateRange(input.startDate, input.endDate, locale)
    : "";
  const dateSuffix = dateLabel
    ? locale === "ja"
      ? ` · ${dateLabel}`
      : ` — ${dateLabel}`
    : "";

  if (destinationName) {
    return locale === "ja"
      ? `${destinationName}への旅${dateSuffix}`
      : `Trip to ${destinationName}${dateSuffix}`;
  }
  if (region) {
    return locale === "ja"
      ? `${region}の旅${dateSuffix}`
      : `${region} trip${dateSuffix}`;
  }
  if (dateLabel)
    return locale === "ja" ? `旅行${dateSuffix}` : `Trip${dateSuffix}`;
  return locale === "ja" ? "名称未設定の旅" : "Untitled trip";
}

export function validateTrip(
  title: string,
  startDate?: string,
  endDate?: string,
): string[] {
  const errors: string[] = [];
  if (!title || title.trim() === "") {
    errors.push("Trip title is required.");
  }
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      errors.push("Start date cannot be after end date.");
    }
  }
  return errors;
}

export function addStopToTrip(trip: Trip, stop: Omit<TripStop, "id">): Trip {
  const newStop: TripStop = {
    ...stop,
    id: generateUUID(),
  };
  return {
    ...trip,
    stops: [...trip.stops, newStop],
    updatedAt: new Date().toISOString(),
  };
}

export function removeStopFromTrip(trip: Trip, stopId: string): Trip {
  return {
    ...trip,
    stops: trip.stops.filter((s) => s.id !== stopId),
    updatedAt: new Date().toISOString(),
  };
}

export function updateTripStop(
  trip: Trip,
  stopId: string,
  updates: Partial<TripStop>,
): Trip {
  return {
    ...trip,
    stops: trip.stops.map((s) => (s.id === stopId ? { ...s, ...updates } : s)),
    updatedAt: new Date().toISOString(),
  };
}

export function reorderStops(
  trip: Trip,
  startIndex: number,
  endIndex: number,
): Trip {
  if (
    startIndex < 0 ||
    startIndex >= trip.stops.length ||
    endIndex < 0 ||
    endIndex >= trip.stops.length
  ) {
    return trip;
  }
  const sourceGroup = trip.stops[startIndex].date ?? "unscheduled";
  const targetGroup = trip.stops[endIndex].date ?? "unscheduled";
  if (sourceGroup !== targetGroup) return trip;

  const result = [...trip.stops];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return {
    ...trip,
    stops: result,
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateTrip(
  trip: Trip,
): Omit<Trip, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: trip.userId,
    title: `${trip.title} (Copy)`,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    stops: trip.stops.map((stop) => ({
      ...stop,
      id: generateUUID(),
    })),
    journalNotes: trip.journalNotes,
  };
}
