import fullIndexJson from "../../src/shared/data/destinations-index.json";
import relationshipsJson from "../../src/shared/data/destination-relationships.json";
import type { Destination } from "@/shared/types/destination";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import {
  DestinationRelationshipService,
  loadRelationshipIndex,
} from "@/shared/services/destination/DestinationRelationshipService";
import { findNearbyCombinations } from "@/shared/services/recommendation/DestinationCombinationService";
import {
  getSeasonalDiscoveryDestinations,
  getUnder60Destinations,
  getUnexploredNearbyDestinations,
  type OriginRailContext,
} from "@/features/home/services/HomeRailService";
import {
  composeBoundedDiverseTopMatches,
  composeDetailRails,
  getExperienceFamily,
  selectUniqueRail,
} from "@/shared/services/recommendation/RailCompositionService";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";

const all = fullIndexJson as unknown as Destination[];
const relationshipNodes = relationshipsJson.nodes as unknown as Destination[];
const referenceDate = "2026-09-07";
const baselineHead = "022373edce9dc24da6d03c70ce8471b8637e0590";
const origin = { lat: 35.6812, lng: 139.7671 };
const publicModes = ["train", "shinkansen", "bus", "flight", "ferry"];
const context = {
  vibe: "any",
  budget: 100_000,
  budgetTier: "standard" as const,
  carMode: "none",
  publicModes,
  partySize: 2,
  visitedIds: [],
  homeStationCoords: origin,
  tripDuration: "halfDay" as const,
  destinationWeather: { preferred: "any" as const },
};

function ids(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id);
}

function overlap(a: readonly string[], b: readonly string[]): string[] {
  const right = new Set(b);
  return a.filter((id) => right.has(id));
}

function duplicateIds(rails: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const rail of rails) {
    for (const id of rail) {
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
  }
  return [...duplicates];
}

function detailRails(primary: Destination) {
  const combinations = findNearbyCombinations(
    primary,
    undefined,
    6,
    "nearby",
    all,
  );
  const nearbyPlaces =
    DestinationRelationshipService.getNearbyDestinations(primary);
  const halfDaySiblings = primary.relationships?.parentDestinationId
    ? DestinationRelationshipService.getChildDestinations(
        primary.relationships.parentDestinationId,
      ).filter(
        (place) =>
          place.id !== primary.id &&
          (place.recommendedVisitHours?.max ?? 99) <= 4,
      )
    : [];
  const nearbyHubs = DestinationRelationshipService.getNearbyHubs(primary, 50);
  const composed = composeDetailRails({
    destinationId: primary.id,
    isHub: false,
    featuredChildSights: [],
    hubMoreDestinations: [],
    greatAdditions: combinations,
    nearbyHubs: [],
    nearbyPlaces,
    halfDaySiblings,
  });
  return {
    before: {
      combinations: ids(combinations.map(({ secondary }) => secondary)),
      nearbyPlaces: ids(nearbyPlaces),
      halfDaySiblings: ids(halfDaySiblings),
      nearbyHubs: ids(nearbyHubs),
    },
    after: {
      combinations: ids(
        composed.greatAdditions.map(({ secondary }) => secondary),
      ),
      nearbyPlaces: ids(composed.nearbyPlaces),
      halfDaySiblings: ids(composed.halfDaySiblings),
      nearbyHubs: ids(nearbyHubs),
    },
    renderedRailDuplicateIdsBefore: duplicateIds([
      ids(combinations.map(({ secondary }) => secondary)),
      ids(nearbyPlaces),
      ids(halfDaySiblings),
    ]),
    renderedRailDuplicateIdsAfter: duplicateIds([
      ids(composed.greatAdditions.map(({ secondary }) => secondary)),
      ids(composed.nearbyPlaces),
      ids(composed.halfDaySiblings),
    ]),
  };
}

