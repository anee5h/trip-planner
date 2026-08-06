import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  Cloud,
  CloudLightning,
  Snowflake,
  Sun,
  X,
} from "lucide-react";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import {
  getTabWeatherSummary,
  getNextCalendarDate,
  getForecastDaysForRange,
} from "@/shared/services/weather/WeatherTabService";
import { normalizeWeatherDescription } from "@/shared/services/recommendation/RecommendationContext";
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
import WeatherContextRail from "./components/WeatherContextRail";
import CollectionsRail from "./components/CollectionsRail";
import UnexploredNearbyRail from "./components/UnexploredNearbyRail";
import { useTranslation } from "react-i18next";
import StationInput from "@/shared/components/StationInput";

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
  const { t, i18n } = useTranslation();
  const allDestinations = getDestinationList() as Destination[];

  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isVisited,
    favorites,
    homeStationCoords,
    homeStationTransportZoneId,
  } = useTripStore();
  const { user } = useAuth();

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

  // The date serialized by the current selection: today omits the param,
  // tomorrow and custom dates serialize the ISO date.
  const stateDate = useMemo(() => {
    if (customDate) return normalizeTravelDateParam(customDate) ?? undefined;
    if (activeTabId === "tomorrow") return tomorrowIso;
    return undefined;
  }, [customDate, activeTabId, tomorrowIso]);

  // URL → state restoration. Declared before the state→URL effect so a
  // back/forward navigation restores state before the sync effect runs.
  useEffect(() => {
    if (!weatherContext) return; // state not ready; first load handled below
    const urlDate = normalizeTravelDateParam(searchParams.get("date"));
    const current =
      customDate ?? (activeTabId === "tomorrow" ? tomorrowIso : undefined);

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

    // State already aligned with this URL value (also re-anchors the loop
    // guard), or this URL value was already applied to state.
    if (urlDate === current) {
      lastAppliedUrlRef.current = urlDate;
      return;
    }
    if (urlDate === lastAppliedUrlRef.current) return;
    lastAppliedUrlRef.current = urlDate;

    if (urlDate !== undefined) {
      restoreInFlightRef.current = true;
      handleCustomDateSelect(urlDate);
      return;
    }
    if (current) {
      // URL no longer carries a date: reset the selection to today.
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
  }, [searchParams, weatherContext]);

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

  // Weekend weather forecast days derivation
  const weatherDays = useMemo(() => {
    if (resolvedApplied.tripMode !== "weekend_2d1n") return undefined;
    if (!weatherContext) return undefined;
    const day1Iso =
      customDate ?? currentTab?.dates?.[0] ?? weatherContext.minDate;
    if (!day1Iso) return undefined;
    return getForecastDaysForRange(weatherContext.forecastMap, day1Iso, 2).map(
      (d) => ({
        date: d.date,
        condition: normalizeWeatherDescription(d.desc),
        temperatureC: d.maxTemp,
      }),
    );
  }, [resolvedApplied.tripMode, customDate, currentTab, weatherContext]);

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

  // Recommendation engine consumes applied state + live weather context
  const { recommendedDestinations, rouletteCandidates, rouletteExpansion } =
    useTripRecommendations({
      allDestinations,
      actualWeather: currentSituation
        ? { desc: currentSituation.desc, temperatureC: currentSituation.temp }
        : undefined,
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
      weatherDays,
      travelDates,
      forecastMap,
    });

  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);
  const forecastDates = useMemo(() => {
    if (!weatherContext) return [];
    const dates: string[] = [];
    const cursor = new Date(`${weatherContext.minDate}T00:00:00`);
    const end = new Date(`${weatherContext.maxDate}T00:00:00`);
    while (cursor <= end) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }, [weatherContext]);

  const formatForecastDate = useCallback(
    (date: string) => {
      const [year, month, day] = date.split("-").map(Number);
      return new Intl.DateTimeFormat(
        i18n.language === "ja" ? "ja-JP" : "en-US",
        { weekday: "short", month: "short", day: "numeric" },
      ).format(new Date(year, month - 1, day));
    },
    [i18n.language],
  );
  const selectedDateLabel = useMemo(() => {
    if (resolvedApplied.tripMode === "weekend_2d1n" && selectedDate) {
      const day2 = getNextCalendarDate(selectedDate);
      return t("home.weekendDates", {
        day1: formatForecastDate(selectedDate),
        day2: formatForecastDate(day2),
      });
    }
    if (activeTabId === "today" || activeTabId === "tomorrow") {
      return t("home.moreDates");
    }
    if (!selectedDate) return t("home.moreDates");
    const [year, month, day] = selectedDate.split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language === "ja" ? "ja-JP" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day));
  }, [
    activeTabId,
    i18n.language,
    selectedDate,
    t,
    resolvedApplied.tripMode,
    formatForecastDate,
  ]);

  /**
   * Compact visible label for narrow screens: "Aug 8–9" / "8/8〜8/9". The
   * full weekday/date label stays available via aria-label and title.
   */
  const compactDateLabel = useMemo(() => {
    if (resolvedApplied.tripMode === "weekend_2d1n" && selectedDate) {
      return formatCompactDateRange(
        selectedDate,
        getNextCalendarDate(selectedDate),
        i18n.language === "ja" ? "ja" : "en",
      );
    }
    if (!selectedDate) return t("home.moreDates");
    return formatCompactDate(
      selectedDate,
      i18n.language === "ja" ? "ja" : "en",
    );
  }, [i18n.language, resolvedApplied.tripMode, selectedDate, t]);

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
                  <button
                    type="button"
                    onClick={() => setDatePickerOpen((open) => !open)}
                    aria-label={selectedDateLabel}
                    title={selectedDateLabel}
                    className="inline-flex h-9 w-full min-w-0 max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border border-slate-200 bg-white px-1 py-1 text-[10px] font-bold text-slate-700 shadow-sm transition-colors hover:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 sm:px-1.5 sm:text-[11px]"
                    aria-expanded={datePickerOpen}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="min-w-0 truncate">{compactDateLabel}</span>
                  </button>
                  {datePickerOpen && (
                    <>
                      <button
                        type="button"
                        aria-label={t("home.closeForecastDayPicker")}
                        className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm sm:hidden"
                        onClick={() => setDatePickerOpen(false)}
                      />
                      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 pb-[env(safe-area-inset-bottom)] shadow-2xl dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))] sm:absolute sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:w-[calc(100vw-2rem)] sm:max-w-sm sm:rounded-2xl">
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-base font-extrabold text-slate-900 dark:text-[hsl(var(--text-primary))]">
                            {t("home.chooseForecastDay")}
                          </h2>
                          <button
                            type="button"
                            aria-label={t("home.closeForecastDayPicker")}
                            onClick={() => setDatePickerOpen(false)}
                            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[hsl(var(--surface-raised))]"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {forecastDates.map((date) => {
                            const active = date === selectedDate;
                            const forecast =
                              weatherContext?.forecastMap instanceof Map
                                ? weatherContext.forecastMap.get(date)
                                : undefined;
                            const ForecastIcon =
                              forecast?.icon === "rain"
                                ? Cloud
                                : forecast?.icon === "snow"
                                  ? Snowflake
                                  : forecast?.icon === "storm"
                                    ? CloudLightning
                                    : forecast?.icon === "cloud"
                                      ? Cloud
                                      : Sun;
                            return (
                              <button
                                key={date}
                                type="button"
                                onClick={() => {
                                  setCustomDate(date);
                                  handleCustomDateSelect(date);
                                  setDatePickerOpen(false);
                                }}
                                className={`min-h-14 rounded-xl px-3 text-left text-xs font-bold transition-colors ${
                                  active
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-50 text-slate-700 hover:bg-emerald-50 dark:bg-[hsl(var(--surface-raised))] dark:text-slate-200 dark:hover:bg-slate-700"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <ForecastIcon className="h-4 w-4 shrink-0" />
                                  <span>{formatForecastDate(date)}</span>
                                </span>
                                {forecast && (
                                  <span
                                    className={`mt-1 block pl-6 text-[10px] ${active ? "text-emerald-50" : "text-slate-400"}`}
                                  >
                                    {forecast.maxTemp}°C
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {/* The forecast grid is live weather at the selected
                            origin (never destination weather); the native
                            date input below extends selection beyond the
                            forecast window without any fabricated forecast. */}
                        <p className="mt-2 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          {t("home.originForecastHint")}
                        </p>
                        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <label
                            htmlFor="any-future-date"
                            className="mb-1.5 block text-[11px] font-bold text-slate-500 dark:text-slate-400"
                          >
                            {t("home.anyFutureDate")}
                          </label>
                          <input
                            id="any-future-date"
                            type="date"
                            min={todayIso}
                            value={selectedDate ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (!value) return;
                              setCustomDate(value);
                              handleCustomDateSelect(value);
                            }}
                            aria-label={t("home.anyFutureDate")}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          />
                          {resolvedApplied.tripMode === "weekend_2d1n" &&
                            selectedDate && (
                              <p className="mt-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                {t("home.day2Label")}:{" "}
                                {formatCompactDate(
                                  getNextCalendarDate(selectedDate),
                                  i18n.language === "ja" ? "ja" : "en",
                                )}
                              </p>
                            )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mx-auto mb-4 max-w-3xl text-center sm:mb-6">
            <h1 className="text-[27px] leading-[1.08] sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t("home.headline")}
            </h1>
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

      {/* Unexplored Nearby Rail — nearest unvisited destinations from home origin.
          Only shown for day trips; weekend mode has its own recommendation rail. */}
      {resolvedApplied.tripMode !== "weekend_2d1n" && (
        <UnexploredNearbyRail
          destinations={allDestinations}
          homeStationCoords={homeStationCoords}
          isVisited={isVisited}
          partySize={resolvedApplied.partySize}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
        />
      )}

      {/* Conditional Placement: Bucket List Rail near top ONLY if user has saved items */}
      {hasSavedItems && (
        <BucketListRail
          partySize={resolvedApplied.partySize}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
        />
      )}

      {/* Weather Context Rail (Max 2 Overlap Rule, hides if <3 distinct results) */}
      <WeatherContextRail
        recommendations={recommendedDestinations}
        weatherDesc={currentSituation?.desc}
        temperatureC={currentSituation?.temp}
        partySize={resolvedApplied.partySize}
        carMode={resolvedApplied.carMode}
        publicModes={resolvedApplied.publicModes}
      />

      {/* Curated Collections Rail */}
      <CollectionsRail />

      {/* Compact Prompt Banner near bottom for empty/signed-out states */}
      {!hasSavedItems && (
        <BucketListRail
          partySize={resolvedApplied.partySize}
          carMode={resolvedApplied.carMode}
          publicModes={resolvedApplied.publicModes}
          isCompactPromptOnly
        />
      )}
    </div>
  );
}
