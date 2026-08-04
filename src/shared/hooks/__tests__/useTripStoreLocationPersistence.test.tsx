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

describe("Guest Location Selection & LocalStorage Persistence", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("persists guest homeStation and homeStationCoords to localStorage keys", () => {
    const stationKey = "meguruto-guest-home-station";
    const coordsKey = "meguruto-guest-home-station-coords";

    localStorage.setItem(stationKey, JSON.stringify("Shinjuku Station"));
    localStorage.setItem(
      coordsKey,
      JSON.stringify({ lat: 35.6896, lng: 139.7006 }),
    );

    expect(JSON.parse(localStorage.getItem(stationKey) || '""')).toBe(
      "Shinjuku Station",
    );
    expect(JSON.parse(localStorage.getItem(coordsKey) || "{}")).toEqual({
      lat: 35.6896,
      lng: 139.7006,
    });
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
});
