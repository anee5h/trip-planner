import type { Destination } from "@/shared/types/destination";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import type { BudgetTier } from "@/shared/types/planner";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { createCarRouteApiProvider } from "@/shared/services/transport/CarRouteApiProvider";
import {
  getCarRoundTripRouteAsync,
  type AsyncCarRouteProvider,
  type CarRoundTripRoute,
} from "@/shared/services/transport/CarRouteProvider";

/**
 * KAI-226 production car-route acquisition.
 *
 * This is the ONLY production path that acquires road routes: it turns a
 * narrowed candidate list into per-destination canonical CarRoundTripRoute
 * facts, which the recommendation pipeline then consumes through
 * `context.carRoutes`. Routs are requested server-side (/api/car-route →
 * OpenRouteService with the key held in the Pages Function environment).
 *
 * Bounding: routes are acquired only when a request is car-relevant, only
 * for destinations whose mode set includes car/my_car, and only for the
 * first CAR_ROUTE_ENRICHMENT_LIMIT candidates in the provided (already
 * narrowed) shortlist — the surfaced recommendation set when called from
 * the hook. A request therefore issues at most
 * CAR_ROUTE_ENRICHMENT_LIMIT × 2 ORS calls; the client-side bounded cache
 * absorbs repeats across renders.
 */

export const CAR_ROUTE_ENRICHMENT_LIMIT = 5;

export interface CarRouteAcquisitionContext {
  readonly carMode: string;
  readonly publicModes: string[];
  readonly homeStationCoords?: { lat: number; lng: number } | null;
  readonly originZoneId?: TransportZoneId;
  readonly budgetTier?: BudgetTier;
  readonly ferryTemporal?: FerryTemporalContext;
}

const defaultProvider: AsyncCarRouteProvider = createCarRouteApiProvider();

function isCarRelevant(
  destination: Destination,
  context: CarRouteAcquisitionContext,
): boolean {
  const modes = getValidModes(
    destination,
    context.carMode,
    context.publicModes,
    context.homeStationCoords ?? undefined,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );
  return modes.includes("car") || modes.includes("my_car");
}

/**
 * Acquire canonical outbound+return routes for car-relevant candidates.
 *
 * Fail closed: any provider/network/configuration failure produces a
 * canonical error/unknown route pair for that destination (never a
 * fabricated one), and non-car modes are untouched.
 *
 * @returns map of destination id → canonical round-trip route (available,
 *   no_route, unknown or error pairs).
 */
export async function acquireCarRoutes(
  destinations: readonly Destination[],
  context: CarRouteAcquisitionContext,
  provider: AsyncCarRouteProvider = defaultProvider,
): Promise<Readonly<Record<string, CarRoundTripRoute>>> {
  const carMode = context.carMode;
  const home = context.homeStationCoords;
  if (
    carMode !== "my_car" &&
    carMode !== "rental" &&
    carMode !== "car" &&
    carMode !== "own"
  ) {
    return {};
  }
  if (!home) return {};

  const candidates: Destination[] = [];
  for (const destination of destinations) {
    if (candidates.length >= CAR_ROUTE_ENRICHMENT_LIMIT) break;
    if (isCarRelevant(destination, context)) candidates.push(destination);
  }

  const routes: Record<string, CarRoundTripRoute> = {};
  await Promise.all(
    candidates.map(async (destination) => {
      const route = await getCarRoundTripRouteAsync(provider, destination, {
        lat: home.lat,
        lng: home.lng,
      });
      routes[destination.id] = route;
    }),
  );
  return routes;
}
