import { useCallback, useEffect, useState } from "react";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";

export interface LiteCatalogueState {
  /** True once the loader resolved (or never true on failure). */
  ready: boolean;
  /** Non-null when the most recent load attempt failed. */
  error: Error | null;
  /** Re-invokes the loader (retry after a failure). */
  retry: () => void;
}

/**
 * KAI-132: shared lite-catalogue readiness hook. The lite (summary)
 * catalogue is a runtime-fetched asset; surfaces that read summary data
 * (via getDestinationList/getAvailablePlaces/collections/transport) must
 * gate on this before rendering catalogue-dependent content.
 *
 * ERROR SEMANTICS: a failed load does NOT count as ready — `ready` stays
 * false and `error` is set. Callers render their own error/empty state and
 * surface `retry` (loadLiteIndex clears its singleton on failure, so a
 * retry genuinely re-fetches). This never silently renders an empty
 * catalogue as if it were the real one.
 *
 * `enabled` (default true): when false the hook never triggers a load and
 * always reports not-ready — for surfaces that are conditionally mounted
 * (e.g. an onboarding flow hidden on most pages) so the catalogue is not
 * fetched on routes that don't need it.
 */
export function useLiteCatalogueReady(enabled = true): LiteCatalogueState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    setError(null);
    loadLiteIndex()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error("[useLiteCatalogueReady] lite load failed:", e);
        // NOT ready — surface the error so the caller can render an
        // explicit failure state and offer retry.
        setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => load(), [load]);

  const retry = useCallback(() => {
    setReady(false);
    load();
  }, [load]);

  return { ready, error, retry };
}
