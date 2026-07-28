import { useState } from "react";
import type { Trip, TripStop } from "@/shared/types/trip";
import { TripStopType } from "@/shared/types/trip";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ItineraryPlannerProps {
  trip: Trip;
  onAddStop: (stop: Omit<TripStop, "id">) => void;
  onRemoveStop: (stopId: string) => void;
  onReorderStops: (startIndex: number, endIndex: number) => void;
}

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
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  const destinations = getDestinationList() as Destination[];

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
        arrivalTime: arrivalTime || undefined,
        departureTime: departureTime || undefined,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
      });
    }

    // Reset Form
    setSelectedDestId("");
    setCustomName("");
    setNotes("");
    setArrivalTime("");
    setDepartureTime("");
    setEstimatedCost("");
  };

  return (
    <div className="space-y-8">
      {/* Add Stop Form */}
      <form
        onSubmit={handleAddStop}
        className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl space-y-4"
      >
        <h4 className="text-md font-bold text-slate-950 dark:text-white mb-2">
          {t("ui.addStop")}
        </h4>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setStopType("destination")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              stopType === "destination"
                ? "bg-slate-900 text-white dark:bg-emerald-600 border-transparent"
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
                ? "bg-slate-900 text-white dark:bg-emerald-600 border-transparent"
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
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.arrivalTime")}
            </label>
            <Input
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {t("ui.departureTime")}
            </label>
            <Input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      {stop.type}
                    </span>
                    {(stop.arrivalTime || stop.departureTime) && (
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {stop.arrivalTime || "--"} -{" "}
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
