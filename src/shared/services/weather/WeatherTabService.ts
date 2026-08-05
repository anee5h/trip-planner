export interface WeatherTab {
  id: string; // e.g. "today", "tomorrow", "this_weekend", "sunday", or "custom_2026-07-28"
  label: string; // e.g. "Today", "Tomorrow", "This Weekend", "Sunday", or "Jul 28"
  dates: string[]; // YYYY-MM-DD strings (e.g. ["2026-07-23"] or ["2026-07-25", "2026-07-26"])
  isCustom?: boolean;
}

export interface DayForecastData {
  date: string; // YYYY-MM-DD
  maxTemp: number;
  minTemp: number;
  weatherCode: number;
  desc: string;
  icon: "sun" | "cloud" | "rain" | "snow" | "storm";
}

export interface WeatherTabContext {
  tabs: WeatherTab[];
  activeTabId: string;
  activeTab: WeatherTab;
  forecastMap: Map<string, DayForecastData>;
  availableDates: string[]; // all YYYY-MM-DD dates in the fetched Open-Meteo range
  minDate: string;
  maxDate: string;
}

/**
 * Formats a Date object to YYYY-MM-DD string in local time.
 */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computes dynamic weather tabs based on the specified rules:
 * - Sun–Wed: Today, Tomorrow, This Weekend (Sat+Sun combined)
 * - Thu: Today, Tomorrow (Fri), This Weekend (Sat+Sun combined)
 * - Fri: Today (Fri), Tomorrow (Sat), Sunday (standalone Sun)
 * - Sat: Today (Sat), Tomorrow (Sun) — fully covered!
 * - Sun: Today (Sun), Tomorrow (Mon), This Weekend (next Sat+Sun)
 */
export function computeWeatherTabs(baseDate: Date = new Date()): WeatherTab[] {
  const todayObj = new Date(baseDate);
  const dayOfWeek = todayObj.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

  const todayStr = formatDateISO(todayObj);

  const tomorrowObj = new Date(todayObj);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = formatDateISO(tomorrowObj);

  // Compute Upcoming Saturday & Sunday
  let upcomingSatObj: Date;
  let upcomingSunObj: Date;

  if (dayOfWeek === 6) {
    // Today is Saturday
    upcomingSatObj = new Date(todayObj);
    upcomingSunObj = new Date(todayObj);
    upcomingSunObj.setDate(upcomingSunObj.getDate() + 1);
  } else if (dayOfWeek === 0) {
    // Today is Sunday (ending/today) -> Next Weekend!
    upcomingSatObj = new Date(todayObj);
    upcomingSatObj.setDate(upcomingSatObj.getDate() + 6);
    upcomingSunObj = new Date(todayObj);
    upcomingSunObj.setDate(upcomingSunObj.getDate() + 7);
  } else {
    // Mon (1) .. Fri (5)
    const daysUntilSat = 6 - dayOfWeek;
    upcomingSatObj = new Date(todayObj);
    upcomingSatObj.setDate(upcomingSatObj.getDate() + daysUntilSat);
    upcomingSunObj = new Date(todayObj);
    upcomingSunObj.setDate(upcomingSunObj.getDate() + daysUntilSat + 1);
  }

  const upcomingSatStr = formatDateISO(upcomingSatObj);
  const upcomingSunStr = formatDateISO(upcomingSunObj);

  const tabs: WeatherTab[] = [];

  // Always Tab 1: Today
  tabs.push({ id: "today", label: "Today", dates: [todayStr] });

  // Always Tab 2: Tomorrow
  tabs.push({ id: "tomorrow", label: "Tomorrow", dates: [tomorrowStr] });

  // Tab 3 Rule:
  if (dayOfWeek >= 0 && dayOfWeek <= 4) {
    // Sun–Thu: "This Weekend" (Sat + Sun combined)
    tabs.push({
      id: "this_weekend",
      label: "This Weekend",
      dates: [upcomingSatStr, upcomingSunStr],
    });
  } else if (dayOfWeek === 5) {
    // Fri: Tomorrow is Sat (already Tab 2), so Sunday is standalone Tab 3
    tabs.push({
      id: "sunday",
      label: "Sunday",
      dates: [upcomingSunStr],
    });
  }
  // If dayOfWeek === 6 (Sat): Sat is Today, Sun is Tomorrow -> fully covered with 2 tabs!

  return tabs;
}

/**
 * Fetches Open-Meteo 10-day forecast for given lat/lng and maps data strictly by YYYY-MM-DD date string matching.
 */
