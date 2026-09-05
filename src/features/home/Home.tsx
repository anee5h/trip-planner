import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Cloud, CloudLightning, Snowflake, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { useHomeDateState } from "@/features/home/state/HomeDateStateContext";
import { HomeDateStateProvider } from "@/features/home/state/HomeDateStateContext";
import {
  HomePlannerStateProvider,
  useHomePlannerState,
} from "@/features/home/state/HomePlannerStateContext";
import HomePlanner from "./components/HomePlanner";
import StationInput from "@/shared/components/StationInput";
import HomeDatePicker from "@/shared/components/travel/HomeDatePicker";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedStationLabel } from "@/shared/utils/formatOriginLocation";
import { getTabWeatherSummary } from "@/shared/services/weather/WeatherTabService";
import { HOME_RAIL_SECTION_SPACING } from "./components/HomeRailLayout";
import type { HomePendingAction } from "./state/HomeAction";
import type { TransportSelection } from "./services/TransportResolver";
import type { HomepageTripDuration } from "@/shared/types/tripDuration";

const HeavyHome = lazy(() => import("./HomeHeavy"));

/** Compact single-date label: "Aug 8" / "8/8". */
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

/** Compact two-day range label used by the weekend date control. */
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

const HOME_WEATHER_TABS_CLASS =
  "grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)] items-center gap-1 sm:w-[450px] sm:max-w-full sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(105px,125px)] sm:gap-1.5";

