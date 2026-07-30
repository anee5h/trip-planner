import { useState } from "react";
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
  Clock,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface ItineraryPlannerProps {
  trip: Trip;
  onAddStop: (stop: Omit<TripStop, "id">) => void;
  onRemoveStop: (stopId: string) => void;
  onReorderStops: (startIndex: number, endIndex: number) => void;
}

const TIME_PRESETS = [
  { label: "Morning", arrival: "09:00", departure: "11:30" },
  { label: "Noon", arrival: "12:00", departure: "13:30" },
  { label: "Afternoon", arrival: "14:00", departure: "16:30" },
  { label: "Evening", arrival: "18:00", departure: "20:30" },
];

const TIME_OPTIONS = Array.from({ length: 32 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30; // 07:00 to 22:30
  const hours = Math.floor(totalMins / 60)
    .toString()
    .padStart(2, "0");
  const mins = (totalMins % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
});

export default function ItineraryPlanner({
  trip,
  onAddStop,
  onRemoveStop,
  onReorderStops,
}: ItineraryPlannerProps) {
  const { t } = useTranslation();
  const [stopType, setStopType] = useState<TripStopType>("destination");
  const [selectedDestId, setSelectedDestId] = useState("");
  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");
  const [stopDate, setStopDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  const destinations = getDestinationList() as Destination[];

  const handleApplyPreset = (arrival: string, departure: string) => {
    setArrivalTime(arrival);
    setDepartureTime(departure);
  };

  const handleAddStop = (e: React.FormEvent) => {
    e.preventDefault();
    if (stopType === "destination") {
      const dest = destinations.find((d) => d.id === selectedDestId);
      if (!dest) return;
      onAddStop({
        type: "destination",
        destinationId: dest.id,
        name: dest.name,
        notes: notes || undefined,
        date: stopDate || undefined,
        arrivalTime: arrivalTime || undefined,
        departureTime: departureTime || undefined,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
      });
    } else {
      if (!customName || customName.trim() === "") return;
      onAddStop({
        type: "custom",
        name: customName,
        notes: notes || undefined,
        date: stopDate || undefined,
        arrivalTime: arrivalTime || undefined,
        departureTime: departureTime || undefined,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
      });
    }

    // Reset Form
    setSelectedDestId("");
    setCustomName("");
    setNotes("");
    setStopDate("");
    setArrivalTime("");
    setDepartureTime("");
    setEstimatedCost("");
  };

  return (
    <div className="space-y-8">
      {/* Add Stop Form */}
      <form
        onSubmit={handleAddStop}
        className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl space-y-4 shadow-sm"
      >
        <h4 className="text-md font-bold text-slate-950 dark:text-white mb-2 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          {t("ui.addStop")}
        </h4>

        <div className="flex gap-4">
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
            <select
              value={selectedDestId}
              onChange={(e) => setSelectedDestId(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- {t("ui.selectPlace")} --</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.prefecture})
                </option>
              ))}
            </select>
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

        {/* Date and Cost Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Visit Date
            </label>
            <Input
              type="date"
              value={stopDate}
              onChange={(e) => setStopDate(e.target.value)}
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.estimatedCost")} (￥)
            </label>
            <Input
              type="number"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              placeholder="e.g. 1500"
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>
        </div>

        {/* Quick Time Presets Bar */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              Quick Time Presets
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  handleApplyPreset(preset.arrival, preset.departure)
                }
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                  arrivalTime === preset.arrival &&
                  departureTime === preset.departure
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-600 dark:text-emerald-300 font-bold"
                    : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {preset.label} ({preset.arrival} – {preset.departure})
              </button>
            ))}
          </div>
        </div>

        {/* Arrival & Departure Time Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.arrivalTime")}
            </label>
            <select
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Select Arrival Time --</option>
              {TIME_OPTIONS.map((time) => (
                <option key={`arr-${time}`} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.departureTime")}
            </label>
            <select
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Select Departure Time --</option>
              {TIME_OPTIONS.map((time) => (
                <option key={`dep-${time}`} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            {t("ui.notes")}
          </label>
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Try local spicy noodles"
            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"
          />
        </div>

        <Button
          type="submit"
          disabled={stopType === "destination" ? !selectedDestId : !customName}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-6"
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
          <p className="text-slate-400 dark:text-slate-500 text-sm italic">
            {t("ui.noItinerariesHint")}
          </p>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-[1.125rem] before:top-4 before:bottom-4 before:w-0.5 before:bg-emerald-500/30 dark:before:bg-emerald-500/40">
            {trip.stops.map((stop, index) => (
              <div
                key={stop.id}
                className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4.5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="absolute -left-[2.25rem] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-extrabold text-sm shadow-md ring-4 ring-slate-50 dark:ring-background">
                  {index + 1}
                </div>

                <div className="flex-grow pl-2">
                  <h5 className="font-extrabold text-slate-900 dark:text-white text-base">
                    {stop.name}
                  </h5>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      {stop.type}
                    </span>

                    {stop.date && (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        <CalendarDays className="w-3 h-3" />
                        {stop.date}
                      </span>
                    )}

                    {(stop.arrivalTime || stop.departureTime) && (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {stop.arrivalTime || "--"} –{" "}
                        {stop.departureTime || "--"}
                      </span>
                    )}

                    {stop.estimatedCost !== undefined && (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ¥{stop.estimatedCost.toLocaleString()}
                      </span>
                    )}

                    {stop.notes && (
                      <span className="italic text-slate-500">
                        "{stop.notes}"
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-4">
                  {/* Reorder Buttons */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move stop up"
                    disabled={index === 0}
                    onClick={() => onReorderStops(index, index - 1)}
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 rounded-full"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move stop down"
                    disabled={index === trip.stops.length - 1}
                    onClick={() => onReorderStops(index, index + 1)}
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 rounded-full"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove stop from itinerary"
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
