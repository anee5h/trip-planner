import type {
  ScheduledRoutingServiceDate,
  ScheduledRoutingServiceDaySeconds,
} from "./static/scheduledRoutingTemporal";
import { isScheduledRoutingServiceDate } from "./static/scheduledRoutingTemporal";
import type {
  Journey,
  JourneyEvidence,
  JourneyProvenance,
} from "@/shared/types/journey";
import type { OriginAwareTransportEstimate } from "./OriginAwareTransportService";

/**
 * One coherent service-day schedule. Service-day seconds are absolute and may
 * exceed 24 hours, so no display clock is stored or derived here.
 */
export interface ScheduledJourneySchedule {
  readonly serviceDate: ScheduledRoutingServiceDate;
  readonly departureServiceSeconds: ScheduledRoutingServiceDaySeconds;
  readonly arrivalServiceSeconds: ScheduledRoutingServiceDaySeconds;
}

export type ScheduledJourneyRejectionReason =
  | "invalid_journey"
  | "invalid_transfer_count"
  | "missing_schedule"
  | "invalid_service_date"
  | "invalid_departure_service_seconds"
  | "invalid_arrival_service_seconds"
  | "arrival_before_departure"
  | "invalid_total_duration_seconds"
  | "duration_mismatch";

/** Machine-readable observability for supplied scheduled evidence rejected here. */
export interface ScheduledJourneyRejection {
  readonly kind: "scheduled_rejection";
  readonly reason: ScheduledJourneyRejectionReason;
}

/**
 * Product-neutral scheduled timing attached to a canonical Journey. The
 * Journey remains the source of leg, confidence, and provenance truth; this
 * wrapper carries the aggregate schedule facts needed by duration consumers.
 */
export interface ScheduledJourneyDurationInput {
  readonly journey: Journey;
  readonly transferCount: number;
  readonly schedule: ScheduledJourneySchedule;
  readonly totalDurationSeconds: number;
}

export interface TransportDurationEvidenceInput {
  /** Preferred when a complete canonical scheduled Journey is available. */
  readonly scheduledJourney?: ScheduledJourneyDurationInput | null;
  /** Existing origin-aware estimate retained as a compatibility fallback. */
  readonly legacyEstimate?: OriginAwareTransportEstimate | null;
}

export interface ScheduledTransportDurationEvidence {
  readonly kind: "scheduled_journey";
  readonly source: "scheduled_journey";
  readonly evidence: Exclude<JourneyEvidence, "unknown">;
  readonly journey: Journey;
  readonly transferCount: number;
  readonly schedule: ScheduledJourneySchedule;
  readonly totalDurationSeconds: number;
  readonly durationMinutes: readonly [number, number];
  readonly confidence: Journey["confidence"];
  readonly provenance: JourneyProvenance;
}

export interface LegacyTransportDurationEvidence {
  readonly kind: "legacy_estimate";
  readonly source: OriginAwareTransportEstimate["source"];
  readonly evidence: Exclude<JourneyEvidence, "unknown">;
  readonly estimate: OriginAwareTransportEstimate;
  readonly durationMinutes: readonly [number, number];
  readonly confidence: Journey["confidence"];
  readonly provenance: JourneyProvenance;
  /** Present only when supplied scheduled evidence was rejected. */
  readonly scheduledRejection?: ScheduledJourneyRejection;
}

export interface UnknownTransportDurationEvidence {
  readonly kind: "unknown";
  readonly evidence: "unknown";
  readonly reason: "no_usable_duration_evidence" | "invalid_scheduled_journey";
  /** Present only when supplied scheduled evidence was rejected. */
  readonly scheduledRejection?: ScheduledJourneyRejection;
}

export type TransportDurationEvidence =
  | ScheduledTransportDurationEvidence
  | LegacyTransportDurationEvidence
  | UnknownTransportDurationEvidence;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isValidRange(
  value: readonly [number, number] | undefined,
): value is readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  return (
    isFiniteNonNegative(value[0]) &&
    isFiniteNonNegative(value[1]) &&
    value[1] >= value[0]
  );
}

