import groundRoutes from "../../src/shared/data/ground-routes.json";
import destinationsIndex from "../../src/shared/data/destinations-index.json";
import type { Destination } from "../../src/shared/types/destination";
import { getDistanceKm } from "../../src/shared/services/transport/TransportEstimator";
import {
  getOriginAwareTransportEstimate,
  getTravelDecisionSemantics,
  type TravelDurationEstimate,
} from "../../src/shared/services/transport/OriginAwareTransportService";
import { getSafeGroundEstimate } from "../../src/shared/services/transport/SafeGroundEstimateService";
import { formatTravelEstimateLabel } from "../../src/shared/services/transport/formatters";

type Mode = "car" | "train" | "shinkansen";
type Cohort =
  | "car_fallback"
  | "metro_suburban_transit"
  | "regional_intercity_transit"
  | "catalogue_routed_car"
  | "catalogue_routed_transit";

interface BenchmarkJourney {
  id: string;
  category: string;
  cohort: Cohort;
  mode: Mode;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string; tags?: string[] };
  referenceMinutes: number;
  referenceSource: string;
  referenceKind?: "independent" | "internal_fixture";
  referenceRange?: readonly [number, number];
  beforeRange?: readonly [number, number];
}

interface EvaluationRow extends BenchmarkJourney {
  straightLineDistanceKm: number;
  beforeRange: readonly [number, number];
  afterRange: readonly [number, number];
  afterSource: string;
  afterOriginSource: string;
  afterConfidence: string;
  afterDecisionSemantics: "reliable" | "conservative";
  afterFallbackReason?: string;
  afterFinalUiText: string;
  beforeMidpointErrorMinutes: number;
  afterMidpointErrorMinutes: number;
  beforePercentageError: number;
  afterPercentageError: number;
  afterUpperBoundMiss: boolean;
  afterMaterialUnderestimate: boolean;
  impliedMegurutoSpeedKmH: number;
  referenceSpeedKmH: number;
}

