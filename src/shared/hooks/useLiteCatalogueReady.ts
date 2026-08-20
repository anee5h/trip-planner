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
 */
export function useLiteCatalogueReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
  }, []);

  return ready;
}
