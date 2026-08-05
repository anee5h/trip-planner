import { useEffect, useMemo, useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { DayPlanWidget } from "./DayPlanWidget";
import { TripCostBreakdownWidget } from "./TripCostBreakdownWidget";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { getPlanEligibility } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "@/shared/services/budget/GeneratedPlanCostService";

interface DestinationPlanningSectionProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize: number;
  /** null = no estimable origin route; origin transport stays unavailable. */
  selectedTransport: string | null;
  onSaveToItinerary: (plan?: DayPlan) => void;
  onPlanGenerated?: (plan: DayPlan | null) => void;
}

export function DestinationPlanningSection({
  destination,
  locale,
  partySize,
  selectedTransport,
  onSaveToItinerary,
  onPlanGenerated,
}: DestinationPlanningSectionProps) {
  const [generatedPlan, setGeneratedPlanState] = useState<DayPlan | null>(null);
  const [activePartySize, setActivePartySize] = useState(partySize);

  useEffect(() => setActivePartySize(partySize), [partySize]);

  const { halfDay, fullDay } = useMemo(
    () => ({
      halfDay: getPlanEligibility(destination, { planType: "half_day" }),
      fullDay: getPlanEligibility(destination, { planType: "full_day" }),
    }),
    [destination],
  );

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

  // Local transit on-site may still be estimated, but nothing converts a
  // null (no origin route) or "all" selection into an origin Train cost:
  // calculateGeneratedPlanCost only prices origin transport when
  // hasOriginInfo is true, which is never set here.
  const localTransitMode: "car" | "train" =
    selectedTransport === "car" || selectedTransport === "my_car"
      ? "car"
      : "train";
  const costBreakdown =
    hasValidGeneratedPlan && generatedPlan
      ? calculateGeneratedPlanCost(
          generatedPlan,
          activePartySize,
          localTransitMode,
        )
      : undefined;

  return (
    <div className="space-y-6">
      {/* Unified Progressive Day Plan Generator */}
      <DayPlanWidget
        destination={destination}
        locale={locale}
        partySize={activePartySize}
        onPartySizeChange={setActivePartySize}
        generatedCostRange={costBreakdown?.totalRange}
        eligible={eligible}
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
        hasGeneratedPlan={hasValidGeneratedPlan}
        planCostBreakdown={costBreakdown}
      />
    </div>
  );
}