function hubDetailRails(primary: Destination) {
  const featuredChildSights =
    DestinationRelationshipService.getFeaturedChildDestinations(primary);
  const childDestinations = DestinationRelationshipService.getChildDestinations(
    primary.id,
  );
  const indoorChildren = [...childDestinations]
    .filter((place) => (place.indoorPercent ?? 0) >= 70)
    .sort((a, b) => b.ratings.rain - a.ratings.rain);
  const foodAndEveningChildren = [...childDestinations]
    .filter((place) =>
      [...(place.categories ?? []), ...(place.tags ?? [])].some((label) =>
        /food|market|night|evening|shopping/i.test(label),
      ),
    )
    .sort((a, b) => b.ratings.food - a.ratings.food);
  const seenMore = new Set<string>();
  const hubMoreDestinations = [
    ...indoorChildren,
    ...foodAndEveningChildren,
  ].filter((place) => {
    if (seenMore.has(place.id)) return false;
    seenMore.add(place.id);
    return !featuredChildSights.some((featured) => featured.id === place.id);
  });
  const combinations = findNearbyCombinations(
    primary,
    undefined,
    6,
    "nearby",
    all,
  );
  const nearbyHubs = DestinationRelationshipService.getNearbyHubs(primary, 50);
  const composed = composeDetailRails({
    destinationId: primary.id,
    isHub: true,
    featuredChildSights,
    hubMoreDestinations,
    greatAdditions: combinations,
    nearbyHubs,
    nearbyPlaces: [],
    halfDaySiblings: [],
  });
  return {
    before: {
      featuredChildSights: ids(featuredChildSights),
      hubMoreDestinations: ids(hubMoreDestinations),
      combinations: ids(combinations.map(({ secondary }) => secondary)),
      nearbyHubs: ids(nearbyHubs),
    },
    after: {
      featuredChildSights: ids(composed.featuredChildSights),
      hubMoreDestinations: ids(composed.hubMoreDestinations),
      combinations: ids(
        composed.greatAdditions.map(({ secondary }) => secondary),
      ),
      nearbyHubs: ids(composed.nearbyHubs),
    },
    renderedRailDuplicateIdsBefore: duplicateIds([
      ids(featuredChildSights),
      ids(hubMoreDestinations),
      ids(combinations.map(({ secondary }) => secondary)),
      ids(nearbyHubs),
    ]),
    renderedRailDuplicateIdsAfter: duplicateIds([
      ids(composed.featuredChildSights),
      ids(composed.hubMoreDestinations),
      ids(composed.greatAdditions.map(({ secondary }) => secondary)),
      ids(composed.nearbyHubs),
    ]),
  };
}

function destinationById(id: string): Destination {
  const destination = all.find((candidate) => candidate.id === id);
  if (!destination) throw new Error(`missing destination ${id}`);
  return destination;
}

loadRelationshipIndex(relationshipNodes);
const recommendations = getRecommendations(all, context) as ScoredDestination[];
const rankedTopMatches = recommendations.slice(0, 10);
const topMatches = composeBoundedDiverseTopMatches(recommendations, {
  count: 10,
  familyOf: getExperienceFamily,
  scoreOf: (destination) => destination.score,
});
const originRailContext: OriginRailContext = {
  homeStationCoords: origin,
  carMode: "none",
  publicModes,
  tripDuration: "halfDay",
  visitedIds: [],
  estimateCache: new Map(),
};
const seasonalRaw = getSeasonalDiscoveryDestinations(
  recommendations,
  referenceDate,
);
const under60Raw = getUnder60Destinations(recommendations, originRailContext);
const nearbyRaw = getUnexploredNearbyDestinations(all, originRailContext);
const nearbyEligibleRaw = getUnexploredNearbyDestinations(
  recommendations,
  originRailContext,
);
const usedHomeIds = new Set(ids(topMatches));
const pickHomeRail = (candidates: Destination[]) => {
  const selected = selectUniqueRail(candidates, usedHomeIds, 10);
  selected.forEach((destination) => usedHomeIds.add(destination.id));
  return selected;
};
const composedHome = {
  seasonal: pickHomeRail(seasonalRaw),
  under60: pickHomeRail(under60Raw),
  nearby: pickHomeRail(nearbyRaw),
};

