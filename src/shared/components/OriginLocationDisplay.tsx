import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/shared/context/LocaleContext";
import { formatOriginLocation } from "@/shared/utils/formatOriginLocation";

interface OriginLocationDisplayProps {
  origin: string;
  onEdit: () => void;
  editDisabled?: boolean;
  isCurrentLocation?: boolean;
  onRestoreSaved?: () => void;
}

export function OriginLocationDisplay({
  origin,
  onEdit,
  editDisabled = false,
  isCurrentLocation = false,
  onRestoreSaved,
}: OriginLocationDisplayProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { stationName, prefectureName } = formatOriginLocation(origin, locale);
  const formattedText = isCurrentLocation
    ? t("origin.currentLocation")
    : locale === "ja" && prefectureName
      ? `${prefectureName}・${stationName}`
      : `${stationName}${prefectureName ? `, ${prefectureName}` : ""}`;

  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-2.5 py-0.5 shadow-sm backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/70 sm:w-fit sm:max-w-full">
      <div className="flex min-w-0 items-center gap-2">
        <MapPin className="size-4 shrink-0 text-emerald-500" />
        <div className="min-w-0">
          <p className="min-w-0 truncate text-sm" title={formattedText}>
            <span className="text-slate-500 dark:text-slate-300">
              {t("origin.from")} {locale === "ja" ? "　" : ""}
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {formattedText}
            </span>
          </p>
          {isCurrentLocation && (
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              {t("origin.currentLocationActive")}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap justify-end gap-1">
        {isCurrentLocation && onRestoreSaved && (
          <button
            type="button"
            onClick={onRestoreSaved}
            className="h-9 shrink-0 whitespace-nowrap rounded-lg px-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {t("origin.useSavedLocation")}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          disabled={editDisabled}
          className="h-9 shrink-0 whitespace-nowrap rounded-lg px-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
        >
          {t("origin.edit")}
        </button>
      </div>
    </div>
  );
}
