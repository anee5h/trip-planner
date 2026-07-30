import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import { getEffectiveVisitDuration } from "./VisitDurationPolicy";
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
  combinedBudgetRange: [number, number];
  isWeatherMatched: boolean;
  reasonCode: string;
  explanation: {
    en: string;
    ja: string;
  };
}

export function findNearbyCombinations(
  primary: Destination,
  context?: Partial<RecommendationContext>,
  maxCount: number = 5,
  catchmentScope: "nearby" | "wider" = "nearby",
): DestinationCombo[] {
  if (!primary) return [];

  const all = getDestinationList() as Destination[];
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

    let curatedMinutes: number | undefined;
    if (
      isChildOfPrimary ||
      (primaryParentId &&
        place.relationships?.parentDestinationId === primaryParentId)
    ) {
      curatedMinutes = 12;
    }

    const transitEst = estimateLocalTransitMinutes(
      primary,
      place,
      catchmentScope,
      {
        curatedMinutes,
        areaDensity:
          primary.prefecture === "Tokyo" || primary.prefecture === "Osaka"
            ? "dense_urban"
            : "suburban",
      },
    );

    if (!transitEst.usable) {
      continue;
    }

    let distKm = 0.0;
    if (hasCoordinates(primary) && hasCoordinates(place)) {
      distKm = getDistance(
        primary.coordinates.lat,
        primary.coordinates.lng,
        place.coordinates.lat,
        place.coordinates.lng,
      );
    }

    candidates.push({
      place,
      distKm,
      transitMins: transitEst.durationMinutes,
      isChildOfPrimary,
    });
  }

  candidates.sort((a, b) => {
    if (a.isChildOfPrimary && !b.isChildOfPrimary) return -1;
    if (!a.isChildOfPrimary && b.isChildOfPrimary) return 1;
    return a.transitMins - b.transitMins || a.distKm - b.distKm;
  });

  const combos: DestinationCombo[] = [];
  const usedCategorySets = new Set<string>();

  for (const { place: sec, distKm, transitMins } of candidates) {
    if (combos.length >= maxCount) break;

    const primaryCat = primary.categories?.[0] ?? "";
    const secCat = sec.categories?.[0] ?? "";
    const categoryKey = [primaryCat, secCat].sort().join("::");
    if (
      primaryCat &&
      primaryCat === secCat &&
      usedCategorySets.has(categoryKey)
    ) {
      continue;
    }

    const pEff = getEffectiveVisitDuration(primary);
    const sEff = getEffectiveVisitDuration(sec);

    const pVisitMinMins = pEff.minMins;
    const pVisitPrefMins = pEff.prefMins;
    const pVisitMaxMins = pEff.maxMins;

    const sVisitMinMins = sEff.minMins;
    const sVisitPrefMins = sEff.prefMins;
    const sVisitMaxMins = sEff.maxMins;

    const combinedMinMinutes = pVisitMinMins + sVisitMinMins + transitMins;
    const combinedPrefMinutes = pVisitPrefMins + sVisitPrefMins + transitMins;
    const combinedMaxMinutes = pVisitMaxMins + sVisitMaxMins + transitMins;

    // Exclude combination if min or preferred total minutes exceeds 10 hours (600 mins)
    if (combinedMinMinutes > 600 || combinedPrefMinutes > 600) {
      continue;
    }

    const displayMaxMinutes = Math.min(combinedMaxMinutes, 600);

    const combinedVisitMin =
      Math.round(((pVisitMinMins + sVisitMinMins) / 60) * 10) / 10;
    const combinedVisitMax =
      Math.round(((pVisitMaxMins + sVisitMaxMins) / 60) * 10) / 10;

    const combinedTotalMin = Math.round((combinedMinMinutes / 60) * 10) / 10;
    const displayTotalMax = Math.round((displayMaxMinutes / 60) * 10) / 10;

    const budgetMin = (primary.budgetMin ?? 0) + (sec.budgetMin ?? 0);
    const budgetMax = (primary.budgetMax ?? 0) + (sec.budgetMax ?? 0);

    let isWeatherMatched = true;
    if (context?.weather?.actual?.condition === "rainy") {
      const pRain = primary.ratings?.rain ?? 5;
      const sRain = sec.ratings?.rain ?? 5;
      if (pRain < 6 || sRain < 6) {
        isWeatherMatched = false;
      }
    }

    let reasonCode = "COMBO_NEARBY_WALKABLE";
    let explanationEn = "";
    let explanationJa = "";

    if (distKm <= 2.5) {
      reasonCode = "COMBO_NEARBY_WALKABLE";
      explanationEn = `Walkable pair (${Math.round(distKm * 10) / 10} km) — easy multi-stop trip.`;
      explanationJa = `徒歩圏内のスポット (${Math.round(distKm * 10) / 10}km) — ハシゴ観光に最適です。`;
    } else if (primary.prefecture && primary.prefecture === sec.prefecture) {
      reasonCode = "COMBO_SAME_AREA";
      explanationEn = `Nearby in ${primary.prefecture} (~${transitMins} mins travel time).`;
      explanationJa = `${primary.prefecture}内の近隣スポット (移動 約${transitMins}分)。`;
    } else {
      reasonCode = "COMBO_THEMATIC_COMPLEMENT";
      explanationEn = `Complementary nearby experience (~${transitMins} mins travel time).`;
      explanationJa = `合わせて楽しめる近隣体験 (移動 約${transitMins}分)。`;
    }

    usedCategorySets.add(categoryKey);

    combos.push({
      primary,
      secondary: sec,
      interDistanceKm: Math.round(distKm * 10) / 10,
      estimatedInterTravelMinutes: transitMins,
      combinedVisitHours: [combinedVisitMin, combinedVisitMax],
      combinedTotalHours: [combinedTotalMin, displayTotalMax],
      combinedBudgetRange: [budgetMin, budgetMax],
      isWeatherMatched,
      reasonCode,
      explanation: {
        en: explanationEn,
        ja: explanationJa,
      },
    });
  }

  return combos;
}
