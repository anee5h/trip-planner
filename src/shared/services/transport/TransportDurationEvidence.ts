import type {
  Journey,
  JourneyEvidence,
  JourneyProvenance,
} from "@/shared/types/journey";
import type { OriginAwareTransportEstimate } from "./OriginAwareTransportService";

/** A schedule timestamp without coupling this seam to a provider. */
export interface ScheduledJourneyTimestamp {
  readonly serviceSeconds: number;
  readonly time: string;
}

/**
 * Product-neutral scheduled timing attached to a canonical Journey. The
 * Journey remains the source of leg, confidence, and provenance truth; this
 * wrapper carries the aggregate schedule facts needed by duration consumers.
 */
export interface ScheduledJourneyDurationInput {
  readonly journey: Journey;
  readonly transferCount: number;
  readonly departure: ScheduledJourneyTimestamp;
  readonly arrival: ScheduledJourneyTimestamp;
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
  readonly departure: ScheduledJourneyTimestamp;
  readonly arrival: ScheduledJourneyTimestamp;
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
}

export interface UnknownTransportDurationEvidence {
  readonly kind: "unknown";
  readonly evidence: "unknown";
  readonly reason: "no_usable_duration_evidence";
}

export type TransportDurationEvidence =
  | ScheduledTransportDurationEvidence
  | LegacyTransportDurationEvidence
  | UnknownTransportDurationEvidence;

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

function isUsableScheduledJourney(
  input: ScheduledJourneyDurationInput,
): boolean {
  const { journey, transferCount, departure, arrival, totalDurationSeconds } =
    input;
  if (
    journey.kind !== "journey" ||
    !Array.isArray(journey.legs) ||
    journey.legs.length === 0 ||
    journey.availability !== "available" ||
    journey.completeness !== "complete" ||
    journey.provenance.duration === "unknown"
  ) {
    return false;
  }
  if (
    journey.legs.some(
      (leg) =>
        leg.availability !== "available" || leg.duration.evidence === "unknown",
    )
  ) {
    return false;
  }
  if (!Number.isSafeInteger(transferCount) || transferCount < 0) {
    return false;
  }
  if (
    !Number.isSafeInteger(departure.serviceSeconds) ||
    !Number.isSafeInteger(arrival.serviceSeconds) ||
    departure.serviceSeconds < 0 ||
    arrival.serviceSeconds < departure.serviceSeconds ||
    typeof departure.time !== "string" ||
    typeof arrival.time !== "string" ||
    departure.time.trim().length === 0 ||
    arrival.time.trim().length === 0
  ) {
    return false;
  }
  return (
    isFiniteNonNegative(totalDurationSeconds) &&
    totalDurationSeconds === arrival.serviceSeconds - departure.serviceSeconds
  );
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
    departure: input.departure,
    arrival: input.arrival,
    totalDurationSeconds: input.totalDurationSeconds,
    durationMinutes: [minutes, minutes],
    confidence: input.journey.confidence,
    provenance: input.journey.provenance,
  };
}

function toLegacyEvidence(
  estimate: OriginAwareTransportEstimate,
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
  };
}

/**
 * Resolve duration truth without changing existing recommendation or planner
 * behavior: canonical scheduled Journeys win, then legacy estimates, and an
 * absent/invalid source remains explicitly unknown.
 */
export function getTransportDurationEvidence(
  input: TransportDurationEvidenceInput,
): TransportDurationEvidence {
  if (
    input.scheduledJourney !== null &&
    input.scheduledJourney !== undefined &&
    isUsableScheduledJourney(input.scheduledJourney)
  ) {
    return toScheduledEvidence(input.scheduledJourney);
  }

  if (input.legacyEstimate !== null && input.legacyEstimate !== undefined) {
    const legacy = toLegacyEvidence(input.legacyEstimate);
    if (legacy !== null) return legacy;
  }

  return {
    kind: "unknown",
    evidence: "unknown",
    reason: "no_usable_duration_evidence",
  };
}
