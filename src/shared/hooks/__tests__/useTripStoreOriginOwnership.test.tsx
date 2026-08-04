/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripStoreProvider, useTripStore } from "../useTripStore";
import type { OriginLocation } from "../useTripStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

vi.stubGlobal("window", { localStorage: mockLocalStorage });
vi.stubGlobal("localStorage", mockLocalStorage);

const state = vi.hoisted(() => ({
  profileSyncStatus: "ready",
  user: null as { id: string } | null,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock("@/shared/hooks/useTripSync", () => ({
  useTripSync: () => ({
    profileSyncStatus: state.profileSyncStatus,
    tripSyncStatus: "ready",
    retryProfileHydration: vi.fn(),
    retryTripHydration: vi.fn(),
  }),
}));

let root: Root;
let host: HTMLDivElement;
let store: ReturnType<typeof useTripStore>;

function Consumer() {
  store = useTripStore();
  return null;
}

function render() {
  act(() =>
    root.render(
      <TripStoreProvider>
        <Consumer />
      </TripStoreProvider>,
    ),
  );
}

const nakayamaOrigin: OriginLocation = {
  label: "Nakayama Station, Kanagawa",
  coordinates: { lat: 35.5147, lng: 139.5393 },
  source: "station",
};

beforeEach(() => {
  state.profileSyncStatus = "ready";
  state.user = null;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("TripStore — guest origin ownership (provider level)", () => {
  it("guest selects a non-Tokyo station and origin is committed atomically", () => {
    render();
    act(() => store.setOriginLocation(nakayamaOrigin));

    expect(store.homeStation).toBe("Nakayama Station, Kanagawa");
    expect(store.homeStationCoords).toEqual({ lat: 35.5147, lng: 139.5393 });

    const saved = JSON.parse(
      localStorage.getItem("meguruto-guest-origin") || "{}",
    );
    expect(saved.label).toBe("Nakayama Station, Kanagawa");
    expect(saved.coordinates).toEqual({ lat: 35.5147, lng: 139.5393 });
    expect(saved.source).toBe("station");
  });

  it("provider remount restores the selected guest origin", () => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify(nakayamaOrigin),
    );
    render();

    expect(store.homeStation).toBe("Nakayama Station, Kanagawa");
    expect(store.homeStationCoords).toEqual({ lat: 35.5147, lng: 139.5393 });
  });

  it("malformed stored origin falls back to Tokyo Station", () => {
    localStorage.setItem("meguruto-guest-origin", "not-valid-json");
    render();

    expect(store.homeStation).toBe("Tokyo Station");
    expect(store.homeStationCoords).toEqual({ lat: 35.6812, lng: 139.7671 });
  });

  it("malformed origin with missing coordinates falls back to Tokyo Station", () => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify({
        label: "Some Station",
        coordinates: null,
        source: "station",
      }),
    );
    render();

    expect(store.homeStation).toBe("Tokyo Station");
  });

  it("malformed origin with non-finite coordinates falls back to Tokyo Station", () => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify({
        label: "Some Station",
        coordinates: { lat: NaN, lng: 139.6 },
        source: "station",
      }),
    );
    render();

    expect(store.homeStation).toBe("Tokyo Station");
  });

  it("empty label origin falls back to Tokyo Station", () => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify({
        label: "",
        coordinates: { lat: 35.6, lng: 139.6 },
        source: "station",
      }),
    );
    render();

    expect(store.homeStation).toBe("Tokyo Station");
  });

  it("setOriginLocation persists guest origin to localStorage", () => {
    render();
    act(() => store.setOriginLocation(nakayamaOrigin));

    const persisted = JSON.parse(
      localStorage.getItem("meguruto-guest-origin") || "{}",
    );
    expect(persisted.label).toBe("Nakayama Station, Kanagawa");
    expect(persisted.coordinates).toEqual({ lat: 35.5147, lng: 139.5393 });
  });

  it("does not overwrite the persisted guest snapshot when an account changes origin", () => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify(nakayamaOrigin),
    );
    state.user = { id: "account-a" };
    render();

    act(() =>
      store.setOriginLocation({
        label: "Shin-Yokohama Station, Kanagawa",
        coordinates: { lat: 35.5076, lng: 139.6177 },
        source: "station",
      }),
    );

    expect(store.homeStation).toBe("Shin-Yokohama Station, Kanagawa");
    expect(
      JSON.parse(localStorage.getItem("meguruto-guest-origin") || "{}"),
    ).toEqual(nakayamaOrigin);
  });

  it("migrates legacy separate keys to atomic origin key", () => {
    localStorage.setItem(
      "meguruto-guest-home-station",
      JSON.stringify("Nakayama Station, Kanagawa"),
    );
    localStorage.setItem(
      "meguruto-guest-home-station-coords",
      JSON.stringify({ lat: 35.5147, lng: 139.5393 }),
    );

    render();

    expect(store.homeStation).toBe("Nakayama Station, Kanagawa");
    expect(store.homeStationCoords).toEqual({ lat: 35.5147, lng: 139.5393 });

    expect(localStorage.getItem("meguruto-guest-home-station")).toBeNull();
    expect(
      localStorage.getItem("meguruto-guest-home-station-coords"),
    ).toBeNull();

    const atomic = JSON.parse(
      localStorage.getItem("meguruto-guest-origin") || "{}",
    );
    expect(atomic.label).toBe("Nakayama Station, Kanagawa");
  });

  it("incomplete legacy key pair (station only) does not create mixed state", () => {
    localStorage.setItem(
      "meguruto-guest-home-station",
      JSON.stringify("Nakayama Station, Kanagawa"),
    );
    // no coords key

    render();

    expect(store.homeStation).toBe("Tokyo Station");
    expect(store.homeStationCoords).toEqual({ lat: 35.6812, lng: 139.7671 });
  });

  it("incomplete legacy key pair (coords only) does not create mixed state", () => {
    localStorage.setItem(
      "meguruto-guest-home-station-coords",
      JSON.stringify({ lat: 35.5147, lng: 139.5393 }),
    );
    // no station key

    render();

    expect(store.homeStation).toBe("Tokyo Station");
  });

  it("rejects out-of-range stored coordinates", () => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify({
        label: "Invalid Station",
        coordinates: { lat: 91, lng: 181 },
        source: "station",
      }),
    );
    render();

    expect(store.homeStation).toBe("Tokyo Station");
  });
});
