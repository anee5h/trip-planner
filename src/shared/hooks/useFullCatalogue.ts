import { useCallback, useEffect, useState } from "react";
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
 * loader and re-renders once the full index arrives.
 *
 * FAILURE SEMANTICS: a failed load NEVER unhandled-rejects (the loader's
 * singleton is cleared, so retries work) and NEVER switches a
 * summary-capable surface to an empty list:
 *  - `error` carries the failure message (non-destructive).
 *  - `retry()` re-triggers the loader and clears the error.
 *  - Surfaces that can operate from summary data keep rendering the
 *    summary while `loading`/`error` are exposed for a non-destructive
 *    notice; surfaces that genuinely require full data render an explicit
 *    retryable error state from `error` + `retry`.
 */
export function useFullCatalogue(): {
  places: CanonicalPlace[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  // If the full index is ALREADY loaded (another consumer awaited it, or a
  // test preloaded it), render with full data synchronously — no flash of
  // an empty list.
  const [loaded, setLoaded] = useState(() => hasLoadedFullIndex());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadDestinationsIndex()
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch((err: unknown) => {
        if (alive) {
          setLoaded(false);
          setError(String(err));
        }
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  return {
    places: loaded ? getFullPlaces() : [],
    loading: !loaded && !error,
    error,
    retry,
  };
}
