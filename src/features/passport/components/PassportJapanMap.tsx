import { useState, useEffect } from "react";
import Japan from "@react-map/japan";
import { useTripStore } from "@/shared/hooks/useTripStore";

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

export function PassportJapanMap() {
  const { visitedPrefectures, isPrefectureVisited } = useTripStore();
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-in fade-in duration-200 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col items-center">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Explored Prefectures Map
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Hover over any prefecture to view details
          </p>
        </div>

        {/* Interactive Map */}
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

        {/* Region Breakdown */}
        <div className="w-full pt-6 border-t border-slate-100 dark:border-slate-800/80 mt-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-center sm:text-left">
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
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500"
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
  );
}
