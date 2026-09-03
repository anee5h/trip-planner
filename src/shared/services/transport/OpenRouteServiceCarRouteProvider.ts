import type {
  AsyncCarRouteProvider,
  CarRouteEndpoint,
  CarRouteRequest,
  CarRouteResult,
} from "./CarRouteProvider";

export const OPENROUTESERVICE_DRIVING_CAR_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/json";

type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface OpenRouteServiceCarRouteProviderOptions {
  /** Supplied by deployment configuration; never committed to the repository. */
  readonly apiKey: string | undefined;
  readonly endpoint?: string;
  readonly fetchImpl?: FetchImplementation;
  readonly now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validCoordinates(
  value: unknown,
): value is { lat: number; lng: number } {
  if (!isRecord(value)) return false;
  return (
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

function accessAnchorFor(
  request: CarRouteRequest,
): CarRouteEndpoint | undefined {
  if (request.origin.accessAnchorId) return request.origin;
  if (request.destination.accessAnchorId) return request.destination;
  return undefined;
}

function baseResult(
  request: CarRouteRequest,
  endpoint: string,
  now: () => string,
): Pick<
  CarRouteResult,
  | "origin"
  | "originEndpoint"
  | "destination"
  | "accessAnchor"
  | "provider"
  | "direction"
  | "retrievedAt"
  | "sourceUrl"
> {
  return {
    origin: request.origin.coordinates,
    originEndpoint: request.origin,
    destination: request.destination,
    accessAnchor: accessAnchorFor(request),
    provider: "openrouteservice",
    direction: request.direction,
    retrievedAt: now(),
    sourceUrl: endpoint,
  };
}

function failure(
  request: CarRouteRequest,
  endpoint: string,
  now: () => string,
  availability: "no_route" | "error",
  errorCode: string,
): CarRouteResult {
  return {
    ...baseResult(request, endpoint, now),
    availability,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode,
  };
}

function errorText(body: unknown): string {
  return JSON.stringify(body ?? "").toLowerCase();
}

function isUnroutable(body: unknown): boolean {
  const text = errorText(body);
  return /no[_ ]route|not[_ ]rout|unroutable|unreachable|disconnected|could not find.*rout/.test(
    text,
  );
}

type RouteSummaryResult =
  | { readonly kind: "no_route" }
  | { readonly kind: "invalid" }
  | { readonly kind: "available"; readonly summary: Record<string, unknown> };

function routeSummary(body: unknown): RouteSummaryResult {
  if (!isRecord(body) || !Array.isArray(body.routes)) {
    return { kind: "invalid" };
  }
  if (body.routes.length === 0) return { kind: "no_route" };
  const firstRoute = body.routes[0];
  if (!isRecord(firstRoute) || !isRecord(firstRoute.summary)) {
    return { kind: "invalid" };
  }
  return { kind: "available", summary: firstRoute.summary };
}

/**
 * Hosted ORS adapter. It intentionally knows nothing about destination
 * centroids or toll prices: callers provide the KAI-264 access anchor and this
 * adapter returns only the routed road facts ORS actually supplied.
 */
export class OpenRouteServiceCarRouteProvider implements AsyncCarRouteProvider {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchImplementation | undefined;
  private readonly now: () => string;

  constructor(options: OpenRouteServiceCarRouteProviderOptions) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.endpoint = options.endpoint ?? OPENROUTESERVICE_DRIVING_CAR_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async route(request: CarRouteRequest): Promise<CarRouteResult> {
    if (!validCoordinates(request.origin.coordinates)) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "invalid_origin_coordinates",
      );
    }
    if (!validCoordinates(request.destination.coordinates)) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "invalid_destination_coordinates",
      );
    }
    if (!this.apiKey) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "provider_not_configured",
      );
    }
    if (!this.fetchImpl) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "network_error",
      );
    }

    const body = {
      coordinates: [
        [request.origin.coordinates.lng, request.origin.coordinates.lat],
        [
          request.destination.coordinates.lng,
          request.destination.coordinates.lat,
        ],
      ],
      instructions: false,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "network_error",
      );
    }

    if (response.status === 429) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "quota_exceeded",
      );
    }
    if (response.status === 401 || response.status === 403) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "provider_authorization_error",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        response.ok
          ? "invalid_provider_response"
          : `provider_http_${response.status}`,
      );
    }

    if (!response.ok) {
      if (response.status === 404 || isUnroutable(payload)) {
        return failure(
          request,
          this.endpoint,
          this.now,
          "no_route",
          "unroutable",
        );
      }
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        `provider_http_${response.status}`,
      );
    }

    const summaryResult = routeSummary(payload);
    if (summaryResult.kind === "no_route") {
      return failure(
        request,
        this.endpoint,
        this.now,
        "no_route",
        "unroutable",
      );
    }
    if (summaryResult.kind === "invalid") {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "invalid_provider_response",
      );
    }
    const summary = summaryResult.summary;
    if (
      typeof summary.distance !== "number" ||
      !Number.isFinite(summary.distance) ||
      summary.distance < 0
    ) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "malformed_distance",
      );
    }
    if (
      typeof summary.duration !== "number" ||
      !Number.isFinite(summary.duration) ||
      summary.duration < 0
    ) {
      return failure(
        request,
        this.endpoint,
        this.now,
        "error",
        "malformed_duration",
      );
    }

    return {
      ...baseResult(request, this.endpoint, this.now),
      availability: "available",
      distanceKm: summary.distance / 1000,
      durationMinutes: summary.duration / 60,
      toll: { state: "unknown", basis: "unspecified" },
      confidence: "verified",
      completeness: "complete",
    };
  }
}

export function createOpenRouteServiceCarRouteProvider(
  options: OpenRouteServiceCarRouteProviderOptions,
): AsyncCarRouteProvider {
  return new OpenRouteServiceCarRouteProvider(options);
}
