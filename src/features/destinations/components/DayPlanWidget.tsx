import { useState, useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import {
  generateDayPlan,
  removeStepFromPlan,
  reorderPlanSteps,
  type DayPlan,
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
  Info,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  Sparkles,
} from "lucide-react";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";

interface DayPlanWidgetProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize?: number;
  onSaveToItinerary?: (plan: DayPlan) => void;
}

export function DayPlanWidget({
  destination,
  locale,
  partySize = 1,
  onSaveToItinerary,
}: DayPlanWidgetProps) {
  const initialPlan = useMemo(
    () => generateDayPlan(destination),
    [destination],
  );
  const [plan, setPlan] = useState<DayPlan>(initialPlan);

  const handleRemoveStep = (stepId: string) => {
    setPlan((prev) => removeStepFromPlan(prev, stepId));
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    setPlan((prev) => reorderPlanSteps(prev, fromIdx, toIdx));
  };

  const timeBlockGroups = useMemo(() => {
    const morning = plan.steps.filter((s) => s.timeBlock === "morning");
    const afternoon = plan.steps.filter((s) => s.timeBlock === "afternoon");
    const evening = plan.steps.filter((s) => s.timeBlock === "evening");
    return { morning, afternoon, evening };
  }, [plan.steps]);

  if (!plan.steps.length) return null;

  return (
    <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-900">
      <CardContent className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              {locale === "ja" ? "モデルコース" : "Suggested Day Plan"}
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {plan.title[locale]}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {locale === "ja"
                ? "移動・休憩・おすすめスポットを最適化された1日プラン"
                : "Optimized 1-day itinerary with travel segments and meal breaks."}
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right">
              <div className="text-xs text-slate-400 font-semibold uppercase">
                {locale === "ja" ? "合計所要時間" : "Total Time"}
              </div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {Math.round((plan.totalDurationMinutes / 60) * 10) / 10}{" "}
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
                    plan.totalBudgetRange[0] * partySize,
                    plan.totalBudgetRange[1] * partySize,
                  ],
                  locale,
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Overfilled Plan Warning */}
        {plan.isOverfilled && plan.overfillWarning && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-800 dark:text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 font-semibold">
              {plan.overfillWarning[locale]}
            </div>
          </div>
        )}

        {/* Uncertain Hours Disclosure */}
        {plan.uncertainHoursDisclosures.length > 0 && (
          <div className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-600 dark:text-slate-400 text-xs">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            <div>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {locale === "ja"
                  ? "営業時間の注意事項: "
                  : "Opening Hours Disclosure: "}
              </span>
              {locale === "ja"
                ? `${plan.uncertainHoursDisclosures.map((d) => d.name).join("、")} の営業時間は事前確認をおすすめします。`
                : `Opening hours for ${plan.uncertainHoursDisclosures.map((d) => d.name).join(", ")} are unverified. Please double check.`}
            </div>
          </div>
        )}

        {/* Timeline Blocks */}
        <div className="space-y-6">
          {(["morning", "afternoon", "evening"] as const).map((blockKey) => {
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
                  <span className="text-xs text-slate-400 font-semibold">
                    ({blockMeta.subLabel})
                  </span>
                </div>

                <div className="space-y-2 pl-3 border-l-2 border-slate-100 dark:border-slate-800 ml-3">
                  {blockSteps.map((step) => {
                    const globalIdx = plan.steps.findIndex(
                      (s) => s.id === step.id,
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
                                  handleReorder(globalIdx, globalIdx - 1)
                                }
                                title={locale === "ja" ? "上に移動" : "Move up"}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {globalIdx < plan.steps.length - 1 && (
                              <button
                                onClick={() =>
                                  handleReorder(globalIdx, globalIdx + 1)
                                }
                                title={
                                  locale === "ja" ? "下に移動" : "Move down"
                                }
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveStep(step.id)}
                              title={locale === "ja" ? "削除" : "Remove"}
                              className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded text-slate-400 hover:text-red-600"
                            >
                              <X className="w-3.5 h-3.5" />
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
                            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded text-amber-600"
                          >
                            <X className="w-3 h-3" />
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
          })}
        </div>

        {/* Action Button */}
        {onSaveToItinerary && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <Button
              onClick={() => onSaveToItinerary(plan)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {locale === "ja" ? "このプランを保存" : "Save Plan to Itinerary"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
