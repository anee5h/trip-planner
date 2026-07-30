import { useState, useRef } from "react";
import type { Destination } from "@/shared/types/destination";
import {
  HubPlanningService,
  type HubPlan,
} from "@/shared/services/recommendation/HubPlanningService";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";
import {
  Compass,
  Clock,
  Train,
  Users,
  Calendar,
  Sparkles,
  ShieldCheck,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface HubPlannerWidgetProps {
  hub: Destination;
  locale?: "en" | "ja";
}

export function HubPlannerWidget({
  hub,
  locale = "en",
}: HubPlannerWidgetProps) {
  const [hasGenerated, setHasGenerated] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const [planType, setPlanType] = useState<"half_day" | "full_day">("half_day");
  const [partySize, setPartySize] = useState<number>(2);

  const [generatedPlan, setGeneratedPlan] = useState<HubPlan | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Do not render at all if destination is not a hub
  if (hub.role !== "hub") return null;

  const handleStartCreation = () => {
    setShowConfig(true);
    recommendationAnalytics.trackPlanningToolEvent(
      "hub_plan_creation_started",
      hub.id,
      {},
      locale,
    );
  };

  const handleGeneratePlan = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const plan = HubPlanningService.generateHubPlan(hub, {
      planType,
      partySize,
    });

    setGeneratedPlan(plan);
    setHasGenerated(true);
    setShowConfig(false);

    recommendationAnalytics.trackPlanningToolEvent(
      "hub_plan_generated",
      hub.id,
      {
        planType,
        partySize,
        generatedStopCount: plan.items.length,
        generatedDurationMinutes: plan.estimatedTotalHours * 60,
      },
      locale,
    );

    setTimeout(() => {
      containerRef.current?.focus();
    }, 100);
  };

  const handlePartySizeChange = (newPartySize: number) => {
    setPartySize(newPartySize);
    if (generatedPlan) {
      const updatedPlan = HubPlanningService.generateHubPlan(hub, {
        planType,
        partySize: newPartySize,
      });
      setGeneratedPlan(updatedPlan);
    }
  };

  const handleStartOver = () => {
    setHasGenerated(false);
    setGeneratedPlan(null);
    setShowConfig(false);
  };

  const handleSaveToItinerary = () => {
    if (!generatedPlan) return;
    toast.success(
      locale === "ja"
        ? `「${generatedPlan.title.ja}」を旅程に追加しました`
        : `Added "${generatedPlan.title.en}" to your trip itinerary!`,
    );
    recommendationAnalytics.trackPlanningToolEvent(
      "hub_plan_saved",
      hub.id,
      {
        planType,
        partySize,
        generatedStopCount: generatedPlan.items.length,
      },
      locale,
    );
  };

  return (
    <Card
      ref={containerRef}
      tabIndex={-1}
      className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
    >
      <CardHeader className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-100 dark:border-slate-800 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {locale === "ja"
                    ? "拠点エリア周遊プラン"
                    : "Hub-Based Travel Planner"}
                </CardTitle>
                <Badge className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 text-[10px] uppercase font-bold">
                  Single Transit
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {locale === "ja"
                  ? "拠点発着で基幹交通費を1回分に集約した効率的な周遊モデル"
                  : "Optimized hub itinerary counting main origin transport once"}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* DEFAULT COMPACT ENTRY STATE */}
        {!hasGenerated && !showConfig && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl text-xs text-slate-600 dark:text-slate-300">
              <p className="leading-relaxed">
                {locale === "ja"
                  ? `${hub.nameJa || hub.name}を拠点に周辺の観光地を巡り、基幹交通費を重複なしで1回分にまとめた効率的なプランを作成します。`
                  : `Explore top sights around ${hub.name} hub with origin-to-hub transit fare counted exactly once.`}
              </p>
              <div className="flex items-center gap-3 pt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span>
                  {locale === "ja"
                    ? "・半日コース: 2スポット"
                    : "• Half day: 2 stops"}
                </span>
                <span>
                  {locale === "ja"
                    ? "・1日コース: 3〜4スポット"
                    : "• Full day: 3–4 stops"}
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
                {locale === "ja" ? "拠点プランを作成" : "Create hub plan"}
              </span>
            </Button>
          </div>
        )}

        {/* PREFERENCE FORM */}
        {showConfig && (
          <form onSubmit={handleGeneratePlan} className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                {locale === "ja"
                  ? "拠点プランの条件設定"
                  : "Customize Hub Plan Preferences"}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Plan Type */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {locale === "ja" ? "コース種類" : "Course Type"}
                </label>
                <select
                  value={planType}
                  onChange={(e) =>
                    setPlanType(e.target.value as "half_day" | "full_day")
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                >
                  <option value="half_day">
                    {locale === "ja"
                      ? "半日コース (2スポット / 約4時間)"
                      : "Half Day (2 stops / ~4h)"}
                  </option>
                  <option value="full_day">
                    {locale === "ja"
                      ? "1日コース (3〜4スポット / 約8時間)"
                      : "Full Day (3–4 stops / ~8h)"}
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
                {locale === "ja" ? "拠点コースを生成" : "Generate Hub Plan"}
              </Button>
            </div>
          </form>
        )}

        {/* GENERATED HUB PLAN DISPLAY */}
        {hasGenerated && generatedPlan && (
          <div className="space-y-6">
            {/* Deduplication Banner */}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3.5 flex items-start gap-3 text-xs text-emerald-900 dark:text-emerald-200">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-950 dark:text-emerald-300">
                  {locale === "ja"
                    ? "基幹交通費の重複排除機能:"
                    : "Transit Cost Deduplication:"}
                </span>{" "}
                {locale === "ja"
                  ? `起点から拠点（${hub.nameJa || hub.name}）への往復交通費¥${generatedPlan.budget.travelToHubCost.toLocaleString()}は1回分のみ計算し、各スポット間はローカル移動費のみを加算します。`
                  : `Origin-to-hub fare (¥${generatedPlan.budget.travelToHubCost.toLocaleString()}) is counted once for the plan. Local intra-hub transit is calculated separately.`}
              </div>
            </div>

            {/* Itinerary Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <span>
                  {locale === "ja" ? "コース順序" : "Itinerary Order"} (
                  {generatedPlan.items.length} Stops)
                </span>
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {locale === "ja"
                      ? `所要時間 約${generatedPlan.estimatedTotalHours}時間`
                      : `Total ~${generatedPlan.estimatedTotalHours} hours`}
                  </span>
                </div>
              </div>

              <div className="relative pl-6 space-y-4 border-l-2 border-slate-200 dark:border-slate-800">
                {generatedPlan.items.map((item, idx) => (
                  <div
                    key={`${item.destination.id}-${idx}`}
                    className="relative group"
                  >
                    <div
                      className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${
                        item.isHub
                          ? "bg-emerald-500 ring-4 ring-emerald-500/20"
                          : "bg-sky-500"
                      }`}
                    />

                    <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500">
                            0{idx + 1}
                          </span>
                          <Link
                            to={`/destinations/${item.destination.id}`}
                            className="font-bold text-sm text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1"
                          >
                            {item.destination.name}
                            {item.isHub && (
                              <Badge className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[10px] ml-1 py-0 px-1.5">
                                Hub
                              </Badge>
                            )}
                          </Link>
                        </div>

                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {item.isHub
                            ? locale === "ja"
                              ? "拠点集合 30分"
                              : "30 min start"
                            : `${item.visitDurationMinutes} min visit`}
                        </div>
                      </div>

                      {!item.isHub && item.transitNote && (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800/60">
                          <Train className="w-3.5 h-3.5 text-sky-500" />
                          <span>{item.transitNote[locale]}</span>
                          {item.localTransitCost > 0 && (
                            <span className="text-slate-400 ml-auto font-mono">
                              +¥{item.localTransitCost}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hub Budget Breakdown */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {locale === "ja"
                    ? "拠点周遊コスト内訳"
                    : "Hub Plan Cost Breakdown"}
                </h4>

                {/* Party Size Selector */}
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{locale === "ja" ? "人数:" : "Party:"}</span>
                  <select
                    value={partySize}
                    onChange={(e) =>
                      handlePartySizeChange(Number(e.target.value))
                    }
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-0.5 text-xs font-bold min-h-[36px]"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "person" : "people"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] mb-1">
                    {locale === "ja" ? "基幹交通 (1回分)" : "Travel to Hub"}
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    ¥{generatedPlan.budget.travelToHubCost.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] mb-1">
                    {locale === "ja" ? "市内移動計" : "Local Transit"}
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    ¥{generatedPlan.budget.localTransitCost.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] mb-1">
                    {locale === "ja" ? "入場チケット計" : "Admission Tickets"}
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    ¥{generatedPlan.budget.ticketCost.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] mb-1">
                    {locale === "ja" ? "食事・カフェ" : "Meals & Café"}
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    ¥{generatedPlan.budget.foodCost.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {locale === "ja"
                      ? `グループ総額 (${partySize}名分)`
                      : `Party Total (${partySize} people)`}
                  </div>
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {formatLocalizedJPYRange(
                      [
                        generatedPlan.budget.partyRange.min,
                        generatedPlan.budget.partyRange.max,
                      ],
                      locale,
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleSaveToItinerary}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm min-h-[44px]"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {locale === "ja" ? "旅程に登録" : "Save to Itinerary"}
                </Button>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-2 pt-2">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
