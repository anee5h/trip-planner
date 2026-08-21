import { useState, useEffect, useRef } from "react";
import {
  fetchWeatherTabContext,
  type WeatherTabContext,
  type WeatherTab,
} from "@/shared/services/weather/WeatherTabService";

/**
 * Pure date-selection resolution shared by the interactive handler and the
 * URL-restore path, so both behave identically.
 */
export function resolveDateTabSelection(
  ctx: WeatherTabContext,
  selectedDate: string,
): {
  tabs: WeatherTab[];
  activeTabId: string;
  customDate: string | null;
} {
  const matchingPreset = ctx.tabs.find(
    (tab) =>
      !tab.isCustom &&
      (tab.id === "today" || tab.id === "tomorrow") &&
      tab.dates.includes(selectedDate),
  );
  if (matchingPreset) {
    return {
      tabs: ctx.tabs.filter((tab) => !tab.isCustom),
      activeTabId: matchingPreset.id,
      customDate: null,
    };
  }
  const customTabId = `custom_${selectedDate}`;
  const [y, m, d] = selectedDate.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const customTab: WeatherTab = {
    id: customTabId,
    label,
    dates: [selectedDate],
    isCustom: true,
  };
  return {
    tabs: [...ctx.tabs.filter((tab) => !tab.isCustom), customTab],
    activeTabId: customTabId,
    customDate: selectedDate,
  };
}

export function useWeatherContext(
  homeStationCoords: { lat: number; lng: number } | null,
) {
  const [weatherContext, setWeatherContext] =
    useState<WeatherTabContext | null>(null);
  const [activeTabId, setActiveTabIdState] = useState<string>("today");
  const [customDate, setCustomDate] = useState<string | null>(null);
  const pendingActiveTabRef = useRef<string | null>(null);
  const pendingCustomDateRef = useRef<string | null>(null);

  const setActiveTabId = (nextTabId: string) => {
    pendingActiveTabRef.current = nextTabId;
    setActiveTabIdState(nextTabId);
  };

  useEffect(() => {
    const lat = homeStationCoords?.lat || 35.6762;
    const lng = homeStationCoords?.lng || 139.6503;
    // KAI-130: defer the weather fetch until after first paint + idle.
    // The origin forecast is display-only for the initial planner; when
    // it resolved ~1.8s after load it triggered a Home re-render that
    // showed up as a ~360ms long task in cold-load traces. Deferring
    // moves that work off the interaction-critical path without changing
    // what the user sees (weather tabs appear once loaded, as before).
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (cancelled) return;
      fetchWeatherTabContext(lat, lng)
        .then((ctx) => {
          if (cancelled) return;
          const queuedDate = pendingCustomDateRef.current;
          const queuedTab = pendingActiveTabRef.current;
          const resolved = queuedDate
            ? resolveDateTabSelection(ctx, queuedDate)
            : null;
          pendingCustomDateRef.current = null;
          pendingActiveTabRef.current = null;
          setWeatherContext(resolved ? { ...ctx, tabs: resolved.tabs } : ctx);
          setActiveTabIdState(
            resolved?.activeTabId ?? queuedTab ?? ctx.activeTabId,
          );
          setCustomDate(resolved?.customDate ?? null);
        })
        .catch((err) => console.error("Weather tab fetch error:", err));
    };
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        // Give the initial render + paint a clear window before the fetch
        // resolves and re-renders the weather consumers.
        timer = setTimeout(start, 500);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [homeStationCoords]);

  const handleCustomDateSelect = (selectedDate: string) => {
    if (!weatherContext) {
      pendingCustomDateRef.current = selectedDate;
      return;
    }
    const resolved = resolveDateTabSelection(weatherContext, selectedDate);
    setWeatherContext({ ...weatherContext, tabs: resolved.tabs });
    setActiveTabId(resolved.activeTabId);
    setCustomDate(resolved.customDate);
  };

  const currentTab = weatherContext?.tabs.find((t) => t.id === activeTabId);

  return {
    weatherContext,
    setWeatherContext,
    activeTabId,
    setActiveTabId,
    customDate,
    setCustomDate,
    currentTab,
    handleCustomDateSelect,
  };
}
