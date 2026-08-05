import { describe, expect, it } from "vitest";
import type { Destination } from "../../../types/destination";
import {
  resolveOriginTransportZone,
  resolveDestinationTransportZone,
  getEligibleOriginModes,
  buildTransportJourneyEstimate,
} from "../TransportTopologyService";

function mockDest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "test-dest",
    name: "Test",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    tags: [],
    coordinates: { lat: 35.6812, lng: 139.7671 },
    ...overrides,
  } as unknown as Destination;
}

const TOKYO_COORDS = { lat: 35.6812, lng: 139.7671 };
const NAHA_COORDS = { lat: 26.2124, lng: 127.6792 };
const OGASAWARA_COORDS = { lat: 27.0945, lng: 142.1918 };

// ---- Origin Zone Resolution ----

describe("resolveOriginTransportZone", () => {
  it("resolves Tokyo to mainland-honshu", () => {
    expect(resolveOriginTransportZone({ coordinates: TOKYO_COORDS })).toBe(
      "mainland-honshu",
    );
  });

  it("resolves Naha coordinates to okinawa-main", () => {
    expect(resolveOriginTransportZone({ coordinates: NAHA_COORDS })).toBe(
      "okinawa-main",
    );
  });

  it("resolves Ogasawara coords to ogasawara", () => {
    expect(resolveOriginTransportZone({ coordinates: OGASAWARA_COORDS })).toBe(
      "ogasawara",
    );
  });

  it("resolves by label prefecture when coords are missing", () => {
    expect(
      resolveOriginTransportZone({
        coordinates: { lat: 0, lng: 0 },
        label: "Osaka Station",
      }),
    ).toBe("mainland-honshu");
  });

  it("returns unknown for unrecognized coords and label", () => {
    expect(
      resolveOriginTransportZone({ coordinates: { lat: 0, lng: 0 } }),
    ).toBe("unknown");
  });
});

// ---- Destination Zone Resolution ----

describe("resolveDestinationTransportZone", () => {
  const nahaCity: Destination = mockDest({
    id: "naha-city",
    name: "Naha City",
    prefecture: "Okinawa",
    coordinates: NAHA_COORDS,
  });

  const ogasawaraDest: Destination = mockDest({
    id: "ogasawara-islands",
    name: "Ogasawara Islands",
    prefecture: "Tokyo",
    categories: ["Island", "Nature"],
    tags: ["Remote", "Ferry"],
    coordinates: OGASAWARA_COORDS,
  });

  it("resolves naha-city to okinawa-main by prefecture", () => {
    expect(resolveDestinationTransportZone(nahaCity)).toBe("okinawa-main");
  });

  it("resolves Ogasawara by name key", () => {
    expect(resolveDestinationTransportZone(ogasawaraDest)).toBe("ogasawara");
  });

  it("resolves Sado by tags", () => {
    const sado = mockDest({
      id: "sado-island",
      name: "Sado Island",
      prefecture: "Niigata",
      categories: ["Island"],
      tags: ["Remote"],
      coordinates: { lat: 38.0333, lng: 138.3833 },
    });
    expect(resolveDestinationTransportZone(sado)).toBe("sado");
  });

  it("defaults unmarked Honshu destinations to mainland-honshu", () => {
    const kyoto = mockDest({
      id: "kiyomizudera",
      name: "Kiyomizudera",
      prefecture: "Kyoto",
      categories: ["Temple"],
    });
    expect(resolveDestinationTransportZone(kyoto)).toBe("mainland-honshu");
  });
});

// ---- Eligibility ----

