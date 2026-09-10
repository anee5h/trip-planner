import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useTranslation } from "react-i18next";

export interface TripDatesEditorProps {
  initialStartDate?: string;
  initialEndDate?: string;
  onSave: (startDate?: string, endDate?: string) => void;
  onCancel: () => void;
}

interface TripDateFieldProps {
  id: string;
  name: "startDate" | "endDate";
  label: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}

export function TripDateField({
  id,
  name,
  label,
  value,
  placeholder,
  autoFocus,
  onChange,
}: TripDateFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
      >
        <CalendarDays
          className="size-3.5 text-emerald-700 dark:text-emerald-300"
          aria-hidden="true"
        />
        {label}
      </label>
      <div className="relative">
        <CalendarDays
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-emerald-700 dark:text-emerald-300"
          aria-hidden="true"
        />
        <Input
          id={id}
          name={name}
          type="date"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className={`min-h-11 h-11 bg-slate-50 pl-10 pr-3 text-base [color-scheme:light] focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30 dark:bg-slate-900 dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:border-slate-700 ${
            value
              ? "text-slate-900 dark:text-white"
              : "text-transparent dark:text-transparent"
          }`}
        />
        {!value && (
          <span className="pointer-events-none absolute inset-y-0 left-10 flex items-center text-sm text-slate-500 dark:text-slate-400">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TripDatesEditor({
  initialStartDate = "",
  initialEndDate = "",
  onSave,
  onCancel,
}: TripDatesEditorProps) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      setError(t("ui.invalidDates"));
      return;
    }

    setError(null);
    onSave(startDate || undefined, endDate || undefined);
  };

  return (
    <form data-trip-dates-editor onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TripDateField
          id="trip-start-date"
          name="startDate"
          label={t("ui.startDate")}
          placeholder={t("ui.selectDate")}
          value={startDate}
          autoFocus
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

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="min-h-11 rounded-full border-slate-200 px-5 font-semibold dark:border-slate-800"
        >
          {t("ui.cancel")}
        </Button>
        <Button
          type="submit"
          className="min-h-11 rounded-full bg-emerald-700 px-6 font-bold text-white hover:bg-emerald-800"
        >
          {t("ui.save")}
        </Button>
      </div>
    </form>
  );
}
