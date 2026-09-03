import type {
  CarAccessAnchor,
  CarAccessCoordinates,
} from "@/shared/types/carAccess";
import { getCarAccess, getRoutableCarAccessAnchors } from "./CarAccessService";
import type { Destination } from "@/shared/types/destination";

export type CarRouteDirection = "outbound" | "return";
export type CarRouteAvailability =
  "available" | "no_route" | "unknown" | "error";
export type CarTollState = "priced" | "free" | "unknown";
export type CarTollBasis = "ETC" | "ETC2" | "general" | "cash" | "unspecified";
export type CarRouteConfidence = "verified" | "estimated" | "unknown";
export type CarRouteCompleteness = "complete" | "partial" | "unknown";

export interface CarRouteToll {
  readonly state: CarTollState;
  readonly amountJPY?: number;
  readonly basis: CarTollBasis;
  readonly sourceUrl?: string;
}

export interface CarRouteEndpoint {
  readonly id: string;
  readonly label: string;
  readonly coordinates: CarAccessCoordinates;
  readonly kind?: CarAccessAnchor["kind"] | "origin";
  readonly accessAnchorId?: string;
  readonly sourceUrls?: readonly string[];
}

export interface CarRouteRequest {
  readonly origin: CarRouteEndpoint;
  readonly destination: CarRouteEndpoint;
  readonly direction: CarRouteDirection;
  /** Optional departure instant. Without it, no live-traffic precision is implied. */
  readonly departureAt?: string;
}

/** Provider-neutral route facts. Provider JSON must be normalized before this boundary. */
export interface CarRouteResult {
  readonly availability: CarRouteAvailability;
  readonly origin: CarAccessCoordinates;
  /** Identity of the requested origin, retained separately from its coordinates. */
  readonly originEndpoint?: CarRouteEndpoint;
  readonly destination?: CarRouteEndpoint;
  readonly accessAnchor?: CarRouteEndpoint;
  readonly provider: string;
  readonly direction?: CarRouteDirection;
  readonly retrievedAt?: string;
  readonly distanceKm?: number;
  readonly durationMinutes?: number;
  readonly toll: CarRouteToll;
  readonly confidence: CarRouteConfidence;
  readonly completeness: CarRouteCompleteness;
  readonly errorCode?: string;
  readonly sourceUrl?: string;
}

/** A preloaded synchronous snapshot adapter; network providers must be async. */
export interface CarRouteSnapshotProvider {
  route(request: CarRouteRequest): CarRouteResult;
}

/** @deprecated Use CarRouteSnapshotProvider for synchronous fixtures/snapshots. */
export type CarRouteProvider = CarRouteSnapshotProvider;

/** Network providers such as ORS must cross an explicit async boundary. */
export interface AsyncCarRouteProvider {
  route(request: CarRouteRequest): Promise<CarRouteResult>;
}

export interface CarRoundTripRoute {
  readonly outbound: CarRouteResult;
  readonly returnRoute: CarRouteResult;
}

function endpointFromAnchor(anchor: CarAccessAnchor): CarRouteEndpoint {
  if (!anchor.coordinates) {
    throw new Error(`Routable anchor ${anchor.id} has no coordinates`);
  }
  return {
    id: anchor.id,
    label: anchor.label,
    coordinates: anchor.coordinates,
    kind: anchor.kind,
    accessAnchorId: anchor.id,
    sourceUrls: anchor.sourceUrls,
  };
}

function endpointFromOrigin(origin: CarAccessCoordinates): CarRouteEndpoint {
  return {
    id: "origin",
    label: "Trip origin",
    kind: "origin",
    coordinates: origin,
  };
}

function unavailableRoute(
  origin: CarAccessCoordinates,
  reason: string,
  destination?: CarRouteEndpoint,
  direction?: CarRouteDirection,
  accessAnchor?: CarRouteEndpoint,
  originEndpoint?: CarRouteEndpoint,
): CarRouteResult {
  return {
    availability: "unknown",
    origin,
    originEndpoint,
    destination,
    provider: "car-route-provider",
    direction,
    accessAnchor,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "unknown",
    completeness: "unknown",
    errorCode: reason,
  };
}

function sameCoordinates(
  actual: CarAccessCoordinates | undefined,
  expected: CarAccessCoordinates,
): boolean {
  return Boolean(
    actual && actual.lat === expected.lat && actual.lng === expected.lng,
  );
}

