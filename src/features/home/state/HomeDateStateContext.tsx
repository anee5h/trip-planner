import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useWeatherContext } from "@/features/home/hooks/useWeatherContext";
import {
  normalizeTravelDateParam,
  type ForecastDateSelection,
} from "@/shared/types/homePlannerState";
import type {
  WeatherTab,
  WeatherTabContext,
} from "@/shared/services/weather/WeatherTabService";

export interface HomeDateStateValue {
  weatherContext: WeatherTabContext | null;
  setWeatherContext: React.Dispatch<
    React.SetStateAction<WeatherTabContext | null>
  >;
  activeTabId: string;
  setActiveTabId: (tabId: string) => void;
  customDate: string | null;
  setCustomDate: (date: string | null) => void;
  currentTab: WeatherTab | undefined;
  handleCustomDateSelect: (selectedDate: string) => void;
  tomorrowIso: string | undefined;
  stateDate: string | undefined;
  forecastSelection: ForecastDateSelection;
  hasExplicitSelection: boolean;
  setHasExplicitSelection: (selected: boolean) => void;
}

const HomeDateStateContext = createContext<HomeDateStateValue | null>(null);

function useHomeDateStateValue(
  homeStationCoords: { lat: number; lng: number } | null,
): HomeDateStateValue {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const restoreInFlightRef = useRef(false);
  const lastAppliedUrlRef = useRef<string | undefined>(undefined);
  const lastWrittenUrlRef = useRef<string | undefined>(undefined);
  const [hasExplicitSelection, setHasExplicitSelection] = useState<boolean>(
    () => searchParams.has("date"),
  );

  const stateDate = useMemo(() => {
    if (customDate) return normalizeTravelDateParam(customDate) ?? undefined;
    if (activeTabId === "tomorrow") return tomorrowIso;
    if (activeTabId !== "today" && activeTabId !== "tomorrow") {
      return normalizeTravelDateParam(activeTabId) ?? undefined;
    }
    return undefined;
  }, [customDate, activeTabId, tomorrowIso]);

  // URL → state restoration. This is the existing Home synchronization logic,
  // moved behind a state-only interface without changing its guards.
  useEffect(() => {
    if (!weatherContext) return;
    const urlDate = normalizeTravelDateParam(searchParams.get("date"));
    const current = stateDate;

    if (urlDate === undefined && searchParams.has("date")) {
      lastAppliedUrlRef.current = undefined;
      const params = new URLSearchParams(searchParams);
      params.delete("date");
      if (params.toString() !== searchParams.toString()) {
        setSearchParams(params, { replace: true });
      }
      return;
    }

    if (urlDate === lastWrittenUrlRef.current) {
      lastWrittenUrlRef.current = undefined;
    }
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
      setHasExplicitSelection(false);
      restoreInFlightRef.current = true;
      setWeatherContext((previous) =>
        previous
          ? { ...previous, tabs: previous.tabs.filter((tab) => !tab.isCustom) }
          : previous,
      );
      setActiveTabId("today");
      setCustomDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, weatherContext, stateDate]);

  // State → URL synchronization. Deliberate selections push history; restore
  // and normalization paths retain the old replace/guard behavior.
  useEffect(() => {
    if (!weatherContext) return;
    const urlDate = normalizeTravelDateParam(searchParams.get("date"));
    if (stateDate === urlDate) return;
    if (restoreInFlightRef.current) {
      restoreInFlightRef.current = false;
      return;
    }
    if (stateDate === lastWrittenUrlRef.current) return;

    const params = new URLSearchParams(searchParams);
    if (stateDate) params.set("date", stateDate);
    else params.delete("date");
    lastWrittenUrlRef.current = stateDate;
    setSearchParams(params);
  }, [weatherContext, stateDate, searchParams, setSearchParams]);

  const forecastSelection = useMemo<ForecastDateSelection>(() => {
    if (activeTabId === "today") return { type: "today" };
    if (activeTabId === "tomorrow") return { type: "tomorrow" };
    return { type: "custom", date: customDate || activeTabId };
  }, [activeTabId, customDate]);

  return {
    weatherContext,
    setWeatherContext,
    activeTabId,
    setActiveTabId,
    customDate,
    setCustomDate,
    currentTab,
    handleCustomDateSelect,
    tomorrowIso,
    stateDate,
    forecastSelection,
    hasExplicitSelection,
    setHasExplicitSelection,
  };
}

export function HomeDateStateProvider({
  homeStationCoords,
  children,
}: {
  homeStationCoords: { lat: number; lng: number } | null;
  children: React.ReactNode;
}) {
  const value = useHomeDateStateValue(homeStationCoords);
  return (
    <HomeDateStateContext.Provider value={value}>
      {children}
    </HomeDateStateContext.Provider>
  );
}

export function useHomeDateState(): HomeDateStateValue {
  const context = useContext(HomeDateStateContext);
  if (!context) {
    throw new Error(
      "useHomeDateState must be used within HomeDateStateProvider",
    );
  }
  return context;
}
