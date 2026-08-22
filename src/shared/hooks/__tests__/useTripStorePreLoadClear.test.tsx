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
let prefValueCommits = 0;
let lastPrefValue = "";

function Consumer() {
  store = useTripStore();
  // Count every commit whose visitedPrefectures VALUE differs from the
  // previous commit — the churn signal (remove→re-add) the guard avoids.
  const serialized = JSON.stringify(store.visitedPrefectures);
  if (serialized !== lastPrefValue) {
    lastPrefValue = serialized;
    prefValueCommits += 1;
  }
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

  it("never transiently removes a still-justified prefecture during reconciliation", async () => {
    render();
    hydrateVisited(["hakodate-night-view", "hakodate-city"], ["Hokkaido\x8D"], {
      "hakodate-night-view": ["2026-05-10"],
      "hakodate-city": ["2026-05-11"],
    });

    act(() => {
      store.clearAllVisits("hakodate-night-view");
    });
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");

    // Baseline: commits consumed so far (hydration + clear).
    const baselineCommits = prefValueCommits;
    expect(baselineCommits).toBeGreaterThan(0);

    // With the guard, reconciliation finds nothing to prune (the sibling
    // still justifies Hokkaido) and must commit ZERO visitedPrefectures
    // value changes. Without the guard, the prune removes Hokkaido and
    // the back-fill effect re-adds it — a spurious remove→re-add cycle
    // (extra value-changing commits) even though React batches away the
    // intermediate value.

    await act(async () => {
      await destinationsMetaState.release();
    });

    // Flush remaining microtask-committed renders.
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    // The churn assertion: with the guard, NO visitedPrefectures
    // value-changing commit happens after the clear (reconciliation is a
    // no-op). Without the guard, the remove→re-add cycle adds commits.
    expect(prefValueCommits).toBe(baselineCommits);
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");
  });

  it("keeps the prefecture when a removed destination is re-added before metadata resolves (race)", async () => {
    render();
    hydrateVisited(["hakodate-night-view"], ["Hokkaido\x8D"], {
      "hakodate-night-view": ["2026-05-10"],
    });

    // Remove A while metadata is unresolved…
    act(() => {
      store.toggleVisited("hakodate-night-view");
    });
    expect(store.visited).toEqual([]);

    // …then re-add A BEFORE metadata resolves.
    act(() => {
      store.addVisitedDate("hakodate-night-view", "2026-05-12");
    });
    expect(store.visited).toEqual(["hakodate-night-view"]);
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");

    await act(async () => {
      await destinationsMetaState.release();
    });

    // The prefecture must remain throughout/finally. (The parent-hub
    // cascade re-adds hakodate-city as a visited hub — documented
    // synchronous-era behavior preserved by the lazy path.)
    expect(store.visited).toEqual(
      expect.arrayContaining(["hakodate-night-view", "hakodate-city"]),
    );
    expect(store.getVisitedDates("hakodate-night-view")).toEqual([
      "2026-05-12",
    ]);
    expect(store.getVisitedDates("hakodate-city")).toEqual(["2026-05-12"]);
    expect(store.visitedPrefectures).toContain("Hokkaido\x8D");
  });
});
