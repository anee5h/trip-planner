import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getTransportDurationEvidence } from "@/shared/services/transport/TransportDurationEvidence";
import type { OriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import type {
  ScheduledRoutingServiceDate,
  ScheduledRoutingServiceDaySeconds,
} from "@/shared/services/transport/static/scheduledRoutingTemporal";
import type { ScheduledTransitRoutingBoundaryResult } from "@/shared/services/transport/static/scheduledTransitRoutingBoundary";
import type { Journey, JourneyCost, JourneyLeg } from "@/shared/types/journey";
import { calculateScore } from "../RecommendationScorer";
import {
  adaptScheduledFeasibility,
  resolveFeasibilityEvidence,
} from "../ScheduledFeasibilityService";

const unknownCost: JourneyCost = {
  currency: "JPY",
  representation: null,
  state: "unknown",
  evidence: "unknown",
  scope: "unknown",
  completeness: "unknown",
  basis: "unknown",
};

type RoutedBoundary = Extract<
  ScheduledTransitRoutingBoundaryResult,
  { status: "routed" }
>;
type NestedCompositionResult = RoutedBoundary["result"];
type VerifiedNestedCompositionResult = Extract<
  NestedCompositionResult,
  { kind: "verified" }
>;

function serviceDate(value: string): ScheduledRoutingServiceDate {
  return value as ScheduledRoutingServiceDate;
}

function serviceSeconds(value: number): ScheduledRoutingServiceDaySeconds {
  return value as ScheduledRoutingServiceDaySeconds;
}

function leg(
  id: string,
  mode: JourneyLeg["mode"],
  durationMinutes: number,
): JourneyLeg {
  return {
    mode,
    direction: "one_way",
    origin: { id: `${id}-origin`, kind: "station" },
    destination: { id: `${id}-destination`, kind: "station" },
    duration: {
      minutes: [durationMinutes, durationMinutes],
      evidence: "verified",
      source: "scheduled-fixture",
    },
    cost: unknownCost,
    availability: "available",
    confidence: "high",
    provenance: {
      source: "scheduled-fixture",
      confidence: "high",
      duration: "verified",
      cost: "unknown",
    },
  };
}

function journey(
  confidence: Journey["confidence"],
  transferCount: 0 | 1,
  durationEvidence: Journey["provenance"]["duration"] = "verified",
): Journey {
  const legs =
    transferCount === 0
      ? [leg("direct", "train", 30)]
      : [leg("first", "train", 45), leg("second", "bus", 35)];
  return {
    kind: "journey",
    origin: { id: "origin", kind: "origin" },
    destination: { id: "destination", kind: "destination" },
    scope: "complete_journey",
    directionality: transferCount === 0 ? "one_way" : "multi_leg",
    completeness: "complete",
    externalHandoff: { supported: false, reason: "unsupported_mode" },
    legs,
    availability: "available",
    confidence,
    provenance: {
      source: "gtfs_scheduled_timetable",
      confidence,
      duration: durationEvidence,
      cost: "unknown",
    },
  };
}

function verifiedComposition(options: {
  selected: "direct" | "one_transfer";
  transferCount: 0 | 1;
  departure: number;
  arrival: number;
  confidence: Journey["confidence"];
  durationEvidence?: Journey["provenance"]["duration"];
}): VerifiedNestedCompositionResult {
  const {
    selected,
    transferCount,
    departure,
    arrival,
    confidence,
    durationEvidence,
  } = options;
  return {
    kind: "verified",
    journey: journey(confidence, transferCount, durationEvidence),
    selected,
    transferCount,
    evidence: {
      datasetId: "scheduled-fixture",
      contentHash: "scheduled-content-hash",
      directAttempt: { kind: "verified" },
      oneTransferAttempt: {
        kind: "no_match",
        reason: "no_one_transfer_service",
      },
      selected,
      selectionReason: "only_verified_candidate",
      transferCount,
      initialDepartureServiceSeconds: departure,
      finalArrivalServiceSeconds: arrival,
      totalDurationSeconds: arrival - departure,
    },
  };
}

function routedBoundary(
  result: NestedCompositionResult,
  date = "2026-09-12",
): RoutedBoundary {
  return {
    status: "routed",
    direction: "outbound",
    request: {
      dataset: {} as RoutedBoundary["request"]["dataset"],
      direction: "outbound",
      originStopId: "origin-stop",
      destinationStopId: "destination-stop",
      serviceDate: serviceDate(date),
      earliestDepartureServiceSeconds: serviceSeconds(28_800),
      temporal: {} as RoutedBoundary["request"]["temporal"],
    },
    result,
  };
}

function noMatchBoundary(): RoutedBoundary {
  return routedBoundary({
    kind: "no_match",
    reason: "no_scheduled_journey",
    diagnostics: {
      datasetId: "scheduled-fixture",
      contentHash: "scheduled-content-hash",
      directAttempt: { kind: "no_match", reason: "no_direct_service" },
      oneTransferAttempt: {
        kind: "no_match",
        reason: "no_one_transfer_service",
      },
    },
  });
}

function inconclusiveBoundary(): RoutedBoundary {
  return routedBoundary({
    kind: "inconclusive",
    reason: "no_verified_scheduled_journey",
    diagnostics: {
      datasetId: "scheduled-fixture",
      contentHash: "scheduled-content-hash",
      directAttempt: { kind: "inconclusive", reason: "partial_timetable" },
      oneTransferAttempt: {
        kind: "no_match",
        reason: "no_one_transfer_service",
      },
    },
  });
}

function notRoutedBoundary(): ScheduledTransitRoutingBoundaryResult {
  return {
    status: "not_routed",
    direction: "outbound",
    reason: "dataset_unresolved",
    diagnostics: {
      dataset: "unresolved",
      origin: "unmapped",
      destination: "unmapped",
      temporal: "unresolved",
    },
  };
}

const legacyEstimate: OriginAwareTransportEstimate = {
  mode: "train",
  timeRange: [90, 120],
  source: "rough_transit_fallback",
  evidence: "estimated",
  estimateSource: "rough",
  confidence: "low",
  fareEvidence: "unknown",
};
const legacyDurationEvidence = getTransportDurationEvidence({ legacyEstimate });
if (legacyDurationEvidence.kind !== "legacy_estimate") {
  throw new Error("expected usable legacy duration evidence fixture");
}

function rankingDestination(id: string, overall: number): Destination {
  return {
    id,
    ratings: {
      overall,
      couple: 5,
      summer: 5,
      winter: 5,
      rain: 5,
      food: 5,
      photography: 5,
      relaxation: 5,
      value: 5,
      uniqueness: 5,
    },
    season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
  } as unknown as Destination;
}

describe("scheduled feasibility evidence", () => {
  it("adapts a verified direct boundary through C4B duration evidence", () => {
    const scheduledJourney = journey("high", 0);
    const composition = verifiedComposition({
      selected: "direct",
      transferCount: 0,
      departure: 8 * 3600,
      arrival: 8 * 3600 + 30 * 60,
      confidence: "high",
    });
    const boundary = routedBoundary({
      ...composition,
      journey: scheduledJourney,
    });

    const adapted = adaptScheduledFeasibility(boundary);

    expect(adapted).toMatchObject({
      kind: "verified_scheduled_journey",
      source: "scheduled",
      selected: "direct",
      datasetId: "scheduled-fixture",
      contentHash: "scheduled-content-hash",
      durationEvidence: {
        kind: "scheduled_journey",
        evidence: "verified",
        journey: scheduledJourney,
        transferCount: 0,
        schedule: {
          serviceDate: "2026-09-12",
          departureServiceSeconds: 28_800,
          arrivalServiceSeconds: 30_600,
        },
        totalDurationSeconds: 1_800,
        durationMinutes: [30, 30],
        confidence: "high",
        provenance: scheduledJourney.provenance,
      },
    });
    expect(adapted).not.toHaveProperty("totalDurationSeconds");
    expect(adapted).not.toHaveProperty("totalDurationMinutes");
  });

  it("adapts a verified one-transfer boundary without flattening Journey facts", () => {
    const boundary = routedBoundary(
      verifiedComposition({
        selected: "one_transfer",
        transferCount: 1,
        departure: 9 * 3600,
        arrival: 10 * 3600 + 20 * 60,
        confidence: "medium",
      }),
      "2026-09-13",
    );

    const adapted = adaptScheduledFeasibility(boundary);

    expect(adapted).toMatchObject({
      kind: "verified_scheduled_journey",
      selected: "one_transfer",
      durationEvidence: {
        kind: "scheduled_journey",
        transferCount: 1,
        schedule: {
          serviceDate: "2026-09-13",
          departureServiceSeconds: 32_400,
          arrivalServiceSeconds: 37_200,
        },
        totalDurationSeconds: 4_800,
        durationMinutes: [80, 80],
        journey: {
          confidence: "medium",
          legs: [{ mode: "train" }, { mode: "bus" }],
        },
        confidence: "medium",
      },
    });
    if (adapted.kind !== "verified_scheduled_journey") return;
    expect(adapted.durationEvidence.journey.legs).toHaveLength(2);
    expect(adapted.durationEvidence.provenance).toBe(
      adapted.durationEvidence.journey.provenance,
    );
  });

  it("keeps no_match, inconclusive, and not_routed distinct", () => {
    expect(adaptScheduledFeasibility(noMatchBoundary())).toMatchObject({
      kind: "no_match",
      source: "scheduled",
      reason: "no_scheduled_journey",
    });
    expect(adaptScheduledFeasibility(inconclusiveBoundary())).toMatchObject({
      kind: "inconclusive",
      source: "scheduled",
      reason: "no_verified_scheduled_journey",
    });
    expect(adaptScheduledFeasibility(notRoutedBoundary())).toMatchObject({
      kind: "not_routed",
      source: "scheduled",
      reason: "dataset_unresolved",
      diagnostics: {
        dataset: "unresolved",
        origin: "unmapped",
        destination: "unmapped",
        temporal: "unresolved",
      },
    });
    expect(adaptScheduledFeasibility(noMatchBoundary())).not.toHaveProperty(
      "impossible",
    );
  });

  it.each([
    ["no_match", noMatchBoundary()],
    ["inconclusive", inconclusiveBoundary()],
    ["not_routed", notRoutedBoundary()],
  ] as const)(
    "preserves usable C4B legacy evidence alongside scheduled %s",
    (kind, boundary) => {
      const result = resolveFeasibilityEvidence({
        scheduled: boundary,
        durationEvidence: legacyDurationEvidence,
      });

      expect(result).toMatchObject({
        kind,
        source: "scheduled",
        durationEvidence: legacyDurationEvidence,
      });
    },
  );

  it("consumes C4B rejection diagnostics instead of recreating duration policy", () => {
    const rejectedBoundary = routedBoundary(
      verifiedComposition({
        selected: "direct",
        transferCount: 0,
        departure: 100,
        arrival: 500,
        confidence: "low",
        durationEvidence: "estimated",
      }),
    );

    const result = adaptScheduledFeasibility(rejectedBoundary);

    expect(result).toMatchObject({
      kind: "scheduled_rejected",
      source: "scheduled",
      reason: "scheduled_evidence_rejected",
      scheduledRejection: {
        kind: "scheduled_rejection",
        reason: "unverified_scheduled_duration",
      },
      durationEvidence: {
        kind: "unknown",
        evidence: "unknown",
        reason: "invalid_scheduled_journey",
        scheduledRejection: {
          kind: "scheduled_rejection",
          reason: "unverified_scheduled_duration",
        },
      },
    });
  });

  it("preserves C4B legacy evidence alongside a scheduled rejection", () => {
    const rejectedBoundary = routedBoundary(
      verifiedComposition({
        selected: "direct",
        transferCount: 0,
        departure: 100,
        arrival: 500,
        confidence: "low",
        durationEvidence: "estimated",
      }),
    );

    const result = resolveFeasibilityEvidence({
      scheduled: rejectedBoundary,
      durationEvidence: legacyDurationEvidence,
    });

    expect(result).toMatchObject({
      kind: "scheduled_rejected",
      scheduledRejection: {
        kind: "scheduled_rejection",
        reason: "unverified_scheduled_duration",
      },
      durationEvidence: {
        kind: "legacy_estimate",
        estimate: legacyEstimate,
        scheduledRejection: {
          kind: "scheduled_rejection",
          reason: "unverified_scheduled_duration",
        },
      },
    });
  });

  it("reports no transport evidence when no scheduled boundary or legacy evidence exists", () => {
    expect(resolveFeasibilityEvidence({})).toEqual({
      kind: "no_transport_evidence",
      source: "none",
    });
  });

  it("uses a supplied precomputed C4B legacy evidence without an estimate adapter", () => {
    const result = resolveFeasibilityEvidence({
      durationEvidence: legacyDurationEvidence,
    });

    expect(result).toEqual({
      kind: "legacy_estimate",
      source: "legacy",
      durationEvidence: legacyDurationEvidence,
    });
  });

  it("does not change recommendation score ordering", () => {
    const higher = rankingDestination("higher", 9);
    const lower = rankingDestination("lower", 6);
    const context = {
      budget: 100_000,
      carMode: "none",
      publicModes: [],
      partySize: 1,
      visitedIds: [],
      tripDuration: "any" as const,
    };
    const before = [higher, lower].map(
      (destination) => calculateScore(destination, context).score,
    );

    resolveFeasibilityEvidence({
      scheduled: routedBoundary(
        verifiedComposition({
          selected: "direct",
          transferCount: 0,
          departure: 0,
          arrival: 600,
          confidence: "high",
        }),
      ),
    });

    const after = [higher, lower].map(
      (destination) => calculateScore(destination, context).score,
    );
    expect(after).toEqual(before);
    expect(after[0]).toBeGreaterThan(after[1]);
  });
});
