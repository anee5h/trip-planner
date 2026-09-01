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
  Check,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/components/ui/select";
import type { BudgetTier } from "@/shared/types/planner";
import type { HomepageTripDuration } from "@/shared/types/homePlannerState";
import type { CarMode } from "@/shared/utils/carMode";
import { useTranslation } from "react-i18next";

interface HomePlannerProps {
  vibe: string;
  onVibeChange: (vibe: string) => void;

  tripDuration: HomepageTripDuration;
  onTripDurationChange: (dur: HomepageTripDuration) => void;

  partySize: number;
  onPartySizeChange: (size: number) => void;

  budgetTier: BudgetTier;
  onBudgetTierChange: (tier: BudgetTier) => void;

  publicTransport: boolean;
  onPublicTransportChange: (enabled: boolean) => void;
  carMode: CarMode;
  onCarModeChange: (mode: CarMode) => void;

  hasUserApplied: boolean;
  isDirty: boolean;
  onApplyMatches: () => void;
  onSurpriseMe: () => void;
}

interface MobileOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ElementType;
}

function MobileOptionSheet({
  title,
  options,
  value,
  onChange,
  onClose,
}: {
  title: string;
  options: MobileOption[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sheetRef = React.useRef<HTMLDivElement>(null);

  // KAI-80: focus the sheet's close button on open + trap Tab inside
  // (WCAG dialog pattern).
  React.useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet) {
      const closeBtn = sheet.querySelector<HTMLButtonElement>(
        'button[aria-label="' + t("ui.close") + '"]',
      );
      (
        closeBtn ?? (sheet.querySelector("button") as HTMLButtonElement)
      )?.focus();
    }
  }, [t]);

  React.useEffect(() => {
    const handleTab = (event: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, []);

  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      ref={sheetRef}
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={title}
        className="absolute inset-0 w-full bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 pb-[env(safe-area-inset-bottom)] shadow-2xl dark:border-slate-700 dark:bg-[hsl(var(--surface-overlay))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-[hsl(var(--text-primary))]">
            {title}
          </h2>
          <button
            type="button"
            aria-label={t("ui.close")}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[hsl(var(--surface-raised))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-1">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = option.value === value;
            return (
              <React.Fragment key={option.value}>
                {option.value === "2d1n" && (
                  <div
                    aria-hidden="true"
                    className="my-2 border-t border-slate-200 dark:border-slate-700"
                  />
                )}
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    onClose();
                  }}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors ${
                    selected
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                      : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-[hsl(var(--surface-raised))]"
                  }`}
                >
                  {Icon && (
                    <Icon className="h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="block text-xs text-slate-500 dark:text-slate-300">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TRANSPORT_OPTIONS = [
  {
    id: "public",
    labelKey: "home.transportOptions.public",
    icon: Train,
  },
  {
    id: "rental",
    labelKey: "home.transportOptions.rentalCar",
    icon: Car,
  },
  {
    id: "my_car",
    labelKey: "home.transportOptions.myCar",
    icon: Car,
  },
] as const;
type PlannerTransportOption = (typeof TRANSPORT_OPTIONS)[number]["id"];

function TransportToggleList({
  publicTransport,
  carMode,
  onPublicTransportChange,
  onCarModeChange,
}: {
  publicTransport: boolean;
  carMode: CarMode;
  onPublicTransportChange: (enabled: boolean) => void;
  onCarModeChange: (mode: CarMode) => void;
}) {
  const { t } = useTranslation();

  const isSelected = (option: PlannerTransportOption) =>
    option === "public" ? publicTransport : carMode === option;

  const toggle = (option: PlannerTransportOption) => {
    if (option === "public") {
      onPublicTransportChange(!publicTransport);
      return;
    }
    onCarModeChange(carMode === option ? "none" : option);
  };

  return (
    <div role="group" aria-label={t("home.transport")} className="grid gap-1">
      {TRANSPORT_OPTIONS.map(({ id, labelKey, icon: Icon }) => {
        const selected = isSelected(id);
        return (
          <button
            key={id}
            type="button"
            data-testid={`transport-option-${id}`}
            aria-pressed={selected}
            onClick={() => toggle(id)}
            className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
              selected
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"
                : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            <span className="min-w-0 flex-1">{t(labelKey)}</span>
            {selected && (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function TransportOptionSheet({
  title,
  publicTransport,
  carMode,
  onPublicTransportChange,
  onCarModeChange,
  onClose,
}: {
  title: string;
  publicTransport: boolean;
  carMode: CarMode;
  onPublicTransportChange: (enabled: boolean) => void;
  onCarModeChange: (mode: CarMode) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sheetRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet
      .querySelector<HTMLButtonElement>(
        'button[aria-label="' + t("ui.close") + '"]',
      )
      ?.focus();
  }, [t]);

  React.useEffect(() => {
    const handleTab = (event: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, []);

  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      ref={sheetRef}
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={title}
        className="absolute inset-0 w-full bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 pb-[env(safe-area-inset-bottom)] shadow-2xl dark:border-slate-700 dark:bg-[hsl(var(--surface-overlay))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-[hsl(var(--text-primary))]">
            {title}
          </h2>
          <button
            type="button"
            aria-label={t("ui.close")}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[hsl(var(--surface-raised))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <TransportToggleList
          publicTransport={publicTransport}
          carMode={carMode}
          onPublicTransportChange={onPublicTransportChange}
          onCarModeChange={onCarModeChange}
        />
      </div>
    </div>
  );
}

const VIBE_LABELS: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  any: { label: "Anything goes", icon: Sparkles, color: "text-slate-500" },
  art: { label: "Art & museums", icon: Palette, color: "text-purple-500" },
  food: { label: "Food", icon: Utensils, color: "text-orange-500" },
  nature: {
    label: "Nature & outdoors",
    icon: Trees,
    color: "text-emerald-500",
  },
  history: {
    label: "History & culture",
    icon: Landmark,
    color: "text-amber-700",
  },
  sea: { label: "Beaches & islands", icon: Waves, color: "text-blue-500" },
  cool: { label: "Cool escapes", icon: Snowflake, color: "text-sky-400" },
  themepark: { label: "Theme parks", icon: Sparkles, color: "text-pink-500" },
  photography: { label: "Photography", icon: Camera, color: "text-rose-400" },
};

const DURATION_OPTIONS: HomepageTripDuration[] = [
  "shortOuting",
  "halfDay",
  "fullDay",
  "2d1n",
  "3d2n",
];

const BUDGET_TIER_LABELS: Record<BudgetTier, { label: string; desc: string }> =
  {
    economy: { label: "Economy", desc: "Budget friendly" },
    standard: { label: "Standard", desc: "Balanced spending" },
    comfortable: { label: "Comfort", desc: "Higher comfort" },
    luxury: { label: "Flexible", desc: "Keep options open" },
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
  publicTransport,
  onPublicTransportChange,
  carMode,
  onCarModeChange,
  hasUserApplied,
  isDirty,
  onApplyMatches,
  onSurpriseMe,
}: HomePlannerProps) => {
  const { t } = useTranslation();
  const [mobileField, setMobileField] = React.useState<
    "vibe" | "duration" | "budget" | "transport" | null
  >(null);
  // KAI-80: remember which planner control opened the mobile sheet so
  // focus can be restored to it when the sheet closes.
  const mobileFieldOpenerRef = React.useRef<HTMLElement | null>(null);
  const transportMenuRef = React.useRef<HTMLDivElement>(null);
  const [transportMenuOpen, setTransportMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!transportMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTransportMenuOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest('[data-testid="transport-menu"]') &&
        !target.closest('[data-testid="transport-trigger"]')
      ) {
        setTransportMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [transportMenuOpen]);

  const openMobileField = (
    field: "vibe" | "duration" | "budget" | "transport",
  ) => {
    mobileFieldOpenerRef.current = document.activeElement as HTMLElement | null;
    setMobileField(field);
  };
  const closeMobileField = () => {
    setMobileField(null);
    mobileFieldOpenerRef.current?.focus();
    mobileFieldOpenerRef.current = null;
  };
  const translate = (key: string) => t(key as never);
  const primaryButtonLabel = !hasUserApplied
    ? t("home.find")
    : isDirty
      ? t("home.update")
      : t("home.view");

  const currentVibe = VIBE_LABELS[vibe] || VIBE_LABELS.any;
  const VibeIcon = currentVibe.icon;

  const transportLabels = [
    publicTransport && t("home.transportOptions.public"),
    carMode === "rental" && t("home.transportOptions.rentalCar"),
    carMode === "my_car" && t("home.transportOptions.myCar"),
  ].filter(Boolean) as string[];
  const transportSummary =
    transportLabels.length > 0
      ? transportLabels.join(" + ")
      : t("home.transportOptions.none");
  const TransportIcon =
    publicTransport || carMode !== "none"
      ? publicTransport && carMode !== "none"
        ? Shuffle
        : publicTransport
          ? Train
          : Car
      : X;
  const mobileOptions: {
    vibe: MobileOption[];
    duration: MobileOption[];
    budget: MobileOption[];
  } = {
    vibe: Object.entries(VIBE_LABELS).map(([value, item]) => ({
      value,
      label: translate(`home.vibes.${value}`),
      icon: item.icon,
    })),
    duration: DURATION_OPTIONS.map((value) => ({
      value,
      label: translate(`home.durations.${value}`),
      description: translate(`home.durationHints.${value}`),
      icon: Clock,
    })),
    budget: Object.entries(BUDGET_TIER_LABELS).map(([value]) => ({
      value,
      label: translate(`home.budgets.${value}`),
      description: translate(`home.budgetHints.${value}`),
      icon: Wallet,
    })),
  };

  return (
    <div className="w-full">
      {/* DESKTOP VIEW: Skyscanner-Style Full-Width Horizontal Bar (lg:flex) */}
      <div className="hidden lg:flex flex-col items-center w-full max-w-6xl mx-auto">
        {/* Row 1: Filter Bar (5 Equal Segments) */}
        <div className="w-full bg-white dark:bg-[hsl(var(--surface-card))] border border-slate-200 dark:border-[hsl(var(--border-subtle))] rounded-2xl shadow-xl p-2 flex items-center gap-1 h-20">
          {/* Segment 1: Vibe (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-raised))] transition-colors flex flex-col justify-center relative cursor-pointer">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-0.5">
              {t("home.vibe")}
            </span>
            <Select
              value={vibe}
              onValueChange={(val: string | null) => {
                if (val) onVibeChange(val);
              }}
            >
              <SelectTrigger
                className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between"
                aria-label={t("home.vibe")}
              >
                <div className="flex items-center gap-2 truncate">
                  <VibeIcon
                    className={`w-4 h-4 shrink-0 ${currentVibe.color}`}
                  />
                  <span className="truncate">
                    {translate(`home.vibes.${vibe}`)}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-[hsl(var(--border-subtle))] shadow-xl bg-white dark:bg-[hsl(var(--surface-overlay))] p-1">
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
                        <span>{translate(`home.vibes.${key}`)}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-[hsl(var(--border-subtle))] shrink-0" />

          {/* Segment 2: Duration */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-raised))] transition-colors flex flex-col justify-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-0.5">
              {t("home.duration")}
            </span>
            <Select
              value={tripDuration}
              onValueChange={(val: string | null) => {
                if (val) onTripDurationChange(val as HomepageTripDuration);
              }}
            >
              <SelectTrigger
                className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between"
                aria-label={t("home.duration")}
              >
                <div className="flex items-center gap-2 truncate">
                  <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">
                    {translate(`home.durations.${tripDuration}`)}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-[hsl(var(--border-subtle))] shadow-xl bg-white dark:bg-[hsl(var(--surface-overlay))] p-1">
                {DURATION_OPTIONS.map((key, index) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className={`cursor-pointer py-2.5 pl-3 pr-8 ${index === 3 ? "mt-1 border-t border-slate-200 pt-3 dark:border-slate-700" : ""}`}
                  >
                    <div className="flex w-full items-center justify-between gap-2 text-xs font-semibold">
                      <span>{translate(`home.durations.${key}`)}</span>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">
                        {translate(`home.durationHints.${key}`)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-[hsl(var(--border-subtle))] shrink-0" />

          {/* Segment 3: Party (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-raised))] transition-colors flex flex-col justify-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-0.5">
              {t("home.party")}
            </span>
            <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-900 dark:text-white">
              <div className="flex items-center gap-1.5 truncate">
                <Users className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{partySize}</span>
              </div>
              <div className="flex items-center gap-0.5 rounded-lg">
                <button
                  type="button"
                  aria-label={t("home.decreaseParty")}
                  disabled={partySize <= 1}
                  onClick={() => onPartySizeChange(Math.max(1, partySize - 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label={t("home.increaseParty")}
                  disabled={partySize >= 8}
                  onClick={() => onPartySizeChange(Math.min(8, partySize + 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-[hsl(var(--border-subtle))] shrink-0" />

          {/* Segment 4: Budget (20%) */}
          <div className="w-1/5 min-w-0 h-full px-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[hsl(var(--surface-raised))] transition-colors flex flex-col justify-center relative cursor-pointer">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-0.5">
              {t("home.budget")}
            </span>
            <Select
              value={budgetTier}
              onValueChange={(val: string | null) => {
                if (val) onBudgetTierChange(val as BudgetTier);
              }}
            >
              <SelectTrigger
                className="w-full border-none p-0 h-auto bg-transparent shadow-none focus:ring-0 font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between"
                aria-label={t("home.budget")}
              >
                <div className="flex items-center gap-2 truncate">
                  <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">
                    {t(`home.budgets.${budgetTier}`)}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-[hsl(var(--border-subtle))] shadow-xl bg-white dark:bg-[hsl(var(--surface-overlay))] p-1">
                {Object.entries(BUDGET_TIER_LABELS).map(([key]) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="py-2.5 px-3 cursor-pointer"
                  >
                    <div className="flex flex-col text-xs font-semibold">
                      <span>{translate(`home.budgets.${key}`)}</span>
                      <span className="text-slate-500 text-[10px] font-normal">
                        {translate(`home.budgetHints.${key}`)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-[hsl(var(--border-subtle))] shrink-0" />

          {/* Segment 5: Getting Around (20%) */}
          <div className="relative w-1/5 min-w-0 px-3 py-1.5">
            <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-300">
              {t("home.transport")}
            </span>
            <button
              type="button"
              data-testid="transport-trigger"
              aria-label={t("home.transport")}
              aria-haspopup="true"
              aria-expanded={transportMenuOpen}
              onClick={() => setTransportMenuOpen((open) => !open)}
              className="flex h-auto w-full items-center justify-between rounded-lg text-left text-xs font-bold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:text-white sm:text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <TransportIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="truncate">{transportSummary}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-slate-500" />
            </button>
            {transportMenuOpen && (
              <div
                ref={transportMenuRef}
                data-testid="transport-menu"
                role="group"
                aria-label={t("home.transport")}
                className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))]"
              >
                <TransportToggleList
                  publicTransport={publicTransport}
                  carMode={carMode}
                  onPublicTransportChange={onPublicTransportChange}
                  onCarModeChange={onCarModeChange}
                />
              </div>
            )}
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
            className="h-11 px-6 text-sm font-bold rounded-xl border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-overlay))] dark:text-slate-200 dark:hover:bg-[hsl(var(--surface-raised))] transition-colors flex items-center gap-2"
            onClick={onSurpriseMe}
          >
            <Shuffle className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            <span>{t("home.surprise")}</span>
          </Button>
        </div>
      </div>

      <div className="space-y-2 lg:hidden">
        <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-xl dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-card))]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-base font-extrabold text-slate-900 dark:text-[hsl(var(--text-primary))]">
              {t("home.planner")}
            </span>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              {t("home.plannerHint")}
            </span>
          </div>
          <div className="space-y-2">
            {/* Vibe row — always clickable */}
            <button
              type="button"
              onClick={() => openMobileField("vibe")}
              className="flex h-14 w-full items-center justify-between rounded-[14px] border border-slate-200 px-3 text-left dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-raised))]"
            >
              <span className="text-xs font-bold text-slate-600 dark:text-[hsl(var(--text-secondary))]">
                {t("home.vibe")}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-[hsl(var(--text-primary))]">
                <VibeIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {translate(`home.vibes.${vibe}`)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              </span>
            </button>

            {/* Duration row */}
            <button
              type="button"
              onClick={() => openMobileField("duration")}
              className="flex h-14 w-full items-center justify-between rounded-[14px] border border-slate-200 px-3 text-left dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-raised))]"
            >
              <span className="text-xs font-bold text-slate-600 dark:text-[hsl(var(--text-secondary))]">
                {t("home.duration")}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-[hsl(var(--text-primary))]">
                <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {translate(`home.durations.${tripDuration}`)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              </span>
            </button>
            <div className="flex h-14 items-center justify-between rounded-[14px] border border-slate-200 px-3 dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-raised))]">
              <span className="text-xs font-bold text-slate-600 dark:text-[hsl(var(--text-secondary))]">
                {t("home.party")}
              </span>
              <div className="grid h-11 w-[150px] grid-cols-[44px_1fr_44px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  aria-label={t("home.decreaseParty")}
                  disabled={partySize <= 1}
                  onClick={() => onPartySizeChange(Math.max(1, partySize - 1))}
                  className="flex items-center justify-center text-slate-700 disabled:opacity-40 dark:text-slate-100"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="flex items-center justify-center border-x border-slate-200 text-sm font-extrabold text-slate-900 dark:border-slate-700 dark:text-white">
                  {partySize}
                </span>
                <button
                  type="button"
                  aria-label={t("home.increaseParty")}
                  disabled={partySize >= 8}
                  onClick={() => onPartySizeChange(Math.min(8, partySize + 1))}
                  className="flex items-center justify-center text-slate-700 disabled:opacity-40 dark:text-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {[
              {
                field: "budget" as const,
                label: t("home.budget"),
                value: translate(`home.budgets.${budgetTier}`),
                icon: Wallet,
              },
              {
                field: "transport" as const,
                label: t("home.transport"),
                value: transportSummary,
                icon: TransportIcon,
              },
            ].map(({ field, label, value, icon: Icon }) => (
              <button
                key={field}
                type="button"
                onClick={() => openMobileField(field)}
                className="flex h-14 w-full items-center justify-between rounded-[14px] border border-slate-200 px-3 text-left dark:border-[hsl(var(--border-subtle))] dark:bg-[hsl(var(--surface-raised))]"
              >
                <span className="text-xs font-bold text-slate-600 dark:text-[hsl(var(--text-secondary))]">
                  {label}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-[hsl(var(--text-primary))]">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span className="truncate">{value}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              size="lg"
              className="h-[52px] w-full rounded-xl bg-slate-900 text-sm font-extrabold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              onClick={onApplyMatches}
            >
              <Search className="mr-2 h-4 w-4" />
              {primaryButtonLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-[50px] w-full rounded-xl border-slate-300 bg-white text-xs font-bold text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onSurpriseMe}
            >
              <Shuffle className="mr-1.5 h-3.5 w-3.5" />
              {t("home.surprise")}
            </Button>
          </div>
        </div>
        {mobileField === "transport" ? (
          <TransportOptionSheet
            title={t("home.transport")}
            publicTransport={publicTransport}
            carMode={carMode}
            onPublicTransportChange={onPublicTransportChange}
            onCarModeChange={onCarModeChange}
            onClose={closeMobileField}
          />
        ) : mobileField ? (
          <MobileOptionSheet
            title={t(`home.${mobileField}`)}
            options={mobileOptions[mobileField]}
            value={
              mobileField === "vibe"
                ? vibe
                : mobileField === "duration"
                  ? tripDuration
                  : budgetTier
            }
            onClose={closeMobileField}
            onChange={(value) => {
              if (mobileField === "vibe") onVibeChange(value);
              else if (mobileField === "duration")
                onTripDurationChange(value as HomepageTripDuration);
              else onBudgetTierChange(value as BudgetTier);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default HomePlanner;
