import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { ItineraryPickerModal } from "@/features/trips/components/ItineraryPickerModal";
import { MarkVisitedModal } from "./MarkVisitedModal";
import { VisitedDateModal } from "./VisitedDateModal";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import CollectionBadge from "@/shared/components/ui/CollectionBadge";
import { getCollectionById } from "@/shared/data/collections";
import { sortCollections } from "@/shared/utils/collections";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  MapPin,
  Train,
  TrainFront,
  Bus,
  Car,
  Plane,
  JapaneseYen,
  Bookmark,
  CheckCircle2,
  PlusSquare,
  CheckSquare,
  Sun,
  Plus,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getAdjustedBudget } from "@/shared/utils/utils";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import { formatTransportTime } from "@/shared/services/transport/formatters";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import {
  formatPlaceName,
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";
import { localizeRecommendationReason } from "@/shared/utils/recommendationLabels";

interface DestinationCardProps {
  destination: Destination;
  rank?: number;
  /** Retained for existing recommendation callers; cards now display the fastest preferred mode. */
  activeTransportMode?: string;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
}

export default function DestinationCard({
  destination,
  rank,
  partySize = 2,
  carMode,
  publicModes,
}: DestinationCardProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const localizedDestination = getLocalizedPlace(destination, locale);
  const location = useLocation();
  const {
    isVisited,
    isComparing,
    toggleCompare,
    compareList,
    getDestinationRating,
    setDestinationRating,
    homeStationCoords,
  } = useTripStore();
  const visited = isVisited(destination.id);
  const comparing = isComparing(destination.id);
  const rating = getDestinationRating(destination.id);
  const cardCopy =
    locale === "ja"
      ? {
          match: "マッチ度",
          why: "あなたにおすすめの理由",
          explore: "詳しく見る",
          add: "旅程に追加",
          compare: "比較に追加",
          removeCompare: "比較から削除",
        }
      : {
          match: "Match Confidence",
          why: "Why this matches you:",
          explore: "Explore",
          add: "Add to Itinerary",
          compare: "Add to Compare",
          removeCompare: "Remove from Compare",
        };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [markVisitedOpen, setMarkVisitedOpen] = useState(false);
  const [visitedHistoryOpen, setVisitedHistoryOpen] = useState(false);

  const handleAddToItinerary = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPickerOpen(true);
  };

  const handleVisitedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (visited) {
      setVisitedHistoryOpen(true);
    } else {
      setMarkVisitedOpen(true);
    }
  };

  const linkState =
    carMode !== undefined || publicModes !== undefined
      ? { carMode, publicModes }
      : undefined;

  const activeCollections = (destination.collections || [])
    .map((m) => getCollectionById(m.collectionId))
    .filter((c): c is Collection => Boolean(c));

  const sortedCollections = sortCollections(activeCollections);
  const visibleCollections = sortedCollections.slice(0, 3);
  const overflowCount = sortedCollections.length - visibleCollections.length;
  const preferredTransport = getFastestPreferredTransport(
    destination,
    carMode,
    publicModes,
    partySize,
    homeStationCoords ?? undefined,
  );

  return (
    <Card className="overflow-hidden flex flex-col h-full group rounded-card shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-300 border-slate-200 dark:border-slate-800">
      <div className="relative h-60 sm:h-64 aspect-[16/10] overflow-hidden">
        <LazyImage
          src={localizedDestination.heroImage}
          alt={localizedDestination.name}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ${visited ? "grayscale opacity-80" : ""}`}
        />
        {visited && (
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
            <Badge className="bg-emerald-500/90 text-white text-sm py-1.5 px-3 border-none shadow-lg">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Already Visited
            </Badge>
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2 flex-wrap z-20 max-w-[85%] items-center">
          {rank !== undefined && (
            <Badge className="bg-slate-900/90 dark:bg-white text-white dark:text-slate-950 font-black text-xs sm:text-sm py-1 px-2.5 backdrop-blur-md border border-white/20 shadow-md">
              #{rank}
            </Badge>
          )}
          {destination.kind && (
            <Badge className="bg-emerald-600/90 text-white font-extrabold capitalize backdrop-blur-md border border-white/20 shadow-md">
              {destination.kind}
            </Badge>
          )}
          {destination.tags.slice(0, 1).map((tag) => {
            let badgeStyle =
              "bg-slate-900/70 hover:bg-slate-900 text-white backdrop-blur-md border border-white/20";
            if (tag === "12 Original Keeps") {
              badgeStyle =
                "bg-amber-500 hover:bg-amber-600 text-white border-amber-300 font-bold shadow-md";
            } else if (tag === "World's Tallest Tower") {
              badgeStyle =
                "bg-sky-600 hover:bg-sky-700 text-white border-sky-300 font-bold shadow-md";
            } else if (tag === "Top 100 Castle") {
              badgeStyle =
                "bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold border-amber-300 shadow-md";
            } else if (tag === "Free Observatory") {
              badgeStyle =
                "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-300 font-bold shadow-md";
            }

            return (
              <Badge key={tag} className={badgeStyle}>
                {tag}
              </Badge>
            );
          })}
        </div>
        <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
          <button
            onClick={handleAddToItinerary}
            aria-label={cardCopy.add}
            className="p-2 bg-white/70 hover:bg-white backdrop-blur-sm rounded-full transition-all active:scale-95 duration-150 shadow-sm text-slate-700 hover:text-emerald-600"
            title={cardCopy.add}
          >
            <Plus className="w-5 h-5" />
          </button>
          <BucketListButton
            destinationId={destination.id}
            destinationName={localizedDestination.name}
          />
          <button
            onClick={handleVisitedClick}
            aria-label={
              visited
                ? "Mark destination as unvisited"
                : "Mark destination as visited"
            }
            className="p-2 bg-white/70 hover:bg-white backdrop-blur-sm rounded-full transition-all active:scale-95 duration-150 shadow-sm text-slate-700"
            title={locale === "ja" ? "訪問済みにする" : "Mark as Visited"}
          >
            <CheckCircle2
              className={`w-5 h-5 ${visited ? "fill-emerald-500 text-emerald-500" : ""}`}
            />
          </button>
        </div>
      </div>

      <CardHeader className="pb-2 pt-5">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-2xl font-extrabold tracking-tight mb-1">
              {formatPlaceName(localizedDestination, locale)}
            </h3>
            <div className="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400">
              <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-500" />
              {formatPrefecture(destination.prefecture, locale)}
            </div>
          </div>
          <div className="flex items-center bg-emerald-50 border border-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-800/50 px-2.5 py-1 rounded-lg">
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              ⭐ {destination.ratings.overall}
            </span>
          </div>
        </div>

        {/* Curated Collection Badges */}
        {sortedCollections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {visibleCollections.map((col) => (
              <Link
                key={col.id}
                to={`/collections/${col.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex shrink-0 max-w-full"
              >
                <CollectionBadge collection={col} size="sm" />
              </Link>
            ))}
            {overflowCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                +{overflowCount}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pb-5 flex-grow">
        {(destination as any).match ? (
          // SMART MATCH VIEW (Homepage Recommendation)
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {cardCopy.match}
              </span>
              <span className="text-2xl font-extrabold text-emerald-500">
                {(destination as any).match.confidence}%
              </span>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {cardCopy.why}
              </p>
              {(destination as any).match.reasons.map((r: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      {localizeRecommendationReason(r, locale).title}
                    </span>
                    {r.description && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {localizeRecommendationReason(r, locale).description}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // STANDARD EXPLORE VIEW (Simple, elegant tags instead of raw numbers)
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {(() => {
                const mode = preferredTransport?.mode ?? "train";

                let Icon = Train;
                if (mode === "car" || mode === "my_car") Icon = Car;
                if (mode === "bus") Icon = Bus;
                if (mode === "shinkansen") Icon = TrainFront;
                if (mode === "flight") Icon = Plane;

                const formattedTime = preferredTransport
                  ? formatTransportTime(preferredTransport.timeRange)
                  : "N/A";

                return (
                  <div className="flex items-center whitespace-nowrap min-w-0">
                    <Icon className="w-4 h-4 mr-1.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {locale === "ja"
                        ? formattedTime.replace("h", "時間").replace("m", "分")
                        : formattedTime}
                    </span>
                  </div>
                );
              })()}
              <div className="flex items-center whitespace-nowrap min-w-0">
                <JapaneseYen className="w-4 h-4 mr-1.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  {(
                    (preferredTransport?.estimatedBudget ??
                      getAdjustedBudget(
                        destination,
                        "all",
                        partySize,
                        homeStationCoords ?? undefined,
                      )) / 1000
                  ).toFixed(0)}
                  k {locale === "ja" ? "目安" : "est."}
                </span>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <Sun className="w-4 h-4 mr-1.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  {locale === "ja"
                    ? destination.walkingSunMin < 3000
                      ? "日差し少なめ"
                      : "日差し多め"
                    : destination.walkingSunMin < 3000
                      ? "Low sun"
                      : "High sun"}
                </span>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <Bookmark className="w-4 h-4 mr-1.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  {locale === "ja" ? "カップル" : "Couple"}{" "}
                  {destination.ratings.couple}/10
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap gap-2">
                {destination.categories.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md"
                  >
                    {localizePlaceLabel(c, locale)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 flex justify-between items-center gap-1.5">
        {/* Compare - icon-only button */}
        <Button
          variant={comparing ? "default" : "ghost"}
          size="icon-sm"
          title={comparing ? cardCopy.removeCompare : cardCopy.compare}
          aria-label={comparing ? cardCopy.removeCompare : cardCopy.compare}
          className={
            comparing
              ? "bg-slate-900 hover:bg-slate-800 text-white shrink-0"
              : "shrink-0 text-slate-500"
          }
          onClick={() => {
            if (!comparing && compareList.length >= 4) {
              alert("You can only compare up to 4 destinations at a time.");
              return;
            }
            toggleCompare(destination.id);
          }}
        >
          {comparing ? (
            <CheckSquare className="w-4 h-4" />
          ) : (
            <PlusSquare className="w-4 h-4" />
          )}
        </Button>

        {/* Thumbs Up - bare icon, no container */}
        <Button
          variant="ghost"
          size="icon-sm"
          title={rating === "up" ? t("ui.removeThumbsUp") : t("ui.thumbsUp")}
          aria-label={
            rating === "up" ? t("ui.removeThumbsUp") : t("ui.thumbsUp")
          }
          className={`shrink-0 ${
            rating === "up"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-emerald-600"
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDestinationRating(destination.id, rating === "up" ? null : "up");
          }}
        >
          <ThumbsUp
            className="w-4 h-4"
            fill={rating === "up" ? "currentColor" : "none"}
          />
        </Button>

        {/* Thumbs Down - bare icon, no container */}
        <Button
          variant="ghost"
          size="icon-sm"
          title={
            rating === "down" ? t("ui.removeThumbsDown") : t("ui.thumbsDown")
          }
          aria-label={
            rating === "down" ? t("ui.removeThumbsDown") : t("ui.thumbsDown")
          }
          className={`shrink-0 ${
            rating === "down"
              ? "text-rose-600"
              : "text-slate-500 hover:text-rose-600"
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDestinationRating(
              destination.id,
              rating === "down" ? null : "down",
            );
          }}
        >
          <ThumbsDown
            className="w-4 h-4"
            fill={rating === "down" ? "currentColor" : "none"}
          />
        </Button>

        {/* Explore - dominant CTA takes remaining space */}
        <Link
          to={{
            pathname: `/destinations/${destination.id}`,
            search: location.search,
          }}
          state={linkState}
          className="flex-1"
        >
          <Button
            variant="default"
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
          >
            {cardCopy.explore}
          </Button>
        </Link>
      </CardFooter>

      <ItineraryPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        destination={{ id: destination.id, name: localizedDestination.name }}
      />

      <MarkVisitedModal
        isOpen={markVisitedOpen}
        onClose={() => setMarkVisitedOpen(false)}
        destination={{ id: destination.id, name: localizedDestination.name }}
      />

      <VisitedDateModal
        isOpen={visitedHistoryOpen}
        onClose={() => setVisitedHistoryOpen(false)}
        destination={{ id: destination.id, name: localizedDestination.name }}
      />
    </Card>
  );
}
