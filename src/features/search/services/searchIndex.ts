import collectionsIndex from "@/shared/data/collections-index.json";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import {
  getLocalizedPlace,
  loadLiteIndex,
} from "@/shared/services/place/PlaceCatalog";
import { getDestinationsForCollection } from "@/shared/utils/collections";
import {
  buildTokyoWardsLink,
  isTokyoWardHub,
  TOKYO_WARDS_GROUP_ID,
} from "@/shared/services/recommendation/TokyoWardsConsolidation";
import type { SearchDocument, SearchGroup, SearchDocumentType } from "../types";
import { Icons } from "@/shared/icons";

// Static App Actions & Navigation Documents using Icons registry
const STATIC_ACTIONS: SearchDocument[] = [
  {
    id: "action-passport",
    title: "Go to Passport",
    subtitle: "View your travel progression, prefecture map & achievements",
    type: "navigation",
    url: "/passport",
    keywords: [
      "passport",
      "map",
      "prefectures",
      "achievements",
      "history",
      "stats",
    ],
    icon: Icons.passport,
    badge: "P",
    category: "Navigation",
  },
  {
    id: "action-settings",
    title: "Go to Settings",
    subtitle: "Configure Base Location, transport modes & preferences",
    type: "navigation",
    url: "/settings",
    keywords: [
      "settings",
      "preferences",
      "base location",
      "station",
      "theme",
      "config",
    ],
    icon: Icons.settings,
    badge: "S",
    category: "Navigation",
  },
  {
    id: "action-profile",
    title: "Go to Profile",
    subtitle: "Manage account details, username & security",
    type: "navigation",
    url: "/profile",
    keywords: ["profile", "account", "username", "email", "security"],
    icon: Icons.profile,
    badge: "U",
    category: "Navigation",
  },
  {
    id: "action-help",
    title: "Go to Help Center",
    subtitle: "FAQs, keyboard shortcuts & documentation",
    type: "navigation",
    url: "/help",
    keywords: ["help", "faq", "shortcuts", "support", "docs", "guide"],
    icon: Icons.help,
    badge: "H",
    category: "Navigation",
  },
  {
    id: "action-bucket-list",
    title: "Open Bucket List",
    subtitle: "View your saved destinations to visit",
    type: "navigation",
    url: "/bucket-list",
    keywords: ["bucket list", "saved", "favorites", "bookmarks"],
    icon: Icons.bookmark,
    category: "Navigation",
  },
  {
    id: "action-my-trips",
    title: "Open My Trips",
    subtitle: "View & build custom travel itineraries",
    type: "navigation",
    url: "/my-trips",
    keywords: ["trips", "itineraries", "my trips", "plan"],
    icon: Icons.calendar,
    category: "Navigation",
  },
  {
    id: "action-destinations",
    title: "Browse All Destinations",
    subtitle: "Directory of Japan sights & attractions",
    type: "navigation",
    url: "/destinations",
    keywords: ["destinations", "sights", "attractions", "places"],
    icon: Icons.japanMap,
    category: "Navigation",
  },
  {
    id: "action-collections",
    title: "Browse Collections",
    subtitle: "Explore UNESCO sites & thematic travel lists",
    type: "navigation",
    url: "/collections",
    keywords: ["collections", "unesco", "themes", "castles"],
    icon: Icons.check,
    category: "Navigation",
  },
];

/**
 * Curated major destination hubs shown in the empty search state (KAI-83).
 * IDs verified against destinations-index.json (kind "city" / role "hub").
 * Tokyo has no single city hub in the catalogue, so the Tokyo entry is the
 * Tokyo 23 Wards virtual group (see buildTokyoWardsDocument), listed first.
 * Resolved through the locale-aware destination list, so records that are
 * not published in a locale are skipped exactly as everywhere else in the
 * app.
 */
