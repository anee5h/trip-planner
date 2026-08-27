/**
 * KAI-217A — Canonical TripCostEngine core.
 *
 * ONE canonical entry point for trip cost:
 *
 *   calculateTripCost(context): TripCostResult
 *
 * Canonical day trip:   Origin Travel + Admission + Required Local Transport
 * Canonical overnight:  + Accommodation (party-total per-night allowance ×
 *                        nights — NEVER × party size again).
 *
 * EXCLUDED from canonical affordability (never in components[], never in
 * total): food, cafe/snacks, shopping, souvenirs, optional activities,
 * generic discretionary spend, universal parking, hidden 5% uplift.
 *
 * Invariants (fail-closed, mirror budgetV2.ts):
 *
 *   - complete ⇒ every required component bounded; total REQUIRED.
 *   - partial  ⇒ at least one required component open_ended / unavailable /
 *                variable; total FORBIDDEN (total?: never).
 *   - unavailable ⇒ no usable evidence; total FORBIDDEN.
 *   - unknown NEVER becomes zero; partial/open-ended NEVER becomes complete.
 *   - verified free (admission/local transport) is bounded [0,0] WITH
 *     verified_free evidence — NOT unavailable.
 *   - verified not_applicable (hub admission, 0-night stay) is EXCLUDED from
 *     the required-bounded set (a hub or a day trip without allowance can be
 *     complete), but a MISSING admission (unavailable) is NOT a carve-out.
 *   - accommodation: party-total per-night allowance × nights. The engine
 *     NEVER multiplies by party size and NEVER invents/presets an allowance
 *     when none is supplied (absent allowance + nights>0 → unavailable).
 *
 * Pure and deterministic: no I/O, no React, no system clock.
 */

import type { Destination } from "@/shared/types/destination";
import type { BudgetTier } from "@/shared/types/planner";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import {
  getCanonicalTransportCost,
  type TransportCostResult,
} from "@/shared/services/transport/transportCostV2";
import {
  isVerifiedFree,
  normalizeBudgetState,
} from "@/shared/services/budget/budgetState";
import {
  type AccommodationAllowance,
  type BoundedCost,
  type CostScope,
  type NonNumericCost,
  type TripCostComponent,
  type TripCostResult,
  accommodationTotal,
  isValidTripCostResult,
} from "@/shared/services/budget/budgetV2";
import { getEffectiveBudgetBreakdown } from "@/shared/services/budget/BudgetService";

/**
 * KAI-217A trip-mode axis. EXTENDS the binary app types ("day_trip" |
 * "weekend_2d1n") with an explicit future multi-night mode; the existing
 * types are untouched.
 */
export type TripModeV2 = "day_trip" | "weekend_2d1n" | "multi_night";

/** The engine's input context. */
export interface TripCostContext {
  /** The destination — the sole evidence source for admission and
   *  local_transport (budgetBreakdown, budgetMetadata, transportFares). */
  readonly dest: Destination;
  /** Transport mode for origin_travel. Absent (or flight/ferry without
   *  homeCoords) → origin_travel unavailable — never a Tokyo default. */
  readonly mode?: string;
  /** Positive integer. Scales origin_travel (already party-total from
   *  KAI-216) and the per-person admission / local_transport components.
   *  Default 2 (existing app default). */
  readonly partySize?: number;
  /** Origin coordinates. Required for origin-aware corridor fares, flight,
   *  and ferry; absent → origin_travel unavailable. */
  readonly homeCoords?: { lat: number; lng: number };
  /** Drives the accommodation night count. */
  readonly tripMode: TripModeV2;
  /** Explicit nights — required ONLY when tripMode === "multi_night"
   *  (integer ≥ 0; invalid → accommodation unavailable). */
  readonly nights?: number;
  /** User's PARTY-TOTAL per-night lodging allowance (¥, finite, ≥ 0).
   *  Absent + nights > 0 → accommodation unavailable (the engine never
   *  invents or presets a default). */
  readonly accommodationAllowance?: number;
  /** METADATA ONLY — never an arithmetic input in canonical affordability. */
  readonly budgetTier?: BudgetTier;
  /** Date/ferry context, passed through to KAI-216 for date-sensitive
   *  ferry fares. */
  readonly ferryTemporal?: FerryTemporalContext;
  /** KAI-217B: when FALSE, origin travel is NOT part of this context
   *  (no mode/homeCoords — e.g. Compare's on-site comparison). The
   *  origin_travel component becomes not_applicable so the on-site
   *  canonical total (admission + local transport) can still be complete.
   *  Default TRUE (origin travel is a required canonical component). */
  readonly includeOriginTravel?: boolean;
}

