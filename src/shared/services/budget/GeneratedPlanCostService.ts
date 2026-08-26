import type { Destination } from "@/shared/types/destination";
import { hasDisplayableBudget } from "@/shared/services/budget/budgetState";
import type {
  DayPlan,
  PlanAssumption,
  RouteLeg,
} from "@/shared/services/recommendation/DayPlanGeneratorService";

export interface CostComponent {
  min: number;
  max: number;
  source: "curated" | "estimated" | "unknown";
  applicable: boolean;
}

export interface GeneratedPlanCostResult {
  originTransport: CostComponent;
  localTransit: CostComponent;
  admission: CostComponent;
  meals: CostComponent;
  parking: CostComponent;
  totalRange: [number, number];
  confidence: "verified" | "estimated";
  assumptions: PlanAssumption[];
}

export function estimateLocalTransitFare(
  leg: RouteLeg,
  transportMode: "car" | "train" | null = null,
): CostComponent {
  if (leg.curatedFare) {
    return {
      min: leg.curatedFare.min,
      max: leg.curatedFare.max,
      source: "curated",
      applicable: true,
    };
  }

  // null = local transit mode unknown: never default to Train fare
  // assumptions.
  if (transportMode === null) {
    return { min: 0, max: 0, source: "unknown", applicable: false };
  }

  if (transportMode === "car") {
    // Car tolls/gas per leg based on duration/distance
    const mins = Math.max(5, leg.durationMinutes);
    const estFare = Math.round((mins * 20) / 100) * 100;
    return {
      min: estFare,
      max: Math.round(estFare * 1.3),
      source: "estimated",
      applicable: true,
    };
  }

  const mins = Math.max(5, leg.durationMinutes);
  let fareMin = 210;
  if (mins <= 15) fareMin = 210;
  else if (mins <= 30) fareMin = 350;
  else if (mins <= 45) fareMin = 550;
  else fareMin = 880;

  return {
    min: fareMin,
    max: Math.round(fareMin * 1.2),
    source: "estimated",
    applicable: true,
  };
}

export function estimateOriginTransportFare(
  hasOriginInfo: boolean = false,
  originFareMin?: number,
  originFareMax?: number,
): CostComponent {
  if (!hasOriginInfo) {
    return { min: 0, max: 0, source: "unknown", applicable: false };
  }
  return {
    min: originFareMin ?? 1500,
    max: originFareMax ?? 3000,
    source: "curated",
    applicable: true,
  };
}