export const POPULAR_DESTINATION_IDS: readonly string[] = [
  "kyoto-city",
  "osaka-city",
  "sapporo-city",
  "fukuoka-city",
  "hiroshima-city",
  "nara-city",
  "nagoya-city",
];

/**
 * Virtual "Tokyo 23 Wards" document for the empty search state. Built on
 * demand — it is intentionally NOT part of the indexed corpus, so typed
 * query results are byte-identical to before KAI-83. The 23 canonical ward
 * hub ids come from the catalogue (role "hub", kind "ward", special-ward
 * municipality) in deterministic sorted order, and the target is the same
 * explorer ward filter the Tokyo group card uses.
 */
function buildTokyoWardsDocument(locale: "en" | "ja"): SearchDocument {
  const wardHubIds = (getDestinationList("en") as Destination[])
    .filter((dest) => isTokyoWardHub(dest))
    .map((dest) => dest.id)
    .sort()
    .slice(0, 23);

  return {
    id: `dest-${TOKYO_WARDS_GROUP_ID}`,
    title: locale === "ja" ? "東京23区" : "Tokyo 23 Wards",
    subtitle: locale === "ja" ? "東京都" : "Tokyo",
    type: "destination",
    url: buildTokyoWardsLink(wardHubIds),
    keywords: ["tokyo", "tokyo 23 wards", "23 wards", "東京", "東京23区"],
    icon: Icons.japanMap,
    badge: locale === "ja" ? "東京" : "Tokyo",
    category: "City",
    metadata: { dest: { id: TOKYO_WARDS_GROUP_ID } },
  };
}

const cachedDocuments = new Map<"en" | "ja", SearchDocument[]>();

// KAI-121 contract: search depends ONLY on the formally complete SUMMARY
// catalogue (getDestinationList -> getAvailablePlaces -> getLitePlaces).
// The summary carries every field search needs (id, name, prefecture,
// region, categories, tags, kind, role). The cache is therefore STABLE —
// it never needs to be invalidated when the full dataset loads, and it
// never permanently holds a partial lite result: the summary is complete
// by definition.
export async function buildSearchIndex(
  locale: "en" | "ja" = "en",
): Promise<SearchDocument[]> {
  const cached = cachedDocuments.get(locale);
  if (cached) return cached;

  // KAI-132: the lite catalogue is runtime-loaded — await it before
  // building, so the STABLE cache is never built from an empty summary
  // (the pre-KAI-132 sync contract made an empty build impossible).
  await loadLiteIndex();

  const docs: SearchDocument[] = [];

  // Add static navigation actions
  docs.push(...STATIC_ACTIONS);

  // Add destinations
  (getDestinationList(locale) as Destination[]).forEach((dest) => {
    const categoryName = dest.categories?.[0] || "Destination";
    const localized = locale === "ja" ? getLocalizedPlace(dest, "ja") : dest;
    const title = localized.name || dest.name;

    const keywords = [
      title.toLowerCase(),
      dest.prefecture.toLowerCase(),
      dest.region.toLowerCase(),
      categoryName.toLowerCase(),
      ...(dest.tags || []).map((t) => t.toLowerCase()),
    ];

    if (
      locale === "ja" &&
      dest.name &&
      dest.name.toLowerCase() !== title.toLowerCase()
    ) {
      keywords.push(dest.name.toLowerCase());
    }

    docs.push({
      id: `dest-${dest.id}`,
      title,
      subtitle: `${dest.prefecture} • ${categoryName}`,
      type: "destination",
      url: `/destinations/${dest.id}`,
      keywords,
      icon: Icons.japanMap,
      badge: dest.prefecture,
      category: categoryName,
      metadata: { dest },
    });
  });

  // Add collections
  (collectionsIndex as Collection[])
    .filter(
      (collection) =>
        getDestinationsForCollection(collection.id, locale).length > 0,
    )
    .forEach((col) => {
      docs.push({
        id: `col-${col.id}`,
        title: col.name,
        subtitle: col.description || "Curated travel list",
        type: "collection",
        url: `/collections/${col.slug}`,
        keywords: [
          col.name.toLowerCase(),
          col.slug.toLowerCase(),
          (col.description || "").toLowerCase(),
          ...(col.isAchievement ? ["achievement", "heritage"] : []),
        ],
        icon: Icons.check,
        badge: col.isAchievement ? "Achievement" : "Collection",
        category: "Collection",
        metadata: { col },
      });
    });

  cachedDocuments.set(locale, docs);
  return docs;
}

