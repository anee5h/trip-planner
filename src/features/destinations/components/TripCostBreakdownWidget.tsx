import { useState, useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import {
  calculateItemizedTripCost,
  formatLocalizedJPYRange,
} from "@/shared/services/budget/BudgetService";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  JapaneseYen,
  Train,
  Car,
  Ticket,
  Utensils,
  Coffee,
  CheckCircle2,
  Users,
  User,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { findNearbyCombinations } from "@/shared/services/recommendation/DestinationCombinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import { Link, useLocation } from "react-router-dom";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface TripCostBreakdownWidgetProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize?: number;
  activeTransportMode?: string;
  defaultExpanded?: boolean;
}

export function TripCostBreakdownWidget({
  destination,
  locale,
  partySize = 2,
  activeTransportMode = "train",
  defaultExpanded = false,
}: TripCostBreakdownWidgetProps) {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<"party" | "perPerson">("party");

  const cost = useMemo(() => {
    return calculateItemizedTripCost(destination, {
      activeMode: activeTransportMode,
      partySize,
    });
  }, [destination, activeTransportMode, partySize]);

  // Find 1-2 lower cost or free alternatives in the same area
  const lowerCostAlternatives = useMemo(() => {
    const combos = findNearbyCombinations(destination, undefined, 5);
    return combos
      .map((c) => c.secondary)
      .filter((sec) => (sec.budgetMin ?? 0) <= (destination.budgetMin ?? 0))
      .slice(0, 2);
  }, [destination]);

  if (!destination) return null;

  const totalMax =
    viewMode === "party" ? cost.partyRange[1] : cost.perPersonRange[1];

  function getCategoryWidth(amount: number): number {
    if (!totalMax || totalMax === 0) return 0;
    return Math.min(100, Math.max(8, Math.round((amount / totalMax) * 100)));
  }

  const handleToggleExpand = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    if (nextState) {
      recommendationAnalytics.trackPlanningToolEvent(
        "cost_breakdown_opened",
        destination.id,
        { partySize },
        locale,
      );
    }
  };

  return (
    <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
      <CardContent className="p-5 sm:p-6 space-y-5">
        {/* COMPACT SUMMARY HEADER (ALWAYS VISIBLE LOGISTICS SOURCE OF TRUTH) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <JapaneseYen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                {locale === "ja"
                  ? "概算予算・概算費用"
                  : "Estimated Trip Budget"}
              </h3>
              {cost.confidence === "high" && (
                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                  {locale === "ja" ? "公式データ" : "Curated Fares"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {locale === "ja"
                ? `交通・チケット・食事を含む予想合計 (グループ: ${partySize}名)`
                : `Est. total including transport, tickets & dining (${partySize} guests)`}
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right">
              <div className="text-xs text-slate-400 font-semibold uppercase">
                {locale === "ja" ? "概算合計" : "Est. Range"}
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {formatLocalizedJPYRange(cost.partyRange, locale)}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleToggleExpand}
              aria-expanded={isExpanded}
              className="min-h-[44px] px-3.5 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0"
            >
              <span>
                {isExpanded
                  ? locale === "ja"
                    ? "閉じる"
                    : "Hide details"
                  : locale === "ja"
                    ? "費用内訳を表示"
                    : "View cost breakdown"}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* EXPANDABLE DETAILED COST BREAKDOWN */}
        {isExpanded && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-6 animate-in fade-in duration-200">
            {/* Toggle Per-Person vs. Party */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {locale === "ja" ? "項目別内訳" : "Itemized Categories"}
              </span>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => setViewMode("party")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md min-h-[36px] transition-all ${
                    viewMode === "party"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-bold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  {locale === "ja"
                    ? `グループ (${partySize}名)`
                    : `Party (${partySize})`}
                </button>
                <button
                  onClick={() => setViewMode("perPerson")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md min-h-[36px] transition-all ${
                    viewMode === "perPerson"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-bold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  {locale === "ja" ? "1名あたり" : "Per Person"}
                </button>
              </div>
            </div>

            {/* Total Cost Range Display */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  {viewMode === "party"
                    ? locale === "ja"
                      ? `グループ合計 (${partySize}名)`
                      : `Total Party Cost (${partySize} guests)`
                    : locale === "ja"
                      ? "1名あたりの予想費用"
                      : "Per Person Total"}
                </span>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {formatLocalizedJPYRange(
                    viewMode === "party"
                      ? cost.partyRange
                      : cost.perPersonRange,
                    locale,
                  )}
                </div>
              </div>

              {cost.isFreeTicket && (
                <Badge className="bg-emerald-500 text-white font-bold px-3 py-1 text-xs shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" />
                  {locale === "ja" ? "入場無料" : "Free Admission"}
                </Badge>
              )}
            </div>

            {/* Itemized Categories Progress Bars */}
            <div className="space-y-4">
              {/* Transport */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    {activeTransportMode === "car" ||
                    activeTransportMode === "my_car" ? (
                      <Car className="w-4 h-4 text-sky-500 shrink-0" />
                    ) : (
                      <Train className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                    {locale === "ja" ? "往復交通費" : "Round-trip Transport"}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {formatLocalizedJPYRange(
                      viewMode === "party"
                        ? [cost.transport, cost.transport]
                        : [
                            cost.transport / partySize,
                            cost.transport / partySize,
                          ],
                      locale,
                    )}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{
                      width: `${getCategoryWidth(viewMode === "party" ? cost.transport : cost.transport / partySize)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Admission Tickets */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-purple-500 shrink-0" />
                    {locale === "ja"
                      ? "入場チケット・拝観料"
                      : "Admission Tickets"}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {cost.isFreeTicket
                      ? locale === "ja"
                        ? "無料"
                        : "Free"
                      : formatLocalizedJPYRange(
                          viewMode === "party"
                            ? [cost.tickets, cost.tickets]
                            : [
                                cost.tickets / partySize,
                                cost.tickets / partySize,
                              ],
                          locale,
                        )}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{
                      width: `${cost.isFreeTicket ? 0 : getCategoryWidth(viewMode === "party" ? cost.tickets : cost.tickets / partySize)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Food & Dining */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Utensils className="w-4 h-4 text-amber-500 shrink-0" />
                    {locale === "ja" ? "食事・ランチ" : "Food & Dining"}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {formatLocalizedJPYRange(
                      viewMode === "party"
                        ? cost.food
                        : [cost.food[0] / partySize, cost.food[1] / partySize],
                      locale,
                    )}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{
                      width: `${getCategoryWidth(viewMode === "party" ? cost.food[1] : cost.food[1] / partySize)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Café & Snacks */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Coffee className="w-4 h-4 text-rose-500 shrink-0" />
                    {locale === "ja" ? "カフェ・軽食" : "Café & Snacks"}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {formatLocalizedJPYRange(
                      viewMode === "party"
                        ? [cost.cafe, cost.cafe]
                        : [cost.cafe / partySize, cost.cafe / partySize],
                      locale,
                    )}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all"
                    style={{
                      width: `${getCategoryWidth(viewMode === "party" ? cost.cafe : cost.cafe / partySize)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Parking */}
              {cost.parking > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-indigo-500 shrink-0" />
                      {locale === "ja" ? "駐車料金" : "Parking Estimate"}
                    </span>
                    <span className="text-slate-900 dark:text-white">
                      {formatLocalizedJPYRange(
                        viewMode === "party"
                          ? [cost.parking, cost.parking]
                          : [
                              cost.parking / partySize,
                              cost.parking / partySize,
                            ],
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(viewMode === "party" ? cost.parking : cost.parking / partySize)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Lower-Cost Alternatives */}
            {lowerCostAlternatives.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  💡{" "}
                  {locale === "ja"
                    ? "より低予算の近隣スポット"
                    : "Lower-Cost Alternatives Nearby"}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {lowerCostAlternatives.map((alt) => {
                    const altLocalized = getLocalizedPlace(alt, locale);
                    return (
                      <Link
                        key={alt.id}
                        to={{
                          pathname: `/destinations/${alt.id}`,
                          search: location.search,
                        }}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all group bg-slate-50/50 dark:bg-slate-800/40"
                      >
                        <img
                          src={altLocalized.heroImage}
                          alt={altLocalized.name}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 transition-colors">
                            {formatPlaceName(altLocalized, locale)}
                          </h5>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-semibold">
                            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                            {alt.budgetMin === 0
                              ? locale === "ja"
                                ? "無料"
                                : "Free"
                              : formatLocalizedJPYRange(
                                  [alt.budgetMin, alt.budgetMax],
                                  locale,
                                )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
