/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripStoreProvider, useTripStore } from "../useTripStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  profileSyncStatus: "loading",
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-a" } }),
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

beforeEach(() => {
  state.profileSyncStatus = "loading";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("TripStore profile mutation guard", () => {
  it("blocks account mutations until hydration is ready", () => {
    render();

    act(() => {
      store.toggleFavorite("kyoto-city");
      store.addVisitedDate("fushimi-inari-kyoto", "2026-05-01");
    });

    expect(store.canMutateProfile).toBe(false);
    expect(store.favorites).toEqual([]);
    expect(store.visited).toEqual([]);

    state.profileSyncStatus = "ready";
    render();
    act(() => {
      store.toggleFavorite("kyoto-city");
      store.addVisitedDate("fushimi-inari-kyoto", "2026-05-01");
    });

    expect(store.canMutateProfile).toBe(true);
    expect(store.favorites).toEqual(["kyoto-city"]);
    expect(store.visited).toContain("fushimi-inari-kyoto");
  });

  it("creates localized smart titles at the store boundary", () => {
    render();

    let created: ReturnType<typeof store.addTrip> | undefined;
    act(() => {
      created = store.addTrip("", "2026-08-08", undefined, {
        locale: "ja",
      });
    });

    expect(created?.title).toBe("旅行 · 2026年8月8日");
    expect(store.trips[0]?.title).toBe("旅行 · 2026年8月8日");

    act(() => {
      created = store.addTrip("0808", "2026-08-08", undefined, {
        locale: "en",
        destinationName: "Kamakura",
      });
    });

    expect(created?.title).toBe("Trip to Kamakura — Aug 8, 2026");
  });
});
