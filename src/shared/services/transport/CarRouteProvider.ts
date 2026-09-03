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

export interface CarRouteProvider {
  route(request: CarRouteRequest): CarRouteResult;
}

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
): CarRouteResult {
  return {
    availability: "unknown",
    origin,
    destination,
    provider: "car-route-provider",
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
  const withAnchor = {
    ...result,
    accessAnchor: result.accessAnchor ?? expectedAccessAnchor,
  };
  if (result.availability !== "available") return withAnchor;

  const valid =
    result.direction === request.direction &&
    sameCoordinates(result.origin, request.origin.coordinates) &&
    sameEndpoint(result.destination, request.destination) &&
    sameEndpoint(withAnchor.accessAnchor, expectedAccessAnchor) &&
    result.completeness !== "unknown" &&
    isAvailable(withAnchor);
  if (valid) return withAnchor;

  return {
    ...withAnchor,
    availability: "unknown",
    confidence: "unknown",
    completeness: "unknown",
    errorCode: result.errorCode ?? "invalid_provider_route",
  };
}

function routeAnchorEndpoint(
  result: CarRouteResult,
  direction: CarRouteDirection,
): CarRouteEndpoint | undefined {
  if (result.accessAnchor) return result.accessAnchor;
  if (direction === "return" && result.destination?.id === "origin") {
    return undefined;
  }
  return result.destination;
}

function matchesAccessAnchor(
  endpoint: CarRouteEndpoint | undefined,
  anchors: readonly CarAccessAnchor[],
): boolean {
  if (!endpoint) return false;
  return anchors.some(
    (anchor) =>
      (anchor.id === endpoint.id || anchor.id === endpoint.accessAnchorId) &&
      sameCoordinates(anchor.coordinates, endpoint.coordinates),
  );
}

/**
 * Guard direct route consumers against applying one destination route to
 * another candidate. Normalized provider results carry accessAnchor on both
 * legs; direct test/runtime inputs may carry the anchor as the endpoint.
 */
export function isCarRoundTripRouteForDestination(
  destination: Destination,
  route: CarRoundTripRoute,
  origin?: CarAccessCoordinates,
): boolean {
  const anchors = getRoutableCarAccessAnchors(destination);
  if (anchors.length === 0) return false;
  if (origin && !sameCoordinates(route.outbound.origin, origin)) return false;

  const outboundAnchor = routeAnchorEndpoint(route.outbound, "outbound");
  const returnAnchor = routeAnchorEndpoint(route.returnRoute, "return");
  const outboundDestinationMatches =
    !route.outbound.accessAnchor ||
    matchesAccessAnchor(route.outbound.destination, anchors);
  return (
    outboundDestinationMatches &&
    matchesAccessAnchor(outboundAnchor, anchors) &&
    matchesAccessAnchor(returnAnchor, anchors)
  );
}

function routeForDirection(
  provider: CarRouteProvider,
  home: CarAccessCoordinates,
  anchors: readonly CarAccessAnchor[],
  direction: CarRouteDirection,
  departureAt?: string,
): CarRouteResult {
  let last = unavailableRoute(home, "no_routable_access_anchor");
  for (const anchor of anchors) {
    const accessEndpoint = endpointFromAnchor(anchor);
    const requestOrigin =
      direction === "outbound" ? endpointFromOrigin(home) : accessEndpoint;
    const requestDestination =
      direction === "outbound" ? accessEndpoint : endpointFromOrigin(home);
    const result = provider.route({
      origin: requestOrigin,
      destination: requestDestination,
      direction,
      departureAt,
    });
    const normalized = normalizeProviderResult(
      result,
      {
        origin: requestOrigin,
        destination: requestDestination,
        direction,
        departureAt,
      },
      accessEndpoint,
    );
    last = normalized;
    if (isAvailable(normalized)) return normalized;
  }
  return last;
}

async function routeForDirectionAsync(
  provider: AsyncCarRouteProvider,
  home: CarAccessCoordinates,
  anchors: readonly CarAccessAnchor[],
  direction: CarRouteDirection,
  departureAt?: string,
): Promise<CarRouteResult> {
  let last = unavailableRoute(home, "no_routable_access_anchor");
  for (const anchor of anchors) {
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
    const normalized = normalizeProviderResult(
      await provider.route(request),
      request,
      accessEndpoint,
    );
    last = normalized;
    if (isAvailable(normalized)) return normalized;
  }
  return last;
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
  const [outbound, returnRoute] = await Promise.all([
    routeForDirectionAsync(
      provider,
      origin,
      anchors,
      "outbound",
      options.departureAt,
    ),
    routeForDirectionAsync(
      provider,
      origin,
      anchors,
      "return",
      options.returnDepartureAt,
    ),
  ]);
  return { outbound, returnRoute };
}

/**
 * Resolve ordered/fallback anchors independently for outbound and return. No
 * route is synthesized when KAI-264 has only a named, non-coordinate anchor.
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
  const outbound = routeForDirection(
    provider,
    origin,
    anchors,
    "outbound",
    options.departureAt,
  );
  const returnRoute = routeForDirection(
    provider,
    origin,
    anchors,
    "return",
    options.returnDepartureAt,
  );

  return { outbound, returnRoute };
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
  return isAvailable(route);
}
