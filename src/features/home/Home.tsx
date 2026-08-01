import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin } from "lucide-react";
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

export default function Home() {
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
  const { recommendedDestinations, rouletteCandidates } =
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
    });

  const [rouletteOpen, setRouletteOpen] = useState(false);

  const handleApplyAndScroll = useCallback(() => {
    applyPlannerState();
    const el = document.getElementById("recommendations");
    if (el) {
      el.scrollIntoView?.({ behavior: "smooth" });
      el.focus?.();
    }
  }, [applyPlannerState]);

  const hasSavedItems = favorites.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero & Full-Width Planner Section */}
      <section className="relative pt-6 pb-6 sm:pt-8 sm:pb-8 lg:pt-10 lg:pb-10 overflow-hidden bg-slate-50 dark:bg-slate-950">
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
                  Change
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

                {/* Custom Date Picker */}
                <div className="relative inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm hover:border-emerald-500 transition-colors">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <input
                    type="date"
                    min={weatherContext.minDate}
                    max={weatherContext.maxDate}
                    value={customDate || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setCustomDate(val);
                        handleCustomDateSelect(val);
                      }
                    }}
                    className="bg-transparent border-none p-0 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                    title="Pick custom forecast date"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Centered Headline with Scaled Mobile Typography (28px) */}
          <div className="text-center max-w-3xl mx-auto mb-6">
            <h1 className="text-[28px] leading-[1.08] sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Where will you go next?
            </h1>
            <p className="text-[13px] sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
              Personalized day-trip ideas based on your time, budget, and travel
              style.
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
