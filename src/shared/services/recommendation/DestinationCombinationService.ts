import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";

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
  maxCount: number = 3,
): DestinationCombo[] {
  if (!primary || !primary.coordinates) return [];

  const all = getDestinationList() as Destination[];
  const primaryCoords = primary.coordinates;
  const primaryParentId = primary.relationships?.parentDestinationId;

  const candidates: Array<{
    place: Destination;
    distKm: number;
  }> = [];

  for (const place of all) {
    if (!place.id || place.id === primary.id) continue;
    if (!place.coordinates) continue;

    // Do not pair parent hub with its own child attraction
    if (
      place.id === primaryParentId ||
      place.relationships?.parentDestinationId === primary.id
    ) {
      continue;
    }

    const dist = getDistance(
      primaryCoords.lat,
      primaryCoords.lng,
      place.coordinates.lat,
      place.coordinates.lng,
    );

    // Distance constraint: max 20km for combinations
    if (dist <= 20) {
      candidates.push({ place, distKm: dist });
    }
  }

  // Sort candidate secondary destinations nearest first
  candidates.sort((a, b) => a.distKm - b.distKm);

  const combos: DestinationCombo[] = [];
  const usedCategorySets = new Set<string>();

  for (const { place: sec, distKm } of candidates) {
    if (combos.length >= maxCount) break;

    // Avoid redundant combinations from identical main categories
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

    // Calculate inter-destination travel time (average speed 25 km/h for urban transit/walking)
    const travelMins = Math.max(10, Math.round((distKm / 25) * 60));

    // Calculate combined visit hours
    const pVisitMin =
      primary.recommendedVisitHours?.min ?? primary.totalTripHours ?? 2;
    const pVisitMax =
      primary.recommendedVisitHours?.max ?? primary.totalTripHours ?? 3;
    const sVisitMin = sec.recommendedVisitHours?.min ?? sec.totalTripHours ?? 2;
    const sVisitMax = sec.recommendedVisitHours?.max ?? sec.totalTripHours ?? 3;

    const combinedVisitMin = Math.round((pVisitMin + sVisitMin) * 10) / 10;
    const combinedVisitMax = Math.round((pVisitMax + sVisitMax) * 10) / 10;

    // Inter-travel hours
    const interTravelHours = travelMins / 60;
    const combinedTotalMin =
      Math.round((combinedVisitMin + interTravelHours) * 10) / 10;
    const combinedTotalMax =
      Math.round((combinedVisitMax + interTravelHours) * 10) / 10;

    // Budget range
    const budgetMin = (primary.budgetMin ?? 0) + (sec.budgetMin ?? 0);
    const budgetMax = (primary.budgetMax ?? 0) + (sec.budgetMax ?? 0);

    // Weather compatibility check (rain rating >= 6 is good for rainy days)
    let isWeatherMatched = true;
    if (context?.weather?.actual?.condition === "rainy") {
      const pRain = primary.ratings?.rain ?? 5;
      const sRain = sec.ratings?.rain ?? 5;
      if (pRain < 6 || sRain < 6) {
        isWeatherMatched = false;
      }
    }

    // Determine reason code and explanations
    let reasonCode = "COMBO_NEARBY_WALKABLE";
    let explanationEn = "";
    let explanationJa = "";

    if (distKm <= 2.5) {
      reasonCode = "COMBO_NEARBY_WALKABLE";
      explanationEn = `Walkable pair (${Math.round(distKm * 10) / 10} km) — easy multi-stop trip.`;
      explanationJa = `徒歩圏内のスポット (${Math.round(distKm * 10) / 10}km) — ハシゴ観光に最適です。`;
    } else if (primary.prefecture && primary.prefecture === sec.prefecture) {
      reasonCode = "COMBO_SAME_AREA";
      explanationEn = `Nearby in ${primary.prefecture} (~${travelMins} mins travel time).`;
      explanationJa = `${primary.prefecture}内の近隣スポット (移動 約${travelMins}分)。`;
    } else {
      reasonCode = "COMBO_THEMATIC_COMPLEMENT";
      explanationEn = `Complementary nearby experience (~${travelMins} mins travel time).`;
      explanationJa = `合わせて楽しめる近隣体験 (移動 約${travelMins}分)。`;
    }

    usedCategorySets.add(categoryKey);

    combos.push({
      primary,
      secondary: sec,
      interDistanceKm: Math.round(distKm * 10) / 10,
      estimatedInterTravelMinutes: travelMins,
      combinedVisitHours: [combinedVisitMin, combinedVisitMax],
      combinedTotalHours: [combinedTotalMin, combinedTotalMax],
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
