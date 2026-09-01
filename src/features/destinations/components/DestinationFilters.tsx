import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/shared/hooks/useAuth";
import { useLocale } from "@/shared/context/LocaleContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/components/ui/select";
import {
  Search,
  Footprints,
  Coins,
  Filter,
  X,
  Compass,
  Layers,
  ChevronDown,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Palette,
  CloudSun,
  Route,
  CalendarDays,
  Train,
  TrainFront,
  Plane,
  Car,
  Bus,
  Utensils,
  Trees,
  Landmark,
  Waves,
  Snowflake,
  Camera,
  CloudRain,
  Sun,
  Flower2,
  Leaf,
  PiggyBank,
  Wallet,
  Armchair,
  Mountain,
  CircleDollarSign,
  Ticket,
  MapPin,
  Sparkles,
} from "lucide-react";

import { getCollections } from "@/shared/data/collections";
import { getCollectionContent } from "@/shared/utils/collections";
import type { BudgetFilter } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/types/tripDuration";
import { isOvernightDuration } from "@/shared/types/tripDuration";
import { formatTravelDateShort } from "@/shared/utils/recommendationLabels";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";
import WhereLocationPicker from "./WhereLocationPicker";
import TravelDatePicker from "@/shared/components/travel/TravelDatePicker";
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
  selectedCities: string[];
  setSelectedCities: (val: string[]) => void;
  selectedAreas: string[];
  setSelectedAreas: (val: string[]) => void;
  indoorMin: number;
  setIndoorMin: (val: number) => void;
  season: string;
  setSeason: (val: string) => void;
  /** YYYY-MM-DD or "" (unset = any date browsing). */
  date: string;
  setDate: (val: string) => void;
  sortBy: string;
  setSortBy: (val: string) => void;
  sortLoading?: boolean;
  carMode: string;
  setCarMode: (val: string) => void;
  publicModes: string[];
  setPublicModes: (val: string[]) => void;
  partySize: number;
  setPartySize: (val: number) => void;
  weather: "any" | "rainy" | "hot" | "cold";
  setWeather: (val: "any" | "rainy" | "hot" | "cold") => void;
  budgetTier: BudgetFilter;
  setBudgetTier: (val: BudgetFilter) => void;
  vibe: string;
  setVibe: (val: string) => void;
  tripDuration: TripDuration;
  setTripDuration: (val: TripDuration) => void;
  walkingIntensity: string;
  setWalkingIntensity: (val: string) => void;
  suitabilities: string[];
  setSuitabilities: (val: string[] | ((prev: string[]) => string[])) => void;
  interests: string[];
  setInterests: (val: string[] | ((prev: string[]) => string[])) => void;
  viewMode: "grid" | "map";
  setViewMode: (val: "grid" | "map") => void;
  forecastMap?: ReadonlyMap<string, DayForecastData>;
  originLabel?: string;
  totalResultsCount?: number;
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
  selectedCities: _selectedCities,
  setSelectedCities: _setSelectedCities,
  selectedAreas: _selectedAreas,
  setSelectedAreas: _setSelectedAreas,
  indoorMin,
  setIndoorMin,
  season,
  setSeason,
  date,
  setDate,
  sortBy,
  setSortBy,
  carMode,
  setCarMode,
  publicModes,
  setPublicModes,
  partySize,
  setPartySize,
  weather,
  setWeather,
  budgetTier,
  setBudgetTier,
  vibe,
  setVibe,
  tripDuration,
  setTripDuration,
  walkingIntensity,
  setWalkingIntensity,
  suitabilities,
  setSuitabilities,
  interests: _interests,
  setInterests: _setInterests,
  viewMode: _viewMode,
  setViewMode: _setViewMode,
  forecastMap,
  originLabel,
  totalResultsCount = 0,
  sortLoading = false,
  onReset,
}: DestinationFiltersProps) {
  const { user } = useAuth();
  const { locale } = useLocale();
  const { t } = useTranslation();
  const isJa = locale === "ja";

  const [modalOpen, setModalOpen] = useState(false);
  const [collectionPopoverOpen, setCollectionPopoverOpen] = useState(false);
  const collectionPopoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Click outside listener for Collection Popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        collectionPopoverRef.current &&
        !collectionPopoverRef.current.contains(event.target as Node)
      ) {
        setCollectionPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedTransportModes = [
    ...(carMode === "my_car" || carMode === "rental" ? ["car"] : []),
    ...(publicModes.includes("train") ? ["local"] : []),
    ...(publicModes.includes("shinkansen") ? ["express"] : []),
    ...(publicModes.includes("bus") ? ["bus"] : []),
    ...(publicModes.includes("flight") ? ["flight"] : []),
  ];

  const handleGettingAroundChange = (val: string | null) => {
    if (!val) return;
    if (
      val === "local" ||
      val === "express" ||
      val === "bus" ||
      val === "flight"
    ) {
      const mode =
        val === "local"
          ? "train"
          : val === "express"
            ? "shinkansen"
            : val === "bus"
              ? "bus"
              : "flight";
      setPublicModes(
        publicModes.includes(mode)
          ? publicModes.filter((item) => item !== mode)
          : [...publicModes, mode],
      );
    } else if (val === "car") {
      if (carMode !== "none") {
        setCarMode("none");
      } else {
        // One visible Car chip; the underlying mode follows the user's
        // car-ownership preference: rental (rental-fee budget) when the
        // profile says rental, otherwise personal my_car (tolls/fuel
        // budget only). "all"/unknown deliberately falls back to my_car —
        // the cheaper, no-rental-fee model (KAI-63 D11).
        setCarMode(carOwnership === "rental" ? "rental" : "my_car");
      }
    } else if (val === "either") {
      setCarMode("none");
      setPublicModes([]);
    }
  };

  // Build active chips for non-default selections only (Bilingual)
  const activeChips: { id: string; label: string; onRemove: () => void }[] = [];

  if (searchQuery) {
    activeChips.push({
      id: "search",
      label: isJa ? `検索: "${searchQuery}"` : `Search: "${searchQuery}"`,
      onRemove: () => setSearchQuery(""),
    });
  }
  selectedRegions.forEach((r) =>
    activeChips.push({
      id: `region-${r}`,
      label: isJa ? `${r}地方` : `${r} Region`,
      onRemove: () => setSelectedRegions((prev) => prev.filter((x) => x !== r)),
    }),
  );
  selectedPrefectures.forEach((p) =>
    activeChips.push({
      id: `pref-${p}`,
      label: p,
      onRemove: () =>
        setSelectedPrefectures((prev) => prev.filter((x) => x !== p)),
    }),
  );
  selectedCollections.forEach((c) => {
    const colObj = availableCollections.find((x) => x.id === c);
    activeChips.push({
      id: `col-${c}`,
      label: colObj ? getCollectionContent(colObj, isJa ? "ja" : "en").name : c,
      onRemove: () =>
        setSelectedCollections((prev) => prev.filter((x) => x !== c)),
    });
  });
  const transportLabels: Record<string, string> = {
    local: isJa ? "在来線" : "Local trains",
    express: isJa ? "特急・新幹線" : "Express trains & Shinkansen",
    bus: isJa ? "バス" : "Bus",
    flight: isJa ? "国内線" : "Domestic flights",
    car: t("home.transportModes.car"),
  };
  selectedTransportModes.forEach((mode) => {
    activeChips.push({
      id: `transport-${mode}`,
      label: transportLabels[mode],
      onRemove: () => handleGettingAroundChange(mode),
    });
  });
  if (budgetTier !== "any") {
    const budgetMap: Record<BudgetFilter, string> = {
      any: isJa ? "指定なし" : "Any",
      economy: isJa ? "エコノミー" : "Economy",
      standard: isJa ? "スタンダード" : "Standard",
      comfortable: isJa ? "コンフォート" : "Comfort",
      luxury: isJa ? "贅沢" : "Flexible",
    };
    activeChips.push({
      id: "budget",
      label: budgetMap[budgetTier] || budgetTier,
      onRemove: () => setBudgetTier("any"),
    });
  }
  if (partySize !== 2) {
    activeChips.push({
      id: "party",
      label: isJa ? `${partySize}名` : `${partySize} people`,
      onRemove: () => setPartySize(2),
    });
  }
  if (tripDuration !== "any") {
    activeChips.push({
      id: "duration",
      label:
        tripDuration === "shortOuting" ||
        tripDuration === "halfDay" ||
        tripDuration === "fullDay"
          ? t(`destination.durationOptions.${tripDuration}`)
          : tripDuration,
      onRemove: () => setTripDuration("any"),
    });
  }
  if (vibe !== "any") {
    const vibeMap: Record<string, string> = {
      art: isJa ? "アート・美術館" : "Art & museums",
      food: isJa ? "グルメ・食" : "Food",
      nature: isJa ? "自然・絶景" : "Nature",
      history: isJa ? "歴史・文化" : "History",
      sea: isJa ? "ビーチ・島" : "Beaches & islands",
      cool: isJa ? "涼しい場所" : "Cool escapes",
      photography: isJa ? "写真映え" : "Photography",
      themeParks: isJa ? "テーマパーク" : "Theme parks",
    };
    activeChips.push({
      id: "vibe",
      label: vibeMap[vibe] || vibe,
      onRemove: () => setVibe("any"),
    });
  }
  if (indoorMin > 0) {
    const indoorMap: Record<number, string> = {
      30: isJa ? "屋外中心" : "Mostly outdoors",
      50: isJa ? "バランス" : "Balanced",
      70: isJa ? "屋内中心" : "Mostly indoors",
      90: isJa ? "屋内のみ" : "Indoors only",
    };
    activeChips.push({
      id: "indoor",
      label:
        indoorMap[indoorMin] || (isJa ? "屋内の好み" : "Indoor preference"),
      onRemove: () => setIndoorMin(0),
    });
  }
  if (weather !== "any") {
    const weatherMap: Record<string, string> = {
      rainy: isJa ? "雨の日におすすめ" : "Rain-friendly",
      hot: isJa ? "暑い日に快適" : "Heat-friendly",
      cold: isJa ? "寒い日におすすめ" : "Cold-friendly",
    };
    activeChips.push({
      id: "weather",
      label: weatherMap[weather] || weather,
      onRemove: () => setWeather("any"),
    });
  }
  if (walkingIntensity !== "all") {
    const walkingMap: Record<string, string> = {
      low: isJa ? "歩きやすい" : "Easy walking",
      medium: isJa ? "普通" : "Moderate walking",
      high: isJa ? "歩行量多め" : "Challenging walking",
    };
    activeChips.push({
      id: "walking",
      label: walkingMap[walkingIntensity] || walkingIntensity,
      onRemove: () => setWalkingIntensity("all"),
    });
  }
  suitabilities.forEach((s) => {
    const labelMap: Record<string, string> = {
      family: isJa ? "ファミリー向け" : "Family-friendly",
      accessible: isJa ? "バリアフリー段差なし" : "Step-free access",
    };
    activeChips.push({
      id: `suit-${s}`,
      label: labelMap[s] || s,
      onRemove: () => setSuitabilities((prev) => prev.filter((x) => x !== s)),
    });
  });
  if (season !== "any") {
    const seasonMap: Record<string, string> = {
      spring: isJa ? "春" : "Spring",
      summer: isJa ? "夏" : "Summer",
      autumn: isJa ? "秋" : "Autumn",
      winter: isJa ? "冬" : "Winter",
    };
    activeChips.push({
      id: "season",
      label: seasonMap[season] || season,
      onRemove: () => setSeason("any"),
    });
  }
  if (date) {
    activeChips.push({
      id: "date",
      label: formatTravelDateShort(date, isJa ? "ja" : "en"),
      onRemove: () => setDate(""),
    });
  }

  const activeAdvancedCount = activeChips.length;
  const hasActiveFilters = activeChips.length > 0;
  const preferenceSummaries = {
    vibe:
      vibe === "any"
        ? isJa
          ? "指定なし"
          : "No preference"
        : {
            art: isJa ? "アート・美術館" : "Art & museums",
            food: isJa ? "グルメ・食" : "Food",
            nature: isJa ? "自然・絶景" : "Nature",
            history: isJa ? "歴史・文化" : "History",
            sea: isJa ? "ビーチ・島" : "Beaches & islands",
            cool: isJa ? "涼しい場所" : "Cool escapes",
            photography: isJa ? "写真映え" : "Photography",
            themeParks: isJa ? "テーマパーク" : "Theme parks",
          }[vibe] || vibe,
    weather:
      weather === "any"
        ? isJa
          ? "指定なし"
          : "No preference"
        : {
            rainy: isJa ? "雨の日におすすめ" : "Rain-friendly",
            hot: isJa ? "暑い日に快適" : "Heat-friendly",
            cold: isJa ? "寒い日におすすめ" : "Cold-friendly",
          }[weather],
    walking:
      walkingIntensity === "all"
        ? isJa
          ? "指定なし"
          : "No preference"
        : {
            low: isJa ? "歩きやすい" : "Easy walking",
            medium: isJa ? "普通" : "Moderate",
            high: isJa ? "歩行量多め" : "Challenging",
          }[walkingIntensity] || walkingIntensity,
    season:
      season === "any"
        ? isJa
          ? "指定なし"
          : "No preference"
        : {
            spring: isJa ? "春" : "Spring",
            summer: isJa ? "夏" : "Summer",
            autumn: isJa ? "秋" : "Autumn",
            winter: isJa ? "冬" : "Winter",
          }[season] || season,
  };

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-3.5 pb-2.5 pt-3.5 shadow-sm transition-all duration-200 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-card))] sm:p-4">
      {/* 1-Row Primary Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        {/* Search Input Bar */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            ref={searchInputRef}
            type="search"
            aria-label={t("search.label")}
            placeholder={
              isJa
                ? "目的地、キーワードで検索..."
                : "Search destination, keyword..."
            }
            className="no-native-search-cancel pl-10 pr-8 h-9 bg-slate-50 dark:bg-[hsl(var(--surface-overlay))] border-slate-200 dark:border-[hsl(var(--border-subtle))] focus-visible:ring-emerald-500 rounded-xl text-base md:text-base lg:text-xs font-medium"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
          />
          {searchQuery && (
            <button
              type="button"
              aria-label={t("search.clear")}
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1.5 p-1.5 text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
          {/* 1. All Regions & Prefectures Dropdown */}
          <WhereLocationPicker
            selectedRegions={selectedRegions}
            setSelectedRegions={setSelectedRegions}
            selectedPrefectures={selectedPrefectures}
            setSelectedPrefectures={setSelectedPrefectures}
          />

          {/* 2. All Collections Dropdown */}
          <div
            className="relative order-3 min-w-0 sm:order-none"
            ref={collectionPopoverRef}
          >
            <button
              type="button"
              onClick={() => setCollectionPopoverOpen(!collectionPopoverOpen)}
              className={`flex h-9 w-full items-center justify-between gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all sm:w-auto ${
                selectedCollections.length > 0
                  ? "border-emerald-700 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50 font-bold"
                  : "border-slate-200 dark:border-[hsl(var(--border-subtle))] bg-slate-50 dark:bg-[hsl(var(--surface-overlay))] text-slate-700 dark:text-slate-300 hover:border-emerald-700"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="whitespace-nowrap">
                  {selectedCollections.length === 0
                    ? isJa
                      ? "コレクション"
                      : "All Collections"
                    : `${selectedCollections.length} ${isJa ? "件" : "Collection"}${selectedCollections.length === 1 || isJa ? "" : "s"}`}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>

            {collectionPopoverOpen && (
              <div className="absolute left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-white dark:bg-[hsl(var(--surface-overlay))] border border-slate-200 dark:border-[hsl(var(--border-subtle))] rounded-2xl shadow-xl z-50 p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[hsl(var(--border-subtle))]">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    {isJa ? "厳選コレクション" : "Curated Collections"}
                  </span>
                  {selectedCollections.length > 0 && (
                    <button
                      onClick={() => setSelectedCollections([])}
                      className="text-[11px] font-semibold text-rose-500 hover:underline"
                    >
                      {isJa ? "クリア" : "Clear"}
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {availableCollections.map((col) => {
                    const isChecked = selectedCollections.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-raised))] p-1.5 rounded-lg transition-colors"
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
                          className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 w-3.5 h-3.5"
                        />
                        <span
                          className={
                            isChecked
                              ? "font-bold text-emerald-700 dark:text-emerald-300"
                              : ""
                          }
                        >
                          {getCollectionContent(col, isJa ? "ja" : "en").name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3. Date filter: shared TravelDatePicker. */}
          <div className="order-2 min-w-0 sm:order-none">
            <TravelDatePicker
              value={date || undefined}
              onChange={(newDate) => {
                setDate(newDate || "");
              }}
              duration={tripDuration}
              forecastMap={forecastMap}
              originLabel={originLabel}
              allowAnyDate={true}
            />
          </div>

          {/* 4. Recommended / Sort Dropdown */}
          <Select
            value={sortBy}
            onValueChange={(val: string | null) => {
              if (val) setSortBy(val);
            }}
          >
            <SelectTrigger
              aria-label={isJa ? "並び替え" : "Sort by"}
              aria-busy={sortLoading}
              data-sort-loading={sortLoading || undefined}
              className="order-4 h-9 w-full rounded-xl border-slate-200 bg-slate-50 text-xs font-medium transition-colors hover:border-emerald-700 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))] sm:order-none sm:w-36"
            >
              {sortBy === "recommended" && (
                <div className="flex items-center whitespace-nowrap">
                  <Compass className="w-3.5 h-3.5 mr-1.5 text-emerald-500 shrink-0" />{" "}
                  {isJa ? "おすすめ順" : "Recommended"}
                </div>
              )}
              {sortBy === "walking" && (
                <div className="flex items-center whitespace-nowrap">
                  <Footprints className="w-3.5 h-3.5 mr-1.5 text-slate-500 shrink-0" />{" "}
                  {isJa ? "歩行量が少ない順" : "Least Walk"}
                </div>
              )}
              {sortBy === "nearest" && (
                <div className="flex items-center whitespace-nowrap">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-emerald-500 shrink-0" />{" "}
                  {isJa ? "近い順" : "Nearest"}
                </div>
              )}
              {sortBy === "budget" && (
                <div className="flex items-center whitespace-nowrap">
                  <Coins className="w-3.5 h-3.5 mr-1.5 text-emerald-500 shrink-0" />{" "}
                  {isJa ? "費用が安い順" : "Lowest cost"}
                </div>
              )}
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-[hsl(var(--border-subtle))] shadow-xl bg-white dark:bg-[hsl(var(--surface-overlay))] p-1">
              <SelectItem
                value="recommended"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center whitespace-nowrap">
                  <Compass className="w-3.5 h-3.5 mr-2 text-emerald-500" />{" "}
                  {isJa ? "おすすめ順" : "Recommended"}
                </div>
              </SelectItem>
              <SelectItem
                value="walking"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center whitespace-nowrap">
                  <Footprints className="w-3.5 h-3.5 mr-2 text-slate-500" />{" "}
                  {isJa ? "歩行量が少ない順" : "Least Walking"}
                </div>
              </SelectItem>
              <SelectItem
                value="nearest"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center whitespace-nowrap">
                  <MapPin className="w-3.5 h-3.5 mr-2 text-emerald-500" />{" "}
                  {isJa ? "近い順" : "Nearest"}
                </div>
              </SelectItem>
              <SelectItem
                value="budget"
                className="py-2 px-3 text-xs cursor-pointer"
              >
                <div className="flex items-center whitespace-nowrap">
                  <Coins className="w-3.5 h-3.5 mr-2 text-emerald-500" />{" "}
                  {isJa ? "費用が安い順" : "Lowest cost"}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          {sortLoading && (
            <span
              role="status"
              className="text-[11px] font-semibold text-slate-500 dark:text-slate-300"
            >
              {isJa ? "並び替えを準備中…" : "Preparing sort…"}
            </span>
          )}

          {/* 4. Filters Trigger Button */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={`order-2 flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition-all sm:order-none ${
              activeAdvancedCount > 0
                ? "border-emerald-700 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50 shadow-sm"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))] dark:text-slate-300 hover:border-emerald-700"
            }`}
          >
            <Filter
              className={`w-3.5 h-3.5 ${
                activeAdvancedCount > 0
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-slate-500 dark:text-slate-300"
              }`}
            />
            <span>{isJa ? "フィルター" : "Filters"}</span>
            {activeAdvancedCount > 0 && (
              <span className="bg-emerald-700 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                {activeAdvancedCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 ${
                activeAdvancedCount > 0
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-slate-500 dark:text-slate-300"
              }`}
            />
          </button>

          {/* 5. Reset Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="hidden h-9 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-[hsl(var(--border-subtle))] dark:text-slate-300 sm:flex"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isJa ? "リセット" : "Reset"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Applied Active-Filter Chips Row (Below Primary Toolbar) */}
      {activeChips.length > 0 && (
        <div className="flex items-center justify-end pt-1 sm:mt-3 sm:flex-wrap sm:justify-start sm:gap-1.5 sm:border-t sm:border-slate-100 sm:pt-3 dark:sm:border-slate-800">
          <span className="mr-1 hidden text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:inline">
            {isJa ? "適用中:" : "Applied:"}
          </span>
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="hidden max-w-full items-center gap-1.5 whitespace-normal break-words rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-2xs dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 sm:inline-flex"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="p-0.5 hover:bg-emerald-200/60 dark:hover:bg-emerald-800/60 rounded-full transition-colors shrink-0"
                title={isJa ? `解除: ${chip.label}` : `Remove ${chip.label}`}
              >
                <X className="w-3 h-3 text-emerald-700 dark:text-emerald-300" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 underline ml-1"
          >
            {isJa ? "すべてクリア" : "Clear all"}
          </button>
        </div>
      )}

      {/* Mobile-Friendly & Desktop-Wide "Trip preferences" Bottom Sheet / Floating Modal Window */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="w-full max-w-3xl max-h-[92vh] sm:max-h-[85vh] bg-white dark:bg-[hsl(var(--surface-overlay))] border border-slate-200 dark:border-[hsl(var(--border-subtle))] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Fixed Header */}
            <div className="flex-none px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-[hsl(var(--border-subtle))] bg-white dark:bg-[hsl(var(--surface-overlay))] z-20 space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {isJa ? "こだわり・条件設定" : "Trip preferences"}
                  </h3>
                  {activeAdvancedCount > 0 && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                      {activeAdvancedCount} {isJa ? "件適用" : "active"}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[hsl(var(--surface-raised))] rounded-full transition-colors shrink-0"
                  title={isJa ? "閉じる" : "Close preferences"}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-300 leading-normal">
                {isJa
                  ? "「希望条件」でおすすめ順が変わり、「必須条件」で合わない目的地を除外します。"
                  : "Preferences improve your ranking. Requirements remove unsuitable destinations."}
              </p>
            </div>

            {/* Modal Body (Scrollable Region with 24px bottom padding) */}
            <div className="destination-filter-modal-body flex-1 min-h-0 overflow-y-auto pl-4 pr-6 sm:pl-6 sm:pr-8 py-4 space-y-5">
              {/* SECTION 1: TRIP ESSENTIALS */}
              <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50 p-4 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-card))]">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[hsl(var(--border-subtle))]">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                    <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                    <span>{isJa ? "旅行の基本設定" : "TRIP ESSENTIALS"}</span>
                  </div>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                    {isJa
                      ? "費用と利用できる選択肢を設定"
                      : "Sets costs and available options"}
                  </span>
                </div>

                <div className="flex w-full max-w-sm items-center justify-between gap-2 sm:gap-4">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isJa ? "旅行人数" : "Travel party"}
                  </label>
                  <div className="min-h-[44px] sm:h-10 w-44 sm:w-56 p-1 bg-slate-100/90 dark:bg-[hsl(var(--surface-raised))] rounded-xl flex items-center justify-between px-2.5 gap-2 border border-slate-200/50 dark:border-[hsl(var(--border-subtle))]">
                    <button
                      type="button"
                      disabled={partySize <= 1}
                      onClick={() => setPartySize(Math.max(1, partySize - 1))}
                      aria-label={isJa ? "人数を減らす" : "Decrease party size"}
                      className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-white dark:bg-[hsl(var(--surface-card))] hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-overlay))] text-slate-700 dark:text-slate-300 disabled:opacity-30 transition-colors shadow-xs shrink-0"
                    >
                      <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {isJa
                        ? `${partySize}名`
                        : `${partySize} ${partySize === 1 ? "person" : "people"}`}
                    </span>
                    <button
                      type="button"
                      disabled={partySize >= 10}
                      onClick={() => setPartySize(Math.min(10, partySize + 1))}
                      aria-label={isJa ? "人数を増やす" : "Increase party size"}
                      className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-white dark:bg-[hsl(var(--surface-card))] hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-overlay))] text-slate-700 dark:text-slate-300 disabled:opacity-30 transition-colors shadow-xs shrink-0"
                    >
                      <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Transport */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {isJa ? "移動手段" : "Transport"}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleGettingAroundChange("either")}
                      className={`h-8 px-3 rounded-lg border text-xs font-bold transition-colors ${
                        selectedTransportModes.length === 0
                          ? "border-emerald-700 bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50"
                          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-[hsl(var(--border-subtle))] dark:hover:bg-[hsl(var(--surface-raised))]"
                      }`}
                    >
                      {selectedTransportModes.length === 0
                        ? isJa
                          ? "すべての移動手段"
                          : "Any transport"
                        : isJa
                          ? `${selectedTransportModes.length}件選択 · クリア`
                          : `${selectedTransportModes.length} selected · Clear`}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      {
                        val: "local",
                        label: isJa ? "在来線" : "Local trains",
                        icon: Train,
                      },
                      {
                        val: "express",
                        label: isJa
                          ? "特急・新幹線"
                          : "Express trains & Shinkansen",
                        icon: TrainFront,
                      },
                      {
                        val: "flight",
                        label: isJa ? "国内線" : "Domestic flights",
                        icon: Plane,
                      },
                      { val: "bus", label: isJa ? "バス" : "Bus", icon: Bus },
                      {
                        val: "car",
                        label: t("home.transportModes.car"),
                        icon: Car,
                      },
                    ].map((opt) => {
                      const isSelected = selectedTransportModes.includes(
                        opt.val,
                      );
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => handleGettingAroundChange(opt.val)}
                          className={`relative min-h-[56px] px-3 py-2 rounded-xl border text-xs font-bold text-center flex flex-col gap-1 items-center justify-center transition-all leading-tight whitespace-normal break-words ${
                            isSelected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))] dark:text-slate-300"
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute right-2 top-1.5 text-emerald-700 dark:text-emerald-300">
                              ✓
                            </span>
                          )}
                          <Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Budget preference */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Coins className="w-4 h-4 text-emerald-700" />
                      {isJa ? "予算の目安" : "Budget preference"}
                    </label>
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold">
                      {t("ui.budgetTransportWhenKnown")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {[
                      {
                        val: "any",
                        label: isJa ? "指定なし" : "Any",
                        desc: isJa ? "制限なし" : "All price ranges",
                        icon: Sparkles,
                        color: "text-emerald-700",
                      },
                      {
                        val: "economy",
                        label: isJa ? "エコノミー" : "Economy",
                        desc: isJa ? "費用を抑える" : "Budget friendly",
                        icon: PiggyBank,
                        color: "text-emerald-500",
                      },
                      {
                        val: "standard",
                        label: isJa ? "スタンダード" : "Standard",
                        desc: isJa ? "バランス重視" : "Balanced spending",
                        icon: Wallet,
                        color: "text-blue-500",
                      },
                      {
                        val: "comfortable",
                        label: isJa ? "コンフォート" : "Comfort",
                        desc: isJa ? "快適さ重視" : "Higher comfort",
                        icon: Armchair,
                        color: "text-violet-500",
                      },
                      {
                        val: "luxury",
                        label: isJa ? "贅沢" : "Flexible",
                        desc: isJa ? "選択肢を広く" : "Keep options open",
                        icon: CircleDollarSign,
                        color: "text-amber-500",
                      },
                    ].map((opt) => {
                      const isSelected = budgetTier === opt.val;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setBudgetTier(opt.val as BudgetFilter)}
                          className={`min-h-[52px] px-3 py-2 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))] dark:text-slate-300"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-xs font-bold">
                            <Icon
                              className={`size-3.5 shrink-0 ${opt.color}`}
                            />
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-300">
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accessibility Requirements Multi-Select Chips */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {isJa
                        ? "バリアフリー・環境"
                        : "Accessibility & requirements"}
                    </label>
                    <span className="text-[10px] text-slate-500 dark:text-slate-300 font-semibold">
                      {isJa ? "詳細は施設に要確認" : "Confirm venue details"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        id: "family",
                        label: isJa ? "ファミリー向け" : "Family-friendly",
                      },
                      {
                        id: "accessible",
                        label: isJa
                          ? "バリアフリー段差なし"
                          : "Step-free access",
                      },
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
                          className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center gap-1 leading-snug whitespace-normal break-words ${
                            active
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50 shadow-2xs"
                              : "bg-white dark:bg-[hsl(var(--surface-overlay))] border-slate-200 dark:border-[hsl(var(--border-subtle))] text-slate-600 dark:text-slate-300 hover:border-slate-300"
                          }`}
                        >
                          {active ? "✓ " : ""}
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* SECTION 2: RANKING PREFERENCES */}
              <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-raised))]">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[hsl(var(--border-subtle))]">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                    <Compass className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{isJa ? "希望条件" : "RANKING PREFERENCES"}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-300 font-semibold">
                    {isJa ? "マッチ度順に並び替え" : "Re-ranks destinations"}
                  </span>
                </div>
                {/* Trip duration filter */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[hsl(var(--border-subtle))]">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t("destination.tripDuration")}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-300 font-semibold">
                    {isJa ? "フィルター" : "Filter"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {/* Total available time segmented track */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {t("destination.timeAvailable")}
                    </label>
                    <div className="min-h-[40px] p-1 bg-slate-100 dark:bg-[hsl(var(--surface-card))] rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-1">
                      {[
                        {
                          val: "any",
                          label: t("destination.durationOptions.any"),
                        },
                        {
                          val: "shortOuting",
                          label: t("destination.durationOptions.shortOuting"),
                        },
                        {
                          val: "halfDay",
                          label: t("destination.durationOptions.halfDay"),
                        },
                        {
                          val: "fullDay",
                          label: t("destination.durationOptions.fullDay"),
                        },
                        {
                          val: "2d1n",
                          label: t("destination.durationOptions.2d1n"),
                        },
                        {
                          val: "3d2n",
                          label: t("destination.durationOptions.3d2n"),
                        },
                      ].map((opt) => {
                        const isSelected = tripDuration === opt.val;
                        return (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() =>
                              setTripDuration(opt.val as TripDuration)
                            }
                            className={`min-h-[32px] px-1 py-1 rounded-xl text-xs font-bold text-center flex items-center justify-center transition-all leading-tight whitespace-normal break-words ${
                              isSelected
                                ? "bg-white dark:bg-[hsl(var(--surface-overlay))] text-slate-950 dark:text-white shadow-xs border border-slate-200/80 dark:border-[hsl(var(--border-subtle))] font-extrabold"
                                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Indoor Preference Segmented Track */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {isJa ? "屋内の快適性" : "Indoor preference"}
                    </label>
                    <div className="min-h-[40px] p-1 bg-slate-100 dark:bg-[hsl(var(--surface-card))] rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-1">
                      {[
                        { val: 0, label: isJa ? "指定なし" : "Any" },
                        { val: 30, label: isJa ? "屋外中心" : "Outdoors" },
                        { val: 50, label: isJa ? "バランス" : "Mixed" },
                        { val: 70, label: isJa ? "屋内中心" : "Indoors" },
                      ].map((opt) => {
                        const isSelected = indoorMin === opt.val;
                        return (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => setIndoorMin(opt.val)}
                            className={`min-h-[32px] px-2 py-1 rounded-xl text-xs font-bold text-center flex items-center justify-center transition-all leading-tight whitespace-normal break-words ${
                              isSelected
                                ? "bg-white dark:bg-[hsl(var(--surface-overlay))] text-slate-950 dark:text-white shadow-xs border border-slate-200/80 dark:border-[hsl(var(--border-subtle))] font-extrabold"
                                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Vibe / Atmosphere Multi-Select Chips */}
                <details className="group border-t border-slate-100 dark:border-[hsl(var(--border-subtle))] pt-3">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-emerald-700" />
                      {isJa ? "旅の雰囲気・テーマ" : "Vibe & atmosphere"}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      {preferenceSummaries.vibe}
                      <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {[
                      {
                        val: "any",
                        label: isJa ? "なんでも" : "Anything goes",
                        icon: Compass,
                        color: "text-slate-500",
                      },
                      {
                        val: "art",
                        label: isJa ? "アート・美術館" : "Art & museums",
                        icon: Palette,
                        color: "text-purple-500",
                      },
                      {
                        val: "food",
                        label: isJa ? "グルメ・食" : "Food",
                        icon: Utensils,
                        color: "text-orange-500",
                      },
                      {
                        val: "nature",
                        label: isJa ? "自然・アウトドア" : "Nature & outdoors",
                        icon: Trees,
                        color: "text-emerald-500",
                      },
                      {
                        val: "history",
                        label: isJa ? "歴史・文化" : "History & culture",
                        icon: Landmark,
                        color: "text-amber-700",
                      },
                      {
                        val: "sea",
                        label: isJa ? "ビーチ・島" : "Beaches & islands",
                        icon: Waves,
                        color: "text-blue-500",
                      },
                      {
                        val: "cool",
                        label: isJa ? "涼しい場所" : "Cool escapes",
                        icon: Snowflake,
                        color: "text-sky-400",
                      },
                      {
                        val: "themeParks",
                        label: isJa ? "テーマパーク" : "Theme parks",
                        icon: Ticket,
                        color: "text-pink-500",
                      },
                      {
                        val: "photography",
                        label: isJa ? "写真映え" : "Photography",
                        icon: Camera,
                        color: "text-rose-400",
                      },
                    ].map((opt) => {
                      const isSelected = vibe === opt.val;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setVibe(opt.val)}
                          className={`flex min-h-[36px] items-center gap-1.5 whitespace-normal rounded-xl border px-3 py-1.5 text-xs font-bold leading-snug transition-all ${
                            isSelected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50 shadow-2xs"
                              : "bg-white dark:bg-[hsl(var(--surface-overlay))] border-slate-200 dark:border-[hsl(var(--border-subtle))] text-slate-600 dark:text-slate-300 hover:border-slate-300"
                          }`}
                        >
                          <Icon className={`size-3.5 shrink-0 ${opt.color}`} />
                          <span>{opt.label}</span>
                          {isSelected && <span aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </details>

                {/* Weather Suitability Multi-Select Chips */}
                <details className="group border-t border-slate-100 dark:border-[hsl(var(--border-subtle))] pt-3">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <CloudSun className="w-4 h-4 text-emerald-700" />
                      {isJa ? "天候への対応力" : "Weather suitability"}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      {preferenceSummaries.weather}
                      <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {[
                      {
                        val: "rainy",
                        label: isJa ? "雨の日におすすめ" : "Rain-friendly",
                        icon: CloudRain,
                        color: "text-blue-500",
                      },
                      {
                        val: "hot",
                        label: isJa ? "暑い日に快適" : "Heat-friendly",
                        icon: Sun,
                        color: "text-amber-500",
                      },
                      {
                        val: "cold",
                        label: isJa ? "寒い日におすすめ" : "Cold-friendly",
                        icon: Snowflake,
                        color: "text-sky-400",
                      },
                    ].map((w) => {
                      const isSelected = weather === w.val;
                      const Icon = w.icon;
                      return (
                        <button
                          key={w.val}
                          type="button"
                          onClick={() => setWeather(w.val as typeof weather)}
                          className={`flex min-h-[36px] items-center gap-1.5 whitespace-normal rounded-xl border px-3 py-1.5 text-xs font-bold leading-snug transition-all ${
                            isSelected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50 shadow-2xs"
                              : "bg-white dark:bg-[hsl(var(--surface-overlay))] border-slate-200 dark:border-[hsl(var(--border-subtle))] text-slate-600 dark:text-slate-300 hover:border-slate-300"
                          }`}
                        >
                          <Icon className={`size-3.5 shrink-0 ${w.color}`} />
                          <span>{w.label}</span>
                          {isSelected && <span aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </details>

                {/* Walking Difficulty Descriptive Cards */}
                <details className="group border-t border-slate-100 dark:border-[hsl(var(--border-subtle))] pt-3">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <Route className="w-4 h-4 text-emerald-700" />
                      {isJa ? "歩行負荷の目安" : "Walking difficulty"}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      {preferenceSummaries.walking}
                      <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2">
                    {[
                      {
                        id: "low",
                        label: isJa ? "歩きやすい" : "Easy walking",
                        desc: isJa ? "平坦メイン" : "Mostly flat",
                        icon: Footprints,
                        color: "text-emerald-500",
                      },
                      {
                        id: "medium",
                        label: isJa ? "普通" : "Moderate",
                        desc: isJa ? "多少の坂・歩行" : "Slopes & walk",
                        icon: Route,
                        color: "text-amber-500",
                      },
                      {
                        id: "high",
                        label: isJa ? "歩行量多め" : "Challenging",
                        desc: isJa ? "長距離・登山" : "Long walks",
                        icon: Mountain,
                        color: "text-rose-500",
                      },
                    ].map((w) => {
                      const isSelected = walkingIntensity === w.id;
                      const Icon = w.icon;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setWalkingIntensity(w.id)}
                          className={`p-2.5 rounded-2xl border text-left transition-all min-h-[64px] flex flex-col justify-center ${
                            isSelected
                              ? "border-emerald-700 bg-emerald-50 dark:bg-emerald-500/30 dark:ring-1 dark:ring-emerald-400/50"
                              : "border-slate-200 dark:border-[hsl(var(--border-subtle))] bg-white dark:bg-[hsl(var(--surface-overlay))] hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon className={`size-3.5 shrink-0 ${w.color}`} />
                            <span
                              className={`text-xs font-bold leading-tight ${isSelected ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}
                            >
                              {w.label}
                            </span>
                            {isSelected && <span aria-hidden="true">✓</span>}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-300 mt-0.5 leading-tight">
                            {w.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </details>

                {/* Best Season Multi-Select Chips */}
                <details className="group border-y border-slate-100 dark:border-[hsl(var(--border-subtle))] py-3">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-emerald-700" />
                      {isJa ? "おすすめの季節" : "Best season"}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      {preferenceSummaries.season}
                      <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {[
                      {
                        val: "spring",
                        label: isJa ? "春" : "Spring",
                        icon: Flower2,
                        color: "text-pink-500",
                      },
                      {
                        val: "summer",
                        label: isJa ? "夏" : "Summer",
                        icon: Sun,
                        color: "text-amber-500",
                      },
                      {
                        val: "autumn",
                        label: isJa ? "秋" : "Autumn",
                        icon: Leaf,
                        color: "text-orange-500",
                      },
                      {
                        val: "winter",
                        label: isJa ? "冬" : "Winter",
                        icon: Snowflake,
                        color: "text-sky-400",
                      },
                    ].map((option) => {
                      const { val, label, icon: Icon, color } = option;
                      const isSelected = season === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSeason(val)}
                          className={`flex min-h-[36px] items-center gap-1.5 whitespace-normal rounded-xl border px-3 py-1.5 text-xs font-bold leading-snug transition-all ${
                            isSelected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-400/50 shadow-2xs"
                              : "bg-white dark:bg-[hsl(var(--surface-overlay))] border-slate-200 dark:border-[hsl(var(--border-subtle))] text-slate-600 dark:text-slate-300 hover:border-slate-300"
                          }`}
                        >
                          <Icon className={`size-3.5 shrink-0 ${color}`} />
                          <span>{label}</span>
                          {isSelected && <span aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>
            </div>

            {/* Modal Fixed Footer */}
            <div className="flex-none px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-[hsl(var(--border-subtle))] bg-white dark:bg-[hsl(var(--surface-overlay))] z-20 flex items-center justify-between gap-3 shadow-sm">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={onReset}
                  className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 dark:text-slate-300 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-[hsl(var(--surface-raised))] dark:hover:text-rose-400 transition-colors whitespace-nowrap"
                >
                  {isJa ? "条件をリセット" : "Reset preferences"}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 sm:px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 whitespace-nowrap"
              >
                {isOvernightDuration(tripDuration)
                  ? t("destination.tripAreas.show", {
                      count: totalResultsCount,
                    })
                  : isJa
                    ? `${totalResultsCount}件の目的地を表示`
                    : `Show ${totalResultsCount} destinations`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
