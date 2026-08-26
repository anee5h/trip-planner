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
 *   - add a small ORTHOGONAL Budget-v2 derivation/source-kind axis
 *     (CostDerivation) so runtime-computed components (e.g. the user's
 *     accommodation allowance) can be described truthfully without forcing
 *     a KAI-214 provenance value (KAI-214 has no user_assumption
 *     provenance and must not be modified);
 *   - distinguish a BOUNDED range from an OPEN-ENDED "from ¥X" value —
 *     an open-ended cost must never masquerade as a bounded-complete cost;
 *   - represent unavailable / not_applicable / variable as first-class
 *     non-numeric states, never as zero;
 *   - carry component evidence (provenance, reason, scope, source URLs);
 *   - represent trip completeness as a DISCRIMINATED UNION so that
 *     partial/open-ended/unavailable results can NEVER carry a definite
 *     bounded total, and a complete result ALWAYS carries one;
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
import type { TransportFareScope } from "@/shared/services/transport/types";

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
 * ORTHOGONAL Budget-v2 derivation axis — how a COMPUTED TripCost component
 * was produced. This is NOT a second trust taxonomy: KAI-214 state/
 * provenance remain the trust/state source for PERSISTED destination
 * facts. This axis only describes the production of a runtime component,
 * and it is required so that a component can never omit how it came to be.
 *
 * - source_fact:    a source-backed fact (verified admission, verified
 *                   fare, verified free) — the strongest form;
 * - model_estimate: a bounded model-derived estimate (KAI-214
 *                   documented_estimate);
 * - user_allowance: a value the USER provided (e.g. the accommodation
 *                   party-total per-night allowance) — never mislabeled
 *                   as verified_source or model;
 * - computed:       a value derived/computed from other components.
 */
export type CostDerivation =
  "source_fact" | "model_estimate" | "user_allowance" | "computed";

/**
 * Evidence attached to a component. Reuses the KAI-214 provenance/reason
 * taxonomy verbatim — no second trust system. `state` is the normalized
 * KAI-214 value state; `provenance` is where it came from; `reason` is the
 * stable non-numeric reason; `sourceUrls` are official sources where
 * available; `scope` says which part of the trip the cost covers.
 *
 * `state`/`provenance` are OPTIONAL because they describe PERSISTED
 * destination facts (KAI-214's domain). A pure runtime component such as
 * the user's accommodation allowance has no KAI-214 provenance — it is
 * carried by `derivation: "user_allowance"` instead, without pretending to
 * be a verified_source/model value. `derivation` is REQUIRED on every
 * component.
 */
export interface ComponentEvidence {
  readonly state?: BudgetValueState;
  readonly provenance?: BudgetProvenance;
  readonly reason?: BudgetReasonCode;
  readonly sourceUrls?: readonly string[];
  /**
   * KAI-216: the transport fare scope carried by the canonical ladder
   * (complete / corridor_only / local_bounded_estimate / unknown). A
   * bounded origin_travel with a non-complete scope means an access leg is
   * missing → the trip is partial, never complete.
   */
  readonly fareScope?: TransportFareScope;
  readonly scope: CostScope;
  readonly derivation: CostDerivation;
  /**
   * KAI-217B: transport fare scope (origin_travel components only).
   * "complete" = whole-journey verified fare; "corridor_only" = verified
   * intercity with unmodeled access; "local_bounded_estimate" = bounded
   * local rail envelope. Required to distinguish a DEFINITE origin cost
   * (complete) from a partial one (corridor/local-bounded) in
   * affordability decisions.
   */
  readonly fareScope?: TransportFareScope;
}

/** A single trip-cost component: value + epistemic state. */
export interface TripCostComponent {
  readonly cost: CostRepresentation;
  readonly evidence: ComponentEvidence;
}

// ---- Trip completeness (discriminated union — fail-closed) ----

/**
 * The canonical trip-cost result (KAI-217 will produce this) as a
 * DISCRIMINATED UNION on `completeness` so the completeness/total
 * invariant is STRUCTURAL:
 *
 *   complete    => bounded total REQUIRED
 *   partial     => definite total FORBIDDEN (total?: never)
 *   unavailable => definite total FORBIDDEN (total?: never)
 *
 * A partial/open-ended/unavailable result can NEVER carry a definite
 * bounded total, and a complete result can NEVER omit one — both are
 * compile-time errors, not just runtime conventions.
 */
