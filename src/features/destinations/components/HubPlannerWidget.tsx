import { useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { HubPlanningService } from "@/shared/services/recommendation/HubPlanningService";
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
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface HubPlannerWidgetProps {
  hub: Destination;
  locale?: "en" | "ja";
}

export function HubPlannerWidget({
  hub,
  locale = "en",
}: HubPlannerWidgetProps) {
  const [planType, setPlanType] = useState<"half_day" | "full_day">("half_day");
  const [partySize, setPartySize] = useState<number>(2);

  const plan = HubPlanningService.generateHubPlan(hub, {
    planType,
    partySize,
  });

  const handleSaveToItinerary = () => {
    toast.success(
      locale === "ja"
        ? `「${plan.title.ja}」を旅程に追加しました`
        : `Added "${plan.title.en}" to your trip itinerary!`,
    );
  };

  return (
    <Card className="w-full bg-slate-900 text-white border border-slate-800 shadow-xl overflow-hidden rounded-2xl">
      <CardHeader className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-sky-950/80 border-b border-slate-800/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg sm:text-xl font-black tracking-tight text-white">
                  {locale === "ja"
                    ? "拠点エリア周遊プラン"
                    : "Hub-Based Travel Planner"}
                </CardTitle>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] uppercase font-bold">
                  Single Transit
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {locale === "ja"
                  ? "拠点発着で基幹交通費を1回分に集約した効率的な周遊モデル"
                  : "Optimized hub itinerary counting main origin transport once"}
              </p>
            </div>
          </div>

          {/* Plan Type Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setPlanType("half_day")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                planType === "half_day"
                  ? "bg-emerald-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {locale === "ja" ? "半日コース (約4時間)" : "Half-Day (4h)"}
            </button>
            <button
              onClick={() => setPlanType("full_day")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                planType === "full_day"
                  ? "bg-emerald-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {locale === "ja" ? "1日コース (約8時間)" : "Full-Day (8h)"}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* Deduplication Banner */}
        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3.5 flex items-start gap-3 text-xs text-emerald-200">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-300">
              {locale === "ja"
                ? "基幹交通費の重複排除機能:"
                : "Transit Cost Deduplication:"}
            </span>{" "}
            {locale === "ja"
              ? `起点から拠点（${hub.nameJa || hub.name}）への往復交通費¥${plan.budget.travelToHubCost.toLocaleString()}は1回分のみ計算し、各スポット間はローカル移動費のみを加算します。`
              : `Origin-to-hub fare (¥${plan.budget.travelToHubCost.toLocaleString()}) is counted once for the plan. Local intra-hub transit is calculated separately.`}
          </div>
        </div>

        {/* Itinerary Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>
              {locale === "ja" ? "コース順序" : "Itinerary Order"} (
              {plan.items.length} Stops)
            </span>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {locale === "ja"
                  ? `所要時間 約${plan.estimatedTotalHours}時間`
                  : `Total ~${plan.estimatedTotalHours} hours`}
              </span>
            </div>
          </div>

          <div className="relative pl-6 space-y-4 border-l-2 border-slate-800">
            {plan.items.map((item, idx) => (
              <div
                key={`${item.destination.id}-${idx}`}
                className="relative group"
              >
                {/* Timeline Dot */}
                <div
                  className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-slate-900 ${
                    item.isHub
                      ? "bg-emerald-400 ring-4 ring-emerald-500/20"
                      : "bg-sky-400"
                  }`}
                />

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 hover:border-slate-700 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-500">
                        0{idx + 1}
                      </span>
                      <Link
                        to={`/destinations/${item.destination.id}`}
                        className="font-bold text-sm text-white hover:text-emerald-400 transition-colors flex items-center gap-1"
                      >
                        {item.destination.name}
                        {item.isHub && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] ml-1 py-0 px-1.5">
                            Hub
                          </Badge>
                        )}
                      </Link>
                    </div>

                    <div className="text-xs font-medium text-slate-400">
                      {item.isHub
                        ? locale === "ja"
                          ? "拠点集合 30分"
                          : "30 min start"
                        : `${item.visitDurationMinutes} min visit`}
                    </div>
                  </div>

                  {!item.isHub && item.transitNote && (
                    <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5 pt-2 border-t border-slate-800/60">
                      <Train className="w-3.5 h-3.5 text-sky-400" />
                      <span>{item.transitNote[locale]}</span>
                      {item.localTransitCost > 0 && (
                        <span className="text-slate-500 ml-auto font-mono">
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
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {locale === "ja"
                ? "拠点周遊コスト内訳"
                : "Hub Plan Cost Breakdown"}
            </h4>

            {/* Party Size Selector */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>{locale === "ja" ? "人数:" : "Party:"}</span>
              <select
                value={partySize}
                onChange={(e) => setPartySize(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 text-white rounded-md px-2 py-0.5 text-xs font-bold"
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
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[11px] mb-1">
                {locale === "ja" ? "基幹交通 (1回分)" : "Travel to Hub"}
              </div>
              <div className="font-bold text-white text-sm">
                ¥{plan.budget.travelToHubCost.toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[11px] mb-1">
                {locale === "ja" ? "市内移動計" : "Local Transit"}
              </div>
              <div className="font-bold text-white text-sm">
                ¥{plan.budget.localTransitCost.toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[11px] mb-1">
                {locale === "ja" ? "入場チケット計" : "Admission Tickets"}
              </div>
              <div className="font-bold text-white text-sm">
                ¥{plan.budget.ticketCost.toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[11px] mb-1">
                {locale === "ja" ? "食事・カフェ" : "Meals & Café"}
              </div>
              <div className="font-bold text-white text-sm">
                ¥{plan.budget.foodCost.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">
                {locale === "ja"
                  ? `グループ総額 (${partySize}名分)`
                  : `Party Total (${partySize} people)`}
              </div>
              <div className="text-lg font-black text-emerald-400">
                {formatLocalizedJPYRange(
                  [plan.budget.partyRange.min, plan.budget.partyRange.max],
                  locale,
                )}
              </div>
            </div>

            <Button
              onClick={handleSaveToItinerary}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <Calendar className="w-3.5 h-3.5" />
              {locale === "ja" ? "旅程に登録" : "Save to Itinerary"}
            </Button>
          </div>
        </div>

        {/* Related Collections */}
        {plan.relatedCollections.length > 0 && (
          <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-400 font-bold">
              {locale === "ja" ? "関連特集:" : "Related Guides:"}
            </span>
            {plan.relatedCollections.map((col) => (
              <Badge
                key={col.id}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                {col.title}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
