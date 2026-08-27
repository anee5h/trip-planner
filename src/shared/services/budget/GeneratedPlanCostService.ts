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
  /**
   * KAI-217B round-2: explicit completeness. "complete" ONLY when every
   * applicable component is curated; "partial" when some known + some
   * unknown; "unavailable" when nothing is known. Never claim a full plan
   * total on partial evidence.
   */
  completeness: "complete" | "partial" | "unavailable";
  /** The known-subtotal (curated components only) — NOT a full plan total. */
  knownSubtotal: [number, number];
  /** DEPRECATED: [0,0] unless complete — use completeness + knownSubtotal. */
  totalRange: [number, number];
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

  uniqueDestinationsMap.forEach((dest) => {
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
    // KAI-217B (Luna): unknown admission is NOT applicable — a missing/
    // unverified ticket value must not become an applicable [0,0] that
    // inflates the numeric plan total with a fabricated ¥0.
    applicable: !hasMissingTickets,
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

  // KAI-217B round-2: this service is EXTRACTION-ONLY — it must not own a
  // second canonical total. It exposes explicit COMPLETENESS + a
  // KNOWN-SUBTOTAL:
  //   - admission known + unknown route leg(s) → completeness "partial",
  //     knownSubtotal = curated legs + admission (never presented as a
  //     full plan total).
  //   - admission unknown → admission is not applicable; if local transit
  //     is also not fully curated, completeness is "partial" (or
  //     "unavailable" when NO component is applicable).
  const applicableComponents = [localTransitComp, admissionComp].filter(
    (c) => c.applicable,
  );
  const allKnown =
    applicableComponents.length > 0 &&
    applicableComponents.every((c) => c.source === "curated" && c.applicable);
  const nothingKnown = applicableComponents.length === 0;

  const knownSubtotalMin = applicableComponents.reduce(
    (sum, c) => sum + c.min,
    0,
  );
  const knownSubtotalMax = applicableComponents.reduce(
    (sum, c) => sum + c.max,
    0,
  );

  const computedConfidence: "estimated" | "verified" = allKnown
    ? "verified"
    : "estimated";

  return {
    originTransport: originComp,
    localTransit: localTransitComp,
    admission: admissionComp,
    meals: mealsComp,
    parking: parkingComp,
    // KAI-217B round-2: NEVER a misleading full-plan totalRange. Expose
    // completeness + knownSubtotal; consumers render "partial/unavailable"
    // honestly instead of a numeric claim on incomplete evidence.
    completeness: nothingKnown
      ? ("unavailable" as const)
      : allKnown
        ? ("complete" as const)
        : ("partial" as const),
    knownSubtotal: [knownSubtotalMin, knownSubtotalMax] as [number, number],
    totalRange: allKnown
      ? ([knownSubtotalMin, knownSubtotalMax] as [number, number])
      : [0, 0],
    confidence: computedConfidence,
    assumptions: deduplicatedAssumptions,
  };
}
