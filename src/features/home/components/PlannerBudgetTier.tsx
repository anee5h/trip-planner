import React from "react";
import type { BudgetTier } from "@/shared/types/planner";
import {
  getPlannerBudgetLimit,
  type HomepageTripDuration,
} from "../services/PlannerBudgetPolicy";
import { Wallet } from "lucide-react";

interface PlannerBudgetTierProps {
  budgetTier: BudgetTier;
  onChange: (tier: BudgetTier) => void;
  partySize: number;
  tripDuration: HomepageTripDuration;
}

export const BUDGET_TIER_OPTIONS: Array<{
  value: BudgetTier;
  label: string;
}> = [
  { value: "economy", label: "Economy" },
  { value: "standard", label: "Standard" },
  { value: "comfortable", label: "Comfortable" },
  { value: "luxury", label: "Luxury" },
];

export const PlannerBudgetTier: React.FC<PlannerBudgetTierProps> = ({
  budgetTier,
  onChange,
  partySize,
  tripDuration,
}) => {
  const effectiveLimit = getPlannerBudgetLimit(
    budgetTier,
    partySize,
    tripDuration,
  );

  const durationLabel =
    tripDuration === "shortOuting"
      ? "short outing"
      : tripDuration === "halfDay"
        ? "half day"
        : "full day";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor="planner-budget-tier"
          className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2"
        >
          <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Budget tier</span>
        </label>
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
          Ceiling: ¥{effectiveLimit.toLocaleString()}
        </span>
      </div>

      <div
        id="planner-budget-tier"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        {BUDGET_TIER_OPTIONS.map((opt) => {
          const isSelected = budgetTier === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`h-12 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center border focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                isSelected
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                  : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 text-right">
        About ¥{effectiveLimit.toLocaleString()} max for {partySize}{" "}
        {partySize === 1 ? "person" : "people"} / {durationLabel}
      </p>
    </div>
  );
};

export default PlannerBudgetTier;
