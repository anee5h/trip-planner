/**
 * GeneratedPlanCostService — KAI-217B: itinerary-input extraction only.
 *
 * KAI-217B removes the contradictory canonical arithmetic this service used
 * to own (meals 1500-2500/step, parking 1000-2000, origin 1500/3000
 * fallback, duration-based transit bands — all fabricated, all excluded
 * from canonical affordability).
 *
 * What remains is EXTRACTION ONLY, aligned with the canonical TripCostEngine
 * (tripCostEngine.ts):
 *
 *   - admission:   trusted per-person tickets (KAI-214 gate) × party
 *                  (identical to the engine's admissionComponent);
 *   - localTransit: ONLY curated leg fares (routeLegs[].curatedFare) ×
 *                  party — no duration bands, no car mins×20 heuristic;
 *   - meals/parking/origin-fallback: REMOVED. The result's meals/parking
 *                  components are always non-applicable (never fabricated).
 *
 * The canonical total = admission + curated local transit. Anything missing
 * stays unknown (never ¥0). Consumers that need the full canonical trip cost
 * (origin travel + accommodation) must call calculateTripCost (the engine),
 * which owns the arithmetic.
 */

import type { Destination } from "@/shared/types/destination";
import { hasDisplayableBudget } from "@/shared/services/budget/budgetState";
import { getEffectiveBudgetBreakdown } from "@/shared/services/budget/BudgetService";
import { validateAdmissionFact } from "@/shared/services/budget/factValidation";
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
  /**
   * KAI-219A contract (Fix 3): optional semantic state carried through the
   * generated-plan result so consumers (widget) can distinguish
   * verified_free → Free, not_applicable → Not applicable / 対象外,
   * paid/estimated bounded → range, unknown/open-ended/variable → partial.
   * N/A must NEVER render as a fake ¥0 admission.
   */
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
  /**
   * KAI-217B round-3: explicit completeness. "complete" ONLY when the
   * admission fact AND every required route leg are curated; "partial"
   * when some known + some unknown; "unavailable" when nothing is known.
   * Never claim a full plan total on partial evidence.
   */
  completeness: "complete" | "partial" | "unavailable";
  /** The known-subtotal (curated components only) — NOT a full plan total. */
  knownSubtotal: [number, number];
  confidence: "verified" | "estimated";
  assumptions: PlanAssumption[];
}

/**
 * KAI-217B: local transit extraction — CURATED leg fares only. A leg with
 * no curated fare contributes nothing (unknown, not applicable) and is
 * NEVER replaced by a duration band or a car mins×20 heuristic.
 */
export function estimateLocalTransitFare(
  leg: RouteLeg,
  _transportMode: "car" | "train" | null = null,
): CostComponent {
  if (leg.curatedFare) {
    return {
      min: leg.curatedFare.min,
      max: leg.curatedFare.max,
      source: "curated",
      applicable: true,
    };
  }
  return { min: 0, max: 0, source: "unknown", applicable: false };
}

/**
 * KAI-217B: origin transport extraction — REMOVED. The origin fare is owned
 * by the canonical engine (getCanonicalTransportCost); this service never
 * fabricates a 1500/3000 fallback.
 */
export function estimateOriginTransportFare(): CostComponent {
  return { min: 0, max: 0, source: "unknown", applicable: false };
}

/** KAI-219A: shared missing-ticket assumption (deduplicated helper). */
function pushMissingAssumption(
  dest: Destination,
  assumptions: PlanAssumption[],
): void {
  assumptions.push({
    type: "estimated_cost",
    destinationId: dest.id,
    message: {
      en: `Ticket cost for ${dest.name} is excluded or unverified.`,
      ja: `${dest.nameJa || dest.name}の入場チケット料金は未確認のため含まれていません。`,
    },
  });
}

