import { useEffect, useMemo, useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { DayPlanWidget } from "./DayPlanWidget";
import { TripCostBreakdownWidget } from "./TripCostBreakdownWidget";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { getPlanEligibility } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "@/shared/services/budget/GeneratedPlanCostService";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import { useFullCatalogue } from "@/shared/hooks/useFullCatalogue";

interface DestinationPlanningSectionProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize: number;
  /** null = no estimable origin route; origin transport stays unavailable. */
  selectedTransport: string | null;
  /** Planned travel date for ferry availability. */
  ferryTemporal?: FerryTemporalContext;
  accommodationAllowance?: number;
  /** KAI-217B round-2: the actual trip mode, threaded to the widget so
   *  2D1N includes the accommodation allowance × 1 night. */
  tripMode?: "day_trip" | "weekend_2d1n" | "multi_night";
  nights?: number;
  onSaveToItinerary: (plan?: DayPlan) => void;
  onPlanGenerated?: (plan: DayPlan | null) => void;
}

export function DestinationPlanningSection({
  destination,
  locale,
  partySize,
  selectedTransport,
  ferryTemporal,
  accommodationAllowance,
  tripMode,
  nights,
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

  // Origin transport mode and local transit mode are separate concerns.
  // Origin transport is never priced (hasOriginInfo is never set). Local
  // transit is only estimated when an actual on-site mode is known: a null
  // or flight/bus selection must not default to Train fare assumptions.
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
        )
      : undefined;

  return (
    <div className="space-y-6 pb-4 md:pb-0">
      {/* Unified Progressive Day Plan Generator */}
      <DayPlanWidget
        destination={destination}
        locale={locale}
        partySize={activePartySize}
        onPartySizeChange={setActivePartySize}
        generatedCostRange={costBreakdown?.totalRange}
        eligible={eligible}
        catalogueLoading={catalogueLoading}
        catalogueError={catalogueError}
        onRetryCatalogue={retryCatalogue}
        defaultPlanType={fullDayDisabled ? "half_day" : "full_day"}
        fullDayDisabled={fullDayDisabled}
        onSaveToItinerary={() =>
          onSaveToItinerary(
            generatedPlan
              ? {
                  ...generatedPlan,
                  totalBudgetRange:
                    costBreakdown?.totalRange ?? generatedPlan.totalBudgetRange,
                }
              : undefined,
          )
        }
        onPlanGenerated={(plan) => setGeneratedPlan(plan)}
      />

      {/* Progressive Cost Breakdown */}
      <TripCostBreakdownWidget
        destination={destination}
        locale={locale}
        partySize={activePartySize}
        activeTransportMode={selectedTransport}
        ferryTemporal={ferryTemporal}
        accommodationAllowance={accommodationAllowance}
        tripMode={tripMode}
        nights={nights}
        hasGeneratedPlan={hasValidGeneratedPlan}
        planCostBreakdown={costBreakdown}
      />
    </div>
  );
}
