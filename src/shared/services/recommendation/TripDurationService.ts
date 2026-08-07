import type { Destination } from "@/shared/types/destination";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type {
  RecommendationContext,
  TripDuration,
  TripDurationContext,
} from "./RecommendationContext";

export interface TripDurationEstimate {
  visitRangeHours: [number, number];
  totalRangeHours: [number, number];
  representativeHours: number;
  band: TripDuration;
  mode?: string;
  bestTravelMinutes?: number;
  isImpossible?: boolean;
  isBorderline?: boolean;
  warningMessage?: {
    en: string;
    ja: string;
  };
}

export function getBand(hours: number): TripDuration {
  if (hours < 4) return "shortOuting";
  if (hours < 7.5) return "halfDay";
  if (hours <= 14) return "fullDay";
  return "weekend";
}

/**
 * Pure visit-duration band using only published recommendedVisitHours.
 * Changing origin must not change the result.
 */
export type VisitDuration = Exclude<TripDuration, "weekend">;

export function getVisitBand(destination: Destination): VisitDuration | null {
  if (!destination.recommendedVisitHours) return null;
  const hours =
    (destination.recommendedVisitHours.min +
      destination.recommendedVisitHours.max) /
    2;
  if (hours < 2.5) return "shortOuting";
  if (hours < 5) return "halfDay";
  return "fullDay";
}

export function matchesVisitDuration(
  destination: Destination,
  requested: TripDuration,
): boolean {
  if (requested === "any") return true;
  if (requested === "weekend") return true; // trip-mode gate handles this
  const band = getVisitBand(destination);
  return band === requested;
}

export function formatTripDurationLabel(
  estimate: TripDurationEstimate,
  locale: "en" | "ja",
): string {
  const hours = Math.round(estimate.representativeHours * 10) / 10;
  if (locale === "ja") {
    switch (estimate.band) {
      case "shortOuting":
        return `サクッと外出 (${hours}時間)`;
      case "halfDay":
        return `半日日帰り (${hours}時間)`;
      case "fullDay":
        return `1日日帰り (${hours}時間)`;
      case "weekend":
        return `1泊2日/週末 (${hours}時間)`;
      default:
        return `${hours}時間`;
    }
  }
  switch (estimate.band) {
    case "shortOuting":
      return `Short Outing (${hours}h)`;
    case "halfDay":
      return `Half-Day (${hours}h)`;
    case "fullDay":
      return `Full-Day (${hours}h)`;
    case "weekend":
      return `Weekend (${hours}h)`;
    default:
      return `${hours}h total`;
  }
}

/**
 * Returns the fastest verified origin-aware one-way travel time (midpoint of
 * the estimate range) for a destination across all authorised transport
 * modes. Returns `undefined` when no origin-aware duration exists — the
 * caller must then exclude the candidate from personalized matching, never
 * fall back to unprovenanced `transportOptions` values.
 */
export function getBestOneWayTravelMinutes(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
): number | undefined {
  const estimate = getOriginAwareTransportEstimate(
    destination,
    {
      homeStationCoords: context.homeStationCoords ?? undefined,
      ferryTemporal: context.ferryTemporal,
    },
    modes,
  );
  if (!estimate) return undefined;
  return Math.round((estimate.timeRange[0] + estimate.timeRange[1]) / 2);
}

export function estimateTripDuration(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
): TripDurationEstimate | null {
  // KAI-50: `recommendedVisitHours` is the only canonical visit-duration
  // source. `totalTripHours` is deprecated and may already include travel
  // from a fixed origin, so it can never be used as a visit fallback.
  if (!destination.recommendedVisitHours) return null;
  const visitRange: [number, number] = [
    destination.recommendedVisitHours.min,
    destination.recommendedVisitHours.max,
  ];

  let totalRangeHours: [number, number];
  let representativeHours: number;
  let bestMode: string | undefined;
  let bestTravelMinutes: number | undefined;

  if (!context.homeStationCoords) {
    totalRangeHours = visitRange;
    representativeHours = (visitRange[0] + visitRange[1]) / 2;
  } else {
    const estimate = getOriginAwareTransportEstimate(
      destination,
      {
        homeStationCoords: context.homeStationCoords ?? undefined,
        ferryTemporal: context.ferryTemporal,
      },
      modes,
    );

    if (!estimate) return null;
    bestMode = estimate.mode;
    bestTravelMinutes = Math.round(
      (estimate.timeRange[0] + estimate.timeRange[1]) / 2,
    );
    const bufferHours =
      ((destination.travelBuffers?.transferMinutes ?? 0) +
        (destination.travelBuffers?.ferryMinutes ?? 0)) /
      60;
    const travelHours = (bestTravelMinutes * 2) / 60 + bufferHours;
    totalRangeHours = [
      visitRange[0] + travelHours,
      visitRange[1] + travelHours,
    ];
    representativeHours = (totalRangeHours[0] + totalRangeHours[1]) / 2;
  }

  let isImpossible = false;
  let isBorderline = false;
  let warningMessage: { en: string; ja: string } | undefined;

  if (
    context.availableTimeHours !== undefined &&
    context.availableTimeHours > 0
  ) {
    const minRequired = totalRangeHours[0];
    const maxRequired = totalRangeHours[1];
    const avail = context.availableTimeHours;

    if (minRequired > avail) {
      isImpossible = true;
      warningMessage = {
        en: `Exceeds available time limit of ${avail}h (${Math.round(minRequired * 10) / 10}h min required)`,
        ja: `利用可能時間 (${avail}時間) を超えます (最低${Math.round(minRequired * 10) / 10}時間必要)`,
      };
    } else if (maxRequired > avail) {
      isBorderline = true;
      warningMessage = {
        en: `Tight schedule — maximum visit (${Math.round(maxRequired * 10) / 10}h) exceeds ${avail}h limit`,
        ja: `時間がタイトです — 最大滞在 (${Math.round(maxRequired * 10) / 10}時間) が${avail}時間の制限を超えます`,
      };
    }
  }

  return {
    visitRangeHours: visitRange,
    totalRangeHours,
    representativeHours,
    band: getBand(representativeHours),
    mode: bestMode,
    bestTravelMinutes,
    isImpossible,
    isBorderline,
    warningMessage,
  };
}

/**
 * Representative runtime total trip duration in hours, derived from the
 * canonical visit duration plus verified origin-aware round-trip travel and
 * buffers. Returns `undefined` when the destination cannot be
 * duration-planned (no canonical visit duration).
 */
export function getDerivedTripDurationHours(
  destination: Destination,
  context: TripDurationContext | RecommendationContext,
  modes: string[],
): number | undefined {
  return estimateTripDuration(destination, context, modes)?.representativeHours;
}

export function matchesTripDurationEstimate(
  estimate: TripDurationEstimate | null,
  requested: TripDuration = "any",
) {
  return (
    requested === "any" || (estimate !== null && estimate.band === requested)
  );
}
