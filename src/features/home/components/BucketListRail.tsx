import { memo } from "react";
import React from "react";
import { Link } from "react-router-dom";
import { Bookmark, Sparkles, LogIn } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { useAuthModal } from "@/shared/context/AuthModalContext";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";
import HomeMatchCard from "./HomeMatchCard";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import {
  HOME_RAIL_CARD_CLASS,
  HOME_RAIL_SECTION_SPACING,
} from "./HomeRailLayout";

interface BucketListRailProps {
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  travelDate?: string;
  isCompactPromptOnly?: boolean;
}

export const BucketListRail: React.FC<BucketListRailProps> = ({
  partySize = 2,
  carMode,
  publicModes,
  travelDate,
  isCompactPromptOnly = false,
}) => {
  const { favorites } = useTripStore();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useTranslation();
  const { places: cataloguePlaces } = useCatalogue({ need: "summary" });
  const allDestinations = cataloguePlaces as Destination[];

  const savedDestinations: Destination[] = favorites
    .map((id) => allDestinations.find((dest) => dest.id === id))
    .filter((dest): dest is Destination => dest !== undefined);

  const hasSavedItems = savedDestinations.length > 0;

  // Render Compact Prompt Banner for Empty / Signed-Out states
  if (!hasSavedItems || isCompactPromptOnly) {
    return (
      <section className="py-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Bookmark className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {user ? t("home.startBucketList") : t("home.savePlaces")}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                  {user
                    ? t("home.startBucketListDescription")
                    : t("home.savePlacesDescription")}
                </span>
              </div>
            </div>

            {user ? (
              <Link
                to="/destinations"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-700 text-white shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("home.exploreDestinations")}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="inline-flex items-center gap-1.5 text-xs font-extrabold px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t("actions.signIn")}</span>
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Full Rail for Signed-In Users with Saved Items (Dense ~2.2 cards visible on mobile)
  return (
    <section
      className={`border-t border-slate-100 bg-slate-50 ${HOME_RAIL_SECTION_SPACING} dark:border-slate-800/80 dark:bg-slate-900/50`}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Bookmark className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 fill-emerald-500/20 shrink-0" />
              <span>{t("home.bucketList")}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-300 mt-1 leading-relaxed">
              {t("home.bucketDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to="/bucket-list"
            ariaLabel={t("home.viewAllBucketList")}
          />
        </div>

        <ScrollContainer
          ariaLabel={t("home.bucketList")}
          previousLabel={t("home.previousRail")}
          nextLabel={t("home.nextRail")}
          className="-mx-4 flex gap-3 px-4 py-2 md:mx-0 md:px-10 sm:gap-4"
        >
          {savedDestinations.slice(0, 10).map((dest, index) => (
            <div key={dest.id} className={HOME_RAIL_CARD_CLASS}>
              <HomeMatchCard
                destination={dest}
                rank={index + 1}
                showRank={false}
                partySize={partySize}
                carMode={carMode}
                publicModes={publicModes}
                travelDate={travelDate}
              />
            </div>
          ))}
          <div className="w-1 shrink-0 sm:hidden" />
        </ScrollContainer>
      </div>
    </section>
  );
};

export default memo(BucketListRail);
