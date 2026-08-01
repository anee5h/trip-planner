import React from "react";
import {
  Sparkles,
  Utensils,
  Trees,
  Palette,
  Camera,
  Waves,
  Landmark,
  Snowflake,
  Clock,
  Car,
  Train,
  Shuffle,
  Search,
  Users,
  Wallet,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/components/ui/select";
import type { BudgetTier } from "@/shared/types/planner";
import type { HomepageTripDuration } from "../services/PlannerBudgetPolicy";
import type { TransportPreference } from "../services/TransportResolver";

interface HomePlannerProps {
  vibe: string;
  onVibeChange: (vibe: string) => void;

  tripDuration: HomepageTripDuration;
  onTripDurationChange: (dur: HomepageTripDuration) => void;

  partySize: number;
  onPartySizeChange: (size: number) => void;

  budgetTier: BudgetTier;
  onBudgetTierChange: (tier: BudgetTier) => void;

  transportPreference: TransportPreference;
  onTransportPreferenceChange: (pref: TransportPreference) => void;

  hasUserApplied: boolean;
  isDirty: boolean;
  onApplyMatches: () => void;
  onSurpriseMe: () => void;
}

const VIBE_LABELS: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  any: { label: "Anything goes", icon: Sparkles, color: "text-slate-400" },
  art: { label: "Art & Museums", icon: Palette, color: "text-purple-500" },
  food: { label: "Food & Eating", icon: Utensils, color: "text-orange-500" },
  nature: {
    label: "Nature & Outdoors",
    icon: Trees,
    color: "text-emerald-500",
  },
  history: {
    label: "History & Culture",
    icon: Landmark,
    color: "text-amber-700",
  },
  sea: { label: "Sea Escape", icon: Waves, color: "text-blue-500" },
  cool: { label: "Cool Escape", icon: Snowflake, color: "text-sky-400" },
  themepark: { label: "Theme Parks", icon: Sparkles, color: "text-pink-500" },
  photography: { label: "Photography", icon: Camera, color: "text-rose-400" },
};

const DURATION_LABELS: Record<
  HomepageTripDuration,
  { label: string; hint: string }
> = {
  shortOuting: { label: "Short outing", hint: "< 4h" },
  halfDay: { label: "Half day", hint: "4–7.5h" },
  fullDay: { label: "Full day", hint: "7.5–14h" },
};

const BUDGET_TIER_LABELS: Record<BudgetTier, { label: string; desc: string }> =
  {
    economy: { label: "Economy", desc: "Budget friendly" },
    standard: { label: "Standard", desc: "Balanced spending" },
    comfortable: { label: "Comfortable", desc: "Higher comfort" },
    luxury: { label: "Luxury", desc: "Premium experience" },
  };

const TRANSPORT_LABELS: Record<
  TransportPreference,
  { label: string; icon: React.ElementType }
> = {
  public: { label: "Public transit", icon: Train },
  myCar: { label: "My car", icon: Car },
  rentalCar: { label: "Rental car", icon: Car },
  either: { label: "Either", icon: Shuffle },
};

