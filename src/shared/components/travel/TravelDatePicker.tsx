import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Cloud,
  CloudLightning,
  Snowflake,
  Sun,
  X,
} from "lucide-react";
import {
  DayPicker,
  DayButton,
  getDefaultClassNames,
  type DayButtonProps,
} from "react-day-picker";
import { ja, enUS } from "date-fns/locale";
import type { TripMode } from "@/shared/services/recommendation/RecommendationContext";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";
import { getNextCalendarDate } from "@/shared/services/weather/WeatherTabService";
import { formatTravelDateShort } from "@/shared/utils/recommendationLabels";
import { travelDateToDate } from "@/shared/services/recommendation/TravelConditions";
import { cn } from "@/shared/utils/utils";

export interface OriginForecastCalendarMarker {
  condition: string;
  icon?: string;
  maxTemp: number;
  minTemp?: number;
  ariaLabel: string;
}

export function localDateToIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getOriginForecastCalendarMarker(
  date: string,
  forecastMap?: ReadonlyMap<string, DayForecastData>,
  originLabel?: string,
  locale: "en" | "ja" = "en",
): OriginForecastCalendarMarker | undefined {
  if (!forecastMap) return undefined;
  const forecast = forecastMap.get(date);
  if (!forecast) return undefined;

  const originText =
    originLabel && originLabel.trim() !== ""
      ? originLabel
      : locale === "ja"
        ? "現在地"
        : "your origin";
  const ariaLabel =
    locale === "ja"
      ? `${originText}付近の予報: ${forecast.desc} 最高${forecast.maxTemp}°C`
      : `Forecast near ${originText}: ${forecast.desc}, High ${forecast.maxTemp}°C`;

  return {
    condition: forecast.desc,
    icon: forecast.icon,
    maxTemp: forecast.maxTemp,
    minTemp: forecast.minTemp,
    ariaLabel,
  };
}

export function formatCapsuleLabel(
  value: string | undefined,
  tripMode: TripMode,
  allowAnyDate: boolean | undefined,
  locale: "en" | "ja",
  todayIso: string,
  tomorrowIso: string,
  t: (key: any, options?: any) => any,
  hasExplicitSelection?: boolean,
): string {
  if (
    !hasExplicitSelection &&
    !allowAnyDate &&
    (!value || value === todayIso)
  ) {
    return t("datePicker.selectDate", { defaultValue: "Select date" });
  }

  if (!value) {
    if (allowAnyDate) {
      return t("datePicker.anyDate", { defaultValue: "Any date" });
    }
    return t("datePicker.selectDate", { defaultValue: "Select date" });
  }

  if (tripMode === "day_trip") {
    if (value === todayIso) {
      return t("datePicker.today", { defaultValue: "Today" });
    }
    if (value === tomorrowIso) {
      return t("datePicker.tomorrow", { defaultValue: "Tomorrow" });
    }
    return formatTravelDateShort(value, locale);
  }

  // 2D1N mode
  const day2Iso = getNextCalendarDate(value);
  if (value === todayIso && day2Iso === tomorrowIso) {
    return locale === "ja" ? "今日〜明日" : "Today – Tomorrow";
  }

  if (locale === "ja") {
    return `${formatTravelDateShort(value, "ja")}〜${formatTravelDateShort(day2Iso, "ja")}`;
  }

  const [y1, m1, d1] = value.split("-").map(Number);
  const [y2, m2, d2] = day2Iso.split("-").map(Number);
  if (y1 === y2 && m1 === m2) {
    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(new Date(y1, m1 - 1, 1));
    return `${monthName} ${d1}–${d2}`;
  }

  return `${formatTravelDateShort(value, "en")} – ${formatTravelDateShort(day2Iso, "en")}`;
}

export interface TravelDatePickerProps {
  value?: string;
  onChange: (date: string | undefined) => void;
  hasExplicitSelection?: boolean;
  tripMode?: TripMode;
  forecastMap?: ReadonlyMap<string, DayForecastData>;
  allowAnyDate?: boolean;
  originLabel?: string;
  locale?: "en" | "ja";
  minDate?: string;
  triggerLabel?: string;
  className?: string;
}

