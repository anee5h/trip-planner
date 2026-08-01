import { useState, useRef, useEffect } from "react";
import { MapPin, ChevronDown, ChevronRight, X } from "lucide-react";
import { CITY_AREAS } from "@/shared/data/cityAreas";
import { getDestinationList } from "@/shared/services/destination/DestinationService";

export const REGION_PREFECTURES_MAP: Record<string, string[]> = {
  Kanto: [
    "Tokyo",
    "Kanagawa",
    "Saitama",
    "Chiba",
    "Ibaraki",
    "Tochigi",
    "Gunma",
  ],
  Chubu: [
    "Aichi",
    "Gifu",
    "Shizuoka",
    "Nagano",
    "Yamanashi",
    "Niigata",
    "Ishikawa",
    "Fukui",
    "Toyama",
  ],
  Kansai: ["Osaka", "Kyoto", "Hyogo", "Nara", "Shiga", "Mie"],
  Tohoku: ["Miyagi", "Aomori", "Iwate", "Akita", "Yamagata", "Fukushima"],
  Kyushu: [
    "Fukuoka",
    "Nagasaki",
    "Kumamoto",
    "Oita",
    "Miyazaki",
    "Kagoshima",
    "Saga",
  ],
  Hokkaido: ["Hokkaido"],
  Chugoku: ["Hiroshima", "Okayama", "Yamaguchi", "Shimane", "Tottori"],
  Shikoku: ["Ehime", "Kagawa", "Kochi", "Tokushima"],
  Okinawa: ["Okinawa"],
};

interface WhereLocationPickerProps {
  selectedRegions: string[];
  setSelectedRegions: (val: string[] | ((prev: string[]) => string[])) => void;
  selectedPrefectures: string[];
  setSelectedPrefectures: (
    val: string[] | ((prev: string[]) => string[]),
  ) => void;
  selectedCities: string[];
  setSelectedCities: (val: string[]) => void;
  selectedAreas: string[];
  setSelectedAreas: (val: string[]) => void;
}

