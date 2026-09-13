import { describe, expect, it } from "vitest";
import type {
  ScheduledRoutingServiceDate,
  ScheduledRoutingServiceDaySeconds,
} from "../static/scheduledRoutingTemporal";
import type { Journey, JourneyCost, JourneyLeg } from "@/shared/types/journey";
import type { OriginAwareTransportEstimate } from "../OriginAwareTransportService";
import { getTransportDurationEvidence } from "../TransportDurationEvidence";

const unknownCost: JourneyCost = {
  currency: "JPY",
  representation: null,
  state: "unknown",
  evidence: "unknown",
  scope: "unknown",
  completeness: "unknown",
  basis: "unknown",
};

function serviceDate(value: string): ScheduledRoutingServiceDate {
  return value as ScheduledRoutingServiceDate;
}

function serviceSeconds(value: number): ScheduledRoutingServiceDaySeconds {
  return value as ScheduledRoutingServiceDaySeconds;
}

function schedule(
  departureServiceSeconds: number,
  arrivalServiceSeconds: number,
  date = "2026-09-12",
) {
  return {
    serviceDate: serviceDate(date),
    departureServiceSeconds: serviceSeconds(departureServiceSeconds),
    arrivalServiceSeconds: serviceSeconds(arrivalServiceSeconds),
  } as const;
}

function leg(
  id: string,
  mode: JourneyLeg["mode"],
  duration: readonly [number, number],
): JourneyLeg {
  return {
    mode,
    direction: "one_way",
    origin: { id: `${id}-origin`, kind: "station" },
    destination: { id: `${id}-destination`, kind: "station" },
    duration: { minutes: duration, evidence: "verified", source: "fixture" },
    cost: unknownCost,
    availability: "available",
    confidence: "high",
    provenance: {
      source: "fixture",
      confidence: "high",
      duration: "verified",
      cost: "unknown",
    },
  };
}

function scheduledJourney(): Journey {
  const legs = [
    leg("first", "train", [35, 35]),
    leg("second", "bus", [20, 20]),
  ] as const;
  return {
    kind: "journey",
    origin: { id: "origin", kind: "station" },
    destination: { id: "destination", kind: "station" },
    scope: "complete_journey",
    directionality: "multi_leg",
    completeness: "complete",
    externalHandoff: { supported: false, reason: "unsupported_mode" },
    legs,
    availability: "available",
    confidence: "medium",
    provenance: {
      source: "scheduled-fixture",
      confidence: "medium",
      duration: "verified",
      cost: "unknown",
      sourceUrl: "https://example.test/scheduled-fixture",
      checkedAt: "2026-09-12T00:00:00.000Z",
    },
  };
}

function legacyEstimate(
  overrides: Partial<OriginAwareTransportEstimate> = {},
): OriginAwareTransportEstimate {
  return {
    mode: "train",
    timeRange: [90, 120],
    source: "rough_transit_fallback",
    evidence: "estimated",
    estimateSource: "rough",
    confidence: "low",
    fareEvidence: "unknown",
    ...overrides,
  };
}

