import { useEffect, useState } from "react";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";

/**
 * KAI-132: shared lite-catalogue readiness hook. The lite (summary)
 * catalogue is a runtime-fetched asset; surfaces that read summary data
 * (via getDestinationList/getAvailablePlaces/collections/transport) must
 * gate on this before rendering catalogue-dependent content.
 *
 * Returns true once the loader resolved (or failed — the caller renders
 * its own empty/degraded state). Uses the singleton loader, so the fetch
 * happens at most once per session across all consumers.
 *
 * `enabled` (default true): when false the hook never triggers a load and
 * always returns false — for surfaces that are conditionally mounted
 * (e.g. an onboarding flow hidden on most pages) so the catalogue is not
 * fetched on routes that don't need it.
 */
export function useLiteCatalogueReady(enabled = true): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadLiteIndex()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        console.error("[useLiteCatalogueReady] lite load failed:", err);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? ready : false;
}
