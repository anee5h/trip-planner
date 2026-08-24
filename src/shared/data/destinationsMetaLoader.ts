/**
 * KAI-147: destinations-meta as a runtime-lazy chunk.
 *
 * ROOT CAUSE (KAI-147 production LCP diagnosis): useTripStore and
 * useTripSync statically imported destinations-meta.json (277 KB raw,
 * ~207 KB after minification, ~60 KB gzip). Vite inlined it into the
 * shared LocaleContext chunk that is modulepreloaded by the entry HTML,
 * so every cold load downloaded + parsed the whole destination catalogue
 * before React could mount — production mobile FCP/LCP measured 3.3–6.2 s
 * with the H1 as both FCP and sole LCP candidate.
 *
 * This loader follows the established KAI-121 pattern (see PlaceCatalog):
 * a singleton dynamic import with retry-on-failure. The chunk is emitted
 * by Vite as a separate lazy asset; it is NOT in the bootstrap preload
 * set, so it no longer delays first paint.
 *
 * CONSUMERS:
 *  - useTripStore: prefecture/relationship lookups for visited-prefecture
 *    derivation. The provider starts the load when visited state becomes
 *    non-empty; untouched guest home never imports this chunk. Mutation
 *    handlers also consult the resolved snapshot before React state catches
 *    up, preserving synchronous-era cascade semantics.
 *  - useTripSync: deriveVisitedPrefectures() falls back to the
 *    server-persisted visited_prefectures list when meta has not loaded
 *    yet — the authoritative list still round-trips; derivation only adds
 *    missing parents once meta is present.
 */
import type { Destination } from "@/shared/types/destination";

let destinationsMetaPromise: Promise<Destination[]> | null = null;
let destinationsMetaSnapshot: Destination[] | null = null;

/**
 * Test-only override seam (KAI-147 review): lets tests hold the metadata
 * unresolved across store mutations. Production never installs an
 * override; when `null` is installed the real chunk import is used.
 */
type MetaOverride = () => Promise<Destination[]>;
let metaOverride: MetaOverride | null = null;

export function installMetaOverride(override: MetaOverride | null): void {
  const wasOverridden = metaOverride !== null;
  metaOverride = override;
  // Any override transition invalidates cached state so tests start clean.
  if (override !== null || wasOverridden) {
    destinationsMetaPromise = null;
    destinationsMetaSnapshot = null;
  }
}

export function getDestinationsMetaSnapshot(): Destination[] | null {
  return destinationsMetaSnapshot;
}

/** Loads the lightweight destination metadata index exactly once per
 *  session (shared promise between concurrent callers). Retryable: a
 *  failed import clears the singleton so the next call retries. Never
 *  leaves an unhandled rejection behind. */
export function loadDestinationsMeta(): Promise<Destination[]> {
  if (!destinationsMetaPromise) {
    destinationsMetaPromise = (
      metaOverride
        ? metaOverride()
        : import(
            /* webpackChunkName: "destinations-meta" */ "@/shared/data/destinations-meta.json"
          ).then((module) => module.default as Destination[])
    )
      .then((meta) => {
        destinationsMetaSnapshot = meta;
        return meta;
      })
      .catch((error) => {
        // Do not poison the singleton: clear so the next call retries.
        destinationsMetaPromise = null;
        throw error;
      });
  }
  return destinationsMetaPromise;
}
