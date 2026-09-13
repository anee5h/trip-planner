/**
 * KAI-292C4C — scheduled feasibility interpretation at the C3 boundary.
 *
 * This module deliberately accepts only the production C3 boundary result. A
 * routed verified composition is translated once into C4B's canonical input;
 * all duration truth is then read from C4B's TransportDurationEvidence. C4C
 * does not expose a composer bypass or maintain a competing duration model.
 *
 * No return departure/window is inferred. Non-verified boundary states remain
 * scheduled interpretations, even when C4B legacy evidence is also present.
 */

import {
  getTransportDurationEvidence,
  type LegacyTransportDurationEvidence,
  type ScheduledJourneyRejection,
  type ScheduledTransportDurationEvidence,
  type TransportDurationEvidence,
  type UnknownTransportDurationEvidence,
} from "@/shared/services/transport/TransportDurationEvidence";
import type { ScheduledRoutingServiceDaySeconds } from "@/shared/services/transport/static/scheduledRoutingTemporal";
import type { ScheduledTransitRoutingBoundaryResult } from "@/shared/services/transport/static/scheduledTransitRoutingBoundary";

type RoutedBoundaryResult = Extract<
  ScheduledTransitRoutingBoundaryResult,
  { status: "routed" }
>;
type RoutedCompositionResult = RoutedBoundaryResult["result"];
type VerifiedCompositionResult = Extract<
  RoutedCompositionResult,
  { kind: "verified" }
>;
type NoMatchCompositionResult = Extract<
  RoutedCompositionResult,
  { kind: "no_match" }
>;
type InconclusiveCompositionResult = Extract<
  RoutedCompositionResult,
  { kind: "inconclusive" }
>;
type NotRoutedBoundaryResult = Extract<
  ScheduledTransitRoutingBoundaryResult,
  { status: "not_routed" }
>;

/** The only scheduled input accepted by the production-facing API. */
export type ScheduledFeasibilityInput = ScheduledTransitRoutingBoundaryResult;

/**
 * C4B duration evidence supplied by a caller as a separate, precomputed fact.
 * Scheduled evidence is intentionally excluded: it can enter C4C only through
 * the C3 boundary above, so this input cannot bypass C3.
 */
export type FeasibilityDurationEvidenceInput =
  LegacyTransportDurationEvidence | UnknownTransportDurationEvidence;

type SupplementaryDurationEvidence = FeasibilityDurationEvidenceInput;

export type ScheduledFeasibilityOutcome =
  | {
      readonly kind: "verified_scheduled_journey";
      readonly source: "scheduled";
      readonly selected: VerifiedCompositionResult["selected"];
      /** Composer provenance retained without re-owning C4B duration fields. */
      readonly datasetId: VerifiedCompositionResult["evidence"]["datasetId"];
      readonly contentHash: VerifiedCompositionResult["evidence"]["contentHash"];
      /** All Journey, schedule, duration, confidence, and provenance facts are C4B-owned. */
      readonly durationEvidence: ScheduledTransportDurationEvidence;
    }
  | {
      readonly kind: "no_match";
      readonly source: "scheduled";
      readonly reason: NoMatchCompositionResult["reason"];
      readonly diagnostics: NoMatchCompositionResult["diagnostics"];
      /** A separate C4B fact is retained without changing this interpretation. */
      readonly durationEvidence?: SupplementaryDurationEvidence;
    }
  | {
      readonly kind: "inconclusive";
      readonly source: "scheduled";
      readonly reason: InconclusiveCompositionResult["reason"];
      readonly diagnostics: InconclusiveCompositionResult["diagnostics"];
      readonly durationEvidence?: SupplementaryDurationEvidence;
    }
  | {
      readonly kind: "not_routed";
      readonly source: "scheduled";
      readonly reason: NotRoutedBoundaryResult["reason"];
      readonly diagnostics: NotRoutedBoundaryResult["diagnostics"];
      readonly durationEvidence?: SupplementaryDurationEvidence;
    }
  | {
      readonly kind: "scheduled_rejected";
      readonly source: "scheduled";
      readonly reason: "scheduled_evidence_rejected";
      /** The rejection is the exact diagnostic produced by C4B. */
      readonly scheduledRejection: ScheduledJourneyRejection;
      /** Unknown or legacy C4B evidence, including its rejection marker. */
      readonly durationEvidence: SupplementaryDurationEvidence;
    };

export type FeasibilityEvidence =
  | ScheduledFeasibilityOutcome
  | {
      readonly kind: "legacy_estimate";
      readonly source: "legacy";
      readonly durationEvidence: LegacyTransportDurationEvidence;
    }
  | {
      readonly kind: "no_transport_evidence";
      readonly source: "none";
      readonly durationEvidence?: UnknownTransportDurationEvidence;
    };

function supplementalEvidence(
  durationEvidence: FeasibilityDurationEvidenceInput | null | undefined,
): SupplementaryDurationEvidence | undefined {
  return durationEvidence ?? undefined;
}

