import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { PassportTimelineCalendar } from "./components/PassportTimelineCalendar";
import Japan from "@react-map/japan";
import {
  Compass,
  CheckCircle2,
  Trophy,
  Castle,
  Landmark,
  Trees,
  Crown,
  Flame,
  Building,
  Sparkles,
  Tag,
  MapPin,
} from "lucide-react";
import collectionsIndex from "@/shared/data/collections-index.json";
import { getLoadedLitePlaces } from "@/shared/services/place/PlaceCatalog";
import { useLiteCatalogueReady } from "@/shared/hooks/useLiteCatalogueReady";
import type { Collection } from "@/shared/types/collection";
import type { Destination } from "@/shared/types/destination";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { getCollectionContent } from "@/shared/utils/collections";

const ICON_MAP: Record<string, React.ElementType> = {
  Castle,
  Landmark,
  Crown,
  Trees,
  Flame,
  Building,
  Sparkles,
};

const REGIONS = [
  {
    name: "Hokkaido",
    prefectures: [{ id: "Hokkaido\x8D", name: "Hokkaido" }],
  },
  {
    name: "Tohoku",
    prefectures: [
      { id: "Aomori", name: "Aomori" },
      { id: "Iwate", name: "Iwate" },
      { id: "Miyagi", name: "Miyagi" },
      { id: "Akita", name: "Akita" },
      { id: "Yamagata", name: "Yamagata" },
      { id: "Fukushima", name: "Fukushima" },
    ],
  },
  {
    name: "Kanto",
    prefectures: [
      { id: "Ibaraki", name: "Ibaraki" },
      { id: "Tochigi", name: "Tochigi" },
      { id: "Gunma", name: "Gunma" },
      { id: "Saitama", name: "Saitama" },
      { id: "Chiba", name: "Chiba" },
      { id: "Tokyo", name: "Tokyo" },
      { id: "Kanagawa", name: "Kanagawa" },
    ],
  },
  {
    name: "Chubu",
    prefectures: [
      { id: "Niigata", name: "Niigata" },
      { id: "Toyama", name: "Toyama" },
      { id: "Ishikawa", name: "Ishikawa" },
      { id: "Fukui", name: "Fukui" },
      { id: "Yamanashi", name: "Yamanashi" },
      { id: "Nagano", name: "Nagano" },
      { id: "Gifu", name: "Gifu" },
      { id: "Shizuoka", name: "Shizuoka" },
      { id: "Aichi", name: "Aichi" },
    ],
  },
  {
    name: "Kansai",
    prefectures: [
      { id: "Mie", name: "Mie" },
      { id: "Shiga", name: "Shiga" },
      { id: "Kyoto", name: "Kyoto" },
      { id: "Osaka", name: "Osaka" },
      { id: "Hyogo", name: "Hyogo" },
      { id: "Nara", name: "Nara" },
      { id: "Wakayama", name: "Wakayama" },
    ],
  },
  {
    name: "Chugoku",
    prefectures: [
      { id: "Tottori", name: "Tottori" },
      { id: "Shimane", name: "Shimane" },
      { id: "Okayama", name: "Okayama" },
      { id: "Hiroshima", name: "Hiroshima" },
      { id: "Yamaguchi", name: "Yamaguchi" },
    ],
  },
  {
    name: "Shikoku",
    prefectures: [
      { id: "Tokushima", name: "Tokushima" },
      { id: "Kagawa", name: "Kagawa" },
      { id: "Ehime", name: "Ehime" },
      { id: "Kochi", name: "Kochi" },
    ],
  },
  {
    name: "Kyushu & Okinawa",
    prefectures: [
      { id: "Fukuoka", name: "Fukuoka" },
      { id: "Saga", name: "Saga" },
      { id: "Nagasaki", name: "Nagasaki" },
      { id: "Kumamoto", name: "Kumamoto" },
      { id: "Oita", name: "Oita" },
      { id: "Miyazaki", name: "Miyazaki" },
      { id: "Kagoshima", name: "Kagoshima" },
      { id: "Okinawa", name: "Okinawa" },
    ],
  },
];

