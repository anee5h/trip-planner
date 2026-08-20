import { memo } from "react";
import React from "react";
import { Link } from "react-router-dom";
import { Compass, Layers } from "lucide-react";
import { getCollections } from "@/shared/data/collections";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { getDestinationsForCollection } from "@/shared/utils/collections";
import type { Collection } from "@/shared/types/collection";
import type { Destination } from "@/shared/types/destination";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import { HOME_RAIL_SECTION_SPACING } from "./HomeRailLayout";

export const MAX_FEATURED_COLLECTIONS = 10;

interface FeaturedCollectionPreference {
  collectionId: string;
  coverDestinationId: string;
  titleKey: string;
  categoryKey: string;
}

const FEATURED_COLLECTION_PREFERENCES: readonly FeaturedCollectionPreference[] =
  [
    {
      collectionId: "original-12-castles",
      coverDestinationId: "himeji-castle",
      titleKey: "home.collectionTitles.originalCastles",
      categoryKey: "home.collectionCategories.architecture",
    },
    {
      collectionId: "unesco-japan",
      coverDestinationId: "miyajima-itsukushima",
      titleKey: "home.collectionTitles.unescoJapan",
      categoryKey: "home.collectionCategories.worldHeritage",
    },
    {
      collectionId: "national-parks-japan",
      coverDestinationId: "mount-aso-kumamoto",
      titleKey: "home.collectionTitles.nationalParks",
      categoryKey: "home.collectionCategories.nature",
    },
    {
      collectionId: "three-great-gardens",
      coverDestinationId: "kenroku-en",
      titleKey: "home.collectionTitles.greatGardens",
      categoryKey: "home.collectionCategories.gardens",
    },
    {
      collectionId: "three-great-views",
      coverDestinationId: "matsushima-bay",
      titleKey: "home.collectionTitles.greatViews",
      categoryKey: "home.collectionCategories.views",
    },
    {
      collectionId: "three-great-waterfalls",
      coverDestinationId: "kegon-falls-nikko",
      titleKey: "home.collectionTitles.greatWaterfalls",
      categoryKey: "home.collectionCategories.waterfalls",
    },
  ];

export interface FeaturedCollectionCandidate {
  collection: Collection;
  members: readonly Destination[];
}

export interface FeaturedCollectionCard {
  collection: Collection;
  cover: Destination;
  memberCount: number;
  titleKey?: string;
  categoryKey?: string;
}

/**
 * Keeps the existing six featured choices first, then exposes only active,
 * sourced collections with real members and a usable cover image.
 */
