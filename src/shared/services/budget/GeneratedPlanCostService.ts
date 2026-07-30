import type { DayPlan } from "../recommendation/DayPlanGeneratorService";

export interface PlanCostBreakdown {
  originTransport: number;
  localTransit: number;
  admission: number;
  meals: number;
  parking: number;
  totalRange: [number, number];
  confidence: "high" | "estimated";
}

export function calculateGeneratedPlanCost(
  plan: DayPlan,
  partySize: number = 1,
  selectedTransport: "train" | "car" = "train",
): PlanCostBreakdown {
  const safeParty = Math.max(1, partySize);

  let localTransit = 0;
  let admissionMin = 0;
  let admissionMax = 0;
  let mealsMin = 0;
  let mealsMax = 0;
  let parkingCost = 0;
  let hasEstimatedTransitLegs = false;

  // 1. Calculate local transit from route legs
  if (plan.routeLegs) {
    plan.routeLegs.forEach((leg) => {
      // 15 JPY per transit minute per person
      localTransit += leg.durationMinutes * 15 * safeParty;
      if (leg.confidence === "estimated") {
        hasEstimatedTransitLegs = true;
      }
    });
  }

  // 2. Calculate admission & meals from plan steps
  plan.steps.forEach((step) => {
    if (step.destination) {
      const bMin = step.destination.budgetMin ?? 0;
      const bMax = step.destination.budgetMax ?? bMin;
      admissionMin += bMin * safeParty;
      admissionMax += bMax * safeParty;
    } else if (step.type === "meal") {
      mealsMin += 1200 * safeParty;
      mealsMax += 2500 * safeParty;
    }
  });

  // 3. Parking cost for car mode
  if (selectedTransport === "car") {
    parkingCost = 1000;
  }

  // 4. Origin transport (base regional transit estimate)
  const originTransport = 1500 * safeParty;

  const totalMin =
    originTransport + localTransit + admissionMin + mealsMin + parkingCost;
  const totalMax =
    originTransport + localTransit + admissionMax + mealsMax + parkingCost;

  const confidence =
    hasEstimatedTransitLegs || plan.steps.some((s) => s.hasUncertainHours)
      ? "estimated"
      : "high";

  return {
    originTransport,
    localTransit,
    admission: admissionMin,
    meals: mealsMin,
    parking: parkingCost,
    totalRange: [totalMin, totalMax],
    confidence,
  };
}
