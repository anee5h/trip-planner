import { useEffect, useState } from "react";
import type { Destination } from "@/shared/types/destination";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { CarRoundTripRoute } from "@/shared/services/transport/CarRouteProvider";
import { peekCachedCarRoundTrip } from "@/shared/services/transport/CarRouteApiProvider";
import { getRoutableCarAccessAnchors } from "@/shared/services/transport/CarAccessService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  acquireCarRoutes,
  carRouteIntentCounters,
} from "@/shared/services/recommendation/carRouteAcquisition";

/**
 * KAI-226 intent-triggered ORS refinement for a single destination page.
 *
 * Discovery renders the deterministic bounded estimate immediately (no ORS).
 * This hook then requests the provider ONLY because the user opened the
 * destination — one round-trip pair (outbound+return) at most, both
 * directions genuinely required for the canonical round-trip duration,
 * fuel distance and toll/partial semantics. Outcomes:
 *   - provider-backed  → routes replace the estimate (verified styling)
 *   - temporary failure → #325 rough fallback remains (never fake provider
 *     facts)
 *   - no_route         → the road journey is unavailable (no estimate)
 */
export type CarRouteRefinementStatus =
  "idle" | "loading" | "provider-backed" | "fallback" | "no_route";

export interface CarRouteRefinement {
  readonly routes: CarRoundTripRoute | undefined;
  readonly status: CarRouteRefinementStatus;
  readonly failureCode: string | undefined;
}

export function useDestinationCarRouteRefinement(
  destination: Destination | undefined,
  options: {
    readonly carMode: string | undefined;
    readonly homeStationCoords: { lat: number; lng: number } | null;
    readonly homeStationTransportZoneId: TransportZoneId | undefined;
  },
): CarRouteRefinement {
  const [routes, setRoutes] = useState<CarRoundTripRoute | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<CarRouteRefinementStatus>("idle");
  const [failureCode, setFailureCode] = useState<string | undefined>(undefined);

  const { carMode, homeStationCoords, homeStationTransportZoneId } = options;
  const carSelected =
    carMode === "my_car" ||
    carMode === "car" ||
    carMode === "rental" ||
    carMode === "own";

  useEffect(() => {
    if (!carSelected || !destination || !homeStationCoords) {
      // Nothing to refine: stay on the deterministic estimate.
      setRoutes(undefined);
      if (status !== "idle") setStatus("idle");
      setFailureCode(undefined);
      return;
    }

    // Topology guard: never attempt a provider route the origin cannot
    // reach by continuous road (e.g. Honshu origin → Hokkaido destination).
    // Destination-side car accessibility must not fabricate a water
    // crossing; the origin-aware mode set is authoritative here.
    const validModes = getValidModes(
      destination,
      carMode,
      [],
      homeStationCoords,
      undefined,
      homeStationTransportZoneId,
      undefined,
    );
    const carModeValid =
      validModes.includes("car") || validModes.includes("my_car");
    if (!carModeValid) {
      setRoutes(undefined);
      if (status !== "idle") setStatus("idle");
      setFailureCode(undefined);
      return;
    }

    // Cache first: an already-verified route is reused without a request.
    const cached = peekCachedCarRoundTrip(
      destination,
      homeStationCoords,
      getRoutableCarAccessAnchors(destination).map((anchor) => anchor.id),
    );
    if (cached) {
      setRoutes(cached as CarRoundTripRoute);
      setStatus("provider-backed");
      carRouteIntentCounters.cache_hit += 1;
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setRoutes(undefined);
    setFailureCode(undefined);
    void acquireCarRoutes([destination], {
      carMode,
      publicModes: [],
      homeStationCoords,
      originZoneId: homeStationTransportZoneId,
    })
      .then((acquired) => {
        if (cancelled) return;
        const pair = acquired[destination.id];
        if (!pair) {
          setStatus("idle");
          return;
        }
        if (pair.outbound.availability === "available") {
          setRoutes(pair);
          setStatus("provider-backed");
          carRouteIntentCounters.detail_provider_success += 1;
        } else if (pair.outbound.availability === "no_route") {
          // Authoritative: the road journey is unavailable; the rough
          // estimate must NOT override it.
          setRoutes(pair);
          setStatus("no_route");
          carRouteIntentCounters.detail_provider_no_route += 1;
        } else {
          setRoutes(undefined);
          setStatus("fallback");
          setFailureCode(pair.outbound.errorCode);
          carRouteIntentCounters.detail_provider_fallback += 1;
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("fallback");
        setFailureCode("provider_error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.id, carSelected, homeStationCoords, destination]);

  return { routes, status, failureCode };
}