export const HomePlanner: React.FC<HomePlannerProps> = ({
  vibe,
  onVibeChange,
  tripDuration,
  onTripDurationChange,
  partySize,
  onPartySizeChange,
  budgetTier,
  onBudgetTierChange,
  transportPreference,
  onTransportPreferenceChange,
  hasUserApplied,
  isDirty,
  onApplyMatches,
  onSurpriseMe,
}) => {
  const primaryButtonLabel = !hasUserApplied
    ? "Find matches"
    : isDirty
      ? "Update matches"
      : "View matches";

  const currentVibe = VIBE_LABELS[vibe] || VIBE_LABELS.any;
  const VibeIcon = currentVibe.icon;

  const currentDuration =
    DURATION_LABELS[tripDuration] || DURATION_LABELS.fullDay;
  const currentBudget =
    BUDGET_TIER_LABELS[budgetTier] || BUDGET_TIER_LABELS.standard;
  const currentTransport =
    TRANSPORT_LABELS[transportPreference] || TRANSPORT_LABELS.public;
  const TransportIcon = currentTransport.icon;

  return (
    <div className="w-full">
      {/* DESKTOP VIEW: Skyscanner-Style Full-Width Horizontal Bar (lg:flex) */}
      <div className="hidden lg:flex flex-col items-center w-full max-w-6xl mx-auto">
        {/* Row 1: Filter Bar (5 Equal Segments) */}
        <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-2 flex items-center gap-1 h-20">
          {/* Segment 1: Vibe (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors flex flex-col justify-center relative cursor-pointer">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
              Vibe
            </span>
            <Select
              value={vibe}
              onValueChange={(val: string | null) => {
                if (val) onVibeChange(val);
              }}
            >
              <SelectTrigger className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <VibeIcon
                    className={`w-4 h-4 shrink-0 ${currentVibe.color}`}
                  />
                  <span className="truncate">{currentVibe.label}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                {Object.entries(VIBE_LABELS).map(([key, item]) => {
                  const Icon = item.icon;
                  return (
                    <SelectItem
                      key={key}
                      value={key}
                      className="py-2.5 px-3 cursor-pointer"
                    >
                      <div className="flex items-center text-xs font-semibold">
                        <Icon className={`w-4 h-4 mr-2.5 ${item.color}`} />
                        <span>{item.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />

          {/* Segment 2: Duration (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors flex flex-col justify-center relative cursor-pointer">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
              Duration
            </span>
            <Select
              value={tripDuration}
              onValueChange={(val: string | null) => {
                if (val) onTripDurationChange(val as HomepageTripDuration);
              }}
            >
              <SelectTrigger className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">{currentDuration.label}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                {Object.entries(DURATION_LABELS).map(([key, item]) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="py-2.5 px-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold w-full gap-3">
                      <span>{item.label}</span>
                      <span className="text-slate-400 text-[10px]">
                        {item.hint}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />

          {/* Segment 3: Party (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors flex flex-col justify-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
              Party
            </span>
            <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-900 dark:text-white">
              <div className="flex items-center gap-1.5 truncate">
                <Users className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{partySize}</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  aria-label="Decrease party size"
                  disabled={partySize <= 1}
                  onClick={() => onPartySizeChange(Math.max(1, partySize - 1))}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label="Increase party size"
                  disabled={partySize >= 8}
                  onClick={() => onPartySizeChange(Math.min(8, partySize + 1))}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />

          {/* Segment 4: Budget (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors flex flex-col justify-center relative cursor-pointer">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
              Budget
            </span>
            <Select
              value={budgetTier}
              onValueChange={(val: string | null) => {
                if (val) onBudgetTierChange(val as BudgetTier);
              }}
            >
              <SelectTrigger className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">{currentBudget.label}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                {Object.entries(BUDGET_TIER_LABELS).map(([key, item]) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="py-2.5 px-3 cursor-pointer"
                  >
                    <div className="flex flex-col text-xs font-semibold">
                      <span>{item.label}</span>
                      <span className="text-slate-400 text-[10px] font-normal">
                        {item.desc}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />

          {/* Segment 5: Getting Around (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors flex flex-col justify-center relative cursor-pointer">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
              Getting around
            </span>
            <Select
              value={transportPreference}
              onValueChange={(val: string | null) => {
                if (val)
                  onTransportPreferenceChange(val as TransportPreference);
              }}
            >
              <SelectTrigger className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <TransportIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">{currentTransport.label}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                {Object.entries(TRANSPORT_LABELS).map(([key, item]) => {
                  const Icon = item.icon;
                  return (
                    <SelectItem
                      key={key}
                      value={key}
                      className="py-2.5 px-3 cursor-pointer"
                    >
                      <div className="flex items-center text-xs font-semibold">
                        <Icon className="w-4 h-4 mr-2 text-slate-400" />
                        <span>{item.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Action Buttons Row (Centered directly beneath filter bar) */}
        <div className="mt-4 flex items-center justify-center gap-3 w-full">
          <Button
            size="lg"
            className="h-11 px-8 text-sm font-extrabold rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-md transition-all flex items-center gap-2"
            onClick={onApplyMatches}
          >
            <Search className="w-4 h-4" />
            <span>{primaryButtonLabel}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 px-6 text-sm font-bold rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 shadow-sm transition-all flex items-center gap-2"
            onClick={onSurpriseMe}
          >
            <Shuffle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Surprise me 🎲</span>
          </Button>
        </div>
      </div>

      {/* MOBILE VIEW: Row-Based Form Card (lg:hidden) */}
      <div className="lg:hidden bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-2">
          <span className="text-base font-extrabold text-slate-900 dark:text-white">
            Trip Planner
          </span>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
            Find your match in 30s
          </span>
        </div>

        {/* Row 1: Vibe */}
        <div className="flex items-center justify-between h-13 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            What kind of day?
          </span>
          <Select
            value={vibe}
            onValueChange={(val: string | null) => {
              if (val) onVibeChange(val);
            }}
          >
            <SelectTrigger className="border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5 w-auto">
              <VibeIcon className={`w-3.5 h-3.5 ${currentVibe.color}`} />
              <span>{currentVibe.label}</span>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
              {Object.entries(VIBE_LABELS).map(([key, item]) => {
                const Icon = item.icon;
                return (
                  <SelectItem
                    key={key}
                    value={key}
                    className="py-2 px-3 cursor-pointer"
                  >
                    <div className="flex items-center text-xs font-semibold">
                      <Icon className={`w-4 h-4 mr-2 ${item.color}`} />
                      <span>{item.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Duration */}
        <div className="flex items-center justify-between h-13 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            How much time?
          </span>
          <Select
            value={tripDuration}
            onValueChange={(val: string | null) => {
              if (val) onTripDurationChange(val as HomepageTripDuration);
            }}
          >
            <SelectTrigger className="border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5 w-auto">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>{currentDuration.label}</span>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
              {Object.entries(DURATION_LABELS).map(([key, item]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="py-2 px-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-semibold w-full gap-3">
                    <span>{item.label}</span>
                    <span className="text-slate-400 text-[10px]">
                      {item.hint}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 3: Party */}
        <div className="flex items-center justify-between h-13 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            Travel party
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {partySize} {partySize === 1 ? "person" : "people"}
            </span>
            <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                aria-label="Decrease party size"
                disabled={partySize <= 1}
                onClick={() => onPartySizeChange(Math.max(1, partySize - 1))}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Increase party size"
                disabled={partySize >= 8}
                onClick={() => onPartySizeChange(Math.min(8, partySize + 1))}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 4: Budget */}
        <div className="flex items-center justify-between h-13 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            Budget
          </span>
          <Select
            value={budgetTier}
            onValueChange={(val: string | null) => {
              if (val) onBudgetTierChange(val as BudgetTier);
            }}
          >
            <SelectTrigger className="border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5 w-auto">
              <Wallet className="w-3.5 h-3.5 text-emerald-500" />
              <span>{currentBudget.label}</span>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
              {Object.entries(BUDGET_TIER_LABELS).map(([key, item]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="py-2 px-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-semibold w-full gap-3">
                    <span>{item.label}</span>
                    <span className="text-slate-400 text-[10px]">
                      {item.desc}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 5: Getting around */}
        <div className="flex items-center justify-between h-13 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            Getting around
          </span>
          <Select
            value={transportPreference}
            onValueChange={(val: string | null) => {
              if (val) onTransportPreferenceChange(val as TransportPreference);
            }}
          >
            <SelectTrigger className="border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5 w-auto">
              <TransportIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span>{currentTransport.label}</span>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
              {Object.entries(TRANSPORT_LABELS).map(([key, item]) => {
                const Icon = item.icon;
                return (
                  <SelectItem
                    key={key}
                    value={key}
                    className="py-2 px-3 cursor-pointer"
                  >
                    <div className="flex items-center text-xs font-semibold">
                      <Icon className="w-4 h-4 mr-2 text-slate-400" />
                      <span>{item.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full h-12 text-sm font-extrabold rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-lg"
            onClick={onApplyMatches}
          >
            <Search className="w-4 h-4 mr-2" />
            {primaryButtonLabel}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full h-11 text-xs font-bold rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
            onClick={onSurpriseMe}
          >
            <Shuffle className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
            <span>Surprise Me 🎲</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HomePlanner;