export default function TravelDatePicker({
  value,
  onChange,
  hasExplicitSelection: propHasExplicitSelection,
  tripMode = "day_trip",
  forecastMap,
  allowAnyDate = false,
  originLabel,
  locale: propLocale,
  minDate: propMinDate,
  triggerLabel: propTriggerLabel,
  className,
}: TravelDatePickerProps) {
  const { t, i18n } = useTranslation();
  const currentLocale: "en" | "ja" =
    propLocale || (i18n.language === "ja" ? "ja" : "en");

  const [isOpen, setIsOpen] = useState(false);

  const todayIso = useMemo(() => localDateToIso(new Date()), []);
  const tomorrowIso = useMemo(() => getNextCalendarDate(todayIso), [todayIso]);

  const minDateIso = propMinDate || todayIso;
  const minDateObj = useMemo(() => travelDateToDate(todayIso), [todayIso]);

  const [hasExplicitSelection, setHasExplicitSelection] = useState<boolean>(
    () => propHasExplicitSelection ?? Boolean(value),
  );

  useEffect(() => {
    if (propHasExplicitSelection !== undefined) {
      setHasExplicitSelection(propHasExplicitSelection);
    } else if (value) {
      setHasExplicitSelection(true);
    }
  }, [propHasExplicitSelection, value]);

  const [displayedMonth, setDisplayedMonth] = useState<Date>(() => {
    if (value) return travelDateToDate(value);
    return minDateObj;
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync displayed month when opening or when value changes
  useEffect(() => {
    if (isOpen) {
      if (value) {
        setDisplayedMonth(travelDateToDate(value));
      } else {
        setDisplayedMonth(minDateObj);
      }
    }
  }, [isOpen, value, minDateObj]);

  // Focus management on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const targetBtn =
          popoverRef.current?.querySelector<HTMLButtonElement>(
            'button[data-date][aria-selected="true"]',
          ) ||
          popoverRef.current?.querySelector<HTMLButtonElement>(
            "button[data-date]:not([disabled])",
          ) ||
          popoverRef.current?.querySelector<HTMLButtonElement>("button");
        targetBtn?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Escape key to close & restore focus
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleSelectDate = useCallback(
    (selectedIso: string | undefined) => {
      setHasExplicitSelection(true);
      onChange(selectedIso);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const capsuleText = useMemo(() => {
    if (propTriggerLabel) return propTriggerLabel;
    return formatCapsuleLabel(
      value,
      tripMode,
      allowAnyDate,
      currentLocale,
      todayIso,
      tomorrowIso,
      (key: string, opts?: any) => t(key, { lng: currentLocale, ...opts }),
      hasExplicitSelection,
    );
  }, [
    propTriggerLabel,
    value,
    tripMode,
    allowAnyDate,
    currentLocale,
    todayIso,
    tomorrowIso,
    t,
    hasExplicitSelection,
  ]);

  const day1DateObj = useMemo(
    () => (value ? travelDateToDate(value) : undefined),
    [value],
  );

  const day2Iso = useMemo(() => {
    if (value && tripMode === "weekend_2d1n") {
      return getNextCalendarDate(value);
    }
    return undefined;
  }, [value, tripMode]);

  const day2DateObj = useMemo(
    () => (day2Iso ? travelDateToDate(day2Iso) : undefined),
    [day2Iso],
  );

  const modifiers = useMemo(() => {
    const mods: Record<string, Date[]> = {};
    if (day2DateObj) {
      mods.day2 = [day2DateObj];
    }
    if (forecastMap) {
      const dates: Date[] = [];
      for (const key of forecastMap.keys()) {
        if (!minDateIso || key >= minDateIso) {
          dates.push(travelDateToDate(key));
        }
      }
      if (dates.length > 0) {
        mods.forecast = dates;
      }
    }
    return mods;
  }, [day2DateObj, forecastMap, minDateIso]);

  const CustomDayButton = useCallback(
    (props: DayButtonProps) => {
      const {
        day,
        modifiers: dayModifiers,
        children,
        className: btnClassName,
      } = props;
      const iso = localDateToIso(day.date);
      const marker = getOriginForecastCalendarMarker(
        iso,
        forecastMap,
        originLabel,
        currentLocale,
      );
      const isDay2 = dayModifiers.day2;
      const isSelected = dayModifiers.selected;
      const isToday = dayModifiers.today;

      let ForecastIcon = Sun;
      if (marker?.icon === "rain") ForecastIcon = Cloud;
      else if (marker?.icon === "cloud") ForecastIcon = Cloud;
      else if (marker?.icon === "snow") ForecastIcon = Snowflake;
      else if (marker?.icon === "storm") ForecastIcon = CloudLightning;

      let ariaText = (props["aria-label"] || iso).trim();
      if (marker) {
        ariaText += `. ${marker.ariaLabel}`;
      }
      if (isDay2) {
        ariaText += `. ${t("datePicker.day2DerivedHint", "Day 2 (derived for 2D1N trip)")}`;
      }

      return (
        <DayButton
          {...props}
          data-date={iso}
          aria-label={ariaText}
          className={cn(
            btnClassName,
            "relative flex flex-col items-center justify-center h-10 w-full rounded-xl text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
            isSelected &&
              "bg-emerald-700 text-white shadow-sm z-10 hover:bg-emerald-800 font-extrabold",
            isDay2 &&
              !isSelected &&
              "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 font-extrabold border border-emerald-400/80 dark:border-emerald-700/80 z-10 hover:bg-emerald-200 dark:hover:bg-emerald-900",
            !isSelected &&
              !isDay2 &&
              isToday &&
              "border-2 border-emerald-700/90 text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50/40 dark:bg-emerald-950/20",
            !isSelected &&
              !isDay2 &&
              !isToday &&
              !dayModifiers.disabled &&
              "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100",
            dayModifiers.disabled &&
              "opacity-35 cursor-not-allowed text-slate-500 dark:text-slate-600",
          )}
        >
          <span>{children}</span>
          {marker && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[9px] leading-none mt-0.5 font-normal",
                isSelected
                  ? "text-emerald-100"
                  : isDay2
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-slate-500 dark:text-slate-300",
              )}
            >
              <ForecastIcon className="w-2.5 h-2.5 shrink-0" />
              <span>{marker.maxTemp}°</span>
            </span>
          )}
        </DayButton>
      );
    },
    [forecastMap, originLabel, currentLocale, t],
  );

  const defaultClassNames = useMemo(() => getDefaultClassNames(), []);
  const isSelectedStyle = allowAnyDate
    ? Boolean(value)
    : Boolean(hasExplicitSelection);

  return (
    <div
      className={cn(
        "relative inline-block text-left w-full sm:w-auto",
        className,
      )}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={`${t("datePicker.chooseTravelDate", { defaultValue: "Choose travel date" })}: ${capsuleText}`}
        title={capsuleText}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-xl border px-3 text-xs font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 sm:w-auto",
          isSelectedStyle
            ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200"
            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <CalendarIcon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="truncate">{capsuleText}</span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180 text-emerald-500",
          )}
        />
      </button>

      {/* Calendar Dialog / Popover Overlay */}
      {isOpen && (
        <>
          {/* Backdrop for mobile modal touch closing */}
          <button
            type="button"
            aria-label={t("datePicker.close", {
              defaultValue: "Close date picker",
            })}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs sm:hidden"
            onClick={handleClose}
          />

          {/* Dialog Container */}
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={t("datePicker.chooseTravelDate", {
              defaultValue: "Choose travel date",
            })}
            className="fixed inset-x-3 bottom-4 z-50 max-h-[85dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:absolute sm:left-0 sm:right-auto sm:bottom-auto sm:top-full sm:mt-2 sm:w-[330px] sm:max-h-none sm:rounded-2xl"
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {t("datePicker.chooseTravelDate", {
                  defaultValue: "Choose travel date",
                })}
              </span>
              <button
                type="button"
                aria-label={t("datePicker.close", {
                  defaultValue: "Close date picker",
                })}
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Date Shortcuts Bar */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {allowAnyDate && (
                <button
                  type="button"
                  onClick={() => handleSelectDate(undefined)}
                  className={cn(
                    "flex-1 h-8 rounded-lg text-xs font-bold border transition-colors min-w-[70px]",
                    !value
                      ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                  )}
                >
                  {t("datePicker.anyDate", { defaultValue: "Any date" })}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSelectDate(todayIso)}
                className={cn(
                  "flex-1 h-8 rounded-lg text-xs font-bold border transition-colors min-w-[70px]",
                  value === todayIso && hasExplicitSelection
                    ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                {t("datePicker.today", { defaultValue: "Today" })}
              </button>
              <button
                type="button"
                onClick={() => handleSelectDate(tomorrowIso)}
                className={cn(
                  "flex-1 h-8 rounded-lg text-xs font-bold border transition-colors min-w-[70px]",
                  value === tomorrowIso
                    ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                {t("datePicker.tomorrow", { defaultValue: "Tomorrow" })}
              </button>
            </div>

            {/* Origin Forecast Hint */}
            {forecastMap && (
              <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2 text-center border border-slate-100 dark:border-slate-800/80">
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {t("datePicker.forecastNearOrigin", {
                    origin:
                      originLabel && originLabel.trim() !== ""
                        ? originLabel
                        : t("datePicker.originForecastDefault", {
                            defaultValue: "your origin",
                          }),
                    defaultValue: "Forecast near {{origin}}",
                  })}
                </p>
              </div>
            )}

            {/* React DayPicker Calendar */}
            <div className="mt-2 flex justify-center">
              <DayPicker
                mode="single"
                captionLayout="label"
                selected={
                  hasExplicitSelection || allowAnyDate ? day1DateObj : undefined
                }
                onSelect={(d) => {
                  if (d) {
                    handleSelectDate(localDateToIso(d));
                  } else {
                    handleSelectDate(undefined);
                  }
                }}
                month={displayedMonth}
                onMonthChange={setDisplayedMonth}
                disabled={{ before: minDateObj }}
                modifiers={modifiers}
                locale={currentLocale === "ja" ? ja : enUS}
                components={{
                  DayButton: CustomDayButton,
                }}
                classNames={{
                  ...defaultClassNames,
                  root: `${defaultClassNames.root} w-full text-slate-900 dark:text-slate-100 select-none`,
                  months: `${defaultClassNames.months} relative w-full`,
                  month: `${defaultClassNames.month} w-full space-y-2`,
                  month_caption: `${defaultClassNames.month_caption} flex items-center justify-center h-8 font-bold text-xs w-full`,
                  caption_label: `${defaultClassNames.caption_label} text-xs font-extrabold capitalize text-slate-900 dark:text-slate-100`,
                  nav: `${defaultClassNames.nav} flex items-center justify-between absolute top-0 inset-x-0 h-8 px-1 z-10 pointer-events-none`,
                  button_previous: `${defaultClassNames.button_previous} pointer-events-auto h-7 w-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors`,
                  button_next: `${defaultClassNames.button_next} pointer-events-auto h-7 w-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors`,
                  month_grid: `${defaultClassNames.month_grid} w-full border-collapse space-y-1`,
                  weekdays: `${defaultClassNames.weekdays} flex w-full border-b border-slate-100 dark:border-slate-800 pb-1 mb-1`,
                  weekday: `${defaultClassNames.weekday} w-full text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider`,
                  weeks: `${defaultClassNames.weeks} w-full space-y-1`,
                  week: `${defaultClassNames.week} flex w-full gap-1`,
                  day: `${defaultClassNames.day} w-full flex-1 text-center p-0 relative`,
                  today: `${defaultClassNames.today} border-2 border-emerald-700/90 font-bold text-emerald-700 dark:text-emerald-300`,
                  selected: `${defaultClassNames.selected} bg-emerald-700 text-white shadow-sm z-10 hover:bg-emerald-800 font-extrabold rounded-xl`,
                  outside: `${defaultClassNames.outside} opacity-40`,
                  disabled: `${defaultClassNames.disabled} opacity-30 cursor-not-allowed`,
                  hidden: `${defaultClassNames.hidden} invisible`,
                }}
              />
            </div>

            {/* 2D1N Day 2 Derived Hint Footer */}
            {tripMode === "weekend_2d1n" && value && (
              <div className="mt-2.5 border-t border-slate-100 dark:border-slate-800 pt-2 text-center">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                  {t("datePicker.day2", "Day 2")}:{" "}
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    {formatTravelDateShort(
                      getNextCalendarDate(value),
                      currentLocale,
                    )}
                  </span>{" "}
                  ({t("datePicker.day2DerivedHint", "derived for 2D1N trip")})
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
