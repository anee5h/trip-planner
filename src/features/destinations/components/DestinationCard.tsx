import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  TrainFront,
  Bus,
  Car,
  Plane,
  JapaneseYen,
  CheckCircle2,
  Scale,
  Plus,
  Timer,
  AlertTriangle,
} from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import {
  formatLocalizedJPYRange,
  hasKnownBudgetRange,
} from "@/shared/services/budget/BudgetService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import {
  formatApproximateTransportTime,
  formatTransportTime,
} from "@/shared/services/transport/formatters";
import {
  estimateDayTripDuration,
  estimateTripDuration,
  formatTripDurationLabel,
  getDayTripTravelDurationEvidence,
} from "@/shared/services/recommendation/TripDurationService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import {
  formatPlaceName,
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";
import { pickSemanticDestinationTag } from "@/shared/utils/semanticTags";
import { localizeRecommendationReason } from "@/shared/utils/recommendationLabels";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";
import { getPrimaryDisplayReason } from "@/shared/services/recommendation/RecommendationExplainability";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import { formatWeekendMinutes } from "@/shared/services/recommendation/WeekendAreaPolicy";
import {
  buildTokyoWardsLink,
  getWardGroup,
} from "@/shared/services/recommendation/TokyoWardsConsolidation";
import { getCityArea } from "@/shared/data/cityAreas";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

export interface WeekendCardSummary {
  placeCount: number;
  capacityMinutes: number;
  oneWayMinutes?: number;
  bestMode?: string;
}

interface DestinationCardProps {
  destination: Destination;
  rank?: number;
  /** Retained for existing recommendation callers; cards now display the fastest preferred mode. */
  activeTransportMode?: string;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  availableTimeHours?: number;
  /** 2D1N trip-area summary shown on the card's compact weekend line. */
  weekendSummary?: WeekendCardSummary;
  /** One-line forecast/seasonal condition label for the planned date. */
  conditionLabel?: string;
  /** Selected travel date for date-aware transport metadata. */
  ferryTemporal?: FerryTemporalContext;
}

