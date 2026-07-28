import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";

export interface CollectionProgress {
  total: number;
  visited: number;
  percent: number;
}

/**
 * Returns all destinations belonging to a specific collection.
 */
export function getDestinationsForCollection(
  collectionId: string,
  locale: "en" | "ja" = "en",
): Destination[] {
  const all = getDestinationList(locale) as Destination[];
  return all.filter((dest) =>
    dest.collections?.some((m) => m.collectionId === collectionId),
  );
}

/**
 * Calculates dynamically derived visited progress for a collection.
 */
export function getCollectionProgress(
  collectionId: string,
  visitedIds: string[] = [],
  locale: "en" | "ja" = "en",
): CollectionProgress {
  const destinations = getDestinationsForCollection(collectionId, locale);
  const total = destinations.length;
  if (total === 0) {
    return { total: 0, visited: 0, percent: 0 };
  }
  const visited = destinations.filter((d) => visitedIds.includes(d.id)).length;
  const percent = Math.round((visited / total) * 100);
  return { total, visited, percent };
}

/**
 * Helper to sort collection list or memberships by sortOrder ascending, with name as tie-breaker.
 */
export function sortCollections<
  T extends { sortOrder?: number; name?: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = a.sortOrder ?? 999;
    const orderB = b.sortOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.name || "";
    const nameB = b.name || "";
    return nameA.localeCompare(nameB);
  });
}