// ---- Helpers ----

function normalizePartySize(partySize: number | undefined): number {
  const n = partySize ?? 2;
  // Fail closed: non-finite, non-positive, or FRACTIONAL party sizes are
  // invalid (a party of 2.5 people is meaningless) — never silently floored.
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return Number.NaN;
  return n;
}

/** Nights from trip mode: day_trip=0, weekend_2d1n=1, multi_night=context.nights. */
function nightsForMode(context: TripCostContext): number | undefined {
  switch (context.tripMode) {
    case "day_trip":
      return 0;
    case "weekend_2d1n":
      return 1;
    case "multi_night":
      return context.nights;
  }
}

const SOURCE_MISSING: NonNumericCost = {
  kind: "unavailable",
  reason: "source_missing",
};

// ---- Component builders ----

/** origin_travel — passthrough from the KAI-216 canonical transport cost. */
function originTravelComponent(
  transport: TransportCostResult,
): TripCostComponent {
  return {
    cost: transport.cost,
    evidence: {
      scope: "origin_travel",
      derivation: transport.evidence.derivation,
      // KAI-216 round-2: the fare scope must flow onto ComponentEvidence so
      // the bounded corridor-only → PARTIAL invariant works in THIS layer —
      // a bounded origin whose scope is not "complete" has a missing access
      // leg and the trip can never be complete.
      ...(transport.evidence.fareScope
        ? { fareScope: transport.evidence.fareScope }
        : {}),
      ...(transport.evidence.sourceUrls
        ? { sourceUrls: transport.evidence.sourceUrls }
        : {}),
      // KAI-217B: the fare scope (complete vs corridor_only vs
      // local_bounded_estimate) is required for affordability decisions —
      // only a COMPLETE origin fare is a definite whole-journey cost.
      ...(transport.evidence.fareScope
        ? { fareScope: transport.evidence.fareScope }
        : {}),
    },
  };
}

/**
 * admission — from the KAI-214 normalized trust state + the trusted
 * per-person tickets value (budgetBreakdown.tickets), scaled by party.
 * verified_free → bounded [0,0] with verified_free evidence (a FACT, not
 * missing data). not_applicable (verified hub) → first-class non-numeric.
 */
function admissionComponent(
  dest: Destination,
  partySize: number,
): TripCostComponent {
  const s = normalizeBudgetState(dest);
  const breakdown = getEffectiveBudgetBreakdown(dest);
  const tickets = breakdown?.tickets;

  if (isVerifiedFree(dest)) {
    return {
      cost: { kind: "bounded", min: 0, max: 0 },
      evidence: {
        scope: "admission",
        derivation: "source_fact",
        state: "verified_free",
        provenance: "verified_source",
      },
    };
  }
  switch (s.state) {
    case "verified_paid":
      if (tickets !== undefined && Number.isFinite(tickets) && tickets >= 0) {
        return {
          cost: {
            kind: "bounded",
            min: tickets * partySize,
            max: tickets * partySize,
          },
          evidence: {
            scope: "admission",
            derivation: "source_fact",
            state: s.state,
            provenance: s.provenance,
          },
        };
      }
      return {
        cost: SOURCE_MISSING,
        evidence: {
          scope: "admission",
          derivation: "computed",
          reason: "source_missing",
        },
      };
    case "documented_estimate":
      if (tickets !== undefined && Number.isFinite(tickets) && tickets >= 0) {
        return {
          cost: {
            kind: "bounded",
            min: tickets * partySize,
            max: tickets * partySize,
          },
          evidence: {
            scope: "admission",
            derivation: "model_estimate",
            state: s.state,
            provenance: s.provenance,
          },
        };
      }
      return {
        cost: SOURCE_MISSING,
        evidence: {
          scope: "admission",
          derivation: "computed",
          reason: "source_missing",
        },
      };
    case "variable_price":
      return {
        cost: { kind: "variable" },
        evidence: {
          scope: "admission",
          derivation: "computed",
          state: s.state,
          provenance: s.provenance,
          reason: s.reasonCode,
        },
      };
    case "not_applicable":
      return {
        cost: { kind: "not_applicable" },
        evidence: {
          scope: "admission",
          derivation: "computed",
          state: s.state,
          provenance: s.provenance,
          reason: s.reasonCode,
        },
      };
    case "unavailable":
    case "legacy_unverified":
      return {
        cost: { kind: "unavailable", reason: s.reasonCode ?? "source_missing" },
        evidence: {
          scope: "admission",
          derivation: "computed",
          state: s.state,
          provenance: s.provenance,
          reason: s.reasonCode,
        },
      };
  }
  // Defensive: an unhandled state fails closed to unavailable.
  return {
    cost: SOURCE_MISSING,
    evidence: {
      scope: "admission",
      derivation: "computed",
      reason: "source_missing",
    },
  };
}

