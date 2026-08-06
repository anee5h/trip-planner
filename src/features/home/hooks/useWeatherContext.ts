import { useState, useEffect } from "react";
import {
  fetchWeatherTabContext,
  type WeatherTabContext,
  type WeatherTab,
} from "@/shared/services/weather/WeatherTabService";

/**
 * Pure date-selection resolution shared by the interactive handler and the
 * URL-restore path, so both behave identically.
 */
function resolveDateTabSelection(
  ctx: WeatherTabContext,
  selectedDate: string,
): {
  tabs: WeatherTab[];
  activeTabId: string;
  customDate: string | null;
} {
  const matchingPreset = ctx.tabs.find(
    (tab) => !tab.isCustom && tab.dates.includes(selectedDate),
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
  initialDate?: string,
) {
  const [weatherContext, setWeatherContext] =
    useState<WeatherTabContext | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>("today");
  const [customDate, setCustomDate] = useState<string | null>(null);

  useEffect(() => {
    const lat = homeStationCoords?.lat || 35.6762;
    const lng = homeStationCoords?.lng || 139.6503;
    fetchWeatherTabContext(lat, lng)
      .then((ctx) => {
        setWeatherContext(ctx);
        if (initialDate) {
          const resolved = resolveDateTabSelection(ctx, initialDate);
          setWeatherContext((prev) =>
            prev ? { ...prev, tabs: resolved.tabs } : prev,
          );
          setActiveTabId(resolved.activeTabId);
          setCustomDate(resolved.customDate);
        } else {
          setActiveTabId(ctx.activeTabId);
        }
      })
      .catch((err) => console.error("Weather tab fetch error:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeStationCoords]);

  const handleCustomDateSelect = (selectedDate: string) => {
    if (!weatherContext) return;
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
