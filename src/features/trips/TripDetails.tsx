import { useState } from "react";
import type { Trip, TripStop } from "@/shared/types/trip";
import ItineraryPlanner from "./components/ItineraryPlanner";
import { Button } from "@/shared/components/ui/button";
import { ArrowLeft, Edit3, Share2, Calendar, Printer } from "lucide-react";
import {
  downloadIcsFile,
  openGoogleCalendar,
} from "@/shared/services/trips/CalendarService";
import { triggerPdfPrint } from "@/shared/services/trips/PdfExportService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [journal, setJournal] = useState(trip.journalNotes || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(trip.title);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

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
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="text-3xl font-extrabold bg-transparent border-b border-slate-300 focus:outline-none text-slate-900 dark:text-white"
                />
                <Button
                  onClick={handleSaveTitle}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-semibold px-4 text-xs h-8"
                >
                  {t("ui.save")}
                </Button>
              </div>
            ) : (
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{trip.title}</span>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </h1>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("trips.status")}:{" "}
              <span className="font-bold capitalize text-emerald-600 dark:text-emerald-400">
                {t(`trips.statusLabels.${trip.status}`, trip.status)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
          {/* Calendar Exporter Popover */}
          <div className="relative">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("trips.exportCalendar")}
              title={t("trips.exportCalendar")}
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="rounded-full border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
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
            <Printer className="w-5 h-5 text-slate-600 dark:text-slate-400" />
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
            <Share2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </Button>
        </div>
      </div>

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
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {t("trips.journalDescription")}
          </p>

          <textarea
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder={t("trips.journalPlaceholder")}
            className="w-full h-48 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