/**
 * local_transport — the required on-site/local-transit cost.
 *
 * KAI-216 round-2 repair (locked decisions):
 *   - NO generic city allowance: the generic budgetBreakdown.transport is
 *     NOT defensible local-transport evidence — model peer-cell values,
 *     legacy values, AND trusted-manual allowances all fail closed. Manual
 *     provenance can verify admission while the old transport allowance is
 *     still generic (a per-person on-site allowance is not a route fact).
 *   - Until an EXPLICIT defensible localTransport fact exists (KAI-218A
 *     schema, future consumption), local transport is UNAVAILABLE.
 *   - Evidence-backed walking ¥0 belongs to explicit localTransport facts —
 *     never manufactured from walkingMin or a generic word regex in
 *     budgetMetadata.basis.
 */
function localTransportComponent(
  dest: Destination,
  partySize: number,
): TripCostComponent {
  // KAI-218A explicit localTransport facts are NOT yet consumed by the
  // engine. Until they are, required local transport is unavailable —
  // never a legacy breakdown allowance, never a manufactured walking ¥0.
  void dest;
  void partySize;
  return {
    cost: SOURCE_MISSING,
    evidence: {
      scope: "local_transport",
      derivation: "computed",
      reason: "source_missing",
    },
  };
}

/**
 * accommodation — party-total per-night allowance × nights (NEVER × party).
 * nights=0 → not_applicable (no stay). nights>0 + allowance → bounded.
 * nights>0 + no allowance → unavailable (never invented).
 */
function accommodationComponent(
  context: TripCostContext,
  nights: number,
): TripCostComponent {
  if (nights === 0) {
    return {
      cost: { kind: "not_applicable" },
      evidence: { scope: "accommodation", derivation: "user_allowance" },
    };
  }
  const allowance = context.accommodationAllowance;
  if (allowance === undefined || !Number.isFinite(allowance) || allowance < 0) {
    return {
      cost: SOURCE_MISSING,
      evidence: {
        scope: "accommodation",
        derivation: "user_allowance",
        reason: "source_missing",
      },
    };
  }
  const a: AccommodationAllowance = { perNight: allowance, nights };
  const total = accommodationTotal(a);
  if (!Number.isFinite(total)) {
    return {
      cost: SOURCE_MISSING,
      evidence: {
        scope: "accommodation",
        derivation: "user_allowance",
        reason: "source_missing",
      },
    };
  }
  return {
    cost: { kind: "bounded", min: total, max: total },
    evidence: { scope: "accommodation", derivation: "user_allowance" },
  };
}

/** A bounded component is definitionally costless only when verified free
 *  ([0,0] with verified_free evidence) or verified not_applicable. */
function isRequiredBounded(component: TripCostComponent): boolean {
  const c = component.cost;
  if (c.kind === "not_applicable") return false;
  if (c.kind === "bounded") {
    // A verified-free [0,0] is a required bounded component (it IS a fact).
    return true;
  }
  return true;
}

/** Sum of bounded component bounds (only called for complete results). */
function sumBounded(components: readonly TripCostComponent[]): BoundedCost {
  let min = 0;
  let max = 0;
  for (const c of components) {
    if (c.cost.kind === "bounded") {
      min += c.cost.min;
      max += c.cost.max;
    }
  }
  return { kind: "bounded", min, max };
}

/**
 * KAI-217A round-3: canonical partial-result metadata.
 *   - knownSubtotal: sum of the BOUNDED required components (what IS known).
 *   - knownLowerBound: when an OPEN_ENDED component exists (and nothing is
 *     plain unavailable), the known subtotal + the open_ended floor(s) is a
 *     definite lower bound on the true total.
 *   - missingComponents: explicit scopes + reasons for every component that
 *     is unavailable / open_ended / variable / bounded-but-corridor-only —
 *     so UI can say "Known ¥X–Y; missing: local transport (no fare fact)".
 */
