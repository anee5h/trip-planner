/**
 * KAI-216 — Transport range contract.
 *
 * Canonical structured transport cost for a destination+mode+party. This is
 * the Budget v2 transport representation layer: it converts every transport
 * cost source into the `CostRepresentation` union (bounded | open_ended |
 * unavailable | not_applicable | variable) with explicit evidence, WITHOUT
 * implementing the TripCostEngine (that is KAI-217).
 *
 * Invariants enforced here:
 *
 *   - NO midpoint collapse: a verified [min,max] range is NEVER reduced to a
 *     single number anywhere in this module. Round-trip/party scaling is
 *     exposed as the scaled range itself (still bounded), never a point.
 *   - NO duration-derived fake fares: `transportOptions` minutes, origin-aware
 *     time ranges, and TRANSPORT_PRICING_CONFIG heuristics are NOT fares.
 *     A corridor without a verified fare is `unavailable`, never a
 *     base+perMinute guess.
 *   - NO drive-time→distance→toll fabrication: car/my_car costs exist ONLY
 *     when the catalogue carries an explicit verified `transportFares`
 *     vehicle total. Minutes×1.1→km×18¥/km tolls are never canonical.
 *   - NO open-ended→fixed collapse: a dynamic "from ¥X" bus fare maps to
 *     `open_ended{from}`, never to `bounded[min=x,max=x]`.
 *   - NO unknown→0: missing/unverified/expired fares are `unavailable`
 *     (never [0,0]).
 *   - Flight/ferry canonical cost is the VERIFIED ROUTE FARE only. Access-leg
 *     costs from the generic straight-line estimator are not fares and never
 *     enter the canonical component (the door-to-door TransportEstimate
 *     costRange remains for legacy display).
 *   - KAI-204 local bounded rail fares are preserved as bounded with
 *     `model_estimate` derivation and their source URLs.
 *
 * Pure and deterministic: no I/O, no React, no system clock.
 */

import type { Destination } from "@/shared/types/destination";
import type { FerryTemporalContext, TransportMode } from "./types";
import { getOriginAwareTransportEstimate } from "./OriginAwareTransportService";
import { getFlightTransportEstimate } from "./FlightTransportEstimator";
import { getFerryTransportEstimate } from "./FerryTransportEstimator";
import { getLocalBoundedRailFareEstimate } from "./LocalBoundedFareEstimator";
import type { CostRepresentation, CostDerivation } from "../budget/budgetV2";
import type { TransportFareScope } from "./types";

/** How the canonical transport cost was produced. */
export interface TransportCostEvidence {
  /** What the fare actually covers on the origin→destination journey. */
  readonly fareScope: TransportFareScope;
  /**
   * Whether the returned cost is a round-trip total for the party
   * (true) or a per-person one-way value (false).
   */
  readonly isRoundTripPartyTotal: boolean;
  /** Seat product / fare basis for ground corridors, when known. */
  readonly fareBasis?: string;
  /** Source URLs supporting the fare. */
  readonly sourceUrls?: readonly string[];
  /** How the number came to be (Budget v2 derivation axis). */
  readonly derivation: CostDerivation;
}

/** The canonical structured transport cost result. */
export interface TransportCostResult {
  readonly cost: CostRepresentation;
  readonly evidence: TransportCostEvidence;
  /** The source estimator that produced this, for diagnostics. */
  readonly source:
    | "explicit_transport_fare"
    | "verified_corridor_fare"
    | "local_bounded_rail"
    | "verified_flight_fare"
    | "verified_ferry_fare"
    | "unavailable";
}

/** True when the party size is a finite positive integer. */
function isFinitePartySize(partySize: number): boolean {
  return Number.isFinite(partySize) && partySize > 0;
}

/** Normalized party size (>= 1, integer). */
function normalizePartySize(partySize: number): number {
  return Math.max(1, Math.floor(partySize));
}

/** Scale a per-person one-way bounded fare to a round-trip party total. */
function scaleRoundTripParty(
  fare: readonly [number, number],
  partySize: number,
): { kind: "bounded"; min: number; max: number } {
  const party = normalizePartySize(partySize);
  return {
    kind: "bounded",
    min: fare[0] * 2 * party,
    max: fare[1] * 2 * party,
  };
}

/** Scale a per-person one-way open-ended fare to a round-trip party total. */
function scaleOpenEndedRoundTripParty(
  from: number,
  partySize: number,
): { kind: "open_ended"; from: number } {
  const party = normalizePartySize(partySize);
  return { kind: "open_ended", from: from * 2 * party };
}

