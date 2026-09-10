import { useEffect, useState } from "react";
import type { Trip, TripStop } from "@/shared/types/trip";
import ItineraryPlanner from "./components/ItineraryPlanner";
import { Button } from "@/shared/components/ui/button";
import {
  ArrowLeft,
  Edit3,
  Share2,
  Calendar,
  CalendarDays,
  Printer,
} from "lucide-react";
import {
  downloadIcsFile,
  openGoogleCalendar,
} from "@/shared/services/trips/CalendarService";
import { triggerPdfPrint } from "@/shared/services/trips/PdfExportService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatTripDateRange } from "@/shared/utils/date";
import { getCanonicalTripDateRange } from "@/shared/services/trips/CalendarService";
import TripDatesEditor from "./components/TripDatesEditor";

interface TripDetailsProps {
  trip: Trip;
  onBack: () => void;
  onUpdateTrip: (updates: Partial<Trip>) => void;
  onAddStop: (stop: Omit<TripStop, "id">) => void;
  onRemoveStop: (stopId: string) => void;
  onReorderStops: (startIndex: number, endIndex: number) => void;
}

export default function TripDetails({
  trip,
  onBack,
  onUpdateTrip,
  onAddStop,
  onRemoveStop,
  onReorderStops,
}: TripDetailsProps) {
  const { t, i18n } = useTranslation();
  const canonicalDates = getCanonicalTripDateRange(trip);
  const locale = i18n.language === "ja" ? "ja" : "en";
  const dateLabel = formatTripDateRange(trip.startDate, trip.endDate, locale);
  const [journal, setJournal] = useState(trip.journalNotes || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(trip.title);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDateEditorOpen, setIsDateEditorOpen] = useState(false);
  const hasCanonicalTripDates = Boolean(trip.startDate);

  useEffect(() => {
    if (!isDateEditorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDateEditorOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDateEditorOpen]);

  const handleSaveTitle = () => {
    if (titleInput.trim() !== "") {
      onUpdateTrip({ title: titleInput });
      setIsEditingTitle(false);
    }
  };

  const handleSaveJournal = () => {
    onUpdateTrip({ journalNotes: journal });
  };

  const handleShareTrip = () => {
    const tripLink = `${window.location.origin}/my-trips?tripId=${trip.id}`;
    navigator.clipboard.writeText(tripLink);
    toast.success(t("trips.linkCopied"));
  };

  return (
    <div className="space-y-8 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("ui.back")}
            onClick={onBack}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  id="trip-details-title"
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="min-h-11 min-w-0 max-w-full flex-1 border-b border-slate-300 bg-transparent text-2xl font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 dark:border-slate-700 dark:text-white sm:text-3xl"
                />
                <Button
                  onClick={handleSaveTitle}
                  className="min-h-11 rounded-full bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  {t("ui.save")}
                </Button>
              </div>
            ) : (
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{trip.title}</span>
                <button
                  type="button"
                  aria-label={t("ui.rename")}
                  onClick={() => setIsEditingTitle(true)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <Edit3 className="size-4" />
                </button>
              </h1>
            )}
            {trip.status !== "draft" && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                {t("trips.status")}
                {": "}
                <span className="font-bold capitalize text-emerald-700 dark:text-emerald-300">
                  {t(`trips.statusLabels.${trip.status}`, trip.status)}
                </span>
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                data-trip-date-trigger
                aria-label={
                  dateLabel
                    ? `${dateLabel} · ${t(hasCanonicalTripDates ? "ui.editDates" : "ui.setDates")}`
                    : t(hasCanonicalTripDates ? "ui.editDates" : "ui.setDates")
                }
                onClick={() => setIsDateEditorOpen(true)}
                className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-2 rounded-xl text-left text-sm font-semibold text-slate-700 underline decoration-emerald-600/40 underline-offset-4 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-200 dark:hover:text-emerald-300"
              >
                <CalendarDays
                  className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
                  aria-hidden="true"
                />
                <span className={dateLabel ? "" : "italic"}>
                  {dateLabel || t("ui.noDatesSet")}
                </span>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span
                  data-trip-date-action
                  className="font-bold text-emerald-700 dark:text-emerald-300"
                >
                  {t(hasCanonicalTripDates ? "ui.editDates" : "ui.setDates")}
                </span>
              </button>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {trip.stops.length}{" "}
                {t(trip.stops.length === 1 ? "ui.stop" : "ui.stops")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
          {/* Calendar Exporter Popover */}
          <div className="relative">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("trips.exportCalendar")}
              title={
                canonicalDates
                  ? t("trips.exportCalendar")
                  : t("trips.noCanonicalDatesForCalendar")
              }
              disabled={!canonicalDates}
              onClick={() => {
                if (canonicalDates) setIsCalendarOpen(!isCalendarOpen);
              }}
              className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <Calendar className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
            </Button>

            {isCalendarOpen && (
              <>
                {/* Backdrop guard to close popover */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsCalendarOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => {
                      openGoogleCalendar(trip);
                      setIsCalendarOpen(false);
                    }}
                    className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 text-left text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>{t("ui.addToItinerary")}</span>
                  </button>
                  <button
                    onClick={() => {
                      downloadIcsFile(trip);
                      setIsCalendarOpen(false);
                    }}
                    className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 text-left text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <span>{t("ui.dataExport")}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Print / Save to PDF Button */}
          <Button
            variant="outline"
            size="icon"
            aria-label={t("trips.printTrip")}
            title={t("trips.printTrip")}
            onClick={triggerPdfPrint}
            className="rounded-full border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <Printer className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </Button>

          {/* Share Button */}
          <Button
            variant="outline"
            size="icon"
            aria-label={t("trips.copyTripLink")}
            title={t("trips.copyTripLink")}
            onClick={handleShareTrip}
            className="rounded-full border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <Share2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </Button>
        </div>
      </div>

      {isDateEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-dates-editor-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="trip-dates-editor-title"
                  className="text-lg font-extrabold text-slate-950 dark:text-white"
                >
                  {t(hasCanonicalTripDates ? "ui.editDates" : "ui.setDates")}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {trip.title}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("ui.close")}
                onClick={() => setIsDateEditorOpen(false)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>
            <TripDatesEditor
              initialStartDate={trip.startDate}
              initialEndDate={trip.endDate}
              onSave={(startDate, endDate) => {
                onUpdateTrip({ startDate, endDate });
                setIsDateEditorOpen(false);
              }}
              onCancel={() => setIsDateEditorOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Planner Left Area */}
        <div className="lg:col-span-2 space-y-6 order-1">
          <ItineraryPlanner
            trip={trip}
            onAddStop={onAddStop}
            onRemoveStop={onRemoveStop}
            onReorderStops={onReorderStops}
          />
        </div>

        {/* Journal Right Area */}
        <div className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5 order-2">
          <h4 className="text-md font-bold text-slate-950 dark:text-white">
            {t("trips.journalNotes")}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed">
            {t("trips.journalDescription")}
          </p>

          <textarea
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder={t("trips.journalPlaceholder")}
            className="w-full h-48 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          <Button
            onClick={handleSaveJournal}
            className="w-full bg-slate-900 hover:bg-slate-850 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-full font-bold"
          >
            {t("trips.saveJournal")}
          </Button>
        </div>
      </div>
    </div>
  );
}
