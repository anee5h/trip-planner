import React from "react";
import { Link } from "react-router-dom";
import { Bookmark, ArrowRight, Sparkles, LogIn } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import HomeMatchCard from "./HomeMatchCard";

interface BucketListRailProps {
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  isCompactPromptOnly?: boolean;
}

export const BucketListRail: React.FC<BucketListRailProps> = ({
  partySize = 2,
  carMode,
  publicModes,
  isCompactPromptOnly = false,
}) => {
  const { favorites } = useTripStore();
  const { user } = useAuth();
  const allDestinations = getDestinationList() as Destination[];

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
              <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Bookmark className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {user ? "Start your bucket list" : "Save places for later"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {user
                    ? "Save places you want to explore later."
                    : "Sign in to keep your bucket list across devices."}
                </span>
              </div>
            </div>

            {user ? (
              <Link
                to="/destinations"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explore destinations</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in</span>
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Full Rail for Signed-In Users with Saved Items (Dense ~2.2 cards visible on mobile)
  return (
    <section className="py-8 sm:py-12 lg:py-16 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Section Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Bookmark className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 fill-emerald-500/20 shrink-0" />
              <span>Your bucket list</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Places you've saved for later.
            </p>
          </div>

          <Link
            to="/bucket-list"
            className="shrink-0 pt-1 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Dense Mobile Saved Places Rail */}
        <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {savedDestinations.map((dest, index) => (
            <div
              key={dest.id}
              className="w-[46vw] min-w-[160px] max-w-[180px] sm:w-auto sm:min-w-[270px] sm:max-w-[290px] shrink-0 snap-start flex flex-col h-full"
            >
              <HomeMatchCard
                destination={dest}
                rank={index + 1}
                showRank={false}
                partySize={partySize}
                carMode={carMode}
                publicModes={publicModes}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BucketListRail;
