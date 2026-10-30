/**
 * Generated-plan cost adapter.
 *
 * KAI-260 keeps DayPlan's existing component-shaped API for the UI, but the
 * numbers now come from TripEstimateEngine. This module owns no competing
 * trip-cost arithmetic: it aggregates canonical on-site components and adds
 * explicitly curated inter-stop route legs where a plan has them.
 */

import type {
  AdmissionPricingBasis,
  AdmissionPriceSelection,
  Destination,
} from "@/shared/types/destination";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import {
  selectionForPartySize,
  selectionWithPartyComposition,
  weakerAdmissionPricingBasis,
} from "@/shared/services/budget/admissionPricing";
import type {
  DayPlan,
  DayPlanStep,
  PlanAssumption,
  RouteLeg,
} from "@/shared/services/recommendation/DayPlanGeneratorService";
import { isValidCheckedAtDate } from "@/shared/services/budget/factValidation";

export interface CostComponent {
  min: number;
  max: number;
  source: "curated" | "estimated" | "unknown";
  applicable: boolean;
  satisfied?: boolean;
  knownNumeric?: boolean;
  semanticState?:
    | "verified_free"
    | "not_applicable"
    | "paid"
    | "estimated"
    | "open_ended_or_variable"
    | "unknown";
  admissionPricingBasis?: AdmissionPricingBasis;
  admissionCompositionAssumed?: boolean;
  admissionPriceOptionsBacked?: boolean;
  tollsExcluded?: boolean;
}

export interface GeneratedPlanCostResult {
  originTransport: CostComponent;
  localTransit: CostComponent;
  admission: CostComponent;
  meals: CostComponent;
  accommodation?: CostComponent;
  parking: CostComponent;
  completeness: "complete" | "partial" | "unavailable";
  knownSubtotal: [number, number];
  /** Full range when every applicable canonical component is bounded. */
  totalRange?: [number, number];
  hasNumericTotal: boolean;
  confidence: "verified" | "estimated";
  /** Canonical evidence quality, exposed alongside the legacy confidence name. */
  estimateQuality: "verified" | "estimated";
  assumptions: PlanAssumption[];
}

export interface GeneratedPlanCostContext {
  /** Live planner date; step.day is added for each stop. */
  travelDate?: string;
  admissionSelection?: AdmissionPriceSelection;
}

const NA: CostComponent = {
  min: 0,
  max: 0,
  source: "unknown",
  applicable: false,
  satisfied: true,
  knownNumeric: false,
  semanticState: "not_applicable",
};

function unknownComponent(): CostComponent {
  return {
    min: 0,
    max: 0,
    source: "unknown",
    applicable: true,
    satisfied: false,
    knownNumeric: false,
    semanticState: "unknown",
  };
}

function toPlanComponent(
  component: ReturnType<typeof calculateTripEstimate>["components"][number],
): CostComponent {
  if (component.cost.kind === "not_applicable") return NA;
  if (component.cost.kind !== "bounded") return unknownComponent();
  const estimated = component.evidence.derivation !== "source_fact";
  const semanticState =
    component.evidence.state === "verified_free"
      ? "verified_free"
      : estimated
        ? "estimated"
        : "paid";
  return {
    min: component.cost.min,
    max: component.cost.max,
    source: estimated ? "estimated" : "curated",
    applicable: true,
    satisfied: true,
    knownNumeric: true,
    semanticState,
    ...(component.evidence.admissionPricingBasis
      ? { admissionPricingBasis: component.evidence.admissionPricingBasis }
      : {}),
    ...(component.evidence.admissionCompositionAssumed
      ? { admissionCompositionAssumed: true }
      : {}),
    ...(component.evidence.admissionPriceOptionsBacked
      ? { admissionPriceOptionsBacked: true }
      : {}),
    ...(component.evidence.tollsExcluded ? { tollsExcluded: true } : {}),
  };
}

