import { useState, useRef, useEffect } from "react";
import { MapPin, ChevronDown, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/shared/context/LocaleContext";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";

export const REGION_PREFECTURES_MAP: Record<string, string[]> = {
  Hokkaido: ["Hokkaido"],
  Tohoku: ["Aomori", "Iwate", "Miyagi", "Akita", "Yamagata", "Fukushima"],
  Kanto: [
    "Ibaraki",
    "Tochigi",
    "Gunma",
    "Saitama",
    "Chiba",
    "Tokyo",
    "Kanagawa",
  ],
  Chubu: [
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
  Kansai: ["Mie", "Shiga", "Kyoto", "Osaka", "Hyogo", "Nara", "Wakayama"],
  Chugoku: ["Tottori", "Shimane", "Okayama", "Hiroshima", "Yamaguchi"],
  Shikoku: ["Tokushima", "Kagawa", "Ehime", "Kochi"],
  Kyushu: [
    "Fukuoka",
    "Saga",
    "Nagasaki",
    "Kumamoto",
    "Oita",
    "Miyazaki",
    "Kagoshima",
  ],
  Okinawa: ["Okinawa"],
};

interface WhereLocationPickerProps {
  selectedRegions: string[];
  setSelectedRegions: (val: string[] | ((prev: string[]) => string[])) => void;
  selectedPrefectures: string[];
  setSelectedPrefectures: (
    val: string[] | ((prev: string[]) => string[]),
  ) => void;
}

export default function WhereLocationPicker({
  selectedRegions,
  setSelectedRegions,
  selectedPrefectures,
  setSelectedPrefectures,
}: WhereLocationPickerProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<
    Record<string, boolean>
  >({ Kanto: true });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalSelections = selectedPrefectures.length;

  const toggleRegion = (region: string) => {
    const prefs = REGION_PREFECTURES_MAP[region] || [];
    const isSelected = selectedRegions.includes(region);
    if (isSelected) {
      setSelectedRegions((prev) => prev.filter((r) => r !== region));
      setSelectedPrefectures((prev) => prev.filter((p) => !prefs.includes(p)));
    } else {
      setSelectedRegions((prev) => [...prev, region]);
      setSelectedPrefectures((prev) =>
        Array.from(new Set([...prev, ...prefs])),
      );
    }
  };

  const togglePrefecture = (region: string, pref: string) => {
    const prefs = REGION_PREFECTURES_MAP[region] || [];
    const isSelected = selectedPrefectures.includes(pref);
    let nextPrefs: string[];
    if (isSelected) {
      nextPrefs = selectedPrefectures.filter((p) => p !== pref);
    } else {
      nextPrefs = [...selectedPrefectures, pref];
    }
    setSelectedPrefectures(nextPrefs);

    if (prefs.every((p) => nextPrefs.includes(p))) {
      if (!selectedRegions.includes(region))
        setSelectedRegions((prev) => [...prev, region]);
    } else {
      if (selectedRegions.includes(region))
        setSelectedRegions((prev) => prev.filter((r) => r !== region));
    }
  };

  const getButtonLabel = () => {
    if (totalSelections === 0 && selectedRegions.length === 0) {
      return (
        <>
          <span className="sm:hidden">{t("ui.anywhere")}</span>
          <span className="hidden sm:inline">
            {t("ui.allRegionsAndPrefectures")}
          </span>
        </>
      );
    }
    if (selectedPrefectures.length === 1) {
      return formatPrefecture(selectedPrefectures[0], locale);
    }
    if (
      selectedRegions.length === 1 &&
      totalSelections ===
        (REGION_PREFECTURES_MAP[selectedRegions[0]]?.length || 0)
    ) {
      const localizedRegion = localizePlaceLabel(selectedRegions[0], locale);
      if (locale === "ja") {
        if (
          selectedRegions[0] === "Hokkaido" ||
          selectedRegions[0] === "Okinawa"
        ) {
          return localizedRegion;
        }
        return localizedRegion.endsWith("地方")
          ? localizedRegion
          : `${localizedRegion}地方`;
      }
      return `${selectedRegions[0]} Region`;
    }
    return t("ui.locationCount", { count: totalSelections });
  };

  return (
    <div className="relative min-w-0 sm:w-auto" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-9 w-full items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all sm:w-auto ${
          totalSelections > 0 || selectedRegions.length > 0
            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold"
            : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
        }`}
      >
        <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="max-w-[150px] truncate sm:max-w-[200px]">
          {getButtonLabel()}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-72 sm:w-80 max-h-[420px] overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {t("ui.regionsAndPrefectures")}
            </span>
            {(totalSelections > 0 || selectedRegions.length > 0) && (
              <button
                onClick={() => {
                  setSelectedRegions([]);
                  setSelectedPrefectures([]);
                }}
                className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" />{" "}
                {t("actions.clear", {
                  defaultValue: locale === "ja" ? "クリア" : "Clear",
                })}
              </button>
            )}
          </div>

          <div className="space-y-1 divide-y divide-slate-100 dark:divide-slate-900">
            {Object.entries(REGION_PREFECTURES_MAP).map(
              ([region, prefectures]) => {
                const isRegionChecked = selectedRegions.includes(region);
                const isRegionExpanded = !!expandedRegions[region];

                return (
                  <div key={region} className="pt-1.5 first:pt-0 space-y-1">
                    <div className="flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900 p-1.5 rounded-lg transition-colors">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={isRegionChecked}
                          onChange={() => toggleRegion(region)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                        />
                        <span>{localizePlaceLabel(region, locale)}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRegions((prev) => ({
                            ...prev,
                            [region]: !prev[region],
                          }))
                        }
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {isRegionExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {isRegionExpanded && (
                      <div className="pl-6 space-y-1 py-1">
                        {prefectures.map((pref) => {
                          const isPrefChecked =
                            selectedPrefectures.includes(pref);
                          return (
                            <label
                              key={pref}
                              className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 py-0.5 hover:text-emerald-600"
                            >
                              <input
                                type="checkbox"
                                checked={isPrefChecked}
                                onChange={() => togglePrefecture(region, pref)}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                              />
                              <span
                                className={
                                  isPrefChecked
                                    ? "font-bold text-emerald-600 dark:text-emerald-400"
                                    : ""
                                }
                              >
                                {formatPrefecture(pref, locale)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
    </div>
  );
}
