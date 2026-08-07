import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getLocalDiscoveryDisplayEstimate } from "../LocalDiscoveryDisplayEstimator";

const YOKOHAMA_NAKAYAMA = { lat: 35.5138, lng: 139.5397 };
const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };

const YOKOHAMA_HUB: Destination = {
  id: "yokohama-city",
  name: "Yokohama City",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:yokohama",
  coordinates: { lat: 35.4503, lng: 139.6343 },
  role: "hub",
} as unknown as Destination;

const CHIYODA_HUB: Destination = {
  id: "tokyo-station-hub",
  name: "Tokyo Station Hub",
  prefecture: "Tokyo",
  municipalityId: "Tokyo:chiyoda",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  role: "hub",
} as unknown as Destination;

const KAMAKURA_HUB: Destination = {
  id: "kamakura-station-hub",
  name: "Kamakura Hub",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:kamakura",
  coordinates: { lat: 35.319, lng: 139.55 },
  role: "hub",
} as unknown as Destination;

const mockCatalog = [YOKOHAMA_HUB, CHIYODA_HUB, KAMAKURA_HUB];

const YOKOHAMA_POI: Destination = {
  id: "minato-mirai",
  name: "Minato Mirai 21",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:yokohama",
  coordinates: { lat: 35.4578, lng: 139.6322 },
  role: "poi",
} as unknown as Destination;

const KAMAKURA_POI: Destination = {
  id: "kotoku-in",
  name: "Kotoku-in (Great Buddha)",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:kamakura",
  coordinates: { lat: 35.3167, lng: 139.5361 },
  role: "poi",
} as unknown as Destination;

const OGASAWARA_POI: Destination = {
  id: "ogasawara-islands",
  name: "Ogasawara Islands",
  prefecture: "Tokyo",
  municipalityId: "Tokyo:ogasawara",
  coordinates: { lat: 27.095, lng: 142.192 },
  role: "poi",
} as unknown as Destination;

describe("LocalDiscoveryDisplayEstimator", () => {
  it("returns calculated_local_display estimate for same-municipality POI", () => {
    const result = getLocalDiscoveryDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe("calculated_local_display");
    expect(result?.mode).toBe("train");
    expect(result?.timeRange[0]).toBeGreaterThan(0);
    expect(result?.timeRange[1]).toBeGreaterThan(result?.timeRange[0] ?? 0);
  });

  it("selects car mode when carMode preference is set", () => {
    const result = getLocalDiscoveryDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      carMode: "rental",
      allDestinations: mockCatalog,
    });

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("car");
  });

  it("returns null for cross-municipality destinations (Yokohama -> Kamakura)", () => {
    const result = getLocalDiscoveryDisplayEstimate(KAMAKURA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });

    expect(result).toBeNull();
  });

  it("returns null for cross-water destinations (Tokyo -> Ogasawara)", () => {
    const result = getLocalDiscoveryDisplayEstimate(OGASAWARA_POI, {
      homeStationCoords: TOKYO_STATION,
      allDestinations: mockCatalog,
    });

    expect(result).toBeNull();
  });

  it("returns null when origin municipality cannot be resolved", () => {
    const result = getLocalDiscoveryDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: { lat: 0, lng: 0 },
      allDestinations: mockCatalog,
    });

    expect(result).toBeNull();
  });

  it("returns null when destination has no municipalityId", () => {
    const poiNoMuni = { ...YOKOHAMA_POI, municipalityId: undefined };
    const result = getLocalDiscoveryDisplayEstimate(poiNoMuni, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });

    expect(result).toBeNull();
  });

  it("returns null when destination has no coordinates", () => {
    const poiNoCoords = { ...YOKOHAMA_POI, coordinates: undefined };
    const result = getLocalDiscoveryDisplayEstimate(
      poiNoCoords as unknown as Destination,
      {
        homeStationCoords: YOKOHAMA_NAKAYAMA,
        allDestinations: mockCatalog,
      },
    );

    expect(result).toBeNull();
  });
});