function sumComponents(
  items: readonly CostComponent[],
  includeAdmissionEvidence = false,
): CostComponent {
  const applicable = items.some((item) => item.applicable);
  const unknown = items.some((item) => item.applicable && !item.knownNumeric);
  if (!applicable) return NA;
  if (unknown) return unknownComponent();
  const paidItems = items.filter(
    (item) => item.applicable && item.semanticState !== "verified_free",
  );
  const missingAdmissionBasis =
    includeAdmissionEvidence &&
    paidItems.some(
      (item) =>
        item.admissionPriceOptionsBacked &&
        item.admissionPricingBasis === undefined,
    );
  const estimated =
    items.some((item) => item.source === "estimated") || missingAdmissionBasis;
  const admissionPricingBasis =
    includeAdmissionEvidence && !estimated
      ? paidItems.reduce<AdmissionPricingBasis | undefined>(
          (weakest, item) =>
            weakerAdmissionPricingBasis(weakest, item.admissionPricingBasis),
          undefined,
        )
      : undefined;
  const admissionCompositionAssumed =
    includeAdmissionEvidence &&
    items.some((item) => item.applicable && item.admissionCompositionAssumed);
  const min = items.reduce(
    (sum, item) => sum + (item.applicable ? item.min : 0),
    0,
  );
  const max = items.reduce(
    (sum, item) => sum + (item.applicable ? item.max : 0),
    0,
  );
  const allFree = items
    .filter((item) => item.applicable)
    .every((item) => item.semanticState === "verified_free");
  return {
    min,
    max,
    source: estimated ? "estimated" : "curated",
    applicable: true,
    satisfied: true,
    knownNumeric: true,
    semanticState:
      allFree && min === 0 && max === 0
        ? "verified_free"
        : estimated
          ? "estimated"
          : "paid",
    ...(admissionPricingBasis ? { admissionPricingBasis } : {}),
    ...(admissionCompositionAssumed
      ? { admissionCompositionAssumed: true }
      : {}),
  };
}

