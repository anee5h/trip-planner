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
  Footprints,
  Coins,
  Filter,
  X,
  Sparkles,
  Car,
  Compass,
  Layers,
  ChevronDown,
  Sun,
  CloudRain,
  Snowflake,
  Minus,
  Plus,
} from "lucide-react";

import { getCollections } from "@/shared/data/collections";
import type { BudgetTier } from "@/shared/types/planner";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import { CITY_AREAS } from "@/shared/data/cityAreas";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import WhereLocationPicker from "./WhereLocationPicker";

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
  sortBy: string;
  setSortBy: (val: string) => void;
  carMode: string;
  setCarMode: (val: string) => void;
  publicModes: string[];
  setPublicModes: (val: string[]) => void;
  partySize: number;
  setPartySize: (val: number) => void;
  weather: "any" | "rainy" | "hot" | "cold";
  setWeather: (val: "any" | "rainy" | "hot" | "cold") => void;
  budgetTier: BudgetTier;
  setBudgetTier: (val: BudgetTier) => void;
  vibe: string;
  setVibe: (val: string) => void;
  tripDuration: TripDuration;
  setTripDuration: (val: TripDuration) => void;
  maxTravelTime: "any" | "30" | "60" | "90";
  setMaxTravelTime: (val: "any" | "30" | "60" | "90") => void;
  walkingIntensity: string;
  setWalkingIntensity: (val: string) => void;
  suitabilities: string[];
  setSuitabilities: (val: string[] | ((prev: string[]) => string[])) => void;
  interests: string[];
  setInterests: (val: string[] | ((prev: string[]) => string[])) => void;
  viewMode: "grid" | "map";
  setViewMode: (val: "grid" | "map") => void;
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
  selectedCities,
  setSelectedCities,
  selectedAreas,
  setSelectedAreas,
  indoorMin,
  setIndoorMin,
  season,
  setSeason,
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
  maxTravelTime,
  setMaxTravelTime,
  walkingIntensity,
  setWalkingIntensity,
  suitabilities,
  setSuitabilities,
  interests,
  setInterests,
  totalResultsCount = 0,
  onReset,
}: DestinationFiltersProps) {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [collectionPopoverOpen, setCollectionPopoverOpen] = useState(false);
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

  // Derived Getting Around simplified value
  const gettingAroundValue =
    carMode === "my_car"
      ? "my_car"
      : carMode === "rental"
        ? "rental"
        : publicModes.length > 0 && carMode === "none"
          ? "public"
          : "either";

  const handleGettingAroundChange = (val: string | null) => {
    if (!val) return;
    if (val === "public") {
      setCarMode("none");
      if (publicModes.length === 0)
        setPublicModes(["train", "shinkansen", "bus", "flight"]);
    } else if (val === "my_car") {
      setCarMode("my_car");
    } else if (val === "rental") {
      setCarMode("rental");
    } else if (val === "either") {
      setCarMode("rental");
      if (publicModes.length === 0)
        setPublicModes(["train", "shinkansen", "bus", "flight"]);
    }
  };

  // Active modal filters count
  const activeAdvancedCount =
    (partySize !== 2 ? 1 : 0) +
    (indoorMin > 0 ? 1 : 0) +
    (weather !== "any" ? 1 : 0) +
    (walkingIntensity !== "all" ? 1 : 0) +
    suitabilities.length +
    interests.length +
    (season !== "any" ? 1 : 0) +
    (publicModes.length < 4 ? 1 : 0);

  // Check if any filter differs from default state for conditional Reset button
  const hasActiveFilters =
    searchQuery !== "" ||
    selectedRegions.length > 0 ||
    selectedPrefectures.length > 0 ||
    selectedCities.length > 0 ||
    selectedAreas.length > 0 ||
    selectedCollections.length > 0 ||
    vibe !== "any" ||
    tripDuration !== "any" ||
    budgetTier !== "standard" ||
    gettingAroundValue !== "public" ||
    maxTravelTime !== "any" ||
    activeAdvancedCount > 0;

  // Active filter chips calculation
  const activeChips: { id: string; label: string; onRemove: () => void }[] = [];

  selectedRegions.forEach((r) =>
    activeChips.push({
      id: `region-${r}`,
      label: `${r} Region`,
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

  selectedCities.forEach((c) => {
    const hub = getDestinationList().find((h) => h.id === c);
    activeChips.push({
      id: `city-${c}`,
      label: hub?.name || c,
      onRemove: () => setSelectedCities(selectedCities.filter((x) => x !== c)),
    });
  });

  selectedAreas.forEach((a) => {
    const area = CITY_AREAS.find((item) => item.id === a);
    activeChips.push({
      id: `area-${a}`,
      label: area ? area.name.en : a,
      onRemove: () => setSelectedAreas(selectedAreas.filter((x) => x !== a)),
    });
  });

  selectedCollections.forEach((colId) => {
    const col = availableCollections.find((c) => c.id === colId);
    activeChips.push({
      id: `col-${colId}`,
      label: col ? col.name : colId,
      onRemove: () =>
        setSelectedCollections((prev) => prev.filter((x) => x !== colId)),
    });
  });

  if (vibe !== "any") {
    activeChips.push({
      id: "vibe",
      label: `Vibe: ${vibe}`,
      onRemove: () => setVibe("any"),
    });
  }

  if (tripDuration !== "any") {
    const durLabel =
      tripDuration === "shortOuting"
        ? "Short outing"
        : tripDuration === "halfDay"
          ? "Half day"
          : tripDuration === "fullDay"
            ? "Full day"
            : "Weekend";
    activeChips.push({
      id: "duration",
      label: durLabel,
      onRemove: () => setTripDuration("any"),
    });
  }

  if (budgetTier !== "standard") {
    activeChips.push({
      id: "budget",
      label: `Budget: ${budgetTier[0].toUpperCase() + budgetTier.slice(1)}`,
      onRemove: () => setBudgetTier("standard"),
    });
  }

  if (carMode !== "none") {
    activeChips.push({
      id: "carMode",
      label: carMode === "my_car" ? "My car" : "Rental car",
      onRemove: () => setCarMode("none"),
    });
  }

  if (maxTravelTime !== "any") {
    activeChips.push({
      id: "maxTime",
      label: `Max ${maxTravelTime}m`,
      onRemove: () => setMaxTravelTime("any"),
    });
  }

  if (walkingIntensity !== "all") {
    activeChips.push({
      id: "walking",
      label: `Walking: ${walkingIntensity}`,
      onRemove: () => setWalkingIntensity("all"),
    });
  }

  if (indoorMin > 0) {
    activeChips.push({
      id: "indoor",
      label: indoorMin >= 90 ? "Fully indoors" : "Mostly indoors",
      onRemove: () => setIndoorMin(0),
    });
  }

  if (weather !== "any") {
    activeChips.push({
      id: "weather",
      label:
        weather === "rainy"
          ? "Rain-friendly"
          : weather === "hot"
            ? "Cool in heat"
            : "Good in cold",
      onRemove: () => setWeather("any"),
    });
  }

  if (season !== "any") {
    activeChips.push({
      id: "season",
      label: `Season: ${season}`,
      onRemove: () => setSeason("any"),
    });
  }

  suitabilities.forEach((s) =>
    activeChips.push({
      id: `suitability-${s}`,
      label:
        s === "family"
          ? "Family-friendly"
          : s === "accessible"
            ? "Accessible"
            : s,
      onRemove: () => setSuitabilities((prev) => prev.filter((x) => x !== s)),
    }),
  );

  interests.forEach((i) =>
    activeChips.push({
      id: `interest-${i}`,
      label: i,
      onRemove: () => setInterests((prev) => prev.filter((x) => x !== i)),
    }),
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm mb-6 transition-all duration-200">
      {/* Search Input Bar */}
      <div className="mb-3">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Search destinations, keywords..."
            className="pl-10 pr-8 h-9 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500 rounded-xl text-xs font-medium"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Always-Visible Filter Bar (Logical Sequence: Where -> Getting around -> Travel time -> Duration -> Vibe -> Collections -> Budget -> More filters) */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2 shrink-0">
          {/* 1. Where Location Picker */}
          <WhereLocationPicker
            selectedRegions={selectedRegions}
            setSelectedRegions={setSelectedRegions}
            selectedPrefectures={selectedPrefectures}
            setSelectedPrefectures={setSelectedPrefectures}
            selectedCities={selectedCities}
            setSelectedCities={setSelectedCities}
            selectedAreas={selectedAreas}
            setSelectedAreas={setSelectedAreas}
          />

          {/* 2. Getting Around Filter */}
          <Select
            value={gettingAroundValue}
            onValueChange={handleGettingAroundChange}
          >
            <SelectTrigger
              className={`h-9 px-3 rounded-xl border text-xs font-bold transition-all ${
                gettingAroundValue !== "public"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <Car className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {gettingAroundValue === "public"
                    ? "Public transit"
                    : gettingAroundValue === "my_car"
                      ? "My car"
                      : gettingAroundValue === "rental"
                        ? "Rental car"
                        : "Either"}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
              <SelectItem value="public">Public transit</SelectItem>
              {showMyCar && <SelectItem value="my_car">My car</SelectItem>}
              {showRental && <SelectItem value="rental">Rental car</SelectItem>}
              <SelectItem value="either">Either</SelectItem>
            </SelectContent>
          </Select>

          {/* 3. Max Travel Time Filter */}
          <Select
            value={maxTravelTime}
            onValueChange={(val: string | null) =>
              val && setMaxTravelTime(val as typeof maxTravelTime)
            }
          >
            <SelectTrigger
              className={`h-9 px-3 rounded-xl border text-xs font-bold transition-all ${
                maxTravelTime !== "any"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {maxTravelTime === "any"
                    ? "Travel time"
                    : `≤ ${maxTravelTime} mins`}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
              <SelectItem value="any">Any travel time</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="60">60 minutes</SelectItem>
              <SelectItem value="90">90 minutes</SelectItem>
            </SelectContent>
          </Select>

          {/* 4. Duration Filter */}
          <Select
            value={tripDuration}
            onValueChange={(val: string | null) =>
              val && setTripDuration(val as TripDuration)
            }
          >
            <SelectTrigger
              className={`h-9 px-3 rounded-xl border text-xs font-bold transition-all ${
                tripDuration !== "any"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {tripDuration === "any"
                    ? "Duration"
                    : tripDuration === "shortOuting"
                      ? "Short outing"
                      : tripDuration === "halfDay"
                        ? "Half day"
                        : tripDuration === "fullDay"
                          ? "Full day"
                          : "Weekend"}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
              <SelectItem value="any">Any duration</SelectItem>
              <SelectItem value="shortOuting">Short outing (&lt;4h)</SelectItem>
              <SelectItem value="halfDay">Half day (4–7.5h)</SelectItem>
              <SelectItem value="fullDay">Full day (7.5–14h)</SelectItem>
              <SelectItem value="weekend">Weekend (&gt;14h)</SelectItem>
            </SelectContent>
          </Select>

          {/* 5. Vibe Filter */}
          <Select
            value={vibe}
            onValueChange={(val: string | null) => val && setVibe(val)}
          >
            <SelectTrigger
              className={`h-9 px-3 rounded-xl border text-xs font-bold transition-all ${
                vibe !== "any"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {vibe === "any"
                    ? "Vibe"
                    : vibe[0].toUpperCase() + vibe.slice(1)}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
              <SelectItem value="any">Anything goes</SelectItem>
              <SelectItem value="art">Art & museums</SelectItem>
              <SelectItem value="food">Food</SelectItem>
              <SelectItem value="nature">Nature</SelectItem>
              <SelectItem value="history">History</SelectItem>
              <SelectItem value="sea">Sea</SelectItem>
              <SelectItem value="photography">Photography</SelectItem>
              <SelectItem value="themeParks">Theme parks</SelectItem>
            </SelectContent>
          </Select>

          {/* 6. Curated Collections Multi-Select Dropdown Popover */}
          <div className="relative" ref={collectionPopoverRef}>
            <button
              type="button"
              onClick={() => setCollectionPopoverOpen(!collectionPopoverOpen)}
              className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 transition-all ${
                selectedCollections.length > 0
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
              }`}
            >
              <div className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate max-w-[120px]">
                  {selectedCollections.length === 0
                    ? "Collections"
                    : `${selectedCollections.length} Collection${selectedCollections.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {collectionPopoverOpen && (
              <div className="absolute left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Curated Collections
                  </span>
                  {selectedCollections.length > 0 && (
                    <button
                      onClick={() => setSelectedCollections([])}
                      className="text-[11px] font-semibold text-rose-500 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="space-y-1">
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

          {/* 7. Budget Filter (Clear "Budget" Trigger Label) */}
          <Select
            value={budgetTier}
            onValueChange={(val: string | null) =>
              val && setBudgetTier(val as BudgetTier)
            }
          >
            <SelectTrigger
              className={`h-9 px-3 rounded-xl border text-xs font-bold transition-all ${
                budgetTier !== "standard"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {budgetTier === "standard"
                    ? "Budget"
                    : `Budget: ${budgetTier[0].toUpperCase() + budgetTier.slice(1)}`}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
              <SelectItem value="economy">Economy</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="luxury">Luxury</SelectItem>
            </SelectContent>
          </Select>

          {/* 8. More Filters Toggle */}
          <button
            onClick={() => setModalOpen(true)}
            className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
              activeAdvancedCount > 0
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500"
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-emerald-500" />
            <span>More filters</span>
            {activeAdvancedCount > 0 && (
              <span className="bg-emerald-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                {activeAdvancedCount}
              </span>
            )}
          </button>
        </div>

        {/* 9. Right side Sort dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={sortBy}
            onValueChange={(val: string | null) => {
              if (val) setSortBy(val);
            }}
          >
            <SelectTrigger className="h-9 w-36 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-colors rounded-xl font-medium text-xs">
              {sortBy === "recommended" && (
                <div className="flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />{" "}
                  Recommended
                </div>
              )}
              {sortBy === "overall" && (
                <div className="flex items-center">
                  <Star className="w-3.5 h-3.5 mr-1.5 text-amber-500" /> Top
                  Rated
                </div>
              )}
              {sortBy === "travelTime" && (
                <div className="flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Fastest
                </div>
              )}
              {sortBy === "budget" && (
                <div className="flex items-center">
                  <Coins className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />{" "}
                  Budget
                </div>
              )}
              {sortBy === "walking" && (
                <div className="flex items-center">
                  <Footprints className="w-3.5 h-3.5 mr-1.5 text-slate-500" />{" "}
                  Least Walk
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
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {activeChips.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800">
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="p-0.5 hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50 rounded-full transition-colors"
              >
                <X className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              </button>
            </span>
          ))}

          {/* Conditional Reset / Clear All button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-bold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 underline ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Compact "More Filters" Floating Modal Window */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg max-h-[85vh] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm z-10">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                More filters
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Travel Party Stepper */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Travel party
                </span>
                <div className="flex items-center gap-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
                  <button
                    type="button"
                    disabled={partySize <= 1}
                    onClick={() => setPartySize(Math.max(1, partySize - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold w-16 text-center text-slate-900 dark:text-white">
                    {partySize} {partySize === 1 ? "person" : "people"}
                  </span>
                  <button
                    type="button"
                    disabled={partySize >= 10}
                    onClick={() => setPartySize(Math.min(10, partySize + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Indoor Preference */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Indoor preference
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 0, label: "Any" },
                    { val: 70, label: "Mostly indoors" },
                    { val: 90, label: "Fully indoors" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setIndoorMin(opt.val)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                        indoorMin === opt.val
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weather Suitability */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Weather suitability
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "any", label: "Any weather", icon: Sun },
                    { val: "rainy", label: "Rain-friendly", icon: CloudRain },
                    { val: "hot", label: "Cool in heat", icon: Sun },
                    { val: "cold", label: "Good in cold", icon: Snowflake },
                  ].map((w) => {
                    const isSelected = weather === w.val;
                    const Icon = w.icon;
                    return (
                      <button
                        key={w.val}
                        type="button"
                        onClick={() => setWeather(w.val as typeof weather)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold"
                            : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-emerald-600" : "text-slate-400"}`}
                        />
                        <span className="text-xs truncate">{w.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Walking Difficulty */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Footprints className="w-3.5 h-3.5 text-emerald-500" />
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Walking difficulty
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "all", label: "Any", desc: "No preference" },
                    { id: "low", label: "Easy", desc: "Mostly flat" },
                    {
                      id: "medium",
                      label: "Moderate",
                      desc: "Slopes & walking",
                    },
                    {
                      id: "high",
                      label: "Challenging",
                      desc: "Long walks/hiking",
                    },
                  ].map((w) => {
                    const isSelected = walkingIntensity === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setWalkingIntensity(w.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <div
                          className={`text-xs font-bold ${isSelected ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}
                        >
                          {w.label}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {w.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Public Transport Modes Refinement */}
              {(gettingAroundValue === "public" ||
                gettingAroundValue === "either") && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Public transport options
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "train", label: "Train", icon: Train },
                      {
                        id: "shinkansen",
                        label: "Shinkansen",
                        icon: TrainFront,
                      },
                      { id: "bus", label: "Bus", icon: Bus },
                      { id: "flight", label: "Flight", icon: Plane },
                    ].map((mode) => {
                      const active = publicModes.includes(mode.id);
                      const Icon = mode.icon;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() =>
                            setPublicModes(
                              active
                                ? publicModes.filter((m) => m !== mode.id)
                                : [...publicModes, mode.id],
                            )
                          }
                          className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            active
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Practical Requirements */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Practical requirements
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "family", label: "Family-friendly" },
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
                        className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {active ? "✓ " : ""}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interests */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
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
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold"
                            : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {active ? "✓ " : ""}
                        {interest.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Season */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Season
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["any", "spring", "summer", "autumn", "winter"].map(
                    (val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSeason(val)}
                        className={`py-1 px-3 rounded-lg border text-xs font-bold capitalize transition-all ${
                          season === val
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {val}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* Compact Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={onReset}
                className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 underline"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
              >
                Show {totalResultsCount} places
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
