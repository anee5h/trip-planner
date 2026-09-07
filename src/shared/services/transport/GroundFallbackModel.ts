import { getDistanceKm } from "./TransportEstimator";

export type FallbackEstimateSource = "rough";
export type FallbackConfidence = "medium" | "low";
export type GroundFallbackClass = "metro" | "suburban" | "regional";

export interface FallbackEstimateDiagnostics {
  readonly straightLineDistanceKm: number;
  readonly modelClass: GroundFallbackClass;
  readonly components: Readonly<{
    readonly originAccessMinutes: readonly [number, number];
    readonly waitingMinutes: readonly [number, number];
    readonly inVehicleMinutes: readonly [number, number];
    readonly transferMinutes: readonly [number, number];
    readonly destinationAccessMinutes: readonly [number, number];
  }>;
  readonly fallbackReason: string;
  readonly detourFactor?: number;
  readonly roadDistanceKm?: number;
  readonly effectiveSpeedKmH?: readonly [number, number];
  readonly impliedEffectiveSpeedKmH?: readonly [number, number];
}

export interface GroundFallbackResult {
  readonly timeRange: [number, number];
  readonly source: FallbackEstimateSource;
  readonly confidence: FallbackConfidence;
  readonly diagnostics: FallbackEstimateDiagnostics;
}

type Coordinates = { readonly lat: number; readonly lng: number };

const URBAN_CENTERS = [
  { id: "tokyo", group: "kanto", coordinates: { lat: 35.6812, lng: 139.7671 } },
  {
    id: "yokohama",
    group: "kanto",
    coordinates: { lat: 35.4437, lng: 139.638 },
  },
  {
    id: "osaka",
    group: "kansai",
    coordinates: { lat: 34.6937, lng: 135.5023 },
  },
  {
    id: "kyoto",
    group: "kansai",
    coordinates: { lat: 35.0116, lng: 135.7681 },
  },
  { id: "kobe", group: "kansai", coordinates: { lat: 34.6901, lng: 135.1956 } },
  {
    id: "nagoya",
    group: "chubu",
    coordinates: { lat: 35.1709, lng: 136.8815 },
  },
  {
    id: "hiroshima",
    group: "chugoku",
    coordinates: { lat: 34.3975, lng: 132.4756 },
  },
  {
    id: "fukuoka",
    group: "kyushu",
    coordinates: { lat: 33.5897, lng: 130.4208 },
  },
  {
    id: "sapporo",
    group: "hokkaido",
    coordinates: { lat: 43.0618, lng: 141.3545 },
  },
] as const;

function nearestUrbanCenter(coordinates: Coordinates) {
  let best: (typeof URBAN_CENTERS)[number] = URBAN_CENTERS[0];
  let distanceKm = Number.POSITIVE_INFINITY;
  for (const center of URBAN_CENTERS) {
    const candidate = getDistanceKm(
      coordinates.lat,
      coordinates.lng,
      center.coordinates.lat,
      center.coordinates.lng,
    );
    if (candidate < distanceKm) {
      best = center;
      distanceKm = candidate;
    }
  }
  return { ...best, distanceKm };
}

function transitClass(distanceKm: number): GroundFallbackClass {
  if (distanceKm <= 35) return "metro";
  if (distanceKm <= 80) return "suburban";
  return "regional";
}

function range(min: number, max: number): [number, number] {
  return [
    Math.max(0, Math.round(min)),
    Math.max(Math.round(min), Math.round(max)),
  ];
}

function impliedEffectiveSpeedKmH(
  distanceKm: number,
  timeRange: readonly [number, number],
): [number, number] {
  if (distanceKm <= 0 || timeRange[1] <= 0) return [0, 0];
  return [
    Number(((distanceKm / timeRange[1]) * 60).toFixed(1)),
    Number(((distanceKm / Math.max(1, timeRange[0])) * 60).toFixed(1)),
  ];
}

function emptyComponents(
  originAccessMinutes: [number, number],
  waitingMinutes: [number, number],
  inVehicleMinutes: [number, number],
  transferMinutes: [number, number],
  destinationAccessMinutes: [number, number],
) {
  return {
    originAccessMinutes,
    waitingMinutes,
    inVehicleMinutes,
    transferMinutes,
    destinationAccessMinutes,
  } as const;
}

/**
 * Door-to-door car fallback. This is deliberately a model of road geometry,
 * congestion and trip overhead, not a universal multiplier on old output.
 */
