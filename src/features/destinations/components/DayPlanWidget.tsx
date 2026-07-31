import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import type { Destination } from "@/shared/types/destination";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
  isRealDestinationStop,
  type DayPlan,
  type DayPlanStep,
  type DayPlanType,
  type DayPlanPace,
  type CatchmentScope,
} from "@/shared/services/recommendation/DayPlanGeneratorService";
import { toast } from "sonner";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Sun,
  SunMedium,
  Moon,
  Utensils,
  Clock,
  AlertTriangle,
  Calendar,
  Sparkles,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  MoveUp,
  MoveDown,
  Plus,
  Compass,
  X,
} from "lucide-react";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface DayPlanWidgetProps {
  destination: Destination;
  locale?: "en" | "ja";
  partySize?: number;
  onSaveToItinerary?: (plan: DayPlan) => void;
  onPlanGenerated?: (plan: DayPlan | null) => void;
}

export function DayPlanWidget({
  destination,
  locale = "en",
  partySize: externalPartySize = 2,
  onSaveToItinerary,
  onPlanGenerated,
}: DayPlanWidgetProps) {
  const isHubOrCity = destination.role === "hub" || destination.kind === "city";

  const [hasGenerated, setHasGenerated] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const [planType, setPlanType] = useState<DayPlanType>("full_day");
  const [startTime, setStartTime] = useState("09:00");
  const [availableMinutes, setAvailableMinutes] = useState<number>(540);
  const [pace, setPace] = useState<DayPlanPace>("balanced");
  const [partySize, setPartySize] = useState(externalPartySize);
  const [catchmentScope, setCatchmentScope] =
    useState<CatchmentScope>("nearby");

  const finishTime = useMemo(() => {
    const [h, m] = startTime.split(":").map(Number);
    const startTotal = (h || 9) * 60 + (m || 0);
    const endTotal = startTotal + availableMinutes;
    const endH = Math.floor(endTotal / 60) % 24;
    const endM = endTotal % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  }, [startTime, availableMinutes]);

  const [generatedPlan, setGeneratedPlan] = useState<DayPlan | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleStartCreation = () => {
    setShowConfig(true);
    recommendationAnalytics.trackPlanningToolEvent(
      "day_plan_creation_started",
      destination.id,
      {},
      locale,
    );
  };

  const handleGeneratePlan = (
    e?: React.FormEvent,
    forcePlanType?: DayPlanType,
  ) => {
    if (e) e.preventDefault();
    const activePlanType = forcePlanType || planType;
    if (forcePlanType) setPlanType(forcePlanType);

    const isRegen = hasGenerated;

    const newPlan = generateDayPlan(destination, {
      planType: activePlanType,
      startTime,
      availableMinutes,
      pace,
      partySize,
      catchmentScope,
    });

    setGeneratedPlan(newPlan);
    setHasGenerated(true);
    setShowConfig(false);

    onPlanGenerated?.(newPlan);

    if (!newPlan.isUnfeasible) {
      recommendationAnalytics.trackPlanningToolEvent(
        isRegen ? "day_plan_regenerated" : "day_plan_generated",
        destination.id,
        {
          planType: activePlanType,
          pace,
          partySize,
          generatedStopCount: newPlan.steps.filter(isRealDestinationStop)
            .length,
          generatedDurationMinutes: newPlan.totalDurationMinutes,
        },
        locale,
      );
    }

    setTimeout(() => {
      containerRef.current?.focus();
    }, 100);
  };

  const handleStartOver = () => {
    setHasGenerated(false);
    setGeneratedPlan(null);
    onPlanGenerated?.(null);
    setShowConfig(false);
  };

  const handleRemoveStep = (stepId: string) => {
    if (!generatedPlan) return;
    const remainingDestStops = generatedPlan.steps
      .filter((s) => s.id !== stepId)
      .filter(isRealDestinationStop);
    const minThreshold = planType === "half_day" ? 2 : 3;

    if (remainingDestStops.length < minThreshold) {
      toast.error(
        locale === "ja"
          ? `${planType === "half_day" ? "半日" : "1日"}コースには最低${minThreshold}箇所のスポットが必要です。`
          : `A ${planType === "half_day" ? "half-day" : "full-day"} plan needs at least ${minThreshold} destinations.`,
      );
      return;
    }

    const updated = removeStepFromPlan(
      generatedPlan,
      stepId,
      catchmentScope,
      partySize,
    );

    if (updated.isUnfeasible) {
      toast.error(
        locale === "ja"
          ? "このスポットを削除すると移動プランが不成立になります。"
          : "Removing this step creates an unrealistic travel leg.",
      );
      return;
    }

    setGeneratedPlan(updated);
    onPlanGenerated?.(updated);
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (!generatedPlan) return;
    const updated = reorderPlanSteps(
      generatedPlan,
      fromIdx,
      toIdx,
      catchmentScope,
      partySize,
    );

    if (updated.isUnfeasible) {
      toast.error(
        locale === "ja"
          ? "この順番では移動時間に無理が生じます。"
          : "That order creates an unrealistic travel leg.",
      );
      return;
    }

    setGeneratedPlan(updated);
    onPlanGenerated?.(updated);
  };

  const handleSave = () => {
    if (!generatedPlan || !onSaveToItinerary) return;
    onSaveToItinerary(generatedPlan);
    recommendationAnalytics.trackPlanningToolEvent(
      "day_plan_saved",
      destination.id,
      {
        planType,
        partySize,
        generatedStopCount: generatedPlan.steps.filter(isRealDestinationStop)
          .length,
      },
      locale,
    );
  };

  const timeBlockGroups = useMemo(() => {
    if (!generatedPlan) return { morning: [], afternoon: [], evening: [] };
    const morning = generatedPlan.steps.filter(
      (s: DayPlanStep) => s.timeBlock === "morning",
    );
    const afternoon = generatedPlan.steps.filter(
      (s: DayPlanStep) => s.timeBlock === "afternoon",
    );
    const evening = generatedPlan.steps.filter(
      (s: DayPlanStep) => s.timeBlock === "evening",
    );
    return { morning, afternoon, evening };
  }, [generatedPlan]);

  const realStopCount = useMemo(() => {
    if (!generatedPlan) return 0;
    return generatedPlan.steps.filter(isRealDestinationStop).length;
  }, [generatedPlan]);

  // Product title based on destination role
  const plannerTitle = isHubOrCity
    ? locale === "ja"
      ? `${destination.nameJa || destination.name}発 1日コース`
      : `Plan a day from ${destination.name}`
    : locale === "ja"
      ? `${destination.nameJa || destination.name} 周辺モデルコース`
      : `Plan around ${destination.name}`;

  const suitableDurationHours = Math.round(
    ((destination.recommendedVisitHours?.min || 2) +
      (destination.recommendedVisitHours?.max || 4)) /
      2,
  );

  return (
    <Card
      ref={containerRef}
      tabIndex={-1}
      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
    >
      {/* Header */}
      <div className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-100 dark:border-slate-800 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {plannerTitle}
                </h3>
                <Badge className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 text-[10px] uppercase font-bold">
                  {isHubOrCity ? "Hub Local Tour" : "POI Itinerary"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isHubOrCity
                  ? locale === "ja"
                    ? `${destination.nameJa || destination.name}を拠点に周辺の見どころ・グルメを効率よく巡るプラン`
                    : `Customized local itinerary starting from ${destination.name} hub.`
                  : locale === "ja"
                    ? `${destination.nameJa || destination.name}を中心に近隣スポットを組み合わせたおすすめコース`
                    : `Model itinerary combining ${destination.name} with nearby highlights.`}
              </p>
            </div>
          </div>

          {hasGenerated && generatedPlan && !generatedPlan.isUnfeasible && (
            <div className="flex items-center gap-4 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {Math.round((generatedPlan.totalDurationMinutes / 60) * 10) /
                    10}{" "}
                  {locale === "ja" ? "時間" : "hours"}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <div>
                {formatLocalizedJPYRange(
                  generatedPlan.totalBudgetRange,
                  locale,
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* DEFAULT COMPACT ENTRY STATE */}
        {!hasGenerated && !showConfig && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl text-xs text-slate-600 dark:text-slate-300">
              <p className="leading-relaxed">
                {isHubOrCity
                  ? locale === "ja"
                    ? `${destination.nameJa || destination.name}を起点に、移動時間と滞在バランスを最適化した1日・半日コースを作成します。`
                    : `Create a customized itinerary combining ${destination.name} with nearby highlights and dining.`
                  : locale === "ja"
                    ? `${destination.nameJa || destination.name}への訪問を中心に、徒歩・ローカル移動圏内の周辺スポットを組み立てます。`
                    : `Build a personalized schedule around ${destination.name} with optimal visit durations.`}
              </p>
              <div className="flex items-center gap-3 pt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  {locale === "ja"
                    ? `推奨所要時間: 約${suitableDurationHours}〜8時間`
                    : `Est. duration: ~${suitableDurationHours}–8 hours`}
                </span>
              </div>
            </div>

            <Button
              onClick={handleStartCreation}
              aria-expanded={showConfig}
              className="w-full sm:w-auto min-h-[44px] px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm shrink-0 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>
                {locale === "ja" ? "プランを作成" : "Create day plan"}
              </span>
            </Button>
          </div>
        )}

        {/* PREFERENCE CONFIG FORM */}
        {showConfig && (
          <form onSubmit={(e) => handleGeneratePlan(e)} className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                {locale === "ja"
                  ? "プラン条件の設定"
                  : "Customize Plan Preferences"}
              </h4>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Cancel config"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 text-xs">
              {/* Arrive at First Stop */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja"
                    ? "最初のスポットに到着"
                    : "Arrive at first stop"}
                </label>
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  {["08:00", "09:00", "10:00", "11:00", "13:00", "14:00"].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* Time Available */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "滞在可能時間" : "Time available"}
                </label>
                <select
                  value={availableMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAvailableMinutes(val);
                    if (val <= 300) setPlanType("half_day");
                    else setPlanType("full_day");
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value={180}>
                    {locale === "ja" ? "3時間" : "3 hours"}
                  </option>
                  <option value={300}>
                    {locale === "ja" ? "半日 (5時間)" : "Half day · 5 hours"}
                  </option>
                  <option value={540}>
                    {locale === "ja" ? "1日 (9時間)" : "Full day · 9 hours"}
                  </option>
                </select>
              </div>

              {/* Plan Type Target */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "コース種類" : "Course Type"}
                </label>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value as DayPlanType)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value="full_day">
                    {locale === "ja"
                      ? "1日コース (3〜4スポット)"
                      : "Full Day (3–4 stops)"}
                  </option>
                  <option value="half_day">
                    {locale === "ja"
                      ? "半日コース (2スポット)"
                      : "Half Day (2 stops)"}
                  </option>
                </select>
              </div>

              {/* Pace */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "ペース" : "Pace"}
                </label>
                <select
                  value={pace}
                  onChange={(e) => setPace(e.target.value as DayPlanPace)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value="relaxed">
                    {locale === "ja" ? "ゆったり (Relaxed)" : "Relaxed"}
                  </option>
                  <option value="balanced">
                    {locale === "ja" ? "標準 (Balanced)" : "Balanced"}
                  </option>
                  <option value="packed">
                    {locale === "ja" ? "効率重視 (Packed)" : "Packed"}
                  </option>
                </select>
              </div>

              {/* Catchment Scope */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "検索範囲" : "Area Catchment"}
                </label>
                <select
                  value={catchmentScope}
                  onChange={(e) =>
                    setCatchmentScope(e.target.value as CatchmentScope)
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value="nearby">
                    {locale === "ja"
                      ? "周辺エリア (8〜12km)"
                      : "Nearby (8–12 km)"}
                  </option>
                  <option value="wider">
                    {locale === "ja"
                      ? "広域エリア (最大20km)"
                      : "Wider area (up to 20 km)"}
                  </option>
                </select>
              </div>

              {/* Party Size */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "人数" : "Party Size"}
                </label>
                <select
                  value={partySize}
                  onChange={(e) => setPartySize(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "person" : "people"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Planning Window Scope Note Banner */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-600 dark:text-slate-300 gap-1.5">
              <div className="flex items-center gap-2 font-medium">
                <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  {locale === "ja"
                    ? `計画タイムウィンドウ: ${startTime}–${finishTime}`
                    : `Planning window: ${startTime}–${finishTime}`}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                {locale === "ja"
                  ? "最初のスポットまでの移動時間は含まれません。"
                  : "Travel to the first stop is not included."}
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfig(false)}
                className="rounded-xl min-h-[44px] text-xs font-bold border-slate-300 dark:border-slate-700"
              >
                {locale === "ja" ? "キャンセル" : "Cancel"}
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] text-xs font-bold px-5"
              >
                {locale === "ja"
                  ? hasGenerated
                    ? "再生成"
                    : "プランを生成"
                  : hasGenerated
                    ? "Regenerate Plan"
                    : "Generate Plan"}
              </Button>
            </div>
          </form>
        )}

        {/* UNFEASIBLE PLAN ALERT WITH HALF-DAY FALLBACK */}
        {hasGenerated && generatedPlan && generatedPlan.isUnfeasible && (
          <div
            role="alert"
            className="p-5 bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl space-y-4 animate-in fade-in duration-200 text-xs"
          >
            <div className="flex items-start gap-3 text-rose-900 dark:text-rose-200">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm">
                  {locale === "ja"
                    ? "プランを作成できませんでした"
                    : "Could Not Generate Feasible Plan"}
                </h4>
                <p className="leading-relaxed">
                  {generatedPlan.unfeasibleErrorMessage?.[locale] ||
                    (locale === "ja"
                      ? "このスケジュールに適合する周辺スポットが不足しています。"
                      : "We couldn’t find enough suitable nearby stops for this schedule.")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-rose-200/80 dark:border-rose-900/60">
              {/* Half-Day Fallback Action */}
              {generatedPlan.canFallbackToHalfDay && (
                <Button
                  onClick={(e) => handleGeneratePlan(e, "half_day")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl min-h-[44px] text-xs px-4"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  {locale === "ja"
                    ? "半日プラン（2スポット）に切り替え"
                    : "Switch to Half-Day Plan"}
                </Button>
              )}

              {/* Wider Area Action */}
              <Button
                variant="outline"
                onClick={() => {
                  setCatchmentScope("wider");
                  setShowConfig(true);
                }}
                className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl min-h-[44px] text-xs"
              >
                {locale === "ja"
                  ? "広域エリア（最大20km）で再検索"
                  : "Try Wider Area (up to 20 km)"}
              </Button>

              <Button
                variant="ghost"
                onClick={() => setShowConfig(true)}
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 font-bold rounded-xl min-h-[44px] text-xs"
              >
                {locale === "ja" ? "条件を変更" : "Change preferences"}
              </Button>
            </div>
          </div>
        )}

        {/* GENERATED TIMELINE */}
        {hasGenerated && generatedPlan && !generatedPlan.isUnfeasible && (
          <div className="space-y-6">
            {/* Consolidated Opening Hours & Assumptions Disclosure */}
            {generatedPlan.uncertainHoursDisclosures.length > 0 && (
              <details className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-3 text-xs group">
                <summary className="font-bold text-amber-900 dark:text-amber-300 flex items-center justify-between cursor-pointer list-none">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    {locale === "ja"
                      ? "一部スポットの営業時間が未確認です（タップで前提条件を確認）"
                      : "Some opening hours are unverified (click to view plan assumptions)"}
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold text-amber-700 dark:text-amber-400 group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>

                <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-900/40 space-y-2 text-amber-950 dark:text-amber-200">
                  <div className="font-semibold text-amber-900 dark:text-amber-300">
                    {locale === "ja"
                      ? "計画の前提条件・補足情報"
                      : "Plan assumptions"}
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
                    <li>
                      {locale === "ja"
                        ? `以下のスポットは営業時間が未確認です: ${generatedPlan.uncertainHoursDisclosures.map((u) => u.name).join("、")}`
                        : `Opening hours are unverified for: ${generatedPlan.uncertainHoursDisclosures.map((u) => u.name).join(", ")}.`}
                    </li>
                    <li>
                      {locale === "ja"
                        ? "モデルコース内の移動時間は標準的な公共交通機関の所要時間を前提としています。"
                        : "Travel segments assume average public transit or walking times."}
                    </li>
                    <li>
                      {locale === "ja"
                        ? "予算範囲は一般的な拝観料・食事・ローカル交通費に基づきます。"
                        : "Cost estimates reflect typical admission, dining, and local fare ranges."}
                    </li>
                  </ul>
                </div>
              </details>
            )}

            {/* Real Stop Badge Count Header */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-slate-800">
              <span>
                {locale === "ja" ? "モデルコース行程" : "Generated Itinerary"} (
                {realStopCount} {locale === "ja" ? "スポット" : "POIs"})
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {locale === "ja"
                  ? "リアルタイム所要時間・交通計算"
                  : "Strict Catchment Verified"}
              </span>
            </div>

            {/* Blocks */}
            {(["morning", "afternoon", "evening"] as const).map((block) => {
              const blockSteps = timeBlockGroups[block];
              if (blockSteps.length === 0) return null;

              const blockMeta = {
                morning: {
                  label: locale === "ja" ? "午前" : "Morning",
                  icon: Sun,
                  color: "text-amber-500",
                },
                afternoon: {
                  label: locale === "ja" ? "午後" : "Afternoon",
                  icon: SunMedium,
                  color: "text-sky-500",
                },
                evening: {
                  label: locale === "ja" ? "夕方・夜" : "Evening",
                  icon: Moon,
                  color: "text-purple-500",
                },
              }[block];

              const IconComp = blockMeta.icon;

              return (
                <div key={block} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 ${blockMeta.color}`}
                    >
                      <IconComp className="w-4 h-4 shrink-0" />
                    </div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {blockMeta.label}
                    </span>
                  </div>

                  <div className="space-y-2 pl-3 border-l-2 border-slate-100 dark:border-slate-800 ml-3">
                    {blockSteps.map((step: DayPlanStep) => {
                      const globalIdx = generatedPlan.steps.findIndex(
                        (s: DayPlanStep) => s.id === step.id,
                      );

                      if (step.type === "destination") {
                        return (
                          <div
                            key={step.id}
                            className="flex items-start justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-500/50 transition-all group"
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <span className="text-xs font-mono font-bold text-slate-400 shrink-0 mt-0.5">
                                {step.startTime}
                              </span>
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {step.destination?.id ? (
                                    <Link
                                      to={`/destinations/${step.destination.id}`}
                                      className="text-sm font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors truncate"
                                    >
                                      {step.title[locale]}
                                    </Link>
                                  ) : (
                                    <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                      {step.title[locale]}
                                    </h5>
                                  )}
                                  {step.hasUncertainHours && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 font-medium"
                                    >
                                      {locale === "ja"
                                        ? "未確認"
                                        : "Unverified hours"}
                                    </Badge>
                                  )}
                                </div>
                                {step.description && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {step.description[locale]}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Reorder / Remove Controls */}
                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                              {globalIdx > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleReorder(globalIdx, globalIdx - 1)
                                  }
                                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  title="Move up"
                                >
                                  <MoveUp className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {globalIdx < generatedPlan.steps.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleReorder(globalIdx, globalIdx + 1)
                                  }
                                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  title="Move down"
                                >
                                  <MoveDown className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveStep(step.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                                title="Remove stop"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (step.type === "meal") {
                        return (
                          <div
                            key={step.id}
                            className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
                              <span className="font-mono text-slate-400">
                                {step.startTime}
                              </span>
                              <Utensils className="w-3.5 h-3.5 text-amber-600" />
                              <span>{step.title[locale]}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveStep(step.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
                              title="Remove meal"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={step.id}
                          className="p-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2"
                        >
                          <span className="font-mono">{step.startTime}</span>
                          <span>• {step.title[locale]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfig(true)}
                  className="min-h-[44px] text-xs font-bold rounded-xl border-slate-300 dark:border-slate-700 flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {locale === "ja" ? "条件変更" : "Change preferences"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleStartOver}
                  className="min-h-[44px] text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-xl flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {locale === "ja" ? "やり直す" : "Start over"}
                </Button>
              </div>

              {onSaveToItinerary && (
                <Button
                  onClick={handleSave}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm min-h-[44px]"
                >
                  <Calendar className="w-4 h-4" />
                  {locale === "ja" ? "旅程に登録" : "Save Plan to Itinerary"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
