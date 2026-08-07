import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getSafeDisplayEstimate } from "../LocalDiscoveryDisplayEstimator";

const YOKOHAMA_NAKAYAMA = { lat: 35.5138, lng: 139.5397 };
const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
const KAGOSHIMA_CITY = { lat: 31.5966, lng: 130.5571 };

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

const KAGOSHIMA_HUB: Destination = {
  id: "kagoshima-city",
  name: "Kagoshima City",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:kagoshima",
  coordinates: { lat: 31.5966, lng: 130.5571 },
  role: "hub",
} as unknown as Destination;

const mockCatalog = [YOKOHAMA_HUB, CHIYODA_HUB, KAMAKURA_HUB, KAGOSHIMA_HUB];

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

const SAKURAJIMA_POI: Destination = {
  id: "sakurajima",
  name: "Sakurajima",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:kagoshima",
  coordinates: { lat: 31.5833, lng: 130.65 },
  localAccessUnestimated: true,
  localAccessModes: ["car", "my_car", "bus"],
  role: "poi",
} as unknown as Destination;

const BUS_ONLY_YOKOHAMA_POI: Destination = {
  id: "sankei-en",
  name: "Sankeien Garden",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:yokohama",
  coordinates: { lat: 35.4167, lng: 139.6639 },
  localAccessModes: ["bus", "car"],
  role: "poi",
} as unknown as Destination;

const TOKYO_POI: Destination = {
  id: "shibuya-crossing",
  name: "Shibuya Crossing",
  prefecture: "Tokyo",
  municipalityId: "Tokyo:shibuya",
  coordinates: { lat: 35.6595, lng: 139.7004 },
  role: "poi",
} as unknown as Destination;

describe("getSafeDisplayEstimate", () => {
  // ── Preserved same-municipality behavior ──

  it("returns calculated_local_display for same-municipality POI (Nakayama → Minato Mirai)", () => {
    const result = getSafeDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe("calculated_local_display");
    expect(result?.mode).toBe("train");
    expect(result?.timeRange[0]).toBeGreaterThan(0);
  });

  it("selects car mode when carMode preference is set", () => {
    const result = getSafeDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      carMode: "rental",
      allDestinations: mockCatalog,
    });
    expect(result).not.toBeNull();
    expect(result?.mode).toBe("car");
  });

  it("returns null for localAccessUnestimated (Sakurajima)", () => {
    const result = getSafeDisplayEstimate(SAKURAJIMA_POI, {
      homeStationCoords: KAGOSHIMA_CITY,
      carMode: "my_car",
      allDestinations: mockCatalog,
    });
    expect(result).toBeNull();
  });

  it("returns null when localAccessModes excludes train", () => {
    const result = getSafeDisplayEstimate(BUS_ONLY_YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      publicModes: ["train", "bus"],
      allDestinations: mockCatalog,
    });
    expect(result).toBeNull();
  });

  it("returns null when publicModes excludes train", () => {
    const result = getSafeDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      publicModes: ["bus"],
      allDestinations: mockCatalog,
    });
    expect(result).toBeNull();
  });

  // ── New: mainland ground estimates ──

  it("returns calculated_ground_display for cross-municipality mainland (Nakayama → Kamakura)", () => {
    const result = getSafeDisplayEstimate(KAMAKURA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe("calculated_ground_display");
    expect(result?.mode).toBe("train");
    expect(result?.timeRange[0]).toBeGreaterThan(0);
  });

  it("returns calculated_ground_display for cross-municipality mainland (Tokyo → Kamakura)", () => {
    const result = getSafeDisplayEstimate(KAMAKURA_POI, {
      homeStationCoords: TOKYO_STATION,
      allDestinations: mockCatalog,
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe("calculated_ground_display");
  });

  it("returns ground estimate for Nakayama → Yokohama POI displaying a time", () => {
    const result = getSafeDisplayEstimate(YOKOHAMA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });
    expect(result).not.toBeNull();
    expect(result?.timeRange[0]).toBeGreaterThan(0);
  });

  it("returns calculated_ground_display for Nakayama → reasonable mainland Tokyo destination", () => {
    const result = getSafeDisplayEstimate(TOKYO_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe("calculated_ground_display");
  });

  // ── Island/topology guards ──

  it("returns null for Ogasawara (no train/car to remote island)", () => {
    const result = getSafeDisplayEstimate(OGASAWARA_POI, {
      homeStationCoords: TOKYO_STATION,
      allDestinations: mockCatalog,
    });
    expect(result).toBeNull();
  });

  it("returns null for Okinawa from Tokyo (no mainland train to Okinawa)", () => {
    const okinawaPoi: Destination = {
      id: "shuri-castle",
      name: "Shuri Castle",
      prefecture: "Okinawa",
      municipalityId: "Okinawa:naha",
      coordinates: { lat: 26.217, lng: 127.719 },
      role: "poi",
    } as unknown as Destination;
    const result = getSafeDisplayEstimate(okinawaPoi, {
      homeStationCoords: TOKYO_STATION,
      allDestinations: mockCatalog,
    });
    expect(result).toBeNull();
  });

  // ── Kamakura municipality distinction ──

  it("does not treat Kamakura as same-municipality when origin is Yokohama", () => {
    const result = getSafeDisplayEstimate(KAMAKURA_POI, {
      homeStationCoords: YOKOHAMA_NAKAYAMA,
      allDestinations: mockCatalog,
    });
    // Should still get an estimate (ground), but NOT same-municipality
    expect(result).not.toBeNull();
    expect(result?.source).not.toBe("calculated_local_display");
    expect(result?.source).toBe("calculated_ground_display");
  });
});