export function getFeaturedCollectionCards(
  candidates: readonly FeaturedCollectionCandidate[],
  count = MAX_FEATURED_COLLECTIONS,
): FeaturedCollectionCard[] {
  const preferenceIndex = (collectionId: string) => {
    const index = FEATURED_COLLECTION_PREFERENCES.findIndex(
      (preference) => preference.collectionId === collectionId,
    );
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return candidates
    .filter(
      ({ collection, members }) =>
        collection.metadata.status === "active" &&
        Boolean(collection.sourceUrl) &&
        members.length > 0 &&
        members.some((member) => Boolean(member.heroImage)),
    )
    .sort(
      (a, b) =>
        preferenceIndex(a.collection.id) - preferenceIndex(b.collection.id) ||
        a.collection.sortOrder - b.collection.sortOrder ||
        a.collection.id.localeCompare(b.collection.id),
    )
    .slice(0, Math.min(MAX_FEATURED_COLLECTIONS, Math.max(0, count)))
    .flatMap(({ collection, members }) => {
      const preference = FEATURED_COLLECTION_PREFERENCES.find(
        (item) => item.collectionId === collection.id,
      );
      const cover =
        (preference &&
          members.find(
            (member) =>
              member.id === preference.coverDestinationId &&
              Boolean(member.heroImage),
          )) ||
        members.find((member) => Boolean(member.heroImage));
      if (!cover) return [];
      return [
        {
          collection,
          cover,
          memberCount: members.length,
          titleKey: preference?.titleKey,
          categoryKey: preference?.categoryKey,
        },
      ];
    });
}

const COLLECTION_TYPE_CATEGORY_KEYS = {
  official: "home.collectionCategories.official",
  historical: "home.collectionCategories.historical",
  curated: "home.collectionCategories.curated",
} as const;

function translateRequired(
  translate: (key: string, options?: Record<string, unknown>) => string,
  key: string,
): string {
  const value = translate(key, { defaultValue: "" }).trim();
  return value === key ? "" : value;
}

export const CollectionsRail: React.FC = () => {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const translate = t as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  const candidates = getCollections().map((collection) => ({
    collection,
    members: getDestinationsForCollection(collection.id, locale),
  }));
  const featuredCollections = getFeaturedCollectionCards(candidates);
  const railTitle = translateRequired(translate, "home.featuredCollections");
  const railDescription = translateRequired(
    translate,
    "home.featuredCollectionsDescription",
  );
  const viewAllLabel = translateRequired(translate, "home.viewAllCollections");
  const previousLabel = translateRequired(translate, "home.previousRail");
  const nextLabel = translateRequired(translate, "home.nextRail");
  if (
    !railTitle ||
    !railDescription ||
    !viewAllLabel ||
    !previousLabel ||
    !nextLabel
  )
    return null;

  return (
    <section
      className={`border-t border-slate-100 bg-slate-50 ${HOME_RAIL_SECTION_SPACING} dark:border-slate-800/80 dark:bg-slate-900/50`}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Compass className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>{railTitle}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-300 mt-1 leading-relaxed">
              {railDescription}
            </p>
          </div>

          <SectionViewAllLink to="/collections" ariaLabel={viewAllLabel} />
        </div>

        <ScrollContainer
          ariaLabel={railTitle}
          previousLabel={previousLabel}
          nextLabel={nextLabel}
          className="-mx-4 flex gap-3 px-4 py-2 md:mx-0 md:px-10 sm:gap-5"
        >
          {featuredCollections.map((item) => {
            const title = item.titleKey
              ? translateRequired(translate, item.titleKey)
              : locale === "ja"
                ? item.collection.content?.ja?.name || item.collection.nameJa
                : item.collection.content?.en?.name || item.collection.name;
            const categoryKey =
              item.categoryKey ||
              COLLECTION_TYPE_CATEGORY_KEYS[item.collection.type];
            const category = translateRequired(translate, categoryKey);
            if (!title || !category) return null;

            return (
              <Link
                key={item.collection.id}
                to={`/collections/${item.collection.slug}`}
                className="group relative bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 flex flex-col justify-end w-[52vw] min-w-[180px] max-w-[205px] sm:w-auto sm:min-w-[280px] sm:max-w-[310px] h-56 sm:h-[350px] shrink-0 snap-start border border-slate-800"
              >
                {/* 4:5 Background Hero Image with Smooth Zoom */}
                <LazyImage
                  src={item.cover.heroImage}
                  alt={title}
                  responsive
                  deferUntilVisible
                  sizes="(min-width: 1024px) 400px, (min-width: 640px) 320px, 240px"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out opacity-90"
                />

                {/* Multi-Stage High Contrast Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-black/30" />

                {/* Clean Content Overlay with Reserved 2-Line Title Height */}
                <div className="relative z-10 p-3.5 sm:p-6 text-white flex flex-col justify-end">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                    {category}
                  </span>

                  <h3 className="text-sm sm:text-xl font-extrabold text-white group-hover:text-emerald-300 transition-colors leading-tight mb-1.5 line-clamp-2 min-h-[2.25rem] sm:min-h-[2.75rem] flex items-center">
                    {title}
                  </h3>

                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-300">
                    <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      {t("home.places", {
                        count: item.memberCount,
                      })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
          <div className="w-1 shrink-0 sm:hidden" />
        </ScrollContainer>
      </div>
    </section>
  );
};

export default memo(CollectionsRail);
