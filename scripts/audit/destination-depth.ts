import type { Destination } from "../../src/shared/types/destination.js";
import { JAPAN_PREFECTURES } from "../config/prefectures.js";

export const DESTINATION_DEPTH_REPORT_VERSION = "1.1.0";

export const DESTINATION_DEPTH_WEIGHTS = {
  geographicDistribution: 0.25,
  municipalityCoverage: 0.2,
  experienceDiversity: 0.2,
  tripDurationUsefulness: 0.15,
  seasonalDiversity: 0.1,
  transportDiversity: 0.1,
} as const;

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const TRANSPORT_MODES = [
  "train",
  "bus",
  "shinkansen",
  "car",
  "ferry",
  "flight",
] as const;

/** The application's current convention intentionally groups Mie under Kansai. */
export const PREFECTURE_REGIONS: Record<string, string> = {
  Hokkaido: "Hokkaido",
  Aomori: "Tohoku",
  Iwate: "Tohoku",
  Miyagi: "Tohoku",
  Akita: "Tohoku",
  Yamagata: "Tohoku",
  Fukushima: "Tohoku",
  Ibaraki: "Kanto",
  Tochigi: "Kanto",
  Gunma: "Kanto",
  Saitama: "Kanto",
  Chiba: "Kanto",
  Tokyo: "Kanto",
  Kanagawa: "Kanto",
  Niigata: "Chubu",
  Toyama: "Chubu",
  Ishikawa: "Chubu",
  Fukui: "Chubu",
  Yamanashi: "Chubu",
  Nagano: "Chubu",
  Gifu: "Chubu",
  Shizuoka: "Chubu",
  Aichi: "Chubu",
  Mie: "Kansai",
  Shiga: "Kansai",
  Kyoto: "Kansai",
  Osaka: "Kansai",
  Hyogo: "Kansai",
  Nara: "Kansai",
  Wakayama: "Kansai",
  Tottori: "Chugoku",
  Shimane: "Chugoku",
  Okayama: "Chugoku",
  Hiroshima: "Chugoku",
  Yamaguchi: "Chugoku",
  Tokushima: "Shikoku",
  Kagawa: "Shikoku",
  Ehime: "Shikoku",
  Kochi: "Shikoku",
  Fukuoka: "Kyushu",
  Saga: "Kyushu",
  Nagasaki: "Kyushu",
  Kumamoto: "Kyushu",
  Oita: "Kyushu",
  Miyazaki: "Kyushu",
  Kagoshima: "Kyushu",
  Okinawa: "Okinawa",
};

const ARCHETYPE_RULES = {
  cityHub: {
    categories: ["city", "city hub", "travel hub", "urban", "special ward"],
    kinds: ["city", "ward", "district"],
  },
  templeShrine: {
    categories: ["temple", "shrine", "shrines"],
    kinds: ["temple", "shrine"],
  },
  castle: {
    categories: ["castle", "fortress", "palace"],
    kinds: ["castle", "palace"],
  },
  museumArt: {
    categories: ["museum", "art", "indoor", "science"],
    kinds: ["museum", "memorial", "monument", "cemetery"],
  },
  natureScenery: {
    categories: [
      "nature",
      "nature & parks",
      "nature & outdoors",
      "park",
      "parks",
      "garden",
      "gardens",
      "viewpoint",
      "views",
      "lake",
      "waterfall",
      "flowers",
      "flower",
      "geology",
    ],
    kinds: [
      "nature",
      "natural",
      "park",
      "garden",
      "lake",
      "waterfall",
      "viewpoint",
      "cliff",
      "rock_formation",
      "cave",
      "gorge",
    ],
  },
  mountainHiking: {
    categories: ["hiking", "mountain", "outdoors", "adventure", "trail"],
    kinds: ["mountain"],
  },
  coastBeach: {
    categories: ["coast", "coastal", "beach", "waterfront", "sea", "ocean"],
    kinds: ["beach"],
  },
  island: {
    categories: ["island", "islands"],
    kinds: ["island"],
  },
  onsen: {
    categories: ["onsen", "onsen & wellness", "hot spring", "relaxation"],
    kinds: ["onsen"],
  },
  foodMarket: {
    categories: ["food", "market"],
    kinds: ["market"],
  },
  shoppingEntertainment: {
    categories: ["shopping", "nightlife", "entertainment"],
    kinds: ["shopping", "street"],
  },
  themeFamily: {
    categories: ["theme park", "family", "aquarium", "leisure"],
    kinds: ["theme_park", "amusement_park", "zoo", "aquarium", "cruise"],
  },
  historicDistrict: {
    categories: [
      "historic",
      "district",
      "history",
      "culture",
      "world heritage",
      "unesco",
    ],
    kinds: ["historic", "historic_town", "village", "town"],
  },
  towerLandmark: {
    categories: ["tower", "observation deck", "landmark", "architecture"],
    kinds: ["tower"],
  },
} as const;

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPE_RULES);
type Season = (typeof SEASONS)[number];