describe("getEligibleOriginModes", () => {
  const nahaDest = mockDest({
    id: "naha-city",
    name: "Naha",
    prefecture: "Okinawa",
    coordinates: NAHA_COORDS,
  });
  const ogasawaraDest = mockDest({
    id: "ogasawara",
    name: "Ogasawara",
    categories: ["Island"],
    tags: ["Remote"],
    coordinates: OGASAWARA_COORDS,
  });
  const tokyoDest = mockDest({
    id: "tokyo",
    name: "Tokyo",
    prefecture: "Tokyo",
    coordinates: TOKYO_COORDS,
  });

  // Test 1: Tokyo → Naha rejects all land modes
  it("Tokyo → Naha: flight and ferry only, no land modes", () => {
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.crossZoneModes).toContain("flight");
    expect(r.crossZoneModes).toContain("ferry");
    expect(r.crossZoneModes).not.toContain("train");
    expect(r.crossZoneModes).not.toContain("shinkansen");
    expect(r.crossZoneModes).not.toContain("bus");
    expect(r.crossZoneModes).not.toContain("car");
    expect(r.crossZoneModes).not.toContain("my_car");
  });

  // Test 2: Kyushu (closer) → Naha still rejects train
  it("Kyushu → Naha: still no train", () => {
    const r = getEligibleOriginModes({
      originZoneId: "mainland-kyushu",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.crossZoneModes).toContain("flight");
    expect(r.crossZoneModes).not.toContain("train");
    expect(r.crossZoneModes).not.toContain("shinkansen");
  });

  // Test 3: Naha → Naha allows local rail
  it("Naha → Naha: local modes only, includes train (Yui Rail)", () => {
    const r = getEligibleOriginModes({
      originZoneId: "okinawa-main",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.crossZoneModes).toEqual([]);
    expect(r.localModes).toContain("train");
    expect(r.localModes).toContain("bus");
    expect(r.localModes).toContain("car");
  });

  // Test 5: Mainland → Ogasawara is ferry-only
  it("Mainland → Ogasawara: ferry only, no flight/train", () => {
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "ogasawara",
      destination: ogasawaraDest,
    });
    expect(r.crossZoneModes).toEqual(["ferry"]);
    expect(r.crossZoneModes).not.toContain("flight");
    expect(r.crossZoneModes).not.toContain("train");
  });

  // Test 6: Unknown origin → island uses conservative modes
  it("Unknown origin → island: conservative modes", () => {
    const r = getEligibleOriginModes({
      originZoneId: "unknown",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.crossZoneModes).toEqual([]);
    expect(r.localModes).toEqual(["ferry"]);
  });

  // Test 7: Bridge-connected island permits road only through explicit edge
  it("Honshu → Shikoku: road via explicit bridge edge, no rail", () => {
    const shikokuDest = mockDest({
      id: "takamatsu",
      prefecture: "Kagawa",
      coordinates: { lat: 34.35, lng: 134.05 },
    });
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "mainland-shikoku",
      destination: shikokuDest,
    });
    expect(r.crossZoneModes).toContain("car");
    expect(r.crossZoneModes).toContain("bus");
    expect(r.crossZoneModes).toContain("train");
    // bridge = road, not shinkansen
    expect(r.crossZoneModes).not.toContain("shinkansen");
  });

  // Test 8: Hokkaido: rail and road independently connected
  it("Honshu → Hokkaido: rail and road independent", () => {
    const hokkaidoDest = mockDest({
      id: "sapporo",
      prefecture: "Hokkaido",
      coordinates: { lat: 43.06, lng: 141.35 },
    });
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "hokkaido",
      destination: hokkaidoDest,
    });
    expect(r.crossZoneModes).toContain("train");
    expect(r.crossZoneModes).toContain("shinkansen");
    expect(r.crossZoneModes).toContain("ferry");
    // No explicit road edge in topology
  });

  // Test 9: Distance > 400 km does not suppress valid rail
  it("Honshu → Kyushu: valid rail regardless of distance", () => {
    const kyushuDest = mockDest({
      id: "fukuoka",
      prefecture: "Fukuoka",
      coordinates: { lat: 33.59, lng: 130.4 },
    });
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "mainland-kyushu",
      destination: kyushuDest,
    });
    expect(r.crossZoneModes).toContain("shinkansen");
    expect(r.crossZoneModes).toContain("train");
  });

  // Test 10: No train edge created by proximity
  it("Mainland-honshu → Okinawa-main: no train despite proximity", () => {
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.crossZoneModes).not.toContain("train");
  });

  // Same-zone mainland
  it("Honshu → Honshu: full local mainland modes", () => {
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "mainland-honshu",
      destination: tokyoDest,
    });
    expect(r.crossZoneModes).toEqual([]);
    expect(r.localModes).toContain("train");
    expect(r.localModes).toContain("shinkansen");
    expect(r.localModes).toContain("car");
  });
});