function buildPartialMetadata(components: readonly TripCostComponent[]): {
  knownSubtotal: [number, number];
  knownLowerBound?: number;
  missingComponents: readonly { scope: CostScope; reason: string }[];
} {
  const knownSubtotal = sumBounded(components);
  const missing: { scope: CostScope; reason: string }[] = [];
  let openEndedFloor = 0;
  let hasOpenEnded = false;
  for (const c of components) {
    const k = c.cost.kind;
    if (k === "bounded") {
      // Bounded corridor-only origin: known amount but scope-incomplete.
      if (
        c.evidence.scope === "origin_travel" &&
        c.evidence.fareScope !== undefined &&
        c.evidence.fareScope !== "complete"
      ) {
        missing.push({
          scope: c.evidence.scope,
          reason: "corridor_only_access_leg_missing",
        });
      }
      continue;
    }
    if (k === "open_ended") {
      openEndedFloor += c.cost.from;
      hasOpenEnded = true;
      missing.push({
        scope: c.evidence.scope,
        reason: "open_ended",
      });
      continue;
    }
    if (k === "unavailable" || k === "variable") {
      missing.push({
        scope: c.evidence.scope,
        reason:
          c.evidence.reason ?? (k === "variable" ? "variable" : "unavailable"),
      });
    }
  }
  return {
    knownSubtotal: [knownSubtotal.min, knownSubtotal.max],
    ...(hasOpenEnded
      ? { knownLowerBound: knownSubtotal.min + openEndedFloor }
      : {}),
    missingComponents: missing,
  };
}

/**
 * The canonical trip-cost engine (KAI-217A).
 *
 * Emits exactly four components in stable order: origin_travel, admission,
 * local_transport, accommodation. Food/cafe/shopping/souvenirs/optional/
 * discretionary/parking/5% never appear.
 *
 * Completeness (fail-closed):
 *   - complete  : every required component bounded (verified-free [0,0]
 *                 counts as bounded; verified not_applicable and 0-night
 *                 accommodation are excluded from the required set).
 *   - partial   : at least one required component is open_ended,
 *                 unavailable, or variable → total forbidden.
 *   - unavailable: NO required component yields usable evidence.
 */