export default function WhereLocationPicker({
  selectedRegions,
  setSelectedRegions,
  selectedPrefectures,
  setSelectedPrefectures,
  selectedCities,
  setSelectedCities,
  selectedAreas,
  setSelectedAreas,
}: WhereLocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<
    Record<string, boolean>
  >({ Kanto: true });
  const [expandedPrefectures, setExpandedPrefectures] = useState<
    Record<string, boolean>
  >({ Tokyo: true });
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

  const totalSelections =
    selectedRegions.length +
    selectedPrefectures.length +
    selectedCities.length +
    selectedAreas.length;

  const hubs = getDestinationList().filter(
    (place) =>
      Boolean(place.id) &&
      place.role === "hub" &&
      CITY_AREAS.some((area) => area.parentDestinationId === place.id),
  );

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

  const toggleCity = (cityId: string) => {
    if (selectedCities.includes(cityId)) {
      setSelectedCities(selectedCities.filter((id) => id !== cityId));
      const childAreaIds = CITY_AREAS.filter(
        (a) => a.parentDestinationId === cityId,
      ).map((a) => a.id);
      setSelectedAreas(
        selectedAreas.filter((id) => !childAreaIds.includes(id)),
      );
    } else {
      setSelectedCities([...selectedCities, cityId]);
    }
  };

  const toggleArea = (areaId: string) => {
    if (selectedAreas.includes(areaId)) {
      setSelectedAreas(selectedAreas.filter((id) => id !== areaId));
    } else {
      setSelectedAreas([...selectedAreas, areaId]);
    }
  };

  const getButtonLabel = () => {
    if (totalSelections === 0) return "Where";
    if (selectedAreas.length === 1 && totalSelections === 1) {
      const area = CITY_AREAS.find((a) => a.id === selectedAreas[0]);
      return area ? area.name.en : "Where";
    }
    if (selectedCities.length === 1 && totalSelections === 1) {
      const city = hubs.find((h) => h.id === selectedCities[0]);
      return city ? city.name || "Where" : "Where";
    }
    if (selectedPrefectures.length === 1 && totalSelections === 1) {
      return selectedPrefectures[0];
    }
    if (selectedRegions.length === 1 && totalSelections === 1) {
      return `${selectedRegions[0]} Region`;
    }
    return `Where (${totalSelections})`;
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
          totalSelections > 0
            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
        }`}
      >
        <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="truncate max-w-[130px] sm:max-w-[180px]">
          {getButtonLabel()}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 max-h-[440px] overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Where to?
              </span>
            </div>
            {totalSelections > 0 && (
              <button
                onClick={() => {
                  setSelectedRegions([]);
                  setSelectedPrefectures([]);
                  setSelectedCities([]);
                  setSelectedAreas([]);
                }}
                className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear location
              </button>
            )}
          </div>

          <div className="space-y-2 divide-y divide-slate-100 dark:divide-slate-900">
            {Object.entries(REGION_PREFECTURES_MAP).map(
              ([region, prefectures]) => {
                const isRegionChecked = selectedRegions.includes(region);
                const isRegionExpanded = !!expandedRegions[region];

                return (
                  <div key={region} className="pt-2 first:pt-0 space-y-1">
                    <div className="flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900 p-1.5 rounded-lg transition-colors">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={isRegionChecked}
                          onChange={() => toggleRegion(region)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                        />
                        <span>{region}</span>
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
                      <div className="pl-5 space-y-1">
                        {prefectures.map((pref) => {
                          const isPrefChecked =
                            selectedPrefectures.includes(pref);
                          const isPrefExpanded = !!expandedPrefectures[pref];
                          const prefCities = hubs.filter(
                            (h) =>
                              h.prefecture === pref ||
                              (h.region === region &&
                                (h.name ?? "").includes(pref)),
                          );

                          return (
                            <div key={pref} className="space-y-1">
                              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-900">
                                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={isPrefChecked}
                                    onChange={() =>
                                      togglePrefecture(region, pref)
                                    }
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                                  />
                                  <span
                                    className={
                                      isPrefChecked
                                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                                        : ""
                                    }
                                  >
                                    {pref}
                                  </span>
                                </label>
                                {prefCities.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedPrefectures((prev) => ({
                                        ...prev,
                                        [pref]: !prev[pref],
                                      }))
                                    }
                                    className="p-0.5 text-slate-400 hover:text-slate-600"
                                  >
                                    {isPrefExpanded ? (
                                      <ChevronDown className="w-3 h-3" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {isPrefExpanded && prefCities.length > 0 && (
                                <div className="pl-4 space-y-1 border-l-2 border-slate-100 dark:border-slate-800 ml-2">
                                  {prefCities.map((city) => {
                                    const cityId = city.id!;
                                    const isCityChecked =
                                      selectedCities.includes(cityId);
                                    const cityAreas = CITY_AREAS.filter(
                                      (a) => a.parentDestinationId === cityId,
                                    );

                                    return (
                                      <div key={cityId} className="space-y-1">
                                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 dark:text-slate-400 py-0.5">
                                          <input
                                            type="checkbox"
                                            checked={isCityChecked}
                                            onChange={() => toggleCity(cityId)}
                                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                                          />
                                          <span
                                            className={
                                              isCityChecked
                                                ? "font-bold text-emerald-600 dark:text-emerald-400"
                                                : ""
                                            }
                                          >
                                            {city.name}
                                          </span>
                                        </label>
                                        {cityAreas.length > 0 && (
                                          <div className="pl-4 grid grid-cols-2 gap-1">
                                            {cityAreas.map((area) => {
                                              const isAreaChecked =
                                                selectedAreas.includes(area.id);
                                              return (
                                                <label
                                                  key={area.id}
                                                  className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-500 dark:text-slate-400 hover:text-emerald-600"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={isAreaChecked}
                                                    onChange={() =>
                                                      toggleArea(area.id)
                                                    }
                                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-2.5 h-2.5"
                                                  />
                                                  <span
                                                    className={
                                                      isAreaChecked
                                                        ? "font-bold text-emerald-600"
                                                        : ""
                                                    }
                                                  >
                                                    {area.name.en}
                                                  </span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
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