export function estimateCarFallback(
  origin: Coordinates,
  destination: Coordinates,
  difficultTopology = false,
): GroundFallbackResult {
  const straightLineDistanceKm = getDistanceKm(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
  );
  const fromUrban = nearestUrbanCenter(origin);
  const toUrban = nearestUrbanCenter(destination);
  const sameUrbanRegion =
    fromUrban.group === toUrban.group &&
    fromUrban.distanceKm <=
      (fromUrban.group === "kanto" || fromUrban.group === "kansai" ? 45 : 30) &&
    toUrban.distanceKm <=
      (fromUrban.group === "kanto" || fromUrban.group === "kansai" ? 45 : 30);
  const modelClass =
    sameUrbanRegion && straightLineDistanceKm <= 35
      ? "metro"
      : straightLineDistanceKm <= 60
        ? "suburban"
        : "regional";

  const baseDetour =
    modelClass === "metro" ? 1.28 : modelClass === "suburban" ? 1.38 : 1.5;
  const detourFactor = baseDetour + (difficultTopology ? 0.45 : 0);
  const effectiveSpeedKmH: [number, number] = difficultTopology
    ? [35, 50]
    : modelClass === "metro"
      ? [35, 48]
      : modelClass === "suburban"
        ? [48, 62]
        : [55, 72];
  const roadDistanceKm = straightLineDistanceKm * detourFactor;
  const baseOverhead: [number, number] =
    modelClass === "metro"
      ? [10, 18]
      : modelClass === "suburban"
        ? [12, 22]
        : [15, 28];
  const overhead: [number, number] = difficultTopology
    ? [baseOverhead[0] + 8, baseOverhead[1] + 14]
    : baseOverhead;
  const timeRange = range(
    overhead[0] + (roadDistanceKm / effectiveSpeedKmH[1]) * 60,
    overhead[1] + (roadDistanceKm / effectiveSpeedKmH[0]) * 60,
  );

  return {
    timeRange,
    source: "rough",
    confidence: "medium",
    diagnostics: {
      straightLineDistanceKm,
      modelClass,
      components: emptyComponents([0, 0], [0, 0], timeRange, [0, 0], overhead),
      fallbackReason: "car_provider_unavailable_or_unusable",
      detourFactor,
      roadDistanceKm,
      effectiveSpeedKmH,
    },
  };
}

/**
 * Public-transport fallback. Beyond the metropolitan/suburban boundary we do
 * not pretend that coordinates imply a rail topology. The deliberately wide
 * regional envelope is suitable for warning/eligibility only; the UI should
 * not present it as a precise itinerary.
 */
export function estimateTransitFallback(
  origin: Coordinates,
  destination: Coordinates,
  regionalTopologyUncertain = false,
): GroundFallbackResult {
  const straightLineDistanceKm = getDistanceKm(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
  );
  const modelClass =
    regionalTopologyUncertain && straightLineDistanceKm > 40
      ? "regional"
      : transitClass(straightLineDistanceKm);

  if (modelClass === "metro") {
    const components = emptyComponents(
      [5, 10],
      [5, 10],
      [straightLineDistanceKm * 0.85, straightLineDistanceKm * 1.15].map(
        Math.round,
      ) as [number, number],
      [5, 15],
      [5, 12],
    );
    const timeRange = range(
      components.originAccessMinutes[0] +
        components.waitingMinutes[0] +
        components.inVehicleMinutes[0] +
        components.transferMinutes[0] +
        components.destinationAccessMinutes[0],
      components.originAccessMinutes[1] +
        components.waitingMinutes[1] +
        components.inVehicleMinutes[1] +
        components.transferMinutes[1] +
        components.destinationAccessMinutes[1],
    );
    return {
      timeRange,
      source: "rough",
      confidence: "medium",
      diagnostics: {
        straightLineDistanceKm,
        modelClass,
        components,
        fallbackReason: "metro_transit_topology_unavailable",
        impliedEffectiveSpeedKmH: impliedEffectiveSpeedKmH(
          straightLineDistanceKm,
          timeRange,
        ),
      },
    };
  }

  if (modelClass === "suburban") {
    const components = emptyComponents(
      [10, 25],
      [10, 20],
      range(straightLineDistanceKm * 0.95, straightLineDistanceKm * 1.45),
      [10, 30],
      [10, 25],
    );
    const timeRange = range(
      components.originAccessMinutes[0] +
        components.waitingMinutes[0] +
        components.inVehicleMinutes[0] +
        components.transferMinutes[0] +
        components.destinationAccessMinutes[0],
      components.originAccessMinutes[1] +
        components.waitingMinutes[1] +
        components.inVehicleMinutes[1] +
        components.transferMinutes[1] +
        components.destinationAccessMinutes[1],
    );
    return {
      timeRange,
      source: "rough",
      confidence: "medium",
      diagnostics: {
        straightLineDistanceKm,
        modelClass,
        components,
        fallbackReason: "suburban_transit_topology_unavailable",
        impliedEffectiveSpeedKmH: impliedEffectiveSpeedKmH(
          straightLineDistanceKm,
          timeRange,
        ),
      },
    };
  }

  const lower =
    straightLineDistanceKm <= 120
      ? 180
      : straightLineDistanceKm <= 300
        ? 240
        : 300;
  const upper = Math.min(
    720,
    Math.max(lower + 240, Math.round(straightLineDistanceKm * 4)),
  );
  const components = emptyComponents(
    [20, 60],
    [20, 60],
    [lower - 40, upper - 140],
    [20, 120],
    [20, 60],
  );
  return {
    timeRange: [lower, upper],
    source: "rough",
    confidence: "low",
    diagnostics: {
      straightLineDistanceKm,
      modelClass,
      components,
      fallbackReason: "regional_transit_topology_unmodeled",
      impliedEffectiveSpeedKmH: impliedEffectiveSpeedKmH(
        straightLineDistanceKm,
        [lower, upper],
      ),
    },
  };
}
