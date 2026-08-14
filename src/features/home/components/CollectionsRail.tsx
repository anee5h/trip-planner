import React from "react";
import { Link } from "react-router-dom";
import { Compass, Layers } from "lucide-react";
import { getCollections } from "@/shared/data/collections";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { getDestinationsForCollection } from "@/shared/utils/collections";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import { HOME_RAIL_SECTION_SPACING } from "./HomeRailLayout";

interface FeaturedCollectionPresentation {
  collectionId: string;
  coverDestinationId: string;
  titleKey: string;
  categoryKey: string;
}

const FEATURED_COLLECTIONS: FeaturedCollectionPresentation[] = [
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

export const CollectionsRail: React.FC = () => {
  const collections = getCollections();
  const { locale } = useLocale();
  const destinations = getDestinationList(locale);
  const { t } = useTranslation();

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
              <span>{t("home.featuredCollections")}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("home.featuredCollectionsDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to="/collections"
            ariaLabel={t("home.viewAllCollections")}
          />
        </div>

        <ScrollContainer
          ariaLabel={t("home.featuredCollections")}
          previousLabel={t("home.previousRail")}
          nextLabel={t("home.nextRail")}
          className="-mx-4 flex gap-3 px-4 py-2 md:mx-0 md:px-10 sm:gap-5"
        >
          {FEATURED_COLLECTIONS.map((item) => {
            const rawCol = collections.find((c) => c.id === item.collectionId);
            if (!rawCol) return null;
            const cover = destinations.find(
              (destination) => destination.id === item.coverDestinationId,
            )?.heroImage;
            const memberCount =
              getDestinationsForCollection(rawCol.id, locale).length ||
              rawCol.metadata.expectedMembers ||
              0;

            return (
              <Link
                key={item.collectionId}
                to={`/collections/${rawCol.slug}`}
                className="group relative bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 flex flex-col justify-end w-[52vw] min-w-[180px] max-w-[205px] sm:w-auto sm:min-w-[280px] sm:max-w-[310px] h-56 sm:h-[350px] shrink-0 snap-start border border-slate-800"
              >
                {/* 4:5 Background Hero Image with Smooth Zoom */}
                <LazyImage
                  src={cover}
                  alt={t(item.titleKey as never)}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out opacity-90"
                />

                {/* Multi-Stage High Contrast Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-black/30" />

                {/* Clean Content Overlay with Reserved 2-Line Title Height */}
                <div className="relative z-10 p-3.5 sm:p-6 text-white flex flex-col justify-end">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                    {t(item.categoryKey as never)}
                  </span>

                  <h3 className="text-sm sm:text-xl font-extrabold text-white group-hover:text-emerald-300 transition-colors leading-tight mb-1.5 line-clamp-2 min-h-[2.25rem] sm:min-h-[2.75rem] flex items-center">
                    {t(item.titleKey as never)}
                  </h3>

                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-300">
                    <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      {t("home.places", {
                        count: memberCount,
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

export default CollectionsRail;
