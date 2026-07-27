import { Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { getAdjustedBudget } from "@/shared/utils/utils";
import {
  getWalkingIntensity,
  getWalkingIntensityMetadata,
} from "@/shared/utils/walking";
import { X, Trash2, Scale, ExternalLink } from "lucide-react";

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompareModal({ isOpen, onClose }: CompareModalProps) {
  const { compareList, toggleCompare, clearCompare } = useTripStore();
  const allDestinations = getDestinationList() as Destination[];

  if (!isOpen) return null;

  // Cap strictly at 3 destinations max
  const compareDestinations = compareList
    .slice(0, 3)
    .map((id) => allDestinations.find((d) => d.id === id))
    .filter((d): d is Destination => !!d);

  // Best value helpers
  const getMin = (arr: number[]) => (arr.length > 0 ? Math.min(...arr) : 0);
  const getMax = (arr: number[]) => (arr.length > 0 ? Math.max(...arr) : 0);

  const budgets = compareDestinations.map((d) => getAdjustedBudget(d, "all"));
  const minBudget = getMin(budgets);

  const travelTimes = compareDestinations.map((d) => {
    const times = Object.values(d.transportOptions || {}).filter(
      (t): t is number => t !== undefined,
    );
    return times.length > 0 ? Math.min(...times) : 999;
  });
  const minTravelTime = getMin(travelTimes);

  const walking = compareDestinations.map((d) => d.walkingMin ?? 0);
  const minWalking = getMin(walking);

  const coupleScores = compareDestinations.map((d) => d.ratings.couple);
  const maxCoupleScore = getMax(coupleScores);

  const overallScores = compareDestinations.map((d) => d.ratings.overall);
  const maxOverall = getMax(overallScores);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Side-by-Side Comparison
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparing {compareDestinations.length} of 3 destinations max
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {compareDestinations.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompare}
                className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Clear All
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close comparison modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {compareDestinations.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <Scale className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-700 dark:text-slate-300 font-bold text-base">
                No destinations selected for comparison
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Tap the "Compare" button on destination cards to compare up to 3
                places side-by-side.
              </p>
            </div>
          ) : (
            <>
              {/* Destination Cards Header Grid - Strict Equal Columns */}
              <div
                className={`grid gap-4 ${
                  compareDestinations.length === 1
                    ? "grid-cols-1 max-w-md mx-auto"
                    : compareDestinations.length === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1 md:grid-cols-3"
                }`}
              >
                {compareDestinations.map((dest) => (
                  <div
                    key={dest.id}
                    className="relative bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col min-w-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  >
                    <button
                      onClick={() => toggleCompare(dest.id)}
                      className="absolute top-6 right-6 z-10 p-1.5 bg-black/40 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-colors"
                      title="Remove from compare"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {/* Image Aspect & Overflow Protection */}
                    <div className="w-full h-36 md:h-40 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 relative shrink-0 mb-3">
                      <img
                        src={dest.heroImage}
                        alt={dest.name}
                        className="w-full h-full object-cover shrink-0"
                      />
                    </div>

                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                      {dest.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
                      {dest.prefecture} • {dest.categories?.[0] || "Attraction"}
                    </p>

                    <Link
                      to={`/destinations/${dest.id}`}
                      onClick={onClose}
                      className="mt-auto"
                    >
                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> View
                        Details
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>

              {/* Comparative Feature Matrix Grid */}
              <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  Feature Comparison Matrix
                </h4>

                {/* Metric 1: Overall Rating */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Overall Score
                  </div>
                  <div
                    className={`grid gap-4 ${
                      compareDestinations.length === 1
                        ? "grid-cols-1 max-w-md mx-auto"
                        : compareDestinations.length === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : "grid-cols-1 md:grid-cols-3"
                    }`}
                  >
                    {compareDestinations.map((dest) => {
                      const isBest = dest.ratings.overall === maxOverall;
                      return (
                        <div
                          key={dest.id}
                          className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center min-w-0"
                        >
                          <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                            {dest.ratings.overall} / 10
                          </span>
                          {isBest && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px] font-extrabold">
                              Best
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Metric 2: Estimated Budget */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estimated Budget (per person)
                  </div>
                  <div
                    className={`grid gap-4 ${
                      compareDestinations.length === 1
                        ? "grid-cols-1 max-w-md mx-auto"
                        : compareDestinations.length === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : "grid-cols-1 md:grid-cols-3"
                    }`}
                  >
                    {compareDestinations.map((dest) => {
                      const cost = getAdjustedBudget(dest, "all");
                      const isLowest = cost === minBudget;
                      return (
                        <div
                          key={dest.id}
                          className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center min-w-0"
                        >
                          <span className="font-bold text-slate-900 dark:text-white text-sm">
                            ¥{(cost / 1000).toFixed(0)}k
                          </span>
                          {isLowest && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px] font-extrabold">
                              Lowest
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Metric 3: Travel Time */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Fastest Travel Time
                  </div>
                  <div
                    className={`grid gap-4 ${
                      compareDestinations.length === 1
                        ? "grid-cols-1 max-w-md mx-auto"
                        : compareDestinations.length === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : "grid-cols-1 md:grid-cols-3"
                    }`}
                  >
                    {compareDestinations.map((dest) => {
                      const times = Object.entries(
                        dest.transportOptions || {},
                      ).filter(([_, v]) => v !== undefined) as [
                        string,
                        number,
                      ][];
                      const fastest =
                        times.length > 0
                          ? times.reduce((min, curr) =>
                              curr[1] < min[1] ? curr : min,
                            )
                          : ["none", 999];
                      const time = fastest[1];
                      const mode = fastest[0];
                      const isFastest = time === minTravelTime && time !== 999;
                      return (
                        <div
                          key={dest.id}
                          className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center min-w-0"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate">
                            {time !== 999 ? `${time}m (${mode})` : "N/A"}
                          </span>
                          {isFastest && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px] font-extrabold shrink-0">
                              Fastest
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Metric 4: Walking Intensity */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Walk Intensity
                  </div>
                  <div
                    className={`grid gap-4 ${
                      compareDestinations.length === 1
                        ? "grid-cols-1 max-w-md mx-auto"
                        : compareDestinations.length === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : "grid-cols-1 md:grid-cols-3"
                    }`}
                  >
                    {compareDestinations.map((dest) => {
                      const walkMeta = getWalkingIntensityMetadata(
                        getWalkingIntensity(dest),
                      );
                      return (
                        <div
                          key={dest.id}
                          className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center min-w-0"
                        >
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${walkMeta.badgeClass}`}
                          >
                            {walkMeta.icon} {walkMeta.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Metric 5: Couple Score */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Couple Rating
                  </div>
                  <div
                    className={`grid gap-4 ${
                      compareDestinations.length === 1
                        ? "grid-cols-1 max-w-md mx-auto"
                        : compareDestinations.length === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : "grid-cols-1 md:grid-cols-3"
                    }`}
                  >
                    {compareDestinations.map((dest) => {
                      const score = dest.ratings.couple;
                      const isMax = score === maxCoupleScore;
                      return (
                        <div
                          key={dest.id}
                          className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center min-w-0"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {score} / 10
                          </span>
                          {isMax && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px] font-extrabold shrink-0">
                              Highest
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
