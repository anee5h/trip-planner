# KAI-132 Phase 0 — Migration Design Report

## 1. Reproduced shared-chunk parse cost (current main `a910d772`)

**Chunk:** `dist/assets/utils-D4opjN4Y.js` = **2,321 KB raw / 371 KB gzip** (shared chunk loaded by EVERY route).

**Proof the lite catalogue is inlined:** destination names from `destinations-index.lite.json` appear in the chunk (`Abeno_Harukas` ×4, `Lake_Saroma` ×2, `kamakura-city` ×18).

**Cold-load trace (mobile 390×844, 3×, median):**

| Metric     | Value                                                         |
| ---------- | ------------------------------------------------------------- |
| TBT        | **695 ms**                                                    |
| LCP        | 804 ms                                                        |
| Long tasks | 4: +104ms→66ms, +177ms→129ms, **+389ms→342ms**, +2383ms→358ms |

The **+389ms→342ms** task is the initial render dominated by parsing the 2.3MB utils chunk; **+2383ms→358ms** is the post-load re-render executing the same chunk's code. Both trace to the inlined lite catalogue (KAI-130 profiler: utils = 920ms sampled, all app code <30ms).

**Sources of the shared-chunk inflation (static imports of the 2.67MB lite JSON):**

1. `PlaceCatalog.ts:161` — `import summaryData from "../../data/destinations-index.lite.json"` → **shared chunk** (THE blocker; getLitePlaces/getAvailablePlaces/getDestinationList all read it)
2. `useTripSync.ts:12` — `import destinationsIndex from "...lite.json"` → **shared chunk** (app-root via useTripStore; builds module-scope `destinationById` Map)

**Not shared-chunk (but must migrate):** 3. `BadgeEngine.ts:3` (passport route) — lite import lands in the passport lazy chunk (not shared), but the static import must go when the JSON becomes a runtime asset

## 2. Inventory — every sync `getLitePlaces()` dependency

### Direct `getLitePlaces()` callers (4, all SUMMARY-ONLY per KAI-121)

| Caller                               | Use                                                                                           | Loading gate today?                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Home.tsx:95`                        | `allDestinations = getLitePlaces()` in `useMemo` → feeds `useTripRecommendations` (all rails) | **None** (sync today)                               |
| `Destinations.tsx:139`               | `allDestinations = getLitePlaces().map(...)` in render                                        | **None** (has `filtersReady` for filters, not data) |
| `Compare.tsx:37`                     | `allDestinations = getLitePlaces()` in render                                                 | **None**                                            |
| `SearchableDestinationPicker.tsx:72` | `allDestinations = customDestinations ?? getLitePlaces()` in `useMemo`                        | **None**                                            |

### Transitive consumers (via `getDestinationList → getAvailablePlaces → getLitePlaces`)

- `collections.ts` (`getDestinationsForCollection` etc.) → used by **CollectionsRail, searchIndex, PassportOverview, PrefectureChecklist, DestinationFilters, CollectionBadge**
- `DestinationService.getDestinationList` → **SafeGroundEstimateService, OriginAwareTransportService, TripDurationService, LocalDiscoveryDisplayEstimator**
- `searchIndex.ts` `buildSearchIndex` (cached per-locale, KAI-121: summary-only, stable cache)

### Shared-hook static lite import

- `useTripSync.ts:90` — module-scope `destinationById` Map (id → Destination) for prefecture/station lookups, used app-root-wide

### Loading-state requirements (what surfaces need before the lite data arrives)

- **Home**: renders rails from `recommendedDestinations` synchronously — needs lite data BEFORE first rail render (critical path!). Today sync; async migration means Home must await lite load before rendering rails (or show a lightweight skeleton for TopMatches).
- **Destinations**: renders the grid from lite — needs a loading state (it has `filtersReady` pattern to extend).
- **Compare**: `compareDestinations.length === 0` early-returns an empty state — needs loading state to distinguish "loading" from "empty".
- **Picker**: options from lite — needs loading state (picker is usually in a modal; a spinner is acceptable).
- **Collections/transport/search**: used inside rails/services — inherit the caller's loading state (they render inside Home/Destinations which gate).

## 3. Migration design (proposed — for approval before implementation)

### Contract change (mirrors the full-index pattern)

Replace the static import with a **runtime-fetched lite index** using the EXACT KAI-121 full-index shape:

```ts
// PlaceCatalog.ts
const LITE_INDEX_URL = "/data/destinations-index.lite.json";
let liteIndexPromise: Promise<Destination[]> | null = null;
let loadedLiteIndex: Destination[] | null = null;