export function calculateGeneratedPlanCost(
  plan: DayPlan,
  partySize: number = 1,
  transportMode: "car" | "train" | null = null,
  hasOriginInfo: boolean = false,
): GeneratedPlanCostResult {
  const safeParty = Math.max(1, partySize);
  const assumptions: PlanAssumption[] = [];

  // 1. Admission Tickets (deduplicated by destination ID)
  const uniqueDestinationsMap = new Map<string, Destination>();
  plan.steps.forEach((step) => {
    if (
      step.type === "destination" &&
      step.destination &&
      step.destination.id &&
      step.destination.role !== "hub" &&
      step.destination.kind !== "city"
    ) {
      uniqueDestinationsMap.set(step.destination.id, step.destination);
    }
  });

  let totalAdmissionMin = 0;
  let totalAdmissionMax = 0;
  let hasMissingTickets = false;

  uniqueDestinationsMap.forEach((dest) => {
    // KAI-204 phase 3 + KAI-215 convergence: only TRUSTED provenance
    // (manual verified ticket or documented model output) may contribute
    // admission to a generated plan. Trust is read from the KAI-214
    // NORMALIZED semantic layer (hasDisplayableBudget), not rebuilt from
    // the raw legacy `method`. Absent-metadata legacy numbers and method
    // "unknown" records must not leak unverified ticket values into a
    // "curated" plan cost. Malformed explicit forward states (verified_paid
    // without provenance) also fail closed here.
    if (
      hasDisplayableBudget(dest) &&
      typeof dest.budgetBreakdown?.tickets === "number"
    ) {
      const ticketVal = dest.budgetBreakdown.tickets;
      totalAdmissionMin += ticketVal * safeParty;
      totalAdmissionMax += ticketVal * safeParty;
    } else {
      hasMissingTickets = true;
      assumptions.push({
        type: "estimated_cost",
        destinationId: dest.id,
        message: {
          en: `Ticket cost for ${dest.name} is excluded or unverified.`,
          ja: `${dest.nameJa || dest.name}の入場チケット料金は未確認のため含まれていません。`,
        },
      });
    }
  });

  const admissionComp: CostComponent = {
    min: totalAdmissionMin,
    max: totalAdmissionMax,
    source: hasMissingTickets ? "unknown" : "curated",
    applicable: true,
  };

  // 2. Local Transit (per leg)
  let totalTransitMin = 0;
  let totalTransitMax = 0;
  const legs = plan.routeLegs || [];
  const fareComponents = legs.map((leg) =>
    estimateLocalTransitFare(leg, transportMode),
  );
  fareComponents.forEach((est) => {
    totalTransitMin += est.min * safeParty;
    totalTransitMax += est.max * safeParty;
  });

  const localTransitComp: CostComponent = {
    min: totalTransitMin,
    max: totalTransitMax,
    source:
      fareComponents.length > 0 &&
      fareComponents.every((c) => c.source === "curated")
        ? "curated"
        : fareComponents.some((c) => c.applicable)
          ? "estimated"
          : "unknown",
    applicable: fareComponents.some((c) => c.applicable),
  };

  // 3. Origin Transport
  const originComp = estimateOriginTransportFare(hasOriginInfo);

  // 4. Meals (only if meal step exists)
  const mealSteps = plan.steps.filter((s) => s.type === "meal");
  const mealCostPerPersonMin = 1500;
  const mealCostPerPersonMax = 2500;
  const totalMealsMin = mealSteps.length * mealCostPerPersonMin * safeParty;
  const totalMealsMax = mealSteps.length * mealCostPerPersonMax * safeParty;
  const mealsComp: CostComponent = {
    min: totalMealsMin,
    max: totalMealsMax,
    source: mealSteps.length > 0 ? "estimated" : "unknown",
    applicable: mealSteps.length > 0,
  };

  // 5. Parking (only for car mode)
  const totalParkingMin = transportMode === "car" ? 1000 : 0;
  const totalParkingMax = transportMode === "car" ? 2000 : 0;
  const parkingComp: CostComponent = {
    min: totalParkingMin,
    max: totalParkingMax,
    source: transportMode === "car" ? "estimated" : "unknown",
    applicable: transportMode === "car",
  };

  // Deduplicate assumptions
  const seenMsg = new Set<string>();
  const deduplicatedAssumptions = assumptions.filter((a) => {
    const k = `${a.type}:${a.destinationId || ""}:${a.message.en}`;
    if (seenMsg.has(k)) return false;
    seenMsg.add(k);
    return true;
  });

  const applicableComponents = [
    originComp,
    localTransitComp,
    admissionComp,
    mealsComp,
    parkingComp,
  ].filter((c) => c.applicable);

  const grandTotalMin = applicableComponents.reduce((sum, c) => sum + c.min, 0);
  const grandTotalMax = applicableComponents.reduce((sum, c) => sum + c.max, 0);

  const computedConfidence: "estimated" | "verified" =
    applicableComponents.every((c) => c.source === "curated")
      ? "verified"
      : "estimated";

  return {
    originTransport: originComp,
    localTransit: localTransitComp,
    admission: admissionComp,
    meals: mealsComp,
    parking: parkingComp,
    totalRange: [grandTotalMin, grandTotalMax],
    confidence: computedConfidence,
    assumptions: deduplicatedAssumptions,
  };
}
