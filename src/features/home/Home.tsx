import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Cloud, CloudLightning, Snowflake, Sun } from "lucide-react";

import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { getDistance } from "@/shared/utils/distance";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { useRecentlyViewedDestinations } from "@/shared/hooks/useRecentlyViewedDestinations";
import { getTabWeatherSummary } from "@/shared/services/weather/WeatherTabService";
import {
  deriveTripDates,
  normalizeTravelDateParam,
} from "@/shared/services/recommendation/TravelConditions";
import RouletteModal from "@/features/home/components/RouletteModal";

import { useTripPlannerState } from "@/features/home/hooks/useTripPlannerState";
import { useWeatherContext } from "@/features/home/hooks/useWeatherContext";
import { useTripRecommendations } from "@/features/home/hooks/useTripRecommendations";
import HomePlanner from "./components/HomePlanner";
import TopMatchesSection from "./components/TopMatchesSection";
import BucketListRail from "./components/BucketListRail";
import CollectionsRail from "./components/CollectionsRail";
import UnexploredNearbyRail from "./components/UnexploredNearbyRail";
import DiscoveryRail from "./components/DiscoveryRail";
import RecentlyViewedRail from "./components/RecentlyViewedRail";
import {
  getHomepageRailConfig,
  getSeasonalDiscoveryDestinations,
  getUnder60Destinations,
  getUnexploredNearbyDestinations,
  getWeekendGetawayDestinations,
  getWorthLongerJourneyDestinations,
  orderRecentlyViewedDestinations,
  softDeduplicateRail,
  type OriginRailContext,
} from "./services/HomeRailService";
import { useTranslation } from "react-i18next";
import StationInput from "@/shared/components/StationInput";
import TravelDatePicker from "@/shared/components/travel/TravelDatePicker";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedStationLabel } from "@/shared/utils/formatOriginLocation";
import { getFixedSeason } from "@/shared/utils/season";

/**
 * Compact single-date label: "Aug 8" / "8/8".
 */
export function formatCompactDate(
  isoDate: string,
  locale: "en" | "ja",
): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (locale === "ja") return `${month}/${day}`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

/**
 * Compact two-day range label for narrow screens: "Aug 8–9" (same month),
 * "Aug 30 – Sep 1" (month rollover), "Dec 31 – Jan 1" (year rollover);
 * Japanese: "8/8〜8/9". The full weekday/date label is preserved through
 * aria-label/title on the control.
 */
export function formatCompactDateRange(
  day1Iso: string,
  day2Iso: string,
  locale: "en" | "ja",
): string {
  if (locale === "ja") {
    return `${formatCompactDate(day1Iso, "ja")}〜${formatCompactDate(day2Iso, "ja")}`;
  }
  const [y1, m1] = day1Iso.split("-").map(Number);
  const [y2, m2] = day2Iso.split("-").map(Number);
  if (y1 === y2 && m1 === m2) {
    const [, , d1] = day1Iso.split("-").map(Number);
    const [, , d2] = day2Iso.split("-").map(Number);
    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(new Date(y1, m1 - 1, 1));
    return `${monthName} ${d1}–${d2}`;
  }
  return `${formatCompactDate(day1Iso, "en")} – ${formatCompactDate(day2Iso, "en")}`;
}

