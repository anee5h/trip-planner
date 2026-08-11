import type { TransportZoneId } from "@/shared/types/transportTopology";
import { getDistanceKm } from "./TransportEstimator";
import { resolveOriginTransportZone } from "./TransportTopologyService";

export type IntercityHubMode = "bus" | "shinkansen";

export interface IntercityAccessHub {
  id: string;
  mode: IntercityHubMode;
  coordinates: { lat: number; lng: number };
  transportZoneId: TransportZoneId;
  /** Endpoint key used by the verified intercity corridor registry. */
  corridorEndpoint: string;
}

export interface ResolvedIntercityAccessHub {
  hub: IntercityAccessHub;
  distanceKm: number;
  /** True when the hub came from bounded geographic catchment, not exact wiring. */
  usedCatchment: boolean;
}

export function resolveNearbyAccessHubs(options: {
  location?: { lat: number; lng: number } | null;
  mode: IntercityHubMode;
  hubs: readonly IntercityAccessHub[];
  exactHubIds?: readonly string[];
  radiusKm: number;
  transportZoneId?: TransportZoneId;
}): ResolvedIntercityAccessHub[] {
  const locationZoneId =
    options.transportZoneId ??
    (options.location
      ? resolveOriginTransportZone({ coordinates: options.location })
      : undefined);

  // A coordinate-resolved unknown zone cannot safely inherit a mainland hub.
  if (options.location && (!locationZoneId || locationZoneId === "unknown")) {
    return [];
  }

  // ponytail: linear scan is intentional for these small curated registries;
  // add coordinate bucketing only if recommendation profiling shows a need.
  const candidates = options.hubs.filter(
    (hub) =>
      hub.mode === options.mode &&
      (!locationZoneId || hub.transportZoneId === locationZoneId),
  );
  const byId = new Map(candidates.map((hub) => [hub.id, hub]));
  const resolved: ResolvedIntercityAccessHub[] = [];

  for (const exactHubId of options.exactHubIds ?? []) {
    const hub = byId.get(exactHubId);
    if (!hub || resolved.some((candidate) => candidate.hub.id === hub.id)) {
      continue;
    }
    resolved.push({ hub, distanceKm: 0, usedCatchment: false });
  }

  if (!options.location) return resolved;

  const nearby = candidates
    .filter((hub) => !resolved.some((candidate) => candidate.hub.id === hub.id))
    .map((hub) => ({
      hub,
      distanceKm: getDistanceKm(
        options.location!.lat,
        options.location!.lng,
        hub.coordinates.lat,
        hub.coordinates.lng,
      ),
    }))
    .filter((candidate) => candidate.distanceKm <= options.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  for (const candidate of nearby) {
    resolved.push({ ...candidate, usedCatchment: true });
  }
  return resolved;
}
