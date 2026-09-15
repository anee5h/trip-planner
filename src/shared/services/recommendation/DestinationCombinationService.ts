import type { Destination } from "@/shared/types/destination";
import { getFullPlaces } from "@/shared/services/place/PlaceCatalog";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import { getEffectiveVisitDuration } from "./VisitDurationPolicy";
import { isRatingVerified } from "./RecommendationScorer";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
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

function compareCandidateRelevance(
  primary: Destination,
  a: { place: Destination; distKm: number },
  b: { place: Destination; distKm: number },
): number {
  const tierA = getCandidateTier(primary, a.place);
  const tierB = getCandidateTier(primary, b.place);
  if (tierA !== tierB) return tierA - tierB;

  // REC-002/KAI-89: rating tie-breaks must respect the rating-confidence
  // policy. Only VERIFIED vectors (high/medium confidence metadata) may rank
  // by their overall score. Ties fall to distance.
  const ratingKey = (place: Destination): number =>
    isRatingVerified(place) ? (place.ratings?.overall ?? -1) : -1;
  const ratingA = ratingKey(a.place);
  const ratingB = ratingKey(b.place);
  if (ratingB !== ratingA) return ratingB - ratingA;

  if (a.distKm !== b.distKm) return a.distKm - b.distKm;
  return a.place.id.localeCompare(b.place.id);
}

function getCombinationBudgetRange(
  primary: Destination,
  secondary: Destination,
  context?: Partial<RecommendationContext>,
): [number, number] | null {
  const mode = context?.publicModes?.[0] ?? "train";
  const partySize = context?.partySize ?? 2;
  const estimates = [primary, secondary].map((dest) =>
    calculateTripEstimate({
      dest,
      mode,
      partySize,
      includeOriginTravel: false,
      duration: "fullDay",
    }),
  );
  const total: [number, number] = [0, 0];
  let meals: [number, number] | undefined;
  for (const estimate of estimates) {
    for (const item of estimate.components) {
      if (item.cost.kind !== "bounded") return null;
      if (item.evidence.scope === "meals") {
        meals ??= [item.cost.min, item.cost.max];
      } else if (
        item.evidence.scope === "local_transport" ||
        item.evidence.scope === "admission"
      ) {
        total[0] += item.cost.min;
        total[1] += item.cost.max;
      }
    }
  }
  if (meals) {
    total[0] += meals[0];
    total[1] += meals[1];
  }
  return total;
}

function isHubLevel(destination: Destination): boolean {
  return destination.role === "hub" || destination.kind === "city";
}

function getParentChainIds(
  destination: Destination,
  byId: ReadonlyMap<string, Destination>,
): Set<string> {
  const ancestors = new Set<string>();
  const visited = new Set<string>([destination.id]);
  let current = destination;

  while (current.relationships?.parentDestinationId) {
    const parentId = current.relationships.parentDestinationId;
    if (visited.has(parentId)) break;
    visited.add(parentId);
    ancestors.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    current = parent;
  }

  return ancestors;
}

function isAncestorOrDescendant(
  primary: Destination,
  candidate: Destination,
  byId: ReadonlyMap<string, Destination>,
): boolean {
  return (
    getParentChainIds(primary, byId).has(candidate.id) ||
    getParentChainIds(candidate, byId).has(primary.id)
  );
}

function isExplicitlyContained(
  container: Destination,
  candidate: Destination,
): boolean {
  return Boolean(
    container.relationships?.featuredDestinationIds?.includes(candidate.id),
  );
}

function isContainedSameTrip(
  primary: Destination,
  candidate: Destination,
): boolean {
  if (
    isExplicitlyContained(primary, candidate) ||
    isExplicitlyContained(candidate, primary)
  ) {
    return true;
  }

  // areaId is the catalogue's explicit intra-city grouping. Two records in the
  // same group are already one local trip, not alternatives to each other.
  if (primary.areaId && primary.areaId === candidate.areaId) return true;

  // Multiple hub records for one municipality represent the same destination
  // context even when the parent links are incomplete.
  return Boolean(
    isHubLevel(primary) &&
    isHubLevel(candidate) &&
    primary.municipalityId &&
    primary.municipalityId === candidate.municipalityId,
  );
}

function isEligibleWithIndex(
  primary: Destination,
  candidate: Destination,
  byId: ReadonlyMap<string, Destination>,
): boolean {
  // 1. Alternatives stay at the same entity level: hub→hub or POI→POI.
  if (isHubLevel(primary) !== isHubLevel(candidate)) return false;
  // 2. The selected entity is never its own alternative.
  if (primary.id === candidate.id) return false;
  // 3. Direct parent/child relationships are one trip, not alternatives.
  if (
    candidate.relationships?.parentDestinationId === primary.id ||
    primary.relationships?.parentDestinationId === candidate.id
  ) {
    return false;
  }
  // 4. Reject deeper ancestor/descendant relationships as well.
  if (isAncestorOrDescendant(primary, candidate, byId)) return false;
  // 5. Use explicit catalogue containment before any distance/cost ranking.
  if (isContainedSameTrip(primary, candidate)) return false;

  return true;
}

/**
 * KAI-288: semantic eligibility for the lower-cost alternatives rail.
 *
 * This deliberately runs before transit distance or cost ranking. It is kept
 * separate from findNearbyCombinations because detail recommendations still
 * need their existing POI-combination semantics.
 */
export function isEligibleLowerCostAlternative(
  primary: Destination,
  candidate: Destination,
  catalogue: readonly Destination[],
): boolean {
  return isEligibleWithIndex(
    primary,
    candidate,
    new Map(catalogue.map((place) => [place.id, place])),
  );
}

/**
 * Returns semantically valid lower-cost candidates in the existing relevance
 * order. The caller remains responsible for the canonical cost comparison.
 */
export function findLowerCostAlternativeCandidates(
  primary: Destination,
  maxCount: number = 5,
  catalogue?: Destination[],
): Destination[] {
  if (!primary || maxCount <= 0) return [];

  const all = (
    catalogue && catalogue.length
      ? catalogue
      : (getFullPlaces() as Destination[])
  ) as Destination[];
  const byId = new Map(all.map((place) => [place.id, place]));
  const candidates: Array<{
    place: Destination;
    distKm: number;
    transitMins: number;
  }> = [];

  for (const place of all) {
    if (!isEligibleWithIndex(primary, place, byId)) continue;

    const transitEst = estimateLocalTransitMinutes(primary, place, "nearby", {
      areaDensity:
        primary.prefecture === "Tokyo" || primary.prefecture === "Osaka"
          ? "dense_urban"
          : "suburban",
    });

    if (
      !transitEst.usable ||
      !hasCoordinates(primary) ||
      !hasCoordinates(place)
    ) {
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
    });
  }

  candidates.sort((a, b) => compareCandidateRelevance(primary, a, b));

  return candidates.slice(0, maxCount).map(({ place }) => place);
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

  candidates.sort((a, b) => compareCandidateRelevance(primary, a, b));

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

    const combinedBudgetRange = getCombinationBudgetRange(
      primary,
      secondary,
      context,
    );

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
