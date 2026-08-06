import type { Destination } from "@/shared/types/destination";
import { getFixedSeason, type Season } from "@/shared/utils/season";
import type { MatchReason } from "./RecommendationTypes";
import {
  findArrivalFerryPort,
  isDestinationFerrySeasonallyUnavailable,
} from "@/shared/services/transport/FerryTransportEstimator";

/**
 * Deterministic seasonal suitability evaluation for a list of YYYY-MM-DD
 * dates. Only structured, catalogue-sourced evidence is used:
 *
 *  - bestMonths (month-of-date match)
 *  - season ratings (spring/summer/autumn/winter)
 *  - indoorPercent + weatherDependence (heat/cold exposure)
 *  - comfort.rainFriendly (rainy-season exposure)
 *  - verified ferry operating periods (seasonal closures)
 *
 * No historical weather, no fabricated temperatures, no scraped averages.
 * Missing evidence never produces a penalty: unknown data stays neutral.
 * This service never decides eligibility — the canonical trip-date
 * transport check (isTripDatesTransportEligible) is the only authority.
 */
export interface SeasonalSuitability {
  scoreDelta: number;
  reasons: MatchReason[];
  /** Structured evidence keys that fired (e.g. "bestMonths", "season.summer"). */
  evidence: string[];
}

export const SEASONAL_WEIGHTS = {
  /**
   * Corrects the catalogue's ambient calendar-season contribution (based on
   * today's season) to the SELECTED date's season. Mirrors the scorer's
   * SEASON_MULTIPLIER so the total seasonal contribution stays on the same
   * scale: delta = (selectedSeasonRating - todaySeasonRating) * multiplier.
   */
  SEASON_CORRECTION_MULTIPLIER: 3,
  /** Evidence-backed bonus when the date's month is in bestMonths. */
  BEST_MONTH_BONUS: 3,
  STRONG_SEASON_RATING: 8,
  WEAK_SEASON_RATING: 3,
  INDOOR_COMFORT_BONUS: 1,
  OUTDOOR_EXPOSURE_PENALTY: 2,
  RAIN_FRIENDLY_BONUS: 1,
  RAIN_EXPOSED_PENALTY: 2,
  FERRY_SEASONAL_PENALTY: 4,
} as const;

/**
 * Evaluates typical seasonal suitability for the given dates. `dates` are
 * the dates WITHOUT a live forecast (the forecast path owns those); this
 * service never claims to be a weather forecast.
 */