const UNAVAILABLE_SOURCE_MISSING: CostRepresentation = {
  kind: "unavailable",
  reason: "source_missing",
};

/**
 * Canonical structured transport cost (KAI-216).
 *
 * Priority ladder (fail-closed — the first matching verified source wins):
 *
 *   1. explicit `dest.transportFares[mode]` — verified route fare.
 *        transit: per-person one-way ×2 (round trip) × party
 *        car/my_car: per-car round-trip vehicle total × carsNeeded
 *   2. verified origin-aware corridor fare (train/shinkansen/bus):
 *        fixed/range [min,max] → bounded (scaled round-trip × party)
 *        dynamic [min,null]    → open_ended {from} (scaled round-trip × party)
 *        KAI-204 local bounded rail estimate → bounded + model_estimate
 *   3. flight: verified route fare only → bounded (round-trip × party);
 *        unverified/missing fare → unavailable
 *   4. ferry: verified service fare → bounded per fareBasis (round-trip ×
 *        party; round-trip basis is not doubled); expired/unverified →
 *        unavailable
 *   5. car/my_car without an explicit transportFares entry → unavailable
 *        (no toll-per-km fabrication)
 *
 * Returns a structured `CostRepresentation`; consumers needing a scalar use
 * the projection helpers below, which NEVER fabricate a number from
 * unavailable/open-ended input.
 */
