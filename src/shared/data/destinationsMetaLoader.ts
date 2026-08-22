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
 *    derivation. The provider kicks off loadDestinationsMeta() at mount;
 *    until resolved, lookups return "not found" and the visited-prefectures
 *    effect re-runs once data arrives (state dependency), preserving
 *    KAI-134 semantics.
 *  - useTripSync: deriveVisitedPrefectures() falls back to the
 *    server-persisted visited_prefectures list when meta has not loaded
 *    yet — the authoritative list still round-trips; derivation only adds
 *    missing parents once meta is present.
 */
import type { Destination } from "@/shared/types/destination";

let destinationsMetaPromise: Promise<Destination[]> | null = null;

/** Loads the lightweight destination metadata index exactly once per
 *  session (shared promise between concurrent callers). Retryable: a
 *  failed import clears the singleton so the next call retries. Never
 *  leaves an unhandled rejection behind. */
export function loadDestinationsMeta(): Promise<Destination[]> {
  if (!destinationsMetaPromise) {
    destinationsMetaPromise = import(
      /* webpackChunkName: "destinations-meta" */ "@/shared/data/destinations-meta.json"
    )
      .then((module) => module.default as Destination[])
      .catch((error) => {
        // Do not poison the singleton: clear so the next call retries.
        destinationsMetaPromise = null;
        throw error;
      });
  }
  return destinationsMetaPromise;
}
