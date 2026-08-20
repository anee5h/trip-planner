import { useState, useEffect } from "react";
import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";

const STORAGE_KEY = "tabimap_recently_viewed_destinations";
const MAX_ITEMS = 10;

export function addRecentlyViewedDestination(destinationId: string) {
  if (!destinationId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let list: string[] = raw ? JSON.parse(raw) : [];
    list = [destinationId, ...list.filter((id) => id !== destinationId)].slice(
      0,
      MAX_ITEMS,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // Ignore storage errors
  }
}

export function useRecentlyViewedDestinations(): Destination[] {
  const [recent, setRecent] = useState<Destination[]>([]);

  useEffect(() => {
    let cancelled = false;
    // KAI-132: the lite catalogue is runtime-loaded — await it before
    // resolving recent ids (otherwise the list would be permanently empty
    // when the effect runs before the loader resolves).
    loadLiteIndex()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const ids: string[] = JSON.parse(raw);
            const places = getDestinationList() as Destination[];
            const resolved = ids
              .map((id) => places.find((p) => p.id === id))
              .filter((p): p is Destination => Boolean(p));
            setRecent(resolved);
          }
        } catch (e) {
          setRecent([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return recent;
}
