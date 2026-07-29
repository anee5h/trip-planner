import { useEffect, useState, useRef } from "react";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/shared/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/components/ui/select";
import {
  Search,
  Clock,
  Train,
  Bus,
  TrainFront,
  Plane,
  Star,
  Heart,
  Footprints,
  Coins,
  ThermometerSun,
  Snowflake,
  Filter,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  MapPin,
  X,
  Sparkles,
} from "lucide-react";

const REGION_PREFECTURES_MAP: Record<string, string[]> = {
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

import { getCollections } from "@/shared/data/collections";
import { Layers } from "lucide-react";
import type { BudgetTier, PartyProfile } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";

interface DestinationFiltersProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  selectedRegions: string[];
  setSelectedRegions: (val: string[] | ((prev: string[]) => string[])) => void;
  selectedPrefectures: string[];
  setSelectedPrefectures: (
    val: string[] | ((prev: string[]) => string[]),
  ) => void;
  selectedCollections: string[];
  setSelectedCollections: (
    val: string[] | ((prev: string[]) => string[]),
  ) => void;
  sortBy: string;
  setSortBy: (val: string) => void;
  carMode: string;
  setCarMode: (val: string) => void;
  publicModes: string[];
  setPublicModes: (val: string[]) => void;
  partySize: number;
  setPartySize: (val: number) => void;
  partyProfile: PartyProfile;
  setPartyProfile: (val: PartyProfile) => void;
  budgetTier: BudgetTier;
  setBudgetTier: (val: BudgetTier) => void;
  tripDuration: TripDuration;
  setTripDuration: (val: TripDuration) => void;
  walkingIntensity: string;
  setWalkingIntensity: (val: string) => void;
  suitabilities: string[];
  setSuitabilities: (val: string[] | ((prev: string[]) => string[])) => void;
  interests: string[];
  setInterests: (val: string[] | ((prev: string[]) => string[])) => void;
  onReset: () => void;
}

