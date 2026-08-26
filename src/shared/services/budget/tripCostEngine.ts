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
      ...(transport.evidence.sourceUrls
        ? { sourceUrls: transport.evidence.sourceUrls }
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
 * local_transport — the KAI-89 per-person on-site/local-transit allowance
 * (budgetBreakdown.transport) scaled by party, gated by KAI-214 trust.
 * A verified-free record may still carry a real on-site transit allowance
 * (e.g. a free-admission market with ¥1,083 local transit), so local
 * transport reads the ACTUAL breakdown.transport value — never forced to
 * [0,0] by free admission. Verified-free walking is [0,0] ONLY when the
 * record's transport value is truly 0.
 */
function localTransportComponent(
  dest: Destination,
  partySize: number,
): TripCostComponent {
  const s = normalizeBudgetState(dest);
  // For a verified not_applicable hub, the admission state is untrusted by
  // KAI-214 (correct — no single admission product), but the hub's stored
  // on-site transit allowance is still a real fact. Read the raw breakdown
  // value for that case; all other states use the trust-gated breakdown.
  const isNotApplicableHub = s.state === "not_applicable";
  const breakdown =
    isNotApplicableHub && dest.budgetBreakdown
      ? dest.budgetBreakdown
      : getEffectiveBudgetBreakdown(dest);
  const transit = breakdown?.transport;

  if (transit !== undefined && Number.isFinite(transit) && transit >= 0) {
    return {
      cost: {
        kind: "bounded",
        min: transit * partySize,
        max: transit * partySize,
      },
      evidence: {
        scope: "local_transport",
        derivation:
          s.state === "documented_estimate" ? "model_estimate" : "source_fact",
        state: s.state,
        provenance: s.provenance,
      },
    };
  }
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
    originTravelComponent(transport),
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

  // Partial: any required component open_ended / unavailable / variable.
  const hasNonBounded = components.some((c) => {
    const k = c.cost.kind;
    return k === "open_ended" || k === "unavailable" || k === "variable";
  });
  if (hasNonBounded) {
    return {
      completeness: "partial",
      components,
      ...(accommodation ? { accommodation } : {}),
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
