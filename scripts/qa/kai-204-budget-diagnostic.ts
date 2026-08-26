/**
 * KAI-204 — deterministic multi-origin budget coverage diagnostic.
 *
 * This diagnostic intentionally calls the production path:
 * getValidModes -> getEstimatedBudgetRange -> getSortableVerifiedBudget.
 * It does not construct route or fare data and does not mutate catalogue files.
 *
 * Run:
 *   npx tsx scripts/qa/kai-204-budget-diagnostic.ts
 *   npx tsx scripts/qa/kai-204-budget-diagnostic.ts --json
 */

import fullIndex from "../../src/shared/data/destinations-index.json";
import liteIndex from "../../src/shared/data/destinations-index.lite.json";
import type { Destination } from "../../src/shared/types/destination";
import { getDistance } from "../../src/shared/utils/distance";

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/data/destinations-index.lite.json")) {
    return Promise.resolve(
      new Response(JSON.stringify(liteIndex), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  if (url.endsWith("/data/destinations-index.json")) {
    return Promise.resolve(
      new Response(JSON.stringify(fullIndex), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return realFetch(input, init);
}) as typeof fetch;

const { loadLiteIndex } =
  await import("../../src/shared/services/place/PlaceCatalog");
const { getDestinationListAsync } =
  await import("../../src/shared/services/destination/DestinationService");
const { getValidModes } =
  await import("../../src/shared/services/recommendation/RecommendationService");
const { getEstimatedBudgetRange, getSortableVerifiedBudget } =
  await import("../../src/shared/services/budget/BudgetService");
const {
  getOriginAwareTransportEstimate,
  getOriginAwareEstimateCacheStats,
  resetOriginAwareEstimateCache,
} =
  await import("../../src/shared/services/transport/OriginAwareTransportService");
const {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
  zoneById,
} =
  await import("../../src/shared/services/transport/TransportTopologyService");

await loadLiteIndex();
const destinations = (await getDestinationListAsync("en")) as Destination[];

const ALL_PUBLIC_MODES = [
  "train",
  "shinkansen",
  "bus",
  "flight",
  "ferry",
] as const;
const PARTY_SIZE = 2;
const BUDGET_TIER = "standard" as const;
const FERRY_TEMPORAL = process.argv.includes("--with-travel-date")
  ? { travelDate: new Date(2026, 7, 15, 12, 0, 0) }
  : undefined;

type Origin = {
  id: string;
  label: string;
  coordinates: { lat: number; lng: number };
};

const origins: Origin[] = [
  {
    id: "nakayama",
    label: "Nakayama Station, Kanagawa",
    coordinates: { lat: 35.5147, lng: 139.5393 },
  },
  {
    id: "tokyo",
    label: "Tokyo Station",
    coordinates: { lat: 35.6812, lng: 139.7671 },
  },
  {
    id: "osaka",
    label: "Osaka Station",
    coordinates: { lat: 34.7025, lng: 135.4959 },
  },
  {
    id: "fukuoka",
    label: "Hakata/Fukuoka Station",
    coordinates: { lat: 33.5902, lng: 130.4017 },
  },
  {
    id: "naha",
    label: "Naha Bus Terminal",
    coordinates: { lat: 26.2124, lng: 127.6809 },
  },
];

const radiusKm = [10, 25, 50, 100, 250] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Number(((numerator / denominator) * 100).toFixed(2));
}

function budgetMethods(list: Destination[]) {
  const counts: Record<string, number> = {
    manual: 0,
    model: 0,
    unknown: 0,
    legacy: 0,
    absent: 0,
    invalid: 0,
  };
  const samples: Record<string, string[]> = {};
  for (const destination of list) {
    const method = destination.budgetMetadata?.method;
    const bucket =
      method === "manual" || method === "model" || method === "unknown"
        ? method
        : method === "legacy"
          ? "legacy"
          : method === undefined
            ? "absent"
            : "invalid";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    if ((samples[bucket] ?? []).length < 10) {
      (samples[bucket] ??= []).push(destination.id);
    }
  }
  return {
    total: list.length,
    counts,
    percentages: Object.fromEntries(
      Object.entries(counts).map(([key, count]) => [
        key,
        percentage(count, list.length),
      ]),
    ),
    samples,
  };
}

type ModeResult = {
  mode: string;
  range: [number, number] | null;
  transportIncluded: boolean;
  durationIncluded: boolean;
  transportFareScope: string;
  estimate: {
    evidence: string;
    corridorEvidence?: string;
    fare?: [number, number | null] | null;
    fareScope?: string;
    timeRange: [number, number];
  } | null;
};

function modeResult(
  destination: Destination,
  origin: Origin,
  mode: string,
): ModeResult {
  const estimate = getOriginAwareTransportEstimate(
    destination,
    {
      homeStationCoords: origin.coordinates,
      ferryTemporal: FERRY_TEMPORAL,
    },
    [mode],
  );
  const budget = getEstimatedBudgetRange(
    destination,
    mode,
    PARTY_SIZE,
    BUDGET_TIER,
    origin.coordinates,
    FERRY_TEMPORAL,
  );
  return {
    mode,
    range: budget.range,
    transportIncluded: budget.transportIncluded,
    durationIncluded: budget.durationIncluded,
    transportFareScope: budget.transportFareScope,
    estimate: estimate
      ? {
          evidence: estimate.evidence,
          ...(estimate.corridorEvidence
            ? { corridorEvidence: estimate.corridorEvidence }
            : {}),
          fare: estimate.fare,
          fareScope: estimate.fareScope,
          timeRange: estimate.timeRange,
        }
      : null,
  };
}

function reasonCodes(
  destination: Destination,
  origin: Origin,
  originZoneId: string,
  modes: readonly string[],
  results: readonly ModeResult[],
): string[] {
  const reasons = new Set<string>();
  const destinationZoneId = resolveDestinationTransportZone(destination);
  const destinationZone = zoneById.get(destinationZoneId);
  if (modes.length === 0) reasons.add("NO_VALID_MODE");
  if (originZoneId === "unknown" || destinationZoneId === "unknown") {
    reasons.add("TOPOLOGY_DATA_GAP");
  }
  if (destination.budgetMetadata?.method === "unknown") {
    reasons.add("ONSITE_BUDGET_COMPONENT_UNAVAILABLE");
  } else if (!destination.budgetBreakdown) {
    reasons.add("ONSITE_BUDGET_COMPONENT_UNAVAILABLE");
  }

  for (const result of results) {
    if (result.transportFareScope === "corridor_only") {
      reasons.add("CORRIDOR_ONLY_FARE");
    }
    if (!result.estimate) {
      if (result.mode === "flight") reasons.add("FLIGHT_FARE_UNAVAILABLE");
      else if (result.mode === "ferry") reasons.add("FERRY_FARE_UNAVAILABLE");
      else if (
        destinationZoneId === originZoneId &&
        destinationZone?.localModes.includes(result.mode as never)
      ) {
        reasons.add("LOCAL_METRO_PRICING_UNSUPPORTED");
      } else if (result.mode === "shinkansen") {
        reasons.add("GATEWAY_MAPPING_MISSING");
      } else {
        reasons.add("MODE_SPECIFIC_DURATION_UNAVAILABLE");
      }
      continue;
    }
    if (
      !result.estimate.fare &&
      result.mode !== "flight" &&
      result.mode !== "ferry"
    ) {
      reasons.add("TRANSPORT_FARE_UNAVAILABLE");
    }
    if (!result.durationIncluded || !result.range) {
      reasons.add("COMPLETE_BUDGET_RANGE_UNAVAILABLE");
    }
  }
  if (reasons.size === 0) reasons.add("GENUINE_UNKNOWN");
  return [...reasons];
}

function runOrigin(origin: Origin) {
  const originZoneId = resolveOriginTransportZone({
    coordinates: origin.coordinates,
    label: origin.label,
  });
  resetOriginAwareEstimateCache();
  const rows = destinations
    .filter((destination) => destination.recommendationEligible !== false)
    .map((destination) => {
      const modes = getValidModes(
        destination,
        "none",
        [...ALL_PUBLIC_MODES],
        origin.coordinates,
        BUDGET_TIER,
        originZoneId,
        FERRY_TEMPORAL,
      );
      const results = modes.map((mode) =>
        modeResult(destination, origin, mode),
      );
      const sortable = getSortableVerifiedBudget(
        destination,
        modes,
        PARTY_SIZE,
        origin.coordinates,
        FERRY_TEMPORAL,
        BUDGET_TIER,
      );
      const distanceKm = destination.coordinates
        ? getDistance(
            origin.coordinates.lat,
            origin.coordinates.lng,
            destination.coordinates.lat,
            destination.coordinates.lng,
          )
        : null;
      const completeModes = results.filter(
        (result) =>
          result.range !== null &&
          result.transportIncluded &&
          result.durationIncluded &&
          result.transportFareScope === "complete",
      );
      const boundedCompleteModes = results.filter(
        (result) =>
          result.range !== null &&
          result.transportIncluded &&
          result.durationIncluded &&
          (result.transportFareScope === "complete" ||
            result.transportFareScope === "local_bounded_estimate"),
      );
      const sortableModes = results.filter(
        (result) =>
          result.range !== null &&
          result.transportIncluded &&
          result.durationIncluded,
      );
      return {
        destination,
        modes,
        results,
        sortable,
        finiteSortable: finite(sortable),
        completeSortable: completeModes.length > 0,
        completeModes: completeModes.map((result) => result.mode),
        boundedCompleteSortable: boundedCompleteModes.length > 0,
        boundedCompleteModes: boundedCompleteModes.map((result) => result.mode),
        sortableModes: sortableModes.map((result) => result.mode),
        distanceKm,
        reasonCodes: finite(sortable)
          ? []
          : reasonCodes(destination, origin, originZoneId, modes, results),
      };
    });

  // Explore's default result set is the recommendation-eligible catalogue;
  // transport modes are evaluated inside the budget metric rather than used
  // to remove rows before sorting.
  const eligible = rows;
  const finiteRows = eligible.filter((row) => row.finiteSortable);
  const completeRows = eligible.filter((row) => row.completeSortable);
  const boundedCompleteRows = eligible.filter(
    (row) => row.boundedCompleteSortable,
  );
  const byMode: Record<string, { eligible: number; priced: number }> = {};
  for (const mode of ALL_PUBLIC_MODES) {
    const modeRows = eligible.filter((row) => row.modes.includes(mode));
    byMode[mode] = {
      eligible: modeRows.length,
      priced: modeRows.filter((row) =>
        row.results.some(
          (result) =>
            result.mode === mode &&
            result.range !== null &&
            result.transportIncluded &&
            result.durationIncluded,
        ),
      ).length,
    };
  }
  const byRadius = Object.fromEntries(
    radiusKm.map((radius) => {
      const inRadius = eligible.filter(
        (row) => row.distanceKm !== null && row.distanceKm <= radius,
      );
      const priced = inRadius.filter((row) => row.finiteSortable);
      return [
        `lte_${radius}km`,
        {
          eligible: inRadius.length,
          finite: priced.length,
          percentage: percentage(priced.length, inRadius.length),
        },
      ];
    }),
  );
  const byZone: Record<string, { eligible: number; finite: number }> = {};
  for (const row of eligible) {
    const zone = resolveDestinationTransportZone(row.destination);
    byZone[zone] ??= { eligible: 0, finite: 0 };
    byZone[zone].eligible += 1;
    if (row.finiteSortable) byZone[zone].finite += 1;
  }
  const reasonCounts: Record<string, number> = {};
  const reasonSamples: Record<string, string[]> = {};
  for (const row of eligible.filter((candidate) => !candidate.finiteSortable)) {
    for (const reason of row.reasonCodes) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      if ((reasonSamples[reason] ?? []).length < 8) {
        (reasonSamples[reason] ??= []).push(row.destination.id);
      }
    }
  }
  const cheapest = [...finiteRows]
    .sort(
      (left, right) => (left.sortable as number) - (right.sortable as number),
    )
    .slice(0, 20)
    .map((row) => ({
      id: row.destination.id,
      name: row.destination.name,
      sortableBudget: row.sortable,
      distanceKm: row.distanceKm,
      modes: row.modes,
      sortableModes: row.sortableModes,
    }));
  const nearestUnknown = [...eligible]
    .filter((row) => !row.finiteSortable && row.distanceKm !== null)
    .sort(
      (left, right) =>
        (left.distanceKm as number) - (right.distanceKm as number),
    )
    .slice(0, 20)
    .map((row) => ({
      id: row.destination.id,
      name: row.destination.name,
      distanceKm: row.distanceKm,
      modes: row.modes,
      reasons: row.reasonCodes,
    }));

  return {
    id: origin.id,
    label: origin.label,
    coordinates: origin.coordinates,
    originZoneId,
    cacheStats: getOriginAwareEstimateCacheStats(),
    totalCatalogue: destinations.length,
    eligible: eligible.length,
    finiteSortable: finiteRows.length,
    finiteSortablePercentage: percentage(finiteRows.length, eligible.length),
    completeFareScopeFinite: completeRows.length,
    completeFareScopePercentage: percentage(
      completeRows.length,
      eligible.length,
    ),
    boundedCompleteFinite: boundedCompleteRows.length,
    boundedCompletePercentage: percentage(
      boundedCompleteRows.length,
      eligible.length,
    ),
    unknown: eligible.length - finiteRows.length,
    unknownPercentage: percentage(
      eligible.length - finiteRows.length,
      eligible.length,
    ),
    byMode,
    byRadius,
    byZone,
    reasonCounts,
    reasonPercentages: Object.fromEntries(
      Object.entries(reasonCounts).map(([key, count]) => [
        key,
        percentage(count, eligible.length - finiteRows.length),
      ]),
    ),
    reasonSamples,
    cheapest,
    nearestUnknown,
  };
}

const result = {
  generatedAt: new Date().toISOString(),
  branch: process.env.GIT_BRANCH ?? "unknown",
  catalogue: budgetMethods(destinations),
  origins: origins.map(runOrigin),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(
    `KAI-204 budget diagnostic — catalogue ${result.catalogue.total}`,
  );
  console.log(JSON.stringify(result.catalogue, null, 2));
  for (const origin of result.origins) {
    console.log(
      `${origin.label}: zone=${origin.originZoneId} eligible=${origin.eligible} finite=${origin.finiteSortable} (${origin.finiteSortablePercentage}%) unknown=${origin.unknown} (${origin.unknownPercentage}%) complete-scope=${origin.completeFareScopeFinite}`,
    );
    console.log(`radius=${JSON.stringify(origin.byRadius)}`);
    console.log(`modes=${JSON.stringify(origin.byMode)}`);
    console.log(`zones=${JSON.stringify(origin.byZone)}`);
    console.log(`reasons=${JSON.stringify(origin.reasonCounts)}`);
    console.log(`cheapest=${JSON.stringify(origin.cheapest)}`);
    console.log(`nearestUnknown=${JSON.stringify(origin.nearestUnknown)}`);
  }
}