function sameEndpoint(
  actual: CarRouteEndpoint | undefined,
  expected: CarRouteEndpoint,
): boolean {
  return Boolean(
    actual &&
    actual.id === expected.id &&
    sameCoordinates(actual.coordinates, expected.coordinates),
  );
}

function isAvailable(result: CarRouteResult): boolean {
  return (
    result.availability === "available" &&
    result.distanceKm !== undefined &&
    Number.isFinite(result.distanceKm) &&
    result.distanceKm >= 0 &&
    result.durationMinutes !== undefined &&
    Number.isFinite(result.durationMinutes) &&
    result.durationMinutes >= 0
  );
}

function normalizeProviderResult(
  result: CarRouteResult,
  request: CarRouteRequest,
  expectedAccessAnchor: CarRouteEndpoint,
): CarRouteResult {
  const withIdentity = {
    ...result,
    originEndpoint: result.originEndpoint ?? request.origin,
    accessAnchor: result.accessAnchor ?? expectedAccessAnchor,
  };
  if (result.availability !== "available") return withIdentity;

  const valid =
    result.direction === request.direction &&
    sameEndpoint(withIdentity.originEndpoint, request.origin) &&
    sameEndpoint(withIdentity.destination, request.destination) &&
    sameEndpoint(withIdentity.accessAnchor, expectedAccessAnchor) &&
    result.completeness !== "unknown" &&
    isAvailable(withIdentity);
  if (valid) return withIdentity;

  return {
    ...withIdentity,
    availability: "unknown",
    confidence: "unknown",
    completeness: "unknown",
    errorCode: result.errorCode ?? "invalid_provider_route",
  };
}

function endpointMatchesAnchor(
  endpoint: CarRouteEndpoint | undefined,
  anchor: CarAccessAnchor,
): boolean {
  return Boolean(
    endpoint &&
    (endpoint.id === anchor.id || endpoint.accessAnchorId === anchor.id) &&
    sameCoordinates(endpoint.coordinates, anchor.coordinates!),
  );
}

function routeMatchesAnchor(
  route: CarRouteResult,
  direction: CarRouteDirection,
  home: CarAccessCoordinates,
  anchor: CarAccessAnchor,
): boolean {
  if (route.direction !== direction) return false;
  if (
    route.accessAnchor &&
    !endpointMatchesAnchor(route.accessAnchor, anchor)
  ) {
    return false;
  }
  if (direction === "outbound") {
    return (
      sameCoordinates(route.origin, home) &&
      endpointMatchesAnchor(route.destination, anchor)
    );
  }
  return (
    sameCoordinates(route.origin, anchor.coordinates!) &&
    route.destination?.id === "origin" &&
    sameCoordinates(route.destination.coordinates, home)
  );
}

/**
 * Guard direct route consumers against applying one destination route to
 * another candidate or combining different parking anchors into one trip.
 * Normalized provider results carry accessAnchor on both legs; direct inputs
 * are checked from their directional endpoints.
 */
export function isCarRoundTripRouteForDestination(
  destination: Destination,
  route: CarRoundTripRoute,
  origin?: CarAccessCoordinates,
): boolean {
  const anchors = getRoutableCarAccessAnchors(destination);
  if (anchors.length === 0) return false;
  const home = origin ?? route.outbound.origin;
  return anchors.some(
    (anchor) =>
      routeMatchesAnchor(route.outbound, "outbound", home, anchor) &&
      routeMatchesAnchor(route.returnRoute, "return", home, anchor),
  );
}

function routeForAnchor(
  provider: CarRouteProvider,
  home: CarAccessCoordinates,
  anchor: CarAccessAnchor,
  direction: CarRouteDirection,
  departureAt?: string,
): CarRouteResult {
  const accessEndpoint = endpointFromAnchor(anchor);
  const requestOrigin =
    direction === "outbound" ? endpointFromOrigin(home) : accessEndpoint;
  const requestDestination =
    direction === "outbound" ? accessEndpoint : endpointFromOrigin(home);
  const request = {
    origin: requestOrigin,
    destination: requestDestination,
    direction,
    departureAt,
  } satisfies CarRouteRequest;
  try {
    return normalizeProviderResult(
      provider.route(request),
      request,
      accessEndpoint,
    );
  } catch {
    return unavailableRoute(
      request.origin.coordinates,
      "provider_error",
      request.destination,
      direction,
      accessEndpoint,
      request.origin,
    );
  }
}

