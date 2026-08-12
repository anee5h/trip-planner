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

/**
 * Property-level (or principal) records per UNESCO property, per the KAI-53
 * audit ledger (qa/kai-53/KAI53_DATA_AUDIT.md). When a property has one, its
 * record represents the group card; otherwise the strongest member is used.
 */
const UNESCO_PROPERTY_LEVEL_RECORDS: Record<string, true> = {
  "amami-iriomote-natural-site": true,
  "asuka-fujiwara-nara": true,
  "genbaku-dome": true,
  "gunkanjima-hashima-nagasaki": true,
  "himeji-castle": true,
  "hiraizumi-chusonji-iwate": true,
  "iwami-ginzan-shimane": true,
  "jomon-sugi-yakushima": true,
  "kumano-kodo-koya-wakayama": true,
  "miyajima-itsukushima": true,
  "mount-fuji": true,
  "mozufuruichi-kofun-osaka": true,
  "nara-historic": true,
  "national-museum-western-art-tokyo": true,
  "nikko-toshogu-shrine-tochigi": true,
  "okinoshima-munakata-fukuoka": true,
  "oura-church-nagasaki": true,
  "sado-island": true,
  "sannai-maruyama-jomon-aomori": true,
  "shirakami-sanchi-aomori": true,
  "shirakawa-village": true,
  "shiretoko-national-park-hokkaido": true,
  "tomioka-silk-mill-gunma": true,
};

/**
 * Deterministically picks the representative member whose record backs a
 * virtual group card: the property-level record when one exists, otherwise
 * the highest overall rating with id ascending as tie-break. Stable across
 * renders — never dependent on map/iteration order.
 */
function pickRepresentativeMember(members: Destination[]): Destination {
  return [...members].sort((a, b) => {
    const aIsProperty = UNESCO_PROPERTY_LEVEL_RECORDS[a.id] ? 0 : 1;
    const bIsProperty = UNESCO_PROPERTY_LEVEL_RECORDS[b.id] ? 0 : 1;
    return (
      aIsProperty - bIsProperty ||
      (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0) ||
      a.id.localeCompare(b.id)
    );
  })[0];
}

/**
 * Builds one virtual group destination per UNESCO property so the collection
 * page can render property groups with the existing DestinationCard. The
 * representative member's full record is copied as the card surface; the
 * group's own metadata drives title, badge, count, and navigation. Never
 * persists anything into catalogue data.
 */
export function getUNESCOPropertyGroupDestinations(
  locale: "en" | "ja" = "en",
): Destination[] {
  return getCollectionDestinationGroups(UNESCO_COLLECTION_ID, locale).map(
    (group) => {
      const primary = pickRepresentativeMember(group.destinations);
      const propertyId = group.propertyId ?? group.id;
      const isSinglePlace = group.destinations.length === 1;

      return {
        ...primary,
        id: `unesco-property-${propertyId}`,
        collections: [],
        virtualGroup: {
          id: `unesco-property-${propertyId}`,
          name: group.name,
          primaryMemberId: primary.id,
          badgeKey: "ui.unescoBadge",
          placeCount: group.destinations.length,
          href: isSinglePlace
            ? `/destinations/${group.destinations[0].id}`
            : `/collections/${UNESCO_COLLECTION_ID}?property=${propertyId}`,
        },
      } as Destination;
    },
  );
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