// ---- Journey Estimates ----

describe("buildTransportJourneyEstimate", () => {
  const nahaDest = mockDest({
    id: "naha-city",
    name: "Naha",
    prefecture: "Okinawa",
    coordinates: NAHA_COORDS,
  });

  // Test 4: Flight + Yui Rail remains primarily Flight
  it("Flight + Yui Rail: primary mode is flight, local rail is access leg", () => {
    const j = buildTransportJourneyEstimate({
      originZoneId: "mainland-honshu",
      destinationZoneId: "okinawa-main",
      crossZoneModes: ["flight", "ferry"],
      localModes: ["train", "bus", "car"],
      destination: nahaDest,
    });
    expect(j.primaryMode).toBe("flight");
    expect(j.available).toBe(true);
    const crossLegs = j.legs.filter((l) => l.legType === "cross-zone");
    expect(crossLegs.map((l) => l.mode)).toContain("flight");
    const localLegs = j.legs.filter((l) => l.legType === "local-access");
    expect(localLegs.some((l) => l.label === "Yui Rail")).toBe(true);
  });

  it("Ogasawara: ferry journey, no flight fabricated", () => {
    const ogasawaraDest = mockDest({
      id: "ogasawara",
      name: "Ogasawara",
      categories: ["Island"],
      tags: ["Remote"],
      coordinates: OGASAWARA_COORDS,
    });
    const j = buildTransportJourneyEstimate({
      originZoneId: "mainland-honshu",
      destinationZoneId: "ogasawara",
      crossZoneModes: ["ferry"],
      localModes: ["bus"],
      destination: ogasawaraDest,
    });
    expect(j.primaryMode).toBe("ferry");
    expect(j.available).toBe(true);
    expect(j.legs.some((l) => l.mode === "flight")).toBe(false);
  });

  it("Unavailable when no cross-zone edge", () => {
    const sadoDest = mockDest({
      id: "sado",
      name: "Sado",
      categories: ["Island"],
      tags: ["Remote"],
      coordinates: { lat: 38.03, lng: 138.38 },
    });
    const j = buildTransportJourneyEstimate({
      originZoneId: "mainland-honshu",
      destinationZoneId: "sado",
      crossZoneModes: [],
      localModes: ["bus"],
      destination: sadoDest,
    });
    expect(j.available).toBe(false);
    expect(j.unavailableReason).toBeDefined();
  });

  it("Unknown origin → island: unavailable", () => {
    const j = buildTransportJourneyEstimate({
      originZoneId: "unknown",
      destinationZoneId: "okinawa-main",
      crossZoneModes: [],
      localModes: ["ferry"],
      destination: nahaDest,
    });
    expect(j.available).toBe(false);
  });

  it("Same-zone Naha: primary mode is local train (Yui Rail)", () => {
    const j = buildTransportJourneyEstimate({
      originZoneId: "okinawa-main",
      destinationZoneId: "okinawa-main",
      crossZoneModes: [],
      localModes: ["train", "bus", "car"],
      destination: nahaDest,
    });
    expect(j.primaryMode).toBe("train");
    expect(j.available).toBe(true);
    expect(j.legs.every((l) => l.legType === "local-access")).toBe(true);
  });
});
