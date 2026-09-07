import { describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import {
  getOriginAwareTransportEstimate,
  resetOriginAwareEstimateCache,
} from "../OriginAwareTransportService";
import { getSafeGroundEstimate } from "../SafeGroundEstimateService";
import { getDistanceKm } from "../TransportEstimator";
import type { Destination } from "@/shared/types/destination";

const catalogue = destinations as unknown as Destination[];
const destination = (id: string): Destination => {
  const found = catalogue.find((item) => item.id === id);
  if (!found) throw new Error(`Missing audit destination: ${id}`);
  return found;
};

const cases = [
  {
    id: "nakayama-roppongi-transit",
    origin: { lat: 35.514745, lng: 139.539692 },
    destination: "roppongi-hills-tokyo-city-view",
    mode: "train" as const,
    referenceMinutes: 55,
  },
  {
    id: "shizu-kirin-transit",
    origin: { lat: 35.7272, lng: 140.2375 },
    destination: "kirin-beer-yokohama-factory",
    mode: "train" as const,
    referenceMinutes: 118,
  },
  {
    id: "yokohama-tokyo-car",
    origin: { lat: 35.4437, lng: 139.638 },
    destination: "roppongi-hills-tokyo-city-view",
    mode: "car" as const,
    referenceMinutes: 53,
  },
  {
    id: "yokohama-kawagoe-car",
    origin: { lat: 35.4437, lng: 139.638 },
    destination: "kawagoe-kurazukuri",
    mode: "car" as const,
    referenceMinutes: 97,
  },
  {
    id: "yokohama-boso-car",
    origin: { lat: 35.4437, lng: 139.638 },
    destination: "boso-peninsula",
    mode: "car" as const,
    referenceMinutes: 125,
  },
  {
    id: "chidoribashi-hikone-transit",
    origin: { lat: 34.6847, lng: 135.4572 },
    destination: "hikone-castle-shiga",
    mode: "train" as const,
    referenceMinutes: 125,
  },
  {
    id: "chidoribashi-amanohashidate-transit",
    origin: { lat: 34.6847, lng: 135.4572 },
    destination: "amanohashidate-kyoto",
    mode: "train" as const,
    referenceMinutes: 198,
  },
  {
    id: "kuga-tsuwano-transit",
    origin: { lat: 34.087, lng: 132.078 },
    destination: "tsuwano-castle",
    mode: "train" as const,
    referenceMinutes: 353,
  },
] as const;

describe("travel-time accuracy regression audit", () => {
  it("does not promote broad prefecture corridors to destination truth", () => {
    for (const item of cases.filter((entry) => entry.mode === "train")) {
      resetOriginAwareEstimateCache();
      const dest = destination(item.destination);
      const estimate = getOriginAwareTransportEstimate(
        dest,
        {
          homeStationCoords: item.origin,
          originPrefecture: "audit-origin",
          originMunicipalityId: "audit-origin:unknown",
        },
        ["train"],
      );
      expect(estimate, item.id).toBeTruthy();
      expect(estimate?.estimateSource, item.id).toBe("rough");
      expect(estimate?.source, item.id).not.toBe("verified_ground_route");
      expect(estimate?.fallbackReason, item.id).toBeTruthy();
    }
  });

  it("does not promote destination-local access into an end-to-end journey", () => {
    const localAccessOnly = {
      ...destination("tsuwano-castle"),
      transportOptions: { train: 12 },
      localAccessModes: ["train" as const],
    };
    const estimate = getOriginAwareTransportEstimate(
      localAccessOnly,
      { homeStationCoords: { lat: 34.087, lng: 132.078 } },
      ["train"],
    );

    expect(estimate).toBeTruthy();
    expect(estimate?.timeRange[0]).toBeGreaterThan(12);
    expect(estimate?.source).toBe("rough_transit_fallback");
    expect(estimate?.fare).toBeUndefined();
  });

  it("sets a low-confidence boundary for regional transit", () => {
    for (const id of [
      "chidoribashi-hikone-transit",
      "chidoribashi-amanohashidate-transit",
      "kuga-tsuwano-transit",
    ]) {
      const item = cases.find((entry) => entry.id === id)!;
      resetOriginAwareEstimateCache();
      const estimate = getOriginAwareTransportEstimate(
        destination(item.destination),
        { homeStationCoords: item.origin, originPrefecture: "audit-origin" },
        ["train"],
      );
      expect(estimate?.confidence, id).toBe("low");
      expect(estimate?.timeRange[0], id).toBeGreaterThanOrEqual(180);
      expect(estimate?.estimateSource, id).toBe("rough");
      expect(estimate?.decisionSemantics, id).toBe("conservative");
    }
  });

  it("keeps metro and suburban fallbacks door-to-door and non-precise", () => {
    for (const id of ["nakayama-roppongi-transit", "shizu-kirin-transit"]) {
      const item = cases.find((entry) => entry.id === id)!;
      const estimate = getSafeGroundEstimate(destination(item.destination), {
        homeStationCoords: item.origin,
        authorizedModes: ["train"],
      });
      expect(estimate, id).toBeTruthy();
      expect(estimate?.estimateSource, id).toBe("rough");
      const midpoint = (estimate!.timeRange[0] + estimate!.timeRange[1]) / 2;
      expect(Math.abs(midpoint - item.referenceMinutes), id).toBeLessThan(35);
    }
  });

  it("uses a detour and speed band for car fallback instead of one multiplier", () => {
    for (const item of cases.filter((entry) => entry.mode === "car")) {
      const estimate = getSafeGroundEstimate(destination(item.destination), {
        homeStationCoords: item.origin,
        authorizedModes: ["car"],
      });
      expect(estimate, item.id).toBeTruthy();
      expect(estimate?.estimateSource, item.id).toBe("rough");
      const diagnostics = estimate?.diagnostics as {
        straightLineDistanceKm: number;
        roadDistanceKm?: number;
        detourFactor?: number;
      };
      expect(diagnostics.roadDistanceKm, item.id).toBeGreaterThan(
        diagnostics.straightLineDistanceKm,
      );
      expect(diagnostics.detourFactor, item.id).toBeGreaterThan(1);
    }
  });

  it("makes effective-speed calculations explicit for every transit regression", () => {
    for (const item of cases.filter((entry) => entry.mode === "train")) {
      const dest = destination(item.destination);
      const distanceKm = getDistanceKm(
        item.origin.lat,
        item.origin.lng,
        dest.coordinates!.lat,
        dest.coordinates!.lng,
      );
      const estimate = getOriginAwareTransportEstimate(
        dest,
        { homeStationCoords: item.origin, originPrefecture: "audit-origin" },
        ["train"],
      );
      const midpoint = (estimate!.timeRange[0] + estimate!.timeRange[1]) / 2;
      const megurutoSpeed = distanceKm / (midpoint / 60);
      const referenceSpeed = distanceKm / (item.referenceMinutes / 60);
      expect(Number.isFinite(megurutoSpeed), item.id).toBe(true);
      expect(Number.isFinite(referenceSpeed), item.id).toBe(true);
      expect(megurutoSpeed).toBeGreaterThan(0);
      expect(referenceSpeed).toBeGreaterThan(0);
    }
  });
});
