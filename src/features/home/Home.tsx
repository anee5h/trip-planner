import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Cloud,
  CloudLightning,
  MapPin,
  Snowflake,
  Sun,
  X,
} from "lucide-react";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { getTabWeatherSummary } from "@/shared/services/weather/WeatherTabService";
import RouletteModal from "@/features/home/components/RouletteModal";

import { useTripPlannerState } from "@/features/home/hooks/useTripPlannerState";
import { useWeatherContext } from "@/features/home/hooks/useWeatherContext";
import { useTripRecommendations } from "@/features/home/hooks/useTripRecommendations";
import HomePlanner from "./components/HomePlanner";
import TopMatchesSection from "./components/TopMatchesSection";
import BucketListRail from "./components/BucketListRail";
import WeatherContextRail from "./components/WeatherContextRail";
import CollectionsRail from "./components/CollectionsRail";
import { useTranslation } from "react-i18next";

export default function Home() {
  const { t, i18n } = useTranslation();
  const allDestinations = getDestinationList() as Destination[];

  const { isVisited, favorites, homeStationCoords, homeStation } =
    useTripStore();
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

  const forecastSelection = useMemo(() => {
    if (activeTabId === "today") return { type: "today" } as const;
    if (activeTabId === "tomorrow") return { type: "tomorrow" } as const;
    return { type: "custom", date: customDate || activeTabId } as const;
  }, [activeTabId, customDate]);

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
      isVisited,
      rouletteConstraints: resolvedDraft,
    });

  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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

  const selectedDate =
    customDate || currentTab?.dates?.[0] || weatherContext?.minDate;
  const selectedDateLabel = useMemo(() => {
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
  }, [activeTabId, i18n.language, selectedDate, t]);

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
      <section className="relative overflow-hidden bg-slate-50 pb-6 pt-6 sm:pb-8 sm:pt-8 lg:pb-8 lg:pt-10 dark:bg-slate-950">
        <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:linear-gradient(0deg,transparent,black)] -z-10" />
        <div className="container mx-auto px-4 max-w-6xl">
          {/* 2-Row Mobile Context Controls (No Clipping) */}
          <div className="flex flex-col items-center gap-2 mb-5">
            {/* Row 1: Location & Weather Context */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-none">
                  {homeStation || "Tokyo Station"}
                </span>
                <Link
                  to="/settings?section=general&return=/"
                  className="ml-1 text-emerald-600 dark:text-emerald-400 hover:underline font-extrabold"
                >
                  {t("home.change")}
                </Link>
              </div>

              {currentSituation && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                    {currentSituation.desc} · {currentSituation.temp}°C
                  </span>
                </div>
              )}
            </div>

            {/* Row 2: Weather Date Tabs */}
            {weatherContext && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {weatherContext.tabs.map((tab) => (
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
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all focus:outline-none ${
                      activeTabId === tab.id
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDatePickerOpen((open) => !open)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    aria-expanded={datePickerOpen}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{selectedDateLabel}</span>
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
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Centered Headline with Scaled Mobile Typography (28px) */}
          <div className="text-center max-w-3xl mx-auto mb-6">
            <h1 className="text-[28px] leading-[1.08] sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t("home.headline")}
            </h1>
            <p className="text-[13px] sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
              {t("home.subtitle")}
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
        tripDuration={tripDuration}
        expansion={rouletteExpansion}
      />

      {/* Section 1: Top Matches Section */}
      <TopMatchesSection
        recommendations={recommendedDestinations}
        hasUserApplied={hasUserApplied}
        appliedState={resolvedApplied}
      />

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