export function visitDateForStep(
  planDate: string | undefined,
  step: Pick<DayPlanStep, "day">,
): string | undefined {
  if (planDate === undefined || !isValidCheckedAtDate(planDate)) {
    return planDate;
  }
  const day = step.day ?? 1;
  if (!Number.isInteger(day) || day < 1) return "";
  const date = new Date(planDate + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

/** Curated route-leg extraction retained as an explicit override primitive. */
export function estimateLocalTransitFare(
  leg: RouteLeg,
  _transportMode: "car" | "train" | null = null,
  partySize = 1,
): CostComponent {
  if (leg.curatedFare) {
    return {
      min: leg.curatedFare.min * Math.max(1, Math.floor(partySize)),
      max: leg.curatedFare.max * Math.max(1, Math.floor(partySize)),
      source: "curated",
      applicable: true,
      satisfied: true,
      knownNumeric: true,
      semanticState: "paid",
    };
  }
  return NA;
}

/** Origin travel is supplied by the main destination estimate when context exists. */
export function estimateOriginTransportFare(): CostComponent {
  return NA;
}

function pushMissingAssumption(
  dest: Destination,
  assumptions: PlanAssumption[],
  costScope?: "admission",
): void {
  assumptions.push({
    type: "estimated_cost",
    destinationId: dest.id,
    ...(costScope ? { costScope } : {}),
    message: {
      en: `Some cost inputs for ${dest.name} use a rough planning estimate.`,
      ja: `${dest.nameJa || dest.name}の一部費用は概算です。`,
    },
  });
}

export function calculateGeneratedPlanCost(
  plan: DayPlan,
  partySize: number = 1,
  transportMode: "car" | "train" | null = null,
  hasOriginInfo = false,
  homeCoords?: { lat: number; lng: number },
  costContext?: GeneratedPlanCostContext,
): GeneratedPlanCostResult {
  const safeParty = Math.max(1, Math.floor(partySize));
  const assumptions: PlanAssumption[] = [...(plan.assumptions ?? [])];
  const selectedVisits = new Map<
    string,
    {
      destination: Destination;
      day: number | undefined;
    }
  >();
  for (const step of plan.steps) {
    if (
      step.type !== "destination" ||
      !step.destination ||
      step.destination.role === "hub" ||
      step.destination.kind === "city"
    ) {
      continue;
    }
    const visitKey = step.destination.admission?.priceOptions?.length
      ? [step.destination.id, step.day ?? 1].join("\u0000")
      : step.destination.id;
    if (selectedVisits.has(visitKey)) continue;
    selectedVisits.set(visitKey, {
      destination: step.destination,
      day: step.day,
    });
  }
  const visits = Array.from(selectedVisits.values());

  const duration = plan.duration ?? "fullDay";
  const hasLiveAdmissionSelection =
    costContext !== undefined &&
    Object.prototype.hasOwnProperty.call(costContext, "admissionSelection");
  const estimates = visits.map(({ destination, day }) => {
    const selection = costContext
      ? costContext.admissionSelection
      : plan.admissionSelection;
    const contextSelection = selectionForPartySize(
      costContext?.admissionSelection,
      safeParty,
    );
    const liveChildCount =
      contextSelection?.adultCount !== undefined &&
      contextSelection.childCount !== undefined
        ? contextSelection.childCount
        : null;
    const effectiveSelection = hasLiveAdmissionSelection
      ? selectionWithPartyComposition(selection, safeParty, liveChildCount)
      : selectionForPartySize(selection, safeParty);
    const result = calculateTripEstimate({
      dest: destination,
      mode: transportMode ?? undefined,
      partySize: safeParty,
      duration,
      visitDate: visitDateForStep(
        costContext ? costContext.travelDate : plan.travelDate,
        { day },
      ),
      admissionSelection: effectiveSelection,
      includeOriginTravel: false,
    });
    if (result.estimateQuality !== "verified") {
      const hasTicketOptions = Boolean(
        destination.admission?.priceOptions?.length,
      );
      const hasAdmissionAssumption = assumptions.some(
        (assumption) =>
          assumption.type === "estimated_cost" &&
          assumption.destinationId === destination.id &&
          assumption.costScope === "admission",
      );
      if (!hasTicketOptions || !hasAdmissionAssumption) {
        pushMissingAssumption(
          destination,
          assumptions,
          hasTicketOptions ? "admission" : undefined,
        );
      }
    }
    return result;
  });
  const uniqueEstimatesByDestination = new Map<
    string,
    (typeof estimates)[number]
  >();
  visits.forEach(({ destination }, index) => {
    if (!uniqueEstimatesByDestination.has(destination.id)) {
      uniqueEstimatesByDestination.set(destination.id, estimates[index]);
    }
  });
  const uniqueEstimates = Array.from(uniqueEstimatesByDestination.values());

  const admission = sumComponents(
    estimates.map((result) =>
      toPlanComponent(
        result.components.find((c) => c.evidence.scope === "admission")!,
      ),
    ),
    true,
  );
  const canonicalLocal = sumComponents(
    uniqueEstimates.map((result) =>
      toPlanComponent(
        result.components.find((c) => c.evidence.scope === "local_transport")!,
      ),
    ),
  );
  const curatedLegs = (plan.routeLegs ?? []).map((leg) =>
    estimateLocalTransitFare(leg, transportMode, safeParty),
  );
  const localTransit = sumComponents([canonicalLocal, ...curatedLegs]);
  const meals = uniqueEstimates.length
    ? toPlanComponent(
        uniqueEstimates[0].components.find(
          (c) => c.evidence.scope === "meals",
        )!,
      )
    : NA;
  // Accommodation is a plan-level component: estimate it once for the
  // selected duration, never once per destination stop.
  const accommodation = uniqueEstimates.length
    ? toPlanComponent(
        uniqueEstimates[0].components.find(
          (c) => c.evidence.scope === "accommodation",
        )!,
      )
    : NA;
  const anchorDestination = plan.steps.find(
    (step) => step.type === "destination" && step.destination,
  )?.destination;
  const originEstimate =
    homeCoords && anchorDestination
      ? calculateTripEstimate({
          dest: anchorDestination,
          mode: transportMode ?? undefined,
          partySize: safeParty,
          homeCoords,
          includeOriginTravel: true,
          duration,
        })
      : undefined;
  const originTransport = originEstimate
    ? toPlanComponent(
        originEstimate.components.find(
          (component) => component.evidence.scope === "origin_travel",
        )!,
      )
    : hasOriginInfo
      ? unknownComponent()
      : NA;
  if (hasOriginInfo && !originEstimate) {
    assumptions.push({
      type: "estimated_cost",
      message: {
        en: "Origin transport needs the selected home origin to estimate.",
        ja: "出発地を選択すると出発地からの交通費を概算できます。",
      },
    });
  }

  const components = [
    originTransport,
    localTransit,
    admission,
    meals,
    accommodation,
  ];
  const applicable = components.filter((component) => component.applicable);
  const allNumeric =
    applicable.length > 0 &&
    applicable.every((component) => component.knownNumeric);
  const hasNumeric = applicable.some((component) => component.knownNumeric);
  const knownSubtotal = applicable.reduce<[number, number]>(
    (sum, component) => [
      sum[0] + (component.knownNumeric ? component.min : 0),
      sum[1] + (component.knownNumeric ? component.max : 0),
    ],
    [0, 0],
  );
  const anyEstimated = components.some(
    (component) => component.source === "estimated",
  );

  return {
    originTransport,
    localTransit,
    admission,
    meals,
    accommodation,
    parking: NA,
    completeness: allNumeric
      ? "complete"
      : hasNumeric
        ? "partial"
        : "unavailable",
    knownSubtotal,
    ...(allNumeric && hasNumeric ? { totalRange: knownSubtotal } : {}),
    hasNumericTotal: allNumeric && hasNumeric,
    confidence: anyEstimated ? "estimated" : "verified",
    estimateQuality: anyEstimated ? "estimated" : "verified",
    assumptions,
  };
}
