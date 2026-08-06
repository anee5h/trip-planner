import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
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
import { getPaginationItems } from "./pagination";
import { getAdjustedBudget } from "@/shared/utils/utils";
import StationInput from "@/shared/components/StationInput";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useLocale } from "@/shared/context/LocaleContext";
import {
  getValidModes,
  scoreForCatalog,
} from "@/shared/services/recommendation/RecommendationService";
import type {
  RecommendationContext,
  TripMode,
} from "@/shared/services/recommendation/RecommendationContext";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import {
  BUDGET_TIER_LIMITS,
  partyProfileForSize,
  type BudgetTier,
} from "@/shared/types/planner";
import {
  getBestOneWayTravelMinutes,
  matchesVisitDuration,
  estimateTripDuration,
} from "@/shared/services/recommendation/TripDurationService";
import {
  evaluateWeekendTravelFit,
  evaluateWeekendCapacity,
} from "@/shared/services/recommendation/WeekendPolicy";
import {
  resolveOriginMunicipalityId,
  isOriginLocalDestination,
} from "@/shared/services/recommendation/OriginAreaService";
import {
  consolidateWeekendAreas,
  type WeekendAreaConsolidation,
} from "@/shared/services/recommendation/WeekendAreaPolicy";
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

import { getDistance } from "@/shared/utils/distance";
import { getWalkingIntensity } from "@/shared/utils/walking";
import {
  DEFAULT_DESTINATION_EXPLORER_STATE,
  hasRestrictedTransportSelection,
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
  const { homeStationCoords, homeStationTransportZoneId, destinationRatings } =
    useTripStore();
  const { locale } = useLocale();
  const { t } = useTranslation();
  const allDestinations = (getDestinationList("en") as Destination[]).map(
    (destination) => getLocalizedPlace(destination, locale),
  );
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
  const [budgetTier, setBudgetTier] = useState<BudgetTier>(
    initialExplorerState.budgetTier,
  );
  const [vibe, setVibe] = useState(initialExplorerState.vibe);
  const [weather, setWeather] = useState(initialExplorerState.weather);
  const [tripDuration, setTripDuration] = useState<TripDuration>(
    initialExplorerState.tripDuration,
  );
  const [tripMode, setTripMode] = useState<"any" | TripMode>(
    initialExplorerState.tripMode as "any" | TripMode,
  );
  const [accommodationAllowance, setAccommodationAllowance] = useState<number>(
    initialExplorerState.accommodationAllowance,
  );
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
  const [selectedCities, setSelectedCities] = useState<string[]>(
    initialExplorerState.selectedCities,
  );
  const [selectedAreas, setSelectedAreas] = useState<string[]>(
    initialExplorerState.selectedAreas,
  );
  const [indoorMin, setIndoorMin] = useState(initialExplorerState.indoorMin);
  const [season, setSeason] = useState(initialExplorerState.season);
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
    setSelectedCities(restored.selectedCities);
    setSelectedAreas(restored.selectedAreas);
    setIndoorMin(restored.indoorMin);
    setSeason(restored.season);
    setMaxBudget(restored.maxBudget);
    setSortBy(restored.sortBy);
    setCarMode(restored.carMode);
    setPublicModes(restored.publicModes);
    setPartySize(restored.partySize);
    setBudgetTier(restored.budgetTier);
    setVibe(restored.vibe);
    setWeather(restored.weather);
    setTripDuration(restored.tripDuration);
    setTripMode(restored.tripMode);
    setAccommodationAllowance(restored.accommodationAllowance);
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
      selectedCities,
      selectedAreas,
      indoorMin,
      season,
      maxBudget,
      sortBy,
      carMode,
      publicModes,
      partySize,
      partyProfile: partyProfileForSize(partySize),
      budgetTier,
      vibe,
      weather,
      tripDuration,
      tripMode,
      accommodationAllowance,
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
    selectedCities,
    selectedAreas,
    indoorMin,
    season,
    maxBudget,
    sortBy,
    carMode,
    publicModes,
    partySize,
    budgetTier,
    vibe,
    weather,
    tripDuration,
    tripMode,
    accommodationAllowance,
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
      vibe,
      weather: { preferred: weather },
      budgetTier,
      budget: maxBudget,
      partySize,
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
      originZoneId: homeStationTransportZoneId,
      userRatings: destinationRatings,
      tripDuration,
    };
  }, [
    user,
    homeStationCoords,
    homeStationTransportZoneId,
    destinationRatings,
    vibe,
    weather,
    budgetTier,
    tripDuration,
    maxBudget,
    partySize,
  ]);

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
    selectedCities,
    selectedAreas,
    indoorMin,
    season,
    maxBudget,
    sortBy,
    carMode,
    publicModes,
    partySize,
    budgetTier,
    vibe,
    weather,
    tripDuration,
    tripMode,
    walkingIntensity,
    suitabilities,
    interests,
  ]);

  // Filter and sort destinations. Weekend mode additionally consolidates the
  // primary results to coherent trip areas and reports the same consolidated
  // model for counts, the modal button, and the rendered cards.
  const {
    destinations: filteredAndSortedDestinations,
    weekend: weekendResult,
    weekendTravelById,
  } = useMemo(() => {
    const originMunicipalityId = resolveOriginMunicipalityId(
      homeStationCoords ?? undefined,
      allDestinations,
    );
    let weekendConsolidation: WeekendAreaConsolidation | null = null;
    let result = allDestinations.map((destination) =>
      buildRecommendationCandidate(destination, catalogContext),
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
        const matchRegion =
          selectedRegions.length > 0 && selectedRegions.includes(dest.region);
        const matchPref =
          selectedPrefectures.length > 0 &&
          selectedPrefectures.includes(dest.prefecture);
        return matchRegion || matchPref;
      });
    }

    if (indoorMin > 0) {
      result = result.filter((dest) => dest.indoorPercent >= indoorMin);
    }

    if (weather !== "any") {
      result = result.filter((dest) => {
        if (weather === "rainy") {
          return dest.indoorPercent >= 50 || (dest.ratings?.rain ?? 0) >= 7;
        }
        return (
          (dest.ratings?.[weather === "hot" ? "summer" : "winter"] ?? 0) >= 7
        );
      });
    }

    if (season !== "any") {
      result = result.filter(
        (dest) => dest.season?.[season as keyof Destination["season"]] >= 7,
      );
    }

    // 1. Search
    if (query) {
      const tokens = tokenizeQuery(searchQuery);
      result = result.filter((dest) => matchesDestination(dest, tokens));
    }

    // 1.5. Budget filters use a destination's upper estimate: a trip must be
    // possible within the selected amount, not merely start below it.
    if (budgetTier !== "standard") {
      result = result.filter((dest) => {
        const estimatedCost = dest.budgetMax ?? dest.budgetMin ?? Infinity;
        if (budgetTier === "economy") return estimatedCost < 10000;
        if (budgetTier === "comfortable") return estimatedCost < 20000;
        return budgetTier === "luxury" || estimatedCost < 40000;
      });
    }

    // 1.6. Vibe & Atmosphere Filter
    if (vibe !== "any") {
      result = result.filter((dest) => {
        const cats = (dest.categories || []).map((c) => c.toLowerCase());
        const tags = (dest.tags || []).map((t) => t.toLowerCase());
        const name = (dest.name || "").toLowerCase();
        const desc = (dest.description || "").toLowerCase();

        const matches = (keywords: string[]) =>
          keywords.some(
            (kw) =>
              cats.some((c) => c.includes(kw)) ||
              tags.some((t) => t.includes(kw)) ||
              name.includes(kw) ||
              desc.includes(kw),
          );

        switch (vibe) {
          case "art":
            return matches(["art", "museum", "gallery", "culture", "exhibit"]);
          case "food":
            return matches([
              "food",
              "gourmet",
              "dining",
              "market",
              "seafood",
              "ramen",
              "sake",
              "eat",
            ]);
          case "nature":
            return matches([
              "nature",
              "park",
              "garden",
              "mountain",
              "view",
              "waterfall",
              "lake",
              "scenic",
              "forest",
            ]);
          case "history":
            return matches([
              "history",
              "castle",
              "shrine",
              "temple",
              "historic",
              "heritage",
              "ruins",
            ]);
          case "sea":
            return matches([
              "sea",
              "beach",
              "ocean",
              "coast",
              "island",
              "bay",
              "port",
            ]);
          case "photography":
            return matches([
              "photo",
              "scenic",
              "view",
              "spot",
              "illumination",
              "landscape",
              "panoramic",
            ]);
          case "themeParks":
            return matches([
              "theme",
              "amusement",
              "entertainment",
              "aquarium",
              "zoo",
              "park",
            ]);
          default:
            return true;
        }
      });
    }

    // Budget tiers are ranking preferences. Neutral transport and duration
    // settings must keep the complete catalogue browsable.
    // Weekend mode uses its own eligibility gate instead of duration bands.
    if (tripMode === "weekend_2d1n") {
      const hasOrigin = homeStationCoords || homeStationTransportZoneId;
      result = result.filter((dest) => {
        if (!hasOrigin) return true; // neutral browsing without origin
        // Origin-local destinations are never getaways (same municipality as base).
        if (isOriginLocalDestination(dest, originMunicipalityId)) return false;
        // Neutral browsing: no explicit transport preference → no transport gate.
        if (!hasRestrictedTransportSelection(carMode, publicModes)) return true;
        const modes = getValidModes(
          dest,
          carMode,
          publicModes,
          homeStationCoords ?? undefined,
          budgetTier,
          homeStationTransportZoneId,
        );
        if (modes.length === 0) return false;
        const fit = evaluateWeekendTravelFit(
          getBestOneWayTravelMinutes(dest, catalogContext, modes),
        );
        if (!fit.eligible) return false;
        return evaluateWeekendCapacity(dest, allDestinations).eligible;
      });

      // Hub-first: primary 2D1N results are trip areas, never isolated POIs.
      if (result.length > 0) {
        const consolidated = consolidateWeekendAreas(result, allDestinations);
        weekendConsolidation = consolidated;
        result = consolidated.areas;
      }
    } else if (
      tripDuration !== "any" ||
      hasRestrictedTransportSelection(carMode, publicModes)
    ) {
      const hasOrigin = homeStationCoords || homeStationTransportZoneId;
      result = result.filter((dest) => {
        // Time at destination: use pure visit-duration matching.
        // Origin travel is evaluated separately for reachability;
        // when no origin is set, browsing stays neutral (no mode gate).
        if (!matchesVisitDuration(dest, tripDuration)) return false;
        if (!hasOrigin) return true;
        const modes = getValidModes(
          dest,
          carMode,
          publicModes,
          homeStationCoords ?? undefined,
          budgetTier,
          homeStationTransportZoneId,
        );
        return modes.length > 0;
      });
    }

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

    // 5. Filter by Walking Intensity
    if (walkingIntensity !== "all") {
      result = result.filter(
        (dest) => getWalkingIntensity(dest) === walkingIntensity,
      );
    }

    // Weekend card travel claims: only with an explicit origin, and only for
    // the consolidated primary areas.
    const weekendTravelById = new Map<
      string,
      { oneWayMinutes?: number; bestMode?: string }
    >();
    if (weekendConsolidation && homeStationCoords) {
      for (const area of result) {
        const modes = getValidModes(
          area,
          carMode,
          publicModes,
          homeStationCoords ?? undefined,
          budgetTier,
          homeStationTransportZoneId,
        );
        const estimate = estimateTripDuration(area, catalogContext, modes);
        weekendTravelById.set(area.id, {
          oneWayMinutes: estimate?.bestTravelMinutes,
          bestMode: estimate?.mode,
        });
      }
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
              ...getValidModes(
                a,
                carMode,
                publicModes,
                homeStationCoords ?? undefined,
                budgetTier,
                homeStationTransportZoneId,
              ).map((m) =>
                getAdjustedBudget(
                  a,
                  m,
                  partySize,
                  homeStationCoords ?? undefined,
                  homeStationTransportZoneId,
                ),
              ),
            ) -
            Math.min(
              ...getValidModes(
                b,
                carMode,
                publicModes,
                homeStationCoords ?? undefined,
                budgetTier,
                homeStationTransportZoneId,
              ).map((m) =>
                getAdjustedBudget(
                  b,
                  m,
                  partySize,
                  homeStationCoords ?? undefined,
                  homeStationTransportZoneId,
                ),
              ),
            )
          );
        case "travelTime":
          const getFastestTime = (dest: Destination) => {
            const times = getValidModes(
              dest,
              carMode,
              publicModes,
              homeStationCoords ?? undefined,
              budgetTier,
              homeStationTransportZoneId,
            ).map(
              (m) =>
                (dest.transportOptions?.[
                  m as keyof typeof dest.transportOptions
                ] as number) || 999,
            );
            return times.length > 0 ? Math.min(...times) : 999;
          };
          return getFastestTime(a) - getFastestTime(b);
        case "nearest": {
          if (!homeStationCoords) {
            return (
              scoreForCatalog(b, catalogContext) -
              scoreForCatalog(a, catalogContext)
            );
          }

          const distanceFromHome = (destination: Destination) =>
            destination.coordinates
              ? getDistance(
                  homeStationCoords.lat,
                  homeStationCoords.lng,
                  destination.coordinates.lat,
                  destination.coordinates.lng,
                )
              : Number.POSITIVE_INFINITY;

          return (
            distanceFromHome(a) - distanceFromHome(b) ||
            a.id.localeCompare(b.id)
          );
        }
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

    return {
      destinations: result,
      weekend: weekendConsolidation,
      weekendTravelById,
    };
  }, [
    allDestinations,
    query,
    maxBudget,
    sortBy,
    carMode,
    publicModes,
    partySize,
    budgetTier,
    tripDuration,
    tripMode,
    walkingIntensity,
    homeStationCoords,
    homeStationTransportZoneId,
    catalogContext,
    selectedRegions,
    selectedPrefectures,
    selectedCollections,
    selectedCities,
    selectedAreas,
    indoorMin,
    season,
    weather,
    vibe,
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
    setSelectedCities(defaults.selectedCities);
    setSelectedAreas(defaults.selectedAreas);
    setIndoorMin(defaults.indoorMin);
    setSeason(defaults.season);
    setMaxBudget(defaults.maxBudget);
    setSortBy(defaults.sortBy);
    setCarMode(defaults.carMode);
    setPublicModes(defaults.publicModes);
    setPartySize(defaults.partySize);
    setBudgetTier(defaults.budgetTier);
    setVibe(defaults.vibe);
    setWeather(defaults.weather);
    setTripDuration(defaults.tripDuration);
    setWalkingIntensity(defaults.walkingIntensity);
    setSuitabilities(defaults.suitabilities);
    setInterests(defaults.interests);
    setTripMode(defaults.tripMode);
    setViewMode(defaults.viewMode);
  };

  const totalPages = Math.ceil(
    filteredAndSortedDestinations.length / ITEMS_PER_PAGE,
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        title="Destinations"
        description="Find the perfect adventure across Japan. Filter by region, prefecture, collections, budget, and vibe."
        descriptionClassName="hidden sm:block"
        stackActionsOnMobile
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
        selectedCities={selectedCities}
        setSelectedCities={setSelectedCities}
        selectedAreas={selectedAreas}
        setSelectedAreas={setSelectedAreas}
        indoorMin={indoorMin}
        setIndoorMin={setIndoorMin}
        season={season}
        setSeason={setSeason}
        sortBy={sortBy}
        setSortBy={setSortBy}
        carMode={carMode}
        setCarMode={setCarMode}
        publicModes={publicModes}
        setPublicModes={setPublicModes}
        partySize={partySize}
        setPartySize={(size) => {
          setPartySize(size);
        }}
        weather={weather}
        setWeather={setWeather}
        budgetTier={budgetTier}
        setBudgetTier={(tier) => {
          setBudgetTier(tier);
          setMaxBudget(BUDGET_TIER_LIMITS[tier]);
        }}
        vibe={vibe}
        setVibe={setVibe}
        tripDuration={tripDuration}
        setTripDuration={setTripDuration}
        tripMode={tripMode}
        setTripMode={setTripMode}
        walkingIntensity={walkingIntensity}
        setWalkingIntensity={setWalkingIntensity}
        suitabilities={suitabilities}
        setSuitabilities={setSuitabilities}
        interests={interests}
        setInterests={setInterests}
        viewMode={viewMode}
        setViewMode={setViewMode}
        totalResultsCount={filteredAndSortedDestinations.length}
        onReset={resetFilters}
      />

      <div
        id="results-grid"
        className="mb-6 flex flex-wrap items-center justify-between gap-4 text-slate-600 dark:text-slate-400 font-medium scroll-mt-24"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800">
            {weekendResult
              ? t("destination.tripAreas.summary", {
                  areas: filteredAndSortedDestinations.length,
                  places: weekendResult.totalPlaceCount,
                })
              : `${filteredAndSortedDestinations.length} destination${
                  filteredAndSortedDestinations.length === 1 ? "" : "s"
                } matching`}
          </span>
        </div>
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
              .map((dest) => {
                const travel = weekendTravelById.get(dest.id);
                return (
                  <DestinationCard
                    key={dest.id}
                    destination={dest}
                    partySize={partySize}
                    carMode={carMode}
                    publicModes={publicModes}
                    weekendSummary={
                      weekendResult
                        ? {
                            placeCount:
                              weekendResult.placeCountById.get(dest.id) ?? 0,
                            capacityMinutes:
                              weekendResult.capacityMinutesById.get(dest.id) ??
                              0,
                            oneWayMinutes: travel?.oneWayMinutes,
                            bestMode: travel?.bestMode,
                          }
                        : undefined
                    }
                  />
                );
              })}
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

              <div className="flex items-center justify-center gap-1">
                {getPaginationItems(currentPage, totalPages).map(
                  (item, index) =>
                    item === "ellipsis" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="flex size-10 items-center justify-center text-slate-500"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item)}
                        aria-current={currentPage === item ? "page" : undefined}
                        className={`size-10 rounded-lg font-semibold transition-colors ${
                          currentPage === item
                            ? "bg-emerald-600 text-white"
                            : "border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {item}
                      </button>
                    ),
                )}
              </div>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
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