export function calculateGeneratedPlanCost(
  plan: DayPlan,
  partySize: number = 1,
  _transportMode: "car" | "train" | null = null,
  _hasOriginInfo: boolean = false,
): GeneratedPlanCostResult {
  const safeParty = Math.max(1, Math.floor(partySize));
  const assumptions: PlanAssumption[] = [];

  // 1. Admission Tickets (deduplicated by destination ID) — canonical,
  //    trusted-provenance only (identical to the engine's admission rule).
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
  let hasEstimatedTickets = false;
  let hasVerifiedFreeAdmission = false;
  let hasNotApplicableAdmission = false;

  uniqueDestinationsMap.forEach((dest) => {
    // KAI-219A review BLOCKER 3: an EXPLICIT v2 admission fact is
    // AUTHORITATIVE — the canonical fact is interpreted directly and the
    // OLD budgetMetadata trust gate (hasDisplayableBudget) is NOT consulted
    // for it. Absent fact → transitional KAI-214 legacy fallback.
    const fact = dest.admission;
    if (fact) {
      const validation = validateAdmissionFact(fact);
      if (!validation.valid) {
        // Malformed persisted fact → never numeric, never Free.
        hasMissingTickets = true;
        pushMissingAssumption(dest, assumptions);
        return;
      }
      if (fact.cost.kind === "bounded") {
        const isModel = fact.state === "documented_estimate";
        totalAdmissionMin += fact.cost.min * safeParty;
        totalAdmissionMax += fact.cost.max * safeParty;
        // verified/source-backed bounded → curated; documented model
        // estimate → ESTIMATED, NOT curated (epistemically complete either
        // way — KAI-219A Fix 3).
        if (isModel) hasEstimatedTickets = true;
        if (fact.state === "verified_free") hasVerifiedFreeAdmission = true;
        return;
      }
      if (fact.cost.kind === "not_applicable") {
        // Hub / no-single-admission-product: a SATISFIED non-numeric
        // component (KAI-219A Fix 3: N/A is complete for that component,
        // never a missing component, never a fake ¥0).
        hasNotApplicableAdmission = true;
        return;
      }
      // open_ended / variable / unavailable → generated plan stays
      // partial → do NOT scalarize to a full ticket amount.
      hasMissingTickets = true;
      pushMissingAssumption(dest, assumptions);
      return;
    }
    // Transitional legacy fallback (no explicit fact): the OLD trust gate
    // + projection may still serve a trusted legacy ticket for unmigrated
    // records — but only through the shared projection (never a direct
    // budgetBreakdown.tickets read).
    const effectiveBreakdown = getEffectiveBudgetBreakdown(dest);
    if (
      hasDisplayableBudget(dest) &&
      effectiveBreakdown &&
      typeof effectiveBreakdown.tickets === "number"
    ) {
      const ticketVal = effectiveBreakdown.tickets;
      totalAdmissionMin += ticketVal * safeParty;
      totalAdmissionMax += ticketVal * safeParty;
    } else {
      hasMissingTickets = true;
      pushMissingAssumption(dest, assumptions);
    }
  });

  // KAI-219A Fix 3: semantic state for the admission component — so the
  // widget renders Free / Not applicable / range / partial honestly and
  // N/A never appears as a fake ¥0. not_applicable is a SATISFIED
  // non-numeric component (never missing).
  const admissionComp: CostComponent = {
    min: totalAdmissionMin,
    max: totalAdmissionMax,
    source: hasMissingTickets
      ? "unknown"
      : hasEstimatedTickets
        ? "estimated"
        : "curated",
    // KAI-217B (Luna): unknown admission is NOT applicable — a missing/
    // unverified ticket value must not become an applicable [0,0] that
    // inflates the numeric plan total with a fabricated ¥0. A
    // not_applicable admission is satisfied without contributing ¥0.
    applicable: hasNotApplicableAdmission ? true : !hasMissingTickets,
    semanticState: hasMissingTickets
      ? "open_ended_or_variable"
      : hasNotApplicableAdmission
        ? "not_applicable"
        : hasVerifiedFreeAdmission
          ? "verified_free"
          : hasEstimatedTickets
            ? "estimated"
            : "paid",
  };

  // 2. Local Transit (per leg) — curated fares only.
  let totalTransitMin = 0;
  let totalTransitMax = 0;
  const legs = plan.routeLegs || [];
  const fareComponents = legs.map((leg) => estimateLocalTransitFare(leg));
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
    // KAI-217B repair: applicable ONLY when EVERY leg is curated. A plan
    // with some curated legs + some unknown legs must NOT produce a numeric
    // total that silently omits the unknown legs — that would claim a
    // complete plan cost on partial evidence. Missing-leg semantics: any
    // unknown leg makes the component non-applicable (no strict cost claim).
    applicable:
      fareComponents.length > 0 &&
      fareComponents.every((c) => c.applicable && c.source === "curated"),
  };

  // 3-5. Origin / meals / parking — REMOVED (never fabricated).
  const originComp: CostComponent = estimateOriginTransportFare();
  const mealsComp: CostComponent = {
    min: 0,
    max: 0,
    source: "unknown",
    applicable: false,
  };
  const parkingComp: CostComponent = {
    min: 0,
    max: 0,
    source: "unknown",
    applicable: false,
  };

  // Deduplicate assumptions
  const seenMsg = new Set<string>();
  const deduplicatedAssumptions = assumptions.filter((a) => {
    const k = `${a.type}:${a.destinationId || ""}:${a.message.en}`;
    if (seenMsg.has(k)) return false;
    seenMsg.add(k);
    return true;
  });

  // KAI-219A Fix 3: a required component is SATISFIED by bounded curated,
  // bounded estimated, OR explicit not_applicable (all epistemically
  // complete for that component). Confidence is SEPARATE: complete + any
  // estimated → confidence estimated; complete + all verified/curated →
  // confidence verified. Estimated is NOT partial.
  const admissionSatisfied =
    !hasMissingTickets || (hasNotApplicableAdmission && !hasMissingTickets);
  const routeConditionSatisfied =
    fareComponents.length === 0 ||
    (localTransitComp.applicable && localTransitComp.source === "curated");
  const allKnown = admissionSatisfied && routeConditionSatisfied;
  // knownSubtotal = the APPLICABLE (known, non-N/A) components only.
  const applicableComponents = [localTransitComp, admissionComp].filter(
    (c) => c.applicable,
  );
  const nothingKnown = applicableComponents.length === 0;

  const knownSubtotalMin = applicableComponents.reduce(
    (sum, c) => sum + c.min,
    0,
  );
  const knownSubtotalMax = applicableComponents.reduce(
    (sum, c) => sum + c.max,
    0,
  );

  const hasAnyEstimatedComponent =
    admissionComp.source === "estimated" ||
    localTransitComp.source === "estimated";
  const computedConfidence: "estimated" | "verified" = allKnown
    ? hasAnyEstimatedComponent
      ? "estimated"
      : "verified"
    : "estimated";

  return {
    originTransport: originComp,
    localTransit: localTransitComp,
    admission: admissionComp,
    meals: mealsComp,
    parking: parkingComp,
    // KAI-217B round-3: totalRange REMOVED entirely — consumers must use
    // completeness + knownSubtotal; a partial plan renders honestly as
    // partial, never as a numeric total.
    completeness: nothingKnown
      ? ("unavailable" as const)
      : allKnown
        ? ("complete" as const)
        : ("partial" as const),
    knownSubtotal: [knownSubtotalMin, knownSubtotalMax] as [number, number],
    confidence: computedConfidence,
    assumptions: deduplicatedAssumptions,
  };
}
