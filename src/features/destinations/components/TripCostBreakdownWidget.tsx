import { useState, useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import {
  calculateItemizedTripCost,
  formatLocalizedJPYRange,
  hasKnownBudgetRange,
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
  BedDouble,
} from "lucide-react";
import { findNearbyCombinations } from "@/shared/services/recommendation/DestinationCombinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import { Link, useLocation } from "react-router-dom";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";
import { useTranslation } from "react-i18next";
import type { GeneratedPlanCostResult } from "@/shared/services/budget/GeneratedPlanCostService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";

export interface TripCostBreakdownWidgetProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize?: number;
  /** null = no estimable origin route; the total must not claim origin transport. */
  activeTransportMode?: string | null;
  /** Planned travel date for ferry availability. */
  ferryTemporal?: FerryTemporalContext;
  defaultExpanded?: boolean;
  hasGeneratedPlan?: boolean;
  planCostBreakdown?: GeneratedPlanCostResult;
  accommodationAllowance?: number;
}

export function TripCostBreakdownWidget({
  destination,
  locale,
  partySize = 2,
  activeTransportMode = null,
  ferryTemporal,
  defaultExpanded = false,
  hasGeneratedPlan = false,
  planCostBreakdown,
  accommodationAllowance,
}: TripCostBreakdownWidgetProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<"party" | "perPerson">("party");

  const cost = useMemo(() => {
    if (planCostBreakdown) {
      return {
        transport:
          planCostBreakdown.originTransport.min +
          planCostBreakdown.localTransit.min,
        localTransit: planCostBreakdown.localTransit.min,
        transportAvailable:
          planCostBreakdown.originTransport.applicable ||
          planCostBreakdown.localTransit.applicable,
        tickets: planCostBreakdown.admission.min,
        food: [planCostBreakdown.meals.min, planCostBreakdown.meals.max] as [
          number,
          number,
        ],
        cafe: 0,
        parking: planCostBreakdown.parking.min,
        isFreeTicket:
          planCostBreakdown.admission.max === 0 &&
          planCostBreakdown.admission.source === "curated",
        confidence: planCostBreakdown.confidence,
        partyRange: planCostBreakdown.totalRange,
        perPersonRange: planCostBreakdown.totalRange,
        durationKnown: true,
        budgetAvailable: true,
      };
    }
    return calculateItemizedTripCost(destination, {
      activeMode: activeTransportMode,
      partySize,
      ferryTemporal,
      accommodationAllowance,
    });
  }, [
    destination,
    activeTransportMode,
    partySize,
    planCostBreakdown,
    ferryTemporal,
    accommodationAllowance,
  ]);

  const displayRange = (range: [number, number]): [number, number] =>
    viewMode === "party"
      ? range
      : [Math.round(range[0] / partySize), Math.round(range[1] / partySize)];
  const hasKnownCost = Boolean(planCostBreakdown || cost.budgetAvailable);
  const transportRange: [number, number] = planCostBreakdown
    ? [
        planCostBreakdown.originTransport.min +
          planCostBreakdown.localTransit.min,
        planCostBreakdown.originTransport.max +
          planCostBreakdown.localTransit.max,
      ]
    : [
        cost.transport + (cost.localTransit ?? 0),
        cost.transport + (cost.localTransit ?? 0),
      ];
  const admissionRange: [number, number] = planCostBreakdown
    ? [planCostBreakdown.admission.min, planCostBreakdown.admission.max]
    : [cost.tickets, cost.tickets];
  const mealRange: [number, number] = planCostBreakdown
    ? [planCostBreakdown.meals.min, planCostBreakdown.meals.max]
    : cost.food
      ? [cost.food[0], cost.food[1]]
      : [0, 0];
  const cafeRange: [number, number] = planCostBreakdown
    ? [0, 0]
    : [cost.cafe, cost.cafe];
  const parkingRange: [number, number] = planCostBreakdown
    ? [planCostBreakdown.parking.min, planCostBreakdown.parking.max]
    : [cost.parking, cost.parking];
  const hasMeals = planCostBreakdown
    ? planCostBreakdown.meals.applicable
    : hasKnownCost && cost.food !== null;
  const hasCafe = !planCostBreakdown && cafeRange[1] > 0;
  // Transport visibility follows the DISPLAYED ROW (origin + on-site/local
  // transit combined), not origin availability alone: when origin transport
  // is unavailable but the on-site allowance is known, the row must still
  // show (its amount is part of the total) with an origin-excluded note.
  const hasTransport = transportRange[1] > 0;
  const originTransportExcluded =
    !planCostBreakdown && hasTransport && !cost.transportAvailable;
  const hasParking = planCostBreakdown
    ? planCostBreakdown.parking.applicable
    : parkingRange[1] > 0;
  const hasAccommodationAllowance = Boolean(
    accommodationAllowance && accommodationAllowance > 0,
  );
  const accommodationAllowanceRange: [number, number] =
    hasAccommodationAllowance
      ? [accommodationAllowance!, accommodationAllowance!]
      : [0, 0];
  const visiblePartyRanges = planCostBreakdown
    ? [
        ...(hasTransport ? [transportRange] : []),
        admissionRange,
        ...(hasMeals ? [mealRange] : []),
        ...(hasParking ? [parkingRange] : []),
        ...(hasAccommodationAllowance ? [accommodationAllowanceRange] : []),
      ]
    : [];
  const totalRange: [number, number] = planCostBreakdown
    ? visiblePartyRanges.reduce<[number, number]>(
        (total, range) => [total[0] + range[0], total[1] + range[1]],
        [0, 0],
      )
    : [cost.partyRange[0], cost.partyRange[1]];
  const displayedTotalRange: [number, number] =
    viewMode === "party"
      ? totalRange
      : planCostBreakdown
        ? visiblePartyRanges
            .map(displayRange)
            .reduce<[number, number]>(
              (total, range) => [total[0] + range[0], total[1] + range[1]],
              [0, 0],
            )
        : [cost.perPersonRange[0], cost.perPersonRange[1]];

  const headerTitle = hasGeneratedPlan
    ? locale === "ja"
      ? "プラン算出費用"
      : "Your plan cost"
    : locale === "ja"
      ? "概算滞在費用"
      : "Estimated visit cost";

  const lowerCostAlternatives = useMemo(() => {
    const combos = findNearbyCombinations(destination, undefined, 5);
    // KAI-89: only FINITE known ranges may be compared — an unknown budget
    // (budgetMetadata.method "unknown", value absent) must never qualify as
    // "Lower-Cost" via a (?? 0) fallback. Both sides must be finite.
    const destMin = destination.budgetMin;
    if (!Number.isFinite(destMin)) return [];
    return combos
      .map((c) => c.secondary)
      .filter(
        (sec) => Number.isFinite(sec.budgetMin) && sec.budgetMin! <= destMin!,
      )
      .slice(0, 2);
  }, [destination]);

  if (!destination) return null;

  const totalMax = displayedTotalRange[1];

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <JapaneseYen className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                {headerTitle}
              </h3>
              {cost.confidence === "verified" ? (
                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                  {locale === "ja" ? "確認済み概算" : "Verified Fares"}
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                  {locale === "ja" ? "推定概算" : "Estimated Fares"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              {!cost.durationKnown
                ? locale === "ja"
                  ? `滞在時間が不明なため一部の概算のみ (グループ: ${partySize}名)`
                  : `Partial estimate — visit duration unknown (${partySize} guests)`
                : !hasTransport
                  ? locale === "ja"
                    ? `現地費用の概算（交通費を除く） (グループ: ${partySize}名)`
                    : `Estimated on-site total — transport excluded (${partySize} guests)`
                  : locale === "ja"
                    ? `交通・チケット・食事を含む予想合計 (グループ: ${partySize}名)`
                    : `Est. total including transport, tickets & dining (${partySize} guests)`}
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase">
                {locale === "ja" ? "概算合計" : "Est. Range"}
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {hasKnownCost
                  ? formatLocalizedJPYRange(totalRange, locale)
                  : locale === "ja"
                    ? "料金不明"
                    : "Cost unavailable"}
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

        {isExpanded && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
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

            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  {viewMode === "party"
                    ? locale === "ja"
                      ? `グループ合計 (${partySize}名)`
                      : `Total Party Cost (${partySize} guests)`
                    : locale === "ja"
                      ? "1名あたりの予想費用"
                      : "Per Person Total"}
                </span>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {hasKnownCost
                    ? formatLocalizedJPYRange(displayedTotalRange, locale)
                    : locale === "ja"
                      ? "料金不明"
                      : "Cost unavailable"}
                </div>
              </div>

              {cost.isFreeTicket && (
                <Badge className="bg-emerald-700 text-white font-bold px-3 py-1 text-xs shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" />
                  {locale === "ja" ? "入場無料" : "Free Admission"}
                </Badge>
              )}
            </div>

            <div className="space-y-4">
              {hasTransport && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      {activeTransportMode === "car" ||
                      activeTransportMode === "my_car" ? (
                        <Car className="w-4 h-4 text-sky-500 shrink-0" />
                      ) : activeTransportMode ? (
                        <Train className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : null}
                      {locale === "ja" ? "交通費" : "Transport"}
                    </span>
                    <span className="text-slate-900 dark:text-white">
                      {formatLocalizedJPYRange(
                        viewMode === "party"
                          ? transportRange
                          : displayRange(transportRange),
                        locale,
                      )}
                    </span>
                  </div>
                  {originTransportExcluded && (
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                      {locale === "ja"
                        ? "往復の交通費は推定できません。現地の交通費のみを含みます。"
                        : "Origin transport not estimated; on-site transit only."}
                    </div>
                  )}
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-700 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(displayRange(transportRange)[1])}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-purple-500 shrink-0" />
                    {locale === "ja"
                      ? "入場チケット・拝観料"
                      : "Admission Tickets"}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {!hasKnownCost
                      ? locale === "ja"
                        ? "料金不明"
                        : "Cost unavailable"
                      : cost.isFreeTicket
                        ? locale === "ja"
                          ? "無料"
                          : "Free"
                        : planCostBreakdown?.admission.source === "unknown"
                          ? locale === "ja"
                            ? "変動・未確認"
                            : "Variable / unknown admission"
                          : formatLocalizedJPYRange(
                              viewMode === "party"
                                ? admissionRange
                                : displayRange(admissionRange),
                              locale,
                            )}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{
                      width: `${cost.isFreeTicket ? 0 : getCategoryWidth(displayRange(admissionRange)[1])}%`,
                    }}
                  />
                </div>
              </div>

              {hasMeals && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Utensils className="w-4 h-4 text-amber-500 shrink-0" />
                      {locale === "ja" ? "食事・ランチ" : "Food & Dining"}
                    </span>
                    <span className="text-slate-900 dark:text-white">
                      {formatLocalizedJPYRange(
                        viewMode === "party"
                          ? mealRange
                          : displayRange(mealRange),
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(displayRange(mealRange)[1])}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {hasCafe && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Coffee className="w-4 h-4 text-rose-500 shrink-0" />
                      {locale === "ja" ? "カフェ・軽食" : "Café & Snacks"}
                    </span>
                    <span className="text-slate-900 dark:text-white">
                      {formatLocalizedJPYRange(
                        viewMode === "party"
                          ? cafeRange
                          : displayRange(cafeRange),
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(displayRange(cafeRange)[1])}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {hasParking && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-indigo-500 shrink-0" />
                      {locale === "ja" ? "駐車料金" : "Parking Estimate"}
                    </span>
                    <span className="text-slate-900 dark:text-white">
                      {formatLocalizedJPYRange(
                        viewMode === "party"
                          ? parkingRange
                          : displayRange(parkingRange),
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(displayRange(parkingRange)[1])}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {hasAccommodationAllowance && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <BedDouble className="w-4 h-4 text-teal-500 shrink-0" />
                      {t("planner.stayAllowanceRow")}
                    </span>
                    <span className="text-slate-900 dark:text-white">
                      {formatLocalizedJPYRange(
                        viewMode === "party"
                          ? [accommodationAllowance!, accommodationAllowance!]
                          : [
                              Math.round(accommodationAllowance! / partySize),
                              Math.round(accommodationAllowance! / partySize),
                            ],
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(accommodationAllowance!)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {t("planner.stayAllowanceNote")}
                  </p>
                </div>
              )}
            </div>

            {/* Scope Note Banner */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-300">
              {locale === "ja"
                ? "※ 現地までの広域移動交通費（航空券・新幹線等）は含まれません。"
                : "Note: Origin transport (flights, shinkansen) to the area is not included."}
            </div>

            {lowerCostAlternatives.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
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
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-700/50 transition-all group bg-slate-50/50 dark:bg-slate-800/40"
                      >
                        <img
                          src={altLocalized.heroImage}
                          alt={altLocalized.name}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-700 transition-colors">
                            {formatPlaceName(altLocalized, locale)}
                          </h5>
                          <div className="text-[11px] text-slate-500 dark:text-slate-300 flex items-center gap-1 font-semibold">
                            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                            {hasKnownBudgetRange(alt)
                              ? alt.budgetMin === 0
                                ? locale === "ja"
                                  ? "無料"
                                  : "Free"
                                : formatLocalizedJPYRange(
                                    [alt.budgetMin, alt.budgetMax],
                                    locale,
                                  )
                              : locale === "ja"
                                ? "料金不明"
                                : "Cost unavailable"}
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
