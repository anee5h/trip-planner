/**
 * KAI-63: Corridor-level decomposition — why destinations fail the bus
 * pipeline, per origin, split into origin-hub / destination-hub / route-row /
 * geometry sub-causes, plus per-corridor usable counts.
 */
import { describe, it } from "vitest";
import destinationsData from "../../src/shared/data/destinations-index.json";
import type { Destination } from "../../src/shared/types/destination";
import {
  BUS_ACCESS_HUBS,
  BUS_ARRIVAL_RADIUS_KM,
  MUNICIPALITY_BUS_SLUG,
  getBusRoutes,
} from "../../src/shared/services/transport/BusRouteEstimator";
import { BUS_ACCESS_RADIUS_KM } from "../../src/shared/services/transport/BusRouteEstimator";
import { resolveNearbyAccessHubs } from "../../src/shared/services/transport/IntercityAccessHubResolver";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "../../src/shared/services/transport/TransportTopologyService";
import { getOriginAwareTransportEstimate } from "../../src/shared/services/transport/OriginAwareTransportService";

const allDests = destinationsData as unknown as Destination[];

const ORIGINS: Record<string, { lat: number; lng: number }> = {
  "Tokyo (Tokyo St)": { lat: 35.6812, lng: 139.7671 },
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
  "Naha 900-8585": { lat: 26.2124, lng: 127.6809 },
  Sendai: { lat: 38.268, lng: 140.87 },
  Sapporo: { lat: 43.068, lng: 141.351 },
  Kochi: { lat: 33.5597, lng: 133.5311 },
  Nagoya: { lat: 35.1709, lng: 136.8815 },
  Koriyama: { lat: 37.4, lng: 140.36 },
  Kanazawa: { lat: 36.5782, lng: 136.6485 },
  Matsuyama: { lat: 33.8404, lng: 132.7657 },
  Kagoshima: { lat: 31.583, lng: 130.542 },
  Kumamoto: { lat: 32.7897, lng: 130.6867 },
  Nagasaki: { lat: 32.7503, lng: 129.8776 },
  Aomori: { lat: 40.8246, lng: 140.7406 },
  Morioka: { lat: 39.7015, lng: 141.1365 },
  Niigata: { lat: 37.9121, lng: 139.0614 },
  Toyama: { lat: 36.7015, lng: 137.2133 },
  Tottori: { lat: 35.4927, lng: 134.2256 },
  Matsue: { lat: 35.4646, lng: 133.064 },
  Takamatsu: { lat: 34.3503, lng: 134.0469 },
  Tokushima: { lat: 34.0745, lng: 134.5573 },
  Uwajima: { lat: 33.2237, lng: 132.5609 },
  Kushiro: { lat: 42.9838, lng: 144.3815 },
  "Okinawa City": { lat: 26.3344, lng: 127.8056 },
  Miyakojima: { lat: 24.8061, lng: 125.2811 },
};

describe("KAI-63 corridor decomposition", () => {
  it("sub-cause breakdown and per-corridor yields", () => {
    for (const [origin, coords] of Object.entries(ORIGINS)) {
      const originZoneId = resolveOriginTransportZone({ coordinates: coords });
      const buckets: Record<string, number> = {};
      const corridorUsable = new Map<string, number>();
      for (const dest of allDests) {
        const destZoneId = resolveDestinationTransportZone(dest);
        if (destZoneId === "unknown") {
          buckets["dest-zone-unknown"] =
            (buckets["dest-zone-unknown"] ?? 0) + 1;
          continue;
        }
        const eligible = getEligibleOriginModes({
          originZoneId,
          destinationZoneId: destZoneId,
          destination: dest,
        });
        const authorized = new Set(
          originZoneId === destZoneId
            ? eligible.localModes
            : eligible.crossZoneModes,
        );
        if (!authorized.has("bus")) {
          buckets["topology-no-bus"] = (buckets["topology-no-bus"] ?? 0) + 1;
          continue;
        }
        if (!dest.coordinates && !dest.municipalityId) {
          buckets["dest-no-geo"] = (buckets["dest-no-geo"] ?? 0) + 1;
          continue;
        }
        const fromHubs = resolveNearbyAccessHubs({
          location: coords,
          mode: "bus",
          hubs: BUS_ACCESS_HUBS,
          exactHubIds: [],
          radiusKm: BUS_ACCESS_RADIUS_KM,
          transportZoneId: originZoneId,
        });
        if (fromHubs.length === 0) {
          buckets["no-origin-hub"] = (buckets["no-origin-hub"] ?? 0) + 1;
          continue;
        }
        const toHubs = resolveNearbyAccessHubs({
          location: dest.coordinates ?? undefined,
          mode: "bus",
          hubs: BUS_ACCESS_HUBS,
          exactHubIds: dest.municipalityId
            ? [MUNICIPALITY_BUS_SLUG[dest.municipalityId]].filter(Boolean)
            : [],
          radiusKm: BUS_ARRIVAL_RADIUS_KM,
          transportZoneId: destZoneId,
        });
        if (toHubs.length === 0) {
          buckets["no-dest-hub"] = (buckets["no-dest-hub"] ?? 0) + 1;
          continue;
        }
        let matched = false;
        for (const fh of fromHubs) {
          for (const th of toHubs) {
            if (
              getBusRoutes(fh.hub.corridorEndpoint, th.hub.corridorEndpoint)
                .length > 0
            ) {
              matched = true;
              const key = `${fh.hub.corridorEndpoint}->${th.hub.corridorEndpoint}`;
              corridorUsable.set(key, (corridorUsable.get(key) ?? 0) + 1);
            }
          }
        }
        if (!matched) {
          buckets["no-route-row"] = (buckets["no-route-row"] ?? 0) + 1;
          continue;
        }
        // geometry reversal guards in selectGroundCandidate
        buckets["corridor-matched"] = (buckets["corridor-matched"] ?? 0) + 1;
        const est = getOriginAwareTransportEstimate(
          dest,
          { homeStationCoords: coords },
          ["bus"],
        );
        if (est) {
          buckets["estimate-ok"] = (buckets["estimate-ok"] ?? 0) + 1;
        } else {
          buckets["estimate-rejected"] =
            (buckets["estimate-rejected"] ?? 0) + 1;
        }
      }
      console.log(`\n=== ${origin} (zone ${originZoneId}) ===`);
      for (const [k, v] of Object.entries(buckets).sort(
        (a, b) => b[1] - a[1],
      )) {
        console.log(`  ${k}: ${v}`);
      }
      console.log("  usable corridors:");
      for (const [k, v] of [...corridorUsable.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        console.log(`    ${k}: ${v}`);
      }
    }
  });
});
