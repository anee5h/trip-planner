import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { useAuth } from "@/shared/hooks/useAuth";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import DestinationFilters from "@/features/destinations/components/DestinationFilters";
import DestinationMap from "@/features/destinations/components/DestinationMap";
import {
  Frown,
  Map as MapIcon,
  Grid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getAdjustedBudget } from "@/shared/utils/utils";
import StationInput from "@/shared/components/StationInput";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useLocale } from "@/shared/context/LocaleContext";
import {
  getValidModes,
  scoreForCatalog,
} from "@/shared/services/recommendation/RecommendationService";
import type { RecommendationContext } from "@/shared/services/recommendation/RecommendationContext";
import {
  tokenizeQuery,
  matchesDestination,
} from "@/shared/services/recommendation/DestinationSearch";
import {
  isCoupleFriendly,
  isFamilyFriendly,
  isSoloFriendly,
  isAccessible,
} from "@/shared/services/recommendation/RecommendationFilters";

import { PageHeader } from "@/shared/components/ui/PageHeader";

import { getWalkingIntensity } from "@/shared/utils/walking";
import {
  DEFAULT_DESTINATION_EXPLORER_STATE,
  parseDestinationSearchParams,
  serializeDestinationSearchParams,
} from "./destinationSearchParams";

export default function Destinations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialExplorerState] = useState(() =>
    parseDestinationSearchParams(searchParams),
  );
  const initialSearchParams = searchParams.toString();
  const lastWrittenSearchRef = useRef(initialSearchParams);
  const filtersInitializedRef = useRef(false);
  const skipNextPageResetRef = useRef(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const { homeStationCoords, destinationRatings } = useTripStore();
  const { locale } = useLocale();
  const allDestinations = getDestinationList(locale) as Destination[];
  const [searchQuery, setSearchQuery] = useState(
    initialExplorerState.searchQuery,
  );
  const [maxBudget, setMaxBudget] = useState(initialExplorerState.maxBudget);
  const [sortBy, setSortBy] = useState(initialExplorerState.sortBy);
  const { user, loading: authLoading } = useAuth();
  const [carMode, setCarMode] = useState(initialExplorerState.carMode);
  const [publicModes, setPublicModes] = useState<string[]>(
    initialExplorerState.publicModes,
  );
  const [partySize, setPartySize] = useState(initialExplorerState.partySize);
  const [weather, setWeather] = useState(initialExplorerState.weather);
  const [walkingIntensity, setWalkingIntensity] = useState(
    initialExplorerState.walkingIntensity,
  );

  const [suitabilities, setSuitabilities] = useState<string[]>(
    initialExplorerState.suitabilities,
  );
  const [interests, setInterests] = useState<string[]>(
    initialExplorerState.interests,
  );
  const [viewMode, setViewMode] = useState<"grid" | "map">(
    initialExplorerState.viewMode,
  );
  const [currentPage, setCurrentPage] = useState(
    initialExplorerState.currentPage,
  );
  const ITEMS_PER_PAGE = 20;

  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    initialExplorerState.selectedRegions,
  );
  const [selectedPrefectures, setSelectedPrefectures] = useState<string[]>(
    initialExplorerState.selectedPrefectures,
  );
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    initialExplorerState.selectedCollections,
  );
  const query = searchQuery.toLowerCase().trim();

  // Saved preferences provide defaults only when the URL has not specified one.
  useEffect(() => {
    if (authLoading) return;

    if (user?.user_metadata?.preferences) {
      if (!searchParams.has("car")) {
        setCarMode(user.user_metadata.preferences.carMode || "none");
      }
      if (!searchParams.has("mode")) {
        setPublicModes(
          user.user_metadata.preferences.publicModes || [
            "train",
            "shinkansen",
            "bus",
            "flight",
          ],
        );
      }
      if (!searchParams.has("party")) {
        setPartySize(user.user_metadata.preferences.partySize || 2);
      }
    }
    setFiltersReady(true);
  }, [authLoading, user, searchParams]);

  // Restore Explorer state when the browser navigates to a different query.
  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (currentSearch === lastWrittenSearchRef.current) return;

    const restored = parseDestinationSearchParams(searchParams);
    skipNextPageResetRef.current = true;
    setSearchQuery(restored.searchQuery);
    setSelectedRegions(restored.selectedRegions);
    setSelectedPrefectures(restored.selectedPrefectures);
    setSelectedCollections(restored.selectedCollections);
    setMaxBudget(restored.maxBudget);
    setSortBy(restored.sortBy);
    setCarMode(restored.carMode);
    setPublicModes(restored.publicModes);
    setPartySize(restored.partySize);
    setWeather(restored.weather);
    setWalkingIntensity(restored.walkingIntensity);
    setSuitabilities(restored.suitabilities);
    setInterests(restored.interests);
    setViewMode(restored.viewMode);
    setCurrentPage(restored.currentPage);
    lastWrittenSearchRef.current = currentSearch;
  }, [searchParams]);

  // Keep every active Explorer control shareable and recoverable from the URL.
  useEffect(() => {
    if (!filtersReady) return;

    const nextSearch = serializeDestinationSearchParams({
      searchQuery,
      selectedRegions,
      selectedPrefectures,
      selectedCollections,
      maxBudget,
      sortBy,
      carMode,
      publicModes,
      partySize,
      weather,
      walkingIntensity,
      suitabilities,
      interests,
      viewMode,
      currentPage,
    }).toString();

    if (nextSearch === lastWrittenSearchRef.current) return;
    lastWrittenSearchRef.current = nextSearch;
    setSearchParams(nextSearch, { replace: true });
  }, [
    filtersReady,
    searchQuery,
    selectedRegions,
    selectedPrefectures,
    selectedCollections,
    maxBudget,
    sortBy,
    carMode,
    publicModes,
    partySize,
    weather,
    walkingIntensity,
    suitabilities,
    interests,
    viewMode,
    currentPage,
    setSearchParams,
  ]);

  // Build context for catalog scoring ("Recommended" sort).
  // Sourced from saved Settings → Travel Preferences where available.
  // Documented defaults when not saved:
  //   tripType: "" — hits no switch case, zero trip-type impact (clean neutral)
  //   budget:   50_000 JPY — mid-range, non-destructive fallback
  //   partySize/carMode/publicModes: from saved preferences or fallback values
  // currentWeatherCondition: "" — calendar season (via getFixedSeason in scorer)
  //   handles the seasonal dimension; no ambient weather fetch needed.
  const catalogContext = useMemo<RecommendationContext>(() => {
    const prefs = user?.user_metadata?.preferences ?? {};
    return {
      tripType: "",
      budget: 50_000,
      partySize: prefs.partySize ?? 2,
      carMode: prefs.carMode ?? "none",
      publicModes: prefs.publicModes ?? [
        "train",
        "shinkansen",
        "bus",
        "flight",
      ],
      currentWeatherCondition: "",
      currentWeather: null,
      visitedIds: [],
      homeStationCoords: homeStationCoords ?? null,
      userRatings: destinationRatings,
    };
  }, [user, homeStationCoords, destinationRatings]);

  // Reset page to 1 when filters change
  useEffect(() => {
    if (!filtersReady) return;
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }
    if (skipNextPageResetRef.current) {
      skipNextPageResetRef.current = false;
      return;
    }
    setCurrentPage(1);
  }, [
    filtersReady,
    searchQuery,
    selectedRegions,
    selectedPrefectures,
    selectedCollections,
    maxBudget,
    sortBy,
    carMode,
    publicModes,
    partySize,
    weather,
    walkingIntensity,
    suitabilities,
    interests,
  ]);

  // Filter and sort destinations
  const filteredAndSortedDestinations = useMemo(() => {
    let result = allDestinations.map((destination) =>
      buildRecommendationCandidate(destination, { homeStationCoords }),
    );

    // 0. Filter by Curated Collections (OR Semantics)
    if (selectedCollections.length > 0) {
      result = result.filter((dest) => {
        if (!dest.collections || dest.collections.length === 0) return false;
        return dest.collections.some((m) =>
          selectedCollections.includes(m.collectionId),
        );
      });
    }

    // 0.5. Filter by Region & Prefecture
    if (selectedRegions.length > 0 || selectedPrefectures.length > 0) {
      result = result.filter((dest) => {
        const matchRegion = selectedRegions.includes(dest.region);
        const matchPref = selectedPrefectures.includes(dest.prefecture);
        return matchRegion || matchPref;
      });
    }

    // 1. Search
    if (query) {
      const tokens = tokenizeQuery(searchQuery);
      result = result.filter((dest) => matchesDestination(dest, tokens));
    }

    // 2. Filter by budget and Transport availability
    result = result.filter((dest) => {
      const modes = getValidModes(dest, carMode, publicModes);
      if (modes.length === 0) return false;

      let lowest = 999999;
      for (const m of modes) {
        const b = getAdjustedBudget(dest, m, partySize);
        if (b < lowest) lowest = b;
      }
      return lowest <= maxBudget;
    });

    // 3. Suitability filters
    if (suitabilities.length > 0) {
      result = result.filter((dest) => {
        return suitabilities.every((suit) => {
          if (suit === "solo") return isSoloFriendly(dest);
          if (suit === "couple") return isCoupleFriendly(dest);
          if (suit === "family") return isFamilyFriendly(dest);
          if (suit === "accessible") return isAccessible(dest);
          return true;
        });
      });
    }

    // 4. Interests filters
    if (interests.length > 0) {
      result = result.filter((dest) => {
        const allAttributes = [
          ...(dest.categories || []),
          ...(dest.tags || []),
        ].map((x) => x.toLowerCase());
        return interests.every((interest) =>
          allAttributes.some((attr) => attr.includes(interest)),
        );
      });
    }

    // 5. Filter by Weather
    if (weather === "indoor") {
      result = result.filter(
        (dest) =>
          (dest.indoorPercent ?? 0) >= 50 || (dest.ratings?.rain ?? 0) >= 8,
      );
    } else if (weather === "summer") {
      result = result.filter((dest) => (dest.ratings?.summer ?? 0) >= 8);
    } else if (weather === "winter") {
      result = result.filter((dest) => (dest.ratings?.winter ?? 0) >= 8);
    }

    // 6. Filter by Walking Intensity
    if (walkingIntensity !== "all") {
      result = result.filter(
        (dest) => getWalkingIntensity(dest) === walkingIntensity,
      );
    }

    // 6. Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "recommended":
          return (
            scoreForCatalog(b, catalogContext) -
            scoreForCatalog(a, catalogContext)
          );
        case "budget":
          return (
            Math.min(
              ...getValidModes(a, carMode, publicModes).map((m) =>
                getAdjustedBudget(a, m, partySize),
              ),
            ) -
            Math.min(
              ...getValidModes(b, carMode, publicModes).map((m) =>
                getAdjustedBudget(b, m, partySize),
              ),
            )
          );
        case "travelTime":
          const getFastestTime = (dest: Destination) => {
            const times = getValidModes(dest, carMode, publicModes).map(
              (m) =>
                (dest.transportOptions?.[
                  m as keyof typeof dest.transportOptions
                ] as number) || 999,
            );
            return times.length > 0 ? Math.min(...times) : 999;
          };
          return getFastestTime(a) - getFastestTime(b);
        case "walking":
          return (a.walkingMin ?? 0) - (b.walkingMin ?? 0);
        case "couple":
          return (b.ratings?.couple ?? 0) - (a.ratings?.couple ?? 0);
        case "summer":
          return (b.ratings?.summer ?? 0) - (a.ratings?.summer ?? 0);
        case "winter":
          return (b.ratings?.winter ?? 0) - (a.ratings?.winter ?? 0);
        case "overall":
        default:
          return (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0);
      }
    });

    return result;
  }, [
    allDestinations,
    query,
    maxBudget,
    sortBy,
    carMode,
    publicModes,
    partySize,
    weather,
    walkingIntensity,
    homeStationCoords,
    catalogContext,
    selectedRegions,
    selectedPrefectures,
    selectedCollections,
    searchQuery,
    suitabilities,
    interests,
  ]);

  const resetFilters = () => {
    const defaults = DEFAULT_DESTINATION_EXPLORER_STATE;
    setSearchQuery(defaults.searchQuery);
    setSelectedRegions(defaults.selectedRegions);
    setSelectedPrefectures(defaults.selectedPrefectures);
    setSelectedCollections(defaults.selectedCollections);
    setMaxBudget(defaults.maxBudget);
    setSortBy(defaults.sortBy);
    setCarMode(defaults.carMode);
    setPublicModes(defaults.publicModes);
    setPartySize(defaults.partySize);
    setWeather(defaults.weather);
    setWalkingIntensity(defaults.walkingIntensity);
    setSuitabilities(defaults.suitabilities);
    setInterests(defaults.interests);
    setViewMode(defaults.viewMode);
    setCurrentPage(defaults.currentPage);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        title="Destinations"
        description="Find the perfect adventure across Japan. Filter by region, prefecture, collections, budget, and vibe."
        actions={
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("grid")}
              aria-label="Switch to grid view"
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-900 shadow-sm text-emerald-600"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Grid className="w-4 h-4 mr-2" />
              Grid
            </button>
            <button
              onClick={() => setViewMode("map")}
              aria-label="Switch to map view"
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === "map"
                  ? "bg-white dark:bg-slate-900 shadow-sm text-emerald-600"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <MapIcon className="w-4 h-4 mr-2" />
              Map
            </button>
          </div>
        }
      />
      <div className="mt-2 mb-6">
        <StationInput />
      </div>

      <DestinationFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedRegions={selectedRegions}
        setSelectedRegions={setSelectedRegions}
        selectedPrefectures={selectedPrefectures}
        setSelectedPrefectures={setSelectedPrefectures}
        selectedCollections={selectedCollections}
        setSelectedCollections={setSelectedCollections}
        maxBudget={maxBudget}
        setMaxBudget={setMaxBudget}
        sortBy={sortBy}
        setSortBy={setSortBy}
        carMode={carMode}
        setCarMode={setCarMode}
        publicModes={publicModes}
        setPublicModes={setPublicModes}
        partySize={partySize}
        setPartySize={setPartySize}
        weather={weather}
        setWeather={setWeather}
        walkingIntensity={walkingIntensity}
        setWalkingIntensity={setWalkingIntensity}
        suitabilities={suitabilities}
        setSuitabilities={setSuitabilities}
        interests={interests}
        setInterests={setInterests}
        onReset={resetFilters}
      />

      <div
        id="results-grid"
        className="mb-6 flex flex-wrap items-center justify-between gap-4 text-slate-600 dark:text-slate-400 font-medium scroll-mt-24"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            {filteredAndSortedDestinations.length} destination
            {filteredAndSortedDestinations.length === 1 ? "" : "s"} matching
          </span>
        </div>

        {(searchQuery ||
          maxBudget < 100000 ||
          weather !== "all" ||
          suitabilities.length > 0 ||
          interests.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {searchQuery && (
              <span className="inline-flex items-center text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full">
                Search: "{searchQuery}"
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search query"
                  className="ml-1.5 hover:text-emerald-900 dark:hover:text-emerald-100 font-bold"
                >
                  ×
                </button>
              </span>
            )}
            {maxBudget < 100000 && (
              <span className="inline-flex items-center text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full">
                Budget ≤ ¥{maxBudget.toLocaleString()}
                <button
                  onClick={() => setMaxBudget(100000)}
                  aria-label="Clear budget filter"
                  className="ml-1.5 hover:text-emerald-900 dark:hover:text-emerald-100 font-bold"
                >
                  ×
                </button>
              </span>
            )}
            {weather !== "all" && (
              <span className="inline-flex items-center text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full capitalize">
                Weather: {weather}
                <button
                  onClick={() => setWeather("all")}
                  aria-label="Clear weather filter"
                  className="ml-1.5 hover:text-emerald-900 dark:hover:text-emerald-100 font-bold"
                >
                  ×
                </button>
              </span>
            )}
            {suitabilities.map((suit) => (
              <span
                key={suit}
                className="inline-flex items-center text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full capitalize"
              >
                {suit}
                <button
                  onClick={() =>
                    setSuitabilities(suitabilities.filter((s) => s !== suit))
                  }
                  aria-label={`Remove ${suit} filter`}
                  className="ml-1.5 hover:text-emerald-900 dark:hover:text-emerald-100 font-bold"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={resetFilters}
              aria-label="Reset all filters"
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline ml-2"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {filteredAndSortedDestinations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Frown className="w-12 h-12 mb-4 text-slate-400" />
          <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">
            No destinations match the selected filters.
          </h3>
          <p className="text-sm mt-1">
            Try adjusting your search terms or clearing some filters.
          </p>
        </div>
      ) : viewMode === "map" ? (
        <DestinationMap
          destinations={filteredAndSortedDestinations}
          carMode={carMode}
          publicModes={publicModes}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAndSortedDestinations
              .slice(
                (currentPage - 1) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE,
              )
              .map((dest) => (
                <DestinationCard
                  key={dest.id}
                  destination={dest}
                  partySize={partySize}
                  carMode={carMode}
                  publicModes={publicModes}
                />
              ))}
          </div>

          {/* Pagination Controls */}
          {filteredAndSortedDestinations.length > ITEMS_PER_PAGE && (
            <div className="mt-12 flex justify-center items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex gap-1 flex-wrap justify-center">
                {Array.from({
                  length: Math.ceil(
                    filteredAndSortedDestinations.length / ITEMS_PER_PAGE,
                  ),
                }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                      currentPage === i + 1
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(
                      Math.ceil(
                        filteredAndSortedDestinations.length / ITEMS_PER_PAGE,
                      ),
                      p + 1,
                    ),
                  )
                }
                disabled={
                  currentPage ===
                  Math.ceil(
                    filteredAndSortedDestinations.length / ITEMS_PER_PAGE,
                  )
                }
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
