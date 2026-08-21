import { lazy, Suspense, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TripMode } from "@/shared/services/recommendation/RecommendationContext";
import {
  formatCapsuleLabel,
  formatDateISO,
  getNextCalendarDate,
} from "@/shared/utils/travelDate";
import { cn } from "@/shared/utils/utils";
import type { TravelDatePickerProps } from "@/shared/components/travel/TravelDatePicker";

const LazyTravelDatePicker = lazy(() => import("./TravelDatePicker"));

type HomeDatePickerProps = Omit<TravelDatePickerProps, "initialOpen">;

function LightDateTrigger({
  value,
  onRequestCalendar,
  triggerLabel,
  className,
  tripMode = "day_trip",
  allowAnyDate = false,
  locale: propLocale,
  hasExplicitSelection,
}: HomeDatePickerProps & { onRequestCalendar: () => void }) {
  const { t, i18n } = useTranslation();
  const locale: "en" | "ja" =
    propLocale || (i18n.language === "ja" ? "ja" : "en");
  const todayIso = useMemo(() => formatDateISO(new Date()), []);
  const tomorrowIso = useMemo(() => getNextCalendarDate(todayIso), [todayIso]);
  const capsuleText =
    triggerLabel ||
    formatCapsuleLabel(
      value,
      tripMode as TripMode,
      allowAnyDate,
      locale,
      todayIso,
      tomorrowIso,
      (key: string, options?: Record<string, unknown>) =>
        (
          t as unknown as (
            key: string,
            options?: Record<string, unknown>,
          ) => string
        )(key, { lng: locale, ...options }),
      hasExplicitSelection,
    );
  const isSelectedStyle = allowAnyDate
    ? Boolean(value)
    : Boolean(hasExplicitSelection);

  return (
    <div
      data-home-date-control="true"
      className={cn(
        "relative inline-block text-left w-full sm:w-auto",
        className,
      )}
    >
      <button
        type="button"
        onClick={onRequestCalendar}
        aria-label={`${t("datePicker.chooseTravelDate", { defaultValue: "Choose travel date" })}: ${capsuleText}`}
        title={capsuleText}
        aria-haspopup="dialog"
        aria-expanded={false}
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
        <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-200" />
      </button>
    </div>
  );
}

export default function HomeDatePicker(props: HomeDatePickerProps) {
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [calendarRequested, setCalendarRequested] = useState(false);

  if (calendarLoaded) {
    return (
      <Suspense
        fallback={
          <LightDateTrigger
            {...props}
            onRequestCalendar={() => setCalendarRequested(true)}
          />
        }
      >
        <LazyTravelDatePicker {...props} initialOpen={calendarRequested} />
      </Suspense>
    );
  }

  return (
    <LightDateTrigger
      {...props}
      onRequestCalendar={() => {
        setCalendarRequested(true);
        setCalendarLoaded(true);
      }}
    />
  );
}
