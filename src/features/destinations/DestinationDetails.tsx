import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { getDestination } from "@/shared/services/destination/DestinationService";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import DestinationCard from "./components/DestinationCard";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import CollectionBadge from "@/shared/components/ui/CollectionBadge";
import { getCollectionById } from "@/shared/data/collections";
import { sortCollections } from "@/shared/utils/collections";
import { getValidModes } from "@/shared/services/recommendation/RecommendationService";
import { calculateScore } from "@/shared/services/recommendation/RecommendationScorer";
import { createRecommendationMatch } from "@/shared/services/recommendation/RecommendationExplainability";
import { ItineraryPickerModal } from "@/features/trips/components/ItineraryPickerModal";
import { MarkVisitedModal } from "./components/MarkVisitedModal";
import { VisitedDateModal } from "./components/VisitedDateModal";
import { DestinationDetailsSkeleton } from "@/shared/components/ui/Skeleton";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { useDelayedSkeleton } from "@/shared/hooks/useDelayedSkeleton";
import {
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
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
  CheckCircle2,
  Share2,
  Copy,
  ExternalLink,
  Plus,
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
  UtensilsCrossed,
  Timer,
  CalendarDays,
  Building2,
  Footprints,
} from "lucide-react";
import { getFlightTransportEstimate } from "@/shared/services/transport/FlightTransportEstimator";
import { formatTransportTime } from "@/shared/services/transport/formatters";
import { useLocale } from "@/shared/context/LocaleContext";
import {
  getLocalizedPlace,
  isPlaceAvailableInLocale,
} from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName, formatPrefecture } from "@/shared/utils/placeLabels";

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
import {
  getDistance,
  getDynamicTransportOptions,
} from "@/shared/utils/distance";

function WeatherIcon({ type }: { type: string }) {
  if (type === "sun") return <Sun className="w-6 h-6 text-amber-500" />;
  if (type === "cloud") return <Cloud className="w-6 h-6 text-slate-400" />;
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
      "Dinners with night views require booking.":
        "夜景を楽しむディナーは予約が必要です。",
      "Plenty of paid parking in Minatomirai.":
        "みなとみらいには有料駐車場が多数あります。",
    }[value] || value
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
    overall: "Overall Score",
    suggested: "Suggested Visit",
    bestSeason: "Best Season",
    nearby: "Nearby Attractions",
    reservation: "Reservation Info",
    seeMore: "See all",
    showLess: "Show less",
    nearbyPlaces: "Nearby Places & Hubs",
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
    overall: "総合評価",
    suggested: "おすすめの滞在",
    bestSeason: "ベストシーズン",
    nearby: "近くの見どころ",
    reservation: "予約情報",
    seeMore: "すべて見る",
    showLess: "閉じる",
    nearbyPlaces: "近くの場所と都市ハブ",
  },
} as const;

