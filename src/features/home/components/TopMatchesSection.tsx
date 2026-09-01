import { memo } from "react";
import React from "react";
import { Sparkles } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import HomeMatchCard from "./HomeMatchCard";
import { serializePlannerSearchParams } from "@/features/destinations/destinationSearchParams";
import { isOvernightDuration } from "@/shared/types/tripDuration";
import type { ResolvedPlannerState } from "../hooks/useTripPlannerState";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";
import { ScrollContainer } from "@/shared/components/ui/ScrollContainer";
import {
  HOME_RAIL_CARD_CLASS,
  HOME_RAIL_SECTION_SPACING,
} from "./HomeRailLayout";

interface TopMatchesSectionProps {
  recommendations: Destination[];
  hasUserApplied: boolean;
  appliedState: ResolvedPlannerState;
  /** Planned travel date (ISO) passed through to destination links. */
  travelDate?: string;
  /** Date to serialize into the View-all link (omitted for today). */
  viewAllDate?: string;
}

export const TopMatchesSection: React.FC<TopMatchesSectionProps> = ({
  recommendations,
  hasUserApplied,
  appliedState,
  travelDate,
  viewAllDate,
}) => {
  const { t } = useTranslation();
  const topMatches = recommendations.slice(0, 10);
  const isOvernight = isOvernightDuration(appliedState.tripDuration);

  const headingText = t("home.topMatchesForYou", {
    defaultValue: hasUserApplied ? t("home.yourMatches") : t("home.topMatches"),
  });

  // Serializes applied filters to search params without serializing actual forecast weather
  const searchParamsString = serializePlannerSearchParams({
    vibe: appliedState.vibe,
    partySize: appliedState.partySize,
    budgetTier: appliedState.budgetTier,
    tripDuration: appliedState.tripDuration,
    budget: appliedState.budget,
    carMode: appliedState.carMode,
    publicModes: appliedState.publicModes,
    date: viewAllDate,
  });

  const isEmpty = recommendations.length === 0;

  return (
    <section
      id="recommendations"
      tabIndex={-1}
      className={`bg-white ${HOME_RAIL_SECTION_SPACING} dark:bg-slate-950`}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>{headingText}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-300 mt-1 leading-relaxed">
              {t("home.matchesDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to={`/destinations?${searchParamsString}`}
            ariaLabel={t("home.viewAllTopMatches")}
          />
        </div>

        {/* Top matches horizontal scroll rail */}
        {isEmpty && isOvernight ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <h3 className="text-lg font-extrabold text-slate-700 dark:text-slate-300 mb-2">
              {t("home.overnightNoResultsTitle")}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-300 max-w-md">
              {t("home.overnightNoResultsBody")}
            </p>
          </div>
        ) : (
          <ScrollContainer
            ariaLabel={headingText}
            previousLabel={t("home.previousRail")}
            nextLabel={t("home.nextRail")}
            resetKey={`${recommendations.map((destination) => destination.id).join(",")}:${appliedState.tripDuration}`}
            className="-mx-4 flex gap-3 px-4 py-2 md:mx-0 md:px-10 sm:gap-4"
          >
            {topMatches.map((dest, index) => (
              <div key={dest.id} className={HOME_RAIL_CARD_CLASS}>
                <HomeMatchCard
                  destination={dest}
                  rank={index + 1}
                  showRank={true}
                  partySize={appliedState.partySize}
                  carMode={appliedState.carMode}
                  publicModes={appliedState.publicModes}
                  travelDate={travelDate}
                  duration={appliedState.tripDuration}
                />
              </div>
            ))}
            <div className="w-1 shrink-0 sm:hidden" />
          </ScrollContainer>
        )}
      </div>
    </section>
  );
};

export default memo(TopMatchesSection);
