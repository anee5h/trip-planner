import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Clock, Train, Car, Bus, Plane, TramFront } from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { LazyImage } from "@/shared/components/ui/LazyImage";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import {
  formatApproximateTransportTime,
  formatTransportTime,
} from "@/shared/services/transport/formatters";
import { formatWeekendMinutes } from "@/shared/services/recommendation/WeekendAreaPolicy";
import { buildTokyoWardsLink } from "@/shared/services/recommendation/TokyoWardsConsolidation";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import {
  formatPrefecture,
  localizePlaceLabel,
} from "@/shared/utils/placeLabels";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import type { ScoredDestination } from "@/shared/services/recommendation/RecommendationTypes";
import type { TravelConditionEvaluation } from "@/shared/services/recommendation/TravelConditions";
import { formatTravelConditionParams } from "@/shared/services/recommendation/TravelConditions";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from "lucide-react";

import { ALL_PUBLIC_MODES } from "../services/TransportResolver";
import { getSafeDisplayEstimate } from "../services/LocalDiscoveryDisplayEstimator";

interface HomeMatchCardProps {
  destination: Destination;
  rank: number;
  showRank?: boolean;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  /** Planned travel date (ISO) forwarded to the destination details page. */
  travelDate?: string;
  /**
   * Explicitly allow a presentation-only local estimate for local discovery
   * surfaces. Recommendation cards leave this off so unknown stays unknown.
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
  allowApproximateLocalDisplay = false,
}) => {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const { homeStationCoords, homeStationTransportZoneId } = useTripStore();
  const localized = getLocalizedPlace(destination, locale);
  const wardGroup = (destination as ScoredDestination).wardGroup;
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

  // Preferred transport calculation — adjust destination transport options
  // for the selected origin before picking the fastest mode.
  const adjustedDestination = buildRecommendationCandidate(destination, {
    homeStationCoords,
    originZoneId: homeStationTransportZoneId,
  });
  const verifiedTransport = getFastestPreferredTransport(
    adjustedDestination,
    carMode,
    publicModes,
    partySize,
    homeStationCoords ?? undefined,
    homeStationTransportZoneId,
    travelDate ? { travelDate: new Date(`${travelDate}T12:00:00`) } : undefined,
  );

  // Canonical origin-aware transport is the only travel-time truth shown on
  // recommendation cards. Explicitly local discovery surfaces may opt into a
  // clearly approximate display value without changing recommendation state.
  const localDisplayEstimate =
    !verifiedTransport && allowApproximateLocalDisplay
      ? getSafeDisplayEstimate(destination, {
          homeStationCoords,
          homeStationTransportZoneId,
          carMode,
          publicModes,
        })
      : null;
  const displayTransport = verifiedTransport ?? localDisplayEstimate;
  const isApproximateDisplay = Boolean(
    !verifiedTransport && localDisplayEstimate,
  );
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
        car: { Icon: Car, label: t("home.transportModes.car") },
        my_car: { Icon: Car, label: t("home.transportModes.my_car") },
      }[displayTransport.mode]
    : null;

  // Weekend metadata
  const weekend = (destination as ScoredDestination).weekend;
  // Forecast/seasonal/unknown evaluation for the planned trip dates
  const condition = (destination as ScoredDestination).condition;

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
  // Prefer the most situation-specific weekend reason (weather > travel >
  // capacity) over the generic "weekendTripReady" headline.
  const weekendReason = weekend
    ? ((destination as ScoredDestination).match?.reasons?.find((r) =>
        r.code.startsWith("weekendWeather"),
      ) ??
      (destination as ScoredDestination).match?.reasons?.find((r) =>
        r.code.startsWith("weekendTravel"),
      ) ??
      (destination as ScoredDestination).match?.reasons?.find((r) =>
        r.code.startsWith("weekendCapacity"),
      ) ??
      (destination as ScoredDestination).match?.reasons?.find(
        (r) => r.code === "weekendTripReady",
      ))
    : undefined;

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
    ? buildTokyoWardsLink(wardGroup.wardHubIds, wardGroup.tripMode)
    : `/destinations/${destination.id}`;

  return (
    <Link
      to={cardHref}
      state={{
        ...(travelDate ? { travelDate } : {}),
        ...(weekend
          ? {
              tripMode: "weekend_2d1n" as const,
              accommodationAllowance: weekend.accommodationAllowance,
            }
          : {}),
      }}
      className="group relative flex h-full flex-1 cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md transition-all duration-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative aspect-[4/3] sm:h-48 sm:aspect-auto w-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
        <LazyImage
          src={destination.heroImage}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30" />

        {/* Rank + Weekend Badges - stacked in one flex column */}
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-10 flex flex-col items-start gap-1">
          {showRank && (
            <div className="bg-slate-900/90 text-white font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-white/20 shadow-md flex items-center gap-1">
              <span className="text-emerald-400 font-black">#{rank}</span>
            </div>
          )}
          {weekend && (
            <div
              className="bg-emerald-600/90 text-white font-bold text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full shadow-md"
              aria-label={t("home.weekendBadge")}
            >
              {t("home.weekendBadge")}
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

      <div className="flex flex-1 flex-col justify-between p-3 sm:p-4">
        <div className="flex flex-col min-h-[3.25rem] sm:min-h-[4rem]">
          <h3 className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {subtitle}
            </span>
          )}
        </div>

        <div className="mt-auto pt-2">
          {/* Trip-area line: wards · places · capacity, travel time */}
          {(weekend || wardGroup) && (
            <p className="line-clamp-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
              {[
                wardGroup &&
                  t("destination.tokyoWardsCount", {
                    count: wardGroup.wardCount,
                  }),
                (weekend?.placeCount ?? wardGroup?.placeCount ?? 0) > 0 &&
                  t("home.places", {
                    count: weekend?.placeCount ?? wardGroup?.placeCount ?? 0,
                  }),
                weekend &&
                  (weekend.capacity.activityMinutes >= 600
                    ? t("destination.tripAreas.plentyForTwoDays")
                    : t("destination.tripAreas.readyForTwoDays")),
              ]
                .filter(Boolean)
                .join(" · ")}
              {weekend?.travelFit.oneWayMinutes !== undefined &&
                transportDisplay && (
                  <span className="text-slate-500">
                    {" "}
                    ·{" "}
                    {t("destination.tripAreas.travelBy", {
                      time: formatWeekendMinutes(
                        weekend.travelFit.oneWayMinutes,
                        locale,
                      ),
                      mode: transportDisplay.label,
                    })}
                  </span>
                )}
            </p>
          )}

          {/* Weekend reason line */}
          {weekendReason && (
            <p className="line-clamp-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
              {t(`recommendation.reasons.${weekendReason.code}.title`, {
                ...(weekendReason.params ?? {}),
              })}
            </p>
          )}

          {/* Forecast/seasonal condition line: labelled evidence for the
              planned dates — never shown as a forecast when seasonal. */}
          {conditionLine && (
            <p className="line-clamp-1 text-[9px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
              {conditionLine}
            </p>
          )}

          <p className="line-clamp-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs">
            {areaAndCategory}
          </p>

          {/* Weekend Day 1 / Day 2 weather chips */}
          {weekend?.weatherDays && weekend.weatherDays.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {weekend.weatherDays.slice(0, 2).map((day, idx) => {
                const DayIcon = weatherIconForCondition(day.condition);
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-slate-500 dark:text-slate-400"
                    aria-label={t(
                      idx === 0 ? "home.day1Label" : "home.day2Label",
                    )}
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

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs">
            <span className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{travelTimeText}</span>
            </span>
            {transportDisplay && (
              <>
                <span className="text-slate-300 dark:text-slate-700 font-bold px-1">
                  •
                </span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[9px] sm:text-[10px] tracking-wide shrink-0">
                  <transportDisplay.Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>{transportDisplay.label}</span>
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
