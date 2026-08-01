import { useTripStore } from "@/shared/hooks/useTripStore";
import destinationsIndex from "@/shared/data/destinations-index.json";
import { BarChart3, MapPin, Sparkles, Trophy } from "lucide-react";
import type { Destination } from "@/shared/types/destination";

export function PassportStatistics() {
  const { visited, visitedPrefectures } = useTripStore();

  const allDestinations = destinationsIndex as Destination[];
  const visitedDestinations = allDestinations.filter((d) =>
    visited.includes(d.id),
  );

  // Group by category
  const categoryCounts: Record<string, number> = {};
  visitedDestinations.forEach((d) => {
    const cat = d.categories?.[0] || "Uncategorized";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const categoriesSorted = Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-in fade-in duration-200 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-indigo-500" />
            Travel Statistics & Analytics
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Detailed breakdown of your explored locations across Japan
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stat 1 */}
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center gap-3 mb-2">
            <MapPin className="w-5 h-5 text-emerald-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Prefectures
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {visitedPrefectures.length} / 47
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {Math.round((visitedPrefectures.length / 47) * 100)}% of Japan
            prefectures visited
          </div>
        </div>

        {/* Stat 2 */}
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Sights Logged
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {visited.length}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Registered destinations marked visited
          </div>
        </div>

        {/* Stat 3 */}
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Categories Explored
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {categoriesSorted.length}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Distinct destination categories experienced
          </div>
        </div>
      </div>

      {/* Category Breakdown List */}
      {categoriesSorted.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            Explored Sights by Category
          </h3>
          <div className="space-y-3">
            {categoriesSorted.map(([category, count]) => {
              const pct = Math.round((count / visited.length) * 100);
              return (
                <div key={category} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span className="capitalize">{category}</span>
                    <span>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
