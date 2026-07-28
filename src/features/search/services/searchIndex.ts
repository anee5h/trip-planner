import collectionsIndex from "@/shared/data/collections-index.json";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { getDestinationsForCollection } from "@/shared/utils/collections";
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

const cachedDocuments = new Map<"en" | "ja", SearchDocument[]>();

export function buildSearchIndex(locale: "en" | "ja" = "en"): SearchDocument[] {
  const cached = cachedDocuments.get(locale);
  if (cached) return cached;

  const docs: SearchDocument[] = [];

  // Add static navigation actions
  docs.push(...STATIC_ACTIONS);

  // Add destinations
  (getDestinationList(locale) as Destination[]).forEach((dest) => {
    const categoryName = dest.categories?.[0] || "Destination";
    docs.push({
      id: `dest-${dest.id}`,
      title: dest.name,
      subtitle: `${dest.prefecture} • ${categoryName}`,
      type: "destination",
      url: `/destinations/${dest.id}`,
      keywords: [
        dest.name.toLowerCase(),
        dest.prefecture.toLowerCase(),
        dest.region.toLowerCase(),
        categoryName.toLowerCase(),
        ...(dest.tags || []).map((t) => t.toLowerCase()),
      ],
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

export function searchDocuments(
  query: string,
  locale: "en" | "ja" = "en",
): SearchGroup[] {
  const allDocs = buildSearchIndex(locale);
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) {
    // Default suggestion groups when query is empty
    const navActions = allDocs.filter((d) => d.type === "navigation");
    const popularDestinations = allDocs
      .filter((d) => d.type === "destination")
      .slice(0, 4);
    const popularCollections = allDocs
      .filter((d) => d.type === "collection")
      .slice(0, 3);

    return [
      {
        type: "navigation",
        label: "Navigation & Actions",
        items: navActions.slice(0, 4),
      },
      {
        type: "destination",
        label: "Popular Destinations",
        items: popularDestinations,
      },
      {
        type: "collection",
        label: "Featured Collections",
        items: popularCollections,
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
