import { useState } from "react";
import { Calendar, Trash2, ArrowRight } from "lucide-react";
import type { Trip } from "@/shared/types/trip";
import { Button } from "@/shared/components/ui/button";
import { useTranslation } from "react-i18next";

interface TripCardProps {
  trip: Trip;
  onSelect: (tripId: string) => void;
  onDelete: (tripId: string) => void;
}

export default function TripCard({ trip, onSelect, onDelete }: TripCardProps) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stopsCount = trip.stops.length;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div>
        <div className="flex justify-between items-start mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 capitalize border border-emerald-100 dark:border-emerald-900">
            {trip.status}
          </span>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDelete(trip.id);
                  setConfirmDelete(false);
                }}
                className="text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full px-3 h-7"
              >
                {t("ui.delete")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full px-3 h-7"
              >
                {t("ui.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              className="text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full"
              aria-label={t("ui.delete")}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <h3 className="text-xl font-bold text-slate-950 dark:text-white mb-2 line-clamp-1">
          {trip.title}
        </h3>

        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300 text-sm mb-4">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          {trip.startDate ? (
            <span>
              {formatDate(trip.startDate)}
              {trip.endDate && ` - ${formatDate(trip.endDate)}`}
            </span>
          ) : (
            <span className="italic">No dates set</span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
          {stopsCount} stop{stopsCount === 1 ? "" : "s"}
        </span>

        <Button
          onClick={() => onSelect(trip.id)}
          className="bg-slate-900 hover:bg-slate-850 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-full font-bold px-4 text-xs inline-flex items-center gap-1.5"
        >
          <span>Planner</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