export interface DepthDimension {
  score: number | null;
  weight: number;
  availableSampleCount: number;
  unavailableReason?: string;
  details: Record<string, number | string | null>;
}

export interface DestinationDepthScoreInput {
  total: number;
  largestMunicipalityCount: number;
  municipalityBucketCount: number;
  archetypesCovered: number;
  halfDayCandidates: number;
  dayTripCandidates: number;
  seasonsCovered: number | null;
  transportModeCount: number;
}

export interface DestinationDepthScoreResult {
  components: Partial<Record<keyof typeof DESTINATION_DEPTH_WEIGHTS, number>>;
  unavailableComponents: Array<keyof typeof DESTINATION_DEPTH_WEIGHTS>;
  depthScore: number | null;
  depthScoreCoveragePct: number;
}

/**
 * Reproduces the 2026-08-21 source-audit scoring formulas.
 *
 * Keep this pure and independently testable: the audit is a methodology
 * contract, so changing a denominator or threshold changes historical scores.
 */
export function scoreDestinationDepth(
  input: DestinationDepthScoreInput,
): DestinationDepthScoreResult {
  const expectedMunicipalities =
    input.total < 10 ? 4 : input.total < 30 ? 8 : 15;
  const components: Partial<
    Record<keyof typeof DESTINATION_DEPTH_WEIGHTS, number>
  > = {
    geographicDistribution:
      input.total > 0
        ? round((1 - input.largestMunicipalityCount / input.total) * 100)
        : 0,
    municipalityCoverage: round(
      Math.min(
        100,
        (input.municipalityBucketCount / expectedMunicipalities) * 100,
      ),
    ),
    experienceDiversity: round(
      (input.archetypesCovered / ARCHETYPE_KEYS.length) * 100,
    ),
    tripDurationUsefulness:
      input.total > 0
        ? round(
            Math.min(
              100,
              ((input.dayTripCandidates + input.halfDayCandidates) /
                Math.max(6, input.total * 0.5)) *
                100,
            ),
          )
        : 0,
    transportDiversity: round(
      (input.transportModeCount / TRANSPORT_MODES.length) * 100,
    ),
  };

  const unavailableComponents: Array<keyof typeof DESTINATION_DEPTH_WEIGHTS> =
    [];
  if (input.seasonsCovered === null) {
    unavailableComponents.push("seasonalDiversity");
  } else {
    components.seasonalDiversity = round(
      (input.seasonsCovered / SEASONS.length) * 100,
    );
  }

  const availableKeys = Object.keys(DESTINATION_DEPTH_WEIGHTS).filter(
    (key) => components[key as keyof typeof DESTINATION_DEPTH_WEIGHTS] != null,
  ) as Array<keyof typeof DESTINATION_DEPTH_WEIGHTS>;
  const availableWeight = availableKeys.reduce(
    (total, key) => total + DESTINATION_DEPTH_WEIGHTS[key],
    0,
  );
  const weightedScore = availableKeys.reduce(
    (total, key) =>
      total + (components[key] ?? 0) * DESTINATION_DEPTH_WEIGHTS[key],
    0,
  );

  return {
    components,
    unavailableComponents,
    depthScore:
      availableWeight > 0 ? round(weightedScore / availableWeight) : null,
    depthScoreCoveragePct: round(availableWeight * 100),
  };
}

export interface MunicipalitySummary {
  municipalityId: string;
  count: number;
  sharePct: number;
}

export interface ScopeDepthMetrics {
  total: number;
  distinctMunicipalityCount: number;
  assignedMunicipalityCount: number;
  unassignedMunicipalityCount: number;
  topMunicipalities: MunicipalitySummary[];
  topMunicipalitySharePct: number | null;
  roles: Record<string, number>;
  placeTypes: Record<string, number>;
  kinds: Record<string, number>;
  archetypesCovered: string[];
  unclassifiedExperienceRecords: number;
  sampleCounts: {
    coordinates: number;
    municipality: number;
    experience: number;
    duration: number;
    completeSeason: number;
    transport: number;
  };
  dimensions: Record<keyof typeof DESTINATION_DEPTH_WEIGHTS, DepthDimension>;
  depthScore: number | null;
  depthScoreCoveragePct: number;
}

export interface PrefectureDepthMetrics extends ScopeDepthMetrics {
  prefecture: string;
  region: string;
  observedRegions: string[];
  regionMismatchCount: number;
  pctOfCatalog: number;
  concentrationFlag: "" | "moderate(40-60%)" | "strong(>=60%)";
  halfDayCandidates: number;
  dayTripCandidates: number;
  fullDayAnchors: number;
  durationUnknown: number;
  transportModes: string[];
  transitAccessibleSharePct: number | null;
  seasonalCoverage: Record<Season, number> | null;
  seasonsCovered: number | null;
  band: string;
}

