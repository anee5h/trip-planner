/**
 * @vitest-environment jsdom
 */
import { act, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTripSync, type UseTripSyncReturn } from "../useTripSync";
import type { OriginLocation, SavedOriginLocation } from "../useTripStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: mocks.maybeSingle,
      insert: mocks.insert,
      upsert: mocks.upsert,
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/shared/services/trips/TripRepository", () => ({
  SupabaseTripRepository: class {
    fetchTrips = vi.fn().mockResolvedValue([]);
    saveTrip = vi.fn().mockResolvedValue(undefined);
    deleteTrip = vi.fn().mockResolvedValue(undefined);
  },
}));

const STATIONS_BY_PREFECTURE: Record<
  string,
  Array<{ name: string; lat: number; lng: number }>
> = {
  Kanagawa: [
    {
      name: "Shinyokohama Station (新横浜駅)",
      lat: 35.5076,
      lng: 139.6177,
    },
    { name: "Nakayama Station (中山駅)", lat: 35.5147, lng: 139.5393 },
    { name: "Duplicate Station", lat: 35.6, lng: 139.5 },
  ],
  Tokyo: [{ name: "Duplicate Station", lat: 35.5, lng: 139.6 }],
};

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("stations-by-prefecture")) {
      return {
        ok: true,
        json: async () => STATIONS_BY_PREFECTURE,
      };
    }
    return { ok: false, json: async () => [] };
  }),
);

const NAKAYAMA: OriginLocation = {
  label: "Nakayama Station, Kanagawa",
  coordinates: { lat: 35.5147, lng: 139.5393 },
  source: "station",
};

const TOKYO_DEFAULT: OriginLocation = {
  label: "Tokyo Station",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  source: "default",
};

interface HarnessValue {
  sync: UseTripSyncReturn;
  activeOrigin: SavedOriginLocation;
  setRuntimeOrigin: (origin: SavedOriginLocation) => void;
  setSavedOrigin: (origin: OriginLocation) => void;
}

let latest: HarnessValue;
let root: Root;
let host: HTMLDivElement;

function Harness({
  user,
  guestOrigin,
}: {
  user: User | null;
  guestOrigin: OriginLocation;
}) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [visitedPrefectures, setVisitedPrefectures] = useState<string[]>([]);
  const [visitedDates, setVisitedDates] = useState<
    Record<string, string[] | string>
  >({});
  const [compareList, setCompareList] = useState<string[]>([]);
  const [savedOrigin, setSavedOrigin] = useState<OriginLocation>(guestOrigin);
  const [activeOrigin, setActiveOrigin] =
    useState<SavedOriginLocation>(guestOrigin);
  const setSavedActiveOrigin = useCallback((origin: SavedOriginLocation) => {
    if (origin.coordinates) setSavedOrigin(origin as OriginLocation);
    setActiveOrigin(origin);
  }, []);
  const [destinationRatings, setDestinationRatings] = useState<
    Record<string, "up" | "down">
  >({});

  const sync = useTripSync({
    user,
    favorites,
    setFavorites,
    visited,
    setVisited,
    visitedPrefectures,
    setVisitedPrefectures,
    visitedDates,
    setVisitedDates,
    compareList,
    setCompareList,
    savedHomeStation: savedOrigin.label,
    guestOrigin,
    setActiveOrigin: setSavedActiveOrigin,
    destinationRatings,
    setDestinationRatings,
  });

  latest = {
    sync,
    activeOrigin,
    setRuntimeOrigin: setActiveOrigin,
    setSavedOrigin,
  };
  return null;
}

function render(
  user: User | null,
  guestOrigin: OriginLocation = TOKYO_DEFAULT,
) {
  act(() => root.render(<Harness user={user} guestOrigin={guestOrigin} />));
}