export default function Home() {
  const { t } = useTranslation();
  const allDestinations = useMemo(
    () => getDestinationList() as Destination[],
    [],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    homeStation,
    homeStationCoords,
    homeStationTransportZoneId,
    originSource,
  } = useTripStore();
  const { locale } = useLocale();
  const { isVisited, favorites } = useTripStore();

  const {
    weatherContext,
    setWeatherContext,
    activeTabId,
    setActiveTabId,
    customDate,
    setCustomDate,
    currentTab,
    handleCustomDateSelect,
  } = useWeatherContext(homeStationCoords);

  const tomorrowIso = useMemo(
    () => weatherContext?.tabs.find((tab) => tab.id === "tomorrow")?.dates?.[0],
    [weatherContext],
  );

  /**
   * Bidirectional date=YYYY-MM-DD URL synchronization.
   *
   * URL → state: every search-parameter change while mounted restores the
   * selected date (back/forward included). Invalid or past dates are
   * normalized away with replace (no history entry).
   *
   * state → URL: every non-restore state change is a deliberate selection
   * (Today / Tomorrow / custom date) and pushes a history entry so
   * back/forward restores it; the restore-in-flight and last-written
   * guards keep URL→state restorations and in-flight writes from being
   * overwritten or duplicated across router transition commits.
   */
  const restoreInFlightRef = useRef(false);
  /** The URL date value most recently applied to state (loop guard). */
  const lastAppliedUrlRef = useRef<string | undefined>(undefined);
  /**
   * The date value most recently written to the URL. Router search-param
   * state updates can lag the committed URL (transition), so this guard
   * stops the sync effect from writing the same value twice or mistaking
   * its own in-flight write for a URL→state restoration.
   */
  const lastWrittenUrlRef = useRef<string | undefined>(undefined);
  const [hasExplicitSelection, setHasExplicitSelection] = useState<boolean>(
    () => searchParams.has("date"),
  );

  // The date serialized by the current selection: today omits the param,
  // tomorrow and custom dates serialize the ISO date.
  const stateDate = useMemo(() => {
    if (customDate) return normalizeTravelDateParam(customDate) ?? undefined;
    if (activeTabId === "tomorrow") return tomorrowIso;
    if (activeTabId !== "today" && activeTabId !== "tomorrow") {
      return normalizeTravelDateParam(activeTabId) ?? undefined;
    }
    return undefined;
  }, [customDate, activeTabId, tomorrowIso]);

  // URL → state restoration. Declared before the state→URL effect so a
  // back/forward navigation restores state before the sync effect runs.
  useEffect(() => {
    if (!weatherContext) return; // state not ready; first load handled below
    const urlDate = normalizeTravelDateParam(searchParams.get("date"));
    const current = stateDate;

    // Invalid or past date: normalize the URL safely (replace, no history),
    // regardless of the loop guards below.
    if (urlDate === undefined && searchParams.has("date")) {
      lastAppliedUrlRef.current = undefined;
      const params = new URLSearchParams(searchParams);
      params.delete("date");
      if (params.toString() !== searchParams.toString()) {
        setSearchParams(params, { replace: true });
      }
      return;
    }

    // Clear own in-flight write ref if the URL has caught up to it
    if (urlDate === lastWrittenUrlRef.current) {
      lastWrittenUrlRef.current = undefined;
    }

    // State already aligned with this URL value (also re-anchors the loop
    // guard), or this URL value was already applied to state.
    if (urlDate === current) {
      lastAppliedUrlRef.current = urlDate;
      return;
    }
    if (urlDate === lastAppliedUrlRef.current) return;
    lastAppliedUrlRef.current = urlDate;

    if (urlDate !== undefined) {
      setHasExplicitSelection(true);
      restoreInFlightRef.current = true;
      handleCustomDateSelect(urlDate);
      return;
    }
    if (current) {
      // URL no longer carries a date: reset the selection to today.
      setHasExplicitSelection(false);
      restoreInFlightRef.current = true;
      setWeatherContext((prev) =>
        prev
          ? { ...prev, tabs: prev.tabs.filter((tab) => !tab.isCustom) }
          : prev,
      );
      setActiveTabId("today");
      setCustomDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, weatherContext, stateDate]);

  // state → URL synchronization. Any non-restore state change is a
  // deliberate selection and pushes a history entry; invalid/past URL
  // normalization is handled separately in the URL→state effect with
  // replace and never reaches this effect.
  useEffect(() => {
    if (!weatherContext) return; // wait for the initial restore to settle
    const urlDate = normalizeTravelDateParam(searchParams.get("date"));
    if (stateDate === urlDate) return; // aligned
    if (restoreInFlightRef.current) {
      // URL→state restoration applied in this commit; never overwrite it.
      // The next render aligns state with the URL.
      restoreInFlightRef.current = false;
      return;
    }
    if (stateDate === lastWrittenUrlRef.current) {
      // Our own write is still settling through the router (transition
      // lag); wait for the URL state to catch up instead of writing again.
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (stateDate) params.set("date", stateDate);
    else params.delete("date");
    lastWrittenUrlRef.current = stateDate;
    setSearchParams(params);
  }, [weatherContext, stateDate, searchParams, setSearchParams]);

  const forecastSelection = useMemo(() => {
    if (activeTabId === "today") return { type: "today" } as const;
    if (activeTabId === "tomorrow") return { type: "tomorrow" } as const;
    return { type: "custom", date: customDate || activeTabId } as const;
  }, [activeTabId, customDate]);

  /**
   * Planned travel date derived from the user's forecast selection. This is
   * the only temporal input ferry availability may use — never the clock.
   */
  const ferryTemporal = useMemo(() => {
    if (forecastSelection.type === "custom" && forecastSelection.date) {
      const [year, month, day] = forecastSelection.date.split("-").map(Number);
      if (year && month && day) {
        return { travelDate: new Date(year, month - 1, day, 12) };
      }
    }
    if (forecastSelection.type === "today") {
      return { travelDate: new Date() };
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { travelDate: tomorrow };
  }, [forecastSelection]);

  const travelDateIso = useMemo(() => {
    const date = ferryTemporal.travelDate;
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [ferryTemporal]);

  const {
    vibe,
    setVibe,
    tripDuration,
    setTripDuration,
    partySize,
    setPartySize,
    budgetTier,
    setBudgetTier,
    transportPreference,
    setTransportPreference,
    tripMode,
    setTripMode,
    accommodationAllowance,
    setAccommodationAllowance,
    resolvedDraft,
    resolvedApplied,
    hasUserApplied,
    isDirty,
    applyPlannerState,
  } = useTripPlannerState(user, forecastSelection);

  const currentSituation = useMemo(() => {
    if (!weatherContext || !currentTab) return null;
    return getTabWeatherSummary(currentTab, weatherContext.forecastMap);
  }, [weatherContext, currentTab]);
  const weatherLabel = currentSituation
    ? t(
        `home.weatherConditions.${currentSituation.desc.toLowerCase().replace(/\s+/g, "")}`,
        { defaultValue: currentSituation.desc },
      )
    : "";
  const CurrentWeatherIcon =
    currentSituation?.icon === "rain"
      ? Cloud
      : currentSituation?.icon === "snow"
        ? Snowflake
        : currentSituation?.icon === "storm"
          ? CloudLightning
          : currentSituation?.icon === "cloud"
            ? Cloud
            : Sun;

  const selectedDate =
    customDate || currentTab?.dates?.[0] || weatherContext?.minDate;
  const travelDates = useMemo(() => {
    if (!selectedDate) return undefined;
    return deriveTripDates(selectedDate, resolvedApplied.tripMode);
  }, [selectedDate, resolvedApplied.tripMode]);
  const forecastMap = useMemo(
    () =>
      weatherContext?.forecastMap instanceof Map
        ? weatherContext.forecastMap
        : undefined,
    [weatherContext],
  );
  const [rouletteOpen, setRouletteOpen] = useState(false);

  // Recommendation engine consumes applied state + live weather context
  const { recommendedDestinations, rouletteCandidates, rouletteExpansion } =
    useTripRecommendations({
      allDestinations,
      // The live origin forecast is display-only (date tabs / picker); it is
      // never passed into destination recommendation scoring.
      vibe: resolvedApplied.vibe,
      budget: resolvedApplied.budget,
      carMode: resolvedApplied.carMode,
      publicModes: resolvedApplied.publicModes,
      partySize: resolvedApplied.partySize,
      budgetTier: resolvedApplied.budgetTier,
      tripDuration: resolvedApplied.tripDuration,
      homeStationCoords,
      homeStationTransportZoneId,
      ferryTemporal,
      isVisited,
      rouletteConstraints: resolvedDraft,
      tripMode: resolvedApplied.tripMode,
      accommodationAllowance: resolvedApplied.accommodationAllowance,
      travelDates,
      forecastMap,
      rouletteEnabled: rouletteOpen,
    });

  const railConfig = getHomepageRailConfig(
    resolvedApplied.tripMode,
    resolvedApplied.tripDuration,
  );
  const isWeekendMode = railConfig.includes("weekendGetaways");
  const seasonalReferenceDate = useMemo(() => new Date(), []);
  const currentSeason = useMemo(
    () => getFixedSeason(seasonalReferenceDate),
    [seasonalReferenceDate],
  );
  const visitedIds = useMemo(
    () =>
      allDestinations
        .filter((destination) => isVisited(destination.id))
        .map((destination) => destination.id),
    [allDestinations, isVisited],
  );
  const recentDestinations = useRecentlyViewedDestinations();
  const topMatchIds = useMemo(
    () =>
      recommendedDestinations.slice(0, 10).map((destination) => destination.id),
    [recommendedDestinations],
  );
  const recentlyViewedDestinations = useMemo(
    () => orderRecentlyViewedDestinations(recentDestinations, topMatchIds),
    [recentDestinations, topMatchIds],
  );
  const bucketListDisplayedIds = useMemo(
    () =>
      favorites
        .map((id) =>
          allDestinations.find((destination) => destination.id === id),
        )
        .filter(
          (destination): destination is Destination =>
            destination !== undefined,
        )
        .slice(0, 10)
        .map((destination) => destination.id),
    [allDestinations, favorites],
  );
  const discoveryRails = useMemo(() => {
    const originRailContext: OriginRailContext = {
      homeStationCoords,
      homeStationTransportZoneId,
      carMode: resolvedApplied.carMode,
      publicModes: resolvedApplied.publicModes,
      budgetTier: resolvedApplied.budgetTier,
      ferryTemporal,
      visitedIds,
      tripMode: resolvedApplied.tripMode,
    };
    const usedIds = new Set(topMatchIds);
    recentlyViewedDestinations.forEach((destination) =>
      usedIds.add(destination.id),
    );
    bucketListDisplayedIds.forEach((id) => usedIds.add(id));
    const pick = (
      candidates: Destination[],
      qualityOf?: (candidate: Destination) => number,
      duplicateQualityMargin?: number,
    ) => {
      const selected = softDeduplicateRail(
        candidates,
        usedIds,
        10,
        qualityOf,
        duplicateQualityMargin,
      );
      selected.forEach((destination) => usedIds.add(destination.id));
      return selected;
    };

    if (isWeekendMode) {
      const weekendGetaways = pick(
        getWeekendGetawayDestinations(recommendedDestinations),
      );
      const seasonal = pick(
        getSeasonalDiscoveryDestinations(
          recommendedDestinations,
          seasonalReferenceDate,
        ),
      );
      const longerJourney = pick(
        getWorthLongerJourneyDestinations(recommendedDestinations),
      );
      return {
        weekendGetaways,
        seasonal,
        longerJourney,
        under60: [],
        nearby: [],
      };
    }

    const seasonal = pick(
      getSeasonalDiscoveryDestinations(
        recommendedDestinations,
        seasonalReferenceDate,
      ),
    );
    const under60 = pick(
      getUnder60Destinations(recommendedDestinations, originRailContext),
    );
    const nearby = pick(
      getUnexploredNearbyDestinations(allDestinations, originRailContext),
      (destination) =>
        homeStationCoords && destination.coordinates
          ? -getDistance(
              homeStationCoords.lat,
              homeStationCoords.lng,
              destination.coordinates.lat,
              destination.coordinates.lng,
            )
          : Number.NEGATIVE_INFINITY,
      0,
    );
    return {
      seasonal,
      under60,
      nearby,
      weekendGetaways: [],
      longerJourney: [],
    };
  }, [
    recommendedDestinations,
    topMatchIds,
    recentlyViewedDestinations,
    bucketListDisplayedIds,
    homeStationCoords,
    homeStationTransportZoneId,
    resolvedApplied.carMode,
    resolvedApplied.publicModes,
    allDestinations,
    resolvedApplied.budgetTier,
    ferryTemporal,
    visitedIds,
    resolvedApplied.tripMode,
    isWeekendMode,
    seasonalReferenceDate,
  ]);

  const handleApplyAndScroll = useCallback(() => {
    applyPlannerState();
    const el = document.getElementById("recommendations");
    if (el) {
      el.scrollIntoView?.({ behavior: "smooth" });
      el.focus();
    }
  }, [applyPlannerState]);

  const hasSavedItems = favorites.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero & Full-Width Planner Section */}
      <section className="relative overflow-x-clip bg-slate-50 pb-6 pt-6 sm:pb-8 sm:pt-8 lg:pb-8 lg:pt-10 dark:bg-slate-950">
        <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:linear-gradient(0deg,transparent,black)] -z-10" />
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-3 flex flex-col items-center gap-1.5 sm:mb-5 sm:gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <StationInput />
            </div>

            {weatherContext && (
              <div className="grid w-full grid-cols-2 items-center gap-1 sm:w-[450px] sm:max-w-full sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(105px,125px)] sm:gap-1.5">
                {weatherContext.tabs
                  .filter((tab) => tab.id === "today" || tab.id === "tomorrow")
                  .map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        if (weatherContext && !tab.isCustom) {
                          const cleanTabs = weatherContext.tabs.filter(
                            (t) => !t.isCustom,
                          );
                          setWeatherContext({
                            ...weatherContext,
                            tabs: cleanTabs,
                          });
                          setCustomDate(null);
                        }
                        setActiveTabId(tab.id);
                      }}
                      className={`inline-flex h-9 min-w-0 w-full items-center justify-center overflow-hidden whitespace-nowrap rounded-full px-1 py-1 text-[10px] font-bold transition-all focus:outline-none sm:px-1.5 sm:text-[11px] ${
                        activeTabId === tab.id
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      {t(`home.dateTabs.${tab.id}`, {
                        defaultValue: tab.label,
                      })}
                      {activeTabId === tab.id && currentSituation && (
                        <>
                          <span className="mx-0.5">·</span>
                          <span className="inline-flex items-center gap-0.5 sm:hidden">
                            <CurrentWeatherIcon className="size-3 shrink-0" />
                            {currentSituation.temp}°
                          </span>
                          <span className="hidden sm:inline">
                            {weatherLabel} {currentSituation.temp}°
                          </span>
                        </>
                      )}
                    </button>
                  ))}

                <div className="relative col-span-2 min-w-0 sm:col-span-1">
                  <TravelDatePicker
                    value={stateDate}
                    onChange={(newDate) => {
                      setHasExplicitSelection(true);
                      if (newDate) {
                        handleCustomDateSelect(newDate);
                      } else {
                        const cleanTabs = weatherContext.tabs.filter(
                          (t) => !t.isCustom,
                        );
                        setWeatherContext({
                          ...weatherContext,
                          tabs: cleanTabs,
                        });
                        setCustomDate(null);
                        setActiveTabId("today");
                      }
                    }}
                    hasExplicitSelection={hasExplicitSelection}
                    forecastMap={weatherContext.forecastMap}
                    originLabel={
                      originSource === "current"
                        ? t("origin.currentLocation")
                        : getLocalizedStationLabel(homeStation, locale)
                    }
                    tripMode={resolvedApplied.tripMode}
                    allowAnyDate={false}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mx-auto mb-4 max-w-3xl text-center sm:mb-6">
            <h1 className="text-[27px] leading-[1.08] sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t("home.headline")}
            </h1>
            {/* KAI-114: understated Katakana brand association under the
                Japanese hero — visible on every screen size, JA-only. */}
            {locale === "ja" && (
              <p
                data-testid="home-brand-association"
                className="mt-1.5 text-xs font-semibold tracking-wide text-slate-400 dark:text-slate-500"
              >
                {t("home.brandAssociation")}
              </p>
            )}
            <p className="mt-2 hidden text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400 sm:block md:text-base">
              {t(
                resolvedApplied.tripMode === "weekend_2d1n"
                  ? "home.subtitleWeekend"
                  : "home.subtitle",
              )}
            </p>
          </div>

          {/* Full-Width Planner Surface */}
          <HomePlanner
            vibe={vibe}
            onVibeChange={setVibe}
            tripDuration={tripDuration}
            onTripDurationChange={setTripDuration}
            partySize={partySize}
            onPartySizeChange={setPartySize}
            budgetTier={budgetTier}
            onBudgetTierChange={setBudgetTier}
            transportPreference={transportPreference}
            onTransportPreferenceChange={setTransportPreference}
            tripMode={tripMode}
            onTripModeChange={setTripMode}
            accommodationAllowance={accommodationAllowance}
            onAccommodationAllowanceChange={setAccommodationAllowance}
            hasUserApplied={hasUserApplied}
            isDirty={isDirty}
            onApplyMatches={handleApplyAndScroll}
            onSurpriseMe={() => setRouletteOpen(true)}
          />
        </div>
      </section>

      {/* Destination Roulette Modal */}
      <RouletteModal
        isOpen={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        candidates={rouletteCandidates as Destination[]}
        partySize={resolvedDraft.partySize}
        carMode={resolvedDraft.carMode}
        publicModes={resolvedDraft.publicModes}
        tripDuration={resolvedDraft.tripDuration}
        tripMode={resolvedDraft.tripMode}
        expansion={rouletteExpansion}
      />

      {/* Section 1: Top Matches Section */}
      <TopMatchesSection
        recommendations={recommendedDestinations}
        hasUserApplied={hasUserApplied}
        appliedState={resolvedApplied}
        travelDate={travelDateIso}
        viewAllDate={
          forecastSelection.type === "today" ? undefined : travelDateIso
        }
      />

      {/* Recently viewed remains conditional and sits directly below Top matches. */}
      <RecentlyViewedRail
        destinations={recentlyViewedDestinations}
        partySize={resolvedApplied.partySize}
        carMode={resolvedApplied.carMode}
        publicModes={resolvedApplied.publicModes}
        travelDate={travelDateIso}
      />

      {/* Bucket List remains conditional and keeps its existing user-data semantics. */}
      {hasSavedItems && (
        <BucketListRail
          partySize={resolvedApplied.partySize}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
          travelDate={travelDateIso}
        />
      )}

      {isWeekendMode ? (
        <>
          <DiscoveryRail
            kind="weekendGetaways"
            destinations={discoveryRails.weekendGetaways}
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
          <DiscoveryRail
            kind="seasonal"
            season={currentSeason}
            destinations={discoveryRails.seasonal}
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
          <DiscoveryRail
            kind="longerJourney"
            destinations={discoveryRails.longerJourney}
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
        </>
      ) : (
        <>
          <DiscoveryRail
            kind="seasonal"
            season={currentSeason}
            destinations={discoveryRails.seasonal}
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
          <DiscoveryRail
            kind="under60"
            destinations={discoveryRails.under60}
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
          <UnexploredNearbyRail
            destinations={allDestinations}
            precomputedDestinations={discoveryRails.nearby}
            homeStationCoords={homeStationCoords}
            homeStationTransportZoneId={homeStationTransportZoneId}
            isVisited={isVisited}
            partySize={resolvedApplied.partySize}
            carMode={resolvedApplied.carMode}
            publicModes={resolvedApplied.publicModes}
            travelDate={travelDateIso}
          />
        </>
      )}

      {/* Curated Collections Rail */}
      <CollectionsRail />

      {/* Compact Prompt Banner near bottom for empty/signed-out states */}
      {!hasSavedItems && (
        <BucketListRail
          partySize={resolvedApplied.partySize}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
          travelDate={travelDateIso}
          isCompactPromptOnly
        />
      )}
    </div>
  );
}
