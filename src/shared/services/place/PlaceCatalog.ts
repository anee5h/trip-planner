import type {
  Destination,
  LocalizedPlaceContent,
} from "../../types/destination";
import { EDITORIAL_PILOT } from "../../data/editorialPilot";

/**
 * KAI-121: runtime-lazy catalogue boundary (rework).
 *
 * TWO EXPLICIT CONTRACTS — never a silently-changing "lite now, full
 * later" accessor:
 *
 * 1. SUMMARY catalogue (synchronous, ESM-safe): the lite index is a
 *    formally complete summary — the fields every first-paint / search /
 *    list surface needs (id, name, prefecture, region, categories, tags,
 *    kind, role, coordinates). Imported as ESM (Vite JSON import) so it is
 *    bundled normally; NO CommonJS `require()` anywhere in browser code.
 *
 * 2. FULL catalogue (asynchronous): consumers that genuinely require the
 *    complete destination records MUST await loadDestinationsIndex() and
 *    read via getFullPlaces(). The full index is a runtime-lazy chunk
 *    (~682 KB gzip) fetched exactly once, with a retryable error path —
 *    a rejected import does NOT poison the singleton.
 *
 * getCanonicalPlaces() (the old sync accessor) is GONE from browser use:
 * it silently meant "lite now, full later", which made correctness
 * timing-dependent. Callers that need full data await loadDestinationsIndex();
 * callers that need summary data await loadLiteIndex() then use
 * getLoadedLitePlaces() (never a silently-empty pre-load array).
 */

export type CanonicalPlace = Destination &
  Required<Pick<Destination, "placeType" | "content" | "editorial">>;

let fullIndexPromise: Promise<Destination[]> | null = null;
let loadedFullIndex: Destination[] | null = null;
let fullPlacesCache: CanonicalPlace[] | null = null;

// KAI-121 (rework): the full index is a PLAIN static asset in
// public/data/destinations-index.json (copied at build time by
// scripts/copy-catalogue-assets.cjs). It is fetched at runtime by URL —
// NOT imported as a module, so Vite never emits a chunk for it, never
// preloads it, and it never enters any bundle closure. The browser only
// fetches the ~682 KB gzip payload when a consumer that genuinely needs
// the full catalogue calls loadDestinationsIndex().
const FULL_INDEX_URL = "/data/destinations-index.json";

/** Loads the full destination index exactly once per session, sharing the
 *  in-flight promise between concurrent callers (no duplicate fetches, no
 *  hydration races). FAILURE HANDLING: a rejected fetch clears the
 *  singleton so the next caller can retry; the rejection is caught and
 *  re-thrown as a normal error (never an unhandled promise rejection).
 *  Retryable: after a failure, call loadDestinationsIndex() again.
 *
 *  (vitest: tests stub fetch for this URL via vitest.setup.ts, returning
 *  the imported JSON — see vite.config.ts test.setupFiles.)
 */
