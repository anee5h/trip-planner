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
  catchmentScope: "nearby" | "wider" = "nearby",
): DestinationCombo[] {
  if (!primary) return [];

  const all = getDestinationList() as Destination[];
  const primaryCoords = primary.coordinates;
  const primaryParentId = primary.relationships?.parentDestinationId;

  const isUrbanHub =
    primary.prefecture === "Tokyo" ||
    primary.prefecture === "Osaka" ||
    primary.prefecture === "Kyoto" ||
    primary.region === "Kanto";

  // Adaptive Catchment Radius limits
  // Dense urban hub: preferred 8-12 km (nearby), hard max 20 km (wider)
  const maxRadiusKm = catchmentScope === "wider" ? 20 : isUrbanHub ? 12 : 15;
  const maxTransitMins = catchmentScope === "wider" ? 45 : 35;

  const candidates: Array<{
    place: Destination;
    distKm: number;
    transitMins: number;
  }> = [];

  for (const place of all) {
    if (!place.id || place.id === primary.id) continue;
    if (place.role === "hub" || place.kind === "city") continue; // Never pick cities or hubs as POI stops

    // Do not pair parent hub with its own child attraction
    if (
      place.id === primaryParentId ||
      place.relationships?.parentDestinationId === primary.id
    ) {
      continue;
    }

    let distKm = 999;
    let transitMins = 999;

    if (primaryCoords && place.coordinates) {
      distKm = getDistance(
        primaryCoords.lat,
        primaryCoords.lng,
        place.coordinates.lat,
        place.coordinates.lng,
      );
      transitMins = Math.max(10, Math.round(distKm * 4 + 5));
    } else if (
      primaryParentId &&
      place.relationships?.parentDestinationId === primaryParentId
    ) {
      distKm = 2.0; // Same city/ward hub area
      transitMins = 15;
    } else if (primary.prefecture && place.prefecture === primary.prefecture) {
      distKm = 6.0; // Same prefecture
      transitMins = 25;
    }

    // TRANSIT OVERRIDES STRAIGHT-LINE DISTANCE
    if (distKm <= maxRadiusKm && transitMins <= maxTransitMins) {
      candidates.push({ place, distKm, transitMins });
    }
  }

  // Sort candidate secondary destinations nearest & shortest transit first
  candidates.sort(
    (a, b) => a.transitMins - b.transitMins || a.distKm - b.distKm,
  );

  const combos: DestinationCombo[] = [];
  const usedCategorySets = new Set<string>();

  for (const { place: sec, distKm, transitMins } of candidates) {
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
    const interTravelHours = transitMins / 60;
    const combinedTotalMin =
      Math.round((combinedVisitMin + interTravelHours) * 10) / 10;
    const combinedTotalMax =
      Math.round((combinedVisitMax + interTravelHours) * 10) / 10;

    // Budget range
    const budgetMin = (primary.budgetMin ?? 0) + (sec.budgetMin ?? 0);
    const budgetMax = (primary.budgetMax ?? 0) + (sec.budgetMax ?? 0);

    // Weather compatibility check
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
