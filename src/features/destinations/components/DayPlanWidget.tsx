import { useState, useMemo, useRef } from "react";
import type { Destination } from "@/shared/types/destination";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
  type DayPlan,
  type DayPlanStep,
  type DayPlanType,
  type DayPlanPace,
} from "@/shared/services/recommendation/DayPlanGeneratorService";
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
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  Sparkles,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface DayPlanWidgetProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize?: number;
  onSaveToItinerary?: (plan: DayPlan) => void;
}

export function DayPlanWidget({
  destination,
  locale,
  partySize: externalPartySize = 1,
  onSaveToItinerary,
}: DayPlanWidgetProps) {
  const [hasGenerated, setHasGenerated] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // User preference state
  const [planType, setPlanType] = useState<DayPlanType>("full_day");
  const [startTime, setStartTime] = useState("09:00");
  const [pace, setPace] = useState<DayPlanPace>("balanced");
  const [partySize, setPartySize] = useState(externalPartySize);

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

  const handleGeneratePlan = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const isRegen = hasGenerated;

    const newPlan = generateDayPlan(destination, {
      planType,
      startTime,
      pace,
      partySize,
    });

    setGeneratedPlan(newPlan);
    setHasGenerated(true);
    setShowConfig(false);

    if (!newPlan.isUnfeasible) {
      recommendationAnalytics.trackPlanningToolEvent(
        isRegen ? "day_plan_regenerated" : "day_plan_generated",
        destination.id,
        {
          planType,
          pace,
          partySize,
          generatedStopCount: newPlan.steps.length,
          generatedDurationMinutes: newPlan.totalDurationMinutes,
        },
        locale,
      );
    }

    // Move focus to container for accessibility
    setTimeout(() => {
      containerRef.current?.focus();
    }, 100);
  };

  const handleStartOver = () => {
    setHasGenerated(false);
    setGeneratedPlan(null);
    setShowConfig(false);
  };

  const handleRemoveStep = (stepId: string) => {
    if (!generatedPlan) return;
    setGeneratedPlan((prev: DayPlan | null) =>
      prev ? removeStepFromPlan(prev, stepId) : null,
    );
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (!generatedPlan) return;
    setGeneratedPlan((prev: DayPlan | null) =>
      prev ? reorderPlanSteps(prev, fromIdx, toIdx) : null,
    );
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
        generatedStopCount: generatedPlan.steps.length,
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

  const suitableDurationHours = Math.round(
    ((destination.recommendedVisitHours?.min || 2) +
      (destination.recommendedVisitHours?.max || 4)) /
      2,
  );

  return (
    <Card
      ref={containerRef}
      tabIndex={-1}
      className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
    >
      <CardContent className="p-5 sm:p-6 space-y-5">
        {/* DEFAULT COMPACT ENTRY STATE */}
        {!hasGenerated && !showConfig && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                <Sparkles className="w-3.5 h-3.5" />
                {locale === "ja" ? "1日モデルコース" : "Suggested Day Plan"}
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {destination.name}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {locale === "ja"
                  ? `${destination.name}周辺の観光地や食事を組み合わせた最適なモデルコースをカスタム作成します。`
                  : `Create a customized 1-day itinerary combining ${destination.name} with nearby highlights and dining.`}
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {locale === "ja"
                    ? `目安時間: 約${suitableDurationHours}〜8時間`
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
          <form onSubmit={handleGeneratePlan} className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                {locale === "ja"
                  ? "プランの条件設定"
                  : "Customize Day Plan Preferences"}
              </h4>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Cancel config"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Plan Type */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "プラン種類" : "Plan Type"}
                </label>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value as DayPlanType)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value="half_day">
                    {locale === "ja"
                      ? "半日コース (4〜5時間)"
                      : "Half Day (4–5 hours)"}
                  </option>
                  <option value="full_day">
                    {locale === "ja"
                      ? "1日コース (8〜10時間)"
                      : "Full Day (8–10 hours)"}
                  </option>
                </select>
              </div>

              {/* Start Time */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "開始時刻" : "Start Time"}
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                />
              </div>

              {/* Pace */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "ペース" : "Pace"}
                </label>
                <select
                  value={pace}
                  onChange={(e) => setPace(e.target.value as DayPlanPace)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value="relaxed">
                    {locale === "ja" ? "ゆったり" : "Relaxed"}
                  </option>
                  <option value="balanced">
                    {locale === "ja" ? "標準" : "Balanced"}
                  </option>
                  <option value="packed">
                    {locale === "ja" ? "アクティブ" : "Packed"}
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
                  onChange={(e) => setPartySize(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <option key={num} value={num}>
                      {num}{" "}
                      {locale === "ja" ? "名" : num === 1 ? "person" : "people"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfig(false)}
                className="rounded-xl min-h-[44px] text-xs font-bold"
              >
                {locale === "ja" ? "キャンセル" : "Cancel"}
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl min-h-[44px] text-xs font-bold px-5"
              >
                {locale === "ja" ? "モデルコースを生成" : "Generate Plan"}
              </Button>
            </div>
          </form>
        )}

        {/* GENERATED PLAN DISPLAY */}
        {hasGenerated && generatedPlan && (
          <div className="space-y-6">
            {/* UNFEASIBLE ERROR STATE */}
            {generatedPlan.isUnfeasible ? (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-800 dark:text-rose-300 text-xs font-semibold"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p>{generatedPlan.unfeasibleErrorMessage?.[locale]}</p>
                  <Button
                    onClick={() => setShowConfig(true)}
                    variant="outline"
                    className="min-h-[44px] text-xs font-bold bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                  >
                    {locale === "ja" ? "条件を変更" : "Change preferences"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Header Summary */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 mb-2">
                      <Sparkles className="w-3.5 h-3.5" />
                      {locale === "ja"
                        ? "1日モデルコース"
                        : "Suggested Day Plan"}
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                      {generatedPlan.title[locale]}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-semibold uppercase">
                        {locale === "ja" ? "合計所要時間" : "Total Time"}
                      </div>
                      <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {Math.round(
                          (generatedPlan.totalDurationMinutes / 60) * 10,
                        ) / 10}{" "}
                        {locale === "ja" ? "時間" : "hours"}
                      </div>
                    </div>

                    <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-3">
                      <div className="text-xs text-slate-400 font-semibold uppercase">
                        {locale === "ja" ? "予想予算" : "Est. Budget"}
                      </div>
                      <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                        {formatLocalizedJPYRange(
                          [
                            generatedPlan.totalBudgetRange[0],
                            generatedPlan.totalBudgetRange[1],
                          ],
                          locale,
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Blocks */}
                <div className="space-y-6">
                  {(["morning", "afternoon", "evening"] as const).map(
                    (blockKey) => {
                      const blockSteps = timeBlockGroups[blockKey];
                      if (!blockSteps.length) return null;

                      const blockMeta = {
                        morning: {
                          label: locale === "ja" ? "午前" : "Morning",
                          subLabel: "09:00 – 12:00",
                          icon: Sun,
                          color:
                            "text-amber-500 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800",
                        },
                        afternoon: {
                          label: locale === "ja" ? "午後" : "Afternoon",
                          subLabel: "12:00 – 17:00",
                          icon: SunMedium,
                          color:
                            "text-sky-500 bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800",
                        },
                        evening: {
                          label: locale === "ja" ? "夜" : "Evening",
                          subLabel: "17:00 – 21:00",
                          icon: Moon,
                          color:
                            "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800",
                        },
                      }[blockKey];

                      const IconComp = blockMeta.icon;

                      return (
                        <div key={blockKey} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`p-1.5 rounded-lg border flex items-center justify-center ${blockMeta.color}`}
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
                                      <div className="space-y-1 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                          {step.title[locale]}
                                        </h4>
                                        {step.description && (
                                          <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {step.description[locale]}
                                          </p>
                                        )}
                                        {step.hasUncertainHours && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-50/50"
                                          >
                                            {locale === "ja"
                                              ? "営業時間未確認"
                                              : "Unverified hours"}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                                      {globalIdx > 0 && (
                                        <button
                                          onClick={() =>
                                            handleReorder(
                                              globalIdx,
                                              globalIdx - 1,
                                            )
                                          }
                                          title={
                                            locale === "ja"
                                              ? "上に移動"
                                              : "Move up"
                                          }
                                          className="p-1 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        >
                                          <ChevronUp className="w-4 h-4" />
                                        </button>
                                      )}
                                      {globalIdx <
                                        generatedPlan.steps.length - 1 && (
                                        <button
                                          onClick={() =>
                                            handleReorder(
                                              globalIdx,
                                              globalIdx + 1,
                                            )
                                          }
                                          title={
                                            locale === "ja"
                                              ? "下に移動"
                                              : "Move down"
                                          }
                                          className="p-1 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        >
                                          <ChevronDown className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() =>
                                          handleRemoveStep(step.id)
                                        }
                                        title={
                                          locale === "ja" ? "削除" : "Remove"
                                        }
                                        className="p-1 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 rounded text-slate-400 hover:text-red-600"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              if (step.type === "meal") {
                                return (
                                  <div
                                    key={step.id}
                                    className="flex items-center justify-between gap-3 p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-xs"
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400 shrink-0">
                                        {step.startTime}
                                      </span>
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Utensils className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span className="font-bold text-amber-900 dark:text-amber-200 truncate">
                                          {step.title[locale]}
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveStep(step.id)}
                                      className="p-1 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded text-amber-600"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={step.id}
                                  className="flex items-center gap-2 text-xs text-slate-400 py-1 px-2 font-medium"
                                >
                                  <span className="font-mono font-semibold">
                                    {step.startTime}
                                  </span>
                                  <span>•</span>
                                  <span>{step.title[locale]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>

                {/* Footer Controls */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowConfig(true)}
                      className="min-h-[44px] text-xs font-bold rounded-xl flex items-center gap-1.5"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      {locale === "ja" ? "条件変更" : "Change preferences"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleStartOver}
                      className="min-h-[44px] text-xs font-bold text-slate-500 hover:text-slate-800 rounded-xl flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {locale === "ja" ? "やり直す" : "Start over"}
                    </Button>
                  </div>

                  {onSaveToItinerary && (
                    <Button
                      onClick={handleSave}
                      className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {locale === "ja"
                        ? "このプランを保存"
                        : "Save Plan to Itinerary"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
