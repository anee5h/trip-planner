/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTripSync, type UseTripSyncReturn } from "../useTripSync";

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

interface HarnessValue {
  sync: UseTripSyncReturn;
  favorites: string[];
  visited: string[];
}

let latest: HarnessValue;
let root: Root;
let host: HTMLDivElement;
const setHomeStationCoords = vi.fn();

function Harness({ user }: { user: User | null }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [visitedPrefectures, setVisitedPrefectures] = useState<string[]>([]);
  const [visitedDates, setVisitedDates] = useState<
    Record<string, string[] | string>
  >({});
  const [compareList, setCompareList] = useState<string[]>([]);
  const [homeStation, setHomeStation] = useState("Tokyo Station");
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
    homeStation,
    setHomeStation,
    setHomeStationCoords,
    destinationRatings,
    setDestinationRatings,
  });

  latest = { sync, favorites, visited };
  return null;
}

const user = { id: "user-a" } as User;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function render(userValue: User | null) {
  act(() => root.render(<Harness user={userValue} />));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.maybeSingle.mockReset();
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.toastError.mockReset();
  setHomeStationCoords.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useTripSync profile hydration", () => {
  it("stays loading until cloud data is ready without writing it back", async () => {
    const request = deferred<{
      data: Record<string, unknown>;
      error: null;
    }>();
    mocks.maybeSingle.mockReturnValue(request.promise);

    render(user);
    expect(latest.sync.profileSyncStatus).toBe("loading");
    expect(mocks.upsert).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve({
        data: {
          favorites: ["kyoto-city"],
          visited: ["fushimi-inari-kyoto"],
          visited_prefectures: ["Kyoto"],
          visited_dates: { "fushimi-inari-kyoto": ["2026-05-01"] },
          destination_ratings: {},
          home_station: "Kyoto Station",
          updated_at: "2026-05-02T10:00:00.000Z",
        },
        error: null,
      });
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("ready");
    expect(latest.favorites).toEqual(["kyoto-city"]);
    expect(latest.visited).toContain("fushimi-inari-kyoto");

    act(() => vi.advanceTimersByTime(1_100));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("moves an error through loading to ready when retried", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: new Error("offline") })
      .mockResolvedValueOnce({
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
      render(user);
      await Promise.resolve();
    });
    expect(latest.sync.profileSyncStatus).toBe("error");

    await act(async () => {
      latest.sync.retryProfileHydration();
      await Promise.resolve();
    });

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
    expect(latest.sync.profileSyncStatus).toBe("ready");
  });

  it("ignores a late response after logout", async () => {
    const request = deferred<{ data: null; error: Error }>();
    mocks.maybeSingle.mockReturnValue(request.promise);

    render(user);
    render(null);

    await act(async () => {
      request.resolve({ data: null, error: new Error("late") });
      await Promise.resolve();
    });

    expect(latest.sync.profileSyncStatus).toBe("idle");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
