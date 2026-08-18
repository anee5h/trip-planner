import type {
  Destination,
  LocalizedPlaceContent,
} from "../../types/destination";
import { EDITORIAL_PILOT } from "../../data/editorialPilot";

/**
 * KAI-121: runtime-lazy catalogue boundary.
 *
 * The full destinations index (~6.2 MB raw) is NOT statically imported
 * here anymore — a static import drags the entire catalogue into every
 * route that touches PlaceCatalog (Home included, via the recommendation
 * path). Instead the full index is fetched once via a dynamic import,
 * shared across callers by a module-level promise singleton.
 *
 * getCanonicalPlaces() stays SYNCHRONOUS for compatibility (it returns
 * the lite summary until the full index has loaded, then the full data);
 * loadDestinationsIndex() is the async entry that triggers the lazy
 * fetch. Routes that need the full catalogue call loadDestinationsIndex()
 * on mount (e.g. Home) so the 6.2 MB loads as a fetched chunk, not in the
 * initial JS bundle.
 */

export type CanonicalPlace = Destination &
  Required<Pick<Destination, "placeType" | "content" | "editorial">>;

let fullIndexPromise: Promise<Destination[]> | null = null;
/** The settled full index, once loaded. */
let loadedFullIndex: Destination[] | null = null;

/** Loads the full destination index exactly once per session, sharing the
 *  in-flight promise between concurrent callers (no duplicate fetches, no
 *  hydration races). The full catalogue is fetched as a lazy chunk. */
export function loadDestinationsIndex(): Promise<Destination[]> {
  if (!fullIndexPromise) {
    fullIndexPromise = import("../../data/destinations-index.json").then(
      (mod) => {
        loadedFullIndex = mod.default as Destination[];
        return loadedFullIndex;
      },
    );
  }
  return fullIndexPromise;
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

/** Synchronous accessor for the canonical catalogue (KAI-121). Returns
 *  the full data once the lazy index has loaded, else the lite summary —
 *  existing sync consumers keep working unchanged; Home preloads the full
 *  index via loadDestinationsIndex() so the 6.2 MB arrives as a fetched
 *  chunk, not in the initial bundle. */
export function getCanonicalPlaces(): CanonicalPlace[] {
  const source = loadedFullIndex ?? getLiteIndex();
  return source.map(toCanonicalPlace);
}

/** Synchronous accessor for the canonical catalogue when the full index
 *  has already been loaded (or for callers that only need summary data).
 *  Falls back to the lite index if the full one is not yet loaded. */
export function getCanonicalPlacesSync(): CanonicalPlace[] {
  const source = loadedFullIndex ?? getLiteIndex();
  return source.map(toCanonicalPlace);
}

// --- KAI-121: lite (summary) catalogue for first-paint routes ---
// The lite index (id/name/prefecture/region/categories/kind/role) stays in
// the initial bundle for synchronous summary access; the full index loads
// lazily only for routes that truly need it.

let liteIndex: Destination[] | null = null;

function getLiteIndex(): Destination[] {
  if (!liteIndex) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    liteIndex =
      require("../../data/destinations-index.lite.json") as Destination[];
  }
  return liteIndex;
}

/** Synchronous summary accessor (KAI-121). Returns the lite catalogue for
 *  first-paint rails. Callers that need full destination content must
 *  await getCanonicalPlaces() instead. */
export function getLitePlaces(): CanonicalPlace[] {
  return getLiteIndex().map(toCanonicalPlace);
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
  return getCanonicalPlaces().filter((place) =>
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