function rejectionFromC4B(
  evidence: TransportDurationEvidence,
): ScheduledJourneyRejection {
  if (
    (evidence.kind === "legacy_estimate" || evidence.kind === "unknown") &&
    evidence.scheduledRejection !== undefined
  ) {
    return evidence.scheduledRejection;
  }
  throw new Error(
    "C4B returned non-scheduled duration evidence without a scheduled rejection",
  );
}

function adaptVerifiedBoundary(
  boundary: RoutedBoundaryResult,
  durationEvidence: FeasibilityDurationEvidenceInput | null | undefined,
): ScheduledFeasibilityOutcome {
  const result = boundary.result;
  if (result.kind !== "verified") {
    throw new Error("Expected a verified routed boundary result");
  }

  // This is the sole C3 → C4B adapter. Keep every value exact and let C4B
  // validate the Journey, schedule, transfer count, and duration contract.
  const c4bEvidence = getTransportDurationEvidence({
    scheduledJourney: {
      journey: result.journey,
      transferCount: result.transferCount,
      schedule: {
        serviceDate: boundary.request.serviceDate,
        departureServiceSeconds: result.evidence
          .initialDepartureServiceSeconds as ScheduledRoutingServiceDaySeconds,
        arrivalServiceSeconds: result.evidence
          .finalArrivalServiceSeconds as ScheduledRoutingServiceDaySeconds,
      },
      totalDurationSeconds: result.evidence.totalDurationSeconds,
    },
    legacyEstimate:
      durationEvidence?.kind === "legacy_estimate"
        ? durationEvidence.estimate
        : undefined,
  });

  if (c4bEvidence.kind === "scheduled_journey") {
    return {
      kind: "verified_scheduled_journey",
      source: "scheduled",
      selected: result.selected,
      datasetId: result.evidence.datasetId,
      contentHash: result.evidence.contentHash,
      durationEvidence: c4bEvidence,
    };
  }

  return {
    kind: "scheduled_rejected",
    source: "scheduled",
    reason: "scheduled_evidence_rejected",
    scheduledRejection: rejectionFromC4B(c4bEvidence),
    durationEvidence: c4bEvidence,
  };
}

function adaptBoundary(
  input: ScheduledTransitRoutingBoundaryResult,
  durationEvidence: FeasibilityDurationEvidenceInput | null | undefined,
): ScheduledFeasibilityOutcome {
  const supplementary = supplementalEvidence(durationEvidence);

  if (input.status === "not_routed") {
    return {
      kind: "not_routed",
      source: "scheduled",
      reason: input.reason,
      diagnostics: input.diagnostics,
      ...(supplementary === undefined
        ? {}
        : { durationEvidence: supplementary }),
    };
  }

  if (input.result.kind === "no_match") {
    return {
      kind: "no_match",
      source: "scheduled",
      reason: input.result.reason,
      diagnostics: input.result.diagnostics,
      ...(supplementary === undefined
        ? {}
        : { durationEvidence: supplementary }),
    };
  }

  if (input.result.kind === "inconclusive") {
    return {
      kind: "inconclusive",
      source: "scheduled",
      reason: input.result.reason,
      diagnostics: input.result.diagnostics,
      ...(supplementary === undefined
        ? {}
        : { durationEvidence: supplementary }),
    };
  }

  return adaptVerifiedBoundary(input, durationEvidence);
}

export interface ResolveFeasibilityEvidenceInput {
  /** The production C3 boundary result, when routing was attempted. */
  readonly scheduled?: ScheduledFeasibilityInput | null;
  /** Precomputed C4B legacy/unknown evidence; never a raw product estimate. */
  readonly durationEvidence?: FeasibilityDurationEvidenceInput | null;
}

/**
 * Interpret scheduled feasibility without changing recommendation or planner
 * behavior. A boundary status always remains visible. A C4B legacy fact is
 * retained alongside every non-verified scheduled state instead of replacing
 * that state; no-match is not a public-transport impossibility claim.
 */
export function resolveFeasibilityEvidence(
  input: ResolveFeasibilityEvidenceInput,
): FeasibilityEvidence {
  if (input.scheduled !== undefined && input.scheduled !== null) {
    return adaptBoundary(input.scheduled, input.durationEvidence);
  }

  if (input.durationEvidence?.kind === "legacy_estimate") {
    return {
      kind: "legacy_estimate",
      source: "legacy",
      durationEvidence: input.durationEvidence,
    };
  }

  if (input.durationEvidence?.kind === "unknown") {
    return {
      kind: "no_transport_evidence",
      source: "none",
      durationEvidence: input.durationEvidence,
    };
  }

  return { kind: "no_transport_evidence", source: "none" };
}

/**
 * Adapt one production C3 boundary result. Legacy evidence, when needed, is
 * supplied through resolveFeasibilityEvidence so it remains visibly separate.
 */
export function adaptScheduledFeasibility(
  input: ScheduledFeasibilityInput,
): ScheduledFeasibilityOutcome {
  return adaptBoundary(input, undefined);
}