export interface ParentGroup {
  parentId: string;
  parentName: string;
  prefecture: string;
  municipalityId: string | null;
  childCount: number;
  childIds: string[];
  distinctChildMunicipalities: number;
  sameMunicipalityChildSharePct: number | null;
}

export interface FakeDepthReport {
  singleComplexParentClusters: Array<{
    parentId: string;
    parentName: string;
    prefecture: string;
    municipalityId: string | null;
    childrenCount: number;
    maxPairDistanceKm: number;
    childIds: string[];
  }>;
  microClustersWithin250m: Array<{
    prefecture: string;
    municipalityId: string;
    size: number;
    memberIds: string[];
  }>;
  duplicateNameGroups: Array<{ normalizedName: string; ids: string[] }>;
  warnings: Array<{
    type: "single-complex-parent" | "micro-cluster" | "duplicate-name";
    ids: string[];
    message: string;
  }>;
}

export interface DestinationDepthReport {
  reportVersion: string;
  generatedFrom: string;
  caveats: string[];
  catalogSize: number;
  prefectureCount: number;
  regionConvention: string;
  national: ScopeDepthMetrics;
  regionRollup: Array<{
    region: string;
    destinations: number;
    sharePct: number;
    expectedPrefectures: number;
    prefecturesWithRecords: number;
    prefecturesWithoutRecords: string[];
    averageDepthScore: number | null;
  }>;
  prefectures: PrefectureDepthMetrics[];
  relationshipSummary: {
    parentCount: number;
    childCount: number;
    childrenWithParent: number;
    largestParentSharePct: number | null;
    parentGroups: ParentGroup[];
    unresolvedParentIds: string[];
    hubCount: number;
    shellHubs: Array<{
      id: string;
      name: string;
      prefecture: string;
      municipalityId: string | null;
      childCount: number;
      featuredCount: number;
    }>;
    nearShellHubs: Array<{
      id: string;
      name: string;
      prefecture: string;
      municipalityId: string | null;
      childCount: number;
      featuredCount: number;
    }>;
  };
  fakeDepth: FakeDepthReport;
}

function round(value: number, places = 1): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function municipalityIdOf(destination: Destination): string | null {
  const value = destination.municipalityId?.trim();
  return value ? value : null;
}

function coordinatesKnown(destination: Destination): boolean {
  return Boolean(
    destination.coordinates &&
    finite(destination.coordinates.lat) &&
    finite(destination.coordinates.lng),
  );
}

function classifyExperience(destination: Destination): string[] {
  const categories = (destination.categories ?? []).map(normalized);
  const kind = normalized(destination.kind ?? "");
  const result: string[] = [];

  for (const key of ARCHETYPE_KEYS) {
    const rule = ARCHETYPE_RULES[key as keyof typeof ARCHETYPE_RULES];
    const categoryMatch = rule.categories.some((category) =>
      categories.includes(normalized(category)),
    );
    const kindMatch = rule.kinds.some(
      (candidate) => kind === normalized(candidate),
    );
    if (categoryMatch || kindMatch) result.push(key);
  }
  return result;
}

function totalTripHoursOf(destination: Destination): number | null {
  return finite(destination.totalTripHours) && destination.totalTripHours > 0
    ? destination.totalTripHours
    : null;
}

interface TripDurationStats {
  known: number[];
  halfDayCandidates: number;
  dayTripCandidates: number;
  fullDayAnchors: number;
}

function tripDurationStats(
  destinations: readonly Destination[],
): TripDurationStats {
  const known = destinations
    .map(totalTripHoursOf)
    .filter((value): value is number => value !== null);
  return {
    known,
    halfDayCandidates: known.filter((hours) => hours <= 4).length,
    dayTripCandidates: known.filter((hours) => hours > 4 && hours <= 8).length,
    fullDayAnchors: known.filter((hours) => hours >= 6).length,
  };
}

function completeSeason(destination: Destination): boolean {
  return Boolean(
    destination.season &&
    SEASONS.every((season) => finite(destination.season?.[season])),
  );
}

function transportModes(destination: Destination): string[] {
  return TRANSPORT_MODES.filter((mode) =>
    finite(destination.transportOptions?.[mode]),
  );
}

