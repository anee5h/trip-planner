/**
 * KAI-215 — Budget v2 canonical cost types (dependency-neutral).
 *
 * The future canonical trip-cost engine (KAI-217) will compute one
 * machine-checkable TripCostResult consumed by every cost-bearing surface.
 * These types define the SHAPE of that contract without implementing any
 * arithmetic. They deliberately:
 *
 *   - reuse the KAI-214 state/provenance/reason/trust taxonomy
 *     (BudgetValueState / BudgetProvenance / BudgetReasonCode) — this is
 *     NOT a second trust taxonomy;
 *   - distinguish a BOUNDED range from an OPEN-ENDED "from ¥X" value —
 *     an open-ended cost must never masquerade as a bounded-complete cost;
 *   - represent unavailable / not_applicable / variable as first-class
 *     non-numeric states, never as zero;
 *   - carry component evidence (provenance, reason, scope, source URLs);
 *   - represent trip completeness (complete | partial | unavailable);
 *   - represent future travel as one-or-more LEGS (mode + cost + evidence)
 *     WITHOUT implementing multimodal routing (that is future transport
 *     work, not this PR);
 *   - represent accommodation as a PARTY-TOTAL allowance PER NIGHT with
 *     explicit `nights` — never multiplied by party size again, and not
 *     hardcoded to day_trip | weekend_2d1n.
 *
 * Pure and deterministic: no I/O, no runtime API dependency, no React.
 * Importable from both src runtime code and scripts/ CI validators.
 */

import type {
  BudgetProvenance,
  BudgetReasonCode,
  BudgetValueState,
} from "@/shared/types/destination";

// ---- Bounded vs open-ended cost representation ----

/** A finite, non-negative, ordered [min, max] cost range (JPY). */
export interface BoundedCost {
  readonly kind: "bounded";
  readonly min: number;
  readonly max: number;
}

/** An open-ended "from ¥X" value: a known LOWER bound with no upper bound.
 *  Must NEVER be represented as [3000, 3000] — that would claim a definite
 *  fixed price and could falsely satisfy a bounded-complete predicate. */
export interface OpenEndedCost {
  readonly kind: "open_ended";
  /** Known lower bound (>= 0). There is no upper bound. */
  readonly from: number;
}

/** A non-numeric cost state. NEVER coerced to zero. */
export type NonNumericCost =
  | { readonly kind: "unavailable"; readonly reason?: BudgetReasonCode }
  | { readonly kind: "not_applicable" }
  | { readonly kind: "variable" };

/** The union of every way a component cost can be represented. */
export type CostRepresentation = BoundedCost | OpenEndedCost | NonNumericCost;

// ---- Component evidence (reuses KAI-214 taxonomy) ----

/** Scope of a cost fact: what the number actually covers. */
export type CostScope =
  | "admission"
  | "local_transport"
  | "origin_travel"
  | "accommodation"
  | "meals"
  | "other";

/**
 * Evidence attached to a component. Reuses the KAI-214 provenance/reason
 * taxonomy verbatim — no second trust system. `state` is the normalized
 * KAI-214 value state; `provenance` is where it came from; `reason` is the
 * stable non-numeric reason; `sourceUrls` are official sources where
 * available; `scope` says which part of the trip the cost covers.
 */
export interface ComponentEvidence {
  readonly state: BudgetValueState;
  readonly provenance: BudgetProvenance;
  readonly reason?: BudgetReasonCode;
  readonly sourceUrls?: readonly string[];
  readonly scope: CostScope;
}

/** A single trip-cost component: value + epistemic state. */
export interface TripCostComponent {
  readonly cost: CostRepresentation;
  readonly evidence: ComponentEvidence;
}

// ---- Trip completeness ----

export type TripCompleteness = "complete" | "partial" | "unavailable";

// ---- Future travel legs ----

/**
 * One travel leg (e.g. origin -> local rail, then shinkansen, then bus).
 * The Budget v2 engine must accept richer legs later WITHOUT another
 * cost-architecture rewrite; multimodal ROUTING is future transport work
 * and is NOT implemented here.
 */
export interface TravelLeg {
  readonly mode: string;
  readonly cost: CostRepresentation;
  readonly evidence: ComponentEvidence;
}

