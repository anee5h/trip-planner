import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "../TransportTopologyService";
import { topology } from "../TransportTopologyService";

const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const TAKAMATSU = { lat: 34.34, lng: 134.05 };
const SADO = { lat: 38.0333, lng: 138.3833 };
const NAOSHIMA = { lat: 34.4597, lng: 133.9961 };
const NAHA = { lat: 26.2124, lng: 127.6809 };

function mockDest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "test-dest",
    name: "Test Destination",
    nameJa: "テスト",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: ["Nature"],
    tags: [],
    coordinates: { lat: 35.0, lng: 139.0 },
    transportOptions: { train: 60 },
    role: "standalone",
    status: "published",
    totalTripHours: 8,
    budgetMin: 1000,
    budgetMax: 4000,
    budgetRecommended: 2500,
    ratingCount: 1,
    ...overrides,
  } as Destination;
}

describe("resolveOriginTransportZone", () => {
  it("Fukuoka coordinates resolve to mainland-kyushu", () => {
    expect(resolveOriginTransportZone({ coordinates: FUKUOKA })).toBe(
      "mainland-kyushu",
    );
  });

  it("Takamatsu coordinates resolve to mainland-shikoku", () => {
    expect(resolveOriginTransportZone({ coordinates: TAKAMATSU })).toBe(
      "mainland-shikoku",
    );
  });

  it("Sado coordinates resolve to sado", () => {
    expect(resolveOriginTransportZone({ coordinates: SADO })).toBe("sado");
  });

  it("Naoshima coordinates resolve to naoshima", () => {
    expect(resolveOriginTransportZone({ coordinates: NAOSHIMA })).toBe(
      "naoshima",
    );
  });

  it("unknown coordinates resolve to unknown", () => {
    expect(
      resolveOriginTransportZone({ coordinates: { lat: 0, lng: 0 } }),
    ).toBe("unknown");
  });

  it("station label prefecture resolves a mainland origin", () => {
    expect(
      resolveOriginTransportZone({
        coordinates: { lat: 33.95, lng: 130.94 },
        label: "Shimonoseki Station, Yamaguchi",
      }),
    ).toBe("mainland-honshu");
  });

  // KAI-12 regression: coordinate-only origins on the strait edges must
  // resolve to the correct mainland zone. The previous shikoku bounding box
  // (lat ≤ 34.5) overlapped Hiroshima, mis-resolving a major origin and
  // zeroing its shinkansen eligibility; the narrowed boxes must not trade
  // that for mis-resolving the Kyushu/Hokkaido sides of the Kanmon/Tsugaru
  // straits or Shikoku's Takamatsu waterfront.
  it.each([
    ["Hiroshima Station", 34.398, 132.475],
    ["Okayama Station", 34.666, 133.919],
    ["Tottori Station", 35.494, 134.234],
    ["Shimonoseki Station", 33.95, 130.94],
    ["Onomichi Station", 34.409, 133.199],
    ["Kure Station", 34.248, 132.556],
    ["Ujina Port (Hiroshima)", 34.373, 132.456],
    ["Tappi Cape (Honshu, Tsugaru)", 41.43, 140.34],
  ])(
    "coordinate-only origin %s resolves to mainland-honshu",
    (_n, lat, lng) => {
      expect(resolveOriginTransportZone({ coordinates: { lat, lng } })).toBe(
        "mainland-honshu",
      );
    },
  );

  it.each([
    ["Kokura Station", 33.885, 130.883],
    ["Mojiko Station (Kyushu, Kanmon)", 33.945, 130.961],
    ["Oita Station", 33.239, 131.604],
    ["Kagoshima-Chuo Station", 31.583, 130.542],
  ])(
    "coordinate-only origin %s resolves to mainland-kyushu",
    (_n, lat, lng) => {
      expect(resolveOriginTransportZone({ coordinates: { lat, lng } })).toBe(
        "mainland-kyushu",
      );
    },
  );

  it.each([
    ["Takamatsu Station", 34.351, 134.047],
    ["Takamatsu Port (ferry terminal)", 34.367, 134.05],
    ["Matsuyama Station", 33.84, 132.76],
    ["Kochi Station", 33.567, 133.544],
    ["Tokushima Station", 34.073, 134.552],
    ["Uwajima Station", 33.225, 132.568],
  ])(
    "coordinate-only origin %s resolves to mainland-shikoku",
    (_n, lat, lng) => {
      expect(resolveOriginTransportZone({ coordinates: { lat, lng } })).toBe(
        "mainland-shikoku",
      );
    },
  );

  it.each([
    ["Hakodate Station", 41.774, 140.728],
    ["Sapporo Station", 43.068, 141.351],
    ["Matsumae (Hokkaido, Tsugaru)", 41.43, 140.11],
    ["Fukushima-cho (Hokkaido, Tsugaru)", 41.48, 140.25],
  ])("coordinate-only origin %s resolves to hokkaido", (_n, lat, lng) => {
    expect(resolveOriginTransportZone({ coordinates: { lat, lng } })).toBe(
      "hokkaido",
    );
  });

  it("coordinate-only origin Mutsu (Honshu side of Tsugaru) resolves to mainland-honshu", () => {
    expect(
      resolveOriginTransportZone({ coordinates: { lat: 41.29, lng: 141.21 } }),
    ).toBe("mainland-honshu");
  });
});

