import type { Destination } from "@/shared/types/destination";
import type { CarRouteResult } from "./CarRouteProvider";
import {
  getCarAccessEligibility,
  getRoutableCarAccessAnchors,
} from "./CarAccessService";
import { getSafeGroundEstimate } from "./SafeGroundEstimateService";
import type { SafeGroundEstimateContext } from "./SafeGroundEstimateService";
import type { EstimatedTransportEstimate } from "./OriginAwareTransportService";
import type { TransportZoneId } from "@/shared/types/transportTopology";

/**
 * KAI-226 resilience: when live ORS routing is temporarily unavailable, a
 * car-eligible destination may fall back to the existing bounded
 * SafeGroundEstimate display estimator, clearly labeled as a rough estimate.
 *
 * Guardrails (see PR description):
 * - no_route / unroutable is AUTHORITATIVE: it always blocks the fallback.
 * - restricted / unavailable / ferry-required / unknown access never estimate.
 * - the fallback never populates canonical distance, fuel, or toll truth:
 *   it is a display-duration range only and is NOT a CarRouteResult.
 * - provider-backed routes always win; recovery is automatic because error
 *   results are never cached by the client API provider.
 * - no new estimation coefficients: this reuses SafeGroundEstimateService /
 *   TransportEstimator's calibrated constants unchanged.
 */

export const CAR_ROUTE_OUTAGE_FALLBACK_SOURCE = "car_outage_rough" as const;

/** Temporary/provider-side failures that may degrade to a rough estimate. */
export const ALLOWED_CAR_ROUTE_FALLBACK_FAILURES = new Set([
  "quota_exceeded",
  "network_error",
  "timeout",
  "provider_not_configured",
  // provider_http_5xx is matched by prefix at runtime.
]);

export interface CarRouteFallbackCounters {
  provider_success: number;
  fallback_quota: number;
  fallback_network: number;
  fallback_timeout: number;
  fallback_not_configured: number;
  fallback_5xx: number;
  fallback_other: number;
  blocked_no_route: number;
  blocked_restricted: number;
  blocked_unknown: number;
  blocked_authorization: number;
  blocked_validation: number;
}

const counters: CarRouteFallbackCounters = {
  provider_success: 0,
  fallback_quota: 0,
  fallback_network: 0,
  fallback_timeout: 0,
  fallback_not_configured: 0,
  fallback_5xx: 0,
  fallback_other: 0,
  blocked_no_route: 0,
  blocked_restricted: 0,
  blocked_unknown: 0,
  blocked_authorization: 0,
  blocked_validation: 0,
};

export function snapshotCarRouteFallbackCounters(): Readonly<CarRouteFallbackCounters> {
  return { ...counters };
}

export function resetCarRouteFallbackCounters(): void {
  for (const key of Object.keys(
    counters,
  ) as (keyof CarRouteFallbackCounters)[]) {
    counters[key] = 0;
  }
}

function record(key: keyof CarRouteFallbackCounters): void {
  counters[key] += 1;
}

function isTemporaryFailure(errorCode: string | undefined): boolean {
  if (!errorCode) return false;
  if (ALLOWED_CAR_ROUTE_FALLBACK_FAILURES.has(errorCode)) return true;
  return /^provider_http_5\d\d$/.test(errorCode);
}

export interface CarOutageFallbackEstimate extends EstimatedTransportEstimate {
  readonly source: typeof CAR_ROUTE_OUTAGE_FALLBACK_SOURCE;
  readonly failureCode: string;
}

export interface CarOutageFallbackContext {
  readonly homeStationCoords: { lat: number; lng: number };
  readonly homeStationTransportZoneId?: TransportZoneId;
}

/**
 * Deterministic rough car travel-time fallback. Returns an estimate ONLY when:
 * - the scoped route failed with a temporary/provider-side failure class;
 * - the failure is not authoritative no_route/unroutable;
 * - car access is resolvable (eligible or candidate) for the destination;
 * - the existing SafeGroundEstimate gates pass (same major land zone,
 *   finite coordinates, ≤120 km, topology authorizes car).
 *
 * The result carries NO canonical distance; it is display-only, and the
 * engine/budget path never sees it (it is not a CarRouteResult).
 */
export function getCarOutageFallbackEstimate(
  destination: Destination,
  context: CarOutageFallbackContext,
  scopedCarRoute: CarRouteResult | undefined,
): CarOutageFallbackEstimate | null {
  if (!scopedCarRoute) return null;

  if (scopedCarRoute.availability === "available") {
    record("provider_success");
    return null;
  }

  if (
    scopedCarRoute.availability === "no_route" ||
    scopedCarRoute.errorCode === "unroutable" ||
    scopedCarRoute.errorCode === "no_route"
  ) {
    record("blocked_no_route");
    return null;
  }

  const failureCode = scopedCarRoute.errorCode ?? "unknown";
  if (!isTemporaryFailure(failureCode)) {
    if (failureCode === "provider_authorization_error") {
      record("blocked_authorization");
    } else if (/^invalid_|^validation/.test(failureCode)) {
      record("blocked_validation");
    } else {
      record("blocked_validation");
    }
    return null;
  }

  const eligibility = getCarAccessEligibility(destination);
  if (eligibility === "restricted" || eligibility === "unavailable") {
    record("blocked_restricted");
    return null;
  }
  if (getRoutableCarAccessAnchors(destination).length === 0) {
    record("blocked_unknown");
    return null;
  }

  const estimate = getSafeGroundEstimate(destination, {
    homeStationCoords: context.homeStationCoords,
    homeStationTransportZoneId: context.homeStationTransportZoneId,
    authorizedModes: ["car", "my_car"],
  } satisfies SafeGroundEstimateContext);

  if (!estimate) {
    // Out of scope for the bounded estimator (remote zone, >120 km, or no
    // topology authorization): no fabricated travel time.
    record("blocked_unknown");
    return null;
  }

  if (failureCode === "quota_exceeded") record("fallback_quota");
  else if (failureCode === "network_error") record("fallback_network");
  else if (failureCode === "timeout") record("fallback_timeout");
  else if (failureCode === "provider_not_configured") {
    record("fallback_not_configured");
  } else if (/^provider_http_5\d\d$/.test(failureCode)) {
    record("fallback_5xx");
  } else {
    record("fallback_other");
  }

  return {
    ...estimate,
    source: CAR_ROUTE_OUTAGE_FALLBACK_SOURCE,
    failureCode,
  };
}

/** Convenience: does this estimate carry the rough-outage provenance? */
export function isCarOutageRoughEstimate(
  estimate: unknown,
): estimate is CarOutageFallbackEstimate {
  return (
    estimate !== null &&
    estimate !== undefined &&
    typeof estimate === "object" &&
    "source" in estimate &&
    (estimate as { source?: string }).source ===
      CAR_ROUTE_OUTAGE_FALLBACK_SOURCE
  );
}
