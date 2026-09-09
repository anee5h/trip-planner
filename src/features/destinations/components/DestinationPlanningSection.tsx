import { useEffect, useMemo, useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { DayPlanWidget } from "./DayPlanWidget";
import { TripCostBreakdownWidget } from "./TripCostBreakdownWidget";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { getPlanEligibility } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "@/shared/services/budget/GeneratedPlanCostService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { useFullCatalogue } from "@/shared/hooks/useFullCatalogue";
import type { TripDuration } from "@/shared/types/tripDuration";

interface DestinationPlanningSectionProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize: number;
  homeCoords?: { lat: number; lng: number };
  /** null = no selected local transit mode; canonical profiles still apply. */
  selectedTransport: string | null;
  /** Hub pages keep an unavailable on-site fact compact instead of reserving
   *  the full itemized cost card. Non-hub callers retain the existing UI. */
  compactUnavailableCost?: boolean;
  /** Planned travel date for ferry availability. */
  ferryTemporal?: FerryTemporalContext;
  /** Optional selected travel date for represented closed weekdays. */
  travelDate?: string;
  duration?: TripDuration;
  onSaveToItinerary: (plan?: DayPlan) => void;
  onPlanGenerated?: (plan: DayPlan | null) => void;
}

export function getPlannerTransportScopeNotice(
  locale: "en" | "ja",
  hasOrigin: boolean,
): string {
  if (locale === "ja") {
    return hasOrigin
      ? "計画時間には最初のスポットまでの移動時間を含みません。費用には出発地からの交通費が含まれます。"
      : "計画時間には最初のスポットまでの移動時間を含みません。出発地が未設定のため、出発地からの交通費は含まれません。";
  }
  return hasOrigin
    ? "Planning time excludes travel to the first stop. The cost summary includes origin transport when priced."
    : "Planning time excludes travel to the first stop. Origin transport is not included without a saved origin.";
}

export function DestinationPlanningSection({
  destination,
  locale,
  partySize,
  homeCoords,
  selectedTransport,
  compactUnavailableCost,
  ferryTemporal,
  travelDate,
  duration = "fullDay",
  onSaveToItinerary,
  onPlanGenerated,
}: DestinationPlanningSectionProps) {
  const [generatedPlan, setGeneratedPlanState] = useState<DayPlan | null>(null);
  const [activePartySize, setActivePartySize] = useState(partySize);

  useEffect(() => setActivePartySize(partySize), [partySize]);

  // KAI-121: eligibility REQUIRES the full catalogue (nearby candidates).
  // "Catalogue not loaded yet" must never be interpreted as "destination
  // is ineligible" — while pending, the widget mounts in a loading state;
  // eligibility is recomputed once the full catalogue arrives. On failure
  // the widget shows the explicit retryable error state.
  const {
    loading: catalogueLoading,
    error: catalogueError,
    retry: retryCatalogue,
  } = useFullCatalogue();

  const { halfDay, fullDay } = useMemo(() => {
    // When the full catalogue is pending or failed, we cannot compute a
    // truthful eligibility verdict. Report pending (eligible=false with
    // a pending flag) so the widget renders its loading/error UI instead
    // of being hidden as "ineligible".
    if (catalogueLoading || catalogueError) {
      return {
        halfDay: { eligible: false, pending: true },
        fullDay: { eligible: false, pending: true },
      };
    }
    return {
      halfDay: getPlanEligibility(destination, { planType: "half_day" }),
      fullDay: getPlanEligibility(destination, { planType: "full_day" }),
    };
  }, [destination, catalogueLoading, catalogueError]);

  const eligible = halfDay.eligible || fullDay.eligible;
  const fullDayDisabled = !fullDay.eligible;

  const setGeneratedPlan = (plan: DayPlan | null) => {
    setGeneratedPlanState(plan);
    if (onPlanGenerated) {
      onPlanGenerated(plan);
    }
  };

  const hasValidGeneratedPlan = Boolean(
    generatedPlan && !generatedPlan.isUnfeasible,
  );

  // Origin transport is priced once when a saved origin is available; local
  // transit remains a separate profile/fact and is never inferred from an
  // origin fare.
  const localTransitMode: "car" | "train" | null =
    selectedTransport === "car" || selectedTransport === "my_car"
      ? "car"
      : selectedTransport === "train" || selectedTransport === "shinkansen"
        ? "train"
        : null;
  const costBreakdown =
    hasValidGeneratedPlan && generatedPlan
      ? calculateGeneratedPlanCost(
          generatedPlan,
          activePartySize,
          localTransitMode,
          Boolean(homeCoords),
          homeCoords,
        )
      : undefined;

  return (
    <div className="space-y-3 pb-2 md:pb-0">
      {/* Unified Progressive Day Plan Generator */}
      <DayPlanWidget
        destination={destination}
        locale={locale}
        duration={duration}
        travelDate={travelDate}
        partySize={activePartySize}
        onPartySizeChange={setActivePartySize}
        eligible={eligible}
        catalogueLoading={catalogueLoading}
        catalogueError={catalogueError}
        onRetryCatalogue={retryCatalogue}
        defaultPlanType={fullDayDisabled ? "half_day" : undefined}
        fullDayDisabled={fullDayDisabled}
        onSaveToItinerary={() =>
          onSaveToItinerary(
            generatedPlan
              ? {
                  ...generatedPlan,
                  totalBudgetRange: costBreakdown?.totalRange,
                }
              : undefined,
          )
        }
        onPlanGenerated={(plan) => setGeneratedPlan(plan)}
      />

      <p
        data-testid="planner-transport-scope"
        className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-medium leading-relaxed text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300"
      >
        {getPlannerTransportScopeNotice(locale, Boolean(homeCoords))}
      </p>

      {/* Progressive Cost Breakdown */}
      <TripCostBreakdownWidget
        destination={destination}
        locale={locale}
        partySize={activePartySize}
        homeCoords={homeCoords}
        activeTransportMode={selectedTransport}
        compactUnavailableCost={compactUnavailableCost}
        ferryTemporal={ferryTemporal}
        duration={duration}
        hasGeneratedPlan={hasValidGeneratedPlan}
        planCostBreakdown={costBreakdown}
      />
    </div>
  );
}