export default function DestinationCard({
  destination,
  rank,
  partySize = 2,
  carMode,
  publicModes,
  availableTimeHours,
  weekendSummary,
  conditionLabel,
  ferryTemporal,
}: DestinationCardProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const wardGroup = getWardGroup(destination);
  const virtualGroup = destination.virtualGroup;
  const modeLabels = {
    train: t("home.transportModes.train"),
    shinkansen: t("home.transportModes.shinkansen"),
    bus: t("home.transportModes.bus"),
    flight: t("home.transportModes.flight"),
    ferry: t("home.transportModes.ferry"),
    car: t("home.transportModes.car"),
    my_car: t("home.transportModes.my_car"),
  } as const;
  const localizedDestination = getLocalizedPlace(destination, locale);
  const parent =
    DestinationRelationshipService.getParentDestination(destination);
  const localizedParent = parent ? getLocalizedPlace(parent, locale) : null;
  const semanticTag = pickSemanticDestinationTag(
    destination,
    localizedDestination,
    locale,
    localizedParent?.name ?? null,
  );
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
    homeStationTransportZoneId,
    canMutateProfile,
  } = useTripStore();
  // A virtual group (e.g. a UNESCO property) is visited when at least one of
  // its curated members is visited. Visit tracking stays on real destination
  // ids — group ids are never persisted as visits.
  const visited = virtualGroup
    ? virtualGroup.memberIds.some((memberId) => isVisited(memberId))
    : isVisited(destination.id);
  const comparing = isComparing(destination.id);
  // Multi-place groups must not present representative-member facts (score,
  // travel, budget, location) as property-level truth.
  const isMultiPlaceGroup = Boolean(
    virtualGroup && virtualGroup.placeCount > 1,
  );
  const cardCopy =
    locale === "ja"
      ? {
          match: "マッチ度",
          explore: "詳しく見る",
          add: "旅程に追加",
          compare: "比較に追加",
          removeCompare: "比較から削除",
          alreadyVisited: "訪問済み",
          markVisited: "訪問済みにする",
          markUnvisited: "未訪問に戻す",
          travelUnavailable: t("home.transportModes.travelUnavailable"),
        }
      : {
          match: "Match Confidence",
          explore: "Explore",
          add: "Add to Itinerary",
          compare: "Add to Compare",
          removeCompare: "Remove from Compare",
          alreadyVisited: "Already Visited",
          markVisited: "Mark destination as visited",
          markUnvisited: "Mark destination as unvisited",
          travelUnavailable: t("home.transportModes.travelUnavailable"),
        };
  // Beta product decision (KAI-89): the overall destination score is hidden
  // from all user-facing surfaces; scoreMetadata stays internal (rubric,
  // provenance, gates) and never affects ranking.
  const visitHours = destination.recommendedVisitHours;
  const hasValidVisitHours = Boolean(
    visitHours &&
    Number.isFinite(visitHours.min) &&
    Number.isFinite(visitHours.max) &&
    visitHours.min >= 0 &&
    visitHours.min <= visitHours.max,
  );

  const scoredDestination = destination as Partial<ScoredDestination>;
  const match = scoredDestination.match;
  const isWeekend = Boolean(weekendSummary);
  const strongestReason = getPrimaryDisplayReason(match?.reasons ?? [], {
    weekend: isWeekend,
  });
  const strongestReasonCopy = strongestReason
    ? localizeRecommendationReason(strongestReason, locale)
    : null;
  const transportCostWarning = match?.reasons.find(
    (reason) => reason.code === "weekendTransportExcluded",
  );
  const transportCostWarningCopy = transportCostWarning
    ? localizeRecommendationReason(transportCostWarning, locale)
    : null;

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
  const selectedPublicModes = publicModes ?? [
    "train",
    "shinkansen",
    "bus",
    "flight",
    "ferry",
  ];
  const validModes = getValidModes(
    destination,
    carMode,
    selectedPublicModes,
    homeStationCoords ?? undefined,
    undefined,
    homeStationTransportZoneId,
    ferryTemporal,
  );
  const dayTravelEstimate = isWeekend
    ? undefined
    : getDayTripTravelDurationEvidence(
        destination,
        {
          homeStationCoords: homeStationCoords ?? undefined,
          originZoneId: homeStationTransportZoneId,
          ferryTemporal,
        },
        validModes,
      ).estimate;
  const preferredTransport = isWeekend ? undefined : dayTravelEstimate;
  const durationEst = isWeekend
    ? estimateTripDuration(
        destination,
        {
          homeStationCoords: homeStationCoords ?? undefined,
          originZoneId: homeStationTransportZoneId,
          availableTimeHours,
          ferryTemporal,
        },
        validModes,
      )
    : estimateDayTripDuration(
        destination,
        {
          homeStationCoords: homeStationCoords ?? undefined,
          originZoneId: homeStationTransportZoneId,
          availableTimeHours,
          ferryTemporal,
        },
        validModes,
      );

  return (
    <Card className="overflow-hidden flex flex-col h-full group rounded-card shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-300 border-slate-200 dark:border-slate-800">
      <div className="relative h-[145px] overflow-hidden sm:h-[155px] md:h-[160px]">
        <LazyImage
          src={localizedDestination.heroImage}
          alt={localizedDestination.name}
          responsive
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ${visited ? "grayscale opacity-80" : ""}`}
        />
        {visited && (
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
            <Badge className="bg-emerald-700/90 text-white text-sm py-1.5 px-3 border-none shadow-lg">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {cardCopy.alreadyVisited}
            </Badge>
          </div>
        )}
        <div
          data-testid="destination-card-badges"
          className="absolute left-2 top-2 z-20 flex max-w-[90%] flex-wrap items-center gap-1 md:left-3 md:top-3 md:gap-2"
        >
          {rank !== undefined && (
            <Badge className="bg-slate-900/90 px-2 py-0.5 text-[10px] font-black text-white shadow-md backdrop-blur-md dark:bg-white dark:text-slate-950 md:text-xs">
              #{rank}
            </Badge>
          )}
          {virtualGroup ? (
            <Badge className="bg-emerald-700/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-md backdrop-blur-md md:text-xs">
              {t(virtualGroup.badgeKey)}
            </Badge>
          ) : wardGroup ? (
            <Badge className="bg-emerald-700/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-md backdrop-blur-md md:text-xs">
              {t("destination.tokyoWardsBadge")}
            </Badge>
          ) : (
            <>
              {destination.kind && (
                <Badge className="bg-emerald-700/90 px-2 py-0.5 text-[10px] font-extrabold capitalize text-white shadow-md backdrop-blur-md md:text-xs">
                  {localizePlaceLabel(destination.kind, locale)}
                </Badge>
              )}
              {semanticTag &&
                (() => {
                  const tag = semanticTag;
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
                      "bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-300 font-bold shadow-md";
                  }

                  return (
                    <Badge
                      key={tag}
                      className={`${destination.kind ? "hidden md:inline-flex" : "inline-flex"} ${badgeStyle}`}
                    >
                      {localizePlaceLabel(tag, locale)}
                    </Badge>
                  );
                })()}
            </>
          )}
        </div>
        {!wardGroup && !virtualGroup && (
          <div className="absolute right-3 top-3 z-10 flex">
            <BucketListButton
              destinationId={destination.id}
              destinationName={localizedDestination.name}
              className="size-10 p-0"
            />
          </div>
        )}
      </div>

      <CardHeader className="p-3 pb-1 md:p-3 md:pb-1">
        <h3
          title={
            virtualGroup
              ? virtualGroup.name
              : wardGroup
                ? t("destination.tokyoWardsGroup")
                : formatPlaceName(localizedDestination, locale)
          }
          className="line-clamp-2 min-h-10 min-w-0 text-lg font-extrabold leading-[1.15] tracking-tight sm:text-xl"
        >
          {virtualGroup
            ? virtualGroup.name
            : wardGroup
              ? t("destination.tokyoWardsGroup")
              : formatPlaceName(localizedDestination, locale)}
        </h3>

        {!isMultiPlaceGroup && (
          <div className="mt-0.5 flex h-5 min-w-0 items-center text-xs font-medium text-slate-500 dark:text-slate-300 md:mt-1 md:text-sm">
            <MapPin className="mr-1 size-3.5 shrink-0 text-emerald-500" />
            <span className="truncate">{locationLabel}</span>
          </div>
        )}

        {sortedCollections.length > 0 && (
          <div className="mt-1 hidden min-h-5 items-center gap-1.5 overflow-hidden md:flex">
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
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                +{desktopCollectionOverflow}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-grow p-3 pb-2 pt-0 md:p-3 md:pb-2 md:pt-0">
        {isMultiPlaceGroup ? null : (
          <>
            {match ? (
              // SMART MATCH VIEW (Homepage Recommendation)
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {cardCopy.match}
                  </span>
                  <span className="text-xl font-extrabold text-emerald-500">
                    {match.confidence}%
                  </span>
                </div>

                {strongestReasonCopy && (
                  <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    <span
                      className="truncate"
                      title={strongestReasonCopy.title}
                    >
                      {strongestReasonCopy.title}
                    </span>
                  </div>
                )}
                {transportCostWarningCopy && (
                  <div
                    className="flex min-w-0 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    title={transportCostWarningCopy.description}
                  >
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {transportCostWarningCopy.title}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              // STANDARD EXPLORE VIEW (Simple, elegant tags instead of raw numbers)
              <div>
                {/* Forecast/seasonal condition label for the planned date: clearly
                labelled evidence, never a fake forecast icon. */}
                {conditionLabel && (
                  <p className="mb-1.5 line-clamp-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {conditionLabel}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300 md:gap-x-3 md:gap-y-1.5 md:text-sm">
                  {(() => {
                    // The Tokyo wards group shows the fastest shared gateway
                    // estimate across its members, not legacy transport options.
                    const gateway = wardGroup?.gatewayEstimate;
                    const mode = gateway?.mode ?? preferredTransport?.mode;

                    let Icon = MapPin;
                    if (mode === "car" || mode === "my_car") Icon = Car;
                    if (mode === "bus") Icon = Bus;
                    if (mode === "shinkansen") Icon = TrainFront;
                    if (mode === "flight") Icon = Plane;

                    const transport = gateway ?? preferredTransport;
                    const isApproximate = Boolean(
                      transport &&
                      "evidence" in transport &&
                      transport.evidence === "estimated",
                    );
                    const formattedTime = transport
                      ? isApproximate
                        ? formatApproximateTransportTime(
                            transport.timeRange,
                            locale,
                          )
                        : formatTransportTime(transport.timeRange, locale)
                      : "";

                    const isDriving = mode === "car" || mode === "my_car";

                    return (
                      <div
                        data-testid="destination-card-travel-time"
                        className="flex min-w-0 items-center whitespace-nowrap"
                      >
                        <Icon className="mr-1.5 size-3.5 shrink-0 text-slate-500 md:size-4" />
                        <span className="truncate">
                          {formattedTime || cardCopy.travelUnavailable}
                          {formattedTime && isDriving
                            ? t("compare.driving")
                            : ""}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex min-w-0 items-center whitespace-nowrap">
                    <JapaneseYen className="mr-1.5 size-3.5 shrink-0 text-slate-500 md:size-4" />
                    <span className="truncate">
                      {(() => {
                        // KAI-89: unknown budgets (absent values) render as
                        // unavailable — never as zero or free.
                        return hasKnownBudgetRange(destination)
                          ? formatLocalizedJPYRange(
                              [
                                destination.budgetMin * partySize,
                                destination.budgetMax * partySize,
                              ],
                              locale,
                            )
                          : formatLocalizedJPYRange(null, locale);
                      })()}
                      {partySize > 1
                        ? locale === "ja"
                          ? `（${partySize}人分）`
                          : ` for ${partySize}`
                        : ""}
                    </span>
                  </div>
                  <div
                    data-testid="destination-card-visit-duration"
                    className="hidden min-w-0 items-center whitespace-nowrap md:flex"
                  >
                    <Timer className="mr-1.5 size-3.5 shrink-0 text-slate-500 md:size-4" />
                    <span className="truncate">
                      {durationEst
                        ? formatTripDurationLabel(durationEst, locale)
                        : hasValidVisitHours
                          ? locale === "ja"
                            ? `滞在 ${visitHours!.min}–${visitHours!.max}時間`
                            : `${visitHours!.min}–${visitHours!.max}h visit`
                          : locale === "ja"
                            ? "滞在時間目安なし"
                            : "Visit time unavailable"}
                    </span>
                  </div>
                  {(durationEst?.isBorderline || durationEst?.isImpossible) && (
                    <div
                      data-testid="destination-card-duration-warning"
                      className={`col-span-2 flex min-w-0 items-center rounded-lg border px-2 py-1 text-xs font-semibold ${
                        durationEst.isImpossible
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      <AlertTriangle className="mr-1.5 size-3.5 shrink-0" />
                      <span
                        className="line-clamp-2 break-words"
                        title={
                          locale === "ja"
                            ? durationEst.warningMessage?.ja
                            : durationEst.warningMessage?.en
                        }
                      >
                        {locale === "ja"
                          ? durationEst.warningMessage?.ja
                          : durationEst.warningMessage?.en}
                      </span>
                    </div>
                  )}
                  <div
                    data-testid="destination-card-sun"
                    className="hidden min-w-0 items-center whitespace-nowrap md:flex"
                  >
                    {/* Sun/shade splits were batch-template artefacts, not
                        source-verified; KAI-89 removes them as unsourced.
                        No sun-exposure claim is shown without a sourced
                        split. */}
                  </div>
                </div>

                {weekendSummary && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {weekendSummary.placeCount > 0 && (
                      <span>
                        {t("destination.tripAreas.places", {
                          places: weekendSummary.placeCount,
                        })}
                      </span>
                    )}
                    {weekendSummary.placeCount > 0 && <span>·</span>}
                    <span>
                      {weekendSummary.capacityMinutes >= 600
                        ? t("destination.tripAreas.plentyForTwoDays")
                        : t("destination.tripAreas.readyForTwoDays")}
                    </span>
                    {weekendSummary.oneWayMinutes !== undefined &&
                      weekendSummary.bestMode && (
                        <span className="text-slate-500">
                          ·{" "}
                          {t("destination.tripAreas.travelBy", {
                            time: formatWeekendMinutes(
                              weekendSummary.oneWayMinutes,
                              locale,
                            ),
                            mode:
                              modeLabels[
                                weekendSummary.bestMode as keyof typeof modeLabels
                              ] ?? weekendSummary.bestMode,
                          })}
                        </span>
                      )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center gap-1.5 p-3 pt-0 md:p-3 md:pt-0">
        {virtualGroup ? (
          <span className="text-xs font-bold text-slate-500 dark:text-slate-300 px-1">
            {t("ui.places", { count: virtualGroup.placeCount })}
          </span>
        ) : wardGroup ? (
          <span className="text-xs font-bold text-slate-500 dark:text-slate-300 px-1">
            {t("destination.tokyoWardsCount", {
              count: wardGroup.wardCount,
            })}
          </span>
        ) : null}
        {!wardGroup && !virtualGroup && (
          <>
            <button
              onClick={handleAddToItinerary}
              aria-label={cardCopy.add}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title={cardCopy.add}
            >
              <Plus className="size-5" />
            </button>
            <button
              onClick={handleVisitedClick}
              disabled={!canMutateProfile}
              aria-pressed={visited}
              aria-label={
                visited ? cardCopy.markUnvisited : cardCopy.markVisited
              }
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              title={visited ? cardCopy.markUnvisited : cardCopy.markVisited}
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
                if (!comparing && compareList.length >= 3) {
                  alert(t("compare.maxLimitAlert"));
                  return;
                }
                toggleCompare(destination.id);
                recommendationAnalytics.trackCompare(
                  destination.id,
                  !comparing,
                );
              }}
            >
              {comparing ? (
                <Scale className="w-4 h-4 text-white" />
              ) : (
                <Scale className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              )}
            </Button>
          </>
        )}

        {/* Explore - dominant CTA takes remaining space; the Tokyo 23 Wards
            group opens the filtered ward list instead of a details page, and
            a virtual group opens its group target (destination or listing). */}
        <Link
          to={
            virtualGroup
              ? virtualGroup.href
              : wardGroup
                ? buildTokyoWardsLink(wardGroup.wardHubIds, wardGroup.tripMode)
                : {
                    pathname: `/destinations/${destination.id}`,
                    search: location.search,
                  }
          }
          state={linkState}
          className="ml-auto"
          onClick={() =>
            recommendationAnalytics.trackClick(destination.id, rank)
          }
        >
          <Button
            variant="default"
            size="sm"
            className="min-h-11 bg-emerald-700 px-4 font-semibold text-white shadow-sm hover:bg-emerald-800"
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
