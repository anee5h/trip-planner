import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Trip, TripStop } from "@/shared/types/trip";
import { TripStopType } from "@/shared/types/trip";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Plus,
  CalendarDays,
  Calendar as CalendarIcon,
  GripVertical,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchableDestinationPicker } from "@/shared/components/ui/SearchableDestinationPicker";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { useRecentlyViewedDestinations } from "@/shared/hooks/useRecentlyViewedDestinations";
import { Link } from "react-router-dom";
import { formatTripDateRange } from "@/shared/utils/date";
import {
  groupItineraryStops,
  type ItineraryStopGroup,
} from "./ItineraryPlannerModel";

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

function getUtcDay(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function addUtcDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const MAX_DATE_PRESET_DAYS = 31;

function getGroupAtIndex(
  groups: ItineraryStopGroup[],
  index: number,
): ItineraryStopGroup | undefined {
  return groups.find((group) =>
    group.stops.some((entry) => entry.index === index),
  );
}

function formatGroupLabel(
  date: string | undefined,
  tripStartDate: string | undefined,
  tripEndDate: string | undefined,
  locale: "en" | "ja",
): string {
  if (!date) return locale === "ja" ? "日程未設定" : "Unscheduled";

  const formatted = formatTripDateRange(date, undefined, locale);
  const hasCanonicalStart = /^\d{4}-\d{2}-\d{2}$/.test(tripStartDate ?? "");
  const hasCanonicalDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const canonicalEnd = /^\d{4}-\d{2}-\d{2}$/.test(tripEndDate ?? "")
    ? tripEndDate
    : hasCanonicalStart
      ? tripStartDate
      : undefined;

  if (hasCanonicalStart && hasCanonicalDate) {
    const isWithinTripDates =
      date >= tripStartDate! && (!canonicalEnd || date <= canonicalEnd);
    if (!isWithinTripDates) {
      return locale === "ja"
        ? `日程範囲外 · ${formatted}`
        : `Outside trip dates · ${formatted}`;
    }

    const dayNumber = getUtcDay(date) - getUtcDay(tripStartDate!) + 1;
    if (Number.isInteger(dayNumber) && dayNumber > 0) {
      return locale === "ja"
        ? `${dayNumber}日目 · ${formatted}`
        : `Day ${dayNumber} · ${formatted}`;
    }
  }

  return locale === "ja" ? `予定日 · ${formatted}` : `Scheduled · ${formatted}`;
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
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<{
    stopId: string;
    startIndex: number;
    overIndex: number;
  } | null>(null);
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const focusStopRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isAddStopExpanded, setIsAddStopExpanded] = useState(
    trip.stops.length === 0,
  );

  const {
    places: cataloguePlaces,
    error: liteError,
    retry: retryLite,
  } = useCatalogue({ need: "summary" });
  const destinations = cataloguePlaces as Destination[];
  const stopGroups = useMemo(
    () => groupItineraryStops(trip.stops),
    [trip.stops],
  );

  const savedDestinations = useMemo(() => {
    return (favorites || [])
      .map((id) => destinations.find((d) => d.id === id))
      .filter((d): d is Destination => Boolean(d));
  }, [favorites, destinations]);

  const hasCanonicalTripDates = Boolean(
    trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate),
  );

  const canonicalTripDateRange = useMemo(() => {
    if (!trip.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) {
      return null;
    }

    const startDay = getUtcDay(trip.startDate);
    const endDate =
      trip.endDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.endDate)
        ? trip.endDate
        : trip.startDate;
    return {
      startDate: trip.startDate,
      endDate,
      duration: Math.max(1, getUtcDay(endDate) - startDay + 1),
    };
  }, [trip.endDate, trip.startDate]);

  const tripDatePresets = useMemo(() => {
    const presets: Array<{ label: string; date: string }> = [];
    if (canonicalTripDateRange) {
      if (canonicalTripDateRange.duration <= MAX_DATE_PRESET_DAYS) {
        for (let i = 0; i < canonicalTripDateRange.duration; i += 1) {
          const date = addUtcDays(canonicalTripDateRange.startDate, i);
          presets.push({
            label:
              locale === "ja"
                ? `${i + 1}日目 · ${formatTripDateRange(date, undefined, locale)}`
                : `Day ${i + 1} · ${formatTripDateRange(date, undefined, locale)}`,
            date,
          });
        }
      }
      presets.push({
        label: locale === "ja" ? "日程未設定" : "Unscheduled",
        date: "",
      });
      return presets;
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
    presets.push({
      label: locale === "ja" ? "日程未設定" : "Unscheduled",
      date: "",
    });
    return presets;
  }, [canonicalTripDateRange, locale]);

  const hasExpandedDatePicker = Boolean(
    canonicalTripDateRange &&
    canonicalTripDateRange.duration > MAX_DATE_PRESET_DAYS,
  );

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
    setIsAddStopExpanded(false);
  };

  const handleRemoveStop = (stopId: string) => {
    onRemoveStop(stopId);
    if (trip.stops.length === 1) {
      setIsAddStopExpanded(true);
    }
  };

  const announceMove = (stop: TripStop, endIndex: number) => {
    setAnnouncement(
      locale === "ja"
        ? `${stop.name}を${endIndex + 1}番目に移動しました`
        : `${stop.name} moved to position ${endIndex + 1}`,
    );
  };

  const moveStop = (startIndex: number, endIndex: number) => {
    if (
      startIndex < 0 ||
      endIndex < 0 ||
      startIndex >= trip.stops.length ||
      endIndex >= trip.stops.length ||
      startIndex === endIndex
    ) {
      return;
    }
    const stop = trip.stops[startIndex];
    const sourceGroup = getGroupAtIndex(stopGroups, startIndex);
    const targetGroup = getGroupAtIndex(stopGroups, endIndex);
    if (!sourceGroup || sourceGroup.key !== targetGroup?.key) {
      return;
    }
    focusStopRef.current = stop.id;
    setOpenMenuId(null);
    onReorderStops(startIndex, endIndex);
    announceMove(stop, endIndex);
  };

  useLayoutEffect(() => {
    const stopId = focusStopRef.current;
    if (!stopId) return;
    rowRefs.current[stopId]
      ?.querySelector<HTMLButtonElement>("[data-stop-actions]")
      ?.focus();
    focusStopRef.current = null;
  }, [trip.stops]);

  useEffect(() => {
    if (!openMenuId) return;

    const row = rowRefs.current[openMenuId];
    const handlePointerDown = (event: PointerEvent) => {
      if (row && event.target instanceof Node && row.contains(event.target)) {
        return;
      }
      setOpenMenuId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenuId(null);
      row?.querySelector<HTMLButtonElement>("[data-stop-actions]")?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  const handleDragStart = (
    event: React.PointerEvent<HTMLButtonElement>,
    stopId: string,
    startIndex: number,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can fail for synthetic or already-released pointers.
    }
    dragRef.current = { stopId, startIndex, overIndex: startIndex };
    setDraggedStopId(stopId);
    setDragOverIndex(startIndex);
    setOpenMenuId(null);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const sourceStop = trip.stops[drag.startIndex];
    const sourceGroup = getGroupAtIndex(stopGroups, drag.startIndex);
    if (!sourceStop || !sourceGroup) return;
    const remainingStops = trip.stops
      .map((stop, index) => ({ stop, index }))
      .filter(({ stop }) => stop.id !== drag.stopId);
    const groupStops = sourceGroup.stops.filter(
      ({ stop }) => stop.id !== drag.stopId,
    );

    let insertionSlot = groupStops.length;
    let visualIndex = drag.startIndex;
    for (let slot = 0; slot < groupStops.length; slot += 1) {
      const row = rowRefs.current[groupStops[slot].stop.id];
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        insertionSlot = slot;
        visualIndex = groupStops[slot].index;
        break;
      }
    }

    if (groupStops.length > 0 && insertionSlot === groupStops.length) {
      visualIndex = groupStops[groupStops.length - 1].index;
    }

    const targetEntry =
      insertionSlot < groupStops.length
        ? groupStops[insertionSlot]
        : groupStops[groupStops.length - 1];
    const targetIndex = targetEntry
      ? insertionSlot < groupStops.length
        ? remainingStops.findIndex(
            ({ stop }) => stop.id === targetEntry.stop.id,
          )
        : remainingStops.findIndex(
            ({ stop }) => stop.id === targetEntry.stop.id,
          ) + 1
      : drag.startIndex;

    drag.overIndex = targetIndex;
    setDragOverIndex(visualIndex);
  };

  const clearDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragRef.current = null;
    setDraggedStopId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const endIndex = drag.overIndex;
    clearDrag(event);
    if (endIndex !== drag.startIndex) {
      const stop = trip.stops[drag.startIndex];
      onReorderStops(drag.startIndex, endIndex);
      announceMove(stop, endIndex);
    }
  };

  const handleDragCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    clearDrag(event);
  };

  const handleLostPointerCapture = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDraggedStopId(null);
    setDragOverIndex(null);
  };

  // KAI-132: a failed lite load is NOT an empty destination list — the
  // saved/favorite list and picker must not masquerade as empty. Surface
  // an explicit error/retry state.
  if (liteError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <div
          role="alert"
          data-lite-error
          className="flex flex-col items-center justify-center py-8 px-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t("home.matchesErrorTitle", "Couldn't load destinations")}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "home.matchesErrorBody",
              "The destination catalogue couldn't be loaded. Check your connection and try again.",
            )}
          </p>
          <button
            type="button"
            onClick={retryLite}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("ui.retry", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Add Stop Form */}
      <form
        data-add-stop-form
        data-add-stop-collapsed={!isAddStopExpanded ? "true" : undefined}
        onSubmit={handleAddStop}
        className={`border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:space-y-4 sm:p-6 ${
          isAddStopExpanded ? "space-y-4 rounded-3xl p-4" : "rounded-2xl p-2"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <h4
            className={`text-md mb-2 items-center gap-2 font-bold text-slate-950 dark:text-white ${
              isAddStopExpanded ? "flex" : "hidden sm:flex"
            }`}
          >
            <CalendarDays className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            {t("ui.addStop")}
          </h4>
          <button
            type="button"
            data-add-stop-toggle
            aria-expanded={isAddStopExpanded}
            aria-controls="add-stop-panel"
            onClick={() => setIsAddStopExpanded((expanded) => !expanded)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40 sm:hidden ${
              isAddStopExpanded
                ? "shrink-0 px-3"
                : "w-full justify-between px-3"
            }`}
          >
            {isAddStopExpanded ? (
              <>
                {t("ui.close")}
                <ChevronUp className="size-4" aria-hidden="true" />
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="size-4" aria-hidden="true" />
                  {t("ui.addStopShort")}
                </span>
                <ChevronDown className="size-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>

        <div
          id="add-stop-panel"
          data-add-stop-panel
          data-state={isAddStopExpanded ? "expanded" : "collapsed"}
          className={
            isAddStopExpanded ? "space-y-4" : "hidden space-y-4 sm:block"
          }
        >
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStopType("destination")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                stopType === "destination"
                  ? "bg-slate-900 text-white dark:bg-emerald-600 border-transparent shadow-sm"
                  : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
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
                  : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              {t("ui.customLocation")}
            </button>
          </div>

          {stopType === "destination" ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-1">
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
                      ? destinations.find((d) => d.id === s.destinationId)
                      : null,
                  )
                  .filter((d): d is Destination => Boolean(d))}
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-1">
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
              <label
                htmlFor="stop-date"
                className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 flex items-center gap-1.5"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-emerald-500" />
                {t("datePicker.chooseTravelDate")}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tripDatePresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setStopDate(preset.date)}
                    className={`min-h-9 rounded-md border px-2.5 py-1 text-left text-[11px] font-bold leading-4 transition-all ${
                      stopDate === preset.date
                        ? "bg-emerald-700 text-white border-emerald-600 shadow-sm"
                        : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            {hasExpandedDatePicker && canonicalTripDateRange && (
              <Input
                id="stop-date"
                type="date"
                value={stopDate}
                min={canonicalTripDateRange.startDate}
                max={canonicalTripDateRange.endDate}
                aria-label={
                  locale === "ja" ? "旅行日を選択" : "Choose travel date"
                }
                onChange={(e) => handleDateChange(e.target.value)}
                onBlur={(e) => handleDateChange(e.target.value)}
                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl text-base sm:text-sm w-full"
              />
            )}
            {!hasCanonicalTripDates && (
              <Input
                id="stop-date"
                type="date"
                value={stopDate}
                min="2020-01-01"
                max="2035-12-31"
                onChange={(e) => handleDateChange(e.target.value)}
                onBlur={(e) => handleDateChange(e.target.value)}
                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl text-base sm:text-sm w-full"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-1">
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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="submit"
              disabled={
                stopType === "destination" ? !selectedDestId : !customName
              }
              className="w-full rounded-full bg-emerald-700 px-6 font-bold text-white hover:bg-emerald-800 sm:w-auto"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span>{t("ui.addStopAction")}</span>
            </Button>
          </div>
        </div>
      </form>

      {/* Stops List */}
      <div className="space-y-4">
        <h4 className="text-lg font-bold text-slate-950 dark:text-white">
          {t("ui.itineraryOrder")}
        </h4>

        {announcement && (
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        )}

        {trip.stops.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-slate-500 dark:text-slate-300">
            {t("ui.noItinerariesHint")}
          </p>
        ) : (
          <div className="space-y-5">
            {stopGroups.map((group) => (
              <section
                key={group.key}
                aria-label={formatGroupLabel(
                  group.date,
                  trip.startDate,
                  trip.endDate,
                  locale,
                )}
              >
                <h5 className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">
                  <CalendarDays className="size-3.5 text-emerald-600 dark:text-emerald-300" />
                  {formatGroupLabel(
                    group.date,
                    trip.startDate,
                    trip.endDate,
                    locale,
                  )}
                </h5>

                <div role="list" className="space-y-2">
                  {group.stops.map(({ stop, index }) => {
                    const isDragging = draggedStopId === stop.id;
                    const destinationPath =
                      stop.type === "destination" && stop.destinationId
                        ? `/destinations/${stop.destinationId}`
                        : undefined;

                    return (
                      <div
                        key={stop.id}
                        ref={(node) => {
                          rowRefs.current[stop.id] = node;
                        }}
                        role="listitem"
                        data-stop-id={stop.id}
                        data-drag-state={isDragging ? "dragging" : undefined}
                        data-drag-target={
                          dragOverIndex === index && !isDragging
                            ? "true"
                            : undefined
                        }
                        className={`relative flex touch-pan-y items-start gap-1.5 rounded-2xl border bg-white px-2.5 py-2.5 shadow-sm transition-[transform,box-shadow,border-color,background-color] dark:bg-slate-900 sm:gap-3 sm:px-3 ${
                          isDragging
                            ? "scale-[1.01] border-emerald-500 bg-emerald-50 opacity-90 shadow-lg ring-2 ring-emerald-500/30 dark:bg-emerald-950/30"
                            : "border-slate-200 dark:border-slate-800"
                        } ${
                          dragOverIndex === index && !isDragging
                            ? "border-emerald-500 ring-2 ring-emerald-400/70 ring-offset-2 before:absolute before:-top-2 before:left-4 before:right-4 before:h-1 before:rounded-full before:bg-emerald-500 before:content-[''] dark:ring-offset-slate-950"
                            : ""
                        }`}
                      >
                        <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-700/90 text-xs font-extrabold text-white">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          {destinationPath ? (
                            <Link
                              to={destinationPath}
                              data-stop-link
                              className="block line-clamp-2 break-words py-0.5 text-sm font-extrabold leading-5 text-slate-900 underline-offset-4 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-white dark:hover:text-emerald-300"
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 2,
                              }}
                            >
                              {stop.name}
                            </Link>
                          ) : (
                            <span className="block break-words py-0.5 text-sm font-extrabold leading-5 text-slate-900 dark:text-white">
                              {stop.name}
                            </span>
                          )}
                          {stop.notes && (
                            <p className="mt-1 max-w-full break-words whitespace-normal text-xs italic leading-5 text-slate-500 dark:text-slate-300">
                              “{stop.notes}”
                            </p>
                          )}
                        </div>

                        <div
                          data-stop-action-cluster
                          className="flex w-[5.5rem] shrink-0 items-start justify-end gap-0.5"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-drag-handle
                            aria-label={
                              locale === "ja"
                                ? `${stop.name}の並べ替えハンドル`
                                : `Reorder ${stop.name}`
                            }
                            aria-grabbed={isDragging}
                            onPointerDown={(event) =>
                              handleDragStart(event, stop.id, index)
                            }
                            onPointerMove={handleDragMove}
                            onPointerUp={handleDragEnd}
                            onPointerCancel={handleDragCancel}
                            onLostPointerCapture={handleLostPointerCapture}
                            title={
                              locale === "ja"
                                ? "長押しして並べ替え"
                                : "Drag to reorder"
                            }
                            className="min-h-11 min-w-11 shrink-0 touch-none cursor-grab rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <GripVertical
                              className="size-5"
                              aria-hidden="true"
                            />
                          </Button>

                          <div className="relative shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              data-stop-actions
                              aria-label={
                                locale === "ja"
                                  ? "スポットの操作"
                                  : "Stop actions"
                              }
                              aria-expanded={openMenuId === stop.id}
                              aria-haspopup="menu"
                              onClick={() =>
                                setOpenMenuId((open) =>
                                  open === stop.id ? null : stop.id,
                                )
                              }
                              className="min-h-11 min-w-11 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <MoreHorizontal className="size-5" />
                            </Button>

                            {openMenuId === stop.id && (
                              <div
                                role="menu"
                                className="absolute right-0 top-12 z-50 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={
                                    index === 0 ||
                                    getGroupAtIndex(stopGroups, index - 1)
                                      ?.key !==
                                      getGroupAtIndex(stopGroups, index)?.key
                                  }
                                  onClick={() => moveStop(index, index - 1)}
                                  className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  {t("trips.moveUp", "Move stop up")}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={
                                    index === trip.stops.length - 1 ||
                                    getGroupAtIndex(stopGroups, index + 1)
                                      ?.key !==
                                      getGroupAtIndex(stopGroups, index)?.key
                                  }
                                  onClick={() => moveStop(index, index + 1)}
                                  className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  {t("trips.moveDown", "Move stop down")}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleRemoveStop(stop.id);
                                  }}
                                  className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                                >
                                  {t(
                                    "trips.removeStop",
                                    "Remove stop from itinerary",
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