export function loadLiteIndex(): Promise<Destination[]> {
  if (!liteIndexPromise) {
    liteIndexPromise = fetch(LITE_INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((idx) => {
        loadedLiteIndex = idx;
        return loadedLiteIndex;
      })
      .catch((e) => {
        liteIndexPromise = null;
        throw e;
      }); // no poisoned singleton
  }
  return liteIndexPromise;
}
export function hasLoadedLiteIndex(): boolean {
  return loadedLiteIndex !== null;
}
```

**`getLitePlaces()` becomes:**

```ts
export function getLitePlaces(): CanonicalPlace[] {
  return (loadedLiteIndex ?? []).map(toCanonicalPlace); // [] until loaded — callers await loadLiteIndex()
}
```

### Caller migration (4 direct + transitive)

1. **Home**: `useEffect` → `loadLiteIndex().then(() => setLiteReady(true))`; render rails only when `liteReady` (or render planner immediately + rails when ready — the rails are already DeferredSection'd from KAI-130, so they naturally wait). **Critical path preserved**: planner renders first, rails mount post-load.
2. **Destinations**: `useEffect` → load; render grid when ready (reuse `filtersReady` pattern → generalize to `dataReady`).
3. **Compare**: load → render; distinguish loading vs empty.
4. **Picker**: load → options; spinner while loading.
5. **useTripSync**: the module-scope `destinationById` Map must become **lazy** — build it inside `loadLiteIndex().then()` (or a memoized async getter `getDestinationById(id)` that awaits the lite load). This is the trickiest (module-scope sync data); the map is only used for lookups, so an async `getDestinationById` works.
6. **BadgeEngine (passport)**: `await loadLiteIndex()` in its evaluation (passport is already async-friendly — badge evaluation can await).

### Build change (runtime asset emission)

- Copy `src/shared/data/destinations-index.lite.json` → `dist/data/destinations-index.lite.json` at build time (the full index already does this — extend the same copy step).
- Vite `?url` import or a build script copy; verify the JSON lands in dist/data.

### Regression guard (CI)

- Extend the KAI-121 bundle-graph assertion: **the served index.html + module graph must NOT reference `destinations-index.lite`** (i.e. no chunk statically imports it). Fail CI if the lite JSON re-enters the shared initial chunk.
- Plus: assert `dist/data/destinations-index.lite.json` exists (runtime asset emitted).

### Cache/dedup semantics

- Single in-flight promise (dedup), module-wide cache, failure clears the singleton (retry), `hasLoadedLiteIndex()` sync check, `resetForTests()`.

### Risk assessment

- **Correctness**: lite is a strict subset of the full index; all lite fields are present in the runtime JSON. The async boundary is the only change.
- **First-paint**: Home planner renders immediately (no lite dependency); rails mount post-load (DeferredSection already defers them) — no first-paint regression expected.
- **Search**: `buildSearchIndex` cache is stable (summary-only) — but it now needs the lite loaded before first build; the search trigger awaits load.
- **useTripSync**: the Map becomes async — the sync `destinationById` consumers must await. **This is the highest-risk item**; needs careful audit of all `destinationById` reads.

### Measurement plan (before/after, same harness)

- 3-run median TBT/LCP/long-tasks on the KAI-132 harness (this report's baseline: TBT 695ms, LCP 804ms)
- Target: **the ~342ms initial-parse task disappears** (utils chunk drops to ~400KB raw); TBT should drop materially (the residual +2383ms task also shrinks as the chunk's code executes less)

## 4. Decision needed before implementation

1. Approve the async `getLitePlaces()` contract + `loadLiteIndex()` shape (mirrors full index)?
2. Home strategy: render planner immediately + rails on lite-ready (recommended, preserves critical path) — OK?
3. `useTripSync` module-scope Map → async `getDestinationById`: the riskiest change — proceed, or scope it separately?