function sortedCounts(values: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function scopeMetrics(destinations: readonly Destination[]): ScopeDepthMetrics {
  const municipalityCounts = new Map<string, number>();
  for (const destination of destinations) {
    const municipalityId = municipalityIdOf(destination) ?? "(unassigned)";
    municipalityCounts.set(
      municipalityId,
      (municipalityCounts.get(municipalityId) ?? 0) + 1,
    );
  }

  const scoringMunicipalityRows = [...municipalityCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const municipalityRows = scoringMunicipalityRows.filter(
    ([municipalityId]) => municipalityId !== "(unassigned)",
  );
  const topMunicipalityCount = scoringMunicipalityRows[0]?.[1] ?? 0;
  const assignedMunicipalityCount = municipalityRows.reduce(
    (total, [, count]) => total + count,
    0,
  );
  const topMunicipalities = municipalityRows
    .slice(0, 10)
    .map(([municipalityId, count]) => ({
      municipalityId,
      count,
      sharePct: round((count / Math.max(1, destinations.length)) * 100),
    }));

  const experienceByDestination = destinations.map(classifyExperience);
  const recognizedExperience = experienceByDestination.filter(
    (items) => items.length > 0,
  );
  const archetypesCovered = [...new Set(recognizedExperience.flat())].sort();

  const durationStats = tripDurationStats(destinations);
  const durationRows = durationStats.known;
  const { halfDayCandidates, dayTripCandidates, fullDayAnchors } =
    durationStats;

  const seasonalRows = destinations.filter(completeSeason);
  const seasonalCoverage = Object.fromEntries(
    SEASONS.map((season) => [
      season,
      seasonalRows.length
        ? round(
            (seasonalRows.filter(
              (destination) => (destination.season?.[season] ?? 0) >= 7,
            ).length /
              seasonalRows.length) *
              100,
          )
        : 0,
    ]),
  ) as Record<Season, number>;
  const seasonsCovered = seasonalRows.length
    ? SEASONS.filter((season) => seasonalCoverage[season] >= 30).length
    : null;

  const transportRows = destinations
    .map(transportModes)
    .filter((modes) => modes.length > 0);
  const modeSet = new Set(transportRows.flat());

  const scoreResult = scoreDestinationDepth({
    total: destinations.length,
    largestMunicipalityCount: topMunicipalityCount,
    municipalityBucketCount: scoringMunicipalityRows.length,
    archetypesCovered: archetypesCovered.length,
    halfDayCandidates,
    dayTripCandidates,
    seasonsCovered,
    transportModeCount: modeSet.size,
  });

  const dimensions: ScopeDepthMetrics["dimensions"] = {
    geographicDistribution: {
      score: scoreResult.components.geographicDistribution ?? null,
      weight: DESTINATION_DEPTH_WEIGHTS.geographicDistribution,
      availableSampleCount: assignedMunicipalityCount,
      details: {
        topMunicipalitySharePct: destinations.length
          ? round((topMunicipalityCount / destinations.length) * 100)
          : null,
      },
    },
    municipalityCoverage: {
      score: scoreResult.components.municipalityCoverage ?? null,
      weight: DESTINATION_DEPTH_WEIGHTS.municipalityCoverage,
      availableSampleCount: assignedMunicipalityCount,
      details: {
        distinctMunicipalities: municipalityRows.length,
        scoringMunicipalityBuckets: scoringMunicipalityRows.length,
        advisoryExpectedMunicipalities:
          destinations.length < 10 ? 4 : destinations.length < 30 ? 8 : 15,
      },
    },
    experienceDiversity: {
      score: scoreResult.components.experienceDiversity ?? null,
      weight: DESTINATION_DEPTH_WEIGHTS.experienceDiversity,
      availableSampleCount: recognizedExperience.length,
      details: {
        archetypesCovered: archetypesCovered.length,
        archetypeCount: ARCHETYPE_KEYS.length,
      },
    },
    tripDurationUsefulness: {
      score: scoreResult.components.tripDurationUsefulness ?? null,
      weight: DESTINATION_DEPTH_WEIGHTS.tripDurationUsefulness,
      availableSampleCount: durationRows.length,
      details: { halfDayCandidates, dayTripCandidates, fullDayAnchors },
    },
    seasonalDiversity: {
      score: scoreResult.components.seasonalDiversity ?? null,
      weight: DESTINATION_DEPTH_WEIGHTS.seasonalDiversity,
      availableSampleCount: seasonalRows.length,
      unavailableReason: scoreResult.unavailableComponents.includes(
        "seasonalDiversity",
      )
        ? "No complete structured season vectors"
        : undefined,
      details: {
        seasonsCovered,
        springShareGte7Pct: seasonalCoverage.spring,
        summerShareGte7Pct: seasonalCoverage.summer,
        autumnShareGte7Pct: seasonalCoverage.autumn,
        winterShareGte7Pct: seasonalCoverage.winter,
      },
    },
    transportDiversity: {
      score: scoreResult.components.transportDiversity ?? null,
      weight: DESTINATION_DEPTH_WEIGHTS.transportDiversity,
      availableSampleCount: transportRows.length,
      details: {
        distinctTransportModes: modeSet.size,
        transportModeCount: TRANSPORT_MODES.length,
      },
    },
  };

  return {
    total: destinations.length,
    distinctMunicipalityCount: municipalityRows.length,
    assignedMunicipalityCount,
    unassignedMunicipalityCount:
      destinations.length - assignedMunicipalityCount,
    topMunicipalities,
    topMunicipalitySharePct:
      destinations.length > 0
        ? round((topMunicipalityCount / destinations.length) * 100)
        : null,
    roles: sortedCounts(
      destinations.map((destination) => destination.role ?? "(none)"),
    ),
    placeTypes: sortedCounts(
      destinations.map((destination) => destination.placeType ?? "(none)"),
    ),
    kinds: sortedCounts(
      destinations.map((destination) => destination.kind ?? "(none)"),
    ),
    archetypesCovered,
    unclassifiedExperienceRecords:
      destinations.length - recognizedExperience.length,
    sampleCounts: {
      coordinates: destinations.filter(coordinatesKnown).length,
      municipality: assignedMunicipalityCount,
      experience: recognizedExperience.length,
      duration: durationRows.length,
      completeSeason: seasonalRows.length,
      transport: transportRows.length,
    },
    dimensions,
    depthScore: scoreResult.depthScore,
    depthScoreCoveragePct: scoreResult.depthScoreCoveragePct,
  };
}

function scoreBand(score: number | null): string {
  if (score === null) return "unknown";
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 50) return "moderate";
  if (score >= 35) return "shallow";
  return "critically-shallow";
}

function prefectureMetrics(
  prefecture: string,
  destinations: readonly Destination[],
  catalogSize: number,
): PrefectureDepthMetrics {
  const metrics = scopeMetrics(destinations);
  const observedRegions = [
    ...new Set(destinations.map((destination) => destination.region)),
  ].sort();
  const region =
    PREFECTURE_REGIONS[prefecture] ?? observedRegions[0] ?? "Unknown";
  const regionMismatchCount = destinations.filter(
    (destination) => destination.region !== region,
  ).length;
  const durationStats = tripDurationStats(destinations);
  const transportRows = destinations.map(transportModes);
  const modes = [...new Set(transportRows.flat())].sort();
  const transitCount = transportRows.filter((items) =>
    items.some((mode) => ["train", "bus", "shinkansen"].includes(mode)),
  ).length;
  const seasonalRows = destinations.filter(completeSeason);
  const seasonalCoverage = seasonalRows.length
    ? (Object.fromEntries(
        SEASONS.map((season) => [
          season,
          round(
            (seasonalRows.filter(
              (destination) => (destination.season?.[season] ?? 0) >= 7,
            ).length /
              seasonalRows.length) *
              100,
          ),
        ]),
      ) as Record<Season, number>)
    : null;
  const seasonsCovered = seasonalCoverage
    ? SEASONS.filter((season) => seasonalCoverage[season] >= 30).length
    : null;
  const topShare = metrics.topMunicipalitySharePct ?? 0;

  return {
    ...metrics,
    prefecture,
    region,
    observedRegions,
    regionMismatchCount,
    pctOfCatalog: catalogSize
      ? round((destinations.length / catalogSize) * 100, 2)
      : 0,
    concentrationFlag:
      topShare >= 60
        ? "strong(>=60%)"
        : topShare >= 40
          ? "moderate(40-60%)"
          : "",
    halfDayCandidates: durationStats.halfDayCandidates,
    dayTripCandidates: durationStats.dayTripCandidates,
    fullDayAnchors: durationStats.fullDayAnchors,
    durationUnknown: destinations.length - durationStats.known.length,
    transportModes: modes,
    transitAccessibleSharePct: destinations.length
      ? round((transitCount / destinations.length) * 100)
      : null,
    seasonalCoverage,
    seasonsCovered,
    band: scoreBand(metrics.depthScore),
  };
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const latA = (a.lat * Math.PI) / 180;
  const latB = (b.lat * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(value));
}

function parentGroups(destinations: readonly Destination[]): {
  groups: ParentGroup[];
  unresolvedParentIds: string[];
  childrenWithParent: number;
  childrenByParent: Map<string, Destination[]>;
} {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const childrenByParent = new Map<string, Destination[]>();
  const unresolved = new Set<string>();
  let childrenWithParent = 0;
  for (const destination of destinations) {
    const parentId = destination.relationships?.parentDestinationId;
    if (!parentId) continue;
    if (!byId.has(parentId)) unresolved.add(parentId);
    else childrenWithParent++;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(destination);
    childrenByParent.set(parentId, children);
  }

  const groups = [...childrenByParent.entries()]
    .map(([parentId, children]) => {
      const parent = byId.get(parentId);
      const municipalities = new Set(
        children
          .map(municipalityIdOf)
          .filter((value): value is string => value !== null),
      );
      const sameMunicipalityCount = parent?.municipalityId
        ? children.filter(
            (child) => child.municipalityId === parent.municipalityId,
          ).length
        : 0;
      return {
        parentId,
        parentName: parent?.name ?? "(missing parent)",
        prefecture: parent?.prefecture ?? children[0]?.prefecture ?? "Unknown",
        municipalityId: parent ? municipalityIdOf(parent) : null,
        childCount: children.length,
        childIds: children.map((child) => child.id).sort(),
        distinctChildMunicipalities: municipalities.size,
        sameMunicipalityChildSharePct: parent
          ? round((sameMunicipalityCount / children.length) * 100)
          : null,
      } satisfies ParentGroup;
    })
    .sort(
      (a, b) =>
        b.childCount - a.childCount || a.parentId.localeCompare(b.parentId),
    );

  return {
    groups,
    unresolvedParentIds: [...unresolved].sort(),
    childrenWithParent,
    childrenByParent,
  };
}

function hubSummary(destination: Destination, childCount: number) {
  return {
    id: destination.id,
    name: destination.name,
    prefecture: destination.prefecture,
    municipalityId: municipalityIdOf(destination),
    childCount,
    featuredCount:
      destination.relationships?.featuredDestinationIds?.length ?? 0,
  };
}

function fakeDepth(
  destinations: readonly Destination[],
  childrenByParent: Map<string, Destination[]>,
): FakeDepthReport {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const singleComplexParentClusters = [...childrenByParent.entries()]
    .map(([parentId, children]) => {
      const parent = byId.get(parentId);
      if (!parent || children.length < 4) return null;
      if (new Set(children.map(municipalityIdOf)).size !== 1) return null;
      const coordinates = children
        .map((child) => child.coordinates)
        .filter((value): value is { lat: number; lng: number } =>
          Boolean(value && finite(value.lat) && finite(value.lng)),
        );
      if (coordinates.length < 2) return null;
      let maxPairDistanceKm = 0;
      for (let i = 0; i < coordinates.length; i++) {
        for (let j = i + 1; j < coordinates.length; j++) {
          maxPairDistanceKm = Math.max(
            maxPairDistanceKm,
            haversineKm(coordinates[i], coordinates[j]),
          );
        }
      }
      if (maxPairDistanceKm > 3) return null;
      return {
        parentId,
        parentName: parent.name,
        prefecture: parent.prefecture,
        municipalityId: municipalityIdOf(parent),
        childrenCount: children.length,
        maxPairDistanceKm: round(maxPairDistanceKm, 2),
        childIds: children.map((child) => child.id).sort(),
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort(
      (a, b) =>
        b.childrenCount - a.childrenCount ||
        a.parentId.localeCompare(b.parentId),
    );

  const parentEdge = (a: Destination, b: Destination): boolean =>
    a.relationships?.parentDestinationId === b.id ||
    b.relationships?.parentDestinationId === a.id;

  const groupedByMunicipality = new Map<string, Destination[]>();
  for (const destination of destinations) {
    const municipalityId = municipalityIdOf(destination);
    if (!municipalityId || !coordinatesKnown(destination)) continue;
    const key = `${destination.prefecture}:${municipalityId}`;
    const values = groupedByMunicipality.get(key) ?? [];
    values.push(destination);
    groupedByMunicipality.set(key, values);
  }

  const microClustersWithin250m: FakeDepthReport["microClustersWithin250m"] =
    [];
  for (const rows of groupedByMunicipality.values()) {
    const roots = rows.map((_, index) => index);
    const find = (index: number): number => {
      if (roots[index] === index) return index;
      roots[index] = find(roots[index]);
      return roots[index];
    };
    const union = (a: number, b: number): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) roots[rootB] = rootA;
    };

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (parentEdge(rows[i], rows[j])) continue;
        if (haversineKm(rows[i].coordinates!, rows[j].coordinates!) <= 0.25) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, Destination[]>();
    rows.forEach((destination, index) => {
      const root = find(index);
      const cluster = clusters.get(root) ?? [];
      cluster.push(destination);
      clusters.set(root, cluster);
    });
    for (const cluster of clusters.values()) {
      if (cluster.length < 3) continue;
      microClustersWithin250m.push({
        prefecture: cluster[0].prefecture,
        municipalityId: municipalityIdOf(cluster[0])!,
        size: cluster.length,
        memberIds: cluster.map((destination) => destination.id).sort(),
      });
    }
  }
  microClustersWithin250m.sort(
    (a, b) =>
      b.size - a.size ||
      a.prefecture.localeCompare(b.prefecture) ||
      a.municipalityId.localeCompare(b.municipalityId),
  );

  const names = new Map<string, Set<string>>();
  for (const destination of destinations) {
    for (const value of [
      destination.name,
      destination.nameJa,
      ...(destination.aliases ?? []),
    ]) {
      const key = normalized(value ?? "");
      if (key.length < 4) continue;
      const ids = names.get(key) ?? new Set<string>();
      ids.add(destination.id);
      names.set(key, ids);
    }
  }
  const duplicateNameGroups = [...names.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([normalizedName, ids]) => ({
      normalizedName,
      ids: [...ids].sort(),
    }))
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));

  const warnings: FakeDepthReport["warnings"] = [];
  for (const cluster of singleComplexParentClusters) {
    warnings.push({
      type: "single-complex-parent",
      ids: [cluster.parentId, ...cluster.childIds],
      message: `${cluster.parentId} has ${cluster.childrenCount} same-municipality children within ${cluster.maxPairDistanceKm} km; inspect for artificial micro-depth.`,
    });
  }
  for (const cluster of microClustersWithin250m) {
    warnings.push({
      type: "micro-cluster",
      ids: cluster.memberIds,
      message: `${cluster.size} records share a municipality and fall within 250 m without a direct parent-child edge.`,
    });
  }
  for (const group of duplicateNameGroups) {
    warnings.push({
      type: "duplicate-name",
      ids: group.ids,
      message: `Normalized name/alias "${group.normalizedName}" appears on multiple canonical records.`,
    });
  }
  warnings.sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.ids.join("|").localeCompare(b.ids.join("|")),
  );

  return {
    singleComplexParentClusters,
    microClustersWithin250m,
    duplicateNameGroups,
    warnings,
  };
}

