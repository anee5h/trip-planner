import type { DayPlan } from "../recommendation/DayPlanGeneratorService";

export interface PlanCostBreakdown {
  originTransport: number;
  localTransit: number;
  admission: number;
  meals: number;
  parking: number;
  totalRange: [number, number];
}

export function calculateGeneratedPlanCost(
  plan: DayPlan,
  partySize: number,
  transportMode: string,
): PlanCostBreakdown {
  const safeParty = Math.max(1, partySize || 1);
  const originTransport = 1500 * safeParty;
  let localTransit = 0;

  if (plan.routeLegs) {
    for (const leg of plan.routeLegs) {
      localTransit += Math.round(leg.durationMinutes * 15 * safeParty);
    }
  }

  let admission = 0;
  const processedIds = new Set<string>();

  for (const step of plan.steps) {
    if (step.destination && !processedIds.has(step.destination.id)) {
      processedIds.add(step.destination.id);
      admission += (step.destination.budgetMin ?? 0) * safeParty;
    }
  }

  const mealStepsCount = plan.steps.filter((s) => s.type === "meal").length;
  const meals = mealStepsCount * 1200 * safeParty;
  const parking =
    transportMode === "car" || transportMode === "my_car" ? 1000 : 0;

  const totalMin = originTransport + localTransit + admission + meals + parking;
  const totalMax = Math.round(totalMin * 1.3);

  return {
    originTransport,
    localTransit,
    admission,
    meals,
    parking,
    totalRange: [totalMin, totalMax],
  };
}
