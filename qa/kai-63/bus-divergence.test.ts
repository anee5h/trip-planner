/**
 * KAI-63: same-zone origin divergence — for every destination bus-eligible
 * from at least one audited origin, find same-zone origins where it is not
 * eligible and classify why. Distinguishes explainable causes (corridor not
 * served by that hub, day-trip feasibility boundary, night-only) from
 * suspicious ones.
 */
import { describe, it } from "vitest";
import destinationsData from "../../src/shared/data/destinations-index.json";
import type { Destination } from "../../src/shared/types/destination";
import { getValidModes } from "../../src/shared/services/recommendation/RecommendationScorer";
import { matchesPersonalizedDayTripDuration } from "../../src/shared/services/recommendation/TripDurationService";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "../../src/shared/services/transport/TransportTopologyService";

const allDests = destinationsData as unknown as Destination[];

const ORIGINS: Record<string, { lat: number; lng: number }> = {
  Tokyo: { lat: 35.6812, lng: 139.7671 },
  Shinagawa: { lat: 35.6285, lng: 139.7387 },
  Yokohama: { lat: 35.4658, lng: 139.6222 },
  Machida: { lat: 35.5464, lng: 139.4466 },
  Nakayama: { lat: 35.514745, lng: 139.539692 },
  Chiba: { lat: 35.6125, lng: 140.1167 },
  Fukushima: { lat: 37.7544, lng: 140.4665 },
  Nagano: { lat: 36.6431, lng: 138.1888 },
  Osaka: { lat: 34.7025, lng: 135.4959 },
  Hiroshima: { lat: 34.3983, lng: 132.4756 },
  Iwakuni: { lat: 34.1758, lng: 132.2251 },
  Hakata: { lat: 33.5902, lng: 130.4207 },
  Naha: { lat: 26.2124, lng: 127.6809 },
  Sendai: { lat: 38.268, lng: 140.87 },
  Sapporo: { lat: 43.068, lng: 141.351 },
  Kochi: { lat: 33.5597, lng: 133.5311 },
  Nagoya: { lat: 35.1709, lng: 136.8815 },
  Koriyama: { lat: 37.4, lng: 140.36 },
  Kanazawa: { lat: 36.5782, lng: 136.6485 },
  Matsuyama: { lat: 33.8404, lng: 132.7657 },
  Takamatsu: { lat: 34.3503, lng: 134.0469 },
  Tottori: { lat: 35.4927, lng: 134.2256 },
  Matsue: { lat: 35.4646, lng: 133.064 },
  Niigata: { lat: 37.9121, lng: 139.0614 },
  "Okinawa City": { lat: 26.3344, lng: 127.8056 },
};

function busEligible(
  dest: Destination,
  coords: { lat: number; lng: number },
): boolean {
  const originZoneId = resolveOriginTransportZone({ coordinates: coords });
  if (!originZoneId || originZoneId === "unknown") return false;
  const destZoneId = resolveDestinationTransportZone(dest);
  if (destZoneId === "unknown") return false;
  const eligible = getEligibleOriginModes({
    originZoneId,
    destinationZoneId: destZoneId,
    destination: dest,
  });
  const authorized = new Set(
    originZoneId === destZoneId ? eligible.localModes : eligible.crossZoneModes,
  );
  if (!authorized.has("bus")) return false;
  const modes = getValidModes(
    dest,
    "none",
    ["bus"],
    coords,
    undefined,
    originZoneId,
    undefined,
  );
  if (modes.length === 0) return false;
  return matchesPersonalizedDayTripDuration(
    dest,
    { homeStationCoords: coords, originZoneId },
    ["bus"],
    "any",
  );
}

describe("KAI-63 same-zone divergence", () => {
  it("destination eligible from some origins but not same-zone others", () => {
    // Heavy audit: 25 origins × full catalogue × canonical bus evaluation.
    const t0 = Date.now();
    const byZone = new Map<
      string,
      Array<[string, { lat: number; lng: number }]>
    >();
    for (const [name, coords] of Object.entries(ORIGINS)) {
      const zone = resolveOriginTransportZone({ coordinates: coords });
      if (!byZone.has(zone)) byZone.set(zone, []);
      byZone.get(zone)!.push([name, coords]);
    }
    for (const [zone, origins] of byZone) {
      if (origins.length < 2) continue;
      for (const dest of allDests) {
        const eligibleFrom = origins.filter(([, coords]) =>
          busEligible(dest, coords),
        );
        if (
          eligibleFrom.length === 0 ||
          eligibleFrom.length === origins.length
        ) {
          continue;
        }
        const ineligible = origins.filter((o) => !eligibleFrom.includes(o));
        console.log(
          `${dest.id.padEnd(34)} ${ineligible.map(([n]) => n).join(",")} (not from) | eligible: ${eligibleFrom.map(([n]) => n).join(",")}`,
        );
      }
      console.log(`--- zone ${zone} done ---`);
    }
    console.log(`divergence audit took ${Date.now() - t0}ms`);
  }, 180000);
});
