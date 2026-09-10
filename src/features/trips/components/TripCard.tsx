import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Trash2,
  ArrowRight,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import type { Trip } from "@/shared/types/trip";
import { Button } from "@/shared/components/ui/button";
import { useTranslation } from "react-i18next";
import { formatTripDateRange } from "@/shared/utils/date";

interface TripCardProps {
  trip: Trip;
  onSelect: (tripId: string) => void;
  onDelete: (tripId: string) => void;
  onRename?: (tripId: string) => void;
  onEditDates?: (tripId: string) => void;
}

export default function TripCard({
  trip,
  onSelect,
  onDelete,
  onRename,
  onEditDates,
}: TripCardProps) {
  const { t, i18n } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const stopsCount = trip.stops.length;
  const locale = i18n.language === "ja" ? "ja" : "en";
  const dateLabel = formatTripDateRange(trip.startDate, trip.endDate, locale);
  const hasCanonicalDates = Boolean(trip.startDate);

  const closeActions = () => {
    setActionsOpen(false);
    setConfirmDelete(false);
  };

  useEffect(() => {
    if (!actionsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        actionsRef.current &&
        event.target instanceof Node &&
        actionsRef.current.contains(event.target)
      ) {
        return;
      }
      closeActions();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeActions();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsOpen]);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold text-slate-950 dark:text-white sm:text-xl">
          {trip.title}
        </h3>

        <div ref={actionsRef} className="relative shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setActionsOpen((open) => !open);
              setConfirmDelete(false);
            }}
            className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={t("ui.moreActions")}
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
          >
            <MoreHorizontal className="size-5" />
          </Button>

          {actionsOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-20 min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
            >
              {confirmDelete ? (
                <div className="flex items-center gap-1 p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onDelete(trip.id);
                      closeActions();
                    }}
                    className="min-h-10 flex-1 rounded-lg px-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    {t("ui.delete")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeActions}
                    className="min-h-10 flex-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {t("ui.cancel")}
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsOpen(false);
                      onRename?.(trip.id);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Pencil className="size-4" />
                    {t("ui.rename")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsOpen(false);
                      onEditDates?.(trip.id);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <CalendarDays className="size-4" />
                    {t(hasCanonicalDates ? "ui.editDates" : "ui.setDates")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmDelete(true)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="size-4" />
                    {t("ui.delete")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 shrink-0" />
          <span>
            {dateLabel || <span className="italic">{t("ui.noDatesSet")}</span>}
          </span>
        </div>
        {trip.status !== "draft" && (
          <span data-trip-status>
            {t("trips.status")}:{" "}
            {t(`trips.statusLabels.${trip.status}`, trip.status)}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
          {stopsCount} {stopsCount === 1 ? t("ui.stop") : t("ui.stops")}
        </span>

        <Button
          onClick={() => onSelect(trip.id)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          <span>{t("ui.editItinerary")}</span>
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}