const userB = { id: "user-b" } as User;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.maybeSingle.mockReset();
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.toastError.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useTripSync — origin ownership integration", () => {
  it("new account with no user_data row and valid guest origin adopts guest origin", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      render(userB, NAKAYAMA);
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Nakayama Station, Kanagawa");
    expect(latest.activeOrigin.source).toBe("station");
  });

  it("new account with no user_data row and only default guest origin uses Tokyo Station", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Tokyo Station");
    expect(latest.activeOrigin.source).toBe("default");
  });

  it("existing account hydration sets activeOrigin from cloud data", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Shin-Yokohama Station, Kanagawa",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Shin-Yokohama Station, Kanagawa");
  });

  it("existing account hydration resolves current parenthetical station labels", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Shinyokohama Station (新横浜駅), Kanagawa",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.activeOrigin.label).toBe(
      "Shinyokohama Station (新横浜駅), Kanagawa",
    );
    expect(latest.activeOrigin.source).toBe("station");
    expect(latest.activeOrigin.coordinates).toEqual({
      lat: 35.5076,
      lng: 139.6177,
    });
  });

  it("existing account with Tokyo Station cloud data uses Tokyo Station", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Tokyo Station",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Tokyo Station");
  });

  it("persists a selected signed-in origin immediately and suppresses the generic debounce", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Tokyo Station",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
      await Promise.resolve();
    });
    mocks.upsert.mockClear();

    let save!: (value: { data: null; error: null }) => void;
    mocks.upsert.mockReturnValueOnce(
      new Promise((resolve) => (save = resolve)),
    );
    const mutation = latest.sync.persistSelectedOrigin(NAKAYAMA);
    act(() => latest.setSavedOrigin(NAKAYAMA));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-b", home_station: NAKAYAMA.label }),
    );

    await act(async () => {
      save({ data: null, error: null });
      await mutation;
      vi.advanceTimersByTime(1_100);
      await Promise.resolve();
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("does not apply a pending account-origin result after an account switch", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Tokyo Station",
      },
      error: null,
    });
    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
      await Promise.resolve();
    });

    let save!: (value: { data: null; error: null }) => void;
    mocks.upsert.mockReturnValueOnce(
      new Promise((resolve) => (save = resolve)),
    );
    const mutation = latest.sync.persistSelectedOrigin(NAKAYAMA);

    await act(async () => {
      render({ id: "user-c" } as User, TOKYO_DEFAULT);
      save({ data: null, error: null });
      await mutation;
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).not.toBe(NAKAYAMA.label);
    expect(mocks.upsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: "user-b", home_station: NAKAYAMA.label }),
    );
  });

  it("exposes an origin error when the explicit account save fails", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Tokyo Station",
      },
      error: null,
    });
    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
      await Promise.resolve();
    });
    mocks.upsert.mockResolvedValueOnce({ error: new Error("offline") });

    await act(async () => {
      await latest.sync.persistSelectedOrigin(NAKAYAMA);
    });

    expect(latest.sync.profileSyncStatus).toBe("origin_error");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Failed to save your home station. Please try again.",
      expect.objectContaining({ id: "origin-save-error" }),
    );
  });

  it("does not persist a runtime current origin through the account mutation", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: NAKAYAMA.label,
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
      await Promise.resolve();
    });
    mocks.upsert.mockClear();

    act(() =>
      latest.setRuntimeOrigin({
        label: "Current location",
        coordinates: { lat: 35.6595, lng: 139.7005 },
        source: "default",
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Current location");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("guest origin unchanged after account hydration", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Shin-Yokohama Station, Kanagawa",
      },
      error: null,
    });

    await act(async () => {
      render(userB, NAKAYAMA);
      await Promise.resolve();
    });

    // activeOrigin was set from cloud, but guestOrigin (NAKAYAMA) should still be in the original harness value
    // The guest Origin didn't change
    expect(latest.activeOrigin.label).toBe("Shin-Yokohama Station, Kanagawa");
  });

  it("coordinate resolution failure retains the saved label in origin_error and does not upsert", async () => {
    // Cloud has a station that cannot be resolved (not in stations JSON).
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Nonexistent Station, Nowhere",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("origin_error");
    expect(latest.activeOrigin.label).toBe("Nonexistent Station, Nowhere");
    expect(latest.activeOrigin.source).toBe("station");
    expect(latest.activeOrigin.coordinates).toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("late Account A hydration after switching to Account B is ignored", async () => {
    const userA = { id: "user-a" } as User;

    let resolveA: (value: {
      data: Record<string, unknown>;
      error: null;
    }) => void;
    const promiseA = new Promise<{
      data: Record<string, unknown>;
      error: null;
    }>((resolve) => {
      resolveA = resolve;
    });

    mocks.maybeSingle.mockReturnValueOnce(promiseA).mockResolvedValueOnce({
      data: {
        favorites: ["kyoto-city"],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Shin-Yokohama Station, Kanagawa",
      },
      error: null,
    });

    await act(async () => {
      render(userA, NAKAYAMA);
      await Promise.resolve();
    });

    // Switch to Account B without resolving A.
    await act(async () => {
      render({ id: "user-b" } as User, NAKAYAMA);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now resolve A late — must be ignored.
    await act(async () => {
      resolveA!({
        data: {
          favorites: ["should-be-ignored"],
          visited: [],
          visited_prefectures: [],
          visited_dates: {},
          destination_ratings: {},
          home_station: "Tokyo Station",
        },
        error: null,
      });
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Shin-Yokohama Station, Kanagawa");
  });

  it("retry succeeds after coordinate lookup recovers", async () => {
    // First attempt: resolution fails (station not in JSON).
    mocks.maybeSingle
      .mockResolvedValueOnce({
        data: {
          favorites: [],
          visited: [],
          visited_prefectures: [],
          visited_dates: {},
          destination_ratings: {},
          home_station: "Nonexistent Station, Nowhere",
        },
        error: null,
      })
      // Retry: resolve to a known station.
      .mockResolvedValueOnce({
        data: {
          favorites: [],
          visited: [],
          visited_prefectures: [],
          visited_dates: {},
          destination_ratings: {},
          home_station: "Shin-Yokohama Station, Kanagawa",
        },
        error: null,
      });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("origin_error");

    await act(async () => {
      latest.sync.retryProfileHydration();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.activeOrigin.label).toBe("Shin-Yokohama Station, Kanagawa");
  });

  it("Guest Nakayama -> Account A Shin-Yokohama -> logout restores Nakayama", async () => {
    const userA = { id: "user-a" } as User;

    // Account A hydrates with Shin-Yokohama.
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Shin-Yokohama Station, Kanagawa",
      },
      error: null,
    });

    await act(async () => {
      render(userA, NAKAYAMA);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Shin-Yokohama Station, Kanagawa");

    // Logout — guestOrigin (NAKAYAMA) should be restored.
    await act(async () => {
      render(null, NAKAYAMA);
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Nakayama Station, Kanagawa");
    expect(latest.activeOrigin.coordinates).toEqual(NAKAYAMA.coordinates);
  });

  it("legacy cloud station label without prefecture resolves uniquely", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Nakayama Station",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.activeOrigin.label).toBe("Nakayama Station");
    expect(latest.activeOrigin.coordinates).toEqual({
      lat: 35.5147,
      lng: 139.5393,
    });
  });

  it("ambiguous legacy station label is rejected safely", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Duplicate Station",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Retain the cloud label rather than fabricating Tokyo.
    expect(latest.sync.profileSyncStatus).toBe("origin_error");
    expect(latest.activeOrigin.label).toBe("Duplicate Station");
    expect(latest.activeOrigin.coordinates).toBeUndefined();
  });

  it("origin_error: persistCorrectedOrigin upserts corrected station and returns ready", async () => {
    // Setup: cloud has unresolvable station — triggers origin_error.
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Nonexistent Station, Nowhere",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("origin_error");
    expect(latest.activeOrigin.label).toBe("Nonexistent Station, Nowhere");
    // StationInput must be unblocked in this state.
    expect(latest.sync.profileSyncStatus).toBe("origin_error");

    // User selects Nakayama — persist the corrected station.
    await act(async () => {
      await latest.sync.persistCorrectedOrigin(NAKAYAMA);
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ home_station: NAKAYAMA.label }),
    );
    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.activeOrigin.label).toBe("Nakayama Station, Kanagawa");
  });

  it("legacy label resolves with source station, not postal_code", async () => {
    // STATIONS_BY_PREFECTURE has Nakayama Station only under Kanagawa →
    // unique match → should resolve with source: "station".
    mocks.maybeSingle.mockResolvedValue({
      data: {
        favorites: [],
        visited: [],
        visited_prefectures: [],
        visited_dates: {},
        destination_ratings: {},
        home_station: "Nakayama Station",
      },
      error: null,
    });

    await act(async () => {
      render(userB, TOKYO_DEFAULT);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.activeOrigin.label).toBe("Nakayama Station");
    expect(latest.activeOrigin.source).toBe("station");
    expect(latest.activeOrigin.coordinates).toEqual({
      lat: 35.5147,
      lng: 139.5393,
    });
  });
});
