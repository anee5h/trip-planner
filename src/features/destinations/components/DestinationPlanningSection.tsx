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
  /** Hub pages keep an unavailable on-site fact compact instead of reserving
   *  the full itemized cost card. Non-hub callers retain the existing UI. */
  compactUnavailableCost?: boolean;
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
  compactUnavailableCost,
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

  // KAI-217B round-3 + KAI-219A final N/A guard: the generated-plan cost
  // feeds are COMPLETE-ONLY **AND** require a numeric cost claim. A
  // partial/unavailable plan must NOT present [0,0] or a partial subtotal
  // as the plan's cost range; an all-N/A complete plan is epistemically
  // complete but has NO numeric total (N/A ≠ verified ¥0) → undefined.
  const completePlanCostRange: [number, number] | undefined =
    costBreakdown?.completeness === "complete" &&
    costBreakdown.hasNumericTotal === true
      ? costBreakdown.knownSubtotal
      : undefined;

  return (
    <div className="space-y-6 pb-4 md:pb-0">
      {/* Unified Progressive Day Plan Generator */}
      <DayPlanWidget
        destination={destination}
        locale={locale}
        partySize={activePartySize}
        onPartySizeChange={setActivePartySize}
        generatedCostRange={completePlanCostRange}
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
                  // KAI-217B round-4: a saved plan carries a numeric total
                  // ONLY when the CURRENT extraction is complete. NEVER
                  // fall back to generatedPlan.totalBudgetRange for a known
                  // partial costBreakdown (a stale complete range would
                  // survive on a partial plan).
                  // KAI-219A final N/A guard: an all-N/A complete plan has
                  // NO numeric cost claim (hasNumericTotal=false) → saved
                  // totalBudgetRange undefined (N/A ≠ verified ¥0).
                  totalBudgetRange:
                    costBreakdown?.completeness === "complete" &&
                    costBreakdown.hasNumericTotal === true
                      ? costBreakdown.knownSubtotal
                      : undefined,
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
        compactUnavailableCost={compactUnavailableCost}
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
