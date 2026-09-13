import { describe, expect, it } from "vitest";
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
  it("preserves a canonical multi-leg scheduled Journey without flattening it", () => {
    const journey = scheduledJourney();
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey,
        transferCount: 1,
        departure: { serviceSeconds: 28_800, time: "08:00:00" },
        arrival: { serviceSeconds: 34_200, time: "09:30:00" },
        totalDurationSeconds: 5_400,
      },
      legacyEstimate: legacyEstimate(),
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
    expect(result.departure).toEqual({
      serviceSeconds: 28_800,
      time: "08:00:00",
    });
    expect(result.arrival).toEqual({
      serviceSeconds: 34_200,
      time: "09:30:00",
    });
    expect(result.totalDurationSeconds).toBe(5_400);
    expect(result.durationMinutes).toEqual([90, 90]);
    expect(result.confidence).toBe("medium");
    expect(result.provenance).toBe(journey.provenance);
    expect(result.journey.legs[0]?.cost).toBe(unknownCost);
    expect(result).not.toHaveProperty("estimate");
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
        departure: { serviceSeconds: 28_800, time: "08:00:00" },
        arrival: { serviceSeconds: 28_800, time: "08:00:00" },
        totalDurationSeconds: 0,
      },
    });

    expect(result.kind).toBe("scheduled_journey");
    if (result.kind !== "scheduled_journey") return;
    expect(result.totalDurationSeconds).toBe(0);
    expect(result.durationMinutes).toEqual([0, 0]);
  });

  it("keeps a usable legacy estimate when no scheduled Journey exists", () => {
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
    expect(result.confidence).toBe("low");
    expect(result.provenance).toMatchObject({
      source: "rough_transit_fallback",
      duration: "estimated",
      cost: "unknown",
    });
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
  });

  it("falls back to legacy evidence when scheduled timing is unusable", () => {
    const estimate = legacyEstimate({ timeRange: [45, 60] });
    const result = getTransportDurationEvidence({
      scheduledJourney: {
        journey: scheduledJourney(),
        transferCount: 1,
        departure: { serviceSeconds: 100, time: "00:01:40" },
        arrival: { serviceSeconds: 90, time: "00:01:30" },
        totalDurationSeconds: -10,
      },
      legacyEstimate: estimate,
    });

    expect(result.kind).toBe("legacy_estimate");
    if (result.kind !== "legacy_estimate") return;
    expect(result.estimate).toBe(estimate);
  });
});
