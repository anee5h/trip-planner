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
   * KAI-219A final repair: required admission is FULLY SATISFIED (every
   * required destination satisfied — bounded curated / bounded estimated /
   * explicit not_applicable). INDEPENDENT of knownNumeric: an all-N/A
   * itinerary is satisfied=true with no numeric contribution; a mixed
   * partial (paid ¥1,500 + unavailable) is satisfied=false WITH a known
   * numeric subtotal.
   */
  satisfied?: boolean;
  /**
   * KAI-219A final repair: whether a KNOWN NUMERIC admission contribution
   * exists (bounded incl. verified_free [0,0]). Independent of satisfied.
   */
  knownNumeric?: boolean;
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

  // KAI-219A final repair: admission aggregation with TWO INDEPENDENT
  // axes per destination:
  //   - knownNumeric: does this destination contribute a KNOWN NUMERIC
  //     admission amount (bounded incl. verified_free [0,0])?
  //   - satisfied: is this destination's REQUIRED admission fully
  //     satisfied (bounded curated OR bounded estimated OR explicit
  //     not_applicable)? unavailable/open_ended/variable/malformed → NOT
  //     satisfied.
  // Aggregate: satisfied = EVERY required destination is satisfied;
  // knownNumeric = any destination contributes a numeric amount. A mixed
  // itinerary (A paid ¥1,500 + B unavailable) keeps the ¥1,500 in
  // knownSubtotal and stays partial.
  let totalAdmissionMin = 0;
  let totalAdmissionMax = 0;
  let anyKnownNumeric = false;
  let anyUnsatisfied = false;
  let allSatisfied = true;
  let hasEstimatedNumeric = false;
  let hasPaidNumeric = false;
  let hasFreeNumeric = false;
  let allNotApplicable = true;
  let anyNumericAtAll = false; // bounded numeric (paid/free/estimated)
  let destinationCount = 0;

  uniqueDestinationsMap.forEach((dest) => {
    destinationCount += 1;
    // KAI-219A review BLOCKER 3: an EXPLICIT v2 admission fact is
    // AUTHORITATIVE — the canonical fact is interpreted directly and the
    // OLD budgetMetadata trust gate (hasDisplayableBudget) is NOT consulted
    // for it. Absent fact → transitional KAI-214 legacy fallback.
    const fact = dest.admission;
    if (fact) {
      const validation = validateAdmissionFact(fact);
      if (!validation.valid) {
        // Malformed persisted fact → never numeric, never Free, NOT
        // satisfied.
        anyUnsatisfied = true;
        allSatisfied = false;
        allNotApplicable = false;
        pushMissingAssumption(dest, assumptions);
        return;
      }
      if (fact.cost.kind === "bounded") {
        const isModel = fact.state === "documented_estimate";
        totalAdmissionMin += fact.cost.min * safeParty;
        totalAdmissionMax += fact.cost.max * safeParty;
        anyKnownNumeric = true;
        anyNumericAtAll = true;
        allNotApplicable = false;
        // verified/source-backed bounded → curated; documented model
        // estimate → ESTIMATED (epistemically complete either way).
        if (isModel) hasEstimatedNumeric = true;
        else if (fact.state === "verified_free") hasFreeNumeric = true;
        else hasPaidNumeric = true;
        return;
      }
      if (fact.cost.kind === "not_applicable") {
        // Hub / no-single-admission-product: SATISFIED non-numeric
        // component (never a fake ¥0, never missing).
        return;
      }
      // open_ended / variable / unavailable → NOT satisfied → plan stays
      // partial → do NOT scalarize to a full ticket amount.
      anyUnsatisfied = true;
      allSatisfied = false;
      allNotApplicable = false;
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
      anyKnownNumeric = true;
      anyNumericAtAll = true;
      hasPaidNumeric = true;
      allNotApplicable = false;
    } else {
      anyUnsatisfied = true;
      allSatisfied = false;
      allNotApplicable = false;
      pushMissingAssumption(dest, assumptions);
    }
  });

  // Aggregate satisfaction: EVERY required destination satisfied (vacuously
  // true with zero destinations).
  const admissionSatisfied = destinationCount === 0 ? true : allSatisfied;
  const allApplicableFree =
    anyNumericAtAll &&
    !hasPaidNumeric &&
    !hasEstimatedNumeric &&
    hasFreeNumeric;

  // Aggregate semantic state (KAI-219A final repair Fix 3): NO single
  // free/N/A destination overrides the whole aggregate.
  //   - any paid/estimated numeric + any N/A → paid/estimated range (NOT
  //     not_applicable)
  //   - free + paid → paid range (NOT verified_free)
  //   - N/A + free only → verified_free
  //   - all N/A → not_applicable
  //   - any missing → partial/mixed (open_ended_or_variable display)
  //   - all applicable admission free → verified_free
  let aggregateSemantic: CostComponent["semanticState"];
  if (anyUnsatisfied) {
    aggregateSemantic = "open_ended_or_variable"; // partial/mixed
  } else if (allNotApplicable) {
    aggregateSemantic = "not_applicable";
  } else if (hasPaidNumeric || hasEstimatedNumeric) {
    aggregateSemantic = hasEstimatedNumeric ? "estimated" : "paid";
  } else if (allApplicableFree || hasFreeNumeric) {
    aggregateSemantic = "verified_free";
  } else {
    aggregateSemantic = "unknown";
  }

  const admissionComp: CostComponent = {
    min: totalAdmissionMin,
    max: totalAdmissionMax,
    source: anyUnsatisfied
      ? "unknown"
      : hasEstimatedNumeric
        ? "estimated"
        : "curated",
    // KAI-217B (Luna): unknown admission must not become an applicable
    // [0,0]. applicable = SATISFIED (every required destination) — the
    // known-numeric axis is carried by min/max + anyKnownNumeric, so a
    // mixed partial keeps its known subtotal.
    applicable: admissionSatisfied,
    // KAI-219A final repair: explicit satisfied field — the known-numeric
    // and satisfied concepts are independent.
    satisfied: admissionSatisfied,
    knownNumeric: anyKnownNumeric,
    semanticState: aggregateSemantic,
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

  // KAI-219A Fix 3 + final repair: a required component is SATISFIED by
  // bounded curated, bounded estimated, OR explicit not_applicable (all
  // epistemically complete). Confidence is SEPARATE: complete + any
  // estimated → confidence estimated; complete + all verified/curated →
  // confidence verified. Estimated is NOT partial.
  const routeConditionSatisfied =
    fareComponents.length === 0 ||
    (localTransitComp.applicable && localTransitComp.source === "curated");
  const allKnown = admissionSatisfied && routeConditionSatisfied;
  // knownSubtotal = components with a KNOWN NUMERIC contribution. A mixed
  // partial admission (paid ¥1,500 + unavailable) keeps its ¥1,500 here
  // even though admission is NOT satisfied/applicable (Fix GP2).
  const applicableComponents = [localTransitComp, admissionComp].filter((c) =>
    c === admissionComp ? c.knownNumeric === true : c.applicable,
  );
  // nothingKnown: NO epistemically-known component. A satisfied-but-
  // non-numeric admission (all N/A) is epistemically complete — the plan
  // is NOT "nothing known" (it is complete with no numeric claim).
  const nothingKnown =
    applicableComponents.length === 0 &&
    !admissionSatisfied &&
    !(localTransitComp.applicable && localTransitComp.source === "curated");

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
