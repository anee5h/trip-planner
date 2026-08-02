import { Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import {
  Compass,
  MapPin,
  Trophy,
  Award,
  Sparkles,
  ArrowRight,
  Target,
  Flame,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import collectionsIndex from "@/shared/data/collections-index.json";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Collection } from "@/shared/types/collection";
import type { PassportTab } from "../types";

interface PassportOverviewProps {
  onSelectTab: (tab: PassportTab) => void;
}

const REGIONS = [
  {
    name: "Kanto",
    prefectures: [
      "Ibaraki",
      "Tochigi",
      "Gunma",
      "Saitama",
      "Chiba",
      "Tokyo",
      "Kanagawa",
    ],
  },
  {
    name: "Kansai",
    prefectures: [
      "Mie",
      "Shiga",
      "Kyoto",
      "Osaka",
      "Hyogo",
      "Nara",
      "Wakayama",
    ],
  },
  {
    name: "Tohoku",
    prefectures: [
      "Aomori",
      "Iwate",
      "Miyagi",
      "Akita",
      "Yamagata",
      "Fukushima",
    ],
  },
  {
    name: "Chubu",
    prefectures: [
      "Niigata",
      "Toyama",
      "Ishikawa",
      "Fukui",
      "Yamanashi",
      "Nagano",
      "Gifu",
      "Shizuoka",
      "Aichi",
    ],
  },
  {
    name: "Chugoku",
    prefectures: ["Tottori", "Shimane", "Okayama", "Hiroshima", "Yamaguchi"],
  },
  {
    name: "Shikoku",
    prefectures: ["Tokushima", "Kagawa", "Ehime", "Kochi"],
  },
  {
    name: "Kyushu",
    prefectures: [
      "Fukuoka",
      "Saga",
      "Nagasaki",
      "Kumamoto",
      "Oita",
      "Miyazaki",
      "Kagoshima",
      "Okinawa",
    ],
  },
  { name: "Hokkaido", prefectures: ["Hokkaido"] },
];

export function PassportOverview({ onSelectTab }: PassportOverviewProps) {
  const { visited, visitedPrefectures, trips } = useTripStore();

  // Achievement Collections Progress
  const achievementCollections = (collectionsIndex as Collection[]).filter(
    (c) => c.isAchievement === true,
  );

  const achievementStats = achievementCollections.map((col) => {
    const colDestinations = destinationsIndex.filter((d) =>
      d.collections?.some((m) => m.collectionId === col.id),
    );
    const visitedCount = colDestinations.filter((d) =>
      visited.includes(d.id),
    ).length;
    const totalMembers =
      col.metadata?.expectedMembers || colDestinations.length;
    const pct =
      totalMembers > 0
        ? Math.min(100, Math.round((visitedCount / totalMembers) * 100))
        : 0;
    const isCompleted = visitedCount >= totalMembers && totalMembers > 0;
    return {
      collection: col,
      visitedCount,
      totalMembers,
      pct,
      isCompleted,
    };
  });

  const japanPct = Math.round((visitedPrefectures.length / 47) * 100);

  // Find next milestone region (closest uncompleted region)
  const regionProgress = REGIONS.map((r) => {
    const visitedCount = r.prefectures.filter((p) =>
      visitedPrefectures.includes(p),
    ).length;
    const total = r.prefectures.length;
    const remaining = total - visitedCount;
    return { region: r.name, visitedCount, total, remaining };
  });

  const nextRegionGoal = regionProgress
    .filter((r) => r.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)[0] || {
    region: "All Regions",
    visitedCount: 47,
    total: 47,
    remaining: 0,
  };

  // Find recent visited destinations objects
  const recentVisitedList = destinationsIndex
    .filter((d) => visited.includes(d.id))
    .slice(0, 4);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 12-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column (8 Cols) */}
        <div className="lg:col-span-8 space-y-8">
          {/* Hero KPI Card — Japan Exploration Focus */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white p-5 md:p-6 shadow-lg shadow-emerald-900/10">
            {/* Background Decorative Rings */}
            <div className="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />
            <div className="absolute right-20 -top-20 w-48 h-48 rounded-full bg-teal-400/10 blur-xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                      Japan Exploration Status
                    </span>
                    <h2 className="text-lg md:text-xl font-extrabold tracking-tight">
                      Prefectures Visited
                    </h2>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-2xl md:text-3xl font-extrabold tracking-tight">
                    {japanPct}%
                  </span>
                  <p className="text-xs font-medium text-emerald-200">
                    of Japan Explored
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-emerald-100 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {visitedPrefectures.length} of 47 Prefectures
                  </span>
                  <span className="text-emerald-200 font-extrabold">
                    {47 - visitedPrefectures.length} remaining
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-black/20 backdrop-blur-sm p-0.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-teal-200 shadow-sm transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(japanPct, 4)}%` }}
                  />
                </div>
              </div>

              {/* Bottom Quick Jump Action */}
              <div className="pt-2 flex items-center justify-between border-t border-white/15">
                <p className="text-xs text-emerald-100/90 font-medium">
                  {visitedPrefectures.length > 0
                    ? `Awesome start! Logged visits in ${visitedPrefectures.length} prefecture${visitedPrefectures.length > 1 ? "s" : ""}.`
                    : "Start logging your travel history on the interactive map!"}
                </p>
                <button
                  onClick={() => onSelectTab("japan-map")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md transition-all shrink-0"
                >
                  Interactive Map <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Next Goal & Motivation Section */}
          <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Suggested Next Goal
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Target your next milestone to level up your passport
                  </p>
                </div>
              </div>

              {nextRegionGoal.remaining > 0 && (
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                  {nextRegionGoal.remaining} prefecture
                  {nextRegionGoal.remaining > 1 ? "s" : ""} away
                </span>
              )}
            </div>

            {nextRegionGoal.remaining > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    Complete {nextRegionGoal.region} Region Explorer
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Visit {nextRegionGoal.remaining} more prefecture
                    {nextRegionGoal.remaining > 1 ? "s" : ""} in{" "}
                    {nextRegionGoal.region} ({nextRegionGoal.visitedCount}/
                    {nextRegionGoal.total} completed).
                  </p>
                </div>

                <button
                  onClick={() => onSelectTab("badges")}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold shrink-0 hover:opacity-90 transition-opacity"
                >
                  View Badges
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span>
                  🎉 Incredible achievement! You have visited all 47 prefectures
                  of Japan!
                </span>
                <button
                  onClick={() => onSelectTab("badges")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                >
                  Claim Badges
                </button>
              </div>
            )}
          </div>

          {/* Progress-First Benchmark Goals (UNESCO, Castles, etc.) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Top Benchmark Achievements
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Progress metrics across official Japanese heritage benchmarks
                </p>
              </div>

              <button
                onClick={() => onSelectTab("achievements")}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                All Achievements ({achievementCollections.length}){" "}
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {achievementStats
                .slice(0, 4)
                .map(
                  ({
                    collection,
                    visitedCount,
                    totalMembers,
                    pct,
                    isCompleted,
                  }) => (
                    <Link
                      key={collection.id}
                      to={`/collections/${collection.slug}`}
                      className="group p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all shadow-sm block"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {collection.name}
                        </span>
                        {isCompleted ? (
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Done
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            {visitedCount}/{totalMembers}
                          </span>
                        )}
                      </div>

                      <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted
                              ? "bg-emerald-500"
                              : "bg-gradient-to-r from-amber-500 to-emerald-500"
                          }`}
                          style={{ width: `${Math.max(pct, 3)}%` }}
                        />
                      </div>
                    </Link>
                  ),
                )}
            </div>
          </div>
        </div>

        {/* Sidebar Column (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Stats Panel */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Activity Overview
            </h3>

            <div className="space-y-3">
              <div
                onClick={() => onSelectTab("statistics")}
                className="cursor-pointer flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Visited Destinations
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {visited.length}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div
                onClick={() => onSelectTab("achievements")}
                className="cursor-pointer flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shadow-xs">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Achievements Unlocked
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {visited.length >= 1 ? "1" : "0"} / 6 Milestones
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div
                onClick={() => onSelectTab("badges")}
                className="cursor-pointer flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shadow-xs">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Enamel Pin Badges
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      22 Travel Badges
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div
                onClick={() => onSelectTab("timeline")}
                className="cursor-pointer flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shadow-xs">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Planned Trips
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {trips.length} Itineraries
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          {/* Recent Logged Activity Feed Snippet */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Recent Logged Visits
              </h3>
              <button
                onClick={() => onSelectTab("timeline")}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
              >
                Full Timeline →
              </button>
            </div>

            {recentVisitedList.length > 0 ? (
              <div className="space-y-2.5">
                {recentVisitedList.map((dest) => (
                  <div
                    key={dest.id}
                    className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {dest.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {dest.prefecture}
                        {dest.categories?.[0] ? ` • ${dest.categories[0]}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                No visited places logged yet. Browse destinations to mark your
                first spot!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
