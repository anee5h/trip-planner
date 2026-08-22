/**
 * @vitest-environment jsdom
 *
 * KAI-147 review blocker: pre-metadata-load clear regression.
 *
 * Reproduces the lazy-loading window: visited state exists (as after a
 * signed-in hydration) while destinations-meta has NOT resolved yet. A
 * clearAllVisits/toggleVisited in that window cannot resolve prefectures,
 * and the reconciliation effect early-returns on empty `visited`, so a
 * stale prefecture could survive and be persisted.
 *
 * Parity contract: after metadata resolves, state must equal what the old
 * synchronous-metadata behavior would have produced.
 */
import { act } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripStoreProvider, useTripStore } from "../useTripStore";
import { destinationsMetaState } from "./destinationsMetaTestControl";

vi.mock("@/shared/data/destinationsMetaLoader", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/shared/data/destinationsMetaLoader")
    >();
  return {
    ...actual,
    // route loadDestinationsMeta through the test control
    loadDestinationsMeta: () => destinationsMetaState.currentPromise(),
  };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const syncState = vi.hoisted(() => ({
  setVisitedPrefectures: null as Dispatch<SetStateAction<string[]>> | null,
  setVisited: null as Dispatch<SetStateAction<string[]>> | null,
  setVisitedDates: null as Dispatch<
    SetStateAction<Record<string, string[] | string>>
  > | null,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/shared/hooks/useTripSync", () => ({
  useTripSync: (args: {
    setVisitedPrefectures: Dispatch<SetStateAction<string[]>>;
    setVisited: Dispatch<SetStateAction<string[]>>;
    setVisitedDates?: Dispatch<
      SetStateAction<Record<string, string[] | string>>
    >;
  }) => {
    syncState.setVisitedPrefectures = args.setVisitedPrefectures;
    syncState.setVisited = args.setVisited;
    syncState.setVisitedDates = args.setVisitedDates ?? null;
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

/**
 * Hydrate visited/prefecture/dates exactly the way useTripSync's
 * successful account hydration does — via the same setters — while
 * metadata is still unresolved.
 */
function hydrateVisited(
  ids: string[],
  prefectures: string[],
  dates: Record<string, string[]>,
) {
  act(() => {
    syncState.setVisited?.(ids);
    syncState.setVisitedPrefectures?.(prefectures);
    syncState.setVisitedDates?.(dates);
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  syncState.setVisitedPrefectures = null;
  syncState.setVisited = null;
  syncState.setVisitedDates = null;
  destinationsMetaState.hold();
});

afterEach(async () => {
  await act(async () => {
    await destinationsMetaState.release();
  });
  act(() => root.unmount());
  host.remove();
});

describe("KAI-147 pre-metadata-load clear parity", () => {
  it("removes a stale prefecture when the only visited destination is cleared before metadata resolves", async () => {
    render();
    hydrateVisited(["hakodate-night-view"], ["Hokkaido\x8D"], {
      "hakodate-night-view": ["2026-05-10"],
    });

    expect(store.visited).toEqual(["hakodate-night-view"]);
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");

    // Mutate INSIDE the unresolved window (metadata still held).
    act(() => {
      store.toggleVisited("hakodate-night-view");
    });

    expect(store.visited).toEqual([]);

    // Metadata arrives AFTER the mutation — reconciliation must still run.
    await act(async () => {
      await destinationsMetaState.release();
    });

    // Parity with synchronous metadata behavior: everything gone.
    expect(store.visited).toEqual([]);
    expect(store.getVisitedDates("hakodate-night-view")).toEqual([]);
    expect(store.getVisitedDates("hakodate-city")).toEqual([]);
    expect(store.visitedPrefectures).not.toContain("Hokkaido\x8D");
    expect(store.visitedPrefectures).toEqual([]);
  });

  it("keeps a prefecture when another remaining destination shares it (multi-destination case)", async () => {
    render();
    hydrateVisited(["hakodate-night-view", "hakodate-city"], ["Hokkaido\x8D"], {
      "hakodate-night-view": ["2026-05-10"],
      "hakodate-city": ["2026-05-11"],
    });

    act(() => {
      store.clearAllVisits("hakodate-night-view");
    });

    expect(store.visited).toEqual(["hakodate-city"]);

    await act(async () => {
      await destinationsMetaState.release();
    });

    expect(store.visited).toEqual(["hakodate-city"]);
    expect(store.getVisitedDates("hakodate-city")).toEqual(["2026-05-11"]);
    expect(store.getVisitedDates("hakodate-night-view")).toEqual([]);
    // Another visited destination in the same prefecture remains → keep it.
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");
  });
});
