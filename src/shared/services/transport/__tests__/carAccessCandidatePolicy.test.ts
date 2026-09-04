import { describe, expect, it, vi, beforeEach } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  getRoutableCarAccessAnchors,
  resolveCarAccess,
} from "@/shared/services/transport/CarAccessService";
import { getSafeGroundEstimate } from "@/shared/services/transport/SafeGroundEstimateService";
import { getTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";

const all = destinationsIndex as unknown as Destination[];
const byId = (id: string) => all.find((d) => d.id === id)!;

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const SAPPORO = { lat: 43.0618, lng: 141.3545 };

function synthetic(
  id: string,
  overrides: Partial<Destination> = {},
): Destination {
  return {
    ...byId("tokyo-station-chiyoda"),
    ...overrides,
    id,
  } as Destination;
}

describe("KAI-264 safe first-wave candidate policy", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("ordinary main-island destination with coordinates becomes candidate_resolvable", () => {
    const dest = synthetic("ordinary-mainland-town", {
      name: "Ordinary Mainland Town",
      coordinates: { lat: 35.9, lng: 139.9 },
      carAccess: undefined,
      transportOptions: {},
      localAccessModes: undefined,
    });
    const resolution = resolveCarAccess(dest);
    expect(resolution.kind).toBe("candidate");
    expect(getRoutableCarAccessAnchors(dest).length).toBe(1);
    expect(resolution.candidateAnchor?.id).toBe(
      "ordinary-mainland-town@candidate",
    );
  });

  it("explicit ferry_required state blocks candidate derivation", () => {
    const dest = synthetic("ferry-only-island", {
      coordinates: { lat: 35.9, lng: 139.9 },
      carAccess: {
        state: "ferry_required",
        eligibility: "unknown",
        anchors: [],
        evidence: "fixture" as never,
        sourceUrls: [],
      },
    });
    expect(resolveCarAccess(dest).kind).not.toBe("candidate");
    expect(getRoutableCarAccessAnchors(dest).length).toBe(0);
  });

  it("explicit unavailable eligibility blocks candidate derivation", () => {
    const dest = synthetic("no-road-dest", {
      coordinates: { lat: 35.9, lng: 139.9 },
      carAccess: {
        state: "unknown",
        eligibility: "unavailable",
        anchors: [],
        evidence: "fixture" as never,
        sourceUrls: [],
      },
    });
    expect(resolveCarAccess(dest).kind).toBe("unavailable");
    expect(getRoutableCarAccessAnchors(dest).length).toBe(0);
  });

  it("explicit restricted eligibility blocks candidate derivation", () => {
    const dest = synthetic("restricted-dest", {
      coordinates: { lat: 35.9, lng: 139.9 },
      carAccess: {
        state: "unknown",
        eligibility: "restricted",
        anchors: [],
        evidence: "fixture" as never,
        sourceUrls: [],
      },
    });
    expect(resolveCarAccess(dest).kind).toBe("restricted");
    expect(getRoutableCarAccessAnchors(dest).length).toBe(0);
  });

  it("known seasonal closure blocks candidate derivation", () => {
    const dest = synthetic("seasonal-closure-dest", {
      coordinates: { lat: 35.9, lng: 139.9 },
      carAccess: {
        state: "seasonal",
        eligibility: "unknown",
        anchors: [],
        evidence: "fixture" as never,
        sourceUrls: [],
      },
    });
    expect(resolveCarAccess(dest).kind).not.toBe("candidate");
  });

  it("boat-only local access blocks candidate derivation", () => {
    const dest = synthetic("boat-only-dest", {
      coordinates: { lat: 35.9, lng: 139.9 },
      localAccessModes: ["ferry" as never],
      transportOptions: {},
      carAccess: undefined,
    });
    expect(resolveCarAccess(dest).kind).not.toBe("candidate");
  });

  it("Hokkaido destination stays locally candidate-accessible (destination-side)", () => {
    const sapporo = byId("sapporo-city");
    const resolution = resolveCarAccess(sapporo);
    expect(resolution.kind).toBe("candidate");
    expect(getRoutableCarAccessAnchors(sapporo).length).toBeGreaterThan(0);
  });

  it("Honshu origin → Hokkaido destination: no continuous-road estimate (topology)", () => {
    const sapporo = byId("sapporo-city");
    // Same SafeGround zone gate that blocks any fabricated water crossing.
    const estimate = getSafeGroundEstimate(sapporo, {
      homeStationCoords: TOKYO,
      homeStationTransportZoneId: "mainland-honshu",
      authorizedModes: ["car"],
    });
    expect(estimate == null).toBe(true);
    expect(estimate).toBeNull();
  });

  it("Hokkaido origin → Hokkaido destination allows the deterministic estimate", () => {
    const sapporo = byId("sapporo-city");
    const estimate = getSafeGroundEstimate(sapporo, {
      homeStationCoords: SAPPORO,
      homeStationTransportZoneId: "hokkaido",
      authorizedModes: ["car"],
    });
    expect(estimate).toBeDefined();
    expect(estimate!.evidence).toBe("estimated");
  });

  it("bridge-connected island (Awaji, mainland zone) may be a candidate", () => {
    const awaji = byId("awaji-farm-park-england-hill");
    const resolution = resolveCarAccess(awaji);
    // Awaji maps to mainland-honshu (bridge-connected): candidate allowed.
    expect(resolution.kind).toBe("candidate");
  });

  it("ferry-only island (non-major zone) is NOT a continuous-road candidate", () => {
    // Synthetic non-legacy record on Okinawa (zone okinawa-main, outside the
    // four major land zones): the safe first wave must NOT promote it.
    const island = synthetic("island-dest-okinawa-no-legacy", {
      name: "Island Destination",
      coordinates: { lat: 26.2124, lng: 127.6809 },
      carAccess: undefined,
      transportOptions: {},
      localAccessModes: undefined,
    });
    const resolution = resolveCarAccess(island);
    expect(resolution.kind).not.toBe("candidate");
    expect(getRoutableCarAccessAnchors(island).length).toBe(0);
  });

  it("endpoint-sensitive POI (onsen) remains unknown unless an explicit endpoint exists", () => {
    const onsen = byId("ginzan-onsen-yamagata");
    const resolution = resolveCarAccess(onsen);
    expect(resolution.kind).not.toBe("candidate");
    expect(resolution.kind).toBe("unknown");
  });

  it("discovery with a newly promoted candidate uses SafeGroundEstimate (no ORS involved)", () => {
    const dest = synthetic("ordinary-mainland-town2", {
      name: "Ordinary Mainland Town Two",
      coordinates: { lat: 35.9, lng: 139.9 },
      carAccess: undefined,
      transportOptions: {},
      localAccessModes: undefined,
    });
    const evidence = getTravelDurationEvidence(
      dest,
      {
        homeStationCoords: TOKYO,
        homeStationTransportZoneId: "mainland-honshu",
      } as never,
      ["my_car"],
    );
    expect(evidence.evidence).toBe("estimated");
    expect(evidence.estimate?.evidence).toBe("estimated");
    // No provider facts leak into the estimate.
    expect("distanceKm" in (evidence.estimate ?? {})).toBe(false);
  });

  it("candidate expansion creates no canonical fuel/toll/routed-distance truth", () => {
    const dest = byId("sapporo-city");
    const evidence = getTravelDurationEvidence(
      dest,
      {
        homeStationCoords: SAPPORO,
        homeStationTransportZoneId: "hokkaido",
      } as never,
      ["my_car"],
    );
    expect(evidence.evidence).toBe("estimated");
    const estimate = evidence.estimate;
    expect(estimate?.evidence).toBe("estimated");
    expect("distanceKm" in (estimate ?? {})).toBe(false);
  });
});