export interface TripCostResultBase {
  /** Component-level facts: value + epistemic state. */
  readonly components: readonly TripCostComponent[];
  /** The accommodation allowance actually applied (party-total per night). */
  readonly accommodation?: AccommodationAllowance;
}

/** A complete trip: every required component is bounded, total REQUIRED. */
export interface CompleteTripCostResult extends TripCostResultBase {
  readonly completeness: "complete";
  /** The definite bounded party-total range. REQUIRED for complete. */
  readonly total: BoundedCost;
}

/** A partial trip: some component is open-ended/unavailable; NO definite total. */
export interface PartialTripCostResult extends TripCostResultBase {
  readonly completeness: "partial";
  readonly total?: never;
  /**
   * KAI-217A round-3: the KNOWN subtotal — the sum of all BOUNDED required
   * components (origin travel + admission + local transport + applied
   * accommodation). Communicates what IS known even when the trip is not
   * complete. NEVER presented as a full plan total.
   */
  readonly knownSubtotal: [number, number];
  /**
   * KAI-217A round-3: a definite LOWER BOUND across the remaining
   * components, where meaningful: the minimum contribution of an
   * open_ended component ({from}) added to the known subtotal. Absent when
   * a component is unavailable (no floor is knowable).
   */
  readonly knownLowerBound?: number;
  /**
   * KAI-217A round-3: the components that are MISSING (unavailable /
   * open-ended / variable / bounded-but-corridor-only), with the explicit
   * scope + reason — so UI can say "Known ¥X–Y; missing: local transport".
   */
  readonly missingComponents: readonly {
    readonly scope: CostScope;
    readonly reason: string;
  }[];
}

/** An unavailable trip: no usable cost evidence; NO definite total. */
export interface UnavailableTripCostResult extends TripCostResultBase {
  readonly completeness: "unavailable";
  readonly total?: never;
}

export type TripCostResult =
  CompleteTripCostResult | PartialTripCostResult | UnavailableTripCostResult;

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
  /** Party-total lodging allowance per night (JPY, finite, >= 0). */
  readonly perNight: number;
  /** Explicit number of nights (integer >= 0). day trip = 0, 2D1N = 1. */
  readonly nights: number;
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
 * Fail-closed completeness/total invariant (the runtime twin of the
 * discriminated-union compile-time contract):
 *
 *   complete    => total MUST be a valid bounded cost
 *   partial     => total MUST be absent
 *   unavailable => total MUST be absent
 *
 * Also validates every component representation (bounded/open-ended/
 * non-numeric shape), so an invalid component can never ride inside a
 * "complete" result.
 */
export function isValidTripCostResult(result: TripCostResult): boolean {
  if (!result.components.every((c) => isValidCostRepresentation(c.cost))) {
    return false;
  }
  if (result.completeness === "complete") {
    return result.total !== undefined && isBoundedCost(result.total);
  }
  if (result.completeness === "partial") {
    return (
      result.total === undefined &&
      result.knownSubtotal !== undefined &&
      result.missingComponents !== undefined
    );
  }
  return result.total === undefined;
}

/**
 * Fail-closed accommodation validation:
 *
 *   perNight: finite, >= 0
 *   nights:   integer, >= 0
 *
 * NaN/Infinity/negative/fractional values are INVALID. No arbitrary
 * rounding is introduced anywhere.
 */
export function isValidAccommodationAllowance(
  allowance: AccommodationAllowance,
): boolean {
  return (
    Number.isFinite(allowance.perNight) &&
    allowance.perNight >= 0 &&
    Number.isInteger(allowance.nights) &&
    allowance.nights >= 0
  );
}

/**
 * The accommodation contract invariant: the party-total per-night allowance
 * times NIGHTS gives the total accommodation cost. It never multiplies by
 * party size — party size is already baked into `perNight`.
 *
 * Fail-closed: an invalid allowance (negative/NaN/Infinity perNight,
 * negative/fractional/NaN/Infinity nights) returns NaN instead of a
 * plausible-looking wrong number. No rounding is applied.
 */
export function accommodationTotal(a: AccommodationAllowance): number {
  if (!isValidAccommodationAllowance(a)) return Number.NaN;
  return a.perNight * a.nights;
}
