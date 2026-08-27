import { useState, useMemo } from "react";
import type { Destination } from "@/shared/types/destination";
import {
  formatLocalizedJPYRange,
  hasKnownBudgetRange,
} from "@/shared/services/budget/BudgetService";
import { calculateTripCost } from "@/shared/services/budget/tripCostEngine";
import { isVerifiedFree } from "@/shared/services/budget/budgetState";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  JapaneseYen,
  Train,
  Car,
  Ticket,
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
  /** KAI-217B round-2: the actual trip mode — overnight trips must include
   *  the party-total accommodation allowance × nights. */
  tripMode?: "day_trip" | "weekend_2d1n" | "multi_night";
  nights?: number;
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
  tripMode = "day_trip",
  nights,
}: TripCostBreakdownWidgetProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<"party" | "perPerson">("party");

  // KAI-217B round-5: ONE canonical engine call for the non-generated path.
  // ALL displayed costs derive from TripCostResult.components — never from
  // calculateItemizedTripCost / budgetBreakdown legacy scalars.
  const engineResult = useMemo(() => {
    if (planCostBreakdown) return undefined;
    return calculateTripCost({
      dest: destination,
      // KAI-217B round-2: the ACTUAL trip mode — 2D1N includes the
      // party-total accommodation allowance × 1 night (never hardcoded
      // day_trip, which would falsely omit overnight cost).
      tripMode,
      nights,
      partySize,
      accommodationAllowance,
      ferryTemporal,
      includeOriginTravel: false,
    });
  }, [
    destination,
    partySize,
    accommodationAllowance,
    planCostBreakdown,
    tripMode,
    nights,
    ferryTemporal,
  ]);

  // Component lookup by scope (canonical).
  const engineComponent = (scope: string) =>
    engineResult?.components.find((c) => c.evidence.scope === scope);
  const originTravelComp = engineComponent("origin_travel");
  const localTransportComp = engineComponent("local_transport");
  const admissionComp = engineComponent("admission");
  const accommodationComp = engineComponent("accommodation");

  const engineTotal = engineResult
    ? engineResult.completeness === "complete" && engineResult.total
      ? ([engineResult.total.min, engineResult.total.max] as [number, number])
      : undefined
    : undefined;
  // KAI-217B round-4: engine partial metadata for non-generated results —
  // the header shows "Known ¥X–Y" + missing indication instead of a generic
  // unavailable when the engine result is partial.
  const enginePartialLabel: string | undefined =
    !planCostBreakdown &&
    engineResult &&
    engineResult.completeness === "partial"
      ? locale === "ja"
        ? `既知 ${formatLocalizedJPYRange(engineResult.knownSubtotal, locale)}`
        : `Known ${formatLocalizedJPYRange(engineResult.knownSubtotal, locale)}`
      : undefined;

  const displayRange = (range: [number, number]): [number, number] =>
    viewMode === "party"
      ? range
      : [Math.round(range[0] / partySize), Math.round(range[1] / partySize)];
  const displayRangeOrUndefined = (
    range: [number, number] | undefined,
  ): [number, number] | undefined => (range ? displayRange(range) : undefined);
  const hasKnownCost = planCostBreakdown
    ? // KAI-204 phase 3: a populated plan cost object is only "known" when
      // its admission component carries trusted provenance. A plan built
      // from legacy absent-metadata or unknown-ticket destinations sets
      // admission.source="unknown" — the widget must not present those
      // unverified totals as a known cost.
      planCostBreakdown.admission.source !== "unknown" &&
      Boolean(
        planCostBreakdown.originTransport.applicable ||
        planCostBreakdown.localTransit.applicable ||
        planCostBreakdown.admission.applicable ||
        planCostBreakdown.meals.applicable ||
        planCostBreakdown.parking.applicable,
      )
    : engineResult?.completeness === "complete" || false;
  // KAI-217B round-3: partial-plan UI — when the plan is partial, surface
  // the KNOWN subtotal instead of a generic "Cost unavailable" (known parts
  // are still honest information).
  const partialPlanLabel: string | undefined =
    planCostBreakdown?.completeness === "partial"
      ? locale === "ja"
        ? `既知 ${formatLocalizedJPYRange(
            planCostBreakdown.knownSubtotal,
            locale,
          )}`
        : `Known ${formatLocalizedJPYRange(
            planCostBreakdown.knownSubtotal,
            locale,
          )}`
      : undefined;
  // Component ranges from the CANONICAL engine components (round-5). The
  // CostRepresentation shapes are preserved: bounded → [min,max]; otherwise
  // the component is not displayed as a numeric (handled by
  // missing/unavailable semantics).
  const componentRange = (
    comp: { cost: { kind: string; min?: number; max?: number } } | undefined,
  ): [number, number] | undefined =>
    comp?.cost.kind === "bounded" && comp.cost.min !== undefined
      ? [comp.cost.min, comp.cost.max ?? comp.cost.min]
      : undefined;
  const transportRange: [number, number] | undefined = planCostBreakdown
    ? [
        planCostBreakdown.originTransport.min +
          planCostBreakdown.localTransit.min,
        planCostBreakdown.originTransport.max +
          planCostBreakdown.localTransit.max,
      ]
    : (() => {
        const origin = componentRange(originTravelComp);
        const local = componentRange(localTransportComp);
        if (origin && local) {
          return [origin[0] + local[0], origin[1] + local[1]];
        }
        if (origin) return origin;
        if (local) return local;
        return undefined;
      })();
  const admissionRange: [number, number] | undefined = planCostBreakdown
    ? // KAI-219A final repair: a not_applicable generated-plan admission is
      // a SATISFIED non-numeric component — NO ¥0 range row, NO [0,0] in
      // visiblePartyRanges. Free shows its [0,0] via the Free label.
      planCostBreakdown.admission.semanticState === "not_applicable"
      ? undefined
      : [planCostBreakdown.admission.min, planCostBreakdown.admission.max]
    : componentRange(admissionComp);
  const accommodationRange: [number, number] | undefined =
    componentRange(accommodationComp);
  const hasTransport = (transportRange?.[1] ?? 0) > 0;
  const originTransportExcluded =
    !planCostBreakdown &&
    hasTransport &&
    originTravelComp?.cost.kind !== "bounded";
  const hasAccommodationAllowance =
    // A ¥0 accommodation component (no real allowance) is not a row.
    (accommodationRange?.[1] ?? accommodationAllowance ?? 0) > 0;
  const accommodationAllowanceRange: [number, number] = accommodationRange ?? [
    accommodationAllowance ?? 0,
    accommodationAllowance ?? 0,
  ];
  const visiblePartyRanges = planCostBreakdown
    ? [
        ...(hasTransport && transportRange ? [transportRange] : []),
        ...(admissionRange ? [admissionRange] : []),
        ...(hasAccommodationAllowance ? [accommodationAllowanceRange] : []),
      ]
    : [];
  // KAI-217B round-5: localized scope names for the missing-component list.
  const scopeLabel = (scope: string): string => {
    switch (scope) {
      case "origin_travel":
        return locale === "ja" ? "広域交通" : "origin transport";
      case "local_transport":
        return locale === "ja" ? "現地交通費" : "local transport";
      case "admission":
        return locale === "ja" ? "入場料" : "admission";
      case "accommodation":
        return locale === "ja" ? "宿泊費" : "accommodation";
      default:
        return scope;
    }
  };
  // Engine partial: explicit missing components by scope/reason.
  const engineMissingComponents: readonly {
    scope: string;
    reason: string;
  }[] =
    !planCostBreakdown && engineResult?.completeness === "partial"
      ? engineResult.missingComponents
      : [];
  // Generated-plan partial: derive missing labels from the explicit
  // component applicability/source fields (the plan result does not expose
  // a canonical missingComponents array).
  const planMissingComponents: string[] =
    planCostBreakdown?.completeness === "partial"
      ? [
          ...(planCostBreakdown.originTransport.applicable &&
          planCostBreakdown.originTransport.source === "curated"
            ? []
            : [scopeLabel("origin_travel")]),
          ...(planCostBreakdown.localTransit.applicable &&
          planCostBreakdown.localTransit.source === "curated"
            ? []
            : [scopeLabel("local_transport")]),
          ...(planCostBreakdown.admission.applicable &&
          planCostBreakdown.admission.source === "curated"
            ? []
            : [scopeLabel("admission")]),
        ]
      : [];
  const missingComponentsText: string | undefined =
    engineMissingComponents.length > 0 || planMissingComponents.length > 0
      ? locale === "ja"
        ? `未確認: ${[...engineMissingComponents.map((m) => scopeLabel(m.scope)), ...planMissingComponents].join("、")}`
        : `Missing: ${[...engineMissingComponents.map((m) => scopeLabel(m.scope)), ...planMissingComponents].join(", ")}`
      : undefined;

  // KAI-217B round-6: STRICT Free semantics — verified free comes ONLY
  // from the canonical admission evidence.state === "verified_free" (plus
  // a defensive [0,0] check). A source-backed PAID fact whose value happens
  // to be 0 is NOT a verified-free semantic state.
  const isFreeAdmission =
    (admissionComp?.cost.kind === "bounded" &&
      admissionComp.cost.min === 0 &&
      admissionComp.cost.max === 0 &&
      admissionComp.evidence.state === "verified_free") ||
    // KAI-219A final repair: generated plans carry the aggregate semantic
    // state — all-applicable-free → verified_free.
    (planCostBreakdown?.admission.semanticState === "verified_free" && true);

  // KAI-217B round-6: AGGREGATE confidence badge from ALL cost-bearing
  // components — never from admission alone:
  //   - partial result          → "Partial"
  //   - complete + any model_estimate → "Estimated"
  //   - complete, every cost-bearing component verified source_fact → "Verified"
  // Accommodation user_allowance is NEUTRAL (a user assumption, not
  // evidence that turns Verified into Estimated).
  const costBearingComponents = engineResult
    ? engineResult.components.filter(
        (c) =>
          c.evidence.scope !== "accommodation" ||
          c.evidence.derivation !== "user_allowance",
      )
    : [];
  const anyModelEstimate = costBearingComponents.some(
    (c) =>
      c.evidence.derivation === "model_estimate" ||
      c.evidence.derivation === "computed",
  );
  const allVerified = costBearingComponents.every(
    (c) =>
      c.evidence.derivation === "source_fact" ||
      c.evidence.state === "verified_paid" ||
      c.evidence.state === "verified_free",
  );
  const badgeState: "verified" | "estimated" | "partial" | undefined =
    planCostBreakdown
      ? planCostBreakdown.completeness === "complete"
        ? planCostBreakdown.confidence === "verified"
          ? "verified"
          : "estimated"
        : planCostBreakdown.completeness === "partial"
          ? "partial"
          : undefined
      : engineResult
        ? engineResult.completeness === "complete"
          ? allVerified
            ? "verified"
            : anyModelEstimate
              ? "estimated"
              : "verified"
          : engineResult.completeness === "partial"
            ? "partial"
            : undefined
        : undefined;

  const totalRange: [number, number] | undefined = planCostBreakdown
    ? visiblePartyRanges.reduce<[number, number]>(
        (total, range) => [total[0] + range[0], total[1] + range[1]],
        [0, 0],
      )
    : engineTotal;
  const displayedTotalRange: [number, number] | undefined =
    viewMode === "party"
      ? totalRange
      : planCostBreakdown
        ? visiblePartyRanges
            .map(displayRange)
            .reduce<[number, number]>(
              (total, range) => [total[0] + range[0], total[1] + range[1]],
              [0, 0],
            )
        : totalRange
          ? [
              Math.round(totalRange[0] / partySize),
              Math.round(totalRange[1] / partySize),
            ]
          : undefined;

  const headerTitle = hasGeneratedPlan
    ? locale === "ja"
      ? "プラン算出費用"
      : "Your plan cost"
    : locale === "ja"
      ? "概算滞在費用"
      : "Estimated visit cost";

  const lowerCostAlternatives = useMemo(() => {
    const combos = findNearbyCombinations(destination, undefined, 5);
    // KAI-89 + KAI-215: only TRUSTED finite known ranges may be compared —
    // an unknown/legacy/absent budget must never qualify as "Lower-Cost" via
    // a (?? 0) fallback or a raw budgetMin read. Both sides must be trusted
    // (normalized) and finite.
    const destMin = destination.budgetMin;
    if (!hasKnownBudgetRange(destination) || !Number.isFinite(destMin)) {
      return [];
    }
    return combos
      .map((c) => c.secondary)
      .filter(
        (sec) =>
          hasKnownBudgetRange(sec) &&
          Number.isFinite(sec.budgetMin) &&
          sec.budgetMin! <= destMin!,
      )
      .slice(0, 2);
  }, [destination]);

  if (!destination) return null;

  const totalMax = displayedTotalRange?.[1];

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
              {badgeState === "verified" && (
                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                  {locale === "ja" ? "確認済み概算" : "Verified Fares"}
                </Badge>
              )}
              {badgeState === "estimated" && (
                <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                  {locale === "ja" ? "推定概算" : "Estimated Fares"}
                </Badge>
              )}
              {badgeState === "partial" && (
                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 text-[10px] font-bold">
                  {locale === "ja" ? "一部のみ判明" : "Partial"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              {!hasTransport
                ? locale === "ja"
                  ? `現地費用の概算（交通費を除く） (グループ: ${partySize}名)`
                  : `Estimated on-site total — transport excluded (${partySize} guests)`
                : locale === "ja"
                  ? `交通・チケット・宿泊を含む予想合計 (グループ: ${partySize}名)`
                  : `Est. total including transport, tickets & accommodation (${partySize} guests)`}
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase">
                {locale === "ja" ? "概算合計" : "Est. Range"}
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {partialPlanLabel || enginePartialLabel
                  ? (partialPlanLabel ?? enginePartialLabel)
                  : hasKnownCost
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
                  {partialPlanLabel || enginePartialLabel
                    ? locale === "ja"
                      ? "判明済み小計"
                      : "Known subtotal"
                    : viewMode === "party"
                      ? locale === "ja"
                        ? `グループ合計 (${partySize}名)`
                        : `Total Party Cost (${partySize} guests)`
                      : locale === "ja"
                        ? "1名あたりの予想費用"
                        : "Per Person Total"}
                </span>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {partialPlanLabel || enginePartialLabel
                    ? (partialPlanLabel ?? enginePartialLabel)
                    : hasKnownCost
                      ? formatLocalizedJPYRange(displayedTotalRange, locale)
                      : locale === "ja"
                        ? "料金不明"
                        : "Cost unavailable"}
                </div>
                {(partialPlanLabel || enginePartialLabel) &&
                  (planCostBreakdown?.completeness === "partial" ||
                    engineResult?.completeness === "partial") && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      {locale === "ja"
                        ? "一部の項目が不明のため小計のみ表示"
                        : "Some components unknown — showing known subtotal only"}
                      {missingComponentsText
                        ? ` — ${missingComponentsText}`
                        : ""}
                    </div>
                  )}
              </div>

              {isFreeAdmission && (
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
                        displayRangeOrUndefined(transportRange),
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
                        width: `${getCategoryWidth(
                          displayRangeOrUndefined(transportRange)?.[1] ?? 0,
                        )}%`,
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
                    {(() => {
                      // KAI-217B round-6: component-level displayability —
                      // NEVER gated by the trip's global completeness. A
                      // bounded admission shows its range even when the trip
                      // is partial; free shows Free; unknown → variable/
                      // unavailable.
                      // KAI-219A final repair: generated-plan not_applicable
                      // → "Not applicable / 対象外" (never a ¥0 row).
                      if (
                        planCostBreakdown?.admission.semanticState ===
                        "not_applicable"
                      ) {
                        return locale === "ja" ? "対象外" : "Not applicable";
                      }
                      if (isFreeAdmission) {
                        return locale === "ja" ? "無料" : "Free";
                      }
                      if (admissionRange) {
                        return formatLocalizedJPYRange(
                          displayRangeOrUndefined(admissionRange),
                          locale,
                        );
                      }
                      if (planCostBreakdown?.admission.source === "unknown") {
                        return locale === "ja"
                          ? "変動・未確認"
                          : "Variable / unknown admission";
                      }
                      return locale === "ja" ? "料金不明" : "Cost unavailable";
                    })()}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{
                      width: `${isFreeAdmission ? 0 : getCategoryWidth(displayRangeOrUndefined(admissionRange)?.[1] ?? 0)}%`,
                    }}
                  />
                </div>
              </div>

              {/* KAI-217B round-5: food/cafe/parking rows REMOVED — excluded
                  from canonical affordability; no legacy itemized ranges. */}

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
                          ? accommodationAllowanceRange
                          : displayRange(accommodationAllowanceRange),
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all"
                      style={{
                        width: `${getCategoryWidth(
                          accommodationAllowanceRange[1],
                        )}%`,
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
                              ? isVerifiedFree(alt)
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