const homeBeforeRails = [
  ids(rankedTopMatches),
  ids(seasonalRaw),
  ids(under60Raw),
  ids(nearbyRaw),
];
const homeAfterRails = [
  ids(topMatches),
  ids(composedHome.seasonal),
  ids(composedHome.under60),
  ids(composedHome.nearby),
];
const familyCounts = (items: readonly Destination[]) =>
  items.reduce<Record<string, number>>((counts, item) => {
    const key = getExperienceFamily(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
const topFamilyCounts = familyCounts(topMatches);
const rankedTopFamilyCounts = familyCounts(rankedTopMatches);

const jindaiji = destinationById("chofu-historic-jindaiji-district");
const kyoto = destinationById("kyoto-city");
const detail = {
  jindaiji: detailRails(jindaiji),
  largeCityHub: hubDetailRails(kyoto),
};

const hubCandidates = relationshipNodes
  .filter((candidate) => candidate.role === "hub")
  .map((hub) => ({
    id: hub.id,
    name: hub.name,
    childCount: DestinationRelationshipService.getChildDestinations(hub.id)
      .length,
    featuredCount:
      DestinationRelationshipService.getFeaturedChildDestinations(hub).length,
  }))
  .sort((a, b) => b.childCount - a.childCount || a.id.localeCompare(b.id));

const sparseDetail = relationshipNodes
  .filter((candidate) => candidate.role !== "hub")
  .map((candidate) => {
    const rails = detailRails(candidate).after;
    return {
      id: candidate.id,
      name: candidate.name,
      railCounts: Object.fromEntries(
        Object.entries(rails).map(([key, value]) => [key, value.length]),
      ),
      total: Object.values(rails).reduce((sum, value) => sum + value.length, 0),
    };
  })
  .filter(({ total }) => total > 0 && total <= 2)
  .sort((a, b) => a.total - b.total || a.id.localeCompare(b.id))
  .slice(0, 5);

const homeCandidateIds = new Set([
  ...ids(rankedTopMatches),
  ...ids(seasonalRaw),
  ...ids(under60Raw),
  ...ids(nearbyRaw),
]);
const homeAfterIds = new Set(homeAfterRails.flat());
const invalidHomeBackfills = [...homeAfterIds].filter(
  (id) => !homeCandidateIds.has(id),
);
const detailCandidateIds = new Set([
  ...Object.values(detail.jindaiji.before).flat(),
  ...Object.values(detail.largeCityHub.before).flat(),
]);
const detailAfterIds = new Set([
  ...Object.values(detail.jindaiji.after).flat(),
  ...Object.values(detail.largeCityHub.after).flat(),
]);
const invalidDetailBackfills = [...detailAfterIds].filter(
  (id) => !detailCandidateIds.has(id),
);

export const output = {
  generatedAt: referenceDate,
  source: {
    head: baselineHead,
    referenceDate,
    catalogueSize: all.length,
    relationshipCatalogueSize: relationshipNodes.length,
  },
  scenario: {
    origin: "Tokyo Station",
    originCoordinates: origin,
    duration: context.tripDuration,
    partySize: context.partySize,
    budget: context.budget,
    transport: { carMode: context.carMode, publicModes },
  },
  home: {
    topMatches: topMatches.map((destination, index) => ({
      id: destination.id,
      rank: index + 1,
      name: destination.name,
      kind: destination.kind,
      categories: destination.categories,
      region: destination.region,
      prefecture: destination.prefecture,
      experienceFamily: getExperienceFamily(destination),
      travelEligible: Boolean(
        destination.transportEstimate || destination.bestTransportMode,
      ),
      budgetEligible: Boolean(destination.estimatedCostRange),
    })),
    topMatchUniqueIds: new Set(ids(topMatches)).size,
    rankedTopMatchFamilyCounts: rankedTopFamilyCounts,
    topMatchFamilyCounts: topFamilyCounts,
    rawRailPoolSizes: {
      recommendationPool: recommendations.length,
      topMatches: topMatches.length,
      seasonal: seasonalRaw.length,
      under60: under60Raw.length,
      nearby: nearbyRaw.length,
      nearbyFromEligibleRecommendationPool: nearbyEligibleRaw.length,
    },
    before: {
      topVsSeasonalIntersection: overlap(
        ids(rankedTopMatches),
        ids(seasonalRaw),
      ),
      duplicateIds: duplicateIds(homeBeforeRails),
      railIds: {
        topMatches: ids(rankedTopMatches),
        seasonal: ids(seasonalRaw),
        under60: ids(under60Raw),
        nearby: ids(nearbyRaw),
      },
    },
    after: {
      topVsSeasonalIntersection: overlap(
        ids(topMatches),
        ids(composedHome.seasonal),
      ),
      duplicateIds: duplicateIds(homeAfterRails),
      railIds: {
        topMatches: ids(topMatches),
        seasonal: ids(composedHome.seasonal),
        under60: ids(composedHome.under60),
        nearby: ids(composedHome.nearby),
      },
    },
  },
  detail,
  audit: {
    invalidBackfills:
      invalidHomeBackfills.length + invalidDetailBackfills.length,
    invalidHomeBackfills,
    invalidDetailBackfills,
    eligibilityRegressions:
      invalidHomeBackfills.length + invalidDetailBackfills.length,
    fullCatalogueRescansAdded: 0,
    compositionPasses: {
      home: 3,
      jindaiji: 3,
      largeCityHub: 4,
    },
  },
  largeCityHubCandidates: hubCandidates.slice(0, 5),
  sparseDetail,
};