export async function searchDocuments(
  query: string,
  locale: "en" | "ja" = "en",
): Promise<SearchGroup[]> {
  const allDocs = await buildSearchIndex(locale);
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) {
    // Default suggestion groups when query is empty
    const navActions = allDocs.filter((d) => d.type === "navigation");
    // Curated hubs in a fixed order — never the alphabetical catalogue slice.
    const destinationDocsById = new Map<string, SearchDocument>();
    for (const doc of allDocs) {
      if (doc.type === "destination" && doc.metadata?.dest) {
        destinationDocsById.set(doc.metadata.dest.id, doc);
      }
    }
    const popularDestinations = [
      buildTokyoWardsDocument(locale),
      ...POPULAR_DESTINATION_IDS.map((id) => destinationDocsById.get(id)),
    ].filter((doc): doc is SearchDocument => doc !== undefined);
    const popularCollections = allDocs
      .filter((d) => d.type === "collection")
      .slice(0, 3);

    return [
      {
        type: "destination",
        label: locale === "ja" ? "人気の目的地" : "Popular Destinations",
        items: popularDestinations,
        mobileCollapsible: true,
      },
      {
        type: "collection",
        label: locale === "ja" ? "注目のコレクション" : "Featured Collections",
        items: popularCollections,
      },
      {
        type: "navigation",
        label:
          locale === "ja"
            ? "ナビゲーションとアクション"
            : "Navigation & Actions",
        items: navActions.slice(0, 4),
      },
    ];
  }

  // Score matching documents
  const scoredDocs: SearchDocument[] = [];

  for (const doc of allDocs) {
    const titleLower = doc.title.toLowerCase();
    let score = 0;

    if (titleLower === cleanQuery) {
      score += 100;
    } else if (titleLower.startsWith(cleanQuery)) {
      score += 80;
    } else if (titleLower.includes(cleanQuery)) {
      score += 60;
    } else {
      const keywordMatch = doc.keywords.some((kw) => kw.includes(cleanQuery));
      if (keywordMatch) score += 40;
    }

    if (score > 0) {
      scoredDocs.push({ ...doc, score });
    }
  }

  // Tie-breaking priority order: Destinations > Collections > Navigation/Actions
  const TYPE_PRIORITY: Record<SearchDocumentType, number> = {
    destination: 3,
    collection: 2,
    navigation: 1,
    action: 1,
  };

  scoredDocs.sort((a, b) => {
    if (b.score! !== a.score!) return b.score! - a.score!;
    const typeDiff = TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type];
    if (typeDiff !== 0) return typeDiff;
    return a.title.localeCompare(b.title);
  });

  // Group by document type
  const destinations = scoredDocs.filter((d) => d.type === "destination");
  const collections = scoredDocs.filter((d) => d.type === "collection");
  const actions = scoredDocs.filter(
    (d) => d.type === "navigation" || d.type === "action",
  );

  const groups: SearchGroup[] = [];

  if (destinations.length > 0) {
    groups.push({
      type: "destination",
      label: `Destinations (${destinations.length})`,
      items: destinations.slice(0, 8),
    });
  }

  if (collections.length > 0) {
    groups.push({
      type: "collection",
      label: `Collections (${collections.length})`,
      items: collections.slice(0, 5),
    });
  }

  if (actions.length > 0) {
    groups.push({
      type: "navigation",
      label: `Actions (${actions.length})`,
      items: actions.slice(0, 4),
    });
  }

  return groups;
}