describe("product-neutral transport duration evidence", () => {
  it("preserves a direct scheduled Journey and one coherent service date/seconds schedule", () => {
    const journey: Journey = {
      ...scheduledJourney(),
      directionality: "one_way",
      legs: [leg("direct", "train", [15, 15])],
    };
    const scheduledSchedule = schedule(28_800, 29_700);
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey,
        transferCount: 0,
        schedule: scheduledSchedule,
        totalDurationSeconds: 900,
      },
      legacyEstimate: legacyEstimate(),
    });

    expect(result.kind).toBe("scheduled_journey");
    if (result.kind !== "scheduled_journey") return;

    expect(result.journey).toBe(journey);
    expect(result.journey.legs).toHaveLength(1);
    expect(result.transferCount).toBe(0);
    expect(result.schedule).toBe(scheduledSchedule);
    expect(result.schedule).toEqual({
      serviceDate: "2026-09-12",
      departureServiceSeconds: 28_800,
      arrivalServiceSeconds: 29_700,
    });
    expect(result).not.toHaveProperty("departure");
    expect(result).not.toHaveProperty("arrival");
    expect(result).not.toHaveProperty("time");
    expect(result.totalDurationSeconds).toBe(900);
    expect(result.durationMinutes).toEqual([15, 15]);
    expect(result.confidence).toBe("medium");
    expect(result.provenance).toBe(journey.provenance);
    expect(result.journey.legs[0]?.cost).toBe(unknownCost);
  });

  it("preserves a one-transfer Journey, all legs, exact duration, and unknown fare", () => {
    const journey = scheduledJourney();
    const scheduledSchedule = schedule(86_400 + 300, 86_400 + 5_700);
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey,
        transferCount: 1,
        schedule: scheduledSchedule,
        totalDurationSeconds: 5_400,
      },
    });

    expect(result.kind).toBe("scheduled_journey");
    if (result.kind !== "scheduled_journey") return;

    expect(result.journey).toBe(journey);
    expect(result.journey.legs).toHaveLength(2);
    expect(result.journey.legs.map(({ mode }) => mode)).toEqual([
      "train",
      "bus",
    ]);
    expect(result.transferCount).toBe(1);
    expect(result.schedule).toEqual({
      serviceDate: "2026-09-12",
      departureServiceSeconds: 86_700,
      arrivalServiceSeconds: 92_100,
    });
    expect(result.totalDurationSeconds).toBe(5_400);
    expect(result.durationMinutes).toEqual([90, 90]);
    expect(result.confidence).toBe("medium");
    expect(result.provenance).toBe(journey.provenance);
    expect(result.journey.legs.every(({ cost }) => cost === unknownCost)).toBe(
      true,
    );
    expect(result).not.toHaveProperty("fare");
  });

  it("accepts a valid zero-duration Journey as evidence, not as unknown", () => {
    const journey: Journey = {
      ...scheduledJourney(),
      directionality: "one_way",
      legs: [leg("same-anchor", "train", [0, 0])],
      provenance: {
        ...scheduledJourney().provenance,
        source: "same_canonical_anchor",
      },
    };
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey,
        transferCount: 0,
        schedule: schedule(28_800, 28_800),
        totalDurationSeconds: 0,
      },
    });

    expect(result.kind).toBe("scheduled_journey");
    if (result.kind !== "scheduled_journey") return;
    expect(result.totalDurationSeconds).toBe(0);
    expect(result.durationMinutes).toEqual([0, 0]);
  });

  it("keeps a usable legacy estimate compatible when no scheduled Journey exists", () => {
    const estimate = legacyEstimate({ fareEvidence: "verified" });
    const result = getTransportDurationEvidence({ legacyEstimate: estimate });

    expect(result).toMatchObject({
      kind: "legacy_estimate",
      evidence: "estimated",
      durationMinutes: [90, 120],
      estimate,
    });
    if (result.kind !== "legacy_estimate") return;
    expect(result.estimate).toBe(estimate);
    expect(result.estimate.timeRange).toEqual([90, 120]);
    expect(result.confidence).toBe("low");
    expect(result.provenance).toMatchObject({
      source: "rough_transit_fallback",
      duration: "estimated",
      cost: "unknown",
    });
    expect(result).not.toHaveProperty("scheduledRejection");
  });

  it("keeps ordinary absent scheduled evidence distinct from invalid scheduled evidence", () => {
    const absent = getTransportDurationEvidence({});
    expect(absent).toEqual({
      kind: "unknown",
      evidence: "unknown",
      reason: "no_usable_duration_evidence",
    });
    expect(absent).not.toHaveProperty("scheduledRejection");

    const invalid = getTransportDurationEvidence({
      scheduledJourney: {
        journey: scheduledJourney(),
        transferCount: 1,
        schedule: schedule(100, 90),
        totalDurationSeconds: -10,
      },
    });
    expect(invalid).toMatchObject({
      kind: "unknown",
      evidence: "unknown",
      reason: "invalid_scheduled_journey",
      scheduledRejection: {
        kind: "scheduled_rejection",
        reason: "arrival_before_departure",
      },
    });
  });

  it("marks contradictory scheduled timing on a usable legacy fallback", () => {
    const estimate = legacyEstimate({ timeRange: [45, 60] });
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey: scheduledJourney(),
        transferCount: 1,
        schedule: schedule(100, 90),
        totalDurationSeconds: -10,
      },
      legacyEstimate: estimate,
    });

    expect(result).toMatchObject({
      kind: "legacy_estimate",
      estimate,
      durationMinutes: [45, 60],
      scheduledRejection: {
        kind: "scheduled_rejection",
        reason: "arrival_before_departure",
      },
    });
    if (result.kind !== "legacy_estimate") return;
    expect(result.estimate).toBe(estimate);
  });

  it("rejects an invalid service date without validating or manufacturing a display clock", () => {
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey: scheduledJourney(),
        transferCount: 1,
        schedule: schedule(28_800, 29_700, "2026-02-30"),
        totalDurationSeconds: 900,
      },
    });

    expect(result).toMatchObject({
      kind: "unknown",
      reason: "invalid_scheduled_journey",
      scheduledRejection: {
        kind: "scheduled_rejection",
        reason: "invalid_service_date",
      },
    });
    expect(result).not.toHaveProperty("time");
    expect(result).not.toHaveProperty("departure");
    expect(result).not.toHaveProperty("arrival");
  });

  it("returns unknown without inventing a zero duration or fare", () => {
    const result = getTransportDurationEvidence({
      scheduledJourney: null,
      legacyEstimate: legacyEstimate({ evidence: "unknown" }),
    });

    expect(result).toEqual({
      kind: "unknown",
      evidence: "unknown",
      reason: "no_usable_duration_evidence",
    });
    expect(result).not.toHaveProperty("durationMinutes");
    expect(result).not.toHaveProperty("estimate");
    expect(result).not.toHaveProperty("journey");
    expect(result).not.toHaveProperty("fare");
  });
});