export async function fetchWeatherTabContext(
  lat: number = 35.6762,
  lng: number = 139.6503,
  baseDate: Date = new Date(),
): Promise<WeatherTabContext> {
  const tabs = computeWeatherTabs(baseDate);
  const forecastMap = new Map<string, DayForecastData>();

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=10`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.daily || !data.daily.time) {
    throw new Error("Invalid Open-Meteo response");
  }

  const availableDates: string[] = data.daily.time;
  const minDate = availableDates[0];
  const maxDate = availableDates[availableDates.length - 1];

  for (let i = 0; i < availableDates.length; i++) {
    const dateStr = availableDates[i];
    const code = data.daily.weathercode[i];
    const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
    const minTemp = Math.round(data.daily.temperature_2m_min[i]);

    let desc = "Clear";
    let icon: "sun" | "cloud" | "rain" | "snow" | "storm" = "sun";

    if (code >= 1 && code <= 3) {
      desc = "Cloudy";
      icon = "cloud";
    } else if (code >= 45 && code <= 48) {
      desc = "Foggy";
      icon = "cloud";
    } else if (code >= 51 && code <= 67) {
      desc = "Rainy";
      icon = "rain";
    } else if (code >= 71 && code <= 77) {
      desc = "Snowy";
      icon = "snow";
    } else if (code >= 80 && code <= 82) {
      desc = "Rain Showers";
      icon = "rain";
    } else if (code >= 85 && code <= 86) {
      desc = "Snow Showers";
      icon = "snow";
    } else if (code >= 95 && code <= 99) {
      desc = "Stormy";
      icon = "storm";
    }

    forecastMap.set(dateStr, {
      date: dateStr,
      maxTemp,
      minTemp,
      weatherCode: code,
      desc,
      icon,
    });
  }

  const activeTabId = tabs[0].id;
  const activeTab = tabs[0];

  return {
    tabs,
    activeTabId,
    activeTab,
    forecastMap,
    availableDates,
    minDate,
    maxDate,
  };
}

/**
 * Summarizes weather data for a tab (handles single dates & combined weekend dates).
 */
export function getTabWeatherSummary(
  tab: WeatherTab,
  forecastMap: Map<string, DayForecastData>,
): {
  temp: number;
  desc: string;
  dateLabel: string;
  icon: "sun" | "cloud" | "rain" | "snow" | "storm";
} | null {
  const daysData = tab.dates
    .map((d) => forecastMap.get(d))
    .filter((d): d is DayForecastData => d !== undefined);

  if (daysData.length === 0) {
    return null;
  }

  if (daysData.length === 1) {
    const single = daysData[0];
    const [y, m, d] = single.date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dateLabel = dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return {
      temp: single.maxTemp,
      desc: single.desc,
      dateLabel,
      icon: single.icon,
    };
  }

  // Combined Weekend (Sat + Sun)
  const rainDay = daysData.find((d) => d.icon === "rain" || d.icon === "storm");
  const snowDay = daysData.find((d) => d.icon === "snow");
  const chosenDay = rainDay || snowDay || daysData[0];

  // When an adverse weather day is selected to represent the weekend, use its exact temperature for consistency
  const displayTemp =
    rainDay || snowDay
      ? chosenDay.maxTemp
      : Math.round(
          daysData.reduce((acc, curr) => acc + curr.maxTemp, 0) /
            daysData.length,
        );

  const [y1, m1, d1] = daysData[0].date.split("-").map(Number);
  const [y2, m2, d2] = daysData[daysData.length - 1].date
    .split("-")
    .map(Number);
  const firstDate = new Date(y1, m1 - 1, d1);
  const lastDate = new Date(y2, m2 - 1, d2);

  const dateLabel = `${firstDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${lastDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;

  return {
    temp: displayTemp,
    desc: chosenDay.desc,
    dateLabel,
    icon: chosenDay.icon,
  };
}

/**
 * Returns the next local calendar date after the given YYYY-MM-DD date,
 * handling month-end, year-end and leap-day rollover. Local calendar
 * arithmetic (no UTC shift bugs): parse as local Date, add 1 day, format
 * with the existing formatDateISO helper. Throws on malformed input.
 */
export function getNextCalendarDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  // Validate month/day ranges to catch e.g. 2026-13-01 and 2026-02-30
  // (Date would silently roll over; reject instead).
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  // Local calendar arithmetic — no UTC shift
  d.setDate(d.getDate() + 1);
  return formatDateISO(d);
}

/**
 * Returns up to dayCount DayForecastData entries from forecastMap for the
 * consecutive local calendar days starting at startIso (startIso + 0..dayCount-1).
 * Dates missing from the map are SKIPPED (never fabricated); the result may
 * contain fewer than dayCount entries (0..dayCount). Used for the weekend's
 * Day 1 (selected date) and Day 2 (next calendar date) forecasts.
 */
export function getForecastDaysForRange(
  forecastMap: ReadonlyMap<string, DayForecastData>,
  startIso: string,
  dayCount: number,
): DayForecastData[] {
  const result: DayForecastData[] = [];
  let cursor = startIso;
  for (let i = 0; i < dayCount; i++) {
    const entry = forecastMap.get(cursor);
    if (entry !== undefined) {
      result.push(entry);
    }
    cursor = getNextCalendarDate(cursor);
  }
  return result;
}
