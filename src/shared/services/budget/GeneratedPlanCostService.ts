/**
 * Generated-plan cost adapter.
 *
 * KAI-260 keeps DayPlan's existing component-shaped API for the UI, but the
 * numbers now come from TripEstimateEngine. This module owns no competing
 * trip-cost arithmetic: it aggregates canonical on-site components and adds
 * explicitly curated inter-stop route legs where a plan has them.
 */

import type { Destination } from "@/shared/types/destination";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
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
  satisfied?: boolean;
  knownNumeric?: boolean;
  semanticState?:
    | "verified_free"
    | "not_applicable"
    | "paid"
    | "estimated"
    | "open_ended_or_variable"
    | "unknown";
}

export interface GeneratedPlanCostResult {
  originTransport: CostComponent;
  localTransit: CostComponent;
  admission: CostComponent;
  meals: CostComponent;
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
  };
}

function sumComponents(items: readonly CostComponent[]): CostComponent {
  const applicable = items.some((item) => item.applicable);
  const unknown = items.some((item) => item.applicable && !item.knownNumeric);
  if (!applicable) return NA;
  if (unknown) return unknownComponent();
  const estimated = items.some((item) => item.source === "estimated");
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
  };
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
): void {
  assumptions.push({
    type: "estimated_cost",
    destinationId: dest.id,
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
): GeneratedPlanCostResult {
  const safeParty = Math.max(1, Math.floor(partySize));
  const assumptions: PlanAssumption[] = [...(plan.assumptions ?? [])];
  const destinations = Array.from(
    new Map(
      plan.steps
        .filter(
          (step) =>
            step.type === "destination" &&
            step.destination &&
            step.destination.role !== "hub" &&
            step.destination.kind !== "city",
        )
        .map((step) => [step.destination!.id, step.destination!]),
    ).values(),
  );

  const estimates = destinations.map((dest) => {
    const result = calculateTripEstimate({
      dest,
      mode: transportMode ?? undefined,
      partySize: safeParty,
      tripMode: "day_trip",
      includeOriginTravel: false,
    });
    if (result.estimateQuality !== "verified")
      pushMissingAssumption(dest, assumptions);
    return result;
  });

  const admission = sumComponents(
    estimates.map((result) =>
      toPlanComponent(
        result.components.find((c) => c.evidence.scope === "admission")!,
      ),
    ),
  );
  const canonicalLocal = sumComponents(
    estimates.map((result) =>
      toPlanComponent(
        result.components.find((c) => c.evidence.scope === "local_transport")!,
      ),
    ),
  );
  const curatedLegs = (plan.routeLegs ?? []).map((leg) =>
    estimateLocalTransitFare(leg, transportMode, safeParty),
  );
  const localTransit = sumComponents([canonicalLocal, ...curatedLegs]);
  const meals = estimates.length
    ? toPlanComponent(
        estimates[0].components.find((c) => c.evidence.scope === "meals")!,
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
          tripMode: "day_trip",
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

  const components = [originTransport, localTransit, admission, meals];
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