function HomeHeavyFallback() {
  return (
    <section
      aria-hidden="true"
      data-top-matches-placeholder
      className={`bg-white ${HOME_RAIL_SECTION_SPACING} dark:bg-slate-950`}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
          <div className="min-w-0">
            <div className="h-7 w-48 animate-pulse rounded bg-slate-200/70 dark:bg-slate-800/70 sm:h-8" />
            <div className="mt-1 h-4 w-64 animate-pulse rounded bg-slate-200/60 dark:bg-slate-800/60" />
          </div>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-hidden px-4 py-2 md:mx-0 md:px-10 sm:gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-40 w-[46vw] min-w-[160px] max-w-[180px] shrink-0 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 sm:w-[250px] sm:min-w-[250px] sm:max-w-[250px]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeSurface() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { homeStation, originSource } = useTripStore();
  const {
    weatherContext,
    setWeatherContext,
    activeTabId,
    setActiveTabId,
    setCustomDate,
    currentTab,
    handleCustomDateSelect,
    stateDate,
    hasExplicitSelection,
    setHasExplicitSelection,
  } = useHomeDateState();
  const {
    vibe,
    setVibe,
    tripDuration,
    setTripDuration,
    partySize,
    setPartySize,
    budgetTier,
    setBudgetTier,
    publicTransport,
    setPublicTransport,
    carMode,
    setCarMode,

    hasUserApplied,
    isDirty,
    applyPlannerState,
  } = useHomePlannerState();

  const [pendingAction, setPendingAction] = useState<HomePendingAction>(null);
  const actionIdRef = useRef(0);
  const requestAction = useCallback((type: "find" | "surprise") => {
    actionIdRef.current += 1;
    setPendingAction({ id: actionIdRef.current, type });
  }, []);
  const onActionConsumed = useCallback((id: number) => {
    setPendingAction((current) => (current?.id === id ? null : current));
  }, []);

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

  const dateTabs = weatherContext?.tabs.filter(
    (tab) => tab.id === "today" || tab.id === "tomorrow",
  ) ?? [
    { id: "today", label: t("home.dateTabs.today"), dates: [] },
    { id: "tomorrow", label: t("home.dateTabs.tomorrow"), dates: [] },
  ];

  const clearCustomDate = () => {
    if (weatherContext) {
      setWeatherContext({
        ...weatherContext,
        tabs: weatherContext.tabs.filter((tab) => !tab.isCustom),
      });
    }
    setCustomDate(null);
    setActiveTabId("today");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <section className="home-compact-surface relative overflow-x-clip bg-slate-50 pb-5 pt-5 sm:pb-8 sm:pt-8 lg:pb-8 lg:pt-10 dark:bg-slate-950">
        <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:linear-gradient(0deg,transparent,black)] -z-10" />
        <div className="container mx-auto max-w-6xl px-4">
          <div className="home-compact-heading mx-auto mb-2.5 max-w-3xl text-center sm:mb-3">
            <h1
              data-testid="home-headline"
              className="text-[27px] font-extrabold leading-[1.05] tracking-tight text-slate-900 dark:text-white sm:text-4xl sm:leading-[1.08] lg:text-5xl"
            >
              {t("home.headline")}
            </h1>
            <p
              data-testid="home-value-proposition"
              className="home-value-proposition mt-2.5 text-sm font-semibold leading-snug text-slate-500 dark:text-slate-300 sm:mt-3 sm:text-base"
            >
              {t("home.valueProposition")}
            </p>
          </div>

          <div
            className="mb-4 flex flex-col items-center gap-2 sm:mb-5 sm:gap-2"
            data-home-origin-date-ready
          >
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <StationInput />
            </div>

            <div className="contents" data-home-weather-shell>
              <div className={HOME_WEATHER_TABS_CLASS}>
                {dateTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (weatherContext && !tab.isCustom) {
                        setWeatherContext({
                          ...weatherContext,
                          tabs: weatherContext.tabs.filter(
                            (item) => !item.isCustom,
                          ),
                        });
                        setCustomDate(null);
                      }
                      setActiveTabId(tab.id);
                    }}
                    className={`inline-flex h-9 min-w-0 w-full items-center justify-center overflow-hidden whitespace-nowrap rounded-full px-1 py-1 text-[10px] font-bold transition-all focus:outline-none sm:px-1.5 sm:text-[11px] ${
                      activeTabId === tab.id
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {t(`home.dateTabs.${tab.id}`, { defaultValue: tab.label })}
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

                <div className="relative min-w-0 sm:col-span-1">
                  <HomeDatePicker
                    value={stateDate}
                    onChange={(newDate) => {
                      setHasExplicitSelection(true);
                      if (newDate) {
                        handleCustomDateSelect(newDate);
                      } else {
                        clearCustomDate();
                      }
                    }}
                    hasExplicitSelection={hasExplicitSelection}
                    forecastMap={weatherContext?.forecastMap}
                    originLabel={
                      originSource === "current"
                        ? t("origin.currentLocation")
                        : getLocalizedStationLabel(homeStation, locale)
                    }
                    duration={tripDuration}
                    allowAnyDate={false}
                  />
                </div>
              </div>
            </div>
          </div>

          <div data-home-planner-ready data-testid="home-planner">
            <HomePlanner
              vibe={vibe}
              onVibeChange={setVibe}
              tripDuration={tripDuration}
              onTripDurationChange={setTripDuration}
              partySize={partySize}
              onPartySizeChange={setPartySize}
              budgetTier={budgetTier}
              onBudgetTierChange={setBudgetTier}
              publicTransport={publicTransport}
              onPublicTransportChange={setPublicTransport}
              carMode={carMode}
              onCarModeChange={setCarMode}

              hasUserApplied={hasUserApplied}
              isDirty={isDirty}
              onApplyMatches={() => {
                applyPlannerState();
                requestAction("find");
              }}
              onSurpriseMe={() => requestAction("surprise")}
            />
          </div>
        </div>
      </section>

      <Suspense fallback={<HomeHeavyFallback />}>
        <HeavyHome
          pendingAction={pendingAction}
          onActionConsumed={onActionConsumed}
        />
      </Suspense>
    </div>
  );
}

export default function Home() {
  const { user, updateUserProfile } = useAuth();
  const { homeStationCoords } = useTripStore();
  const persistPlannerPreferences = useCallback(
    (
      preferences: TransportSelection & {
        tripDuration: HomepageTripDuration;
        partySize: number;
      },
    ) => {
      if (!user) return;
      const existingPreferences =
        (user.user_metadata?.preferences as
          Record<string, unknown> | undefined) ?? {};
      void updateUserProfile({
        preferences: {
          ...existingPreferences,
          carMode: preferences.carMode,
          publicModes: preferences.publicModes,
          tripDuration: preferences.tripDuration,
          partySize: preferences.partySize,
          preferences_set: true,
        },
      });
    },
    [updateUserProfile, user],
  );
  return (
    <HomePlannerStateProvider
      user={user}
      onPlannerPreferencesPersist={persistPlannerPreferences}
    >
      <HomeDateStateProvider homeStationCoords={homeStationCoords ?? null}>
        <HomeSurface />
      </HomeDateStateProvider>
    </HomePlannerStateProvider>
  );
}