export function calculateTripCost(context: TripCostContext): TripCostResult {
  const partySize = normalizePartySize(context.partySize);
  if (!Number.isFinite(partySize)) {
    return {
      completeness: "unavailable",
      components: [],
    };
  }
  const nights = nightsForMode(context);
  if (nights === undefined || !Number.isInteger(nights) || nights < 0) {
    // Invalid nights (multi_night without an explicit integer) → the
    // accommodation component is unavailable, never fabricated.
    return {
      completeness: "unavailable",
      components: [],
    };
  }

  const transport = getCanonicalTransportCost(
    context.dest,
    context.mode ?? "",
    partySize,
    context.homeCoords,
    context.ferryTemporal,
  );

  const components: TripCostComponent[] = [
    // KAI-217B: when the context has no origin (no mode/homeCoords — e.g.
    // Compare), origin travel is NOT part of this context and is excluded
    // from the required set (not_applicable), so the on-site canonical
    // total (admission + local transport) can still be complete.
    ...(context.includeOriginTravel === false
      ? [
          {
            cost: { kind: "not_applicable" as const },
            evidence: {
              scope: "origin_travel" as const,
              derivation: "computed" as const,
            },
          },
        ]
      : [originTravelComponent(transport)]),
    admissionComponent(context.dest, partySize),
    localTransportComponent(context.dest, partySize),
    accommodationComponent(context, nights),
  ];

  // The accommodation allowance actually applied (party-total per night).
  // Attached ONLY when a real allowance was supplied (bounded component) —
  // a missing allowance with nights > 0 keeps the component unavailable and
  // must NEVER leak as {perNight: 0, nights} (unknown ≠ ¥0 lodging).
  const hasAllowance =
    context.accommodationAllowance !== undefined &&
    Number.isFinite(context.accommodationAllowance) &&
    context.accommodationAllowance >= 0;
  const accommodation: AccommodationAllowance | undefined = hasAllowance
    ? { perNight: context.accommodationAllowance!, nights }
    : undefined;

  // Unavailable: no required component yields usable evidence. A verified
  // not_applicable component (0-night stay, hub admission) is definitionally
  // costless and does not count as usable evidence.
  const allUnavailable = components.every(
    (c) => c.cost.kind === "unavailable" || c.cost.kind === "not_applicable",
  );
  if (allUnavailable) {
    return {
      completeness: "unavailable",
      components,
      ...(accommodation ? { accommodation } : {}),
    };
  }

  // Partial: any required component open_ended / unavailable / variable,
  // OR a bounded origin_travel whose fareScope is corridor_only /
  // local_bounded_estimate (a missing access leg means the origin journey
  // is NOT whole-journey complete — locked KAI-216 decision).
  const hasNonBounded = components.some((c) => {
    const k = c.cost.kind;
    if (k === "open_ended" || k === "unavailable" || k === "variable") {
      return true;
    }
    if (
      k === "bounded" &&
      c.evidence.scope === "origin_travel" &&
      c.evidence.fareScope !== undefined &&
      c.evidence.fareScope !== "complete"
    ) {
      // Bounded corridor-only / local-bounded origin: the verified
      // corridor/service fare is known but an access leg is missing →
      // the trip is partial, never complete.
      return true;
    }
    return false;
  });
  if (hasNonBounded) {
    return {
      completeness: "partial",
      components,
      ...(accommodation ? { accommodation } : {}),
      ...buildPartialMetadata(components),
    };
  }

  // Complete: every required component bounded (not_applicable excluded).
  const required = components.filter(isRequiredBounded);
  const allBounded = required.every((c) => c.cost.kind === "bounded");
  if (!allBounded) {
    return {
      completeness: "partial",
      components,
      ...(accommodation ? { accommodation } : {}),
      ...buildPartialMetadata(components),
    };
  }

  const result: TripCostResult = {
    completeness: "complete",
    components,
    ...(accommodation ? { accommodation } : {}),
    total: sumBounded(components),
  };
  // Structural invariant gate (fail-closed; compile-time twin in budgetV2).
  if (!isValidTripCostResult(result)) {
    return {
      completeness: "unavailable",
      components,
      ...(accommodation ? { accommodation } : {}),
    };
  }
  return result;
}

/**
 * KAI-217B — canonical affordability evaluation.
 *
 * The user's budget preference evaluates the CANONICAL cost; it does not
 * mutate it. Contract (KAI-217 spec):
 *
 *   - Flexible budget → no constraint (always "fits" — the caller decides).
 *   - Complete bounded [min,max] with ceiling C:
 *       max <= C → "fits"
 *       min <= C < max → "may_exceed"
 *       min > C → "over"
 *   - Partial/open-ended/unavailable → "unknown" (NEVER claims strict fit,
 *     never "over" — there is no definite cost to exceed with).
 *
 * The engine's components are the ONLY affordability inputs: food, cafe,
 * shopping, optional spend, universal parking and the hidden 5% never
 * influence this decision.
 */
export function evaluateAffordability(
  result: TripCostResult,
  budget: number | undefined,
): "fits" | "may_exceed" | "over" | "unknown" {
  if (budget === undefined || !Number.isFinite(budget) || budget < 0) {
    // No (valid) ceiling → no affordability claim.
    return "unknown";
  }
  if (result.completeness === "complete" && result.total) {
    const { min, max } = result.total;
    if (max <= budget) return "fits";
    if (min > budget) return "over";
    return "may_exceed";
  }
  // Partial/open-ended/unavailable: NEVER claims strict fit. Under the
  // KAI-12 neutral policy, incomplete evidence is affordability-unknown —
  // except ONE definite fact: a COMPLETE-scope origin fare (whole-journey
  // verified cost, e.g. flight/explicit/complete shinkansen) whose min
  // alone exceeds the ceiling is over regardless of what else is unknown
  // (a verified ¥72k flight with unknown accommodation still cannot fit a
  // ¥20k budget). Corridor-only / local-bounded origin (unmodeled access)
  // stays neutral — retained, never hard-failed (KAI-12).
  if (result.completeness === "partial") {
    const originComponent = result.components.find(
      (c) => c.evidence.scope === "origin_travel",
    );
    if (
      originComponent &&
      originComponent.cost.kind === "bounded" &&
      originComponent.evidence.fareScope === "complete" &&
      originComponent.cost.min > budget
    ) {
      return "over";
    }
  }
  return "unknown";
}
