import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link, useLocation } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { addRecentlyViewedDestination } from "@/shared/hooks/useRecentlyViewedDestinations";
import { getDestination } from "@/shared/services/destination/DestinationService";
import { restorePageMeta, setPageMeta, TITLE_SUFFIX } from "@/seo/meta";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import DestinationCard from "./components/DestinationCard";
import DestinationMap from "./components/DestinationMap";
import { getCityArea } from "@/shared/data/cityAreas";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import CollectionBadge from "@/shared/components/ui/CollectionBadge";
import { getCollectionById } from "@/shared/data/collections";
import { sortCollections } from "@/shared/utils/collections";
import { getValidModes } from "@/shared/services/recommendation/RecommendationService";
import {
  getOriginAwareTransportEstimate,
  type OriginAwareTransportEstimate,
} from "@/shared/services/transport/OriginAwareTransportService";
import {
  getEligibleOriginModes,
  hasFerryRoute,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import type { TransportZoneId } from "@/shared/types/transportTopology";
import {
  calculateScore,
  isRatingVerified,
} from "@/shared/services/recommendation/RecommendationScorer";
import { createRecommendationMatch } from "@/shared/services/recommendation/RecommendationExplainability";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import {
  findNearbyCombinations,
  type DestinationCombo,
} from "@/shared/services/recommendation/DestinationCombinationService";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";
import {
  ItineraryPickerModal,
  type PendingItinerarySave,
} from "@/features/trips/components/ItineraryPickerModal";
import {
  isGroupSavedInAnyTrip,
  getTripsContainingGroup,
  getCombinationKey,
  type ItineraryGroup,
} from "@/shared/services/trips/ItineraryGroupService";
import { MarkVisitedModal } from "./components/MarkVisitedModal";
import { VisitedDateModal } from "./components/VisitedDateModal";
import { DestinationPlanningSection } from "./components/DestinationPlanningSection";
import {
  requiresOpeningHours,
  getOpeningHoursAssessment,
} from "@/shared/services/recommendation/OpeningHoursPolicy";
import { DestinationDetailsSkeleton } from "@/shared/components/ui/Skeleton";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { useDelayedSkeleton } from "@/shared/hooks/useDelayedSkeleton";
import { useDestinationRelationships } from "@/shared/hooks/useDestinationRelationships";
import {
  WalkingIntensityRow,
  WalkabilityRatingItem,
} from "./components/DestinationWalkingRatings";
import {
  ArrowLeft,
  MapPin,
  Clock,
  JapaneseYen,
  ThermometerSun,
  Heart,
  Umbrella,
  Camera,
  Coffee,
  Info,
  Utensils,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Sun,
  Train,
  TrainFront,
  Bus,
  Car,
  Ship,
  CheckCircle2,
  Share2,
  ExternalLink,
  Plus,
  Navigation,
  Scale,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Plane,
  Users,
  Leaf,
  Landmark,
  House,
  Flower2,
  Snowflake,
  Ticket,
  Timer,
  CalendarDays,
  Building2,
} from "lucide-react";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import { getFerryTransportEstimate } from "@/shared/services/transport/FerryTransportEstimator";
import {
  formatApproximateTransportTime,
  formatTransportTime,
} from "@/shared/services/transport/formatters";
import { getSafeDisplayEstimate } from "@/features/home/services/LocalDiscoveryDisplayEstimator";
import { useLocale } from "@/shared/context/LocaleContext";
import {
  getLocalizedPlace,
  isPlaceAvailableInLocale,
} from "@/shared/services/place/PlaceCatalog";
import {
  formatPlaceName,
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";
import {
  localizeRecommendationPreference,
  localizeRecommendationReason,
} from "@/shared/utils/recommendationLabels";
import { getWikimediaResponsiveImage } from "@/shared/utils/wikimediaImages";

import { toast } from "sonner";
import {
  WikipediaService,
  type WikipediaSummary,
} from "@/shared/services/wikipedia/WikipediaService";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  useWeekendWeather,
  getWeatherDescription,
} from "@/shared/hooks/useWeather";
import { budgetService } from "@/shared/services/budget/BudgetService";
import { RecommendationFeedbackControl } from "@/features/recommendations/components/RecommendationFeedbackControl";

function WeatherIcon({ type }: { type: string }) {
  if (type === "sun") return <Sun className="w-6 h-6 text-amber-500" />;
  if (type === "cloud") return <Cloud className="w-6 h-6 text-slate-500" />;
  if (type === "rain") return <CloudRain className="w-6 h-6 text-blue-500" />;
  if (type === "snow") return <CloudSnow className="w-6 h-6 text-sky-300" />;
  if (type === "storm")
    return <CloudLightning className="w-6 h-6 text-indigo-600" />;
  return <Sun className="w-6 h-6 text-amber-500" />;
}

function localizeEditorialValue(value: string, locale: "en" | "ja") {
  if (locale === "en") return value;
  return (
    {
      "Extremely easy access from central Tokyo.":
        "東京中心部からのアクセスが非常に便利です。",
      "Spring & Autumn": "春・秋",
      Spring: "春",
      Summer: "夏",
      Autumn: "秋",
      Winter: "冬",
      "Dinners with night views require booking.":
        "夜景を楽しむディナーは予約が必要です。",
      "Plenty of paid parking in Minatomirai.":
        "みなとみらいには有料駐車場が多数あります。",
      "All Year": "通年",
      "None required": "予約不要",
      "Public parking available": "公共駐車場あり",
      "No advance reservation required.": "事前予約は不要です。",
    }[value] || "情報未登録"
  );
}

const DETAIL_COPY = {
  en: {
    notFound: "Destination Not Found",
    back: "Back to Destinations",
    overview: "Overview",
    highlights: "Highlights",
    weather: "Upcoming Weekend Weather",
    parking: "Parking",
    logistics: "Logistics",
    ratings: "Detailed Ratings",
    food: "Food & Drink",
    match: "Why This Matches You",
    suggested: "Suggested Visit",
    bestSeason: "Best Season",
    nearby: "Nearby Attractions",
    reservation: "Reservation Info",
    officialWebsite: "Official Website",
    seeMore: "See all",
    showLess: "Show less",
    nearbyPlaces: "Nearby Places & Hubs",
    addToItinerary: "Add to Itinerary",
    travelTime: "Travel Time",
    comfortMetrics: "Comfort Metrics",
    experienceRatings: "Experience Ratings",
    seasonalRatings: "Seasonal Ratings",
    recommendedDuration: "Recommended Duration",
    estimated: "est.",
    tickets: "Tickets",
    localTrain: "Local Train",
    foodCafe: "Food & Cafe",
    parkingLabel: "Parking",
    transportUnavailable: "Transport estimate unavailable",
    localRouteUnverified: "Route not verified",
    ferryRouteUnestimated: "Ferry route available — time and cost unavailable",
    onsiteBudget: "On-site budget (transport excluded)",
    localAccessUnestimated:
      "Local access available — time and cost unavailable",
    costUnavailable: "Cost unavailable",
    corridorFareOnly: "Intercity fare only; local access cost is not modeled",
  },
  ja: {
    notFound: "目的地が見つかりません",
    back: "目的地一覧へ戻る",
    overview: "概要",
    highlights: "見どころ",
    weather: "今週末の天気",
    parking: "駐車場",
    logistics: "交通・行き方",
    ratings: "詳細評価",
    food: "食事・カフェ",
    match: "おすすめの理由",
    suggested: "おすすめの滞在",
    bestSeason: "ベストシーズン",
    nearby: "近くの見どころ",
    reservation: "予約情報",
    officialWebsite: "公式サイト",
    seeMore: "すべて見る",
    showLess: "閉じる",
    nearbyPlaces: "近くの場所と都市ハブ",
    addToItinerary: "旅程に追加",
    travelTime: "所要時間",
    comfortMetrics: "快適性",
    experienceRatings: "体験評価",
    seasonalRatings: "季節評価",
    recommendedDuration: "おすすめの滞在時間",
    estimated: "目安",
    tickets: "チケット",
    localTrain: "在来線",
    foodCafe: "食事・カフェ",
    parkingLabel: "駐車場",
    transportUnavailable: "交通手段の見積もりが利用できません",
    localRouteUnverified: "ルート未検証",
    ferryRouteUnestimated: "フェリー航路あり — 所要時間・料金は利用できません",
    onsiteBudget: "現地予算（往復交通費を除く）",
    localAccessUnestimated: "現地アクセスあり — 所要時間・料金は利用できません",
    costUnavailable: "料金不明",
    corridorFareOnly: "都市間交通の料金のみ（現地アクセス費は未算出）",
  },
} as const;

function comfortFieldIsDerived(
  meta:
    | {
        derivedFields?: Array<
          "heatTolerance" | "rainFriendly" | "walkingIntensity"
        >;
      }
    | undefined,
  field: "heatTolerance" | "rainFriendly" | "walkingIntensity",
): boolean {
  // Absent derivedFields = the WHOLE vector is model output (every field
  // derived); present = only the listed fields are model output. Callers
  // additionally require comfortMetadata.method === "model".
  return meta?.derivedFields === undefined
    ? true
    : meta.derivedFields.includes(field);
}

type WikipediaPanelState =
  "idle" | "loading" | "success" | "unavailable" | "error";

export default function DestinationDetails() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const copy = DETAIL_COPY[locale];
  const { id } = useParams();
  const location = useLocation();
  const navState = location.state as {
    carMode?: string;
    publicModes?: string[];
    partySize?: number;
    tripType?: string;
    budget?: number;
    /** Planned travel date (ISO) forwarded from the planner. */
    travelDate?: string;
    tripMode?: "day_trip" | "weekend_2d1n";
    accommodationAllowance?: number;
  } | null;
  const { user } = useAuth();
  const partySize =
    navState?.partySize || user?.user_metadata?.preferences?.partySize || 2;
  // Relationship-backed detail sections use a compact generated graph of
  // relationship-relevant nodes, not the nationwide summary catalogue.
  const {
    status: relationshipCatalogueStatus,
    retry: retryRelationshipCatalogue,
  } = useDestinationRelationships();
  const relationshipCatalogueReady = relationshipCatalogueStatus === "ready";
  const accommodationAllowance =
    navState?.tripMode === "weekend_2d1n"
      ? navState?.accommodationAllowance
      : undefined;
  const budgetLabel =
    locale === "ja"
      ? partySize === 1
        ? "ひとり旅予算"
        : partySize === 2
          ? "カップル予算"
          : `グループ予算（${partySize}人）`
      : partySize === 1
        ? "Solo Budget"
        : partySize === 2
          ? "Couple Budget"
          : `Group Budget (${partySize} people)`;

  const {
    isVisited,
    getVisitCount,
    homeStation,
    homeStationCoords,
    homeStationTransportZoneId,
    getDestinationRating,
    isComparing,
    toggleCompare,
    compareList,
  } = useTripStore();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [destLoading, setDestLoading] = useState(true);

  const [, setGeneratedPlan] = useState<any>(null);
  const [pendingSave, setPendingSave] = useState<PendingItinerarySave | null>(
    null,
  );
  const [markVisitedOpen, setMarkVisitedOpen] = useState(false);
  const [visitedHistoryOpen, setVisitedHistoryOpen] = useState(false);
  const [showAllTopSights, setShowAllTopSights] = useState(false);
  const [showAllNearbyHubs, setShowAllNearbyHubs] = useState(false);
  const localizedDestination = destination
    ? getLocalizedPlace(destination, locale)
    : null;

  // KAI-68: keep document title/description in sync with the active locale
  // while the details route is mounted, and restore the shell defaults on
  // unmount. Without the cleanup, navigating Home -> destination -> Home
  // leaves the destination title/description active on the Home page.
  useEffect(() => {
    if (!localizedDestination) {
      setPageMeta(`${copy.notFound}${TITLE_SUFFIX}`);
      return restorePageMeta;
    }
    setPageMeta(
      `${localizedDestination.name}${TITLE_SUFFIX}`,
      localizedDestination.description,
    );
    return restorePageMeta;
  }, [localizedDestination, copy.notFound]);

  const handleAddToItinerary = () => {
    if (!destination) return;
    setPendingSave({ type: "destination", destination });
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDestLoading(true);

    getDestination(id, locale).then((destObj: Destination | null) => {
      if (cancelled) return;
      if (!destObj) {
        setDestination(null);
        setDestLoading(false);
        return;
      }
      setDestination(
        buildRecommendationCandidate(destObj, {
          homeStationCoords,
          originZoneId: homeStationTransportZoneId,
        }),
      );
      addRecentlyViewedDestination(destObj.id);
      setDestLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, homeStationCoords, homeStationTransportZoneId, locale]);

  const [wikiSummary, setWikiSummary] = useState<WikipediaSummary | null>(null);
  const [isWikiExpanded, setIsWikiExpanded] = useState(false);
  const [isWikiLoading, setIsWikiLoading] = useState(false);
  const [wikiFetched, setWikiFetched] = useState(false);
  const [wikiPanelState, setWikiPanelState] =
    useState<WikipediaPanelState>("idle");

  useEffect(() => {
    setWikiSummary(null);
    setIsWikiExpanded(false);
    setIsWikiLoading(false);
    setWikiFetched(false);
    setWikiPanelState("idle");
  }, [destination?.id, locale]);

  const handleToggleWikipedia = async () => {
    if (isWikiExpanded && wikiPanelState !== "error") {
      setIsWikiExpanded(false);
      return;
    }

    setIsWikiExpanded(true);

    if (
      (!wikiFetched || wikiPanelState === "error") &&
      !isWikiLoading &&
      destination
    ) {
      setIsWikiLoading(true);
      setWikiPanelState("loading");
      try {
        const res = await WikipediaService.fetchSummary(destination, locale);
        setWikiSummary(res);
        setWikiPanelState(res ? "success" : "unavailable");
      } catch (err) {
        console.warn("Lazy Wikipedia fetch error:", err);
        setWikiPanelState("error");
      } finally {
        setIsWikiLoading(false);
        setWikiFetched(true);
      }
    }
  };

  const { forecast, loading } = useWeekendWeather(
    destination?.coordinates?.lat,
    destination?.coordinates?.lng,
  );

  const matchDetails = useMemo(() => {
    if (!destination) return null;
    const userPrefs = user?.user_metadata?.preferences || {};
    const tripType = navState?.tripType || "any";
    const budget = navState?.budget || userPrefs.budget || 50000;
    const carMode = navState?.carMode || userPrefs.carMode || "none";
    const publicModes = navState?.publicModes ||
      userPrefs.publicModes || ["train", "shinkansen", "bus", "flight"];
    const partySize = navState?.partySize || userPrefs.partySize || 2;

    let currentWeatherCondition = "any";
    let currentWeather: { temp: number; desc: string } | null = null;
    if (forecast && forecast.length > 0) {
      const weatherDesc = getWeatherDescription(forecast[0].weatherCode).text;
      currentWeather = {
        temp: forecast[0].maxTemp,
        desc: weatherDesc,
      };
      currentWeatherCondition = weatherDesc;
    }

    const context = {
      tripType,
      budget,
      carMode,
      publicModes,
      partySize,
      currentWeatherCondition,
      visitedIds: [],
      currentWeather,
      homeStationCoords: homeStationCoords || { lat: 35.6812, lng: 139.7671 },
      originZoneId: homeStationTransportZoneId,
    };

    const candidate = buildRecommendationCandidate(destination, context);
    const { score } = calculateScore(candidate, context);
    return createRecommendationMatch(candidate, context, score);
  }, [
    destination,
    navState,
    user,
    forecast,
    homeStationCoords,
    homeStationTransportZoneId,
  ]);

  /**
   * Planned travel date from the planner (via link state). Ferry availability
   * is evaluated against this — never the system clock.
   */
  const ferryTemporal = useMemo(() => {
    const travelDate = navState?.travelDate;
    if (!travelDate) return undefined;
    return { travelDate: new Date(`${travelDate}T12:00:00`) };
  }, [navState]);

  const flightEstimate = useMemo(() => {
    if (!destination) return null;
    return getFlightTransportEstimate(
      destination,
      homeStationCoords || undefined,
      ferryTemporal?.travelDate,
    );
  }, [destination, homeStationCoords, ferryTemporal]);

  const ferryEstimate = useMemo(() => {
    if (!destination) return null;
    return getFerryTransportEstimate(
      destination,
      homeStationCoords || undefined,
      ferryTemporal,
    );
  }, [destination, homeStationCoords, ferryTemporal]);

  const parentDestination = useMemo(() => {
    if (!relationshipCatalogueReady || !destination) return null;
    const parent =
      DestinationRelationshipService.getParentDestination(destination);
    return parent && isPlaceAvailableInLocale(parent, locale) ? parent : null;
  }, [destination, locale, relationshipCatalogueReady]);

  const featuredChildSights = useMemo(() => {
    if (!relationshipCatalogueReady || !destination) return [];
    return DestinationRelationshipService.getFeaturedChildDestinations(
      destination,
    ).filter((place) => isPlaceAvailableInLocale(place, locale));
  }, [destination, locale, relationshipCatalogueReady]);

  const childDestinations = useMemo(() => {
    if (
      !relationshipCatalogueReady ||
      !destination ||
      destination.role !== "hub"
    ) {
      return [];
    }
    return DestinationRelationshipService.getChildDestinations(
      destination.id,
    ).filter((place) => isPlaceAvailableInLocale(place, locale));
  }, [destination, locale, relationshipCatalogueReady]);

  const areaGroups = useMemo(
    () =>
      Array.from(
        childDestinations.reduce((groups, place) => {
          const key = place.areaId || "other";
          groups.set(key, [...(groups.get(key) || []), place]);
          return groups;
        }, new Map<string, Destination[]>()),
      ),
    [childDestinations],
  );

  const indoorChildren = useMemo(
    () =>
      childDestinations
        .filter((place) => (place.indoorPercent ?? 0) >= 70)
        .sort((a, b) => b.ratings.rain - a.ratings.rain)
        .slice(0, 3),
    [childDestinations],
  );

  const foodAndEveningChildren = useMemo(
    () =>
      childDestinations
        .filter((place) =>
          [...(place.categories ?? []), ...(place.tags ?? [])].some((label) =>
            /food|market|night|evening|shopping/i.test(label),
          ),
        )
        .sort((a, b) => b.ratings.food - a.ratings.food)
        .slice(0, 3),
    [childDestinations],
  );

  const halfDaySiblings = useMemo(() => {
    if (
      !relationshipCatalogueReady ||
      !destination?.relationships?.parentDestinationId
    ) {
      return [];
    }
    return DestinationRelationshipService.getChildDestinations(
      destination.relationships.parentDestinationId,
    )
      .filter(
        (place) =>
          place.id !== destination.id &&
          (place.recommendedVisitHours?.max ?? 99) <= 4 &&
          isPlaceAvailableInLocale(place, locale),
      )
      .slice(0, 3);
  }, [destination, locale, relationshipCatalogueReady]);

  const nearbyPlaces = useMemo(() => {
    if (!relationshipCatalogueReady || !destination) return [];
    return DestinationRelationshipService.getNearbyDestinations(
      destination,
    ).filter((place) => isPlaceAvailableInLocale(place, locale));
  }, [destination, locale, relationshipCatalogueReady]);

  const nearbyHubs = useMemo(() => {
    if (
      !relationshipCatalogueReady ||
      !destination ||
      destination.role !== "hub"
    ) {
      return [];
    }
    return DestinationRelationshipService.getNearbyHubs(destination, 50).filter(
      (place) => isPlaceAvailableInLocale(place, locale),
    );
  }, [destination, locale, relationshipCatalogueReady]);

  const topSightsToDisplay = showAllTopSights
    ? featuredChildSights
    : featuredChildSights.slice(0, 3);
  const nearbyHubsToDisplay = showAllNearbyHubs
    ? nearbyHubs
    : nearbyHubs.slice(0, 3);

  const originZoneIdForDisplay = useMemo(() => {
    if (!homeStationCoords) return null as TransportZoneId | null;
    return (
      homeStationTransportZoneId ??
      resolveOriginTransportZone({ coordinates: homeStationCoords })
    );
  }, [homeStationCoords, homeStationTransportZoneId]);

  const destinationZoneIdForDisplay = useMemo(
    () => (destination ? resolveDestinationTransportZone(destination) : null),
    [destination],
  );

  /** Destination declares local access modes that are not estimated. */
  const localAccessKnown = useMemo(
    () => Boolean(destination?.localAccessModes?.length),
    [destination],
  );

  /** Ferry connectivity is route-known but not estimable. */
  const ferryRouteKnown = useMemo(() => {
    if (!originZoneIdForDisplay || !destinationZoneIdForDisplay) return false;
    if (!destination) return false;
    // Only show the "route known but not estimable" message when there IS
    // connectivity but the estimator could not produce an estimate.
    if (ferryEstimate) return false;
    return hasFerryRoute(originZoneIdForDisplay, destinationZoneIdForDisplay);
  }, [
    originZoneIdForDisplay,
    destinationZoneIdForDisplay,
    destination,
    ferryEstimate,
  ]);

  const eligibleModes = useMemo(() => {
    if (!destination || !originZoneIdForDisplay || !destinationZoneIdForDisplay)
      return [] as string[];
    if (
      originZoneIdForDisplay === "unknown" ||
      destinationZoneIdForDisplay === "unknown"
    )
      return [] as string[];
    const result = getEligibleOriginModes({
      originZoneId: originZoneIdForDisplay,
      destinationZoneId: destinationZoneIdForDisplay,
      destination,
    });
    const modes =
      originZoneIdForDisplay === destinationZoneIdForDisplay
        ? result.localModes
        : result.crossZoneModes;
    const authorized = [...modes];
    if (flightEstimate) authorized.push("flight");
    if (ferryEstimate) authorized.push("ferry");
    return authorized;
  }, [
    destination,
    originZoneIdForDisplay,
    destinationZoneIdForDisplay,
    flightEstimate,
    ferryEstimate,
  ]);

  const activeModes = useMemo(() => {
    if (!destination) return null;
    if (
      navState &&
      (navState.carMode !== undefined || navState.publicModes !== undefined)
    ) {
      return getValidModes(
        destination,
        navState.carMode,
        navState.publicModes,
        homeStationCoords || undefined,
        undefined,
        homeStationTransportZoneId,
        ferryTemporal,
      );
    }
    const userPrefs = user?.user_metadata?.preferences;
    if (
      userPrefs &&
      (userPrefs.carMode !== undefined || userPrefs.publicModes !== undefined)
    ) {
      return getValidModes(
        destination,
        userPrefs.carMode,
        userPrefs.publicModes,
        homeStationCoords || undefined,
        undefined,
        homeStationTransportZoneId,
        ferryTemporal,
      );
    }
    return null;
  }, [
    destination,
    navState,
    user,
    homeStationCoords,
    homeStationTransportZoneId,
    ferryTemporal,
  ]);

  // Origin-aware ground durations: with an explicit origin, rows show the
  // canonical estimate and mark catchment-adjusted journeys as approximate;
  // without an origin they show catalogue reference values (neutral browsing
  // makes no personalized claim).
  type GroundMode = "train" | "shinkansen" | "bus" | "car" | "my_car";
  const groundEstimateFor = (
    mode: GroundMode,
  ): OriginAwareTransportEstimate | undefined => {
    if (homeStationCoords && destination) {
      return (
        getOriginAwareTransportEstimate(destination, { homeStationCoords }, [
          mode,
        ]) ?? undefined
      );
    }
    return undefined;
  };

  const groundMinutesFor = (mode: GroundMode): number | undefined => {
    const estimate = groundEstimateFor(mode);
    if (estimate) {
      return Math.round((estimate.timeRange[0] + estimate.timeRange[1]) / 2);
    }
    if (homeStationCoords && destination) return undefined;
    return destination?.transportOptions?.[mode];
  };

  const formatTravelTimeMinutes = (
    minutes: number | undefined,
    evidence?: "verified" | "estimated",
  ): string => {
    if (minutes === undefined || minutes <= 0) return "N/A";
    const prefix =
      evidence === "estimated" ? (locale === "ja" ? "約" : "~") : "";
    if (minutes < 60) return `${prefix}${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${prefix}${hours}h ${mins}m` : `${prefix}${hours}h`;
  };

  const formatGroundTime = (mode: GroundMode): string =>
    formatTravelTimeMinutes(
      groundMinutesFor(mode),
      groundEstimateFor(mode)?.evidence,
    );

  const formatGroundCost = (mode: GroundMode): string => {
    if (!destination) return copy.costUnavailable;
    const cost = budgetService.getTransportCost(
      destination,
      mode,
      partySize,
      homeStationCoords ?? undefined,
    );
    if (cost === null || !Number.isFinite(cost)) return copy.costUnavailable;
    const label =
      groundEstimateFor(mode)?.evidence === "estimated"
        ? copy.corridorFareOnly
        : copy.estimated;
    return `${label} ¥${(cost / 1000).toFixed(1)}k`;
  };

  const isModeVisible = (mode: string) => {
    // Deny-all: an empty eligible set hides every mode.
    if (eligibleModes.length === 0 || !eligibleModes.includes(mode as never)) {
      return false;
    }
    if (mode === "flight") {
      return Boolean(flightEstimate);
    }
    if (mode === "ferry") {
      return Boolean(ferryEstimate);
    }
    if (
      groundMinutesFor(
        mode as "train" | "shinkansen" | "bus" | "car" | "my_car",
      ) === undefined
    ) {
      return false;
    }
    if (!activeModes) {
      return true;
    }
    return activeModes.includes(mode);
  };

  const availableModes = useMemo(() => {
    const modes: string[] = [];
    for (const mode of eligibleModes) {
      if (mode === "flight" || mode === "ferry") {
        if (!activeModes || activeModes.includes(mode)) {
          modes.push(mode);
        }
        continue;
      }
      if (
        groundMinutesFor(
          mode as "train" | "shinkansen" | "bus" | "car" | "my_car",
        ) !== undefined &&
        (!activeModes || activeModes.includes(mode))
      ) {
        modes.push(mode);
      }
    }
    return modes;
  }, [destination, activeModes, eligibleModes, homeStationCoords]);

  // A local discovery estimate is presentation-only. It is intentionally
  // excluded from availableModes so it cannot affect transport selection,
  // budget calculations, or any recommendation decision.
  const localDisplayEstimate = useMemo(() => {
    if (!destination || !homeStationCoords || availableModes.length > 0) {
      return null;
    }
    const userPrefs = user?.user_metadata?.preferences;
    return getSafeDisplayEstimate(destination, {
      homeStationCoords,
      homeStationTransportZoneId,
      carMode: navState?.carMode ?? userPrefs?.carMode ?? "none",
      publicModes: navState?.publicModes ??
        userPrefs?.publicModes ?? ["train", "shinkansen", "bus", "flight"],
    });
  }, [
    destination,
    homeStationCoords,
    homeStationTransportZoneId,
    availableModes.length,
    navState,
    user,
  ]);

  const defaultMode = useMemo(() => {
    if (availableModes.length === 0) return null;
    const entries = availableModes.map(
      (mode) =>
        [
          mode,
          groundMinutesFor(
            mode as "train" | "shinkansen" | "bus" | "car" | "my_car",
          ) ?? 999,
        ] as [string, number],
    );
    return entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0];
  }, [destination, availableModes, homeStationCoords]);

  const [selectedTransportState, setSelectedTransport] = useState<
    string | null
  >(null);
  const selectedTransport =
    selectedTransportState && availableModes.includes(selectedTransportState)
      ? selectedTransportState
      : defaultMode;

  const nearbyCombinations = useMemo(() => {
    if (!destination) return [];
    return findNearbyCombinations(destination, undefined, 3);
  }, [destination]);

  const showSkeleton = useDelayedSkeleton(destLoading, 120);

  if (destLoading) {
    if (showSkeleton) {
      return <DestinationDetailsSkeleton />;
    }
    return null;
  }

  if (!destination) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">{copy.notFound}</h1>
        <Link to={{ pathname: "/destinations", search: location.search }}>
          <Button>{copy.back}</Button>
        </Link>
      </div>
    );
  }

  // Beta product decision (KAI-89): the overall destination score is hidden
  // from all user-facing surfaces; scoreMetadata stays internal (rubric,
  // provenance, gates) and never affects ranking. The Detailed Ratings tab
  // is the LEGACY ratings evidence family, gated by rating-vector confidence
  // (isRatingVerified), independent of the hidden overall-score state.
  const showRatingsTab = isRatingVerified(destination);
  const heroImage = getWikimediaResponsiveImage(destination.heroImage);
  return (
    <div className="bg-slate-50 dark:bg-background min-h-screen pb-20">
      {relationshipCatalogueStatus === "error" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <span>
            {locale === "ja"
              ? "周辺の目的地情報を読み込めませんでした。"
              : "Related destination information could not be loaded."}
          </span>
          <button
            type="button"
            onClick={retryRelationshipCatalogue}
            className="shrink-0 rounded-lg border border-amber-300 px-3 py-1.5 font-semibold hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
          >
            {locale === "ja" ? "再試行" : "Retry"}
          </button>
        </div>
      )}
      {/* Hero Image Header */}
      <div className="relative min-h-[380px] sm:min-h-[400px] md:min-h-[440px] w-full overflow-hidden flex flex-col justify-between">
        {/* Top Header Bar for Back & Action Buttons */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex items-center justify-between pointer-events-none bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-transparent">
          <Link
            to={{ pathname: "/destinations", search: location.search }}
            className="hidden md:inline-flex pointer-events-auto items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 text-slate-100 backdrop-blur-md border border-white/20 transition-all shadow-md"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {locale === "ja" ? "戻る" : "Back"}
          </Link>
        </div>

        <picture className="absolute inset-0 block">
          {heroImage.sources?.map((source) => (
            <source
              key={source.media}
              media={source.media}
              srcSet={source.srcSet}
              sizes={source.sizes}
            />
          ))}
          <img
            src={heroImage.src}
            srcSet={heroImage.srcSet}
            sizes={heroImage.sizes}
            alt={formatPlaceName(localizedDestination || destination, locale)}
            decoding="async"
            onError={(e) => {
              if (wikiSummary?.leadImage) {
                const image = e.currentTarget;
                image.parentElement
                  ?.querySelectorAll("source")
                  .forEach((source) => source.removeAttribute("srcset"));
                image.removeAttribute("srcset");
                image.removeAttribute("sizes");
                image.src = wikiSummary.leadImage;
              }
            }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent/20" />

        <div className="relative w-full container mx-auto px-4 pt-16 sm:pt-20 pb-6 md:pb-8 text-white z-10 mt-auto">
          {/* 1. Destination Title & Japanese Kanji */}
          <h1 className="text-2xl sm:text-4xl md:text-6xl font-extrabold tracking-tight mb-2 flex flex-wrap items-baseline gap-2.5 [text-shadow:_0_2px_8px_rgba(0,0,0,0.85)] drop-shadow-md">
            <span>
              {formatPlaceName(localizedDestination || destination, locale)}
            </span>
            {locale !== "ja" && wikiSummary?.japaneseTitle && (
              <span className="text-lg sm:text-xl md:text-3xl font-semibold text-emerald-400 font-sans tracking-wide">
                {wikiSummary.japaneseTitle}
              </span>
            )}
          </h1>

          {/* 2. Location & Parent Container Badge */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200/85 mb-3">
            {user?.user_metadata?.home_city === destination.id && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1.5 font-extrabold text-white border border-emerald-200 shadow-lg shadow-emerald-950/40">
                <House className="w-4 h-4" />{" "}
                {locale === "ja" ? "ホームシティ" : "Home City"}
              </div>
            )}
            <div className="flex items-center font-medium">
              <MapPin className="w-4 h-4 mr-1 text-emerald-400" />{" "}
              {locale === "ja"
                ? formatPrefecture(destination.prefecture, locale)
                : `${destination.prefecture}, Japan`}
            </div>

            {/* "Located In" Parent Container Badge */}
            {parentDestination && (
              <Link
                to={`/destinations/${parentDestination.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs backdrop-blur-md transition-all border border-white/20"
              >
                <MapPin className="w-3 h-3 text-emerald-400" />
                {locale === "ja" ? "所在地：" : "Located In: "}
                {getLocalizedPlace(parentDestination, locale).name}
              </Link>
            )}
          </div>

          {/* 3. Badges & Category Tags Row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge className="bg-emerald-700 hover:bg-emerald-700 border-none shrink-0 px-2.5 py-0.5 text-xs font-semibold">
              {localizePlaceLabel(destination.region, locale)}
            </Badge>
            {/* Curated Collection Badges */}
            {(() => {
              const activeCols = (destination.collections || [])
                .map((m) => getCollectionById(m.collectionId))
                .filter((c): c is Collection => Boolean(c));
              const sortedCols = sortCollections(activeCols);
              return sortedCols.map((col) => (
                <Link
                  key={col.id}
                  to={`/collections/${col.slug}`}
                  className="hidden max-w-full shrink-0 md:inline-flex"
                >
                  <CollectionBadge collection={col} size="md" variant="solid" />
                </Link>
              ));
            })()}
            {destination.tags &&
              destination.tags.map((tag) => {
                if (tag === "World's Tallest Tower") {
                  return (
                    <Badge
                      key={tag}
                      className="hidden bg-sky-600 hover:bg-sky-700 text-white font-bold border-sky-300 shadow-md shrink-0 px-2.5 py-0.5 text-xs items-center gap-1 md:inline-flex"
                    >
                      <Landmark className="w-3 h-3" />{" "}
                      {locale === "ja"
                        ? "世界一高いタワー"
                        : "World's Tallest Tower"}
                    </Badge>
                  );
                }
                if (tag === "Free Observatory") {
                  return (
                    <Badge
                      key={tag}
                      className="hidden bg-emerald-700 hover:bg-emerald-800 text-white font-bold border-emerald-300 shadow-md shrink-0 px-2.5 py-0.5 text-xs items-center gap-1 md:inline-flex"
                    >
                      <Building2 className="w-3 h-3" />{" "}
                      {locale === "ja" ? "無料展望台" : "Free Observatory"}
                    </Badge>
                  );
                }
                return null;
              })}
            {destination.categories
              ?.filter((cat) => {
                const lowerCat = cat.toLowerCase();
                return (
                  lowerCat !== "national treasure" &&
                  lowerCat !== "12 original keeps" &&
                  lowerCat !== "top 100 castle"
                );
              })
              .map((cat) => (
                <Badge
                  key={cat}
                  variant="outline"
                  className="hidden text-white border-white/20 backdrop-blur-md bg-white/10 shrink-0 px-2.5 py-0.5 text-xs font-medium md:inline-flex"
                >
                  {localizePlaceLabel(cat, locale)}
                </Badge>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary CTA: Add to Itinerary */}
            <button
              onClick={handleAddToItinerary}
              className="inline-flex w-full sm:w-auto justify-center items-center text-sm font-semibold bg-emerald-700 hover:bg-emerald-700 text-white h-10 px-4 rounded-xl transition-all active:scale-95 shadow-md"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {copy.addToItinerary}
            </button>

            <div className="flex w-full sm:w-auto items-center gap-2">
              {/* Want to Visit / Bucket List Toggle */}
              <BucketListButton
                destinationId={destination.id}
                destinationName={localizedDestination?.name || destination.name}
                variant="hero"
              />

              {/* Visited Toggle */}
              <button
                onClick={() => {
                  if (isVisited(destination.id)) {
                    setVisitedHistoryOpen(true);
                  } else {
                    setMarkVisitedOpen(true);
                  }
                }}
                aria-label={
                  isVisited(destination.id)
                    ? t("ui.manageVisitHistory")
                    : t("ui.markVisited")
                }
                title={
                  isVisited(destination.id)
                    ? `${t("ui.visited")} ${getVisitCount(destination.id)}`
                    : t("ui.markVisited")
                }
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 backdrop-blur-md border ${
                  isVisited(destination.id)
                    ? "bg-emerald-700 text-white border-emerald-400 shadow-md"
                    : "bg-white/15 hover:bg-white/25 text-slate-100 border-white/20"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>

              <span className="hidden sm:block h-6 border-l border-white/20 mx-1" />

              <div className="flex items-center gap-2 basis-full sm:basis-auto">
                {/* Symbol-Only Get Directions Button */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(homeStation)}&destination=${encodeURIComponent(destination.name + ", " + destination.prefecture + ", Japan")}&travelmode=transit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={locale === "ja" ? "ルート検索" : "Get Directions"}
                  title={locale === "ja" ? "ルート検索" : "Get Directions"}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 bg-white/15 hover:bg-white/25 text-slate-100 backdrop-blur-md border border-white/20"
                >
                  <Navigation className="w-4 h-4 text-emerald-400" />
                </a>

                {/* Symbol-Only Compare Button */}
                <button
                  onClick={() => {
                    if (
                      !isComparing(destination.id) &&
                      compareList.length >= 4
                    ) {
                      alert(
                        locale === "ja"
                          ? "一度に比較できるのは最大4件までです。"
                          : "You can only compare up to 4 destinations at a time.",
                      );
                      return;
                    }
                    toggleCompare(destination.id);
                  }}
                  aria-label={
                    isComparing(destination.id)
                      ? locale === "ja"
                        ? "比較から削除"
                        : "Remove from Compare"
                      : locale === "ja"
                        ? "比較に追加"
                        : "Add to Compare"
                  }
                  title={
                    isComparing(destination.id)
                      ? locale === "ja"
                        ? "比較から削除"
                        : "Remove from Compare"
                      : locale === "ja"
                        ? "比較に追加"
                        : "Add to Compare"
                  }
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 backdrop-blur-md border ${
                    isComparing(destination.id)
                      ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                      : "bg-white/15 hover:bg-white/25 text-slate-100 border-white/20"
                  }`}
                >
                  {isComparing(destination.id) ? (
                    <Scale className="w-4 h-4 text-white" />
                  ) : (
                    <Scale className="w-4 h-4 text-slate-100" />
                  )}
                </button>

                {/* Symbol-Only Share Button */}
                <button
                  onClick={async () => {
                    // Share the current URL — on the /ja version this is
                    // /ja/destinations/<id>, whose prerendered page carries
                    // Japanese OG/Twitter metadata for crawlers.
                    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
                    const shareName =
                      localizedDestination?.name ?? destination.name;
                    const shareData = {
                      title: shareName,
                      text:
                        locale === "ja"
                          ? `${shareName}をMegurutoで見つけよう！`
                          : `Check out ${shareName} in ${destination.prefecture}, Japan on Meguruto!`,
                      url: cleanUrl,
                    };
                    if (navigator.share) {
                      try {
                        await navigator.share(shareData);
                      } catch (err: any) {
                        if (err.name !== "AbortError") {
                          await navigator.clipboard?.writeText(cleanUrl);
                          toast.success(t("ui.linkCopied"));
                        }
                      }
                    } else {
                      await navigator.clipboard?.writeText(cleanUrl);
                      toast.success(t("ui.linkCopied"));
                    }
                  }}
                  aria-label={
                    locale === "ja" ? "目的地を共有" : "Share destination"
                  }
                  title={
                    locale === "ja" ? "目的地を共有" : t("ui.shareDestination")
                  }
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 bg-white/15 hover:bg-white/25 text-slate-100 backdrop-blur-md border border-white/20"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold tracking-tight">
                  {copy.overview}
                </h2>
                {wikiSummary && !localizedDestination?.description && (
                  <a
                    href={wikiSummary.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full font-medium"
                    title={t("destination.wikipediaAttributionTooltip", {
                      source: "Wikipedia",
                      license: "CC BY-SA 4.0",
                    })}
                  >
                    <ExternalLink className="w-3 h-3" /> Wikipedia (CC BY-SA)
                  </a>
                )}
              </div>

              {/* Primary Description */}
              {(localizedDestination?.description ||
                (locale === "en"
                  ? destination.notes
                  : destination.notesJa)) && (
                <p className="text-base text-slate-600 dark:text-slate-300 leading-7 mb-4">
                  {localizedDestination?.description ||
                    (locale === "en" ? destination.notes : destination.notesJa)}
                </p>
              )}
              {/* Read More Wikipedia Button Trigger directly below custom overview text */}
              {wikiPanelState !== "unavailable" &&
                (!wikiFetched || wikiSummary || wikiPanelState === "error") && (
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={handleToggleWikipedia}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors border border-slate-200 dark:border-slate-700"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>
                        {wikiPanelState === "error"
                          ? locale === "ja"
                            ? "再試行"
                            : "Retry"
                          : isWikiExpanded
                            ? locale === "ja"
                              ? "閉じる"
                              : "Show less"
                            : locale === "ja"
                              ? "続きを読む"
                              : "Read more"}
                      </span>
                      {isWikiExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <RecommendationFeedbackControl
                  destinationId={destination.id}
                  compact
                />
              </div>

              {/* Reassuring Beta Travel Estimate Calibration Notice */}
              {destination.travelEstimate?.confidence === "beta" && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 mb-6">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{t("destination.betaConfidenceDisclaimer")}</span>
                </div>
              )}

              {/* Wikipedia Reference Box */}
              {(isWikiExpanded || isWikiLoading || wikiSummary) && (
                <div
                  className={`grid transition-[grid-template-rows,opacity,margin-bottom] duration-200 ease-out motion-reduce:transition-none ${
                    isWikiExpanded
                      ? "grid-rows-[1fr] opacity-100 mb-6"
                      : "grid-rows-[0fr] opacity-0 mb-0 pointer-events-none"
                  }`}
                  aria-hidden={!isWikiExpanded}
                  inert={!isWikiExpanded}
                >
                  <div className="min-h-0 overflow-hidden">
                    {isWikiLoading ? (
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-300 flex items-center gap-2 animate-in fade-in duration-150 motion-reduce:animate-none">
                        <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>{t("destination.wikipediaLoading")}</span>
                      </div>
                    ) : wikiSummary ? (
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 space-y-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between font-semibold text-xs text-slate-500 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{t("destination.wikipediaSummary")}</span>
                          </div>
                          <a
                            href={wikiSummary.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                            title={t(
                              "destination.wikipediaAttributionTooltip",
                              {
                                source: "Wikipedia",
                                license: "CC BY-SA 4.0",
                              },
                            )}
                          >
                            <ExternalLink className="w-3 h-3" /> Wikipedia (CC
                            BY-SA 4.0)
                          </a>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                          {wikiSummary.extract}
                        </p>
                      </div>
                    ) : wikiPanelState === "unavailable" ? (
                      <div
                        role="status"
                        className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-300"
                      >
                        {locale === "ja"
                          ? "信頼できるWikipedia記事は見つかりませんでした。"
                          : "No trusted Wikipedia article was found for this destination."}
                      </div>
                    ) : wikiPanelState === "error" ? (
                      <div
                        role="alert"
                        className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200"
                      >
                        {locale === "ja"
                          ? "Wikipediaを読み込めませんでした。再試行してください。"
                          : "Wikipedia could not be loaded. Please retry."}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {destination.tags
                  ?.filter((tag) => tag !== "v1.9.2" && !tag.startsWith("v1."))
                  .map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      #{localizePlaceLabel(tag, locale)}
                    </Badge>
                  ))}
              </div>
            </section>

            <Tabs defaultValue="logistics" className="w-full">
              <TabsList className="w-full justify-start h-auto p-1.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl overflow-x-auto gap-1">
                <TabsTrigger
                  value="logistics"
                  className="rounded-xl py-2.5 px-5 font-bold text-xs transition-all text-slate-600 dark:text-slate-300 aria-selected:bg-white dark:aria-selected:bg-slate-900 aria-selected:text-emerald-700 dark:aria-selected:text-emerald-400 aria-selected:shadow-sm"
                >
                  {copy.logistics}
                </TabsTrigger>
                {showRatingsTab && (
                  <TabsTrigger
                    value="ratings"
                    className="rounded-xl py-2.5 px-5 font-bold text-xs transition-all text-slate-600 dark:text-slate-300 aria-selected:bg-white dark:aria-selected:bg-slate-900 aria-selected:text-emerald-700 dark:aria-selected:text-emerald-400 aria-selected:shadow-sm"
                  >
                    {copy.ratings}
                  </TabsTrigger>
                )}
                {matchDetails && (
                  <TabsTrigger
                    value="match"
                    className="rounded-xl py-2.5 px-5 font-bold text-xs transition-all text-slate-600 dark:text-slate-300 aria-selected:bg-white dark:aria-selected:bg-slate-900 aria-selected:text-emerald-700 dark:aria-selected:text-emerald-400 aria-selected:shadow-sm"
                  >
                    {copy.match}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="logistics" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-700">
                          <Clock className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white">
                          {copy.travelTime}
                        </h4>
                      </div>
                      <div className="space-y-2 flex-grow">
                        {availableModes.length === 0 &&
                          (localDisplayEstimate ? (
                            <div className="py-2 text-sm text-slate-500 dark:text-slate-300">
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {formatApproximateTransportTime(
                                  localDisplayEstimate.timeRange,
                                  locale,
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-300">
                                {copy.localRouteUnverified}
                              </div>
                            </div>
                          ) : (
                            <div className="py-2 text-sm text-slate-500 dark:text-slate-300">
                              {ferryRouteKnown
                                ? copy.ferryRouteUnestimated
                                : localAccessKnown
                                  ? copy.localAccessUnestimated
                                  : copy.transportUnavailable}
                            </div>
                          ))}
                        {isModeVisible("train") &&
                          groundMinutesFor("train") !== undefined && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Train className="w-4 h-4 mr-1.5" />{" "}
                                {locale === "ja" ? "電車" : "Train"}
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatGroundTime("train")}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatGroundCost("train")}
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("shinkansen") &&
                          groundMinutesFor("shinkansen") !== undefined && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <TrainFront className="w-4 h-4 mr-1.5" />{" "}
                                {locale === "ja" ? "新幹線" : "Shinkansen"}
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatGroundTime("shinkansen")}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatGroundCost("shinkansen")}
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("bus") &&
                          groundMinutesFor("bus") !== undefined && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Bus className="w-4 h-4 mr-1.5" />{" "}
                                {locale === "ja" ? "バス" : "Bus"}
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatGroundTime("bus")}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatGroundCost("bus")}
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("car") &&
                          groundMinutesFor("car") !== undefined && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Car className="w-4 h-4 mr-1.5" />{" "}
                                {locale === "ja" ? "レンタカー" : "Rental Car"}
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatGroundTime("car")}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatGroundCost("car")}
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("my_car") &&
                          groundMinutesFor("my_car") !== undefined && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Car className="w-4 h-4 mr-1.5" />{" "}
                                {locale === "ja" ? "マイカー" : "Personal Car"}
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatGroundTime("my_car")}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatGroundCost("my_car")}
                                </div>
                              </div>
                            </div>
                          )}
                        {ferryEstimate && isModeVisible("ferry") && (
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center">
                              <Ship className="w-4 h-4 mr-1.5 text-sky-500" />{" "}
                              {locale === "ja" ? "フェリー" : "Ferry"}
                            </span>
                            <div className="text-right">
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                <span className="truncate">
                                  {formatTransportTime(
                                    ferryEstimate.timeRange,
                                    locale,
                                  )}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500">
                                {ferryEstimate.costUnavailable ||
                                budgetService.getTransportCost(
                                  destination,
                                  "ferry",
                                  partySize,
                                  homeStationCoords ?? undefined,
                                  ferryTemporal,
                                ) === null ? (
                                  copy.costUnavailable
                                ) : (
                                  <>
                                    {copy.estimated}{" "}
                                    <JapaneseYen className="inline w-3 h-3" />
                                    {(
                                      (budgetService.getTransportCost(
                                        destination,
                                        "ferry",
                                        partySize,
                                        homeStationCoords ?? undefined,
                                        ferryTemporal,
                                      ) ?? 0) / 1000
                                    ).toFixed(1)}
                                    k
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        {flightEstimate && isModeVisible("flight") && (
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center">
                              <Plane className="w-4 h-4 mr-1.5 text-sky-500" />{" "}
                              {locale === "ja" ? "飛行機" : "Flight"}
                            </span>
                            <div className="text-right">
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {formatTransportTime(
                                  flightEstimate.timeRange,
                                  locale,
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                {flightEstimate.costUnavailable ||
                                budgetService.getTransportCost(
                                  destination,
                                  "flight",
                                  partySize,
                                  homeStationCoords ?? undefined,
                                ) === null ? (
                                  copy.costUnavailable
                                ) : (
                                  <>
                                    {copy.estimated}{" "}
                                    <JapaneseYen className="inline w-3 h-3" />
                                    {(
                                      (budgetService.getTransportCost(
                                        destination,
                                        "flight",
                                        partySize,
                                        homeStationCoords ?? undefined,
                                      ) ?? 0) / 1000
                                    ).toFixed(1)}
                                    k
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-700">
                          <JapaneseYen className="w-5 h-5" />
                        </div>
                        <div>
                          {(() => {
                            const isSelectedTransportCostUnavailable =
                              selectedTransport === null ||
                              budgetService.getTransportCost(
                                destination,
                                selectedTransport,
                                partySize,
                                homeStationCoords ?? undefined,
                                ferryTemporal,
                              ) === null;
                            const isTransportExcluded =
                              availableModes.length === 0 ||
                              isSelectedTransportCostUnavailable;
                            return (
                              <>
                                <h4 className="font-bold text-slate-900 dark:text-white leading-tight">
                                  {isTransportExcluded
                                    ? copy.onsiteBudget
                                    : budgetLabel}
                                </h4>
                                <div className="text-emerald-700 font-extrabold text-lg">
                                  <JapaneseYen className="inline w-4 h-4" />
                                  {isTransportExcluded
                                    ? (() => {
                                        const breakdown =
                                          budgetService.getEffectiveBudgetBreakdown(
                                            destination,
                                          );
                                        if (!breakdown)
                                          return copy.costUnavailable;
                                        // KAI-89: breakdown components are
                                        // per-person (incl. the on-site
                                        // local-transit allowance); scale by
                                        // partySize (legacy /2 couple-scale
                                        // removed).
                                        return Math.round(
                                          (breakdown.tickets +
                                            breakdown.food +
                                            breakdown.cafe +
                                            breakdown.transport) *
                                            partySize,
                                        ).toLocaleString();
                                      })()
                                    : (() => {
                                        const adjustedBudget =
                                          budgetService.getAdjustedBudget(
                                            destination,
                                            selectedTransport ?? "all",
                                            partySize,
                                            homeStationCoords ?? undefined,
                                            homeStationTransportZoneId,
                                            ferryTemporal,
                                          );
                                        return adjustedBudget === null
                                          ? copy.costUnavailable
                                          : adjustedBudget.toLocaleString();
                                      })()}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {availableModes.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {availableModes.map((mode) => {
                            const isSelected = selectedTransport === mode;
                            const names: Record<string, string> = {
                              train: locale === "ja" ? "電車" : "Train",
                              shinkansen:
                                locale === "ja" ? "新幹線" : "Shinkansen",
                              car:
                                locale === "ja" ? "レンタカー" : "Rental Car",
                              my_car:
                                locale === "ja" ? "マイカー" : "Personal Car",
                              bus: locale === "ja" ? "バス" : "Bus",
                              flight: locale === "ja" ? "飛行機" : "Flight",
                            };
                            return (
                              <button
                                key={mode}
                                onClick={() => setSelectedTransport(mode)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                                  isSelected
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                }`}
                              >
                                {names[mode] || mode}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {selectedTransport &&
                        (() => {
                          const breakdown =
                            budgetService.getEffectiveBudgetBreakdown(
                              destination,
                            );
                          if (!breakdown) {
                            return (
                              <div className="text-sm text-slate-500">
                                {copy.costUnavailable}
                              </div>
                            );
                          }
                          return (
                            <div className="space-y-2 mt-auto">
                              <div className="flex justify-between text-sm border-b border-slate-100 dark:border-slate-800 pb-1.5 mt-1.5 first:mt-0">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                  {selectedTransport === "train" && (
                                    <Train className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {selectedTransport === "shinkansen" && (
                                    <TrainFront className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {selectedTransport === "car" && (
                                    <Car className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {selectedTransport === "my_car" && (
                                    <Car className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {selectedTransport === "bus" && (
                                    <Bus className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {selectedTransport === "flight" && (
                                    <Plane className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {
                                    (
                                      {
                                        train: copy.localTrain,
                                        shinkansen:
                                          locale === "ja"
                                            ? "新幹線"
                                            : "Shinkansen",
                                        car:
                                          locale === "ja"
                                            ? "レンタカー・高速代"
                                            : "Rental Car & Tolls",
                                        my_car:
                                          locale === "ja"
                                            ? "マイカー (ガソリン代・高速代)"
                                            : "Personal Car (Gas & Tolls)",
                                        bus:
                                          locale === "ja"
                                            ? "高速バス"
                                            : "Highway Bus",
                                        flight:
                                          locale === "ja"
                                            ? "飛行機 (航空券・アクセス)"
                                            : "Flight (Air & Access)",
                                      } as Record<string, string>
                                    )[selectedTransport]
                                  }
                                </span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {budgetService.getTransportCost(
                                    destination,
                                    selectedTransport,
                                    partySize,
                                    homeStationCoords ?? undefined,
                                    ferryTemporal,
                                  ) === null ? (
                                    copy.costUnavailable
                                  ) : (
                                    <>
                                      <JapaneseYen className="inline w-3 h-3" />
                                      {budgetService
                                        .getTransportCost(
                                          destination,
                                          selectedTransport,
                                          partySize,
                                          homeStationCoords ?? undefined,
                                          ferryTemporal,
                                        )
                                        ?.toLocaleString()}
                                    </>
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between text-sm border-b border-slate-100 dark:border-slate-800 pb-1.5 mt-1.5">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                  <Ticket className="w-3.5 h-3.5 shrink-0" />{" "}
                                  {copy.tickets}
                                </span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  <JapaneseYen className="inline w-3 h-3" />
                                  {Math.round(
                                    breakdown.tickets * partySize,
                                  ).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                    </CardContent>
                  </Card>

                  {destination.comfort && (
                    <Card>
                      <CardContent className="p-5 flex flex-col h-full">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-700">
                            <ThermometerSun className="w-5 h-5" />
                          </div>
                          <h4 className="font-bold text-slate-900 dark:text-white">
                            {copy.comfortMetrics}
                          </h4>
                        </div>
                        <div className="space-y-2 flex-grow">
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />{" "}
                              {t("ui.heatTolerance")}
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.heatTolerance}/10
                              {destination.comfortMetadata?.method ===
                                "model" &&
                                comfortFieldIsDerived(
                                  destination.comfortMetadata,
                                  "heatTolerance",
                                ) && (
                                  <span className="ml-1 text-[10px] font-normal uppercase text-slate-500">
                                    {copy.estimated}
                                  </span>
                                )}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <Umbrella className="w-3.5 h-3.5 text-blue-500 shrink-0" />{" "}
                              {t("ui.rainFriendly")}
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.rainFriendly}/10
                              {destination.comfortMetadata?.method ===
                                "model" &&
                                comfortFieldIsDerived(
                                  destination.comfortMetadata,
                                  "rainFriendly",
                                ) && (
                                  <span className="ml-1 text-[10px] font-normal uppercase text-slate-500">
                                    {copy.estimated}
                                  </span>
                                )}
                            </span>
                          </div>
                          {(() => {
                            const walkScore =
                              destination.comfort?.walkingIntensity;
                            const walkEstimated =
                              destination.comfortMetadata?.method === "model" &&
                              comfortFieldIsDerived(
                                destination.comfortMetadata,
                                "walkingIntensity",
                              );
                            return (
                              <WalkingIntensityRow
                                intensity={walkScore}
                                estimated={walkEstimated}
                              />
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ratings" className="mt-4 space-y-4">
                {/* KAI-89 rubric v2: the legacy experience-ratings grid is a
                    separate evidence family, gated by rating-vector
                    confidence (isRatingVerified); otherwise the tab explains
                    the overall-score state. */}
                {showRatingsTab ? (
                  <>
                    {/* Experience Ratings */}
                    <Card>
                      <CardContent className="p-6">
                        <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs mb-4">
                          {copy.experienceRatings}
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <RatingItem
                            icon={Heart}
                            label={t("destination.ratings.couple")}
                            value={destination.ratings.couple}
                          />
                          {destination.ratings.family !== undefined && (
                            <RatingItem
                              icon={Users}
                              label={t("destination.ratings.family")}
                              value={destination.ratings.family}
                            />
                          )}
                          <RatingItem
                            icon={Camera}
                            label={t("destination.ratings.photography")}
                            value={destination.ratings.photography}
                          />
                          <RatingItem
                            icon={Utensils}
                            label={t("destination.ratings.food")}
                            value={destination.ratings.food}
                          />
                          <RatingItem
                            icon={JapaneseYen}
                            label={t("destination.ratings.value")}
                            value={destination.ratings.value}
                          />
                          <WalkabilityRatingItem
                            walkability={destination.ratings.walkability}
                          />
                          {destination.ratings.accessibility !== undefined && (
                            <RatingItem
                              icon={Train}
                              label={t("destination.ratings.accessibility")}
                              value={destination.ratings.accessibility}
                            />
                          )}
                          {destination.ratings.nature !== undefined && (
                            <RatingItem
                              icon={Leaf}
                              label={t("destination.ratings.nature")}
                              value={destination.ratings.nature}
                            />
                          )}
                          {destination.ratings.historyAndCulture !==
                            undefined && (
                            <RatingItem
                              icon={Landmark}
                              label={t("destination.ratings.historyCulture")}
                              value={destination.ratings.historyAndCulture}
                            />
                          )}
                          <RatingItem
                            icon={Coffee}
                            label={t("destination.ratings.relaxation")}
                            value={destination.ratings.relaxation}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Seasonal Ratings */}
                    <Card>
                      <CardContent className="p-6">
                        <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs mb-4">
                          {copy.seasonalRatings}
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {destination.ratings.spring !== undefined && (
                            <RatingItem
                              icon={Flower2}
                              label="Spring"
                              value={destination.ratings.spring}
                            />
                          )}
                          <RatingItem
                            icon={ThermometerSun}
                            label="Summer"
                            value={destination.ratings.summer}
                          />
                          {destination.ratings.autumn !== undefined && (
                            <RatingItem
                              icon={Leaf}
                              label="Autumn"
                              value={destination.ratings.autumn}
                            />
                          )}
                          <RatingItem
                            icon={Snowflake}
                            label="Winter"
                            value={destination.ratings.winter}
                          />
                          <RatingItem
                            icon={Umbrella}
                            label="Rainy Day"
                            value={destination.ratings.rain}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : null}
              </TabsContent>

              <TabsContent value="match" className="mt-4">
                {getDestinationRating(destination?.id || "") === "down" ? (
                  <Card>
                    <CardContent className="p-6 text-center text-slate-500 italic">
                      You've marked this destination as not interested.
                    </CardContent>
                  </Card>
                ) : (
                  matchDetails && (
                    <Card>
                      <CardContent className="p-6 space-y-6">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                          <div>
                            <h4 className="text-xl font-bold mb-1">
                              {t("recommendation.matchConfidence")}
                            </h4>
                            <p className="text-slate-500 dark:text-slate-300 text-sm">
                              {locale === "ja"
                                ? "現在の旅行プラン条件との適合度です。"
                                : "How well this destination fits your active planner criteria."}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-4xl font-extrabold text-emerald-500">
                              {matchDetails.confidence}%
                            </span>
                            <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
                              <div
                                className="h-full bg-emerald-700 rounded-full"
                                style={{ width: `${matchDetails.confidence}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h5 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs">
                            {t("recommendation.matchReasons")}
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {matchDetails.reasons.map((r, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800"
                              >
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold text-sm block text-slate-900 dark:text-slate-100">
                                    {
                                      localizeRecommendationReason(r, locale)
                                        .title
                                    }
                                  </span>
                                  {r.description && (
                                    <span className="text-xs text-slate-500 dark:text-slate-300">
                                      {
                                        localizeRecommendationReason(r, locale)
                                          .description
                                      }
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {matchDetails.matchedPreferences.length > 0 && (
                          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                              {t("recommendation.matchedPreferences")}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {matchDetails.matchedPreferences.map((pref) => (
                                <Badge
                                  key={pref}
                                  variant="secondary"
                                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-semibold inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" />{" "}
                                  {localizeRecommendationPreference(
                                    pref,
                                    locale,
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                )}
              </TabsContent>
            </Tabs>

            {/* Nearby Destination Combinations Section */}
            {nearbyCombinations.length > 0 && (
              <div className="mt-8 space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500 fill-amber-400/20 shrink-0" />
                    {locale === "ja"
                      ? "あわせて訪れたい周辺スポット"
                      : "Perfect Pairs & Nearby Combinations"}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
                    {locale === "ja"
                      ? `「${localizedDestination ? formatPlaceName(localizedDestination, locale) : destination.name}」とセットで楽しめる周辺のおすすめコース`
                      : `Pair ${localizedDestination ? formatPlaceName(localizedDestination, locale) : destination.name} with nearby highlights for a complete outing.`}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {nearbyCombinations.map((combo: DestinationCombo) => {
                    const secLocalized = getLocalizedPlace(
                      combo.secondary,
                      locale,
                    );
                    return (
                      <Card
                        key={combo.secondary.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-emerald-700/50 transition-all shadow-sm"
                      >
                        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <img
                              src={secLocalized.heroImage}
                              alt={secLocalized.name}
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 border border-slate-100 dark:border-slate-800"
                            />
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                                  + {combo.secondary.categories?.[0]}
                                </span>
                                {isGroupSavedInAnyTrip(
                                  getCombinationKey(
                                    combo.primary.id,
                                    combo.secondary.id,
                                  ),
                                ) && (
                                  <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 rounded-md">
                                    {locale === "ja"
                                      ? `${getTripsContainingGroup(getCombinationKey(combo.primary.id, combo.secondary.id)).length}つの旅行に保存済み`
                                      : `Saved in ${getTripsContainingGroup(getCombinationKey(combo.primary.id, combo.secondary.id)).length} ${getTripsContainingGroup(getCombinationKey(combo.primary.id, combo.secondary.id)).length === 1 ? "trip" : "trips"}`}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  {combo.interDistanceKm} km (
                                  {combo.estimatedInterTravelMinutes} min)
                                </span>
                              </div>
                              <h4 className="font-bold text-base text-slate-900 dark:text-white truncate">
                                {formatPlaceName(secLocalized, locale)}
                              </h4>
                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                {combo.explanation[locale]}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-300 pt-1">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  {locale === "ja"
                                    ? "合計所要時間: "
                                    : "Combined time: "}
                                  {combo.combinedTotalHours[0]}–
                                  {combo.combinedTotalHours[1]}h
                                </span>
                                <span>•</span>
                                <span>
                                  {locale === "ja"
                                    ? "概算合計: "
                                    : "Estimated total: "}
                                  {combo.combinedBudgetRange
                                    ? formatLocalizedJPYRange(
                                        [
                                          combo.combinedBudgetRange[0] *
                                            partySize,
                                          combo.combinedBudgetRange[1] *
                                            partySize,
                                        ],
                                        locale,
                                      )
                                    : copy.costUnavailable}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <Link
                              to={{
                                pathname: `/destinations/${combo.secondary.id}`,
                                search: location.search,
                              }}
                              className="flex-1 sm:flex-none"
                            >
                              <Button className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl min-h-[40px] px-4">
                                {locale === "ja" ? "詳細を見る" : "Explore"}
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const pairKey = getCombinationKey(
                                  combo.primary.id,
                                  combo.secondary.id,
                                );
                                const comboGroup: ItineraryGroup = {
                                  id: pairKey,
                                  type: "destination_pair",
                                  pairKey,
                                  title: {
                                    en: `${combo.primary.name} & ${combo.secondary.name}`,
                                    ja: `${combo.primary.nameJa || combo.primary.name}＆${combo.secondary.nameJa || combo.secondary.name}`,
                                  },
                                  destinations: [
                                    combo.primary,
                                    combo.secondary,
                                  ],
                                  createdAt: new Date().toISOString(),
                                };
                                setPendingSave({
                                  type: "destination_pair",
                                  group: comboGroup,
                                });
                              }}
                              className="flex-1 sm:flex-none border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs rounded-xl min-h-[40px] px-3.5"
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              {locale === "ja"
                                ? "旅程に追加"
                                : "Add to itinerary"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unified "Plan this trip" Progressive Section */}
            <div className="mt-12 space-y-6 pt-8 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    {locale === "ja" ? "旅行計画ツール" : "Planning Tools"}
                  </span>
                  <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {locale === "ja" ? "このスポットを計画" : "Plan this trip"}
                  </h3>
                </div>
              </div>

              {/* Progressive Planning Section */}
              <DestinationPlanningSection
                destination={destination}
                locale={locale}
                partySize={partySize}
                selectedTransport={selectedTransport}
                ferryTemporal={ferryTemporal}
                accommodationAllowance={accommodationAllowance}
                onPlanGenerated={setGeneratedPlan}
                onSaveToItinerary={(plan) => {
                  if (plan) {
                    setPendingSave({ type: "generated_plan", plan });
                  } else if (destination) {
                    setPendingSave({ type: "destination", destination });
                  }
                }}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {(() => {
              const notesText =
                locale === "ja"
                  ? destination.content?.ja?.notes || destination.notesJa
                  : destination.content?.en?.notes || destination.notes;
              const visibleNotes =
                notesText && !notesText.startsWith("Source-backed")
                  ? notesText
                  : null;
              const localizedVisibleNotes =
                locale === "ja" &&
                visibleNotes &&
                localizedDestination?.name &&
                destination.name
                  ? visibleNotes.replaceAll(
                      destination.name,
                      localizedDestination.name,
                    )
                  : visibleNotes;
              if (!localizedVisibleNotes) return null;
              return (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-500 dark:text-slate-300 shrink-0">
                        <Info className="w-4 h-4" />
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {localizedVisibleNotes}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Suggested Visit Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {copy.suggested}
                </h3>
                <div className="space-y-3">
                  {destination.recommendedDuration && (
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-300 shrink-0">
                        <Timer className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {copy.recommendedDuration}
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {destination.recommendedDuration}
                        </div>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const visitHours = destination.recommendedVisitHours;
                    if (
                      !visitHours ||
                      !Number.isFinite(visitHours.min) ||
                      !Number.isFinite(visitHours.max) ||
                      visitHours.min < 0 ||
                      visitHours.min > visitHours.max
                    ) {
                      return null;
                    }
                    return (
                      <div className="flex items-center gap-3">
                        <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-300 shrink-0">
                          <Timer className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {locale === "ja"
                              ? "おすすめ滞在時間"
                              : "Recommended visit"}
                          </div>
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {visitHours.min}–{visitHours.max}{" "}
                            {locale === "ja" ? "時間" : "hours"}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {destination.bestSeason && (
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-300 shrink-0">
                        <CalendarDays className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {copy.bestSeason}
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {localizeEditorialValue(
                            destination.bestSeason,
                            locale,
                          )}
                          {destination.seasonMetadata?.method === "model" && (
                            <span className="ml-1.5 text-[10px] font-normal uppercase text-slate-500">
                              {copy.estimated}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {(() => {
              const highlights =
                localizedDestination?.highlights ??
                destination.highlights ??
                [];
              if (highlights.length === 0) return null;
              return (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold mb-4">{copy.highlights}</h3>
                    <ul className="space-y-3">
                      {highlights.map((h, index) => (
                        <li
                          key={`${destination.id}-${index}`}
                          className="flex items-start"
                        >
                          <div className="min-w-6 min-h-6 bg-slate-100 dark:bg-slate-800 text-emerald-700 rounded-full flex items-center justify-center mr-3 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-slate-600 dark:text-slate-300 text-sm leading-tight">
                            {h}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })()}

            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold mb-4">{copy.weather}</h3>
                {loading || !forecast ? (
                  <div className="text-sm text-slate-500 animate-pulse flex items-center">
                    <ThermometerSun className="w-4 h-4 mr-2" />
                    {t("destination.weatherLoading")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {forecast.map((day, idx) => {
                      const dateObj = new Date(day.date);
                      const dayName = dateObj.toLocaleDateString(
                        locale === "ja" ? "ja-JP" : "en-US",
                        { weekday: "long" },
                      );
                      const desc = getWeatherDescription(day.weatherCode);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                              <WeatherIcon type={desc.icon} />
                            </div>
                            <div>
                              <div className="text-sm font-bold">{dayName}</div>
                              <div className="text-xs text-slate-500">
                                {locale === "ja"
                                  ? {
                                      Sunny: "晴れ",
                                      Cloudy: "くもり",
                                      Rain: "雨",
                                      Rainy: "雨",
                                      Thunderstorm: "雷雨",
                                      Stormy: "嵐",
                                      Snow: "雪",
                                    }[desc.text] || desc.text
                                  : desc.text}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {day.maxTemp}°
                            </div>
                            <div className="text-xs font-medium text-slate-500">
                              {day.minTemp}°
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {locale === "ja"
                    ? "基本情報・アクセス"
                    : "Practical Information"}
                </h3>

                {/* Opening Hours & Access Status */}
                {requiresOpeningHours(destination) && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {locale === "ja" ? "営業時間" : "Opening hours"}
                      </h4>
                      {(() => {
                        const assessment =
                          getOpeningHoursAssessment(destination);
                        const badgeConfigs: Record<
                          string,
                          { bg: string; labelEn: string; labelJa: string }
                        > = {
                          verified: {
                            bg: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
                            labelEn: "Verified hours",
                            labelJa: "確認済み営業時間",
                          },
                          sourced: {
                            bg: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800",
                            labelEn: "Official hours listed",
                            labelJa: "公式営業時間掲載",
                          },
                          stale: {
                            bg: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
                            labelEn: "Hours may be stale",
                            labelJa: "情報更新が必要",
                          },
                          unverified: {
                            bg: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800",
                            labelEn: "Unverified hours",
                            labelJa: "営業時間未確認",
                          },
                          not_required: {
                            bg: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700",
                            labelEn: "Open access",
                            labelJa: "散策自由",
                          },
                        };
                        const cfg =
                          badgeConfigs[assessment.status] ||
                          badgeConfigs.unverified;
                        return (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg}`}
                          >
                            {locale === "ja" ? cfg.labelJa : cfg.labelEn}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {(() => {
                        const rawHours =
                          destination.businessHours || destination.openingHours;
                        const displayHours =
                          locale === "ja"
                            ? destination.content?.ja?.openingHours ||
                              destination.openingHoursJa ||
                              (rawHours
                                ? rawHours.replace(
                                    /\(Last admission ([^)]+)\)/i,
                                    "（最終入場 $1）",
                                  )
                                : null)
                            : destination.content?.en?.openingHours || rawHours;
                        return (
                          displayHours || (
                            <span className="text-amber-600 dark:text-amber-400">
                              {locale === "ja"
                                ? "未確認（公式ウェブサイトで確認してください）"
                                : "Not yet verified — check official website before visiting"}
                            </span>
                          )
                        );
                      })()}
                    </p>
                  </div>
                )}
                {!requiresOpeningHours(destination) && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {locale === "ja" ? "アクセス状態" : "Access"}
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                        {locale === "ja" ? "散策自由" : "Open access"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {locale === "ja"
                        ? "散策自由（個別施設により営業時間が異なります）"
                        : "Open access; individual facilities may have separate hours"}
                    </p>
                  </div>
                )}

                {(locale === "en"
                  ? destination.reservation
                  : destination.content?.ja?.reservation ||
                    destination.reservationJa) && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      {copy.reservation}
                    </h4>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {locale === "ja"
                        ? destination.content?.ja?.reservation ||
                          destination.reservationJa
                        : destination.content?.en?.reservation ||
                          destination.reservation}
                    </p>
                  </div>
                )}
                {destination.placeType === "destination" &&
                  destination.officialWebsite && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {copy.officialWebsite}
                      </h4>
                      <a
                        href={destination.officialWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-300 break-all"
                      >
                        {destination.officialWebsite}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>
                  )}
                {(locale === "en"
                  ? destination.parking
                  : destination.content?.ja?.parking ||
                    destination.parkingJa) && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      {copy.parkingLabel}
                    </h4>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {locale === "ja"
                        ? destination.content?.ja?.parking ||
                          destination.parkingJa
                        : destination.content?.en?.parking ||
                          destination.parking}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Top Sights & Attractions (For City / Ward / Town Hubs) */}
        {destination.role === "hub" && featuredChildSights.length > 0 && (
          <div className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  {locale === "ja"
                    ? "おすすめの見どころ"
                    : "Featured Sights & Highlights"}
                </span>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                  <MapPin className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
                  {locale === "ja"
                    ? `${localizedDestination?.name || destination.name}の見どころ`
                    : `Top Sights in ${localizedDestination?.name || destination.name}`}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {topSightsToDisplay.map((dest: Destination) => (
                <DestinationCard
                  key={dest.id}
                  destination={dest}
                  partySize={partySize}
                  carMode={navState?.carMode || "none"}
                  publicModes={
                    navState?.publicModes || [
                      "train",
                      "shinkansen",
                      "bus",
                      "flight",
                    ]
                  }
                  activeTransportMode="all"
                />
              ))}
            </div>
            {featuredChildSights.length > 3 && (
              <Button
                variant="outline"
                onClick={() => setShowAllTopSights((value) => !value)}
              >
                {showAllTopSights
                  ? locale === "ja"
                    ? "閉じる"
                    : "Show less"
                  : locale === "ja"
                    ? `すべて見る（${featuredChildSights.length}件）`
                    : `See all (${featuredChildSights.length})`}
              </Button>
            )}
          </div>
        )}

        {destination.role === "hub" && childDestinations.length > 0 && (
          <div className="mt-16 space-y-10 border-t border-slate-200 pt-12 dark:border-slate-800">
            <div>
              <h3 className="mb-4 text-2xl font-extrabold text-slate-900 dark:text-white">
                {locale === "ja" ? "エリアから探す" : "Explore by area"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {areaGroups.map(([areaId, places]) => {
                  const area = getCityArea(areaId);
                  return (
                    <Link
                      key={areaId}
                      to={`/destinations?city=${destination.id}${area ? `&area=${area.id}` : ""}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      {area?.name[locale] ||
                        (locale === "ja" ? "その他" : "Other")}{" "}
                      · {places.length}
                    </Link>
                  );
                })}
              </div>
            </div>

            {indoorChildren.length > 0 && (
              <div>
                <h3 className="mb-5 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {locale === "ja" ? "雨の日におすすめ" : "Best for rainy days"}
                </h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {indoorChildren.map((place) => (
                    <DestinationCard
                      key={place.id}
                      destination={place}
                      partySize={partySize}
                    />
                  ))}
                </div>
              </div>
            )}

            {foodAndEveningChildren.length > 0 && (
              <div>
                <h3 className="mb-5 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {locale === "ja"
                    ? "グルメと夜の楽しみ"
                    : "Food and evening options"}
                </h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {foodAndEveningChildren.map((place) => (
                    <DestinationCard
                      key={place.id}
                      destination={place}
                      partySize={partySize}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-4 text-2xl font-extrabold text-slate-900 dark:text-white">
                {locale === "ja" ? "滞在時間から探す" : "Plan by duration"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  ["halfDay", locale === "ja" ? "半日" : "Half day"],
                  ["dayTrip", locale === "ja" ? "日帰り" : "Full day"],
                  ["weekend", locale === "ja" ? "週末" : "Weekend"],
                ].map(([duration, label]) => (
                  <Link
                    key={duration}
                    to={`/destinations?city=${destination.id}&duration=${duration}`}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            <DestinationMap
              destinations={childDestinations}
              locale={locale}
              carMode={navState?.carMode}
              publicModes={navState?.publicModes}
            />
          </div>
        )}

        {/* City hubs show nearby hubs; POIs show editorially related places and their hub. */}
        {destination.role === "hub" && nearbyHubs.length > 0 && (
          <div className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
                  {locale === "ja" ? "近くの都市ハブ" : "Nearby Hubs"}
                </h3>
                <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">
                  {locale === "ja"
                    ? "50km圏内の都市ハブ"
                    : "City hubs within 50 km."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {nearbyHubsToDisplay.map((dest: Destination) => (
                <DestinationCard
                  key={dest.id}
                  destination={dest}
                  partySize={partySize}
                  carMode={navState?.carMode || "none"}
                  publicModes={
                    navState?.publicModes || ["train", "shinkansen", "bus"]
                  }
                  activeTransportMode="all"
                />
              ))}
            </div>
            {nearbyHubs.length > 3 && (
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => setShowAllNearbyHubs((value) => !value)}
              >
                {showAllNearbyHubs
                  ? locale === "ja"
                    ? "閉じる"
                    : "Show less"
                  : locale === "ja"
                    ? `すべて見る（${nearbyHubs.length}件）`
                    : `See all (${nearbyHubs.length})`}
              </Button>
            )}
          </div>
        )}

        {destination.role !== "hub" && nearbyPlaces.length > 0 && (
          <div className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
                  {locale === "ja"
                    ? "近くの場所と都市ハブ"
                    : "Nearby Places & Hubs"}
                </h3>
                <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">
                  {locale === "ja"
                    ? `${localizedDestination?.name || destination.name}に関連する場所`
                    : `Related places for ${localizedDestination?.name || destination.name}.`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {nearbyPlaces.map((dest: Destination) => (
                <DestinationCard
                  key={dest.id}
                  destination={dest}
                  partySize={partySize}
                  carMode={navState?.carMode || "none"}
                  publicModes={
                    navState?.publicModes || ["train", "shinkansen", "bus"]
                  }
                  activeTransportMode="all"
                />
              ))}
            </div>
          </div>
        )}

        {destination.role !== "hub" && halfDaySiblings.length > 0 && (
          <div className="mt-16 border-t border-slate-200 pt-12 dark:border-slate-800">
            <h3 className="mb-6 text-2xl font-extrabold text-slate-900 dark:text-white">
              {locale === "ja"
                ? "同じ街の半日スポット"
                : "Half-day options in this city"}
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {halfDaySiblings.map((place) => (
                <DestinationCard
                  key={place.id}
                  destination={place}
                  partySize={partySize}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {destination && (
        <>
          <ItineraryPickerModal
            isOpen={pendingSave !== null}
            onClose={() => setPendingSave(null)}
            payload={pendingSave}
          />

          <MarkVisitedModal
            isOpen={markVisitedOpen}
            onClose={() => setMarkVisitedOpen(false)}
            destination={{ id: destination.id, name: destination.name }}
          />

          <VisitedDateModal
            isOpen={visitedHistoryOpen}
            onClose={() => setVisitedHistoryOpen(false)}
            destination={{ id: destination.id, name: destination.name }}
          />
        </>
      )}
    </div>
  );
}

function RatingItem({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number;
}) {
  const { locale } = useLocale();
  return (
    <div className="flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <Icon className="w-6 h-6 text-emerald-700 mb-2" />
      <span className="text-sm font-medium text-slate-500 dark:text-slate-300">
        {localizePlaceLabel(label, locale)}
      </span>
      <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">
        {value}/10
      </span>
    </div>
  );
}
