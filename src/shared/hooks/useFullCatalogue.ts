import { useEffect, useState } from "react";
import {
  getFullPlaces,
  hasLoadedFullIndex,
  loadDestinationsIndex,
  type CanonicalPlace,
} from "@/shared/services/place/PlaceCatalog";

/**
 * KAI-121: full-catalogue loader hook.
 *
 * Explicit async contract: components that genuinely require the COMPLETE
 * destination records (ratings, budget fields, transport metadata,
 * editorial content) mount this hook, which awaits the shared lazy
 * loader and re-renders once the full index arrives. Legal/settings/
 * account surfaces must NOT use this hook — they depend only on the
 * synchronous summary (getLitePlaces / getDestinationList).
 *
 * The loader shares one promise across callers; a rejected import is
 * retryable (the singleton is cleared) and surfaces as `error` here.
 */
export function useFullCatalogue(): {
  places: CanonicalPlace[];
  loading: boolean;
  error: string | null;
} {
  // If the full index is ALREADY loaded (another consumer awaited it, or a
  // test preloaded it), render with full data synchronously — no flash of
  // an empty list.
  const [loaded, setLoaded] = useState(() => hasLoadedFullIndex());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadDestinationsIndex()
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch((err: unknown) => {
        if (alive) setError(String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  return {
    places: loaded ? getFullPlaces() : [],
    loading: !loaded && !error,
    error,
  };
}
