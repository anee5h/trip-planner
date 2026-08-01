import React from "react";
import { Minus, Plus, Users } from "lucide-react";

interface PlannerPartyStepperProps {
  partySize: number;
  onChange: (size: number) => void;
}

export const PlannerPartyStepper: React.FC<PlannerPartyStepperProps> = ({
  partySize,
  onChange,
}) => {
  const isMin = partySize <= 1;
  const isMax = partySize >= 8;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor="planner-party-stepper"
          className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2"
        >
          <Users className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Travel party</span>
        </label>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {partySize === 1 ? "Solo traveler" : `${partySize} people`}
        </span>
      </div>

      <div
        id="planner-party-stepper"
        className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 h-14"
      >
        <button
          type="button"
          aria-label="Decrease party size"
          disabled={isMin}
          onClick={() => onChange(partySize - 1)}
          className={`flex items-center justify-center w-11 h-11 rounded-lg font-bold text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
            isMin
              ? "text-slate-300 dark:text-slate-700 cursor-not-allowed bg-transparent"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Minus className="w-4 h-4" />
        </button>

        <span className="font-bold text-base text-slate-900 dark:text-white px-4 select-none">
          {partySize} {partySize === 1 ? "person" : "people"}
        </span>

        <button
          type="button"
          aria-label="Increase party size"
          disabled={isMax}
          onClick={() => onChange(partySize + 1)}
          className={`flex items-center justify-center w-11 h-11 rounded-lg font-bold text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
            isMax
              ? "text-slate-300 dark:text-slate-700 cursor-not-allowed bg-transparent"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PlannerPartyStepper;
