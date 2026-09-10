import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { ItineraryPickerModal } from "@/features/trips/components/ItineraryPickerModal";
import { MarkVisitedModal } from "./MarkVisitedModal";
import { VisitedDateModal } from "./VisitedDateModal";
import type { Destination } from "@/shared/types/destination";
import type { JourneyScope } from "@/shared/types/journey";
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
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { Button } from "@/shared/components/ui/button";
import {
  MapPin,
  TrainFront,
  Bus,
  Car,
  Plane,
  Ship,
  Route,
  JapaneseYen,
  CheckCircle2,
  Scale,
  Plus,
  Timer,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import {
  formatLocalizedJPYRange,
  formatTravellerEstimateRange,
} from "@/shared/services/budget/BudgetService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { formatTravelEstimateLabel } from "@/shared/services/transport/formatters";
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
import { resolveDestinationTransportZone } from "@/shared/services/transport/TransportTopologyService";
import { destinationSharesOriginAnchor } from "@/shared/services/transport/JourneyEndpoints";
import { formatWeekendMinutes } from "@/shared/services/recommendation/WeekendAreaPolicy";
import {
  buildTokyoWardsLink,
  getWardGroup,
} from "@/shared/services/recommendation/TokyoWardsConsolidation";
import { getCityArea } from "@/shared/data/cityAreas";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";
import {
  getExploreEstimateScope,
  type ExploreBudgetEstimate,
} from "../exploreBudget";
import { getOvernightCapacityThresholds } from "@/shared/services/recommendation/WeekendPolicy";
import {
  isOvernightDuration,
  type TripDuration,
} from "@/shared/types/tripDuration";

export interface OvernightCardSummary {
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
  /** Explore's cached estimate shared by filtering, sorting, and display. */
  resolvedBudgetEstimate?: ExploreBudgetEstimate;
  availableTimeHours?: number;
  /** Overnight trip-area summary shown on the card's compact duration line. */
  overnightSummary?: OvernightCardSummary;
  /** One-line forecast/seasonal condition label for the planned date. */
  conditionLabel?: string;
  /** Selected travel date for date-aware transport metadata. */
  ferryTemporal?: FerryTemporalContext;
  /** Detail-page rails use a denser card while retaining all actions. */
  compact?: boolean;
  /** Saved surfaces use the same card family with a mobile-only dense layout. */
  variant?: "default" | "saved";
  /** Explicit current-page anchor for local/final-segment rails. */
  journeyOrigin?: Destination;
  journeyScope?: JourneyScope;
  duration?: TripDuration;
}

export default function DestinationCard({
  destination,
  rank,
  partySize = 2,
  carMode,
  publicModes,
  resolvedBudgetEstimate,
  availableTimeHours,
  overnightSummary,
  conditionLabel,
  ferryTemporal,
  compact = false,
  variant = "default",
  journeyOrigin,
  journeyScope,
  duration = "fullDay",
}: DestinationCardProps) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const isSavedVariant = variant === "saved";
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
  const isLocalAccessJourney = journeyScope === "local_access";
  const localJourneyOrigin = journeyOrigin ?? parent;
  const localizedLocalJourneyOrigin = localJourneyOrigin
    ? getLocalizedPlace(localJourneyOrigin, locale)
    : null;
  const journeyOriginCoords = isLocalAccessJourney
    ? (localJourneyOrigin?.coordinates ?? null)
    : homeStationCoords;
  const journeyOriginZoneId = isLocalAccessJourney
    ? localJourneyOrigin
      ? resolveDestinationTransportZone(localJourneyOrigin)
      : undefined
    : homeStationTransportZoneId;
  const localAccessOriginAvailable =
    !isLocalAccessJourney || Boolean(journeyOriginCoords);
  const localAccessUnavailable =
    isLocalAccessJourney &&
    (!localAccessOriginAvailable ||
      destination.localAccessUnestimated === true);
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
          alreadyThere: "既に到着",
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
          alreadyThere: "Already there",
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
  const isOvernight = isOvernightDuration(duration);
  const overnightCapacity = getOvernightCapacityThresholds(duration);
  const strongestReason = getPrimaryDisplayReason(match?.reasons ?? [], {
    overnight: isOvernight,
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

  const linkState = useMemo(() => {
    const hasTransport = carMode !== undefined || publicModes !== undefined;
    const travelDate = ferryTemporal?.travelDate
      ? ferryTemporal.travelDate.toISOString().slice(0, 10)
      : undefined;
    if (
      !hasTransport &&
      partySize === undefined &&
      duration === undefined &&
      travelDate === undefined
    ) {
      return undefined;
    }
    return {
      ...(hasTransport ? { carMode, publicModes } : {}),
      ...(partySize !== undefined ? { partySize } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(travelDate ? { travelDate } : {}),
    };
  }, [carMode, publicModes, partySize, duration, ferryTemporal]);

  const activeCollections = (destination.collections || [])
    .map((m) => getCollectionById(m.collectionId))
    .filter((c): c is Collection => Boolean(c));

  const sortedCollections = sortCollections(activeCollections);
  const visibleCollections = sortedCollections.slice(0, 1);
  const desktopCollectionOverflow = Math.max(0, sortedCollections.length - 1);
  const savedBadgeLabel = virtualGroup
    ? t(virtualGroup.badgeKey)
    : wardGroup
      ? t("destination.tokyoWardsBadge")
      : destination.kind
        ? localizePlaceLabel(destination.kind, locale)
        : semanticTag
          ? localizePlaceLabel(semanticTag, locale)
          : null;
  const savedBadgeOverflow =
    !virtualGroup && !wardGroup && savedBadgeLabel
      ? Number(Boolean(destination.kind && semanticTag)) +
        sortedCollections.length
      : 0;
  const selectedPublicModes = publicModes ?? [
    "train",
    "shinkansen",
    "bus",
    "flight",
    "ferry",
  ];
  const validModes = !localAccessUnavailable
    ? getValidModes(
        destination,
        carMode,
        selectedPublicModes,
        journeyOriginCoords ?? undefined,
        undefined,
        journeyOriginZoneId,
        ferryTemporal,
      )
    : [];
  const displayModes = validModes;
  // KAI-278 same-origin semantics: when the destination shares the canonical
  // origin anchor (Tokyo Station -> Tokyo Station), there is no journey to
  // estimate. Skip the origin-aware engine call entirely so a raw 14-19 min
  // local estimate can never be produced or displayed for one anchor; the
  // travel-time cell renders the same-origin state instead.
  const sameOriginAnchor =
    !isLocalAccessJourney &&
    destinationSharesOriginAnchor(
      destination,
      journeyOriginCoords ?? undefined,
      undefined,
    );
  const dayTravelEstimate =
    isOvernight || sameOriginAnchor
      ? undefined
      : getDayTripTravelDurationEvidence(
          destination,
          {
            homeStationCoords: journeyOriginCoords ?? undefined,
            originZoneId: journeyOriginZoneId,
            ferryTemporal,
          },
          displayModes,
        ).estimate;
  const preferredTransport = isOvernight ? undefined : dayTravelEstimate;
  // KAI-260: cards render the bounded traveller range even when the engine
  // used an explicit model/profile fallback. Evidence quality is disclosed
  // compactly, not used as a visibility gate.
  // KAI-275 follow-up: a PARTIAL car estimate (no complete total during
  // discovery — origin-car transport cost is intentionally unmeasured, #326)
  // still has a bounded on-site knownSubtotal. The card surfaces that KNOWN
  // part truthfully ("Known ¥X–Y · on-site only") instead of a bare
  // "Cost unavailable" — never fabricating the missing origin transport.
  const cardEstimate = useMemo<{
    range: [number, number];
    quality: "verified" | "estimated" | "rough";
    scope: "complete" | "partial_on_site" | "partial_total";
  } | null>(() => {
    const resolved = resolvedBudgetEstimate?.estimate;
    if (resolved?.total) {
      return {
        range: [resolved.total.min, resolved.total.max],
        quality: resolved.estimateQuality,
        scope: "complete",
      };
    }
    const hasKnownSubtotal = (known: readonly [number, number] | undefined) =>
      Boolean(
        known &&
        Number.isFinite(known[1]) &&
        known[1] > 0 &&
        Number.isFinite(known[0]),
      );
    if (
      resolved?.completeness === "partial" &&
      hasKnownSubtotal(resolved.knownSubtotal)
    ) {
      return {
        range: [resolved.knownSubtotal[0], resolved.knownSubtotal[1]],
        quality: resolved.estimateQuality,
        scope: getExploreEstimateScope(resolved),
      };
    }
    const mode =
      preferredTransport?.mode ??
      (validModes.length > 0 ? validModes[0] : undefined);
    if (!mode) return null;
    const r = calculateTripEstimate({
      dest: destination,
      mode,
      partySize,
      homeCoords: journeyOriginCoords ?? undefined,
      includeOriginTravel: Boolean(journeyOriginCoords),
      duration,
      ferryTemporal,
    });
    if (r.total) {
      return {
        range: [r.total.min, r.total.max],
        quality: r.estimateQuality,
        scope: "complete",
      };
    }
    if (r.completeness === "partial" && hasKnownSubtotal(r.knownSubtotal)) {
      return {
        range: [r.knownSubtotal[0], r.knownSubtotal[1]],
        quality: r.estimateQuality,
        scope: getExploreEstimateScope(r),
      };
    }
    return null;
  }, [
    destination,
    validModes,
    resolvedBudgetEstimate,
    preferredTransport,
    partySize,
    journeyOriginCoords,
    isOvernight,
    duration,
    ferryTemporal,
  ]);
  const cardBudgetRange = cardEstimate?.range ?? null;

  const durationEst = isOvernight
    ? estimateTripDuration(
        destination,
        {
          homeStationCoords: journeyOriginCoords ?? undefined,
          originZoneId: journeyOriginZoneId,
          availableTimeHours,
          ferryTemporal,
        },
        displayModes,
      )
    : estimateDayTripDuration(
        destination,
        {
          homeStationCoords: journeyOriginCoords ?? undefined,
          originZoneId: journeyOriginZoneId,
          availableTimeHours,
          ferryTemporal,
        },
        displayModes,
      );

  return (
    <Card
      data-testid="destination-card"
      data-card-variant={variant}
      className={`relative overflow-hidden h-full group rounded-card shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-300 border-slate-200 dark:border-slate-800 ${isSavedVariant ? "grid grid-cols-[128px_minmax(0,1fr)] grid-rows-[auto_auto_auto] md:flex md:flex-col" : "flex flex-col"} ${compact ? "rounded-xl" : ""}`}
    >
      <div
        data-testid="destination-card-image"
        className={`relative overflow-hidden ${isSavedVariant ? "col-start-1 row-start-1 h-[100px] p-2 md:col-auto md:row-auto md:h-[160px] md:min-h-0 md:p-0" : compact ? "h-[112px] sm:h-[128px] md:h-[132px]" : "h-[145px] sm:h-[155px] md:h-[160px]"}`}
      >
        <LazyImage
          src={localizedDestination.heroImage}
          alt={localizedDestination.name}
          responsive
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className={`w-full h-full object-cover ${isSavedVariant ? "rounded-xl" : ""} group-hover:scale-105 transition-transform duration-700 ${visited ? "grayscale opacity-80" : ""}`}
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
          {isSavedVariant ? (
            <>
              {savedBadgeLabel && (
                <Badge className="max-w-full whitespace-normal break-words bg-emerald-700/90 px-1.5 py-0.5 text-center text-[9px] font-extrabold leading-tight text-white shadow-md backdrop-blur-md">
                  {savedBadgeLabel}
                </Badge>
              )}
              {savedBadgeOverflow > 0 && (
                <Badge className="shrink-0 bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-md backdrop-blur-md">
                  +{savedBadgeOverflow}
                </Badge>
              )}
            </>
          ) : (
            <>
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
                          "bg-sky-700 hover:bg-sky-800 text-white border-sky-300 font-bold shadow-md";
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
            </>
          )}
        </div>
      </div>

      {!wardGroup && !virtualGroup && (
        <div className="absolute right-2 top-2 z-30 flex">
          <BucketListButton
            destinationId={destination.id}
            destinationName={localizedDestination.name}
            className="size-11 p-0"
          />
        </div>
      )}

      <CardHeader
        className={`${isSavedVariant ? "col-start-2 row-start-1 min-w-0 p-2 pb-0 pr-10" : "p-3 pb-1"} md:col-auto md:row-auto md:p-3 md:pb-1`}
      >
        <h3
          title={
            virtualGroup
              ? virtualGroup.name
              : wardGroup
                ? t("destination.tokyoWardsGroup")
                : formatPlaceName(localizedDestination, locale)
          }
          className={`${isSavedVariant ? "text-base sm:text-lg md:text-xl" : compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"} line-clamp-2 ${isSavedVariant ? "min-h-10 md:min-h-12" : compact ? "min-h-11" : "min-h-12"} min-w-0 font-extrabold leading-[1.15] tracking-tight`}
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

      <CardContent
        data-testid="destination-card-content"
        className={`${isSavedVariant ? "col-span-2 col-start-1 row-start-2 min-w-0 p-2 pb-1 pt-0" : "flex-grow p-3 pb-2 pt-0"} md:col-auto md:row-auto md:flex-grow md:p-3 md:pb-2 md:pt-0`}
      >
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
                {journeyScope === "local_access" && (
                  <p
                    data-testid="journey-scope"
                    className="mb-1 line-clamp-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
                  >
                    {localAccessUnavailable
                      ? locale === "ja"
                        ? "現地アクセスは利用できません"
                        : "Local access unavailable"
                      : locale === "ja"
                        ? `現地アクセス · ${localizedLocalJourneyOrigin?.name ?? "ハブ"}から`
                        : `Local access · from ${localizedLocalJourneyOrigin?.name ?? "hub"}`}
                  </p>
                )}
                <div
                  className={`grid text-xs font-semibold text-slate-700 dark:text-slate-300 ${isSavedVariant ? "grid-cols-1 gap-y-1.5" : "grid-cols-2 gap-x-2 gap-y-1"} md:grid-cols-2 md:gap-x-3 md:gap-y-1.5 md:text-sm`}
                >
                  {(() => {
                    // The Tokyo wards group shows the fastest shared gateway
                    // estimate across its members, not legacy transport options.
                    const gateway = wardGroup?.gatewayEstimate;
                    const mode = gateway?.mode ?? preferredTransport?.mode;

                    // KAI-275: an explicit transport icon per mode. MapPin is a
                    // LOCATION icon (used only on the location row above) and
                    // must never stand in for a transport mode; unknown modes
                    // fall back to a neutral route icon instead. The one
                    // exception below is the same-anchor "Already there" state
                    // (KAI-278), which represents no journey at all — a
                    // location pin, not a mode claim.
                    const TRANSPORT_ICONS: Record<string, LucideIcon> = {
                      train: TrainFront,
                      shinkansen: TrainFront,
                      bus: Bus,
                      car: Car,
                      my_car: Car,
                      flight: Plane,
                      ferry: Ship,
                    };
                    const transport = localAccessUnavailable
                      ? null
                      : (gateway ?? preferredTransport);
                    // KAI-278: same-origin destinations render an explicit
                    // state rather than a journey estimate (no mode claim).
                    const isSameAnchor = sameOriginAnchor && !gateway;
                    const scopeLabel =
                      journeyScope === "local_access"
                        ? locale === "ja"
                          ? "現地アクセス"
                          : "Local access"
                        : journeyScope === "origin_journey"
                          ? locale === "ja"
                            ? "出発地からの旅程"
                            : "Origin journey"
                          : undefined;
                    const formattedTime = isSameAnchor
                      ? cardCopy.alreadyThere
                      : transport
                        ? formatTravelEstimateLabel(transport, locale, {
                            compact: true,
                          })
                        : "";

                    const isDriving = mode === "car" || mode === "my_car";

                    const Icon = isSameAnchor
                      ? MapPin
                      : mode
                        ? (TRANSPORT_ICONS[mode] ?? Route)
                        : Route;

                    return (
                      <div
                        data-testid="destination-card-travel-time"
                        className={`flex min-w-0 gap-1 ${isSavedVariant ? "items-start whitespace-normal text-[11px]" : "items-center whitespace-nowrap"}`}
                      >
                        <Icon className="mr-0 size-3.5 shrink-0 text-slate-500 md:size-4" />
                        {scopeLabel && !isSameAnchor && (
                          <span
                            data-testid="destination-card-journey-scope"
                            className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                          >
                            {scopeLabel}
                          </span>
                        )}
                        <span
                          className={
                            isSavedVariant ? "break-words" : "truncate"
                          }
                        >
                          {formattedTime || cardCopy.travelUnavailable}
                          {formattedTime && !isSameAnchor && isDriving
                            ? t("compare.driving")
                            : ""}
                        </span>
                      </div>
                    );
                  })()}
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
                  <div className="flex min-w-0 items-center whitespace-nowrap md:col-span-2">
                    <JapaneseYen className="mr-1.5 size-3.5 shrink-0 text-slate-500 md:size-4" />
                    <span
                      data-testid={
                        cardEstimate && cardEstimate.scope !== "complete"
                          ? "destination-card-cost-scope"
                          : undefined
                      }
                      className={
                        cardEstimate && cardEstimate.scope !== "complete"
                          ? "min-w-0 whitespace-normal break-words leading-tight"
                          : "truncate"
                      }
                      title={
                        cardEstimate && cardEstimate.scope !== "complete"
                          ? cardEstimate.scope === "partial_on_site"
                            ? locale === "ja"
                              ? "現地費用のみ・広域交通費を除く"
                              : "Partial on-site total; origin transport excluded"
                            : locale === "ja"
                              ? "部分合計。出発地からの交通費を含みます"
                              : "Partial total; origin transport is included in the known subtotal"
                          : undefined
                      }
                    >
                      {(() => {
                        // KAI-276: partial completeness does not define scope.
                        // The canonical origin component decides whether this
                        // known subtotal is on-site-only or includes origin
                        // transport while another required component is missing.
                        if (cardEstimate && cardEstimate.scope !== "complete") {
                          const known = formatLocalizedJPYRange(
                            cardBudgetRange,
                            locale,
                          );
                          const prefix = locale === "ja" ? "既知" : "Known";
                          const qualifier =
                            cardEstimate.scope === "partial_on_site"
                              ? isSavedVariant
                                ? locale === "ja"
                                  ? "現地のみ"
                                  : "on-site only"
                                : locale === "ja"
                                  ? "現地のみ・広域交通費を除く"
                                  : "on-site only · origin transport excluded"
                              : locale === "ja"
                                ? "部分合計"
                                : "partial total";
                          const sep = locale === "ja" ? "・" : " · ";
                          return `${prefix} ${known}${sep}${qualifier}`;
                        }
                        return formatTravellerEstimateRange(
                          cardBudgetRange,
                          cardEstimate?.quality,
                          locale,
                        );
                      })()}
                      {partySize > 1
                        ? locale === "ja"
                          ? `（${partySize}人分）`
                          : ` for ${partySize}`
                        : ""}
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

                {isOvernight && overnightSummary && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {overnightSummary.placeCount > 0 && (
                      <span>
                        {t("destination.tripAreas.places", {
                          places: overnightSummary.placeCount,
                        })}
                      </span>
                    )}
                    {overnightSummary.placeCount > 0 && <span>·</span>}
                    {overnightSummary.capacityMinutes > 0 && (
                      <span>
                        {overnightSummary.capacityMinutes >=
                        overnightCapacity.strongMinutes
                          ? t("destination.tripAreas.plentyForDays", {
                              days: overnightCapacity.days,
                            })
                          : t("destination.tripAreas.readyForDays", {
                              days: overnightCapacity.days,
                            })}
                      </span>
                    )}
                    {overnightSummary.oneWayMinutes !== undefined &&
                      overnightSummary.bestMode && (
                        <span className="text-slate-500">
                          ·{" "}
                          {t("destination.tripAreas.travelBy", {
                            time: formatWeekendMinutes(
                              overnightSummary.oneWayMinutes,
                              locale,
                            ),
                            mode:
                              modeLabels[
                                overnightSummary.bestMode as keyof typeof modeLabels
                              ] ?? overnightSummary.bestMode,
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

      <CardFooter
        data-testid="destination-card-footer"
        className={
          isSavedVariant
            ? "col-span-2 col-start-1 row-start-3 flex items-center justify-between gap-2 p-2 pt-1 md:col-auto md:row-auto md:p-3 md:pt-1"
            : "flex items-center gap-1.5 p-3 pt-0 md:p-3 md:pt-0"
        }
      >
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
                ? buildTokyoWardsLink(wardGroup.wardHubIds, duration)
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
            className="min-h-11 bg-emerald-700 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 md:px-4 md:text-sm"
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