export function evaluateSeasonalSuitability(
  dest: Destination,
  dates: readonly string[],
): SeasonalSuitability {
  const reasons: MatchReason[] = [];
  const evidence: string[] = [];
  if (dates.length === 0) {
    return { scoreDelta: 0, reasons, evidence };
  }

  const todaySeason = getFixedSeason(new Date());
  const todayRating = dest.season?.[todaySeason] ?? 5;

  let seasonDelta = 0;
  let monthBonus = 0;
  let comfortDelta = 0;
  let ferryPenalty = 0;
  let ferryUnavailable = false;
  const seasonReasonAdded = new Set<Season>();
  const monthReasonAdded = new Set<string>();

  for (const iso of dates) {
    const [year, month, day] = iso.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const season = getFixedSeason(dateObj);
    const rating = dest.season?.[season] ?? 5;

    // Season correction: shift the ambient today-season contribution to the
    // selected date's season. Identical seasons yield zero delta.
    seasonDelta +=
      (rating - todayRating) * SEASONAL_WEIGHTS.SEASON_CORRECTION_MULTIPLIER;

    // Best months: positive, evidence-backed seasonal guidance.
    if (dest.bestMonths?.includes(month)) {
      monthBonus += SEASONAL_WEIGHTS.BEST_MONTH_BONUS;
      evidence.push("bestMonths");
      const monthKey = iso.slice(0, 7);
      if (!monthReasonAdded.has(monthKey)) {
        monthReasonAdded.add(monthKey);
        reasons.push({
          type: "Seasonal",
          code: "conditionSeasonalMonth",
          params: { month: monthKey },
          title: "Typical conditions",
          description: "Typical seasonal conditions for the selected month",
        });
      }
    }

    // Season rating extremes.
    if (
      rating >= SEASONAL_WEIGHTS.STRONG_SEASON_RATING &&
      !seasonReasonAdded.has(season)
    ) {
      seasonReasonAdded.add(season);
      evidence.push(`season.${season}`);
      reasons.push({
        type: "Seasonal",
        code: "conditionSeasonalStrong",
        params: { season, rating },
        title: "Strong seasonal suitability",
        description: "Catalogue seasonal rating for the selected season",
      });
    } else if (
      rating <= SEASONAL_WEIGHTS.WEAK_SEASON_RATING &&
      !seasonReasonAdded.has(season)
    ) {
      seasonReasonAdded.add(season);
      evidence.push(`season.${season}`);
      reasons.push({
        type: "Seasonal",
        code: "conditionSeasonalWeak",
        params: { season, rating },
        title: "Weaker seasonal suitability",
        description: "Catalogue seasonal rating for the selected season",
      });
    }

    // Indoor/outdoor balance for hot and cold seasons.
    if (season === "summer") {
      if (dest.indoorPercent >= 70) {
        comfortDelta += SEASONAL_WEIGHTS.INDOOR_COMFORT_BONUS;
        evidence.push("indoorPercent");
        reasons.push({
          type: "Seasonal",
          code: "conditionIndoorHeat",
          title: "Mostly indoor options for midsummer heat",
          description: "Indoor share keeps summer heat manageable",
        });
      } else if (
        dest.indoorPercent <= 30 &&
        dest.weatherDependence === "high"
      ) {
        comfortDelta -= SEASONAL_WEIGHTS.OUTDOOR_EXPOSURE_PENALTY;
        evidence.push("weatherDependence");
        reasons.push({
          type: "Seasonal",
          code: "conditionOutdoorSummer",
          title: "Mostly outdoor in summer heat",
          description: "High weather dependence in summer",
        });
      }
    }
    if (season === "winter") {
      if (dest.indoorPercent >= 70) {
        comfortDelta += SEASONAL_WEIGHTS.INDOOR_COMFORT_BONUS;
        evidence.push("indoorPercent");
        reasons.push({
          type: "Seasonal",
          code: "conditionIndoorWinter",
          title: "Mostly indoor options for winter cold",
          description: "Indoor share keeps winter cold manageable",
        });
      } else if (
        dest.indoorPercent <= 30 &&
        dest.weatherDependence === "high"
      ) {
        comfortDelta -= SEASONAL_WEIGHTS.OUTDOOR_EXPOSURE_PENALTY;
        evidence.push("weatherDependence");
        reasons.push({
          type: "Seasonal",
          code: "conditionOutdoorWinter",
          title: "Outdoor exposure in winter",
          description: "High weather dependence in winter",
        });
      }
    }

    // Rainy season (tsuyu: June–July).
    if (
      (month === 6 || month === 7) &&
      dest.comfort?.rainFriendly !== undefined
    ) {
      const rainFriendly = dest.comfort.rainFriendly;
      evidence.push("comfort.rainFriendly");
      if (rainFriendly <= 3) {
        comfortDelta -= SEASONAL_WEIGHTS.RAIN_EXPOSED_PENALTY;
        reasons.push({
          type: "Seasonal",
          code: "conditionRainExposed",
          title: "Limited rain tolerance in the rainy season",
          description: "Rainy-season exposure may disrupt plans",
        });
      } else if (rainFriendly >= 7) {
        comfortDelta += SEASONAL_WEIGHTS.RAIN_FRIENDLY_BONUS;
        reasons.push({
          type: "Seasonal",
          code: "conditionRainFriendly",
          title: "Rain-friendly in the rainy season",
          description: "Handles rainy-season weather well",
        });
      }
    }
  }

  // Verified ferry operating periods: check every selected date. The ferry
  // dataset (not destination transportOptions) is the authority on ferry
  // access; the port check covers every destination served by a ferry.
  if (!ferryUnavailable) {
    const arrivalPort = findArrivalFerryPort(dest);
    if (arrivalPort) {
      for (const iso of dates) {
        const [year, month, day] = iso.split("-").map(Number);
        const travelDate = new Date(year, month - 1, day, 12, 0, 0);
        if (
          isDestinationFerrySeasonallyUnavailable(arrivalPort.id, travelDate)
        ) {
          ferryUnavailable = true;
          ferryPenalty -= SEASONAL_WEIGHTS.FERRY_SEASONAL_PENALTY;
          evidence.push("ferry.operatingPeriods");
          reasons.push({
            type: "Seasonal",
            code: "conditionFerrySeasonal",
            title: "Seasonal ferry unavailable for the selected date",
            description:
              "Verified ferry operating period excludes the selected date",
          });
          break;
        }
      }
    }
  }

  const scoreDelta = Math.round(
    seasonDelta / dates.length + monthBonus + comfortDelta + ferryPenalty,
  );

  // Eligibility is NOT decided here: the canonical trip-date transport check
  // (isTripDatesTransportEligible) is the single eligibility authority.
  // This service only contributes evidence and scoring — a verified ferry
  // closure penalizes the season score and surfaces a reason, but never a
  // static-transportOptions-based eligibility signal.
  return { scoreDelta, reasons, evidence };
}
