import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";

import {
  getUNESCOPropertyId,
  UNESCO_PROPERTY_LABELS,
} from "@/shared/data/unesco-properties";
export function getCollectionContent(
  collection: Collection,
  locale: "en" | "ja",
) {
  const content = collection.content?.[locale];
  if (content) return content;

  if (locale === "ja" && collection.nameJa) {
    return {
      name: collection.nameJa,
      description: collection.descriptionJa || collection.description,
    };
  }

  return (
    collection.content?.en || {
      name: collection.name,
      description: collection.description,
    }
  );
}

export const UNESCO_COLLECTION_ID = "unesco-japan";

export interface CollectionDestinationGroup {
  id: string;
  propertyId?: string;
  sourceUrl?: string;
  name: string;
  destinations: Destination[];
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

function getDestinationName(
  destination: Destination,
  locale: "en" | "ja",
): string {
  if (locale === "ja") {
    return (
      destination.content?.ja?.name ||
      destination.nameJa ||
      destination.content?.en?.name ||
      destination.name
    );
  }

  return destination.content?.en?.name || destination.name;
}

/**
 * Groups UNESCO collection members by their authoritative UNESCO property
 * source URL. Other collections remain one destination per group.
 */
export function getCollectionDestinationGroups(
  collectionId: string,
  locale: "en" | "ja" = "en",
): CollectionDestinationGroup[] {
  const destinations = getDestinationsForCollection(collectionId, locale);
  const grouped = new Map<
    string,
    {
      propertyId?: string;
      sourceUrl?: string;
      destinations: Destination[];
    }
  >();

  for (const destination of destinations) {
    const membership = destination.collections?.find(
      (item) => item.collectionId === collectionId,
    );
    const propertyId =
      collectionId === UNESCO_COLLECTION_ID
        ? getUNESCOPropertyId(membership?.source)
        : undefined;
    const key = propertyId
      ? `${UNESCO_COLLECTION_ID}:${propertyId}`
      : `destination:${destination.id}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.destinations.push(destination);
      continue;
    }

    grouped.set(key, {
      propertyId,
      sourceUrl: membership?.source,
      destinations: [destination],
    });
  }

  return [...grouped.entries()]
    .map(([id, group]) => {
      const firstDestination = group.destinations[0];
      const propertyLabel = group.propertyId
        ? UNESCO_PROPERTY_LABELS[group.propertyId]
        : undefined;

      return {
        id,
        propertyId: group.propertyId,
        sourceUrl: group.sourceUrl,
        name:
          propertyLabel?.[locale === "ja" ? "nameJa" : "name"] ||
          getDestinationName(firstDestination, locale),
        destinations: group.destinations,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export interface CollectionProgress {
  total: number;
  visited: number;
  percent: number;
}

/**
 * Calculates dynamically derived visited progress for a collection.
 * UNESCO progress counts one property per grouped source URL; a property is
 * visited when at least one of its curated member places has been visited.
 */
export function getCollectionProgress(
  collectionId: string,
  visitedIds: string[] = [],
  locale: "en" | "ja" = "en",
): CollectionProgress {
  const groups = getCollectionDestinationGroups(collectionId, locale);
  const total = groups.length;
  if (total === 0) {
    return { total: 0, visited: 0, percent: 0 };
  }

  const visitedSet = new Set(visitedIds);
  const visited = groups.filter((group) =>
    group.destinations.some((destination) => visitedSet.has(destination.id)),
  ).length;
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