export function getCanonicalTransportCost(
  dest: Destination,
  mode: string,
  partySize: number = 2,
  homeCoords?: { lat: number; lng: number },
  ferryTemporal?: FerryTemporalContext,
): TransportCostResult {
  if (!isFinitePartySize(partySize)) {
    return {
      cost: UNAVAILABLE_SOURCE_MISSING,
      evidence: {
        fareScope: "unknown",
        isRoundTripPartyTotal: true,
        derivation: "computed",
      },
      source: "unavailable",
    };
  }

  // ---- 1. Explicit transportFares (curated route fare, NO origin identity) ----
  // The Destination.transportFares structure has no origin identity and no
  // provenance metadata: a single destination-level value cannot be the
  // complete Nakayama→dest, Osaka→dest AND Hakata→dest fare simultaneously.
  // It is a ROUTE (corridor) fare with an unspecified origin — so it can
  // never claim whole-journey "complete" scope from an arbitrary user
  // origin, and without provenance it is NOT a verified source fact.
  //   - ground modes (train/bus/shinkansen): corridor_only + model_estimate
  //   - car/my_car: the vehicle total covers door-to-door movement (so the
  //     SCOPE is complete) but it is documented as an ESTIMATED vehicle
  //     cost (rental+gas+tolls) with no provenance → derivation is
  //     model_estimate, NEVER source_fact.
  const explicitFare =
    dest.transportFares?.[mode as keyof typeof dest.transportFares];
  if (explicitFare !== undefined) {
    // FAIL CLOSED: an invalid explicit fare (negative/NaN/Infinity) is
    // unavailable — never silently skipped to a registry fallback.
    if (!Number.isFinite(explicitFare) || explicitFare < 0) {
      return {
        cost: UNAVAILABLE_SOURCE_MISSING,
        evidence: {
          fareScope: "unknown",
          isRoundTripPartyTotal: true,
          derivation: "computed",
        },
        source: "unavailable",
      };
    }
    if (mode === "car" || mode === "my_car") {
      // KAI-216 round-2 repair: a static destination-level transportFares
      // car value is an ESTIMATED vehicle total with NO origin identity and
      // NO verified provenance — it cannot represent complete travel from
      // every possible user origin, and there is no origin-specific
      // defensible car model yet. Prefer canonical UNAVAILABLE (the engine
      // stays partial) until such a model exists.
      return {
        cost: UNAVAILABLE_SOURCE_MISSING,
        evidence: {
          fareScope: "unknown",
          isRoundTripPartyTotal: true,
          derivation: "computed",
        },
        source: "unavailable",
      };
    }
    // Ground transit: per-person one-way route fare ×2 (round trip) × party.
    // The origin is unspecified → corridor_only (access legs unknown), and
    // the value is un-provenanced → model_estimate, not source_fact.
    return {
      cost: scaleRoundTripParty([explicitFare, explicitFare], partySize),
      evidence: {
        fareScope: "corridor_only",
        isRoundTripPartyTotal: true,
        derivation: "model_estimate",
      },
      source: "explicit_transport_fare",
    };
  }

  // ---- 2. Verified origin-aware corridor fare (ground modes) ----
  if (
    homeCoords &&
    (mode === "train" || mode === "shinkansen" || mode === "bus")
  ) {
    const estimate = getOriginAwareTransportEstimate(
      dest,
      { homeStationCoords: homeCoords, ferryTemporal },
      [mode as TransportMode],
    );
    if (estimate?.fare) {
      const lower = estimate.fare[0];
      const upper = estimate.fare[1];
      const fareScope =
        estimate.fareScope ??
        (estimate.evidence === "estimated" ? "corridor_only" : "complete");
      const sourceUrls = [
        ...(estimate.fareSourceUrls ?? []),
        ...(estimate.fareSourceUrl ? [estimate.fareSourceUrl] : []),
        ...(estimate.sourceUrl ? [estimate.sourceUrl] : []),
      ].filter((url, i, arr) => arr.indexOf(url) === i);
      // KAI-204 local bounded rail fares ride the origin-aware estimate
      // with fareScope "local_bounded_estimate": they are a bounded
      // model-derived envelope (documented operator fare tables), NOT a
      // verified station-to-station fare. Derivation/source must say so.
      const isLocalBounded = fareScope === "local_bounded_estimate";
      if (upper === null) {
        // Dynamic "from ¥X" — NEVER a fixed price. Open-ended lower bound,
        // scaled to round-trip × party.
        return {
          cost: scaleOpenEndedRoundTripParty(lower, partySize),
          evidence: {
            fareScope,
            isRoundTripPartyTotal: true,
            fareBasis: estimate.fareBasis,
            sourceUrls,
            derivation: "source_fact",
          },
          source: "verified_corridor_fare",
        };
      }
      if (
        Number.isFinite(lower) &&
        Number.isFinite(upper) &&
        lower >= 0 &&
        upper >= lower
      ) {
        return {
          cost: scaleRoundTripParty([lower, upper], partySize),
          evidence: {
            fareScope,
            isRoundTripPartyTotal: true,
            fareBasis: estimate.fareBasis,
            sourceUrls,
            derivation: isLocalBounded ? "model_estimate" : "source_fact",
          },
          source: isLocalBounded
            ? "local_bounded_rail"
            : "verified_corridor_fare",
        };
      }
    }
    // KAI-204 local bounded rail estimate (only for train).
    if (mode === "train") {
      const local = getLocalBoundedRailFareEstimate(dest, {
        homeStationCoords: homeCoords,
      });
      if (local) {
        return {
          cost: scaleRoundTripParty(local.fare, partySize),
          evidence: {
            fareScope: "local_bounded_estimate",
            isRoundTripPartyTotal: true,
            sourceUrls: local.fareSourceUrls,
            derivation: "model_estimate",
          },
          source: "local_bounded_rail",
        };
      }
    }
    // A corridor with only an estimated duration is NOT a fare.
    if (estimate?.evidence === "estimated") {
      return {
        cost: UNAVAILABLE_SOURCE_MISSING,
        evidence: {
          fareScope: "corridor_only",
          isRoundTripPartyTotal: true,
          derivation: "computed",
        },
        source: "unavailable",
      };
    }
  }

  // ---- 3. Flight: verified route fare only ----
  if (mode === "flight") {
    // Flight is origin-specific: without homeCoords there is no origin
    // airport, so the cost is unavailable (never a Tokyo default).
    if (!homeCoords) {
      return {
        cost: UNAVAILABLE_SOURCE_MISSING,
        evidence: {
          fareScope: "complete",
          isRoundTripPartyTotal: true,
          derivation: "computed",
        },
        source: "unavailable",
      };
    }
    const flightEst = getFlightTransportEstimate(
      dest,
      homeCoords,
      ferryTemporal?.travelDate,
    );
    const verifiedFare = flightEst?.details?.verifiedFare;
    const fareStatus = flightEst?.details?.verifiedFareStatus;
    if (
      verifiedFare &&
      fareStatus === "verified" &&
      Number.isFinite(verifiedFare[0]) &&
      Number.isFinite(verifiedFare[1]) &&
      verifiedFare[0] >= 0 &&
      verifiedFare[1] >= verifiedFare[0]
    ) {
      // Canonical flight cost = verified route fare only (one-way per
      // person), scaled to round-trip × party. Access-leg costs (generic
      // straight-line estimates) never enter the canonical component.
      // The fare covers the AIR ROUTE only — origin airport access and
      // destination-side access are NOT included, so the scope is
      // corridor_only (a verified corridor/service fare), never complete.
      return {
        cost: scaleRoundTripParty(
          [verifiedFare[0], verifiedFare[1]],
          partySize,
        ),
        evidence: {
          fareScope: "corridor_only",
          isRoundTripPartyTotal: true,
          derivation: "source_fact",
        },
        source: "verified_flight_fare",
      };
    }
    return {
      cost: UNAVAILABLE_SOURCE_MISSING,
      evidence: {
        fareScope: "complete",
        isRoundTripPartyTotal: true,
        derivation: "computed",
      },
      source: "unavailable",
    };
  }

  // ---- 4. Ferry: verified service fare ----
  if (mode === "ferry") {
    // Ferry is origin-specific: without homeCoords there is no departure
    // port, so the cost is unavailable (never a Tokyo default).
    if (!homeCoords) {
      return {
        cost: UNAVAILABLE_SOURCE_MISSING,
        evidence: {
          fareScope: "complete",
          isRoundTripPartyTotal: true,
          derivation: "computed",
        },
        source: "unavailable",
      };
    }
    const ferryEst = getFerryTransportEstimate(dest, homeCoords, ferryTemporal);
    const verifiedFare = ferryEst?.details?.verifiedFare;
    const fareStatus = ferryEst?.details?.verifiedFareStatus;
    const fareBasis = ferryEst?.details?.ferryFareBasis;
    if (
      verifiedFare &&
      fareStatus === "verified" &&
      Number.isFinite(verifiedFare[0]) &&
      Number.isFinite(verifiedFare[1]) &&
      verifiedFare[0] >= 0 &&
      verifiedFare[1] >= verifiedFare[0]
    ) {
      // Canonical ferry cost = verified service fare only. A round-trip
      // basis fare already includes the return; a one-way basis fare is
      // doubled for the return trip. Scaled by party size.
      // The fare covers the SEA ROUTE only — origin→port access and
      // destination-side access are NOT included, so the scope is
      // corridor_only (a verified corridor/service fare), never complete.
      const multiplier = fareBasis === "round-trip" ? 1 : 2;
      const party = normalizePartySize(partySize);
      return {
        cost: {
          kind: "bounded",
          min: verifiedFare[0] * multiplier * party,
          max: verifiedFare[1] * multiplier * party,
        },
        evidence: {
          fareScope: "corridor_only",
          isRoundTripPartyTotal: true,
          fareBasis,
          derivation: "source_fact",
        },
        source: "verified_ferry_fare",
      };
    }
    return {
      cost: UNAVAILABLE_SOURCE_MISSING,
      evidence: {
        fareScope: "complete",
        isRoundTripPartyTotal: true,
        derivation: "computed",
      },
      source: "unavailable",
    };
  }

  // ---- 5. car / my_car without an explicit fare: unavailable ----
  if (mode === "car" || mode === "my_car") {
    return {
      cost: UNAVAILABLE_SOURCE_MISSING,
      evidence: {
        fareScope: "unknown",
        isRoundTripPartyTotal: true,
        derivation: "computed",
      },
      source: "unavailable",
    };
  }

  // ---- Anything else: unavailable ----
  return {
    cost: UNAVAILABLE_SOURCE_MISSING,
    evidence: {
      fareScope: "unknown",
      isRoundTripPartyTotal: true,
      derivation: "computed",
    },
    source: "unavailable",
  };
}

/**
 * Project a canonical transport cost to a scalar for LEGACY callers.
 *
 * KAI-216 round-2 repair: this is a legacy compatibility boundary ONLY.
 *   - bounded → midpoint (min===max ? min : (min+max)/2); kept only where
 *     strictly needed as a legacy display/compat projection — the canonical
 *     representation always preserves both bounds
 *   - open_ended → NULL (never project {from:X} into a fixed numeric fare —
 *     the caller would treat a lower bound as a price. Callers needing
 *     open-ended semantics must read the structured cost directly.)
 *   - unavailable/not_applicable/variable → null
 */
export function canonicalTransportCostToNumber(
  result: TransportCostResult,
): number | null {
  const c = result.cost;
  if (c.kind === "bounded") {
    return c.min === c.max ? c.min : Math.round((c.min + c.max) / 2);
  }
  // open_ended and everything else → null (never a fixed numeric).
  return null;
}
