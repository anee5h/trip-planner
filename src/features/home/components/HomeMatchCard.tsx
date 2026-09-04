import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Train,
  Car,
  Bus,
  Plane,
  Ship,
  TramFront,
  JapaneseYen,
  CheckCircle2,
} from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { isCarOutageRoughEstimate } from "@/shared/services/transport/carRouteOutageFallback";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import {
  formatApproximateTransportTime,
  formatTransportTime,
} from "@/shared/services/transport/formatters";
import { buildTokyoWardsLink } from "@/shared/services/recommendation/TokyoWardsConsolidation";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";
import { useTripStore } from "@/shared/hooks/useTripStore";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";
import { getDayTripTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { formatTravellerEstimateRange } from "@/shared/services/budget/BudgetService";
import { estimateQualityLabel } from "@/shared/services/budget/tripEstimateEngine";
import type { TravelConditionEvaluation } from "@/shared/services/recommendation/TravelConditions";
import { formatTravelConditionParams } from "@/shared/services/recommendation/TravelConditions";
import { getPrimaryDisplayReason } from "@/shared/services/recommendation/RecommendationExplainability";
import { getOvernightCapacityThresholds } from "@/shared/services/recommendation/WeekendPolicy";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from "lucide-react";
import { localizeRecommendationReason } from "@/shared/utils/recommendationLabels";
import {
  formatBusyPeriodDateRange,
  getBusyPeriodCues,
  type BusyPeriodCueKind,
} from "@/shared/data/busyPeriodCues";

import { ALL_PUBLIC_MODES } from "../services/TransportResolver";
import {
  getTripDays,
  isOvernightDuration,
  type TripDuration,
} from "@/shared/types/tripDuration";

interface HomeMatchCardProps {
  destination: Destination;
  rank: number;
  showRank?: boolean;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  /** Planned travel date (ISO) forwarded to the destination details page. */
  travelDate?: string;
  duration?: TripDuration;
  /** Planned trip budget and vibe forwarded to destination details. */
  budget?: number;
  tripType?: string;
  /**
   * @deprecated Kept for call-site compatibility. Day-trip cards now use the
   * shared evidence-aware resolver whenever a configured origin is present.
   */
  allowApproximateLocalDisplay?: boolean;
}

/**
 * Cleanly separates parenthetical titles e.g. "Edo Castle Ruins (Imperial Palace)"
 * into title: "Edo Castle Ruins" and subtitle: "Imperial Palace".
 */
function parseCleanTitle(fullName: string): {
  title: string;
  subtitle?: string;
} {
  const match = fullName.match(/^(.*?)\s*\((.*?)\)$/);
  if (match && match[1] && match[2]) {
    return { title: match[1].trim(), subtitle: match[2].trim() };
  }
  return { title: fullName };
}

export const HomeMatchCard: React.FC<HomeMatchCardProps> = ({
  destination,
  rank,
  showRank = true,
  partySize = 2,
  carMode = "none",
  publicModes = ALL_PUBLIC_MODES,
  travelDate,
  duration = "fullDay",
  budget,
  tripType,
}) => {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const { homeStationCoords, homeStationTransportZoneId } = useTripStore();
  const localized = getLocalizedPlace(destination, locale);
  const scoredDestination = destination as ScoredDestination;
  const wardGroup = scoredDestination.wardGroup;
  const isOvernight = isOvernightDuration(duration);
  const overnightCapacity = getOvernightCapacityThresholds(duration);
  const overnight = isOvernight ? scoredDestination.overnight : undefined;
  const parsedTitle = parseCleanTitle(localized.name);
  const title = wardGroup
    ? t("destination.tokyoWardsGroup")
    : parsedTitle.title;
  const subtitle = parsedTitle.subtitle;
  const areaAndCategory = [
    formatPrefecture(destination.prefecture, locale),
    destination.categories[0] &&
      localizePlaceLabel(destination.categories[0], locale),
  ]
    .filter(Boolean)
    .join(" · ");

  const ferryTemporal = travelDate
    ? { travelDate: new Date(`${travelDate}T12:00:00`) }
    : undefined;
  const validModes = getValidModes(
    destination,
    carMode,
    publicModes,
    homeStationCoords ?? undefined,
    undefined,
    homeStationTransportZoneId,
    ferryTemporal,
  );
  const sharedDayEstimate = isOvernight
    ? undefined
    : getDayTripTravelDurationEvidence(
        destination,
        {
          homeStationCoords,
          originZoneId: homeStationTransportZoneId,
          ferryTemporal,
        },
        validModes,
      ).estimate;
  const recommendationEstimate = scoredDestination.transportEstimate;
  const fallbackOvernightTransport = isOvernight
    ? getFastestPreferredTransport(
        destination,
        carMode,
        publicModes,
        partySize,
        homeStationCoords ?? undefined,
        homeStationTransportZoneId,
        ferryTemporal,
      )
    : undefined;
  const displayTransport =
    recommendationEstimate ?? sharedDayEstimate ?? fallbackOvernightTransport;
  const isApproximateDisplay = Boolean(
    displayTransport &&
    "evidence" in displayTransport &&
    displayTransport.evidence === "estimated",
  );
  // KAI-226 resilience: rough outage estimates are additionally labeled so
  // the user can tell a temporary provider outage from a normal estimate.
  const isRoughOutageDisplay = isCarOutageRoughEstimate(displayTransport);
  const travelTimeText = displayTransport
    ? isApproximateDisplay
      ? formatApproximateTransportTime(displayTransport.timeRange, locale)
      : formatTransportTime(displayTransport.timeRange, locale)
    : t("home.transportModes.travelUnavailable");
  const transportDisplay = displayTransport
    ? {
        train: { Icon: Train, label: t("home.transportModes.train") },
        shinkansen: {
          Icon: TramFront,
          label: t("home.transportModes.shinkansen"),
        },
        bus: { Icon: Bus, label: t("home.transportModes.bus") },
        flight: { Icon: Plane, label: t("home.transportModes.flight") },
        ferry: { Icon: Ship, label: t("home.transportModes.ferry") },
        car: { Icon: Car, label: t("home.transportModes.car") },
        my_car: { Icon: Car, label: t("home.transportModes.my_car") },
      }[displayTransport.mode]
    : null;

  // Forecast/seasonal/unknown evaluation for the planned trip dates
  const condition = scoredDestination.condition;
  const busyPeriodCue = getBusyPeriodCues(
    destination.id,
    travelDate ?? new Date(),
  ).find(({ kind }) => kind === "peakSeason" || kind === "localEvent");
  const translateRequired = (key: string) => {
    const value = t(key, { defaultValue: "" }).trim();
    return value === key ? "" : value;
  };
  const busyPeriodKindKey: Record<BusyPeriodCueKind, string> = {
    nationalHoliday: "home.busyPeriod.nationalHoliday",
    weekend: "home.busyPeriod.weekend",
    peakSeason: "home.busyPeriod.peakSeason",
    localEvent: "home.busyPeriod.localEvent",
  };
  const busyPeriodKindLabel = busyPeriodCue
    ? translateRequired(busyPeriodKindKey[busyPeriodCue.kind])
    : "";
  const busyPeriodAdvisory = translateRequired("home.busyPeriod.advisory");
  const busyPeriodEvidenceLabel = translateRequired(
    "home.busyPeriod.evidenceLabel",
  );
  const busyPeriodSourceLabel = translateRequired(
    "home.busyPeriod.sourceLabel",
  );
  const busyPeriodCueText = busyPeriodCue
    ? busyPeriodAdvisory && busyPeriodKindLabel && busyPeriodCue.reason[locale]
      ? `${busyPeriodAdvisory} — ${busyPeriodKindLabel}: ${busyPeriodCue.reason[locale]} (${formatBusyPeriodDateRange(busyPeriodCue.dateRange, locale)})`
      : undefined
    : undefined;
  const busyPeriodCueLabel = busyPeriodCueText
    ? busyPeriodCue &&
      busyPeriodEvidenceLabel &&
      busyPeriodSourceLabel &&
      busyPeriodCue.evidence[locale] &&
      busyPeriodCue.source[locale]
      ? locale === "ja"
        ? `${busyPeriodCueText}。${busyPeriodEvidenceLabel}：${busyPeriodCue.evidence[locale]}。${busyPeriodSourceLabel}：${busyPeriodCue.source[locale]}`
        : `${busyPeriodCueText}. ${busyPeriodEvidenceLabel}: ${busyPeriodCue.evidence[locale]}. ${busyPeriodSourceLabel}: ${busyPeriodCue.source[locale]}`
      : undefined
    : undefined;

  const conditionLine = useMemo(() => {
    if (!condition || condition.reasons.length === 0) return undefined;
    // Forecast reasons are origin weather, not destination weather: cards
    // only surface destination-specific seasonal/unknown guidance.
    const reasons = condition.reasons.filter(
      (reason) =>
        reason.code !== "conditionForecastDay" &&
        reason.code !== "conditionForecastRange",
    );
    if (reasons.length === 0) return undefined;
    const labelFor = (reason: TravelConditionEvaluation["reasons"][number]) =>
      t(`recommendation.reasons.${reason.code}.title`, {
        ...formatTravelConditionParams(reason.params, locale),
      });
    const [first, second] = reasons;
    if (condition.source === "mixed" && second) {
      return `${labelFor(first)} · ${labelFor(second)}`;
    }
    return labelFor(first);
  }, [condition, locale, t]);
  // Use the shared display-only priority so raw reason construction order does
  // not make budget or transport displace a more useful reason.
  const overnightReason = isOvernight
    ? getPrimaryDisplayReason(scoredDestination.match?.reasons ?? [], {
        overnight: true,
      })
    : undefined;
  const showOvernightReason = Boolean(
    overnightReason && !overnightReason.code.startsWith("weekendTravel"),
  );
  const dayTripReason = !isOvernight
    ? getPrimaryDisplayReason(scoredDestination.match?.reasons ?? [])
    : undefined;
  const dayTripReasonLabel =
    dayTripReason &&
    dayTripReason.code !== "generalHighlyRated" &&
    dayTripReason.code !== "generalSolidMatch"
      ? localizeRecommendationReason(dayTripReason, locale).title
      : undefined;
  const transportCostWarning = scoredDestination.match?.reasons?.find(
    (reason) => reason.code === "weekendTransportExcluded",
  );
  const transportCostWarningLabel = transportCostWarning
    ? localizeRecommendationReason(transportCostWarning, locale)
    : undefined;
  const hasCriticalCondition = Boolean(
    condition?.reasons.some(
      (reason) => reason.code === "conditionFerrySeasonal",
    ),
  );

  const weatherIconForCondition = (condition: string): React.ElementType => {
    switch (condition) {
      case "clear":
      case "sunny":
        return Sun;
      case "cloudy":
        return Cloud;
      case "rainy":
        return CloudRain;
      case "snowy":
        return CloudSnow;
      case "stormy":
        return CloudLightning;
      default:
        return Cloud;
    }
  };
  const cardHref = wardGroup
    ? buildTokyoWardsLink(wardGroup.wardHubIds, duration)
    : `/destinations/${destination.id}`;

  return (
    <Link
      to={cardHref}
      state={{
        carMode,
        publicModes,
        partySize,
        ...(travelDate ? { travelDate } : {}),
        duration,
        ...(tripType !== undefined ? { tripType } : {}),
        ...(budget !== undefined ? { budget } : {}),
      }}
      className="group relative flex h-full flex-1 cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md transition-all duration-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800 sm:h-40 sm:aspect-auto">
        <LazyImage
          src={destination.heroImage}
          alt={title}
          responsive
          deferUntilVisible
          // KAI-129: card image renders ~177-201px (mobile) / 248-308px
          // (desktop). Give the browser an accurate sizes hint so it picks
          // the 250/330/500 variant, never the multi-megapixel original.
          // deferUntilVisible: rail-aware — don't fetch horizontally
          // off-screen rail cards on cold load.
          sizes="(min-width: 1024px) 308px, (min-width: 640px) 248px, 190px"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30" />

        {/* Rank + overnight badge - stacked in one flex column */}
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-10 flex flex-col items-start gap-1">
          {showRank && (
            <div className="flex items-center gap-1 rounded-full border border-white/20 bg-slate-900/90 px-2 py-0.5 text-[10px] font-black text-white shadow-md sm:px-2.5 sm:py-1 sm:text-xs">
              <span className="text-emerald-400 font-black">#{rank}</span>
            </div>
          )}
          {isOvernight && (
            <div
              className="rounded-full bg-emerald-700/90 px-2 py-0.5 text-[9px] font-bold text-white shadow-md sm:text-[10px]"
              aria-label={t("home.durationBadge")}
            >
              {t("home.durationBadge")}
            </div>
          )}
        </div>

        {/* Bucket List Action - Stops Propagation; hidden for the virtual
            Tokyo 23 Wards group (it is not a real catalogue destination). */}
        {!wardGroup && (
          <div
            className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10 scale-90 sm:scale-100"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <BucketListButton
              destinationId={destination.id}
              destinationName={localized.name}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div
          className={`flex flex-col ${isOvernight ? "min-h-0" : "min-h-[2.5rem] sm:min-h-[3.25rem]"}`}
        >
          <h3 className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          {subtitle && (
            <span className="mt-0.5 hidden truncate text-[10px] font-semibold text-slate-500 dark:text-slate-300 sm:block sm:text-xs">
              {subtitle}
            </span>
          )}
        </div>

        <div className="pt-2">
          {/* Trip-area line: wards · places · capacity */}
          {(isOvernight || wardGroup) && (
            <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 sm:text-xs">
              {[
                wardGroup &&
                  t("destination.tokyoWardsCount", {
                    count: wardGroup.wardCount,
                  }),
                (overnight?.placeCount ?? wardGroup?.placeCount ?? 0) > 0 &&
                  t("home.places", {
                    count: overnight?.placeCount ?? wardGroup?.placeCount ?? 0,
                  }),
                isOvernight &&
                  ((overnight?.capacity?.activityMinutes ?? 0) >=
                  overnightCapacity.strongMinutes
                    ? t("destination.tripAreas.plentyForDays", {
                        days: overnightCapacity.days,
                      })
                    : t("destination.tripAreas.readyForDays", {
                        days: overnightCapacity.days,
                      })),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* A travel reason repeats the detailed row below, so keep only
              distinct weekend explanations such as weather guidance. */}
          {showOvernightReason && overnightReason && (
            <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 sm:text-xs">
              {t(`recommendation.reasons.${overnightReason.code}.title`, {
                ...(overnightReason.params ?? {}),
              })}
            </p>
          )}

          {/* Forecast/seasonal condition line: labelled evidence for the
              planned dates — never shown as a forecast when seasonal. */}
          {conditionLine && (
            <p
              className={`mt-1 line-clamp-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300 sm:text-xs ${hasCriticalCondition ? "" : "hidden sm:block"}`}
              title={conditionLine}
            >
              {conditionLine}
            </p>
          )}

          {busyPeriodCueText && (
            <p
              className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 sm:text-xs"
              aria-label={busyPeriodCueLabel}
              title={busyPeriodCueLabel}
            >
              <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{busyPeriodCueText}</span>
            </p>
          )}

          <p className="line-clamp-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300 sm:text-xs">
            {areaAndCategory}
          </p>

          {dayTripReasonLabel && (
            <p
              className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 sm:text-xs"
              title={dayTripReasonLabel}
            >
              <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{dayTripReasonLabel}</span>
            </p>
          )}

          {/* Selected trip-day weather chips */}
          {overnight?.weatherDays && overnight.weatherDays.length > 0 && (
            <div className="mt-1 hidden flex-wrap items-center gap-1.5 sm:flex">
              {overnight.weatherDays
                .slice(0, getTripDays(duration))
                .map((day, idx) => {
                  const DayIcon = weatherIconForCondition(day.condition);
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-300 sm:text-xs"
                      aria-label={t("home.dayLabel", {
                        day: idx + 1,
                      })}
                    >
                      <DayIcon className="w-3 h-3 shrink-0" />
                      {day.temperatureC != null && (
                        <span>{day.temperatureC}°</span>
                      )}
                    </span>
                  );
                })}
            </div>
          )}

          {transportCostWarningLabel && (
            <p
              className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 sm:text-xs"
              title={transportCostWarningLabel.description}
            >
              <AlertTriangle className="size-3 shrink-0" />
              <span className="truncate">
                {transportCostWarningLabel.title}
              </span>
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300 sm:gap-1.5 sm:text-xs">
            <span className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">{travelTimeText}</span>
            </span>
            {transportDisplay && (
              <>
                <span className="hidden px-1 font-bold text-slate-300 dark:text-slate-700 sm:inline">
                  •
                </span>
                <span
                  title={transportDisplay.label}
                  className="flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 sm:text-xs"
                >
                  <transportDisplay.Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">
                    {transportDisplay.label}
                  </span>
                </span>
              </>
            )}
            {isRoughOutageDisplay && (
              <span
                title={t("home.transportModes.roughEstimate")}
                className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              >
                {t("home.transportModes.roughEstimate")}
              </span>
            )}
            {scoredDestination.estimatedCostRange && (
              <>
                <span className="hidden px-1 font-bold text-slate-300 dark:text-slate-700 sm:inline">
                  ·
                </span>
                <span
                  className="flex items-center gap-1 truncate"
                  title={
                    [
                      scoredDestination.estimatedCostQuality
                        ? estimateQualityLabel(
                            scoredDestination.estimatedCostQuality,
                            locale,
                          )
                        : undefined,
                      scoredDestination.estimatedCostTransportScope ===
                      "corridor_only"
                        ? t("home.transportModes.corridorFareOnly")
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                >
                  <JapaneseYen className="h-3 w-3 shrink-0 text-slate-500 sm:h-3.5 sm:w-3.5" />
                  <span className="truncate">
                    {formatTravellerEstimateRange(
                      scoredDestination.estimatedCostRange,
                      scoredDestination.estimatedCostQuality,
                      locale,
                    )}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default HomeMatchCard;