export function buildDestinationDepthReport(
  input: readonly Destination[],
): DestinationDepthReport {
  const destinations = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const catalogSize = destinations.length;
  const byPrefecture = new Map<string, Destination[]>();
  for (const destination of destinations) {
    const rows = byPrefecture.get(destination.prefecture) ?? [];
    rows.push(destination);
    byPrefecture.set(destination.prefecture, rows);
  }

  const prefectures = JAPAN_PREFECTURES.map((prefecture) =>
    prefectureMetrics(
      prefecture,
      byPrefecture.get(prefecture) ?? [],
      catalogSize,
    ),
  );
  const regionNames = [...new Set(Object.values(PREFECTURE_REGIONS))].sort();
  const regionRollup = regionNames.map((region) => {
    const rows = prefectures.filter(
      (prefecture) => prefecture.region === region,
    );
    const destinationsInRegion = rows.reduce(
      (total, row) => total + row.total,
      0,
    );
    const scoredRows = rows.filter((row) => row.depthScore !== null);
    return {
      region,
      destinations: destinationsInRegion,
      sharePct: catalogSize
        ? round((destinationsInRegion / catalogSize) * 100)
        : 0,
      expectedPrefectures: rows.length,
      prefecturesWithRecords: rows.filter((row) => row.total > 0).length,
      prefecturesWithoutRecords: rows
        .filter((row) => row.total === 0)
        .map((row) => row.prefecture),
      averageDepthScore: scoredRows.length
        ? round(
            scoredRows.reduce(
              (total, row) => total + (row.depthScore ?? 0),
              0,
            ) / scoredRows.length,
          )
        : null,
    };
  });

  const { groups, unresolvedParentIds, childrenWithParent, childrenByParent } =
    parentGroups(destinations);
  const childCount = groups.reduce(
    (total, group) => total + group.childCount,
    0,
  );
  const hubs = destinations.filter(
    (destination) =>
      destination.role === "hub" || destination.placeType === "hub",
  );
  const shellHubs = hubs
    .filter((hub) => (childrenByParent.get(hub.id)?.length ?? 0) === 0)
    .map((hub) => hubSummary(hub, 0))
    .sort((a, b) => a.id.localeCompare(b.id));
  const nearShellHubs = hubs
    .filter((hub) => (childrenByParent.get(hub.id)?.length ?? 0) === 1)
    .map((hub) => hubSummary(hub, 1))
    .sort((a, b) => a.id.localeCompare(b.id));
  const largestParentSharePct =
    groups.length && childCount
      ? round((groups[0].childCount / childCount) * 100)
      : null;

  return {
    reportVersion: DESTINATION_DEPTH_REPORT_VERSION,
    generatedFrom: "src/shared/data/destinations-index.json",
    caveats: [
      "Taxonomy is currently inconsistent across legacy and newer destination records; archetype coverage is a heuristic audit signal, not a canonical taxonomy migration.",
      "Structured seasonality is incomplete. Missing season vectors are excluded from the seasonal component rather than scored as good or bad.",
      "Some records do not have municipality IDs. Municipality-based dimensions exclude those records and expose the available sample count.",
      "Depth scores are advisory QA indicators only. They are not merge gates, destination quotas, or a quality target based on raw record counts.",
      "Parent/child and proximity warnings identify review candidates; they do not prove that a destination is fake depth or a duplicate.",
    ],
    catalogSize,
    prefectureCount: JAPAN_PREFECTURES.length,
    regionConvention:
      "Uses the current app convention: Mie is grouped under Kansai.",
    national: scopeMetrics(destinations),
    regionRollup,
    prefectures,
    relationshipSummary: {
      parentCount: groups.length,
      childCount,
      childrenWithParent,
      largestParentSharePct,
      parentGroups: groups.slice(0, 50),
      unresolvedParentIds,
      hubCount: hubs.length,
      shellHubs,
      nearShellHubs,
    },
    fakeDepth: fakeDepth(destinations, childrenByParent),
  };
}