export default function DestinationDetails() {
  const { locale, setLocale } = useLocale();
  const copy = DETAIL_COPY[locale];
  const { id } = useParams();
  const location = useLocation();
  const navState = location.state as {
    carMode?: string;
    publicModes?: string[];
    partySize?: number;
    tripType?: string;
    budget?: number;
  } | null;

  const { user } = useAuth();
  const partySize =
    navState?.partySize || user?.user_metadata?.preferences?.partySize || 2;
  const budgetLabel =
    partySize === 1
      ? "Solo Budget"
      : partySize === 2
        ? "Couple Budget"
        : `Group Budget (${partySize} people)`;

  const {
    isVisited,
    getVisitCount,
    homeStation,
    homeStationCoords,
    getDestinationRating,
  } = useTripStore();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [destLoading, setDestLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [markVisitedOpen, setMarkVisitedOpen] = useState(false);
  const [visitedHistoryOpen, setVisitedHistoryOpen] = useState(false);
  const [showAllTopSights, setShowAllTopSights] = useState(false);
  const [showAllNearbyHubs, setShowAllNearbyHubs] = useState(false);
  const localizedDestination = destination
    ? getLocalizedPlace(destination, locale)
    : null;

  const handleAddToItinerary = () => {
    if (!destination) return;
    setPickerOpen(true);
  };

  useEffect(() => {
    if (id) {
      setDestLoading(true);
      getDestination(id).then((destObj: Destination | null) => {
        if (!destObj) {
          setDestination(null);
          setDestLoading(false);
          return;
        }
        const dest = { ...destObj };
        if (
          homeStationCoords &&
          dest.coordinates?.lat &&
          dest.coordinates?.lng
        ) {
          const distKm = getDistance(
            homeStationCoords.lat,
            homeStationCoords.lng,
            dest.coordinates.lat,
            dest.coordinates.lng,
          );
          const hasShinkansen = Boolean(dest.transportOptions?.shinkansen);
          dest.transportOptions = getDynamicTransportOptions(
            distKm,
            hasShinkansen,
          );
        }
        setDestination(dest);
        setDestLoading(false);
      });
    }
  }, [id, homeStationCoords]);

  const [wikiSummary, setWikiSummary] = useState<WikipediaSummary | null>(null);
  const [isWikiExpanded, setIsWikiExpanded] = useState(false);
  const [isWikiLoading, setIsWikiLoading] = useState(false);
  const [wikiFetched, setWikiFetched] = useState(false);

  useEffect(() => {
    setWikiSummary(null);
    setIsWikiExpanded(false);
    setIsWikiLoading(false);
    setWikiFetched(false);
  }, [destination?.id]);

  const handleToggleWikipedia = async () => {
    if (isWikiExpanded) {
      setIsWikiExpanded(false);
      return;
    }

    setIsWikiExpanded(true);

    if (!wikiFetched && !isWikiLoading && destination) {
      setIsWikiLoading(true);
      try {
        const res = await WikipediaService.fetchSummary(
          destination.name,
          destination.prefecture,
          locale,
        );
        setWikiSummary(res);
      } catch (err) {
        console.warn("Lazy Wikipedia fetch error:", err);
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
    };

    const { score } = calculateScore(destination, context);
    return createRecommendationMatch(destination, context, score);
  }, [destination, navState, user, forecast, homeStationCoords]);

  const flightEstimate = useMemo(() => {
    if (!destination) return null;
    return getFlightTransportEstimate(
      destination,
      homeStationCoords || undefined,
    );
  }, [destination, homeStationCoords]);

  const parentDestination = useMemo(() => {
    if (!destination) return null;
    const parent =
      DestinationRelationshipService.getParentDestination(destination);
    return parent && isPlaceAvailableInLocale(parent, locale) ? parent : null;
  }, [destination, locale]);

  const featuredChildSights = useMemo(() => {
    if (!destination) return [];
    return DestinationRelationshipService.getFeaturedChildDestinations(
      destination,
    ).filter((place) => isPlaceAvailableInLocale(place, locale));
  }, [destination, locale]);

  const nearbyPlaces = useMemo(() => {
    if (!destination) return [];
    return DestinationRelationshipService.getNearbyDestinations(
      destination,
    ).filter((place) => isPlaceAvailableInLocale(place, locale));
  }, [destination, locale]);

  const nearbyHubs = useMemo(() => {
    if (!destination || destination.role !== "hub") return [];
    return DestinationRelationshipService.getNearbyHubs(destination, 50).filter(
      (place) => isPlaceAvailableInLocale(place, locale),
    );
  }, [destination, locale]);

  const topSightsToDisplay = showAllTopSights
    ? featuredChildSights
    : featuredChildSights.slice(0, 3);
  const nearbyHubsToDisplay = showAllNearbyHubs
    ? nearbyHubs
    : nearbyHubs.slice(0, 3);

  const activeModes = useMemo(() => {
    if (!destination) return null;
    if (
      navState &&
      (navState.carMode !== undefined || navState.publicModes !== undefined)
    ) {
      return getValidModes(destination, navState.carMode, navState.publicModes);
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
      );
    }
    return null;
  }, [destination, navState, user]);

  const formatTravelTimeMinutes = (minutes: number | undefined): string => {
    if (minutes === undefined || minutes <= 0) return "N/A";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const isModeVisible = (mode: string) => {
    if (mode === "flight") {
      return Boolean(flightEstimate);
    }
    if (
      !destination?.transportOptions?.[
        mode as keyof typeof destination.transportOptions
      ]
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
    if (destination?.transportOptions) {
      const allEntries = Object.entries(destination.transportOptions).filter(
        ([_, v]) => v !== undefined,
      ) as [string, number][];
      for (const [mode] of allEntries) {
        if (!activeModes || activeModes.includes(mode)) {
          modes.push(mode);
        }
      }
    }
    if (flightEstimate) {
      if (!activeModes || activeModes.includes("flight")) {
        modes.push("flight");
      }
    }
    return modes;
  }, [destination, activeModes, flightEstimate]);

  const defaultMode = useMemo(() => {
    if (!destination?.transportOptions || availableModes.length === 0)
      return "train";
    const entries = availableModes.map(
      (mode) =>
        [
          mode,
          destination.transportOptions[
            mode as keyof typeof destination.transportOptions
          ] ?? 999,
        ] as [string, number],
    );
    return entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0];
  }, [destination, availableModes]);

  const [selectedTransportState, setSelectedTransport] = useState<
    string | null
  >(null);
  const selectedTransport =
    selectedTransportState && availableModes.includes(selectedTransportState)
      ? selectedTransportState
      : defaultMode;

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

  if (!isPlaceAvailableInLocale(destination, locale)) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="mb-3 text-3xl font-extrabold text-slate-900 dark:text-white">
          この場所はまだ日本語で利用できません
        </h1>
        <p className="mb-7 text-slate-600 dark:text-slate-400">
          日本語の内容を確認・翻訳中です。英語版では現在の情報をご覧いただけます。
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => setLocale("en")}>View in English</Button>
          <Link to={{ pathname: "/destinations", search: location.search }}>
            <Button variant="outline">目的地一覧へ</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-background min-h-screen pb-20">
      {/* Hero Image Header */}
      <div className="relative min-h-[380px] sm:min-h-[400px] md:min-h-[440px] w-full overflow-hidden flex flex-col justify-between">
        {/* Top Header Bar for Back & Action Buttons */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex items-center justify-between pointer-events-none bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-transparent">
          <Link
            to={{ pathname: "/destinations", search: location.search }}
            className="pointer-events-auto inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 text-slate-100 backdrop-blur-md border border-white/20 transition-all shadow-md"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Link>
        </div>

        <img
          src={destination.heroImage}
          alt={formatPlaceName(localizedDestination || destination, locale)}
          decoding="async"
          onError={(e) => {
            if (wikiSummary?.leadImage) {
              (e.currentTarget as HTMLImageElement).src = wikiSummary.leadImage;
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
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
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 font-extrabold text-white border border-emerald-200 shadow-lg shadow-emerald-950/40">
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
                Located In: {parentDestination.name}
              </Link>
            )}
          </div>

          {/* 3. Badges & Category Tags Row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge className="bg-emerald-600 hover:bg-emerald-500 border-none shrink-0 px-2.5 py-0.5 text-xs font-semibold">
              {destination.region}
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
                  className="inline-flex shrink-0 max-w-full"
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
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold border-sky-300 shadow-md shrink-0 px-2.5 py-0.5 text-xs inline-flex items-center gap-1"
                    >
                      <Landmark className="w-3 h-3" /> World's Tallest Tower
                    </Badge>
                  );
                }
                if (tag === "Free Observatory") {
                  return (
                    <Badge
                      key={tag}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-emerald-300 shadow-md shrink-0 px-2.5 py-0.5 text-xs inline-flex items-center gap-1"
                    >
                      <Building2 className="w-3 h-3" /> Free Observatory
                    </Badge>
                  );
                }
                return null;
              })}
            {destination.categories
              .filter((cat) => {
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
                  className="text-white border-white/20 backdrop-blur-md bg-white/10 shrink-0 px-2.5 py-0.5 text-xs font-medium"
                >
                  {cat}
                </Badge>
              ))}
          </div>

          {/* Option A Action Controls: Single Primary CTA + Compact Circular Icons Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary CTA: Add to Itinerary */}
            <button
              onClick={handleAddToItinerary}
              className="inline-flex items-center text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white h-10 px-4 rounded-xl transition-all active:scale-95 shadow-md"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add to Itinerary
            </button>

            {/* Compact Circular Icon Buttons Row (40x40px) */}
            <div className="flex items-center gap-2">
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
                    ? "Manage Visit History"
                    : "Mark destination as visited"
                }
                title={
                  isVisited(destination.id)
                    ? `Visited ${getVisitCount(destination.id)} time${getVisitCount(destination.id) === 1 ? "" : "s"}`
                    : "Mark as Visited"
                }
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 backdrop-blur-md border ${
                  isVisited(destination.id)
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md"
                    : "bg-white/15 hover:bg-white/25 text-slate-100 border-white/20"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>

              {/* Symbol-Only Get Directions Button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(homeStation)}&destination=${encodeURIComponent(destination.name + ", " + destination.prefecture + ", Japan")}&travelmode=transit`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Get Directions"
                title="Get Directions"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 bg-white/15 hover:bg-white/25 text-slate-100 backdrop-blur-md border border-white/20"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
              </a>

              {/* Symbol-Only Share Button */}
              <button
                onClick={async () => {
                  const cleanUrl = `${window.location.origin}/destinations/${destination.id}`;
                  const shareData = {
                    title: destination.name,
                    text: `Check out ${destination.name} in ${destination.prefecture}, Japan on TabiMap!`,
                    url: cleanUrl,
                  };
                  if (navigator.share) {
                    try {
                      await navigator.share(shareData);
                    } catch (err: any) {
                      if (err.name !== "AbortError") {
                        await navigator.clipboard.writeText(cleanUrl);
                        toast.success("Link copied to clipboard!");
                      }
                    }
                  } else {
                    await navigator.clipboard.writeText(cleanUrl);
                    toast.success("Link copied to clipboard!");
                  }
                }}
                aria-label="Share destination"
                title="Share Destination"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 bg-white/15 hover:bg-white/25 text-slate-100 backdrop-blur-md border border-white/20"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {/* Symbol-Only Copy Link Button */}
              <button
                onClick={async () => {
                  const cleanUrl = `${window.location.origin}/destinations/${destination.id}`;
                  try {
                    await navigator.clipboard.writeText(cleanUrl);
                    toast.success("Link copied to clipboard!");
                  } catch {
                    toast.error("Failed to copy link.");
                  }
                }}
                aria-label="Copy destination link"
                title="Copy Link"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 bg-white/15 hover:bg-white/25 text-slate-100 backdrop-blur-md border border-white/20"
              >
                <Copy className="w-4 h-4" />
              </button>
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
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full font-medium"
                    title="Overview sourced from Wikipedia under CC BY-SA 4.0 License"
                  >
                    <ExternalLink className="w-3 h-3" /> Wikipedia (CC BY-SA)
                  </a>
                )}
              </div>

              {/* Primary Description */}
              {(localizedDestination?.description || destination.notes) && (
                <p className="text-base text-slate-600 dark:text-slate-300 leading-7 mb-4">
                  {localizedDestination?.description || destination.notes}
                </p>
              )}
              {/* Read More Wikipedia Button Trigger directly below custom overview text */}
              <div className="mb-5">
                <button
                  type="button"
                  onClick={handleToggleWikipedia}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors border border-slate-200 dark:border-slate-700"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>
                    {isWikiExpanded
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

              {/* Reassuring Beta Travel Estimate Calibration Notice */}
              {destination.travelEstimate?.confidence === "beta" && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 mb-6">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    Travel estimates for this region are still being refined.
                    Actual travel times may vary slightly.
                  </span>
                </div>
              )}

              {/* Wikipedia Reference Box */}
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
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 animate-in fade-in duration-150 motion-reduce:animate-none">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Loading Wikipedia summary…</span>
                    </div>
                  ) : wikiSummary ? (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between font-semibold text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Wikipedia Summary</span>
                        </div>
                        <a
                          href={wikiSummary.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Overview sourced from Wikipedia under CC BY-SA 4.0 License"
                        >
                          <ExternalLink className="w-3 h-3" /> Wikipedia (CC
                          BY-SA 4.0)
                        </a>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                        {wikiSummary.extract}
                      </p>
                    </div>
                  ) : wikiFetched ? (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 italic">
                      No additional Wikipedia article summary found for this
                      destination.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {destination.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            </section>

            <Tabs defaultValue="logistics" className="w-full">
              <TabsList className="w-full justify-start h-auto p-1 bg-white dark:bg-slate-900 border shadow-sm rounded-xl overflow-x-auto overflow-y-hidden">
                <TabsTrigger
                  value="logistics"
                  className="rounded-lg py-2.5 px-4"
                >
                  {copy.logistics}
                </TabsTrigger>
                <TabsTrigger value="ratings" className="rounded-lg py-2.5 px-4">
                  {copy.ratings}
                </TabsTrigger>
                <TabsTrigger value="food" className="rounded-lg py-2.5 px-4">
                  {copy.food}
                </TabsTrigger>
                {matchDetails && (
                  <TabsTrigger value="match" className="rounded-lg py-2.5 px-4">
                    {copy.match}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="logistics" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-600">
                          <Clock className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white">
                          Travel Time
                        </h4>
                      </div>
                      <div className="space-y-2 flex-grow">
                        {isModeVisible("train") &&
                          destination.transportOptions?.train && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Train className="w-4 h-4 mr-1.5" /> Train
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatTravelTimeMinutes(
                                    destination.transportOptions.train,
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">
                                  est. ¥
                                  {(
                                    budgetService.getTransportCost(
                                      destination,
                                      "train",
                                      partySize,
                                    ) / 1000
                                  ).toFixed(1)}
                                  k
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("shinkansen") &&
                          destination.transportOptions?.shinkansen && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <TrainFront className="w-4 h-4 mr-1.5" />{" "}
                                Shinkansen
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatTravelTimeMinutes(
                                    destination.transportOptions.shinkansen,
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">
                                  est. ¥
                                  {(
                                    budgetService.getTransportCost(
                                      destination,
                                      "shinkansen",
                                      partySize,
                                    ) / 1000
                                  ).toFixed(1)}
                                  k
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("bus") &&
                          destination.transportOptions?.bus && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Bus className="w-4 h-4 mr-1.5" /> Bus
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatTravelTimeMinutes(
                                    destination.transportOptions.bus,
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">
                                  est. ¥
                                  {(
                                    budgetService.getTransportCost(
                                      destination,
                                      "bus",
                                      partySize,
                                    ) / 1000
                                  ).toFixed(1)}
                                  k
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("car") &&
                          destination.transportOptions?.car && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Car className="w-4 h-4 mr-1.5" /> Rental Car
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatTravelTimeMinutes(
                                    destination.transportOptions.car,
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">
                                  est. ¥
                                  {(
                                    budgetService.getTransportCost(
                                      destination,
                                      "car",
                                      partySize,
                                    ) / 1000
                                  ).toFixed(1)}
                                  k
                                </div>
                              </div>
                            </div>
                          )}
                        {isModeVisible("my_car") &&
                          destination.transportOptions?.my_car && (
                            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                              <span className="text-slate-500 flex items-center">
                                <Car className="w-4 h-4 mr-1.5" /> My Car
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatTravelTimeMinutes(
                                    destination.transportOptions.my_car,
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">
                                  est. ¥
                                  {(
                                    budgetService.getTransportCost(
                                      destination,
                                      "my_car",
                                      partySize,
                                    ) / 1000
                                  ).toFixed(1)}
                                  k
                                </div>
                              </div>
                            </div>
                          )}
                        {flightEstimate && isModeVisible("flight") && (
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center">
                              <Plane className="w-4 h-4 mr-1.5 text-sky-500" />{" "}
                              Flight
                            </span>
                            <div className="text-right">
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {formatTransportTime(flightEstimate.timeRange)}
                              </div>
                              <div className="text-xs text-slate-400">
                                est. ¥
                                {(
                                  budgetService.getTransportCost(
                                    destination,
                                    "flight",
                                    partySize,
                                  ) / 1000
                                ).toFixed(1)}
                                k
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
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-600">
                          <DollarSign className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white leading-tight">
                            {budgetLabel}
                          </h4>
                          <div className="text-emerald-600 font-extrabold text-lg">
                            ¥
                            {budgetService
                              .getAdjustedBudget(
                                destination,
                                selectedTransport,
                                partySize,
                              )
                              .toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {availableModes.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {availableModes.map((mode) => {
                            const isSelected = selectedTransport === mode;
                            const names: Record<string, string> = {
                              train: "Train",
                              shinkansen: "Shinkansen",
                              car: "Rental Car",
                              my_car: "My Car",
                              bus: "Bus",
                              flight: "Flight",
                            };
                            return (
                              <button
                                key={mode}
                                onClick={() => setSelectedTransport(mode)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                                  isSelected
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                                }`}
                              >
                                {names[mode] || mode}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(() => {
                        const breakdown =
                          budgetService.getEffectiveBudgetBreakdown(
                            destination,
                          );
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
                                      train: "Local Train",
                                      shinkansen: "Shinkansen",
                                      car: "Rental Car & Tolls",
                                      my_car: "My Car (Gas & Tolls)",
                                      bus: "Highway Bus",
                                      flight: "Flight (Air & Access)",
                                    } as Record<string, string>
                                  )[selectedTransport]
                                }
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                ¥
                                {budgetService
                                  .getTransportCost(
                                    destination,
                                    selectedTransport,
                                    partySize,
                                  )
                                  .toLocaleString()}
                              </span>
                            </div>

                            <div className="flex justify-between text-sm border-b border-slate-100 dark:border-slate-800 pb-1.5 mt-1.5">
                              <span className="text-slate-500 flex items-center gap-1.5">
                                <Ticket className="w-3.5 h-3.5 shrink-0" />{" "}
                                Tickets
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                ¥
                                {Math.round(
                                  (breakdown.tickets / 2) * partySize,
                                ).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm mt-1.5">
                              <span className="text-slate-500 flex items-center gap-1.5">
                                <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />{" "}
                                Food & Cafe
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                ¥
                                {Math.round(
                                  ((breakdown.food + breakdown.cafe) / 2) *
                                    partySize,
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
                          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-600">
                            <ThermometerSun className="w-5 h-5" />
                          </div>
                          <h4 className="font-bold text-slate-900 dark:text-white">
                            Comfort Metrics
                          </h4>
                        </div>
                        <div className="space-y-2 flex-grow">
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />{" "}
                              Heat Tolerance
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.heatTolerance}/10
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <Umbrella className="w-3.5 h-3.5 text-blue-500 shrink-0" />{" "}
                              Rain Friendly
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.rainFriendly}/10
                            </span>
                          </div>
                          {(() => {
                            const walkScore =
                              destination.comfort?.walkingIntensity;
                            return (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">
                                  🚶 Walkability
                                </span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {walkScore !== undefined
                                    ? `${walkScore}/10`
                                    : "—"}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ratings" className="mt-4 space-y-4">
                {/* Experience Ratings */}
                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs mb-4">
                      Experience Ratings
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <RatingItem
                        icon={Heart}
                        label="Couple"
                        value={destination.ratings.couple}
                      />
                      {destination.ratings.family !== undefined && (
                        <RatingItem
                          icon={Users}
                          label="Family"
                          value={destination.ratings.family}
                        />
                      )}
                      <RatingItem
                        icon={Camera}
                        label="Photography"
                        value={destination.ratings.photography}
                      />
                      <RatingItem
                        icon={Utensils}
                        label="Food"
                        value={destination.ratings.food}
                      />
                      <RatingItem
                        icon={DollarSign}
                        label="Value"
                        value={destination.ratings.value}
                      />
                      <RatingItem
                        icon={Footprints}
                        label="Walkability"
                        value={
                          destination.ratings.walkability ??
                          destination.comfort?.walkingIntensity ??
                          0
                        }
                      />
                      {destination.ratings.accessibility !== undefined && (
                        <RatingItem
                          icon={Train}
                          label="Accessibility"
                          value={destination.ratings.accessibility}
                        />
                      )}
                      {destination.ratings.nature !== undefined && (
                        <RatingItem
                          icon={Leaf}
                          label="Nature"
                          value={destination.ratings.nature}
                        />
                      )}
                      {destination.ratings.historyAndCulture !== undefined && (
                        <RatingItem
                          icon={Landmark}
                          label="History & Culture"
                          value={destination.ratings.historyAndCulture}
                        />
                      )}
                      <RatingItem
                        icon={Coffee}
                        label="Relaxation"
                        value={destination.ratings.relaxation}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Seasonal Ratings */}
                <Card>
                  <CardContent className="p-6">
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs mb-4">
                      Seasonal Ratings
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
              </TabsContent>

              <TabsContent value="food" className="mt-4">
                <Card>
                  <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-bold flex items-center mb-3">
                        <Utensils className="w-4 h-4 mr-2" /> Top Restaurants
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                        {(destination.restaurants ?? []).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-bold flex items-center mb-3">
                        <Coffee className="w-4 h-4 mr-2" /> Nice Cafes
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                        {(destination.cafes ?? []).map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
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
                              Match Confidence
                            </h4>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                              How well this destination fits your active planner
                              criteria.
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-4xl font-extrabold text-emerald-500">
                              {matchDetails.confidence}%
                            </span>
                            <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${matchDetails.confidence}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h5 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs">
                            Match Reasons
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
                                    {r.title}
                                  </span>
                                  {r.description && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      {r.description}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {matchDetails.matchedPreferences.length > 0 && (
                          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                              Matched Preferences
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {matchDetails.matchedPreferences.map((pref) => (
                                <Badge
                                  key={pref}
                                  variant="secondary"
                                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-semibold inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" />{" "}
                                  {pref.charAt(0).toUpperCase() + pref.slice(1)}
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
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="bg-emerald-600 text-white border-none shadow-lg">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="text-5xl font-extrabold mb-2">
                  {destination.ratings.overall}
                </div>
                <div className="text-emerald-100 font-medium tracking-widest uppercase text-sm mb-4">
                  {copy.overall}
                </div>
                <div className="w-full h-px bg-white/20 mb-4"></div>
                <p className="text-emerald-50 text-sm">
                  {localizeEditorialValue(destination.notes, locale)}
                </p>
              </CardContent>
            </Card>

            {/* Suggested Visit Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {copy.suggested}
                </h3>
                <div className="space-y-3">
                  {destination.recommendedDuration && (
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-400 shrink-0">
                        <Timer className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Recommended Duration
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {destination.recommendedDuration}
                        </div>
                      </div>
                    </div>
                  )}
                  {destination.bestSeason && (
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-400 shrink-0">
                        <CalendarDays className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {copy.bestSeason}
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {localizeEditorialValue(
                            destination.bestSeason,
                            locale,
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-400 shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {budgetLabel}
                      </div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        ¥{(destination.budgetMin * partySize).toLocaleString()}
                        –¥
                        {(destination.budgetMax * partySize).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {nearbyPlaces.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md text-slate-500 dark:text-slate-400 shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {copy.nearby}
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {locale === "ja"
                            ? `${nearbyPlaces.length}件の関連スポット`
                            : `${nearbyPlaces.length} related places`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold mb-4">{copy.highlights}</h3>
                <ul className="space-y-3">
                  {(
                    localizedDestination?.highlights ??
                    destination.highlights ??
                    []
                  ).map((h) => (
                    <li key={h} className="flex items-start">
                      <div className="min-w-6 min-h-6 bg-slate-100 dark:bg-slate-800 text-emerald-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
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

            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold mb-4">{copy.weather}</h3>
                {loading || !forecast ? (
                  <div className="text-sm text-slate-500 animate-pulse flex items-center">
                    <ThermometerSun className="w-4 h-4 mr-2" /> Fetching
                    forecast...
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
                            <div className="text-xs font-medium text-slate-400">
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
                {destination.reservation && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      {copy.reservation}
                    </h4>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {localizeEditorialValue(destination.reservation, locale)}
                    </p>
                  </div>
                )}
                {destination.parking && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Parking
                    </h4>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {localizeEditorialValue(destination.parking, locale)}
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
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {locale === "ja"
                    ? "おすすめの見どころ"
                    : "Featured Sights & Highlights"}
                </span>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                  <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
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

        {/* City hubs show nearby hubs; POIs show editorially related places and their hub. */}
        {destination.role === "hub" && nearbyHubs.length > 0 && (
          <div className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  {locale === "ja" ? "近くの都市ハブ" : "Nearby Hubs"}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
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
                  <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  {locale === "ja"
                    ? "近くの場所と都市ハブ"
                    : "Nearby Places & Hubs"}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
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
      </div>

      {destination && (
        <>
          <ItineraryPickerModal
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            destination={{ id: destination.id, name: destination.name }}
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
  return (
    <div className="flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <Icon className="w-6 h-6 text-emerald-600 mb-2" />
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">
        {value}/10
      </span>
    </div>
  );
}