describe("resolveDestinationTransportZone", () => {
  it("an explicit transportZoneId wins over coordinates", () => {
    const dest = mockDest({
      id: "explicit-island",
      transportZoneId: "ishigaki",
      coordinates: { lat: 35.0, lng: 139.0 },
    });
    expect(resolveDestinationTransportZone(dest)).toBe("ishigaki");
  });

  it("resolves a mainland destination from its prefecture", () => {
    const dest = mockDest({ id: "osaka-city", prefecture: "Osaka" });
    expect(resolveDestinationTransportZone(dest)).toBe("mainland-honshu");
  });

  it("resolves ishigaki-city to ishigaki without name matching", () => {
    const dest = mockDest({
      id: "ishigaki-city",
      prefecture: "Okinawa",
      coordinates: { lat: 24.3448, lng: 124.1572 },
      transportZoneId: "ishigaki",
    });
    expect(resolveDestinationTransportZone(dest)).toBe("ishigaki");
  });

  it("resolves an island-marked record without assignment to unknown", () => {
    const dest = mockDest({
      id: "unassigned-island",
      kind: "island",
      prefecture: "Nagano",
      coordinates: { lat: 35.4, lng: 137.4 },
    });
    expect(resolveDestinationTransportZone(dest)).toBe("unknown");
  });
});

describe("getEligibleOriginModes", () => {
  const nahaDest = mockDest({
    id: "naha-city",
    prefecture: "Okinawa",
    coordinates: NAHA,
    transportZoneId: "okinawa-main",
  });

  it("unknown origin → island returns no cross-zone modes", () => {
    const r = getEligibleOriginModes({
      originZoneId: "unknown",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.crossZoneModes).toEqual([]);
  });

  it("no topology connection returns no cross-zone modes", () => {
    const r = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "sado",
      destination: mockDest({ transportZoneId: "sado" }),
    });
    expect(r.crossZoneModes).toEqual([]);
  });

  it("same-zone Naha exposes local Yui Rail modes", () => {
    const r = getEligibleOriginModes({
      originZoneId: "okinawa-main",
      destinationZoneId: "okinawa-main",
      destination: nahaDest,
    });
    expect(r.localModes).toContain("train");
  });

  it("mainland rail edges remain explicit", () => {
    const hokkaido = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "hokkaido",
      destination: mockDest({ transportZoneId: "hokkaido" }),
    });
    expect(hokkaido.crossZoneModes).toContain("shinkansen");
    expect(hokkaido.crossZoneModes).not.toContain("car");
  });
});

describe("topology data integrity", () => {
  it("edges only carry rail/road/bus modes", () => {
    const RAIL_ROAD_BUS = new Set([
      "train",
      "shinkansen",
      "car",
      "my_car",
      "bus",
    ]);
    for (const edge of topology.edges) {
      for (const mode of edge.modes) {
        expect(RAIL_ROAD_BUS.has(mode)).toBe(true);
      }
    }
  });

  it("zone ids are unique", () => {
    const ids = topology.zones.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
