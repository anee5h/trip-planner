import { useState } from "react";
import type { Destination } from "@/shared/types/destination";
import { DayPlanWidget } from "./DayPlanWidget";
import { TripCostBreakdownWidget } from "./TripCostBreakdownWidget";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "@/shared/services/budget/GeneratedPlanCostService";

interface DestinationPlanningSectionProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize: number;
  selectedTransport: string;
  onSaveToItinerary: (plan?: DayPlan) => void;
}

export function DestinationPlanningSection({
  destination,
  locale,
  partySize,
  selectedTransport,
  onSaveToItinerary,
}: DestinationPlanningSectionProps) {
  const [generatedPlan, setGeneratedPlan] = useState<DayPlan | null>(null);

  const hasValidGeneratedPlan = Boolean(
    generatedPlan && !generatedPlan.isUnfeasible,
  );

  const costBreakdown =
    hasValidGeneratedPlan && generatedPlan
      ? calculateGeneratedPlanCost(
          generatedPlan,
          partySize,
          selectedTransport === "car" ? "car" : "train",
        )
      : undefined;

  return (
    <div className="space-y-6">
      {/* Unified Progressive Day Plan Generator */}
      <DayPlanWidget
        destination={destination}
        locale={locale}
        partySize={partySize}
        onSaveToItinerary={() => onSaveToItinerary(generatedPlan || undefined)}
        onPlanGenerated={(plan) => setGeneratedPlan(plan)}
      />

      {/* Progressive Cost Breakdown */}
      <TripCostBreakdownWidget
        destination={destination}
        locale={locale}
        partySize={partySize}
        activeTransportMode={selectedTransport}
        hasGeneratedPlan={hasValidGeneratedPlan}
        planCostBreakdown={costBreakdown}
      />
    </div>
  );
}