export default function DestinationFilters({
  searchQuery,
  setSearchQuery,
  selectedRegions,
  setSelectedRegions,
  selectedPrefectures,
  setSelectedPrefectures,
  selectedCollections,
  setSelectedCollections,
  sortBy,
  setSortBy,
  carMode,
  setCarMode,
  publicModes,
  setPublicModes,
  partySize,
  setPartySize,
  partyProfile,
  setPartyProfile,
  budgetTier,
  setBudgetTier,
  tripDuration,
  setTripDuration,
  walkingIntensity,
  setWalkingIntensity,
  suitabilities,
  setSuitabilities,
  interests,
  setInterests,
  onReset,
}: DestinationFiltersProps) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [regionPopoverOpen, setRegionPopoverOpen] = useState(false);
  const [collectionPopoverOpen, setCollectionPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const collectionPopoverRef = useRef<HTMLDivElement>(null);

  const availableCollections = getCollections();

  const carOwnership = user?.user_metadata?.preferences?.carOwnership || "all";
  const showRental = carOwnership === "all" || carOwnership === "rental";
  const showMyCar = carOwnership === "all" || carOwnership === "my_car";

  useEffect(() => {
    if (!showRental && carMode === "rental") {
      setCarMode("none");
    } else if (!showMyCar && carMode === "my_car") {
      setCarMode("none");
    }
  }, [showRental, showMyCar, carMode, setCarMode]);

  // Click outside listener for Region/Prefecture Popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setRegionPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Region Toggle Handler
  const toggleRegion = (regionName: string) => {
    const prefsInRegion = REGION_PREFECTURES_MAP[regionName] || [];
    const isRegionSelected = selectedRegions.includes(regionName);

    if (isRegionSelected) {
      setSelectedRegions((prev) => prev.filter((r) => r !== regionName));
      setSelectedPrefectures((prev) =>
        prev.filter((p) => !prefsInRegion.includes(p)),
      );
    } else {
      setSelectedRegions((prev) => [...prev, regionName]);
      setSelectedPrefectures((prev) =>
        Array.from(new Set([...prev, ...prefsInRegion])),
      );
    }
  };

  // Prefecture Toggle Handler
  const togglePrefecture = (regionName: string, prefName: string) => {
    const prefsInRegion = REGION_PREFECTURES_MAP[regionName] || [];
    const isPrefSelected = selectedPrefectures.includes(prefName);

    let nextPrefs: string[];
    if (isPrefSelected) {
      nextPrefs = selectedPrefectures.filter((p) => p !== prefName);
    } else {
      nextPrefs = [...selectedPrefectures, prefName];
    }
    setSelectedPrefectures(nextPrefs);

    // Sync Region state
    const allSelected = prefsInRegion.every((p) => nextPrefs.includes(p));
    if (allSelected) {
      if (!selectedRegions.includes(regionName)) {
        setSelectedRegions((prev) => [...prev, regionName]);
      }
    } else {
      if (selectedRegions.includes(regionName)) {
        setSelectedRegions((prev) => prev.filter((r) => r !== regionName));
      }
    }
  };

  // Active Advanced Filters Count
  const activeAdvancedCount =
    (carMode !== "none" ? 1 : 0) +
    (publicModes.length < 4 ? 1 : 0) +
    (budgetTier !== "standard" ? 1 : 0) +
    (walkingIntensity !== "all" ? 1 : 0) +
    (partySize !== 2 ? 1 : 0) +
    suitabilities.length +
    interests.length;

  const totalSelectedGeoCount =
    selectedRegions.length + selectedPrefectures.length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-6 transition-all duration-200">
      {/* Primary Toolbar Row (Compact) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {/* Search Field */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Search destination, keyword..."
            className="pl-10 pr-8 h-10 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500 rounded-xl text-sm font-medium"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Region & Prefecture Multi-Select Dropdown Popover */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setRegionPopoverOpen(!regionPopoverOpen)}
            className={`h-10 px-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-2 min-w-[200px] transition-colors ${
              totalSelectedGeoCount > 0
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
            }`}
          >
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
              {totalSelectedGeoCount === 0
                ? "All Regions & Prefectures"
                : `${selectedPrefectures.length} Prefecture${selectedPrefectures.length === 1 ? "" : "s"} selected`}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Region / Prefecture Popover Content */}
          {regionPopoverOpen && (
            <div className="absolute left-0 mt-2 w-80 md:w-96 max-h-96 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Filter by Region / Prefecture
                </span>
                {totalSelectedGeoCount > 0 && (
                  <button
                    onClick={() => {
                      setSelectedRegions([]);
                      setSelectedPrefectures([]);
                    }}
                    className="text-xs font-semibold text-rose-500 hover:underline"
                  >
                    Clear Selected
                  </button>
                )}
              </div>

              {Object.entries(REGION_PREFECTURES_MAP).map(
                ([region, prefectures]) => {
                  const isRegionChecked = selectedRegions.includes(region);
                  return (
                    <div key={region} className="space-y-1.5">
                      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded-lg">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={isRegionChecked}
                            onChange={() => toggleRegion(region)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                          />
                          {region} Region
                        </label>
                        <span className="text-[10px] text-slate-400 font-medium">
                          ({prefectures.length} Prefs)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1 pl-4 pt-1">
                        {prefectures.map((pref) => {
                          const isPrefChecked =
                            selectedPrefectures.includes(pref);
                          return (
                            <label
                              key={pref}
                              className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-0.5"
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
                                {pref}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>

        {/* Curated Collections Multi-Select Dropdown Popover */}
        <div className="relative" ref={collectionPopoverRef}>
          <button
            type="button"
            onClick={() => setCollectionPopoverOpen(!collectionPopoverOpen)}
            className={`h-10 px-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-2 min-w-[180px] transition-colors ${
              selectedCollections.length > 0
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
            }`}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Layers className="w-4 h-4 text-emerald-500 shrink-0" />
              {selectedCollections.length === 0
                ? "All Collections"
                : `${selectedCollections.length} Collection${selectedCollections.length === 1 ? "" : "s"}`}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Collection Popover Content */}
          {collectionPopoverOpen && (
            <div className="absolute left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Filter by Collection (OR)
                </span>
                {selectedCollections.length > 0 && (
                  <button
                    onClick={() => setSelectedCollections([])}
                    className="text-xs font-semibold text-rose-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {availableCollections.map((col) => {
                  const isChecked = selectedCollections.includes(col.id);
                  return (
                    <label
                      key={col.id}
                      className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 p-1.5 rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedCollections((prev) =>
                            prev.includes(col.id)
                              ? prev.filter((id) => id !== col.id)
                              : [...prev, col.id],
                          );
                        }}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span
                        className={
                          isChecked
                            ? "font-bold text-emerald-600 dark:text-emerald-400"
                            : ""
                        }
                      >
                        {col.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sort By Dropdown */}
        <div className="w-full lg:w-48">
          <Select
            value={sortBy}
            onValueChange={(val: string | null) => {
              if (val) setSortBy(val);
            }}
          >
            <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-colors rounded-xl font-medium text-xs">
              {sortBy === "recommended" && (
                <div className="flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-2 text-emerald-500" />{" "}
                  Recommended
                </div>
              )}
              {sortBy === "overall" && (
                <div className="flex items-center">
                  <Star className="w-3.5 h-3.5 mr-2 text-amber-500" /> Highest
                  Rated
                </div>
              )}
              {sortBy === "travelTime" && (
                <div className="flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-2 text-blue-500" /> Fastest
                  Travel
                </div>
              )}
              {sortBy === "budget" && (
                <div className="flex items-center">
                  <Coins className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Lowest
                  Budget
                </div>
              )}
              {sortBy === "walking" && (
                <div className="flex items-center">
                  <Footprints className="w-3.5 h-3.5 mr-2 text-slate-500" />{" "}
                  Least Walking
                </div>
              )}
              {sortBy === "couple" && (
                <div className="flex items-center">
                  <Heart className="w-3.5 h-3.5 mr-2 text-rose-500" /> Best for
                  Couples
                </div>
              )}
              {sortBy === "summer" && (
                <div className="flex items-center">
                  <ThermometerSun className="w-3.5 h-3.5 mr-2 text-orange-500" />{" "}
                  Best for Summer
                </div>
              )}
              {sortBy === "winter" && (
                <div className="flex items-center">
                  <Snowflake className="w-3.5 h-3.5 mr-2 text-cyan-500" /> Best
                  for Winter
                </div>
              )}
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
              <SelectItem
                value="recommended"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-2 text-emerald-500" />{" "}
                  Recommended
                </div>
              </SelectItem>
              <SelectItem
                value="overall"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Star className="w-3.5 h-3.5 mr-2 text-amber-500" /> Highest
                  Rated
                </div>
              </SelectItem>
              <SelectItem
                value="travelTime"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-2 text-blue-500" /> Fastest
                  Travel
                </div>
              </SelectItem>
              <SelectItem
                value="budget"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Coins className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Lowest
                  Budget
                </div>
              </SelectItem>
              <SelectItem
                value="walking"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Footprints className="w-3.5 h-3.5 mr-2 text-slate-500" />{" "}
                  Least Walking
                </div>
              </SelectItem>
              <SelectItem
                value="couple"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Heart className="w-3.5 h-3.5 mr-2 text-rose-500" /> Best for
                  Couples
                </div>
              </SelectItem>
              <SelectItem
                value="summer"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <ThermometerSun className="w-3.5 h-3.5 mr-2 text-orange-500" />{" "}
                  Best for Summer
                </div>
              </SelectItem>
              <SelectItem
                value="winter"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center">
                  <Snowflake className="w-3.5 h-3.5 mr-2 text-cyan-500" /> Best
                  for Winter
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* More Filters Toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`h-10 px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            expanded || activeAdvancedCount > 0
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
          }`}
        >
          <Filter className="w-3.5 h-3.5 text-emerald-500" />
          <span>Filters</span>
          {activeAdvancedCount > 0 && (
            <span className="bg-emerald-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
              {activeAdvancedCount}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Quick Reset */}
        <button
          type="button"
          onClick={onReset}
          className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1.5 shrink-0"
          title="Reset all active filters"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          Reset
        </button>
      </div>

      {/* Collapsible Advanced Filters Drawer */}
      {expanded && (
        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Transport Options */}
            <div className="space-y-2 lg:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Transport Mode
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-1.5 flex-1">
                  <button
                    onClick={() => setCarMode("none")}
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold transition-colors ${
                      carMode === "none"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                    }`}
                  >
                    No Car
                  </button>
                  {showRental && (
                    <button
                      onClick={() => setCarMode("rental")}
                      className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold transition-colors ${
                        carMode === "rental"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                      }`}
                    >
                      Rental
                    </button>
                  )}
                  {showMyCar && (
                    <button
                      onClick={() => setCarMode("my_car")}
                      className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold transition-colors ${
                        carMode === "my_car"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                      }`}
                    >
                      My Car
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 flex-1">
                  <button
                    onClick={() =>
                      setPublicModes(
                        publicModes.includes("train")
                          ? publicModes.filter((m) => m !== "train")
                          : [...publicModes, "train"],
                      )
                    }
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                      publicModes.includes("train")
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Train className="w-3 h-3" /> Train
                  </button>
                  <button
                    onClick={() =>
                      setPublicModes(
                        publicModes.includes("shinkansen")
                          ? publicModes.filter((m) => m !== "shinkansen")
                          : [...publicModes, "shinkansen"],
                      )
                    }
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                      publicModes.includes("shinkansen")
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <TrainFront className="w-3 h-3" /> Shinkansen
                  </button>
                  <button
                    onClick={() =>
                      setPublicModes(
                        publicModes.includes("bus")
                          ? publicModes.filter((m) => m !== "bus")
                          : [...publicModes, "bus"],
                      )
                    }
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                      publicModes.includes("bus")
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Bus className="w-3 h-3" /> Bus
                  </button>
                  <button
                    onClick={() =>
                      setPublicModes(
                        publicModes.includes("flight")
                          ? publicModes.filter((m) => m !== "flight")
                          : [...publicModes, "flight"],
                      )
                    }
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                      publicModes.includes("flight")
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Plane className="w-3 h-3" /> Flight
                  </button>
                </div>
              </div>
            </div>

            {/* Party, dining style, and duration */}
            <div className="space-y-2 lg:col-span-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Party profile
              </label>
              <Select
                value={partyProfile}
                onValueChange={(val: string | null) => {
                  if (val) {
                    const profile = val as PartyProfile;
                    setPartyProfile(profile);
                    setPartySize(
                      profile === "solo" ? 1 : profile === "group" ? 4 : 2,
                    );
                  }
                }}
              >
                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium">
                  {partyProfile === "solo" && "Solo"}
                  {partyProfile === "couple" && "Couple"}
                  {partyProfile === "group" && "Group · 4"}
                </SelectTrigger>
                <SelectContent className="rounded-lg border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                  <SelectItem value="solo">Solo</SelectItem>
                  <SelectItem value="couple">Couple</SelectItem>
                  <SelectItem value="group">Group · 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Budget
              </label>
              <Select
                value={budgetTier}
                onValueChange={(val) => val && setBudgetTier(val as BudgetTier)}
              >
                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium">
                  {budgetTier[0].toUpperCase() + budgetTier.slice(1)}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="luxury">Luxury</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Trip duration
              </label>
              <Select
                value={tripDuration}
                onValueChange={(val) =>
                  val && setTripDuration(val as TripDuration)
                }
              >
                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium">
                  {tripDuration === "any"
                    ? "Any duration"
                    : tripDuration === "halfDay"
                      ? "Half day"
                      : tripDuration === "dayTrip"
                        ? "Day trip"
                        : "Weekend"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any duration</SelectItem>
                  <SelectItem value="halfDay">Half day</SelectItem>
                  <SelectItem value="dayTrip">Day trip</SelectItem>
                  <SelectItem value="weekend">Weekend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Walking Intensity
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "all", label: "Any" },
                  { id: "low", label: "🟢 Low" },
                  { id: "medium", label: "🟡 Moderate" },
                  { id: "high", label: "🔴 High" },
                ].map((item) => {
                  const isSelected = walkingIntensity === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setWalkingIntensity(item.id)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Suitability & Interests Checkboxes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Suitability
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "solo", label: "Solo Friendly" },
                  { id: "couple", label: "Couple Friendly" },
                  { id: "family", label: "Family Friendly" },
                  { id: "accessible", label: "Accessible" },
                ].map((s) => {
                  const active = suitabilities.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSuitabilities((prev) =>
                          prev.includes(s.id)
                            ? prev.filter((x) => x !== s.id)
                            : [...prev, s.id],
                        )
                      }
                      className={`py-1 px-2.5 rounded-lg border text-xs font-medium transition-all ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-bold"
                          : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {active ? "✓ " : ""}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Interests
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "nature", label: "Nature" },
                  { id: "history", label: "History" },
                  { id: "food", label: "Food" },
                  { id: "hiking", label: "Hiking" },
                  { id: "photography", label: "Photography" },
                ].map((interest) => {
                  const active = interests.includes(interest.id);
                  return (
                    <button
                      key={interest.id}
                      type="button"
                      onClick={() =>
                        setInterests((prev) =>
                          prev.includes(interest.id)
                            ? prev.filter((x) => x !== interest.id)
                            : [...prev, interest.id],
                        )
                      }
                      className={`py-1 px-2.5 rounded-lg border text-xs font-medium transition-all ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-bold"
                          : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {active ? "✓ " : ""}
                      {interest.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
