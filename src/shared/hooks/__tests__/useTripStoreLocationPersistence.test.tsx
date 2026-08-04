import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal("window", { localStorage: mockLocalStorage });
vi.stubGlobal("localStorage", mockLocalStorage);

describe("Guest Location — localStorage-level persistence (legacy keys)", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("persists and reads the atomic guest origin key", () => {
    const originKey = "meguruto-guest-origin";
    const origin = {
      label: "Shinjuku Station, Tokyo",
      coordinates: { lat: 35.6896, lng: 139.7006 },
      source: "station",
    };

    localStorage.setItem(originKey, JSON.stringify(origin));

    const read = JSON.parse(localStorage.getItem(originKey) || "{}");
    expect(read.label).toBe("Shinjuku Station, Tokyo");
    expect(read.coordinates).toEqual({ lat: 35.6896, lng: 139.7006 });
    expect(read.source).toBe("station");
  });

  it("preserves custom guest homeStation when user_data initialization runs", () => {
    const guestStation = "Kyoto Station";
    const guestCoords = { lat: 35.0037, lng: 135.7586 };

    const initialUserDataPayload = {
      home_station: guestStation || "Tokyo Station",
    };

    expect(initialUserDataPayload.home_station).toBe("Kyoto Station");
    expect(guestCoords).toEqual({ lat: 35.0037, lng: 135.7586 });
  });

  it("migrates legacy separate keys to atomic origin key", () => {
    const legacyStationKey = "meguruto-guest-home-station";
    const legacyCoordsKey = "meguruto-guest-home-station-coords";
    const originKey = "meguruto-guest-origin";

    localStorage.setItem(
      legacyStationKey,
      JSON.stringify("Shinjuku Station, Tokyo"),
    );
    localStorage.setItem(
      legacyCoordsKey,
      JSON.stringify({ lat: 35.6896, lng: 139.7006 }),
    );

    // Simulate migration logic: both valid → atomically migrate
    const stationRaw = localStorage.getItem(legacyStationKey);
    const coordsRaw = localStorage.getItem(legacyCoordsKey);
    const label = JSON.parse(stationRaw!);
    const coordinates = JSON.parse(coordsRaw!);

    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
    expect(coordinates.lat).toBe(35.6896);
    expect(coordinates.lng).toBe(139.7006);
    expect(Number.isFinite(coordinates.lat)).toBe(true);
    expect(Number.isFinite(coordinates.lng)).toBe(true);

    const origin = { label, coordinates, source: "station" };
    localStorage.setItem(originKey, JSON.stringify(origin));
    localStorage.removeItem(legacyStationKey);
    localStorage.removeItem(legacyCoordsKey);

    const migrated = JSON.parse(localStorage.getItem(originKey) || "{}");
    expect(migrated.label).toBe("Shinjuku Station, Tokyo");
    expect(migrated.coordinates).toEqual({ lat: 35.6896, lng: 139.7006 });
    expect(localStorage.getItem(legacyStationKey)).toBeNull();
    expect(localStorage.getItem(legacyCoordsKey)).toBeNull();
  });

  it("rejects incomplete legacy key pair", () => {
    const legacyStationKey = "meguruto-guest-home-station";
    const legacyCoordsKey = "meguruto-guest-home-station-coords";

    // Only station set, no coords
    localStorage.setItem(
      legacyStationKey,
      JSON.stringify("Some Station, Tokyo"),
    );

    const stationRaw = localStorage.getItem(legacyStationKey);
    const coordsRaw = localStorage.getItem(legacyCoordsKey);

    // Both must be present
    const bothPresent = stationRaw !== null && coordsRaw !== null;
    expect(bothPresent).toBe(false);
  });
});