export function renderDestinationDepthMarkdown(
  report: DestinationDepthReport,
): string {
  const lines: string[] = [
    "# Destination depth audit",
    "",
    `Canonical destinations: ${report.catalogSize}`,
    `Source: \`${report.generatedFrom}\``,
    `Report version: ${report.reportVersion}`,
    "",
    "This is a deterministic, read-only advisory QA report. It does not impose minimum destination counts or block merges.",
    "",
    "## Caveats",
    "",
    ...report.caveats.map((caveat) => `- ${caveat}`),
    "",
    "## Regional rollup",
    "",
    "| Region | Destinations | Share % | Prefectures with records | Empty prefectures | Average depth score |",
    "|---|---:|---:|---:|---|---:|",
  ];
  for (const row of report.regionRollup) {
    lines.push(
      `| ${row.region} | ${row.destinations} | ${row.sharePct} | ${row.prefecturesWithRecords}/${row.expectedPrefectures} | ${row.prefecturesWithoutRecords.join(", ") || "—"} | ${row.averageDepthScore ?? "n/a"} |`,
    );
  }

  lines.push(
    "",
    "## Prefecture depth metrics",
    "",
    "All 47 prefectures are included, including empty prefectures.",
    "",
    "| Prefecture | Region | Records | Municipalities | Top municipality share | Archetypes | Duration sample | Season sample | Transport sample | Score | Available weight |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const row of report.prefectures) {
    lines.push(
      `| ${row.prefecture} | ${row.region} | ${row.total} | ${row.distinctMunicipalityCount} | ${row.topMunicipalitySharePct ?? "n/a"} | ${row.archetypesCovered.length}/${ARCHETYPE_KEYS.length} | ${row.sampleCounts.duration} | ${row.sampleCounts.completeSeason} | ${row.sampleCounts.transport} | ${row.depthScore ?? "n/a"} | ${row.depthScoreCoveragePct}% |`,
    );
  }

  lines.push(
    "",
    "## National composition",
    "",
    `- Roles: ${JSON.stringify(report.national.roles)}`,
    `- Place types: ${JSON.stringify(report.national.placeTypes)}`,
    `- Kinds: ${JSON.stringify(report.national.kinds)}`,
    `- Archetypes covered: ${report.national.archetypesCovered.join(", ") || "none"}`,
    `- Unclassified experience records: ${report.national.unclassifiedExperienceRecords}`,
    `- Samples (coordinates / municipality / experience / duration / season / transport): ${report.national.sampleCounts.coordinates} / ${report.national.sampleCounts.municipality} / ${report.national.sampleCounts.experience} / ${report.national.sampleCounts.duration} / ${report.national.sampleCounts.completeSeason} / ${report.national.sampleCounts.transport}`,
    `- Depth score: ${report.national.depthScore ?? "n/a"} (${report.national.depthScoreCoveragePct}% of configured weight available)`,
    "",
    "Top municipalities:",
    "",
    "| Municipality ID | Records | Share % |",
    "|---|---:|---:|",
  );
  for (const municipality of report.national.topMunicipalities) {
    lines.push(
      `| ${municipality.municipalityId} | ${municipality.count} | ${municipality.sharePct} |`,
    );
  }

  lines.push(
    "",
    "## Relationships and shell hubs",
    "",
    `- Parent groups: ${report.relationshipSummary.parentCount}`,
    `- Child records with parent references: ${report.relationshipSummary.childCount}`,
    `- Largest parent share: ${report.relationshipSummary.largestParentSharePct ?? "n/a"}%`,
    `- Hubs: ${report.relationshipSummary.hubCount}; shells: ${report.relationshipSummary.shellHubs.length}; near-shells: ${report.relationshipSummary.nearShellHubs.length}`,
    "",
    "### Shell hubs",
    "",
  );
  for (const hub of report.relationshipSummary.shellHubs) {
    lines.push(
      `- ${hub.id} — ${hub.name} (${hub.prefecture}; featured=${hub.featuredCount})`,
    );
  }
  if (!report.relationshipSummary.shellHubs.length) lines.push("- none");

  lines.push("", "### Near-shell hubs", "");
  for (const hub of report.relationshipSummary.nearShellHubs) {
    lines.push(
      `- ${hub.id} — ${hub.name} (${hub.prefecture}; children=${hub.childCount})`,
    );
  }
  if (!report.relationshipSummary.nearShellHubs.length) lines.push("- none");

  lines.push(
    "",
    "## Fake-depth warnings",
    "",
    `- Single-complex parent clusters: ${report.fakeDepth.singleComplexParentClusters.length}`,
    `- Micro-clusters within 250 m: ${report.fakeDepth.microClustersWithin250m.length}`,
    `- Duplicate normalized name/alias groups: ${report.fakeDepth.duplicateNameGroups.length}`,
    "",
  );
  for (const warning of report.fakeDepth.warnings) {
    lines.push(
      `- **${warning.type}**: ${warning.message} [${warning.ids.join(", ")}]`,
    );
  }
  if (!report.fakeDepth.warnings.length) lines.push("- none");
  lines.push("");
  return lines.join("\n");
}
