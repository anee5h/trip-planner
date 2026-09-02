import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { JourneyEndpoint } from "@/shared/types/journey";
import {
  buildJourneyFromOriginAwareEstimate,
  buildJourneyFromTransportEstimate,
  JourneyBuilder,
} from "../JourneyBuilder";
import { getOriginAwareTransportJourney } from "../JourneyService";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";
import type { OriginAwareTransportEstimate } from "../OriginAwareTransportService";
import { getTravelDurationEvidence } from "@/shared/services/recommendation/TripDurationService";

const endpoints: { origin: JourneyEndpoint; destination: JourneyEndpoint } = {
  origin: {
    kind: "origin",
    id: "Tokyo:chiyoda",
    coordinates: { lat: 35.6812, lng: 139.7671 },
  },
  destination: {
    kind: "destination",
    id: "kyoto-city",
    name: "Kyoto",
    coordinates: { lat: 35.0116, lng: 135.7681 },
  },
};

function estimate(
  overrides: Partial<OriginAwareTransportEstimate> = {},
): OriginAwareTransportEstimate {
  return {
    mode: "train",
    timeRange: [135, 220],
    source: "verified_ground_route",
    evidence: "verified",
    corridorEvidence: "verified",
    originZoneId: "mainland-honshu",
    destinationZoneId: "mainland-honshu",
    sourceUrl: "https://example.test/route",
    checkedAt: "2026-09-01",
    ...overrides,
  };
}

function destination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "unsupported-journey-fixture",
    name: "Unsupported fixture",
    prefecture: "Kagawa",
    coordinates: { lat: 34.35, lng: 134.05 },
    transportOptions: {},
    ...overrides,
  } as Destination;
}

