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
  CalendarDays,
} from "lucide-react";
import { getPaginationItems } from "./pagination";
import { getAdjustedBudget } from "@/shared/utils/utils";
import StationInput from "@/shared/components/StationInput";
import { useWeatherContext } from "@/features/home/hooks/useWeatherContext";
import {
  deriveTripDates,
  evaluateTravelConditions,
  travelDateToDate,
} from "@/shared/services/recommendation/TravelConditions";
import {
  localizeDateConditionSummary,
  localizeTravelConditionSummary,
} from "@/shared/utils/recommendationLabels";
import type { TravelConditionEvaluation } from "@/shared/services/recommendation/TravelConditions";
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
} from "@/shared/services/recommendation/TripDurationService";
import {
  evaluateWeekendTravelFit,
  evaluateWeekendCapacity,
  weekendTravelScoreDelta,
} from "@/shared/services/recommendation/WeekendPolicy";
import {
  resolveOriginMunicipalityId,
  isOriginLocalDestination,
} from "@/shared/services/recommendation/OriginAreaService";
import {
  consolidateWeekendAreas,
  passesNoOriginWeekendGate,
  getContainedPlaces,
  type WeekendAreaConsolidation,
} from "@/shared/services/recommendation/WeekendAreaPolicy";
import {
  buildExplorerWardGroup,
  computeTokyoWardStats,
  isTokyoWardHub,
  KANTO_PREFECTURES,
  TOKYO_WARDS_DIVERSITY_BONUS_MAX,
  TOKYO_WARDS_GROUP_ID,
} from "@/shared/services/recommendation/TokyoWardsConsolidation";
import type { OriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
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
import { ALL_PUBLIC_MODES } from "@/features/home/services/TransportResolver";

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
  const [date, setDate] = useState(initialExplorerState.date);
  const query = searchQuery.toLowerCase().trim();

  // Live forecast map for the planned origin: lets a selected date use real
  // forecast data when it exists, seasonal guidance otherwise.
  const { weatherContext: explorerWeatherContext } =
    useWeatherContext(homeStationCoords);
  const forecastMap = explorerWeatherContext?.forecastMap;

  // Shared trip-date model: Day 1 + derived Day 2 for 2D1N. Omitted date
  // means no explicit date — any-date browsing is never silently "today".
  const travelDates = useMemo(() => {
    if (!date) return undefined;
    return deriveTripDates(
      date,
      tripMode === "weekend_2d1n" ? "weekend_2d1n" : "day_trip",
    );
  }, [date, tripMode]);
  const ferryTemporal = useMemo(
    () =>
      travelDates
        ? { travelDate: travelDateToDate(travelDates.day1) }
        : undefined,
    [travelDates],
  );

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
    setDate(restored.date);
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
      date,
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
    date,
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
    date,
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
    conditionById,
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

    // 0.6. Filter by City / Municipality (used by the Tokyo 23 Wards group
    // link: individual ward hubs stay browseable).
    if (selectedCities.length > 0) {
      result = result.filter(
        (dest) =>
          selectedCities.includes(dest.id) ||
          (dest.municipalityId !== undefined &&
            selectedCities.includes(dest.municipalityId)),
      );
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

    // Weekend card travel claims: only with an explicit origin, and only for
    // the consolidated primary areas.
    const weekendTravelById = new Map<
      string,
      {
        oneWayMinutes?: number;
        bestMode?: string;
        estimate?: OriginAwareTransportEstimate;
      }
    >();
    // Weekend-aware "recommended" scores for 2D1N (matches Home ranking).
    const weekendRecommendedScoreById = new Map<string, number>();
    // Forecast/seasonal/unknown condition evaluation per destination for the
    // planned dates (empty map = no explicit date selected).
    const conditionById = new Map<string, TravelConditionEvaluation>();
    const conditionFor = (dest: Destination) => {
      if (!travelDates) return undefined;
      let evaluation = conditionById.get(dest.id);
      if (!evaluation) {
        evaluation = evaluateTravelConditions(dest, travelDates, forecastMap, {
          scoreForecastDays: true,
        });
        conditionById.set(dest.id, evaluation);
      }
      return evaluation;
    };

    // Weekend mode uses its own eligibility gate instead of duration bands.
    if (tripMode === "weekend_2d1n") {
      const hasOrigin = homeStationCoords || homeStationTransportZoneId;
      // Empty transport preference means "any public transport", never
      // "ignore transport": an explicit origin still requires a known
      // origin-aware duration.
      const effectivePublicModes =
        publicModes.length > 0 ? publicModes : ALL_PUBLIC_MODES;
      result = result.filter((dest) => {
        // Origin-local destinations are never getaways (same municipality as base).
        if (isOriginLocalDestination(dest, originMunicipalityId)) return false;
        if (!hasOrigin) {
          // No-origin: no travel claims, but coherent area classification
          // and 480+ published activity minutes are still required.
          return passesNoOriginWeekendGate(dest, allDestinations);
        }
        const modes = getValidModes(
          dest,
          carMode,
          effectivePublicModes,
          homeStationCoords ?? undefined,
          budgetTier,
          homeStationTransportZoneId,
          ferryTemporal,
        );
        if (modes.length === 0) return false;
        // No origin-aware duration → excluded from personalized matching.
        const minutes = getBestOneWayTravelMinutes(dest, catalogContext, modes);
        if (minutes === undefined) return false;
        if (!evaluateWeekendTravelFit(minutes).eligible) return false;
        // Capacity is required with or without an origin.
        return evaluateWeekendCapacity(dest, allDestinations).eligible;
      });

      // Hub-first: primary 2D1N results are trip areas, never isolated POIs.
      if (result.length > 0) {
        const consolidated = consolidateWeekendAreas(result, allDestinations);
        weekendConsolidation = consolidated;
        result = consolidated.areas;

        if (homeStationCoords) {
          for (const area of result) {
            const modes = getValidModes(
              area,
              carMode,
              effectivePublicModes,
              homeStationCoords ?? undefined,
              budgetTier,
              homeStationTransportZoneId,
              ferryTemporal,
            );
            const estimate = getOriginAwareTransportEstimate(
              area,
              { homeStationCoords, ferryTemporal },
              modes,
            );
            weekendTravelById.set(area.id, {
              oneWayMinutes: estimate
                ? Math.round(
                    (estimate.timeRange[0] + estimate.timeRange[1]) / 2,
                  )
                : undefined,
              bestMode: estimate?.mode,
              estimate: estimate ?? undefined,
            });
          }
        }

        // Weekend-aware "recommended" ranking (matches the Home pipeline):
        // catalog score + weekend travel/capacity deltas. The ward group
        // then ranks as its best member plus the bounded diversity bonus
        // instead of being buried at a plain catalog-score position.
        if (sortBy === "recommended") {
          for (const area of result) {
            const base = scoreForCatalog(area, catalogContext);
            let delta = 0;
            const minutes = weekendTravelById.get(area.id)?.oneWayMinutes;
            if (minutes !== undefined) {
              delta += weekendTravelScoreDelta(
                evaluateWeekendTravelFit(minutes),
              );
            }
            if (
              evaluateWeekendCapacity(area, allDestinations).activityMinutes >=
              600
            ) {
              delta += 3;
            }
            weekendRecommendedScoreById.set(area.id, base + delta);
          }
        }

        // Conditional Tokyo 23 Wards consolidation: outside Kanto, eligible
        // ward hubs collapse into one virtual super-hub card.
        const originPrefecture = originMunicipalityId
          ?.split(":")[0]
          ?.toLowerCase();
        if (
          originPrefecture &&
          !KANTO_PREFECTURES.has(originPrefecture) &&
          // An explicit city filter (e.g. the group's own link) means the
          // user wants those specific hubs individually — do not re-group.
          selectedCities.length === 0 &&
          result.length > 0
        ) {
          const wardMembers = result.filter(isTokyoWardHub);
          if (wardMembers.length >= 2) {
            const { wardCount, memberIds, wardHubIds } = computeTokyoWardStats(
              wardMembers,
              allDestinations,
            );
            // Unique published supporting places across the members.
            const seenPlaces = new Set<string>();
            for (const member of wardMembers) {
              for (const place of getContainedPlaces(member, allDestinations)) {
                seenPlaces.add(place.id);
              }
            }
            // Fastest verified gateway estimate across the members.
            let gatewayEstimate: OriginAwareTransportEstimate | undefined;
            for (const member of wardMembers) {
              const memberEstimate = weekendTravelById.get(member.id)?.estimate;
              if (
                memberEstimate &&
                (!gatewayEstimate ||
                  memberEstimate.timeRange[0] < gatewayEstimate.timeRange[0])
              ) {
                gatewayEstimate = memberEstimate;
              }
            }
            const group = buildExplorerWardGroup({
              members: wardMembers,
              wardCount,
              wardHubIds,
              placeCount: seenPlaces.size,
              tripMode,
              gatewayEstimate,
            });
            const memberIdSet = new Set(memberIds);
            const remaining = result.filter((d) => !memberIdSet.has(d.id));
            result = [group, ...remaining];

            // The group ranks as its best member plus the bounded bonus,
            // sized by the unique ward count, never the raw hub count.
            if (sortBy === "recommended") {
              let maxMemberScore = -Infinity;
              for (const memberId of memberIdSet) {
                const memberScore = weekendRecommendedScoreById.get(memberId);
                if (memberScore !== undefined && memberScore > maxMemberScore) {
                  maxMemberScore = memberScore;
                }
              }
              if (maxMemberScore > -Infinity) {
                weekendRecommendedScoreById.set(
                  TOKYO_WARDS_GROUP_ID,
                  maxMemberScore +
                    Math.min(TOKYO_WARDS_DIVERSITY_BONUS_MAX, wardCount - 1),
                );
              }
            }

            weekendConsolidation = {
              areas: result,
              placeCountById: new Map(
                result.map((area) => [
                  area.id,
                  area.id === TOKYO_WARDS_GROUP_ID
                    ? seenPlaces.size
                    : (consolidated.placeCountById.get(area.id) ?? 0),
                ]),
              ),
              capacityMinutesById: consolidated.capacityMinutesById,
              kindById: new Map(
                result.map((area) => [
                  area.id,
                  area.id === TOKYO_WARDS_GROUP_ID
                    ? "trip_area"
                    : (consolidated.kindById.get(area.id) ?? "trip_area"),
                ]),
              ),
              totalPlaceCount: consolidated.totalPlaceCount,
            };
          }
        }
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
          ferryTemporal,
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

    // 6. Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "recommended":
          // 2D1N uses the weekend-aware score so the explorer ranks
          // consistently with the Home pipeline (and the Tokyo wards group
          // ranks as its best member, not at a plain catalog position).
          // The forecast/seasonal condition delta for the planned dates is
          // added for both modes when a date is selected.
          return (
            (weekendRecommendedScoreById.get(b.id) ??
              scoreForCatalog(b, catalogContext)) +
            (conditionFor(b)?.scoreDelta ?? 0) -
            ((weekendRecommendedScoreById.get(a.id) ??
              scoreForCatalog(a, catalogContext)) +
              (conditionFor(a)?.scoreDelta ?? 0))
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
                ferryTemporal,
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
                ferryTemporal,
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
            const modes = getValidModes(
              dest,
              carMode,
              publicModes,
              homeStationCoords ?? undefined,
              budgetTier,
              homeStationTransportZoneId,
              ferryTemporal,
            );
            if (modes.length === 0) return 999;
            // Origin-aware duration when an origin exists (never a false
            // personalized claim); neutral browsing falls back to catalogue
            // minutes for comparison only.
            const minutes = getBestOneWayTravelMinutes(
              dest,
              catalogContext,
              modes,
            );
            if (minutes !== undefined) return minutes;
            const legacyMinutes = Math.min(
              ...modes.map(
                (m) =>
                  (dest.transportOptions?.[
                    m as keyof typeof dest.transportOptions
                  ] as number) || 999,
              ),
            );
            return legacyMinutes;
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
      conditionById,
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
    travelDates,
    forecastMap,
    ferryTemporal,
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
    setDate(defaults.date);
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
        date={date}
        setDate={setDate}
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
          {travelDates && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {localizeDateConditionSummary(
                  travelDates.day2
                    ? [travelDates.day1, travelDates.day2]
                    : [travelDates.day1],
                  forecastMap,
                  locale,
                )}
              </span>
            </span>
          )}
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
                const condition = conditionById.get(dest.id);
                return (
                  <DestinationCard
                    key={dest.id}
                    destination={dest}
                    partySize={partySize}
                    carMode={carMode}
                    conditionLabel={
                      condition
                        ? localizeTravelConditionSummary(condition, locale)
                        : undefined
                    }
                    // Empty transport preference means "any public
                    // transport" — cards resolve the fastest verified mode
                    // instead of showing N/A.
                    publicModes={
                      publicModes.length > 0 ? publicModes : ALL_PUBLIC_MODES
                    }
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
