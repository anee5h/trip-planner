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
  CheckCircle2,
  Scale,
  Sun,
  Plus,
  Timer,
  AlertTriangle,
} from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import { formatTransportTime } from "@/shared/services/transport/formatters";
import {
  estimateTripDuration,
  formatTripDurationLabel,
} from "@/shared/services/recommendation/TripDurationService";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName, formatPrefecture } from "@/shared/utils/placeLabels";
import { localizeRecommendationReason } from "@/shared/utils/recommendationLabels";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import { getCityArea } from "@/shared/data/cityAreas";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface DestinationCardProps {
  destination: Destination;
  rank?: number;
  /** Retained for existing recommendation callers; cards now display the fastest preferred mode. */
  activeTransportMode?: string;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  availableTimeHours?: number;
}

export default function DestinationCard({
  destination,
  rank,
  partySize = 2,
  carMode,
  publicModes,
  availableTimeHours,
}: DestinationCardProps) {
  const { locale } = useLocale();
  const localizedDestination = getLocalizedPlace(destination, locale);
  const parent =
    DestinationRelationshipService.getParentDestination(destination);
  const localizedParent = parent ? getLocalizedPlace(parent, locale) : null;
  const area = getCityArea(destination.areaId);
  const locationLabel = localizedParent
    ? `${area ? area.name[locale] : localizedParent.name}${area ? ` · ${localizedParent.name}` : ""}`
    : formatPrefecture(destination.prefecture, locale);
  const location = useLocation();
  const {
    isVisited,
    isComparing,
    toggleCompare,
    compareList,
    homeStationCoords,
    canMutateProfile,
  } = useTripStore();
  const visited = isVisited(destination.id);
  const comparing = isComparing(destination.id);
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
  const visibleCollections = sortedCollections.slice(0, 1);
  const desktopCollectionOverflow = Math.max(0, sortedCollections.length - 1);
  const preferredTransport = getFastestPreferredTransport(
    destination,
    carMode,
    publicModes,
    partySize,
    homeStationCoords ?? undefined,
  );
  const preferredModes = [
    ...(carMode && carMode !== "none" ? [carMode] : []),
    ...(publicModes || ["train", "shinkansen", "bus", "flight"]),
  ];
  const durationEst = estimateTripDuration(
    destination,
    {
      homeStationCoords: homeStationCoords ?? undefined,
      availableTimeHours,
    },
    preferredModes,
  );

  return (
    <Card className="overflow-hidden flex flex-col h-full group rounded-card shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-300 border-slate-200 dark:border-slate-800">
      <div className="relative h-[185px] overflow-hidden md:h-[185px]">
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
        <div className="absolute right-3 top-3 z-10 flex">
          <BucketListButton
            destinationId={destination.id}
            destinationName={localizedDestination.name}
            className="size-10 p-0"
          />
        </div>
        <div className="absolute bottom-3 right-3 z-20 flex items-center rounded-lg border border-emerald-100 bg-emerald-50/95 px-2.5 py-1 shadow-sm backdrop-blur-sm dark:border-emerald-800/50 dark:bg-emerald-900/90">
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            ⭐ {destination.ratings.overall}
          </span>
        </div>
      </div>

      <CardHeader className="p-3 pb-1 md:p-4 md:pb-2">
        <h3
          title={formatPlaceName(localizedDestination, locale)}
          className="line-clamp-2 min-h-10 min-w-0 text-xl font-extrabold leading-[1.15] tracking-tight"
        >
          {formatPlaceName(localizedDestination, locale)}
        </h3>

        <div className="mt-0.5 flex h-5 min-w-0 items-center text-sm font-medium text-slate-500 dark:text-slate-400 md:mt-1">
          <MapPin className="mr-1 size-3.5 shrink-0 text-emerald-500" />
          <span className="truncate">{locationLabel}</span>
        </div>

        <div className="mt-2 hidden min-h-6 items-center gap-1.5 overflow-hidden md:flex">
          {sortedCollections.length > 0 && (
            <>
              {visibleCollections.map((col) => (
                <Link
                  key={col.id}
                  to={`/collections/${col.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex max-w-full shrink-0"
                >
                  <CollectionBadge collection={col} size="sm" />
                </Link>
              ))}
              {desktopCollectionOverflow > 0 && (
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  +{desktopCollectionOverflow}
                </span>
              )}
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-grow p-3 pb-2 pt-0 md:p-4 md:pb-3 md:pt-0">
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
          <div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300 md:min-h-12 md:gap-x-3 md:gap-y-2 md:text-sm">
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

                const isDriving = mode === "car" || mode === "my_car";

                return (
                  <div className="flex items-center whitespace-nowrap min-w-0">
                    <Icon className="mr-1.5 size-3.5 shrink-0 text-slate-400 md:size-4" />
                    <span className="truncate">
                      {locale === "ja"
                        ? formattedTime.replace("h", "時間").replace("m", "分")
                        : formattedTime}
                      {isDriving ? " · Driving" : ""}
                    </span>
                  </div>
                );
              })()}
              <div className="flex min-w-0 items-center whitespace-nowrap">
                <JapaneseYen className="mr-1.5 size-3.5 shrink-0 text-slate-400 md:size-4" />
                <span className="truncate">
                  {formatLocalizedJPYRange(
                    [
                      destination.budgetMin * partySize,
                      destination.budgetMax * partySize,
                    ],
                    locale,
                  )}
                  {partySize > 1
                    ? locale === "ja"
                      ? `（${partySize}人分）`
                      : ` for ${partySize}`
                    : ""}
                </span>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <Timer className="mr-1.5 size-3.5 shrink-0 text-slate-400 md:size-4" />
                <span className="truncate">
                  {durationEst
                    ? formatTripDurationLabel(durationEst, locale)
                    : destination.recommendedVisitHours
                      ? locale === "ja"
                        ? `滞在 ${destination.recommendedVisitHours.min}–${destination.recommendedVisitHours.max}時間`
                        : `${destination.recommendedVisitHours.min}–${destination.recommendedVisitHours.max}h visit`
                      : locale === "ja"
                        ? "滞在時間目安なし"
                        : "Visit time unavailable"}
                </span>
              </div>
              {(durationEst?.isBorderline || durationEst?.isImpossible) && (
                <div
                  className={`col-span-2 flex items-center text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
                    durationEst.isImpossible
                      ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span>
                    {locale === "ja"
                      ? durationEst.warningMessage?.ja
                      : durationEst.warningMessage?.en}
                  </span>
                </div>
              )}
              <div className="flex items-center whitespace-nowrap min-w-0">
                <Sun className="mr-1.5 size-3.5 shrink-0 text-slate-400 md:size-4" />
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
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center gap-1 p-3 pt-0 md:gap-1.5 md:p-4 md:pt-0">
        <button
          onClick={handleAddToItinerary}
          aria-label={cardCopy.add}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-800"
          title={cardCopy.add}
        >
          <Plus className="size-5" />
        </button>
        <button
          onClick={handleVisitedClick}
          disabled={!canMutateProfile}
          aria-pressed={visited}
          aria-label={
            visited
              ? "Mark destination as unvisited"
              : "Mark destination as visited"
          }
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          title={locale === "ja" ? "訪問済みにする" : "Mark as Visited"}
        >
          <CheckCircle2
            className={`size-5 ${visited ? "fill-emerald-500 text-emerald-500" : ""}`}
          />
        </button>

        {/* Compare - icon-only button */}
        <Button
          variant={comparing ? "default" : "ghost"}
          size="icon"
          title={comparing ? cardCopy.removeCompare : cardCopy.compare}
          aria-label={comparing ? cardCopy.removeCompare : cardCopy.compare}
          aria-pressed={comparing}
          className={
            comparing
              ? "size-11 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 shadow-sm border border-indigo-500"
              : "size-11 shrink-0 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!comparing && compareList.length >= 4) {
              alert("You can only compare up to 4 destinations at a time.");
              return;
            }
            toggleCompare(destination.id);
            recommendationAnalytics.trackCompare(destination.id, !comparing);
          }}
        >
          {comparing ? (
            <Scale className="w-4 h-4 text-white" />
          ) : (
            <Scale className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          )}
        </Button>

        {/* Explore - dominant CTA takes remaining space */}
        <Link
          to={{
            pathname: `/destinations/${destination.id}`,
            search: location.search,
          }}
          state={linkState}
          className="ml-auto"
          onClick={() =>
            recommendationAnalytics.trackClick(destination.id, rank)
          }
        >
          <Button
            variant="default"
            size="sm"
            className="min-h-11 bg-emerald-600 px-5 font-semibold text-white shadow-sm hover:bg-emerald-700 md:px-8"
          >
            {cardCopy.explore}
          </Button>
        </Link>
      </CardFooter>

      <ItineraryPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        payload={{
          type: "destination",
          destination: { id: destination.id, name: localizedDestination.name },
        }}
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
