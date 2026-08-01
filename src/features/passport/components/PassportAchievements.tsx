import { useTripStore } from "@/shared/hooks/useTripStore";
import { ACHIEVEMENTS_CATALOG } from "../data/achievements";
import { AchievementEngine } from "../services/AchievementEngine";
import { Trophy, CheckCircle2, Lock } from "lucide-react";

export function PassportAchievements() {
  const { visited, visitedPrefectures, trips } = useTripStore();

  const evaluationContext = {
    visited,
    visitedPrefectures,
    visitedDates: {},
    tripsCount: trips.length,
    completedCollectionIds: [],
  };

  const achievementStatuses = AchievementEngine.evaluateAll(evaluationContext);
  const totalUnlocked = Object.values(achievementStatuses).filter(
    (a) => a.isUnlocked,
  ).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center sm:p-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <Trophy className="w-4 h-4" />
            Major Travel Milestones
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
            Travel Accomplishments & Heritage Goals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Permanent milestone awards unlocked as you complete collections and
            reach travel benchmarks.
          </p>
        </div>

        <div className="px-4 py-2 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 shrink-0 text-center md:text-right">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Unlocked
          </div>
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
            {totalUnlocked}{" "}
            <span className="text-xs font-normal text-slate-400">
              / {ACHIEVEMENTS_CATALOG.length}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Milestone Accomplishment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ACHIEVEMENTS_CATALOG.map((ach) => {
          const status = achievementStatuses[ach.id] || { isUnlocked: false };

          return (
            <div
              key={ach.id}
              className={`rounded-2xl border p-4 transition-all sm:p-5 ${
                status.isUnlocked
                  ? "bg-white dark:bg-slate-900 border-amber-200/80 dark:border-amber-800/60 shadow-sm"
                  : "bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-75"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-3.5 rounded-2xl shrink-0 ${
                    status.isUnlocked
                      ? "bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-md shadow-amber-500/20 ring-4 ring-amber-400/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  }`}
                >
                  <Trophy className="w-6 h-6" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {ach.category}
                    </span>
                    {status.isUnlocked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Earned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                        <Lock className="w-3.5 h-3.5" /> Locked
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white pt-1">
                    {ach.title}
                  </h3>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {ach.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
