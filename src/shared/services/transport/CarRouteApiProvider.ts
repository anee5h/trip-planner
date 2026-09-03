import type {
  AsyncCarRouteProvider,
  CarRouteRequest,
  CarRouteResult,
} from "./CarRouteProvider";

/**
 * Browser-side adapter for the Meguruto server endpoint /api/car-route.
 *
 * The ORS credential NEVER reaches the browser: this adapter talks to the
 * Pages Function, which holds OPENROUTESERVICE_API_KEY server-side and
 * returns Meguruto's canonical normalized CarRouteResult.
 *
 * A small bounded in-memory cache protects ORS quota across renders. The
 * cache key includes origin coordinates, destination/anchor id, and
 * direction, so a route can never be reused for another destination or
 * direction.
 */

export const CAR_ROUTE_API_ENDPOINT = "/api/car-route";

export const CAR_ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
export const CAR_ROUTE_CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  readonly result: CarRouteResult;
  readonly cachedAt: number;
}

const routeCache = new Map<string, CacheEntry>();

function cacheKey(request: CarRouteRequest): string {
  return [
    request.origin.coordinates.lat,
    request.origin.coordinates.lng,
    request.destination.id,
    request.direction,
  ].join("|");
}

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of routeCache) {
    if (now - entry.cachedAt > CAR_ROUTE_CACHE_TTL_MS) routeCache.delete(key);
  }
}

function errorResult(
  request: CarRouteRequest,
  availability: CarRouteResult["availability"],
  errorCode: string,
): CarRouteResult {
  return {
    availability,
    origin: request.origin.coordinates,
    originEndpoint: request.origin,
    destination: request.destination,
    accessAnchor: request.destination.accessAnchorId
      ? request.destination
      : undefined,
    provider: "car-route-api",
    direction: request.direction,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode,
  };
}

function parseResult(value: unknown, request: CarRouteRequest): CarRouteResult {
  if (value === null || typeof value !== "object") {
    return errorResult(request, "error", "invalid_provider_response");
  }
  const record = value as Record<string, unknown>;
  const origin = record.origin as { lat?: unknown; lng?: unknown } | undefined;
  if (
    record.availability !== "available" &&
    record.availability !== "no_route" &&
    record.availability !== "unknown" &&
    record.availability !== "error"
  ) {
    return errorResult(request, "error", "invalid_provider_response");
  }
  return {
    availability: record.availability,
    origin: {
      lat: Number(origin?.lat),
      lng: Number(origin?.lng),
    },
    originEndpoint:
      (record.originEndpoint as CarRouteResult["originEndpoint"]) ??
      request.origin,
    destination:
      (record.destination as CarRouteResult["destination"]) ??
      request.destination,
    accessAnchor:
      (record.accessAnchor as CarRouteResult["accessAnchor"]) ??
      (request.destination.accessAnchorId ? request.destination : undefined),
    provider:
      typeof record.provider === "string" ? record.provider : "car-route-api",
    direction:
      (record.direction as CarRouteResult["direction"]) ?? request.direction,
    retrievedAt:
      typeof record.retrievedAt === "string" ? record.retrievedAt : undefined,
    distanceKm:
      typeof record.distanceKm === "number" ? record.distanceKm : undefined,
    durationMinutes:
      typeof record.durationMinutes === "number"
        ? record.durationMinutes
        : undefined,
    toll:
      record.toll !== null && typeof record.toll === "object"
        ? (record.toll as CarRouteResult["toll"])
        : { state: "unknown", basis: "unspecified" },
    confidence:
      (record.confidence as CarRouteResult["confidence"]) ?? "unknown",
    completeness:
      (record.completeness as CarRouteResult["completeness"]) ?? "unknown",
    errorCode:
      typeof record.errorCode === "string" ? record.errorCode : undefined,
    sourceUrl:
      typeof record.sourceUrl === "string" ? record.sourceUrl : undefined,
  };
}

/**
 * AsyncCarRouteProvider backed by the server-side /api/car-route endpoint.
 */
export class CarRouteApiProvider implements AsyncCarRouteProvider {
  private readonly endpoint: string;
  private readonly fetchImpl: (
    input: string,
    init?: RequestInit,
  ) => Promise<Response>;

  constructor(
    options: {
      readonly endpoint?: string;
      readonly fetchImpl?: (
        input: string,
        init?: RequestInit,
      ) => Promise<Response>;
    } = {},
  ) {
    this.endpoint = options.endpoint ?? CAR_ROUTE_API_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async route(request: CarRouteRequest): Promise<CarRouteResult> {
    const key = cacheKey(request);
    const cached = routeCache.get(key);
    if (cached && Date.now() - cached.cachedAt <= CAR_ROUTE_CACHE_TTL_MS) {
      return cached.result;
    }

    evictExpired();
    const result = await this.fetchRoute(request);

    if (routeCache.size >= CAR_ROUTE_CACHE_MAX_ENTRIES) {
      // Bounded: drop the oldest entry (Map preserves insertion order).
      const oldest = routeCache.keys().next().value;
      if (oldest !== undefined) routeCache.delete(oldest);
    }
    routeCache.set(key, { result, cachedAt: Date.now() });
    return result;
  }

  private async fetchRoute(request: CarRouteRequest): Promise<CarRouteResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          origin: {
            lat: request.origin.coordinates.lat,
            lng: request.origin.coordinates.lng,
          },
          target: {
            lat: request.destination.coordinates.lat,
            lng: request.destination.coordinates.lng,
            id: request.destination.id,
            label: request.destination.label,
          },
          direction: request.direction,
          ...(request.departureAt ? { departureAt: request.departureAt } : {}),
        }),
      });
    } catch {
      return errorResult(request, "error", "network_error");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return errorResult(request, "error", "invalid_provider_response");
    }
    if (!response.ok) {
      const record = payload as { error?: unknown } | null;
      if (response.status === 429) {
        return errorResult(request, "error", "quota_exceeded");
      }
      if (typeof record?.error === "string") {
        return errorResult(request, "error", record.error);
      }
      return errorResult(request, "error", `provider_http_${response.status}`);
    }
    return parseResult(payload, request);
  }
}

export function createCarRouteApiProvider(
  options?: ConstructorParameters<typeof CarRouteApiProvider>[0],
): AsyncCarRouteProvider {
  return new CarRouteApiProvider(options);
}

/** Test hook: clears the bounded client cache. */
export function clearCarRouteApiCache(): void {
  routeCache.clear();
}