const POINTS: Record<string, { lat: number; lng: number }> = {
  aichi: { lat: 35.1815, lng: 136.9066 },
  akita: { lat: 39.72, lng: 140.103 },
  aomori: { lat: 40.824, lng: 140.74 },
  chiba: { lat: 35.607, lng: 140.106 },
  ehime: { lat: 33.8416, lng: 132.7661 },
  fukui: { lat: 36.0652, lng: 136.2216 },
  fukuoka: { lat: 33.5902, lng: 130.4017 },
  fukushima: { lat: 37.7608, lng: 140.4747 },
  gifu: { lat: 35.4233, lng: 136.7607 },
  gunma: { lat: 36.391, lng: 139.06 },
  gunma_northeast: { lat: 36.67, lng: 139.14 },
  gunma_northwest: { lat: 36.56, lng: 138.91 },
  gunma_south: { lat: 36.32, lng: 139.18 },
  hiroshima: { lat: 34.3853, lng: 132.4553 },
  hokkaido: { lat: 43.0621, lng: 141.3544 },
  hyogo: { lat: 34.6913, lng: 135.183 },
  ibaraki: { lat: 36.3418, lng: 140.4468 },
  ishikawa: { lat: 36.5613, lng: 136.6562 },
  iwate: { lat: 39.7036, lng: 141.1527 },
  kagawa: { lat: 34.3401, lng: 134.0434 },
  kagoshima: { lat: 31.5966, lng: 130.5571 },
  kanagawa: { lat: 35.4478, lng: 139.6425 },
  kochi: { lat: 33.5597, lng: 133.5311 },
  kumamoto: { lat: 32.8031, lng: 130.7079 },
  kyoto: { lat: 35.0116, lng: 135.7681 },
  mie: { lat: 34.7303, lng: 136.5086 },
  miyagi: { lat: 38.2682, lng: 140.8694 },
  miyazaki: { lat: 31.9077, lng: 131.4202 },
  nagano: { lat: 36.6513, lng: 138.181 },
  nagasaki: { lat: 32.7503, lng: 129.8777 },
  nara: { lat: 34.6851, lng: 135.8048 },
  niigata: { lat: 37.9161, lng: 139.0364 },
  oita: { lat: 33.2382, lng: 131.6126 },
  okayama: { lat: 34.6551, lng: 133.9195 },
  osaka: { lat: 34.6937, lng: 135.5023 },
  saga: { lat: 33.2635, lng: 130.3009 },
  saitama: { lat: 35.8617, lng: 139.6455 },
  shiga: { lat: 35.0045, lng: 135.8686 },
  shimane: { lat: 35.4723, lng: 133.0505 },
  shizuoka: { lat: 34.9756, lng: 138.3828 },
  tochigi: { lat: 36.5658, lng: 139.8836 },
  tokushima: { lat: 34.0658, lng: 134.5593 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  tottori: { lat: 35.5011, lng: 134.2351 },
  toyama: { lat: 36.6953, lng: 137.2113 },
  wakayama: { lat: 34.2305, lng: 135.1708 },
  yamagata: { lat: 38.2554, lng: 140.3396 },
  yamaguchi: { lat: 34.1785, lng: 131.4737 },
  yamanashi: { lat: 35.6642, lng: 138.5684 },
};

const MANDATORY: BenchmarkJourney[] = [
  {
    id: "nakayama-roppongi-transit",
    category: "Tokyo inner-city",
    cohort: "metro_suburban_transit",
    mode: "train",
    origin: { lat: 35.514745, lng: 139.539692, label: "Nakayama" },
    destination: { lat: 35.6605, lng: 139.7292, label: "Roppongi Hills" },
    referenceMinutes: 55,
    referenceSource: "user-provided Google Maps audit (~55 min)",
    beforeRange: [31, 39],
  },
  {
    id: "shizu-kirin-transit",
    category: "Chiba/Tokyo suburban",
    cohort: "metro_suburban_transit",
    mode: "train",
    origin: { lat: 35.7272, lng: 140.2375, label: "Shizu, Chiba" },
    destination: {
      lat: 35.4437,
      lng: 139.6425,
      label: "Kirin Beer Yokohama Factory",
    },
    referenceMinutes: 118,
    referenceSource: "user-provided Google Maps audit (~1h58)",
    beforeRange: [48, 61],
  },
  {
    id: "yokohama-central-tokyo-car",
    category: "Tokyo/Yokohama commuter",
    cohort: "car_fallback",
    mode: "car",
    origin: { lat: 35.4437, lng: 139.6425, label: "Yokohama" },
    destination: { lat: 35.6762, lng: 139.6503, label: "Central Tokyo" },
    referenceMinutes: 53,
    referenceSource: "user-provided Google Maps audit (~53 min)",
    beforeRange: [30, 38],
  },
  {
    id: "yokohama-kawagoe-car",
    category: "Tokyo outskirts",
    cohort: "car_fallback",
    mode: "car",
    origin: { lat: 35.4437, lng: 139.6425, label: "Yokohama" },
    destination: { lat: 35.9251, lng: 139.4858, label: "Kawagoe" },
    referenceMinutes: 97,
    referenceSource: "user-provided Google Maps audit (~1h37)",
    beforeRange: [47, 60],
  },
  {
    id: "yokohama-boso-car",
    category: "peninsula topology",
    cohort: "car_fallback",
    mode: "car",
    origin: { lat: 35.4437, lng: 139.6425, label: "Yokohama" },
    destination: {
      lat: 35.251,
      lng: 139.91,
      label: "Boso Peninsula",
      tags: ["peninsula"],
    },
    referenceMinutes: 125,
    referenceSource: "user-provided Google Maps audit (~2h05)",
    beforeRange: [71, 91],
  },
  {
    id: "chidoribashi-hikone-transit",
    category: "Kansai regional",
    cohort: "regional_intercity_transit",
    mode: "train",
    origin: { lat: 34.6847, lng: 135.4572, label: "Chidoribashi, Osaka" },
    destination: {
      lat: 35.2769,
      lng: 136.251,
      label: "Hikone Castle",
      tags: ["regional"],
    },
    referenceMinutes: 125,
    referenceSource: "user-provided Google Maps audit (~2h05)",
    beforeRange: [15, 45],
  },
  {
    id: "chidoribashi-amanohashidate-transit",
    category: "Kansai coastal/topology",
    cohort: "regional_intercity_transit",
    mode: "train",
    origin: { lat: 34.6847, lng: 135.4572, label: "Chidoribashi, Osaka" },
    destination: {
      lat: 35.566,
      lng: 135.185,
      label: "Amanohashidate",
      tags: ["coastal", "regional"],
    },
    referenceMinutes: 198,
    referenceSource: "user-provided Google Maps audit (~3h18)",
    beforeRange: [28, 45],
  },
  {
    id: "kuga-tsuwano-transit",
    category: "Chugoku rural/regional",
    cohort: "regional_intercity_transit",
    mode: "train",
    origin: { lat: 34.087, lng: 132.078, label: "Kuga, Yamaguchi" },
    destination: {
      lat: 34.467,
      lng: 131.773,
      label: "Tsuwano Castle",
      tags: ["mountain", "regional"],
    },
    referenceMinutes: 353,
    referenceSource: "user-provided Google Maps audit (~5h53)",
    beforeRange: [50, 63],
  },
];

function categoryFor(mode: Mode, distanceKm: number): string {
  if (mode === "car") {
    if (distanceKm < 25) return "metropolitan car";
    if (distanceKm < 80) return "suburban car";
    return "regional car";
  }
  if (distanceKm < 25) return "metro rail";
  if (distanceKm < 80) return "suburban/intercity commuter rail";
  return mode === "shinkansen"
    ? "Shinkansen corridor"
    : "regional/intercity conventional rail";
}

function legacyRange(
  distanceKm: number,
  mode: Mode,
): readonly [number, number] {
  const speed = mode === "car" ? 65 : mode === "shinkansen" ? 180 : 75;
  const overhead = mode === "car" ? 10 : mode === "shinkansen" ? 25 : 15;
  const midpoint = Math.round(overhead + (distanceKm / speed) * 60);
  return [
    Math.max(10, Math.round(midpoint * 0.9)),
    Math.max(15, Math.round(midpoint * 1.15)),
  ];
}

function addStaticBenchmarkRows(): BenchmarkJourney[] {
  const rows: BenchmarkJourney[] = [];
  const routes = (groundRoutes as { routes: Array<Record<string, unknown>> })
    .routes;
  routes.slice(0, 64).forEach((route, index) => {
    const from = String(route.from);
    const to = String(route.to);
    const mode = String(route.mode) as Mode;
    const originPoint = POINTS[from];
    const destinationPoint = POINTS[to];
    if (
      !originPoint ||
      !destinationPoint ||
      !["car", "train", "shinkansen"].includes(mode)
    )
      return;
    const adjustedDestination =
      from === to
        ? { lat: destinationPoint.lat + 0.08, lng: destinationPoint.lng + 0.08 }
        : destinationPoint;
    const distanceKm = getDistanceKm(
      originPoint.lat,
      originPoint.lng,
      adjustedDestination.lat,
      adjustedDestination.lng,
    );
    const timeRange = route.timeRange as [number, number];
    rows.push({
      id: `ground-route-${index + 1}-${from}-${to}-${mode}`,
      category: categoryFor(mode, distanceKm),
      cohort:
        mode === "car" ? "catalogue_routed_car" : "catalogue_routed_transit",
      mode,
      origin: { ...originPoint, label: from },
      destination: { ...adjustedDestination, label: to },
      referenceMinutes: (timeRange[0] + timeRange[1]) / 2,
      referenceSource: String(route.sourceUrl ?? "ground-routes.json"),
      referenceKind: "internal_fixture",
      referenceRange: timeRange,
      beforeRange: legacyRange(distanceKm, mode),
    });
  });
  return rows;
}

export function buildBenchmark(): BenchmarkJourney[] {
  return [
    ...MANDATORY.map((journey) => ({
      ...journey,
      referenceKind: "independent" as const,
    })),
    ...addStaticBenchmarkRows(),
  ];
}

const MANDATORY_CATALOGUE_IDS: Record<string, string> = {
  "nakayama-roppongi-transit": "roppongi-hills-tokyo-city-view",
  "shizu-kirin-transit": "kirin-beer-yokohama-factory",
  "yokohama-central-tokyo-car": "shinjuku-city",
  "yokohama-kawagoe-car": "kawagoe-city",
  "yokohama-boso-car": "boso-peninsula",
  "chidoribashi-hikone-transit": "hikone-castle-shiga",
  "chidoribashi-amanohashidate-transit": "amanohashidate-kyoto",
  "kuga-tsuwano-transit": "tsuwano-castle",
};

const catalogueById = new Map(
  (destinationsIndex as unknown as Destination[]).map((destination) => [
    destination.id,
    destination,
  ]),
);

function finalDestinationFor(journey: BenchmarkJourney): Destination | null {
  const id = MANDATORY_CATALOGUE_IDS[journey.id];
  const catalogueDestination = id ? catalogueById.get(id) : undefined;
  if (!catalogueDestination) return null;
  return {
    ...catalogueDestination,
    // Preserve the independently recorded audit endpoint for distance/model
    // evaluation; catalogue metadata supplies access authorization and zones.
    coordinates: {
      lat: journey.destination.lat,
      lng: journey.destination.lng,
    },
  };
}

function finalEstimateFor(journey: BenchmarkJourney):
  | (Pick<
      TravelDurationEstimate,
      "timeRange" | "confidence" | "estimateSource"
    > & {
      source: string;
    })
  | null {
  const destination = finalDestinationFor(journey);
  if (!destination) return null;
  const context = {
    homeStationCoords: journey.origin,
    originZoneId: "mainland-honshu" as const,
    originPrefecture: "benchmark-origin",
    originMunicipalityId: "benchmark-origin:unknown",
  };
  if (journey.mode === "car") {
    return getSafeGroundEstimate(destination, {
      homeStationCoords: journey.origin,
      homeStationTransportZoneId: context.originZoneId,
      authorizedModes: ["car"],
    });
  }
  return getOriginAwareTransportEstimate(destination, context, [journey.mode]);
}
function evaluate(journey: BenchmarkJourney): EvaluationRow {
  const distanceKm = getDistanceKm(
    journey.origin.lat,
    journey.origin.lng,
    journey.destination.lat,
    journey.destination.lng,
  );
  const finalEstimate =
    journey.referenceRange && journey.id.startsWith("ground-route")
      ? null
      : finalEstimateFor(journey);
  if (!journey.referenceRange || !journey.id.startsWith("ground-route")) {
    if (!finalEstimate) {
      throw new Error(
        `No final estimator result for benchmark case ${journey.id}`,
      );
    }
  }
  const model =
    journey.referenceRange && journey.id.startsWith("ground-route")
      ? {
          timeRange: [...journey.referenceRange] as [number, number],
          source: "routed",
          originSource: "verified_ground_route",
          confidence: "high",
          decisionSemantics: "reliable" as const,
          finalUiText: "Routed/high confidence",
        }
      : {
          timeRange: finalEstimate!.timeRange,
          source: finalEstimate!.estimateSource,
          originSource: finalEstimate!.source,
          confidence: finalEstimate!.confidence,
          decisionSemantics: getTravelDecisionSemantics(finalEstimate!),
          fallbackReason: finalEstimate!.fallbackReason,
          finalUiText: formatTravelEstimateLabel(finalEstimate!, "en"),
        };
  const beforeRange =
    journey.beforeRange ?? legacyRange(distanceKm, journey.mode);
  const reference = journey.referenceMinutes;
  const beforeMidpoint = (beforeRange[0] + beforeRange[1]) / 2;
  const afterMidpoint = (model.timeRange[0] + model.timeRange[1]) / 2;
  return {
    ...journey,
    straightLineDistanceKm: distanceKm,
    beforeRange,
    afterRange: model.timeRange,
    afterSource: model.source,
    afterOriginSource: model.originSource,
    afterConfidence: model.confidence,
    afterDecisionSemantics: model.decisionSemantics,
    afterFallbackReason: model.fallbackReason,
    afterFinalUiText: model.finalUiText,
    beforeMidpointErrorMinutes: Math.abs(beforeMidpoint - reference),
    afterMidpointErrorMinutes: Math.abs(afterMidpoint - reference),
    beforePercentageError: Math.abs(beforeMidpoint - reference) / reference,
    afterPercentageError: Math.abs(afterMidpoint - reference) / reference,
    afterUpperBoundMiss: reference > model.timeRange[1],
    afterMaterialUnderestimate: afterMidpoint < reference * 0.8,
    impliedMegurutoSpeedKmH: distanceKm / (afterMidpoint / 60),
    referenceSpeedKmH: distanceKm / (reference / 60),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function metrics(rows: EvaluationRow[]) {
  const abs = rows.map((row) => row.afterMidpointErrorMinutes);
  const pct = rows.map((row) => row.afterPercentageError);
  return {
    journeys: rows.length,
    medianAbsoluteErrorMinutes: percentile(abs, 0.5),
    medianPercentageError: percentile(pct, 0.5),
    p75ErrorMinutes: percentile(abs, 0.75),
    p90ErrorMinutes: percentile(abs, 0.9),
    maximumErrorMinutes: Math.max(...abs),
    referenceAboveUpperBoundPercent: rows.length
      ? rows.filter((row) => row.afterUpperBoundMiss).length / rows.length
      : Number.NaN,
    materiallyUnderestimatingPercent: rows.length
      ? rows.filter((row) => row.afterMaterialUnderestimate).length /
        rows.length
      : Number.NaN,
  };
}

export function buildReport() {
  const rows = buildBenchmark().map(evaluate);
  const referenceRows = rows.filter(
    (row) => row.referenceKind === "independent",
  );
  const internalRows = rows.filter(
    (row) => row.referenceKind === "internal_fixture",
  );
  const cohorts = [
    "car_fallback",
    "metro_suburban_transit",
    "regional_intercity_transit",
  ] as const;
  const before = Object.fromEntries(
    cohorts.map((cohort) => [
      cohort,
      metrics(
        referenceRows
          .filter((row) => row.cohort === cohort)
          .map((row) => ({
            ...row,
            afterMidpointErrorMinutes: Math.abs(
              (row.beforeRange[0] + row.beforeRange[1]) / 2 -
                row.referenceMinutes,
            ),
            afterPercentageError:
              Math.abs(
                (row.beforeRange[0] + row.beforeRange[1]) / 2 -
                  row.referenceMinutes,
              ) / row.referenceMinutes,
            afterUpperBoundMiss: row.referenceMinutes > row.beforeRange[1],
            afterMaterialUnderestimate:
              (row.beforeRange[0] + row.beforeRange[1]) / 2 <
              row.referenceMinutes * 0.8,
          })),
      ),
    ]),
  );
  const after = Object.fromEntries(
    cohorts.map((cohort) => [
      cohort,
      metrics(referenceRows.filter((row) => row.cohort === cohort)),
    ]),
  );
  return {
    generatedAt: new Date().toISOString(),
    benchmarkCount: rows.length,
    referenceBackedCount: referenceRows.length,
    internalFixtureCount: internalRows.length,
    referencePolicy:
      "Only the eight mandatory rows have independently recorded Google/reference journey times. Catalogue ground-routes rows are internal regression fixtures and are excluded from accuracy metrics.",
    referenceBackedAccuracy: {
      before,
      after,
      mandatoryCases: referenceRows.map((row) => ({
        id: row.id,
        category: row.category,
        mode: row.mode,
        origin: row.origin.label,
        destination: row.destination.label,
        referenceMinutes: row.referenceMinutes,
        referenceSource: row.referenceSource,
        beforeRange: row.beforeRange,
        afterRange: row.afterRange,
        afterSource: row.afterSource,
        afterOriginSource: row.afterOriginSource,
        afterConfidence: row.afterConfidence,
        afterDecisionSemantics: row.afterDecisionSemantics,
        afterFallbackReason: row.afterFallbackReason,
        afterFinalUiText: row.afterFinalUiText,
        beforeMidpointErrorMinutes: row.beforeMidpointErrorMinutes,
        afterMidpointErrorMinutes: row.afterMidpointErrorMinutes,
        afterUpperBoundMiss: row.afterUpperBoundMiss,
        afterMaterialUnderestimate: row.afterMaterialUnderestimate,
      })),
      worst10: [...referenceRows]
        .sort(
          (a, b) => b.afterMidpointErrorMinutes - a.afterMidpointErrorMinutes,
        )
        .slice(0, 10),
    },
    internalRegression: {
      fixtureCount: internalRows.length,
      cohorts: {
        car: internalRows.filter((row) => row.cohort === "catalogue_routed_car")
          .length,
        transit: internalRows.filter(
          (row) => row.cohort === "catalogue_routed_transit",
        ).length,
      },
      rows: internalRows.map((row) => ({
        id: row.id,
        cohort: row.cohort,
        referenceSource: row.referenceSource,
        catalogueRange: row.referenceRange,
        beforeRange: row.beforeRange,
        afterRange: row.afterRange,
        afterSource: row.afterSource,
        afterConfidence: row.afterConfidence,
      })),
      note: "These rows test catalogue-route stability and provenance only; their existing route ranges are not independent ground truth.",
    },
    orsRoutedCar: {
      journeys: 0,
      note: "No live ORS response was captured in this offline benchmark; run the provider-boundary smoke with production credentials to populate this cohort.",
    },
    effectiveSpeedAudit: referenceRows
      .filter((row) => row.mode !== "car")
      .map((row) => ({
        id: row.id,
        distanceKm: row.straightLineDistanceKm,
        megurutoImpliedEffectiveSpeedKmH: row.impliedMegurutoSpeedKmH,
        referenceEffectiveSpeedKmH: row.referenceSpeedKmH,
        range: row.afterRange,
        confidence: row.afterConfidence,
      })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(buildReport(), null, 2));
}
