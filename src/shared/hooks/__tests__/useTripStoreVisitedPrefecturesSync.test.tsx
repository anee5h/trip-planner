/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripStoreProvider, useTripStore } from "../useTripStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const syncState = vi.hoisted(() => ({
  setVisitedPrefectures: null as Dispatch<SetStateAction<string[]>> | null,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/shared/hooks/useTripSync", () => ({
  useTripSync: (args: {
    setVisitedPrefectures: Dispatch<SetStateAction<string[]>>;
  }) => {
    syncState.setVisitedPrefectures = args.setVisitedPrefectures;
    return {
      profileSyncStatus: "ready",
      tripSyncStatus: "ready",
      retryProfileHydration: vi.fn(),
      retryTripHydration: vi.fn(),
      persistCorrectedOrigin: vi.fn().mockResolvedValue(undefined),
      persistSelectedOrigin: vi.fn().mockResolvedValue(true),
    };
  },
}));

let root: Root;
let host: HTMLDivElement;
let store: ReturnType<typeof useTripStore>;
let renderCount = 0;

function Consumer() {
  renderCount += 1;
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

describe("TripStore visited prefecture sync", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    renderCount = 0;
    syncState.setVisitedPrefectures = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("adds the destination prefecture and preserves parent/date cascade behavior", () => {
    render();

    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-10");
    });

    expect(store.visited).toContain("hakodate-night-view");
    expect(store.visited).toContain("hakodate-city");
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");
    expect(store.getVisitedDates("hakodate-night-view")).toEqual([
      "2026-05-10",
    ]);
    expect(store.getVisitedDates("hakodate-city")).toEqual(["2026-05-10"]);

    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-12");
    });

    expect(store.getVisitedDates("hakodate-city")).toEqual([
      "2026-05-10",
      "2026-05-12",
    ]);
  });

  it("preserves a newer prefecture value across later cascade updates", () => {
    render();

    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-10");
    });

    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");

    act(() => {
      syncState.setVisitedPrefectures?.(["Tokyo"]);
    });

    expect(store.visitedPrefectures).toEqual(
      expect.arrayContaining(["Hokkaido\x8D", "Tokyo"]),
    );

    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-12");
    });

    expect(store.visitedPrefectures).toEqual(
      expect.arrayContaining(["Hokkaido\x8D", "Tokyo"]),
    );
  });

  it("stabilizes after equivalent updates without looping", () => {
    render();

    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-10");
    });

    const rendersAfterFirstVisit = renderCount;

    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-10");
    });

    expect(store.getVisitedDates("hakodate-night-view")).toEqual([
      "2026-05-10",
    ]);
    expect(store.getVisitedDates("hakodate-city")).toEqual(["2026-05-10"]);
    expect(renderCount - rendersAfterFirstVisit).toBeLessThan(3);
  });
});
