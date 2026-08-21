/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTripSync, type UseTripSyncReturn } from "../useTripSync";
import type { OriginLocation, SavedOriginLocation } from "../useTripStore";
import type { Trip } from "@/shared/types/trip";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  fetchTrips: vi.fn(),
  saveTrip: vi.fn(),
  deleteTrip: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
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
    fetchTrips = mocks.fetchTrips;
    saveTrip = mocks.saveTrip;
    deleteTrip = mocks.deleteTrip;
  },
}));

const STATIONS_BY_PREFECTURE: Record<
  string,
  Array<{ name: string; lat: number; lng: number }>
> = {
  Kyoto: [{ name: "Kyoto Station", lat: 34.9875, lng: 135.7593 }],
};

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("stations-by-prefecture")) {
      return { ok: true, json: async () => STATIONS_BY_PREFECTURE };
    }
    return { ok: false, json: async () => [] };
  }),
);

const DEFAULT_ORIGIN: OriginLocation = {
  label: "Tokyo Station",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  source: "default",
};

const jwtFutureError = {
  code: "PGRST303",
  message: "JWT issued at future",
  details: null,
  hint: null,
};

const CLOUD_ROW = {
  favorites: ["kyoto-city"],
  visited: ["fushimi-inari-kyoto"],
  visited_prefectures: ["Kyoto"],
  visited_dates: { "fushimi-inari-kyoto": ["2026-05-01"] },
  destination_ratings: {},
  home_station: "Kyoto Station",
  updated_at: "2026-05-02T10:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface HarnessValue {
  sync: UseTripSyncReturn;
  favorites: string[];
  visited: string[];
  setFavorites: Dispatch<SetStateAction<string[]>>;
}

let latest: HarnessValue;
let root: Root;
let host: HTMLDivElement;

function Harness({ user }: { user: User | null }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [visitedPrefectures, setVisitedPrefectures] = useState<string[]>([]);
  const [visitedDates, setVisitedDates] = useState<
    Record<string, string[] | string>
  >({});
  const [compareList, setCompareList] = useState<string[]>([]);
  const [activeOrigin, setActiveOrigin] =
    useState<SavedOriginLocation>(DEFAULT_ORIGIN);
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
    savedHomeStation: activeOrigin.label,
    guestOrigin: DEFAULT_ORIGIN,
    setActiveOrigin,
    destinationRatings,
    setDestinationRatings,
  });

  latest = { sync, favorites, visited, setFavorites };
  return null;
}

const user = { id: "user-a" } as User;

function render(userValue: User | null) {
  act(() => root.render(<Harness user={userValue} />));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.maybeSingle.mockReset();
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.fetchTrips.mockReset().mockResolvedValue([]);
  mocks.saveTrip.mockReset().mockResolvedValue(undefined);
  mocks.deleteTrip.mockReset().mockResolvedValue(undefined);
  mocks.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: null }, error: null });
  mocks.refreshSession
    .mockReset()
    .mockResolvedValue({ data: { session: {} }, error: null });
  mocks.toastError.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useTripSync JWT-future recovery — hydration", () => {
  it("recovers transient PGRST303 with one refresh and one replay (Case A)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: jwtFutureError })
      .mockResolvedValueOnce({ data: CLOUD_ROW, error: null });

    await act(async () => {
      render(user);
      await Promise.resolve();
    });

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.favorites).toEqual(["kyoto-city"]);
    expect(latest.visited).toContain("fushimi-inari-kyoto");
    // Recovery must not fabricate writes.
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("sync.user_data.hydrate.jwt_future"),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it("stops after one refresh + one failed replay — error surfaced, no data loss (Case B)", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: jwtFutureError })
      .mockResolvedValueOnce({ data: null, error: jwtFutureError });

    await act(async () => {
      render(user);
      await Promise.resolve();
    });

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(latest.sync.profileSyncStatus).toBe("error");
    expect(mocks.toastError).toHaveBeenCalled();
    // Failed hydration must not masquerade as empty cloud data.
    expect(latest.sync.profileSyncStatus).not.toBe("ready");
    expect(latest.favorites).toEqual([]);
  });

  it("does not replay when the refresh fails (Case C)", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: jwtFutureError,
    });
    mocks.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error("refresh rejected"),
    });

    await act(async () => {
      render(user);
      await Promise.resolve();
    });

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(latest.sync.profileSyncStatus).toBe("error");
  });

  it("never refreshes for non-JWT-future errors (Case D)", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "NETWORK_ERROR", message: "fetch failed" },
    });

    await act(async () => {
      render(user);
      await Promise.resolve();
    });

    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(latest.sync.profileSyncStatus).toBe("error");
  });

  it("does not replay hydration into a signed-out state", async () => {
    const refreshPending = deferred<{
      data: { session: {} } | null;
      error: null;
    }>();
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: jwtFutureError,
    });
    mocks.refreshSession.mockReturnValue(refreshPending.promise);

    await act(async () => {
      render(user);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Sign out while the recovery refresh is in flight.
    render(null);

    await act(async () => {
      refreshPending.resolve({ data: { session: {} }, error: null });
      await Promise.resolve();
    });

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(latest.sync.profileSyncStatus).toBe("idle");
    expect(latest.favorites).toEqual([]);
  });

  it("recovers a simultaneous profile + trips failure with one refresh (stampede)", async () => {
    const refreshPending = deferred<{
      data: { session: {} } | null;
      error: null;
    }>();
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: jwtFutureError })
      .mockResolvedValueOnce({ data: CLOUD_ROW, error: null });
    mocks.fetchTrips
      .mockRejectedValueOnce(jwtFutureError)
      .mockResolvedValueOnce([]);
    mocks.refreshSession.mockReturnValue(refreshPending.promise);

    await act(async () => {
      render(user);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      refreshPending.resolve({ data: { session: {} }, error: null });
      await Promise.resolve();
    });

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.fetchTrips).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.sync.tripSyncStatus).toBe("ready");
  });

  it("recovers trips hydration after a transient PGRST303", async () => {
    const trip: Trip = {
      id: "trip-1",
      userId: "user-a",
      title: "Kyoto",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      status: "draft",
      stops: [],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };
    mocks.maybeSingle.mockResolvedValueOnce({ data: CLOUD_ROW, error: null });
    mocks.fetchTrips
      .mockRejectedValueOnce(jwtFutureError)
      .mockResolvedValueOnce([trip]);

    await act(async () => {
      render(user);
      await Promise.resolve();
    });

    expect(mocks.fetchTrips).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(latest.sync.tripSyncStatus).toBe("ready");
  });
});

describe("useTripSync JWT-future recovery — profile save", () => {
  it("recovers a transient PGRST303 on the user_data upsert", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: CLOUD_ROW, error: null });
    mocks.upsert
      .mockResolvedValueOnce({ data: null, error: jwtFutureError })
      .mockResolvedValueOnce({ data: null, error: null });

    await act(async () => {
      render(user);
      await Promise.resolve();
    });
    expect(latest.sync.profileSyncStatus).toBe("ready");

    await act(async () => {
      latest.setFavorites(["kyoto-city", "nara-city"]);
    });
    await act(async () => {
      vi.advanceTimersByTime(1_100);
      await Promise.resolve();
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
