import { useState, useEffect } from "react";
import Japan from "@react-map/japan";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { REGIONS } from "../data/regions";

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

  const mapSize = windowWidth < 640 ? Math.min(windowWidth - 80, 320) : 720;

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
            type="select-single"
            size={mapSize}
            mapColor="#cbd5e1"
            strokeColor="#ffffff"
            strokeWidth={1.5}
            hoverColor="#cbd5e1"
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
                isPrefectureVisited(p),
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
