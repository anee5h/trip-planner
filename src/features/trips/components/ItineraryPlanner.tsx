import { useState, useMemo } from "react";
import type { Trip, TripStop } from "@/shared/types/trip";
import { TripStopType } from "@/shared/types/trip";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  CalendarDays,
  Calendar as CalendarIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchableDestinationPicker } from "@/shared/components/ui/SearchableDestinationPicker";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useRecentlyViewedDestinations } from "@/shared/hooks/useRecentlyViewedDestinations";

interface ItineraryPlannerProps {
  trip: Trip;
  onAddStop: (stop: Omit<TripStop, "id">) => void;
  onRemoveStop: (stopId: string) => void;
  onReorderStops: (startIndex: number, endIndex: number) => void;
}

function sanitizeDateInput(rawDate: string): string {
  if (!rawDate) return "";
  const parts = rawDate.split("-");
  if (parts.length < 3) return rawDate;
  let year = parseInt(parts[0], 10);
  const currentYear = new Date().getFullYear();
  if (isNaN(year) || year < 2020 || year > 2035) {
    year = currentYear;
  }
  const month = parts[1].padStart(2, "0");
  const day = parts[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr: string, locale: string = "en"): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const dateObj = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
      );
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }
  } catch {
    // Fallback to raw string
  }
  return dateStr;
}

export default function ItineraryPlanner({
  trip,
  onAddStop,
  onRemoveStop,
  onReorderStops,
}: ItineraryPlannerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ja" ? "ja" : "en";

  const [stopType, setStopType] = useState<TripStopType>("destination");
  const [selectedDestId, setSelectedDestId] = useState("");
  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");
  const [stopDate, setStopDate] = useState("");
  const { favorites } = useTripStore();
  const recentDestinations = useRecentlyViewedDestinations();

  const destinations = getDestinationList() as Destination[];

  const savedDestinations = useMemo(() => {
    return (favorites || [])
      .map((id) => destinations.find((d) => d.id === id))
      .filter((d): d is Destination => Boolean(d));
  }, [favorites, destinations]);

  const tripDatePresets = useMemo(() => {
    const presets: Array<{ label: string; date: string }> = [];
    if (trip.startDate) {
      const baseDate = new Date(trip.startDate);
      if (!isNaN(baseDate.getTime())) {
        for (let i = 0; i < 3; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          presets.push({
            label: locale === "ja" ? `${i + 1}日目` : `Day ${i + 1}`,
            date: dateStr,
          });
        }
        return presets;
      }
    }
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    presets.push({
      label: locale === "ja" ? "今日" : "Today",
      date: todayStr,
    });
    presets.push({
      label: locale === "ja" ? "明日" : "Tomorrow",
      date: tomorrow.toISOString().split("T")[0],
    });
    return presets;
  }, [trip.startDate, locale]);

  const handleDateChange = (val: string) => {
    setStopDate(sanitizeDateInput(val));
  };

  const handleAddStop = (e: React.FormEvent) => {
    e.preventDefault();
    const finalDate = sanitizeDateInput(stopDate);

    if (stopType === "destination") {
      const dest = destinations.find((d) => d.id === selectedDestId);
      if (!dest) return;
      onAddStop({
        type: "destination",
        destinationId: dest.id,
        name: dest.name,
        notes: notes || undefined,
        date: finalDate || undefined,
      });
    } else {
      if (!customName || customName.trim() === "") return;
      onAddStop({
        type: "custom",
        name: customName,
        notes: notes || undefined,
        date: finalDate || undefined,
      });
    }

    setSelectedDestId("");
    setCustomName("");
    setNotes("");
    setStopDate("");
  };

  return (
    <div className="space-y-8">
      {/* Add Stop Form */}
      <form
        onSubmit={handleAddStop}
        className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-3xl space-y-4 shadow-sm"
      >
        <h4 className="text-md font-bold text-slate-950 dark:text-white mb-2 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          {t("ui.addStop")}
        </h4>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStopType("destination")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              stopType === "destination"
                ? "bg-slate-900 text-white dark:bg-emerald-600 border-transparent shadow-sm"
                : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("ui.destinations")}
          </button>
          <button
            type="button"
            onClick={() => setStopType("custom")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              stopType === "custom"
                ? "bg-slate-900 text-white dark:bg-emerald-600 border-transparent shadow-sm"
                : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("ui.customLocation")}
          </button>
        </div>

        {stopType === "destination" ? (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.selectPlace")}
            </label>
            <SearchableDestinationPicker
              value={selectedDestId}
              onSelect={(d) => setSelectedDestId(d.id)}
              placeholder={`-- ${t("ui.selectPlace")} --`}
              locale={i18n.language === "ja" ? "ja" : "en"}
              savedDestinations={savedDestinations}
              recentDestinations={recentDestinations}
              activeItineraryDestinations={trip?.stops
                ?.map((s) =>
                  s.destinationId
                    ? getDestinationList().find((d) => d.id === s.destinationId)
                    : null,
                )
                .filter((d): d is Destination => Boolean(d))}
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.customLocation")}
            </label>
            <Input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Hotel Sunroute Plaza Shinjuku"
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>
        )}

        {/* Date */}
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-500" />
              {t("datePicker.chooseTravelDate")}
            </label>
            <div className="flex items-center gap-1.5">
              {tripDatePresets.map((preset) => (
                <button
                  key={preset.date}
                  type="button"
                  onClick={() => setStopDate(preset.date)}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all border ${
                    stopDate === preset.date
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
                      : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <Input
            type="date"
            value={stopDate}
            min="2020-01-01"
            max="2035-12-31"
            onChange={(e) => handleDateChange(e.target.value)}
            onBlur={(e) => handleDateChange(e.target.value)}
            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl text-base sm:text-sm w-full"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            {t("ui.notes")}
          </label>
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t(
              "trips.notesPlaceholder",
              "e.g. Try local spicy noodles",
            )}
            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"
          />
        </div>

        <Button
          type="submit"
          disabled={stopType === "destination" ? !selectedDestId : !customName}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-6"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>{t("ui.addStopAction")}</span>
        </Button>
      </form>

      {/* Stops List */}
      <div className="space-y-4">
        <h4 className="text-lg font-bold text-slate-950 dark:text-white">
          {t("ui.itineraryOrder")}
        </h4>

        {trip.stops.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm italic py-8 text-center">
            {t("ui.noItinerariesHint")}
          </p>
        ) : (
          <div className="space-y-4">
            {trip.stops.map((stop, index) => (
              <div
                key={stop.id}
                className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm"
              >
                {/* Stop number */}
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-extrabold text-sm shrink-0">
                  {index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <h5 className="font-extrabold text-slate-900 dark:text-white text-sm truncate">
                    {stop.name}
                  </h5>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      {stop.type}
                    </span>
                    {stop.date && (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        <CalendarDays className="w-3 h-3" />
                        {formatDisplayDate(stop.date, locale)}
                      </span>
                    )}
                    {stop.notes && (
                      <span className="italic text-slate-500 truncate">
                        "{stop.notes}"
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("trips.moveUp", "Move stop up")}
                    disabled={index === 0}
                    onClick={() => onReorderStops(index, index - 1)}
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 rounded-full"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("trips.moveDown", "Move stop down")}
                    disabled={index === trip.stops.length - 1}
                    onClick={() => onReorderStops(index, index + 1)}
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 rounded-full"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(
                      "trips.removeStop",
                      "Remove stop from itinerary",
                    )}
                    onClick={() => onRemoveStop(stop.id)}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
