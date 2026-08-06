import React, { useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import HomeMatchCard from "./HomeMatchCard";
import { serializePlannerSearchParams } from "@/features/destinations/destinationSearchParams";
import type { ResolvedPlannerState } from "../hooks/useTripPlannerState";
import { useTranslation } from "react-i18next";
import { SectionViewAllLink } from "./SectionViewAllLink";

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
  const topFive = recommendations.slice(0, 5);
  const railRef = useRef<HTMLDivElement>(null);

  // Auto-reset horizontal scroll position to #1 when recommendations or appliedState change
  useEffect(() => {
    if (railRef.current) {
      railRef.current.scrollLeft = 0;
    }
  }, [recommendations, appliedState]);

  const isWeekend = appliedState.tripMode === "weekend_2d1n";

  const headingText = isWeekend
    ? hasUserApplied
      ? t("home.weekendYourMatches")
      : t("home.weekendMatches")
    : hasUserApplied
      ? t("home.yourMatches")
      : t("home.topMatches");

  // Serializes applied filters to search params without serializing actual forecast weather
  const searchParamsString = serializePlannerSearchParams({
    vibe: appliedState.vibe,
    partySize: appliedState.partySize,
    budgetTier: appliedState.budgetTier,
    tripDuration: appliedState.tripDuration,
    budget: appliedState.budget,
    carMode: appliedState.carMode,
    publicModes: appliedState.publicModes,
    tripMode: appliedState.tripMode,
    accommodationAllowance: appliedState.accommodationAllowance,
    date: viewAllDate,
  });

  const isEmpty = recommendations.length === 0;

  return (
    <section
      id="recommendations"
      tabIndex={-1}
      className="bg-white py-10 sm:py-12 lg:py-12 dark:bg-slate-950"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>{headingText}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("home.matchesDescription")}
            </p>
          </div>

          <SectionViewAllLink
            to={`/destinations?${searchParamsString}`}
            ariaLabel={t("home.viewAllTopMatches")}
          />
        </div>

        {/* Top 5 Recommendations Horizontal Scroll Rail */}
        {isEmpty && isWeekend ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <h3 className="text-lg font-extrabold text-slate-700 dark:text-slate-300 mb-2">
              {t("home.weekendNoResultsTitle")}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              {t("home.weekendNoResultsBody")}
            </p>
          </div>
        ) : (
          <div
            ref={railRef}
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-2 scrollbar-none sm:mx-0 sm:gap-4 sm:px-0"
          >
            {topFive.map((dest, index) => (
              <div
                key={dest.id}
                className="flex h-full w-[46vw] min-w-[160px] max-w-[180px] shrink-0 snap-start flex-col sm:w-[250px] sm:min-w-[250px] sm:max-w-[250px]"
              >
                <HomeMatchCard
                  destination={dest}
                  rank={index + 1}
                  showRank={true}
                  partySize={appliedState.partySize}
                  carMode={appliedState.carMode}
                  publicModes={appliedState.publicModes}
                  travelDate={travelDate}
                />
              </div>
            ))}
            {/* Rail Trailing Padding Element for Mobile */}
            <div className="w-1 shrink-0 sm:hidden" />
          </div>
        )}
      </div>
    </section>
  );
};

export default TopMatchesSection;