function scheduledRejectionReason(
  input: ScheduledJourneyDurationInput,
): ScheduledJourneyRejectionReason | undefined {
  const candidate = input as unknown as Record<string, unknown>;
  const journeyValue = candidate.journey;
  if (!isRecord(journeyValue)) return "invalid_journey";
  if (
    journeyValue.kind !== "journey" ||
    !Array.isArray(journeyValue.legs) ||
    journeyValue.legs.length === 0 ||
    journeyValue.availability !== "available" ||
    journeyValue.completeness !== "complete" ||
    !isRecord(journeyValue.provenance) ||
    (journeyValue.provenance.duration !== "verified" &&
      journeyValue.provenance.duration !== "estimated")
  ) {
    return "invalid_journey";
  }
  if (
    journeyValue.legs.some(
      (leg) =>
        !isRecord(leg) ||
        leg.availability !== "available" ||
        !isRecord(leg.duration) ||
        (leg.duration.evidence !== "verified" &&
          leg.duration.evidence !== "estimated"),
    )
  ) {
    return "invalid_journey";
  }
  if (
    !Number.isSafeInteger(candidate.transferCount) ||
    (candidate.transferCount as number) < 0
  ) {
    return "invalid_transfer_count";
  }

  const scheduleValue = candidate.schedule;
  if (!isRecord(scheduleValue)) return "missing_schedule";
  if (!isScheduledRoutingServiceDate(scheduleValue.serviceDate)) {
    return "invalid_service_date";
  }
  if (
    !Number.isSafeInteger(scheduleValue.departureServiceSeconds) ||
    (scheduleValue.departureServiceSeconds as number) < 0
  ) {
    return "invalid_departure_service_seconds";
  }
  if (
    !Number.isSafeInteger(scheduleValue.arrivalServiceSeconds) ||
    (scheduleValue.arrivalServiceSeconds as number) < 0
  ) {
    return "invalid_arrival_service_seconds";
  }
  if (
    (scheduleValue.arrivalServiceSeconds as number) <
    (scheduleValue.departureServiceSeconds as number)
  ) {
    return "arrival_before_departure";
  }
  if (
    !Number.isSafeInteger(candidate.totalDurationSeconds) ||
    (candidate.totalDurationSeconds as number) < 0
  ) {
    return "invalid_total_duration_seconds";
  }
  if (
    (candidate.totalDurationSeconds as number) !==
    (scheduleValue.arrivalServiceSeconds as number) -
      (scheduleValue.departureServiceSeconds as number)
  ) {
    return "duration_mismatch";
  }
  return undefined;
}

function legacyConfidence(
  estimate: OriginAwareTransportEstimate,
): Journey["confidence"] {
  if (estimate.confidence !== undefined) return estimate.confidence;
  return estimate.evidence === "verified" ? "high" : "low";
}

function legacyProvenance(
  estimate: OriginAwareTransportEstimate,
): JourneyProvenance {
  const cost = Array.isArray(estimate.fare)
    ? (estimate.fareEvidence ?? estimate.evidence)
    : "unknown";
  return {
    source: estimate.source,
    confidence: legacyConfidence(estimate),
    duration: estimate.evidence,
    cost,
    sourceUrl: estimate.sourceUrl,
    checkedAt: estimate.checkedAt,
  };
}

function toScheduledEvidence(
  input: ScheduledJourneyDurationInput,
): ScheduledTransportDurationEvidence {
  const evidence = input.journey.provenance.duration;
  if (evidence === "unknown") {
    throw new Error(
      "Cannot build scheduled evidence without duration evidence",
    );
  }
  const minutes = input.totalDurationSeconds / 60;
  return {
    kind: "scheduled_journey",
    source: "scheduled_journey",
    evidence,
    journey: input.journey,
    transferCount: input.transferCount,
    schedule: input.schedule,
    totalDurationSeconds: input.totalDurationSeconds,
    durationMinutes: [minutes, minutes],
    confidence: input.journey.confidence,
    provenance: input.journey.provenance,
  };
}

function toLegacyEvidence(
  estimate: OriginAwareTransportEstimate,
  scheduledRejection: ScheduledJourneyRejection | undefined,
): LegacyTransportDurationEvidence | null {
  if (estimate.evidence === "unknown" || !isValidRange(estimate.timeRange)) {
    return null;
  }
  return {
    kind: "legacy_estimate",
    source: estimate.source,
    evidence: estimate.evidence,
    estimate,
    durationMinutes: estimate.timeRange,
    confidence: legacyConfidence(estimate),
    provenance: legacyProvenance(estimate),
    ...(scheduledRejection === undefined ? {} : { scheduledRejection }),
  };
}

/**
 * Resolve duration truth without changing existing recommendation or planner
 * behavior: canonical scheduled Journeys win, then legacy estimates. Absent
 * scheduled evidence remains distinct from supplied scheduled evidence that
 * fails validation.
 */
export function getTransportDurationEvidence(
  input: TransportDurationEvidenceInput,
): TransportDurationEvidence {
  const scheduledRejection =
    input.scheduledJourney === null || input.scheduledJourney === undefined
      ? undefined
      : scheduledRejectionReason(input.scheduledJourney);

  if (scheduledRejection === undefined && input.scheduledJourney != null) {
    return toScheduledEvidence(input.scheduledJourney);
  }

  const rejection =
    scheduledRejection === undefined
      ? undefined
      : {
          kind: "scheduled_rejection" as const,
          reason: scheduledRejection,
        };
  if (input.legacyEstimate !== null && input.legacyEstimate !== undefined) {
    const legacy = toLegacyEvidence(input.legacyEstimate, rejection);
    if (legacy !== null) return legacy;
  }

  return {
    kind: "unknown",
    evidence: "unknown",
    reason:
      rejection === undefined
        ? "no_usable_duration_evidence"
        : "invalid_scheduled_journey",
    ...(rejection === undefined ? {} : { scheduledRejection: rejection }),
  };
}
