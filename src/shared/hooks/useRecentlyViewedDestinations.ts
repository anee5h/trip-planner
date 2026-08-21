import { useState, useEffect } from "react";
import type { Destination } from "@/shared/types/destination";
import { useCatalogue } from "@/shared/hooks/useCatalogue";

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
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Non-critical catalogue consumer: failure deliberately degrades to an empty
 * recent list, while the shared catalogue interface still owns loading and
 * retry semantics for other surfaces.
 */
export function useRecentlyViewedDestinations(): Destination[] {
  const [recent, setRecent] = useState<Destination[]>([]);
  const { places } = useCatalogue({ need: "summary" });

  useEffect(() => {
    if (places.length === 0) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        const resolved = ids
          .map((id) => places.find((place) => place.id === id))
          .filter((place): place is NonNullable<typeof place> =>
            Boolean(place),
          );
        setRecent(resolved);
      }
    } catch {
      setRecent([]);
    }
  }, [places]);

  return recent;
}
