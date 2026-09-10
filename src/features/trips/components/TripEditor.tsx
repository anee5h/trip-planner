import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useTranslation } from "react-i18next";
import { TripDateField } from "./TripDatesEditor";

interface TripEditorProps {
  initialTitle?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  showDates?: boolean;
  allowBlankTitle?: boolean;
  onSave: (title: string, startDate?: string, endDate?: string) => void;
  onCancel: () => void;
}

export default function TripEditor({
  initialTitle = "",
  initialStartDate = "",
  initialEndDate = "",
  showDates = true,
  allowBlankTitle = true,
  onSave,
  onCancel,
}: TripEditorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowBlankTitle && title.trim() === "") {
      setError(t("ui.titleRequired"));
      return;
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setError(t("ui.invalidDates"));
      return;
    }
    onSave(title.trim(), startDate || undefined, endDate || undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="trip-title"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
        >
          {t("ui.tripTitle")}
          {allowBlankTitle && (
            <span className="ml-1 font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">
              ({t("ui.optional")})
            </span>
          )}
        </label>
        <Input
          id="trip-title"
          name="title"
          type="text"
          value={title}
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder={t("ui.tripTitlePlaceholder")}
          className="min-h-11 rounded-xl border-slate-200 bg-slate-50 text-base text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {showDates && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TripDateField
            id="trip-start-date"
            name="startDate"
            label={t("ui.startDate")}
            placeholder={t("ui.selectDate")}
            value={startDate}
            onChange={(value) => {
              setStartDate(value);
              setError(null);
            }}
          />
          <TripDateField
            id="trip-end-date"
            name="endDate"
            label={t("ui.endDate")}
            placeholder={t("ui.selectDate")}
            value={endDate}
            onChange={(value) => {
              setEndDate(value);
              setError(null);
            }}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="min-h-11 rounded-full border-slate-200 font-semibold dark:border-slate-800"
        >
          {t("ui.cancel")}
        </Button>
        <Button
          type="submit"
          className="min-h-11 rounded-full bg-emerald-700 px-6 font-bold text-white hover:bg-emerald-800"
        >
          {t("ui.saveTrip")}
        </Button>
      </div>
    </form>
  );
}
