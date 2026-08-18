import type { Destination } from "@/shared/types/destination";
import { getFullPlaces } from "@/shared/services/place/PlaceCatalog";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import { getEffectiveVisitDuration } from "./VisitDurationPolicy";
import { isRatingVerified } from "./RecommendationScorer";
import { hasKnownBudgetRange } from "@/shared/services/budget/BudgetService";
import {
  estimateLocalTransitMinutes,
  hasCoordinates,
} from "./LocalTransitEstimator";

export interface DestinationCombo {
  primary: Destination;
  secondary: Destination;
  interDistanceKm: number;
  estimatedInterTravelMinutes: number;
  combinedVisitHours: [number, number];
  combinedTotalHours: [number, number];
  combinedBudgetRange: [number, number] | null;
  combinedMaxMinutes?: number;
  isWeatherMatched: boolean;
  reasonCode: string;
  explanation: {
    en: string;
    ja: string;
  };
}

function getCandidateTier(
  primary: Destination,
  candidate: Destination,
): number {
  if (primary.relationships?.featuredDestinationIds?.includes(candidate.id)) {
    return 1;
  }
  if (candidate.relationships?.parentDestinationId === primary.id) {
    return 2;
  }
  if (primary.areaId && candidate.areaId === primary.areaId) {
    return 3;
  }
  return 4;
}

export function findNearbyCombinations(
  primary: Destination,
  context?: Partial<RecommendationContext>,
  maxCount: number = 5,
  catchmentScope: "nearby" | "wider" = "nearby",
  catalogue?: Destination[],
): DestinationCombo[] {
  if (!primary) return [];

  const all = (
    catalogue && catalogue.length
      ? catalogue
      : (getFullPlaces() as Destination[])
  ) as Destination[];
  const primaryParentId = primary.relationships?.parentDestinationId;
  const isPrimaryHub = primary.role === "hub" || primary.kind === "city";

  const candidates: Array<{
    place: Destination;
    distKm: number;
    transitMins: number;
    isChildOfPrimary: boolean;
  }> = [];

  for (const place of all) {
    if (!place.id || place.id === primary.id) continue;
    if (place.role === "hub" || place.kind === "city") continue;

    const isChildOfPrimary =
      Boolean(place.relationships?.parentDestinationId) &&
      place.relationships?.parentDestinationId === primary.id;

    if (!isPrimaryHub && place.id === primaryParentId) {
      continue;
    }

    const transitEst = estimateLocalTransitMinutes(
      primary,
      place,
      catchmentScope,
      {
        areaDensity:
          primary.prefecture === "Tokyo" || primary.prefecture === "Osaka"
            ? "dense_urban"
            : "suburban",
      },
    );

    if (!transitEst.usable) {
      continue;
    }

    if (!hasCoordinates(primary) || !hasCoordinates(place)) {
      continue;
    }

    const distKm = getDistance(
      primary.coordinates.lat,
      primary.coordinates.lng,
      place.coordinates.lat,
      place.coordinates.lng,
    );

    candidates.push({
      place,
      distKm,
      transitMins: transitEst.durationMinutes,
      isChildOfPrimary,
    });
  }

  candidates.sort((a, b) => {
    const tierA = getCandidateTier(primary, a.place);
    const tierB = getCandidateTier(primary, b.place);
    if (tierA !== tierB) return tierA - tierB;

    // REC-002/KAI-89: rating tie-breaks must respect the rating-confidence
    // policy. Only VERIFIED vectors (high/medium confidence metadata) may
    // rank by their overall score; unverified (low-confidence/missing)
    // vectors return -1 so they never outrank a verified neighbour on a
    // number that is not a reviewed fact. Ties fall to distance.
    const ratingKey = (p: Destination): number =>
      isRatingVerified(p) ? (p.ratings?.overall ?? -1) : -1;
    const ratingA = ratingKey(a.place);
    const ratingB = ratingKey(b.place);
    if (ratingB !== ratingA) return ratingB - ratingA;

    if (a.distKm !== b.distKm) return a.distKm - b.distKm;
    return a.place.id.localeCompare(b.place.id);
  });

  const combos: DestinationCombo[] = [];
  const usedCategorySets = new Set<string>();

  for (const cand of candidates) {
    if (combos.length >= maxCount) break;

    const secondary = cand.place;
    const cat = secondary.categories?.[0] || secondary.kind || "attraction";
    if (usedCategorySets.has(cat) && combos.length >= 2) {
      continue;
    }

    const primaryDur = isPrimaryHub
      ? { minMins: 0, prefMins: 0, maxMins: 0, source: "default" as const }
      : getEffectiveVisitDuration(primary);
    const secondaryDur = getEffectiveVisitDuration(secondary);

    const visitMinMins = primaryDur.minMins + secondaryDur.minMins;
    const visitPrefMins = primaryDur.prefMins + secondaryDur.prefMins;
    const visitMaxMins = primaryDur.maxMins + secondaryDur.maxMins;

    const totalMinMins = visitMinMins + cand.transitMins;
    const totalPrefMins = visitPrefMins + cand.transitMins;
    const totalMaxMins = visitMaxMins + cand.transitMins;

    if (totalMinMins > 600 || totalPrefMins > 600) {
      continue;
    }

    const clampedTotalMaxMins = Math.min(600, totalMaxMins);

    // KAI-89: unknown budgets (absent) must not contribute a fabricated 0
    // to the combined range — require finite known values on both sides.
    const combinedBudgetRange: [number, number] | null =
      hasKnownBudgetRange(primary) && hasKnownBudgetRange(secondary)
        ? [
            primary.budgetMin + secondary.budgetMin,
            primary.budgetMax + secondary.budgetMax,
          ]
        : null;

    const primaryName = primary.name;
    const secondaryName = secondary.name;

    usedCategorySets.add(cat);

    const isWeatherMatched = context?.destinationWeather?.actual
      ? context.destinationWeather.actual.condition === "clear" ||
        context.destinationWeather.actual.condition === "cloudy"
      : true;

    combos.push({
      primary,
      secondary,
      interDistanceKm: Number(cand.distKm.toFixed(1)),
      estimatedInterTravelMinutes: cand.transitMins,
      combinedVisitHours: [
        Number((visitMinMins / 60).toFixed(1)),
        Number((visitMaxMins / 60).toFixed(1)),
      ],
      combinedTotalHours: [
        Number((totalMinMins / 60).toFixed(1)),
        Number((clampedTotalMaxMins / 60).toFixed(1)),
      ],
      combinedMaxMinutes: totalMaxMins,
      combinedBudgetRange,
      isWeatherMatched,
      reasonCode: cand.isChildOfPrimary
        ? "primary_sub_spot"
        : "nearby_high_synergy",
      explanation: {
        en: cand.isChildOfPrimary
          ? `${secondaryName} is an iconic spot located within ${primaryName}. Combine them for a seamless half-day experience.`
          : `${secondaryName} is just ${cand.transitMins} mins from ${primaryName}. Great to visit together in one day.`,
        ja: cand.isChildOfPrimary
          ? `${secondaryName}は${primaryName}内に位置する主要スポットです。合わせて半日コースで巡るのがおすすめです。`
          : `${secondaryName}は${primaryName}から移動約${cand.transitMins}分。1日で効率よく巡ることができます。`,
      },
    });
  }

  return combos;
}