export default function PrefectureChecklist() {
  const { t } = useTranslation();
  const { visited, visitedPrefectures, isPrefectureVisited } = useTripStore();
  const { locale } = useLocale();
  // KAI-132: lite catalogue runtime-loaded at the map route boundary.
  const {
    ready: liteReady,
    error: liteError,
    retry: retryLite,
  } = useLiteCatalogueReady();
  const destinationsIndex = liteReady
    ? (getLoadedLitePlaces() as Destination[])
    : [];

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const mapSize = windowWidth < 640 ? Math.min(windowWidth - 80, 320) : 580;

  const cityColors = visitedPrefectures.reduce(
    (acc, pref) => {
      acc[pref] = "#10b981"; // emerald-500
      return acc;
    },
    {} as Record<string, string>,
  );

  // Compute Achievement Collection Progress
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

  const completedAchievementsCount = achievementStats.filter(
    (s) => s.isCompleted,
  ).length;

  // KAI-132: a failed lite load is NOT ready — surface an explicit
  // error/retry state instead of an empty checklist that looks real.
  if (liteError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div
          role="alert"
          data-lite-error
          className="flex flex-col items-center justify-center py-20 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/50 text-center px-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t("home.matchesErrorTitle", "Couldn't load destinations")}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "home.matchesErrorBody",
              "The destination catalogue couldn't be loaded. Check your connection and try again.",
            )}
          </p>
          <button
            type="button"
            onClick={retryLite}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("ui.retry", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <Compass className="w-8 h-8 text-emerald-700 dark:text-emerald-300" />
            Travel Passport
          </h1>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl text-base">
            Your personal travel activity log and curated heritage achievements
            across Japan.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3">
            <MapPin className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                Prefectures
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {visitedPrefectures.length}{" "}
                <span className="text-xs text-slate-500">/ 47</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-500" />
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                Achievements
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {completedAchievementsCount}{" "}
                <span className="text-xs text-slate-500">
                  / {achievementCollections.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Passport Internal Navigation Bar */}
      <div className="sticky top-16 z-30 bg-background/90 backdrop-blur-md py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <a
            href="#dashboard"
            className="px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs shrink-0 border border-emerald-200 dark:border-emerald-800"
          >
            🎯 Dashboard
          </a>
          <a
            href="#japan-map"
            className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            🗾 Japan Map
          </a>
          <a
            href="#timeline"
            className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            📜 Timeline
          </a>
          <a
            href="#achievements"
            className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            🏆 Achievements
          </a>
          <a
            href="#badges"
            className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            🎖️ Badges
          </a>
        </div>
      </div>

      {/* Featured Interactive Map Section */}
      <div
        id="japan-map"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm scroll-mt-28"
      >
        <div className="flex flex-col items-center">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Explored Prefectures
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">
              Hover over any prefecture to view details
            </p>
          </div>

          {/* Interactive Map with Hover Tooltips */}
          <div className="w-full max-w-[680px] aspect-square flex items-center justify-center py-4">
            <Japan
              type="select-multiple"
              size={mapSize}
              mapColor="#cbd5e1"
              strokeColor="#ffffff"
              strokeWidth={1.5}
              hoverColor="#34d399"
              selectColor="#10b981"
              cityColors={cityColors}
              hints={true}
              hintTextColor="#ffffff"
              hintBackgroundColor="#0f172a"
              hintPadding="6px 12px"
              hintBorderRadius={8}
            />
          </div>

          {/* Compact Region Breakdown Strip */}
          <div className="w-full pt-6 border-t border-slate-100 dark:border-slate-800/80 mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 text-center sm:text-left">
              Regional Breakdown
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {REGIONS.map((region) => {
                const visitedCount = region.prefectures.filter((p) =>
                  isPrefectureVisited(p.id),
                ).length;
                const total = region.prefectures.length;
                const hasVisited = visitedCount > 0;
                return (
                  <div
                    key={region.name}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      hasVisited
                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800"
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {region.name}
                    </div>
                    <div
                      className={`text-xs font-extrabold mt-0.5 ${
                        hasVisited
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-slate-500 dark:text-slate-300"
                      }`}
                    >
                      {visitedCount} / {total}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Passport Activity Timeline & Calendar View */}
      <div id="timeline" className="scroll-mt-28">
        <PassportTimelineCalendar />
      </div>

      {/* Passport Achievements Section (System Light/Dark Tokens) */}
      <div
        id="achievements"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm scroll-mt-28"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Trophy className="w-6 h-6 text-amber-500" />
              Passport Achievements
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
              Track progress across official heritage benchmarks & curated
              Japanese travel lists
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto">
            <span className="text-xs text-slate-500 dark:text-slate-300 uppercase font-bold tracking-wider">
              Unlocked
            </span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
              {completedAchievementsCount} / {achievementCollections.length}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievementStats.map(
            ({ collection, visitedCount, totalMembers, pct, isCompleted }) => {
              const Icon = ICON_MAP[collection.icon] || Tag;
              return (
                <Link
                  key={collection.id}
                  to={`/collections/${collection.slug}`}
                  className="group block p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-emerald-700/50 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-white dark:bg-slate-700 text-amber-500 shadow-sm group-hover:scale-110 transition-transform shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {getCollectionContent(collection, locale).name}
                      </span>
                    </div>
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Done
                      </span>
                    ) : (
                      <span className="text-xs font-extrabold text-slate-500 dark:text-slate-300 shrink-0">
                        {pct}%
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300">
                      <span>Progress</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {visitedCount} / {totalMembers}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted
                            ? "bg-emerald-700 shadow-sm"
                            : "bg-emerald-700"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
