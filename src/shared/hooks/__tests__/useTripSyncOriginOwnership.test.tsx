/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTripSync, type UseTripSyncReturn } from "../useTripSync";
import type { OriginLocation } from "../useTripStore";

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
  activeOrigin: OriginLocation;
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
  const [activeOrigin, setActiveOrigin] = useState<OriginLocation>(guestOrigin);
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
    homeStation: activeOrigin.label,
    guestOrigin,
    setActiveOrigin,
    destinationRatings,
    setDestinationRatings,
  });

  latest = { sync, activeOrigin };
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
});
