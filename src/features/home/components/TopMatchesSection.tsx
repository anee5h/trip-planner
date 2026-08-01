import React, { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import HomeMatchCard from "./HomeMatchCard";
import { serializePlannerSearchParams } from "@/features/destinations/destinationSearchParams";
import type { ResolvedPlannerState } from "../hooks/useTripPlannerState";

interface TopMatchesSectionProps {
  recommendations: Destination[];
  hasUserApplied: boolean;
  appliedState: ResolvedPlannerState;
}

export const TopMatchesSection: React.FC<TopMatchesSectionProps> = ({
  recommendations,
  hasUserApplied,
  appliedState,
}) => {
  const topFive = recommendations.slice(0, 5);
  const railRef = useRef<HTMLDivElement>(null);

  // Auto-reset horizontal scroll position to #1 when recommendations or appliedState change
  useEffect(() => {
    if (railRef.current) {
      railRef.current.scrollLeft = 0;
    }
  }, [recommendations, appliedState]);

  const headingText = hasUserApplied
    ? "Your best matches right now"
    : "Top matches for today";

  // Serializes applied filters to search params without serializing actual forecast weather
  const searchParamsString = serializePlannerSearchParams({
    vibe: appliedState.vibe,
    partySize: appliedState.partySize,
    budgetTier: appliedState.budgetTier,
    tripDuration: appliedState.tripDuration,
    budget: appliedState.budget,
    carMode: appliedState.carMode,
    publicModes: appliedState.publicModes,
  });

  return (
    <section
      id="recommendations"
      className="py-8 sm:py-12 lg:py-16 bg-white dark:bg-slate-950"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>{headingText}</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Smart picks tailored to your current situation and preferences.
            </p>
          </div>

          <Link
            to={`/destinations?${searchParamsString}`}
            className="shrink-0 pt-1 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Top 5 Recommendations Horizontal Scroll Rail */}
        <div
          ref={railRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {topFive.map((dest, index) => (
            <div
              key={dest.id}
              className="w-[46vw] min-w-[160px] max-w-[180px] sm:w-auto sm:min-w-[270px] sm:max-w-[290px] shrink-0 snap-start flex flex-col h-full"
            >
              <HomeMatchCard
                destination={dest}
                rank={index + 1}
                showRank={true}
                partySize={appliedState.partySize}
                carMode={appliedState.carMode}
                publicModes={appliedState.publicModes}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TopMatchesSection;
