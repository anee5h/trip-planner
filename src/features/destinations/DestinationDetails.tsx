import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { getDestination } from "@/shared/services/destination/DestinationService";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import destinationsData from "@/shared/data/destinations-index.json";
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
import {
  Skeleton,
  DestinationDetailsSkeleton,
} from "@/shared/components/ui/Skeleton";
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
} from "lucide-react";
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

export default function DestinationDetails() {
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
      userPrefs.publicModes || ["train"];
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

  const nearbyDestinations = useMemo(() => {
    if (!destination?.coordinates) return [];
    const all = destinationsData as Destination[];
    return all
      .filter(
        (d: Destination) => d.id !== destination.id && Boolean(d.coordinates),
      )
      .map((d: Destination) => ({
        destination: d,
        distance: getDistance(
          destination.coordinates!.lat,
          destination.coordinates!.lng,
          d.coordinates!.lat,
          d.coordinates!.lng,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((item) => item.destination);
  }, [destination]);

  const parentDestination = useMemo(() => {
    if (!destination) return null;
    return DestinationRelationshipService.getParentDestination(destination);
  }, [destination]);

  const featuredChildSights = useMemo(() => {
    if (!destination) return [];
    return DestinationRelationshipService.getFeaturedChildDestinations(
      destination,
    );
  }, [destination]);

  const graphNearbyDestinations = useMemo(() => {
    if (!destination) return [];
    const graphNearby =
      DestinationRelationshipService.getNearbyDestinations(destination);
    if (graphNearby.length > 0) return graphNearby;
    return nearbyDestinations;
  }, [destination, nearbyDestinations]);

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

  const isModeVisible = (mode: string) => {
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
    if (!destination?.transportOptions) return [];
    const allEntries = Object.entries(destination.transportOptions).filter(
      ([_, v]) => v !== undefined,
    ) as [string, number][];

    if (!activeModes) {
      return allEntries.map(([mode]) => mode);
    }
    return allEntries
      .map(([mode]) => mode)
      .filter((mode) => activeModes.includes(mode));
  }, [destination, activeModes]);

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
        <h1 className="text-3xl font-bold mb-4">Destination Not Found</h1>
        <Link to="/destinations">
          <Button>Back to Destinations</Button>
        </Link>
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
            to="/destinations"
            className="pointer-events-auto inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 text-slate-100 backdrop-blur-md border border-white/20 transition-all shadow-md"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Link>
        </div>

        <img
          src={destination.heroImage}
          alt={destination.name}
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
            <span>{destination.name}</span>
            {wikiSummary?.japaneseTitle && (
              <span className="text-lg sm:text-xl md:text-3xl font-semibold text-emerald-400 font-sans tracking-wide">
                {wikiSummary.japaneseTitle}
              </span>
            )}
          </h1>

          {/* 2. Location & Parent Container Badge */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200/85 mb-3">
            <div className="flex items-center font-medium">
              <MapPin className="w-4 h-4 mr-1 text-emerald-400" />{" "}
              {destination.prefecture}, Japan
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
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold border-sky-300 shadow-md shrink-0 px-2.5 py-0.5 text-xs"
                    >
                      🗼 World's Tallest Tower
                    </Badge>
                  );
                }
                if (tag === "Free Observatory") {
                  return (
                    <Badge
                      key={tag}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-emerald-300 shadow-md shrink-0 px-2.5 py-0.5 text-xs"
                    >
                      🏙️ Free Observatory
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
                destinationName={destination.name}
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
                <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
                {wikiSummary && !destination.description && (
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
              {(destination.description || destination.notes) && (
                <p className="text-base text-slate-600 dark:text-slate-300 leading-7 mb-4">
                  {destination.description || destination.notes}
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
                    {isWikiExpanded ? "Show less" : "Read More (Wikipedia)"}
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

              {/* Wikipedia Reference Box (Opened ONLY when Read More is clicked) */}
              {isWikiExpanded && (
                <div className="mb-6">
                  {isWikiLoading ? (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60 space-y-3 animate-pulse">
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                        <Skeleton className="h-4 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
                        <Skeleton className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                      </div>
                      <div className="space-y-2 pt-1">
                        <Skeleton className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                        <Skeleton className="h-3 w-5/6 bg-slate-200 dark:bg-slate-700 rounded" />
                        <Skeleton className="h-3 w-4/6 bg-slate-200 dark:bg-slate-700 rounded" />
                      </div>
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
              )}

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
                  Logistics
                </TabsTrigger>
                <TabsTrigger value="ratings" className="rounded-lg py-2.5 px-4">
                  Detailed Ratings
                </TabsTrigger>
                <TabsTrigger
                  value="itinerary"
                  className="rounded-lg py-2.5 px-4"
                >
                  Sample Itinerary
                </TabsTrigger>
                <TabsTrigger value="food" className="rounded-lg py-2.5 px-4">
                  Food & Drink
                </TabsTrigger>
                {matchDetails && (
                  <TabsTrigger value="match" className="rounded-lg py-2.5 px-4">
                    Why This Matches You
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
                                  {destination.transportOptions.train}m
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
                                  {destination.transportOptions.shinkansen}m
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
                                  {destination.transportOptions.bus}m
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
                                  {destination.transportOptions.car}m
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
                                  {destination.transportOptions.my_car}m
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
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">👣 Walk</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            ~{((destination.walkingMin ?? 0) / 1000).toFixed(1)}
                            k steps
                          </span>
                        </div>
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
                              <span className="text-slate-500">
                                {
                                  (
                                    {
                                      train: "🚆 Local Train",
                                      shinkansen: "🚄 Shinkansen",
                                      car: "🚗 Rental Car & Tolls",
                                      my_car: "🚗 My Car (Gas & Tolls)",
                                      bus: "🚌 Highway Bus",
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
                              <span className="text-slate-500">🎟 Tickets</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                ¥
                                {Math.round(
                                  (breakdown.tickets / 2) * partySize,
                                ).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm mt-1.5">
                              <span className="text-slate-500">
                                🍜 Food & Cafe
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
                            <span className="text-slate-500">
                              ☀️ Heat Tolerance
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.heatTolerance}/10
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-slate-500">
                              ☔ Rain Friendly
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.rainFriendly}/10
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">
                              🚶 Walk Intensity
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {destination.comfort.walkingIntensity}/10
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ratings" className="mt-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      <RatingItem
                        icon={Heart}
                        label="Couple"
                        value={destination.ratings.couple}
                      />
                      <RatingItem
                        icon={ThermometerSun}
                        label="Summer"
                        value={destination.ratings.summer}
                      />
                      <RatingItem
                        icon={Umbrella}
                        label="Rain"
                        value={destination.ratings.rain}
                      />
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
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="itinerary" className="mt-6 space-y-8">
                {destination.itineraries && destination.itineraries.length > 0
                  ? destination.itineraries.map((plan, planIdx) => (
                      <div
                        key={planIdx}
                        className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-100 dark:border-slate-800"
                      >
                        <h3 className="text-xl font-bold mb-2 text-emerald-600 dark:text-emerald-400">
                          {plan.name}
                        </h3>
                        <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">
                          {plan.description}
                        </p>
                        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                          {plan.steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                            >
                              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold text-xs shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                {idx + 1}
                              </div>
                              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-bold text-slate-900 dark:text-slate-100">
                                    {step.time}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                  {step.activity}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  : null}
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
                                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-semibold"
                                >
                                  ✓{" "}
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
                  Overall Score
                </div>
                <div className="w-full h-px bg-white/20 mb-4"></div>
                <p className="text-emerald-50 text-sm">{destination.notes}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold mb-4">Highlights</h3>
                <ul className="space-y-3">
                  {(destination.highlights ?? []).map((h) => (
                    <li key={h} className="flex items-start">
                      <div className="min-w-6 min-h-6 bg-slate-100 dark:bg-slate-800 text-emerald-600 rounded-full flex items-center justify-center mr-3 mt-0.5 text-xs font-bold">
                        ✓
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
                <h3 className="font-bold mb-4">Upcoming Weekend Weather</h3>
                {loading || !forecast ? (
                  <div className="text-sm text-slate-500 animate-pulse flex items-center">
                    <ThermometerSun className="w-4 h-4 mr-2" /> Fetching
                    forecast...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {forecast.map((day, idx) => {
                      const dateObj = new Date(day.date);
                      const dayName =
                        dateObj.getDay() === 6 ? "Saturday" : "Sunday";
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
                                {desc.text}
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
                      Reservation Info
                    </h4>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {destination.reservation}
                    </p>
                  </div>
                )}
                {destination.parking && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Parking
                    </h4>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {destination.parking}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Top Sights & Attractions (For City / Ward / Town Hubs) */}
        {featuredChildSights.length > 0 && (
          <div className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Featured Sights & Highlights
                </span>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                  <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  Top Sights in {destination.name}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredChildSights.map((dest: Destination) => (
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

        {/* Nearby Destinations Section */}
        {graphNearbyDestinations.length > 0 && (
          <div className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  Nearby Destinations & Hubs
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  Other great places to visit close to {destination.name}.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {graphNearbyDestinations.map((dest: Destination) => (
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