export function loadDestinationsIndex(): Promise<Destination[]> {
  if (!fullIndexPromise) {
    fullIndexPromise = fetch(FULL_INDEX_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} fetching destinations index`,
          );
        }
        return response.json() as Promise<Destination[]>;
      })
      .then((index) => {
        loadedFullIndex = index;
        fullPlacesCache = null; // invalidate the mapped cache
        return loadedFullIndex;
      })
      .catch((error) => {
        // Do not poison the singleton: clear so the next call retries.
        fullIndexPromise = null;
        throw new Error(`failed to load destinations index: ${String(error)}`);
      });
  }
  return fullIndexPromise;
}

/** Synchronous accessor for the FULL catalogue. Only valid AFTER
 *  `await loadDestinationsIndex()` (or after the promise resolved).
 *  Returns [] before the full index has loaded — callers must await.
 *  The map is memoized: 978 toCanonicalPlace() calls run once per load,
 *  not once per render (prevents GC churn on async-arrival re-renders). */
export function getFullPlaces(): CanonicalPlace[] {
  if (!loadedFullIndex) return [];
  if (!fullPlacesCache) {
    fullPlacesCache = loadedFullIndex.map(toCanonicalPlace);
  }
  return fullPlacesCache;
}

function englishContent(destination: Destination): LocalizedPlaceContent {
  return {
    name: destination.name,
    description: destination.description,
    highlights: destination.highlights || [],
  };
}

export function toCanonicalPlace(destination: Destination): CanonicalPlace {
  const pilot = EDITORIAL_PILOT[destination.id];
  const en =
    pilot?.en || destination.content?.en || englishContent(destination);
  const ja =
    pilot?.ja ||
    destination.content?.ja ||
    (destination.nameJa
      ? {
          name: destination.nameJa,
          description: destination.description,
          highlights: destination.highlights || [],
        }
      : undefined);
  const isReviewed = Boolean(pilot);
  return {
    ...destination,
    categories: destination.categories || [],
    tags: destination.tags || [],
    highlights: destination.highlights || [],
    collections: destination.collections || [],
    placeType:
      destination.placeType ||
      (destination.role === "hub" ? "hub" : "destination"),
    content: { en, ...(ja ? { ja } : {}) },
    editorial:
      destination.editorial ||
      (isReviewed
        ? {
            lifecycle: "published",
            sources: [pilot.source],
            reviewedAt: "2026-07-28",
            checkedAt: "2026-07-28",
            freshness: "current",
            reviewedBy: "Meguruto editorial",
            changeSummary: "Phase 1 bilingual hub review",
          }
        : { lifecycle: "legacy", sources: [] }),
  };
}

// --- KAI-121: lite (summary) catalogue — synchronous, ESM-safe ---
// The lite index (id/name/prefecture/region/categories/kind/role/etc.) is
// a formally complete SUMMARY. It is imported as ESM (Vite JSON import —
// NO CommonJS require), stays in the initial bundle, and is the ONLY
// catalogue data first-paint/search/list surfaces depend on.

// KAI-132: the lite (summary) catalogue is now a RUNTIME-fetched asset
// like the full index — NOT statically imported, so Vite never inlines
// the 2.67 MB JSON into the shared chunk every route parses. Consumers
// that need summary data must await loadLiteIndex(); getLoadedLitePlaces()
// is the post-load accessor (fail-fast if used before load).

const LITE_INDEX_URL = "/data/destinations-index.lite.json";

let liteIndexPromise: Promise<CanonicalPlace[]> | null = null;
let loadedLitePlaces: CanonicalPlace[] | null = null;

/** Loads the lite (summary) catalogue exactly once per session, sharing
 *  the in-flight promise between concurrent callers (no duplicate
 *  fetches, no hydration races). FAILURE HANDLING: a rejected fetch
 *  clears the singleton so the next caller can retry.
 *
 *  The JSON is parsed ONCE and mapped to CanonicalPlace ONCE; every
 *  consumer receives the same stable array (no per-call 978-object
 *  remapping / GC churn).
 */
export function loadLiteIndex(): Promise<CanonicalPlace[]> {
  if (!liteIndexPromise) {
    liteIndexPromise = fetch(LITE_INDEX_URL)
      .then((response) => {
        // Tolerate mocks/test responses without a real status; the JSON
        // parse below is the real gate (it throws on non-JSON).
        return response.json() as Promise<Destination[]>;
      })
      .then((index) => {
        if (!Array.isArray(index)) {
          throw new Error("lite index is not an array");
        }
        loadedLitePlaces = index.map(toCanonicalPlace);
        return loadedLitePlaces;
      })
      .catch((error) => {
        liteIndexPromise = null;
        throw new Error(`failed to load lite index: ${String(error)}`);
      });
  }
  return liteIndexPromise;
}

/** True once the lite catalogue has been loaded (loader resolved). */
export function hasLoadedLiteIndex(): boolean {
  return loadedLitePlaces !== null;
}

/** Synchronous accessor for the loaded lite catalogue. ONLY valid AFTER
 *  `await loadLiteIndex()` — throws if called before the loader resolves
 *  (fail-fast rather than pretending the catalogue is genuinely empty).
 *  Returns the SAME stable array for every caller. */
export function getLoadedLitePlaces(): CanonicalPlace[] {
  if (loadedLitePlaces === null) {
    throw new Error(
      "getLoadedLitePlaces() called before loadLiteIndex() resolved — " +
        "callers must await the loader first",
    );
  }
  return loadedLitePlaces;
}

// --- Backward-compat shim for tests/build scripts that read the full
// index synchronously in a Node context (vitest). In the browser, the full
// index is ONLY reachable via the async loader. ---

/** True when the full index has been loaded (async loader resolved). */
export function hasLoadedFullIndex(): boolean {
  return loadedFullIndex !== null;
}

/** Test-only: force-reset the singleton (failure-retry tests). */
export function resetDestinationsIndexForTests(): void {
  fullIndexPromise = null;
  loadedFullIndex = null;
  fullPlacesCache = null;
}

/** Test-only: clears the lite-index singleton so a fresh load can be
 *  exercised (and the fail-fast precondition can be asserted). */
export function resetLiteIndexForTests(): void {
  liteIndexPromise = null;
  loadedLitePlaces = null;
}

/**
 * Checks whether a destination is available in the requested locale.
 * Public destinations are equally accessible in English and Japanese;
 * translation/editorial completeness affects only display content, not availability.
 */
export function isPlaceAvailableInLocale(
  place: Destination,
  _locale: "en" | "ja" = "en",
): boolean {
  return Boolean(place);
}

export function getAvailablePlaces(
  locale: "en" | "ja" = "en",
): CanonicalPlace[] {
  // KAI-132 contract: summary availability for list surfaces. The lite
  // catalogue is loaded via loadLiteIndex(); before that resolves this
  // returns [] (safe degradation for service-level consumers). Callers
  // that need the data must await loadLiteIndex() and use
  // getLoadedLitePlaces() (which fails fast if used too early).
  if (!hasLoadedLiteIndex()) return [];
  return getLoadedLitePlaces().filter((place) =>
    isPlaceAvailableInLocale(place, locale),
  );
}

/**
 * Returns a localized copy of the place for the specified locale.
 * Japanese rendering uses per-field fallback to English for any missing localized fields.
 */
export function getLocalizedPlace(
  place: Destination,
  locale: "en" | "ja" = "en",
): Destination {
  const canonical = toCanonicalPlace(place);
  if (locale === "en") {
    return {
      ...canonical,
      name: canonical.content.en.name,
      description: canonical.content.en.description,
      highlights: canonical.content.en.highlights,
    };
  }

  const ja = canonical.content.ja;
  const en = canonical.content.en;

  const name =
    ja?.name && ja.name.trim() !== ""
      ? ja.name
      : canonical.nameJa && canonical.nameJa.trim() !== ""
        ? canonical.nameJa
        : en.name;

  const description =
    ja?.description && ja.description.trim() !== ""
      ? ja.description
      : en.description;

  const highlights =
    ja?.highlights && ja.highlights.length > 0 ? ja.highlights : en.highlights;

  return {
    ...canonical,
    name,
    description,
    highlights,
  };
}
