import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { formatVisitedDate } from "@/shared/utils/date";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  X,
  Trash2,
  Plus,
  History,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface VisitedDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: {
    id: string;
    name: string;
  };
}

type DatePrecision = "exact" | "month" | "year";

export function VisitedDateModal({
  isOpen,
  onClose,
  destination,
}: VisitedDateModalProps) {
  const {
    getVisitedDates,
    addVisitedDate,
    removeVisitedDate,
    clearAllVisits,
    canMutateProfile,
  } = useTripStore();

  const getTodayStr = () => new Date().toISOString().split("T")[0];
  const getCurrentMonthStr = () => new Date().toISOString().substring(0, 7);
  const getCurrentYearStr = () => String(new Date().getFullYear());

  const [precision, setPrecision] = useState<DatePrecision>("exact");
  const [exactDate, setExactDate] = useState<string>("");
  const [monthYear, setMonthYear] = useState<string>(getCurrentMonthStr());
  const [yearVal, setYearVal] = useState<string>(getCurrentYearStr());

  useEffect(() => {
    if (isOpen) {
      setPrecision("exact");
      setExactDate("");
      setMonthYear(getCurrentMonthStr());
      setYearVal(getCurrentYearStr());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const existingDates = getVisitedDates(destination.id);

  const handleAddVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutateProfile) return;
    let finalValue = "";
    if (precision === "exact") finalValue = exactDate || getTodayStr();
    else if (precision === "month") finalValue = monthYear;
    else if (precision === "year") finalValue = yearVal;

    if (!finalValue) return;
    addVisitedDate(destination.id, finalValue);
  };

  const handleUnmarkAll = () => {
    clearAllVisits(destination.id);
    onClose();
  };

  const setPresetDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    setPrecision("exact");
    setExactDate(d.toISOString().split("T")[0]);
  };

  const currentYearNum = new Date().getFullYear();
  const yearOptions = Array.from({ length: 75 }, (_, i) => currentYearNum - i);

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-page-enter flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visited-history-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2
              id="visited-history-modal-title"
              className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Visit History & Multi-Date Log
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs sm:max-w-md">
              Manage visits for{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {destination.name}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Recorded Visits History Section */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-500" />
                Logged Visits ({existingDates.length})
              </h3>
            </div>

            {existingDates.length === 0 ? (
              <div className="text-center py-4 px-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                No visit entries remaining.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {existingDates.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{formatVisitedDate(d)}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!canMutateProfile}
                      onClick={() => removeVisitedDate(destination.id, d)}
                      className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      title="Delete this visit entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Form to Log Additional Visit */}
          <form onSubmit={handleAddVisit} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-500" />
              Log Another Visit Date
            </h3>

            {/* Precision Switcher */}
            <div>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                <button
                  type="button"
                  onClick={() => setPrecision("exact")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    precision === "exact"
                      ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Exact Date
                </button>
                <button
                  type="button"
                  onClick={() => setPrecision("month")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    precision === "month"
                      ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Month & Year
                </button>
                <button
                  type="button"
                  onClick={() => setPrecision("year")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    precision === "year"
                      ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Year Only
                </button>
              </div>
            </div>

            {/* Dynamic Input based on Precision */}
            <div>
              {precision === "exact" && (
                <div className="relative">
                  <input
                    type="date"
                    value={exactDate}
                    onClick={() => {
                      if (!exactDate) setExactDate(getTodayStr());
                    }}
                    onFocus={() => {
                      if (!exactDate) setExactDate(getTodayStr());
                    }}
                    onChange={(e) => setExactDate(e.target.value)}
                    max={getTodayStr()}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                  <CalendarIcon className="w-5 h-5 text-slate-400 absolute right-4 top-3 pointer-events-none" />
                </div>
              )}

              {precision === "month" && (
                <div className="relative">
                  <input
                    type="month"
                    value={monthYear}
                    onChange={(e) => setMonthYear(e.target.value)}
                    required
                    max={getCurrentMonthStr()}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                  <CalendarIcon className="w-5 h-5 text-slate-400 absolute right-4 top-3 pointer-events-none" />
                </div>
              )}

              {precision === "year" && (
                <div className="relative">
                  <select
                    value={yearVal}
                    onChange={(e) => setYearVal(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium appearance-none"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <CalendarIcon className="w-5 h-5 text-slate-400 absolute right-4 top-3 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Quick Presets */}
            {precision === "exact" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPresetDate(0)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    exactDate === getTodayStr()
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setPresetDate(1)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => setPresetDate(7)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  1 Week Ago
                </button>
              </div>
            )}

            <Button
              type="submit"
              disabled={!canMutateProfile}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold py-2.5"
            >
              + Add Visit Entry
            </Button>
          </form>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Unmark Sight Completely */}
          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              disabled={!canMutateProfile}
              onClick={handleUnmarkAll}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Unmark Destination as Visited
            </button>

            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl text-xs font-bold"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
