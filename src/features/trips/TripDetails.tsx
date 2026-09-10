import { useEffect, useRef, useState } from "react";
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
  MoreHorizontal,
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
import ModalDialog from "@/shared/components/ui/ModalDialog";

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
  const [dateDialogOpener, setDateDialogOpener] =
    useState<HTMLButtonElement | null>(null);
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const hasCanonicalTripDates = Boolean(trip.startDate);

  useEffect(() => {
    if (!isMoreActionsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        moreActionsRef.current &&
        event.target instanceof Node &&
        moreActionsRef.current.contains(event.target)
      ) {
        return;
      }
      setIsMoreActionsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMoreActionsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreActionsOpen]);

  const handleSaveTitle = () => {
    if (titleInput.trim() !== "") {
      onUpdateTrip({ title: titleInput });
      setIsEditingTitle(false);
    }
  };

  const handleSaveJournal = () => {
    onUpdateTrip({ journalNotes: journal });
  };

  const closeDateEditor = () => {
    setIsDateEditorOpen(false);
    setDateDialogOpener(null);
  };

  const handleShareTrip = () => {
    const tripLink = `${window.location.origin}/my-trips?tripId=${trip.id}`;
    navigator.clipboard.writeText(tripLink);
    toast.success(t("trips.linkCopied"));
  };

  return (
    <div data-trip-detail-page className="space-y-6 pb-8">
      {/* Header Bar */}
      <div
        ref={moreActionsRef}
        data-trip-header
        className="border-b border-slate-200 pb-5 dark:border-slate-800"
      >
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("ui.back")}
            onClick={onBack}
            className="-ml-3 min-h-11 min-w-11 shrink-0 rounded-full text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="size-5" />
          </Button>

          <div
            data-trip-secondary-actions
            className="flex items-center gap-1.5"
          >
            {/* Calendar export remains a labeled, separate action. */}
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
                className="min-h-11 min-w-11 rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                <Calendar className="size-5 text-emerald-700 dark:text-emerald-300" />
              </Button>

              {isCalendarOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsCalendarOpen(false)}
                  />
                  <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                    <button
                      type="button"
                      onClick={() => {
                        openGoogleCalendar(trip);
                        setIsCalendarOpen(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl p-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      <Calendar className="size-4 text-blue-600" />
                      <span>{t("ui.addToItinerary")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        downloadIcsFile(trip);
                        setIsCalendarOpen(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl p-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      <Calendar className="size-4 text-purple-600" />
                      <span>{t("ui.dataExport")}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="relative md:hidden">
              <Button
                variant="outline"
                size="icon"
                data-trip-more-actions
                aria-label={t("ui.moreActions")}
                aria-expanded={isMoreActionsOpen}
                aria-haspopup="menu"
                onClick={() => setIsMoreActionsOpen((open) => !open)}
                className="min-h-11 min-w-11 rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                <MoreHorizontal className="size-5" />
              </Button>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <Button
                variant="outline"
                size="icon"
                aria-label={t("trips.printTrip")}
                title={t("trips.printTrip")}
                onClick={triggerPdfPrint}
                className="min-h-11 min-w-11 rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                <Printer className="size-5 text-slate-600 dark:text-slate-300" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("trips.copyTripLink")}
                title={t("trips.copyTripLink")}
                onClick={handleShareTrip}
                className="min-h-11 min-w-11 rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                <Share2 className="size-5 text-slate-600 dark:text-slate-300" />
              </Button>
            </div>
          </div>
        </div>

        <div data-trip-header-content className="mt-2 min-w-0">
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
            <h1 className="flex flex-wrap items-center gap-1.5 text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
              <span className="min-w-0 break-words">{trip.title}</span>
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
              onClick={(event) => {
                setDateDialogOpener(event.currentTarget);
                setIsDateEditorOpen(true);
              }}
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
        {isMoreActionsOpen && (
          <div data-trip-more-menu className="mt-2 flex justify-end md:hidden">
            <div
              role="menu"
              className="w-full max-w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  triggerPdfPrint();
                  setIsMoreActionsOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Printer className="size-4" />
                {t("trips.printTrip")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  handleShareTrip();
                  setIsMoreActionsOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Share2 className="size-4" />
                {t("trips.copyTripLink")}
              </button>
            </div>
          </div>
        )}
      </div>

      {isDateEditorOpen && (
        <ModalDialog
          titleId="trip-dates-editor-title"
          onClose={closeDateEditor}
          opener={dateDialogOpener}
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
              onClick={closeDateEditor}
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
              closeDateEditor();
            }}
            onCancel={closeDateEditor}
          />
        </ModalDialog>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Planner Left Area */}
        <div className="order-1 space-y-6 lg:col-span-2">
          <ItineraryPlanner
            trip={trip}
            onAddStop={onAddStop}
            onRemoveStop={onRemoveStop}
            onReorderStops={onReorderStops}
          />
        </div>

        {/* Journal Right Area */}
        <div
          data-trip-journal
          className="order-2 h-fit space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5"
        >
          <h4 className="text-md font-bold text-slate-950 dark:text-white">
            {t("trips.journalNotes")}
          </h4>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-300">
            {t("trips.journalDescription")}
          </p>

          <textarea
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder={t("trips.journalPlaceholder")}
            className="h-36 w-full rounded-2xl border border-slate-200 bg-white p-3 text-base focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-950 sm:text-sm"
          />

          <Button
            onClick={handleSaveJournal}
            className="min-h-11 w-full rounded-full bg-slate-900 font-bold text-white hover:bg-slate-850 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            {t("trips.saveJournal")}
          </Button>
        </div>
      </div>
    </div>
  );
}