// ---- Accommodation contract ----

/**
 * Accommodation allowance: TOTAL PARTY lodging allowance PER NIGHT.
 *
 * - day trip  → 0 nights → ¥0 accommodation
 * - 2D1N      → 1 night  → allowance × 1
 * - 3D2N      → 2 nights → allowance × 2
 * - future N-day trip → explicit `nights`; cost multiplies by NIGHTS,
 *   NEVER by party size again.
 *
 * The type is structurally capable of accepting any explicit `nights`;
 * it is not hardcoded to day_trip | weekend_2d1n.
 */
export interface AccommodationAllowance {
  /** Party-total lodging allowance per night (JPY, >= 0). */
  readonly perNight: number;
  /** Explicit number of nights (>= 0). day trip = 0, 2D1N = 1, 3D2N = 2. */
  readonly nights: number;
}

// ---- Trip result context + result ----

/** The context the future canonical engine will evaluate. */
export interface TripCostContext {
  readonly nights: number;
  readonly partySize: number;
  /** Future-compatible: one or more travel legs. */
  readonly travelLegs?: readonly TravelLeg[];
  /** Optional explicit accommodation allowance (party-total per night). */
  readonly accommodation?: AccommodationAllowance;
}

/** The canonical trip-cost result (KAI-217 will produce this). */
export interface TripCostResult {
  readonly completeness: TripCompleteness;
  /** Component-level facts: value + epistemic state. */
  readonly components: readonly TripCostComponent[];
  /**
   * The bounded total range, present only when the result is COMPLETE
   * (all required components bounded). Partial/open-ended results must not
   * claim a definite total — callers must use `completeness` first.
   */
  readonly total?: BoundedCost;
  /** The accommodation allowance actually applied (party-total per night). */
  readonly accommodation?: AccommodationAllowance;
}

// ---- Invariant predicates (fail-closed) ----

/** True when the representation is a finite, ordered, non-negative range. */
export function isBoundedCost(value: CostRepresentation): value is BoundedCost {
  if (value.kind !== "bounded") return false;
  return (
    Number.isFinite(value.min) &&
    Number.isFinite(value.max) &&
    value.min >= 0 &&
    value.max >= 0 &&
    value.min <= value.max
  );
}

/**
 * A bounded-complete predicate: a component cost is COMPLETE only when it
 * is a valid bounded range. An open-ended cost, a non-numeric state, or a
 * malformed range NEVER satisfies this. This is the invariant that stops
 * "from ¥3000" from accidentally satisfying a bounded-complete claim.
 */
export function isBoundedComplete(value: CostRepresentation): boolean {
  return isBoundedCost(value);
}

/** An open-ended "from ¥X" cost (with a valid non-negative lower bound). */
export function isOpenEnded(value: CostRepresentation): value is OpenEndedCost {
  return (
    value.kind === "open_ended" &&
    Number.isFinite(value.from) &&
    value.from >= 0
  );
}

/** A non-numeric cost state (unavailable / not_applicable / variable). */
export function isNonNumeric(value: CostRepresentation): boolean {
  return (
    value.kind === "unavailable" ||
    value.kind === "not_applicable" ||
    value.kind === "variable"
  );
}

/**
 * Fail-closed validator: a representation is structurally VALID only when
 * its bounds are finite/non-negative/ordered. Malformed ranges (NaN,
 * negative, inverted, [0,0] pretending to be free without evidence) are
 * invalid. This is the single shape gate the future engine will use before
 * any arithmetic.
 */
export function isValidCostRepresentation(value: CostRepresentation): boolean {
  switch (value.kind) {
    case "bounded":
      return isBoundedCost(value);
    case "open_ended":
      return Number.isFinite(value.from) && value.from >= 0;
    case "unavailable":
    case "not_applicable":
    case "variable":
      return true;
  }
}

/**
 * The accommodation contract invariant: the party-total per-night allowance
 * times NIGHTS gives the total accommodation cost. It never multiplies by
 * party size — party size is already baked into `perNight`.
 */
export function accommodationTotal(a: AccommodationAllowance): number {
  return a.perNight * a.nights;
}
