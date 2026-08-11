import type { TransportZoneId } from "@/shared/types/transportTopology";
import { getDistanceKm } from "./TransportEstimator";
import { resolveOriginTransportZone } from "./TransportTopologyService";

export type IntercityHubMode = "bus" | "shinkansen";

/**
 * Station-level tolerance (km) below which a location is treated as being
 * physically at the hub. Municipality wiring is a *preferred/canonical hub*
 * claim, never a zero-distance claim: a resident of a municipality whose
 * canonical hub is a few kilometers away still has real access distance and
 * bounded access time (KAI-12 correction).
 */
export const HUB_AT_STATION_NEAR_ZERO_KM = 1;

export interface IntercityAccessHub {
  id: string;
  mode: IntercityHubMode;
  coordinates: { lat: number; lng: number };
  transportZoneId: TransportZoneId;
  /** Endpoint key used by the verified intercity corridor registry. */
  corridorEndpoint: string;
  /**
   * True when this physical station is the exact product the corridor row
   * describes (e.g. Tokyo Station for the `tokyo` endpoint). Stations that
   * merely share a prefecture-keyed endpoint (Omiya, Shinagawa,
   * Shin-Yokohama for `tokyo`) must never claim the endpoint's verified
   * duration/fare as station-specific verified truth (KAI-12 invariant).
   * Defaults to true.
   */
  isCanonicalCorridorStation?: boolean;
}

export interface ResolvedIntercityAccessHub {
  hub: IntercityAccessHub;
  distanceKm: number;
  /** True when the hub required bounded geographic access (distance
   *  materially above the station tolerance). Exact municipality wiring with
   *  a real physical distance is catchment too. */
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
    // Preferred hubs are prioritized (they lead the candidate list) but they
    // are not zero-distance proof: with coordinates, the actual physical
    // distance is measured and the radius policy still applies. Only a
    // location genuinely at/near the hub stays zero-access.
    if (options.location) {
      const distanceKm = getDistanceKm(
        options.location.lat,
        options.location.lng,
        hub.coordinates.lat,
        hub.coordinates.lng,
      );
      if (distanceKm > options.radiusKm) continue;
      resolved.push({
        hub,
        distanceKm,
        usedCatchment: distanceKm > HUB_AT_STATION_NEAR_ZERO_KM,
      });
    } else {
      // No coordinates: distance is unknowable. Municipality wiring remains
      // the canonical representation (legacy zone-only path); nothing can be
      // measured, so nothing is claimed as measured access.
      resolved.push({ hub, distanceKm: 0, usedCatchment: false });
    }
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
