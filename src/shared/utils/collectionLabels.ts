import type { CollectionMetadata, Collection } from "@/shared/types/collection";
import type { AppLocale } from "@/shared/context/LocaleContext";

export const COLLECTION_CATEGORY_LABELS = {
  "Architecture & History": { en: "Architecture & History", ja: "建築・歴史" },
  "Architecture & Views": { en: "Architecture & Views", ja: "建築・景観" },
  "Architecture & Wonder": { en: "Architecture & Wonder", ja: "建築・驚異" },
  "Art & Culture": { en: "Art & Culture", ja: "芸術・文化" },
  "Cities & Metropolis": { en: "Cities & Metropolis", ja: "都市・大都市" },
  "History & Culture": { en: "History & Culture", ja: "歴史・文化" },
  "Islands & Nature": { en: "Islands & Nature", ja: "島・自然" },
  "Nature & Gardens": { en: "Nature & Gardens", ja: "自然・庭園" },
  "Nature & Geological Marvels": {
    en: "Nature & Geological Marvels",
    ja: "自然・地質の驚異",
  },
  "Nature & Parks": { en: "Nature & Parks", ja: "自然・公園" },
  "Nature & Seasons": { en: "Nature & Seasons", ja: "自然・季節" },
  "Nature & Sightseeing": { en: "Nature & Sightseeing", ja: "自然・観光" },
  "Nature & Waterfalls": { en: "Nature & Waterfalls", ja: "自然・滝" },
  "Nature & Wilderness": { en: "Nature & Wilderness", ja: "自然・原生地" },
  "Onsen & Relaxation": { en: "Onsen & Relaxation", ja: "温泉・癒やし" },
  "Religion & History": { en: "Religion & History", ja: "宗教・歴史" },
  "Scenic Drives & Ocean Views": {
    en: "Scenic Drives & Ocean Views",
    ja: "景観ドライブ・海の眺め",
  },
  "Sightseeing & Views": { en: "Sightseeing & Views", ja: "観光・眺望" },
  "Spiritual & Cultural Heritage": {
    en: "Spiritual & Cultural Heritage",
    ja: "精神文化・文化遺産",
  },
  "World Heritage": { en: "World Heritage", ja: "世界遺産" },
} as const satisfies Record<string, { en: string; ja: string }>;

const COLLECTION_TYPE_LABELS = {
  official: { en: "Official", ja: "公式コレクション" },
  historical: { en: "Historical", ja: "歴史的コレクション" },
  curated: { en: "Curated", ja: "厳選コレクション" },
} as const;

const COLLECTION_AUTHORITY_LABELS: Record<
  CollectionMetadata["authority"],
  { en: string; ja: string }
> = {
  international: { en: "International organization", ja: "国際機関" },
  government: { en: "Government", ja: "政府機関" },
  foundation: { en: "Foundation", ja: "財団" },
  association: { en: "Association", ja: "協会" },
  historical_consensus: { en: "Historical consensus", ja: "歴史的合意" },
  curated: { en: "Curated", ja: "編集部選定" },
};

export function getCollectionCategoryLabel(
  category: string,
  locale: AppLocale,
): string {
  const labels =
    COLLECTION_CATEGORY_LABELS[
      category as keyof typeof COLLECTION_CATEGORY_LABELS
    ];
  return labels?.[locale] ?? (locale === "ja" ? "コレクション" : category);
}

export function getCollectionTypeLabel(
  type: Collection["type"],
  locale: AppLocale,
): string {
  return COLLECTION_TYPE_LABELS[type][locale];
}

export function getCollectionAuthorityLabel(
  authority: CollectionMetadata["authority"],
  locale: AppLocale,
): string {
  return COLLECTION_AUTHORITY_LABELS[authority][locale];
}

export function validateCollectionCategoryCoverage(
  categories: readonly string[],
): string[] {
  return [...new Set(categories)]
    .filter((category) => {
      const labels =
        COLLECTION_CATEGORY_LABELS[
          category as keyof typeof COLLECTION_CATEGORY_LABELS
        ];
      return !labels?.en || !labels?.ja;
    })
    .sort();
}