describe("KAI-263 JourneyBuilder", () => {
  it("round-trips a verified single-mode result as exactly one leg", () => {
    const source = estimate({
      fare: [1410, 1410],
      fareVariability: "fixed",
      fareScope: "complete",
      fareBasis: "base",
    });
    const journey = JourneyBuilder.fromOriginAwareEstimate(source, endpoints);
    const leg = journey.legs[0];

    expect(journey.legs).toHaveLength(1);
    expect(leg.mode).toBe(source.mode);
    expect(leg.origin).toEqual(endpoints.origin);
    expect(leg.destination).toEqual(endpoints.destination);
    expect(leg.duration.minutes).toEqual(source.timeRange);
    expect(leg.duration.evidence).toBe("verified");
    expect(leg.duration.sourceUrl).toBe(source.sourceUrl);
    expect(leg.cost).toMatchObject({
      state: "known",
      representation: { kind: "bounded", min: 1410, max: 1410 },
      scope: "complete",
      completeness: "complete",
      basis: "one_way_per_person",
    });
    expect(leg.availability).toBe("available");
    expect(leg.confidence).toBe("high");
    expect(leg.routeMetadata?.corridorEvidence).toBe("verified");
  });

  it.each([
    ["verified", "high"],
    ["estimated", "medium"],
  ] as const)("preserves %s duration provenance", (evidence, confidence) => {
    const journey = buildJourneyFromOriginAwareEstimate(
      estimate({
        evidence,
        fare: [500, null],
        fareVariability: "dynamic",
        fareScope: "corridor_only",
      }),
      endpoints,
    );

    expect(journey.legs[0].duration.evidence).toBe(evidence);
    expect(journey.legs[0].provenance.duration).toBe(evidence);
    expect(journey.legs[0].confidence).toBe(confidence);
    expect(journey.legs[0].cost).toMatchObject({
      evidence,
      state: "known",
    });
    expect(journey.legs[0].cost.representation).toEqual({
      kind: "open_ended",
      from: 500,
    });
    expect(journey.legs[0].cost.completeness).toBe("partial");
  });

  it("keeps an available route's missing fare unknown", () => {
    const journey = buildJourneyFromOriginAwareEstimate(
      estimate({ fare: null, fareScope: "unknown" }),
      endpoints,
    );
    const leg = journey.legs[0];

    expect(leg.availability).toBe("available");
    expect(leg.duration.evidence).toBe("verified");
    expect(leg.cost).toMatchObject({
      representation: null,
      state: "unknown",
      evidence: "unknown",
      scope: "unknown",
      completeness: "unknown",
    });
    expect(leg.cost).not.toHaveProperty("representation.min");
  });

  it("keeps an explicit round-trip fare basis instead of treating it as one-way", () => {
    const journey = buildJourneyFromOriginAwareEstimate(
      estimate({
        mode: "ferry",
        fare: [2800, 2800],
        fareBasis: "round-trip",
        fareScope: "complete",
      }),
      endpoints,
    );

    expect(journey.legs[0].cost.basis).toBe("round_trip_per_person");
    expect(journey.legs[0].routeMetadata?.fareBasis).toBe("round-trip");
  });

  it("maps an unavailable generic result without turning it into a supported route", () => {
    const journey = buildJourneyFromTransportEstimate(
      {
        mode: "flight",
        label: "Flight",
        available: false,
        recommended: false,
        timeRange: [0, 0],
        costRange: [0, 0],
        costUnavailable: true,
        source: "dataset",
      },
      endpoints,
    );

    expect(journey.availability).toBe("unavailable");
    expect(journey.legs[0].availability).toBe("unavailable");
    expect(journey.legs[0].duration.minutes).toBeUndefined();
    expect(journey.legs[0].cost).toMatchObject({
      representation: null,
      state: "unavailable",
      evidence: "unknown",
    });
    expect(journey.legs[0].confidence).toBe("unknown");
  });

  it("downgrades generic flight access overhead without losing verified fare", () => {
    const journey = buildJourneyFromTransportEstimate(
      {
        mode: "flight",
        label: "Flight",
        available: true,
        recommended: true,
        timeRange: [180, 240],
        costRange: [15000, 18000],
        source: "dataset",
        details: {
          originAccessTimeRange: [30, 45],
          destAccessTimeRange: [20, 30],
          verifiedFare: [12000, 14000],
          verifiedFareStatus: "verified",
          sourceUrl: "https://example.test/flight-route",
          fareSourceUrl: "https://example.test/flight-fare",
          checkedAt: "2026-09-01",
        },
      },
      endpoints,
    );

    expect(journey.legs[0].duration.evidence).toBe("estimated");
    expect(journey.legs[0].provenance.sourceUrl).toBe(
      "https://example.test/flight-route",
    );
    expect(journey.legs[0].cost).toMatchObject({
      evidence: "verified",
      scope: "corridor_only",
      completeness: "partial",
      basis: "one_way_per_person",
      representation: { kind: "bounded", min: 12000, max: 14000 },
    });
    expect(journey.legs[0].cost.sourceUrls).toEqual([
      "https://example.test/flight-fare",
    ]);
  });

  it("preserves existing flight result duration and fare provenance", () => {
    const sapporo = (destinationsIndex as Destination[]).find(
      (candidate) => candidate.id === "sapporo-city",
    );
    expect(sapporo).toBeDefined();

    const source = getOriginAwareTransportEstimate(
      sapporo!,
      { homeStationCoords: endpoints.origin.coordinates! },
      ["flight"],
    );
    const journey = getOriginAwareTransportJourney(
      sapporo!,
      { homeStationCoords: endpoints.origin.coordinates! },
      ["flight"],
    );

    expect(source).not.toBeNull();
    expect(journey).not.toBeNull();
    expect(journey!.legs[0].mode).toBe("flight");
    expect(journey!.legs[0].duration.minutes).toEqual(source!.timeRange);
    expect(journey!.legs[0].routeMetadata?.departureAirportCode).toBeTruthy();
    expect(journey!.legs[0].routeMetadata?.arrivalAirportCode).toBeTruthy();
    expect(journey!.legs[0].provenance.duration).toBe("estimated");
    expect(journey!.legs[0].provenance.cost).toBe("verified");
    expect(journey!.legs[0].cost).toMatchObject({
      evidence: "verified",
      completeness: "partial",
    });
    expect(journey!.legs[0].cost.scope).toBe("corridor_only");
  });

  it("preserves verified ferry fare when port access duration is estimated", () => {
    const naoshima = (destinationsIndex as Destination[]).find(
      (candidate) => candidate.id === "naoshima-art-island-kagawa",
    );
    expect(naoshima).toBeDefined();

    const context = {
      homeStationCoords: { lat: 34.7025, lng: 135.4959 },
      ferryTemporal: { season: "summer" as const },
    };
    const source = getOriginAwareTransportEstimate(naoshima!, context, [
      "ferry",
    ]);
    const journey = getOriginAwareTransportJourney(naoshima!, context, [
      "ferry",
    ]);

    expect(source).not.toBeNull();
    expect(source!.evidence).toBe("estimated");
    expect(source!.fare).not.toBeNull();
    expect(journey).not.toBeNull();
    expect(journey!.legs[0].duration.evidence).toBe("estimated");
    expect(journey!.legs[0].cost).toMatchObject({
      evidence: "verified",
      completeness: "partial",
      scope: "corridor_only",
    });
  });

  it("does not create a Journey when the origin is absent", () => {
    const sapporo = (destinationsIndex as Destination[]).find(
      (candidate) => candidate.id === "sapporo-city",
    );
    expect(getOriginAwareTransportJourney(sapporo!, {}, ["flight"])).toBeNull();
  });

  it("does not use an estimator default when duration origin is absent", () => {
    const sapporo = (destinationsIndex as Destination[]).find(
      (candidate) => candidate.id === "sapporo-city",
    );
    expect(
      getTravelDurationEvidence(sapporo!, { homeStationCoords: null }, [
        "flight",
      ]),
    ).toEqual({ evidence: "unknown" });
  });

  it("does not build a Journey when the existing estimator has no supported mode", () => {
    const result = getOriginAwareTransportJourney(
      destination(),
      { homeStationCoords: endpoints.origin.coordinates },
      ["bus"],
    );

    expect(result).toBeNull();
  });
});