async function routeForAnchorAsync(
  provider: AsyncCarRouteProvider,
  home: CarAccessCoordinates,
  anchor: CarAccessAnchor,
  direction: CarRouteDirection,
  departureAt?: string,
): Promise<CarRouteResult> {
  const accessEndpoint = endpointFromAnchor(anchor);
  const requestOrigin =
    direction === "outbound" ? endpointFromOrigin(home) : accessEndpoint;
  const requestDestination =
    direction === "outbound" ? accessEndpoint : endpointFromOrigin(home);
  const request = {
    origin: requestOrigin,
    destination: requestDestination,
    direction,
    departureAt,
  } satisfies CarRouteRequest;
  try {
    return normalizeProviderResult(
      await provider.route(request),
      request,
      accessEndpoint,
    );
  } catch {
    return unavailableRoute(
      request.origin.coordinates,
      "provider_error",
      request.destination,
      direction,
      accessEndpoint,
      request.origin,
    );
  }
}

/**
 * Async counterpart for network route providers. It shares the same
 * directional and provider-output validation as the synchronous fixture path.
 */
export async function getCarRoundTripRouteAsync(
  provider: AsyncCarRouteProvider,
  destination: Destination,
  origin: CarAccessCoordinates,
  options: {
    readonly departureAt?: string;
    readonly returnDepartureAt?: string;
  } = {},
): Promise<CarRoundTripRoute> {
  const access = getCarAccess(destination);
  if (access.eligibility !== "eligible") {
    const unavailable = unavailableRoute(origin, `access_${access.state}`);
    return { outbound: unavailable, returnRoute: unavailable };
  }
  const anchors = getRoutableCarAccessAnchors(destination);
  let lastPair: CarRoundTripRoute = {
    outbound: unavailableRoute(origin, "no_route"),
    returnRoute: unavailableRoute(origin, "no_route"),
  };
  for (const anchor of anchors) {
    const [outbound, returnRoute] = await Promise.all([
      routeForAnchorAsync(
        provider,
        origin,
        anchor,
        "outbound",
        options.departureAt,
      ),
      routeForAnchorAsync(
        provider,
        origin,
        anchor,
        "return",
        options.returnDepartureAt,
      ),
    ]);
    lastPair = { outbound, returnRoute };
    if (hasUsableCarRoute(outbound) && hasUsableCarRoute(returnRoute)) {
      return lastPair;
    }
  }
  return lastPair;
}

/**
 * Resolve ordered anchors one at a time and require both directional routes
 * from the same anchor. No route is synthesized when KAI-264 has only a named,
 * non-coordinate anchor.
 */
export function getCarRoundTripRoute(
  provider: CarRouteProvider,
  destination: Destination,
  origin: CarAccessCoordinates,
  options: {
    readonly departureAt?: string;
    readonly returnDepartureAt?: string;
  } = {},
): CarRoundTripRoute {
  const access = getCarAccess(destination);
  if (access.eligibility !== "eligible") {
    const unavailable = unavailableRoute(origin, `access_${access.state}`);
    return { outbound: unavailable, returnRoute: unavailable };
  }
  const anchors = getRoutableCarAccessAnchors(destination);
  let lastPair: CarRoundTripRoute = {
    outbound: unavailableRoute(origin, "no_route"),
    returnRoute: unavailableRoute(origin, "no_route"),
  };
  for (const anchor of anchors) {
    const outbound = routeForAnchor(
      provider,
      origin,
      anchor,
      "outbound",
      options.departureAt,
    );
    const returnRoute = routeForAnchor(
      provider,
      origin,
      anchor,
      "return",
      options.returnDepartureAt,
    );
    lastPair = { outbound, returnRoute };
    if (hasUsableCarRoute(outbound) && hasUsableCarRoute(returnRoute)) {
      return lastPair;
    }
  }
  return lastPair;
}

export function createFixtureCarRouteProvider(
  routes: readonly CarRouteResult[],
): CarRouteProvider {
  return {
    route(request) {
      const match = routes.find(
        (route) =>
          route.direction === request.direction &&
          route.origin.lat === request.origin.coordinates.lat &&
          route.origin.lng === request.origin.coordinates.lng &&
          route.destination?.id === request.destination.id,
      );
      return (
        match ??
        unavailableRoute(
          request.origin.coordinates,
          "fixture_route_missing",
          request.destination,
        )
      );
    },
  };
}

export function hasUsableCarRoute(route: CarRouteResult): boolean {
  return (
    isAvailable(route) &&
    route.confidence !== "unknown" &&
    route.completeness !== "unknown"
  );
}
