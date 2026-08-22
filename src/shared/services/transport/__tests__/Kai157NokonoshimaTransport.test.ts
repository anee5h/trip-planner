import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  resolveDestinationTransportZone,
  hasFerryRoute,
} from "../TransportTopologyService";
import {
  findArrivalFerryPort,
  getFerryServices,
  isFerryTripAvailable,
  serviceMatchesDirection,
} from "../FerryTransportEstimator";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

// KAI-157 review regression: Nokonoshima is a ferry-only island in Hakata
// Bay. It must resolve to its own `nokonoshima` transport zone — never
// `mainland-kyushu` — and ground corridors (train/car/bus) must not reach
// it without the ferry.

const NOKONOSHIMA_PARK = {
  id: "nokonoshima-island-park",
  name: "Nokonoshima Island Park",
  prefecture: "Fukuoka",
  municipalityId: "Fukuoka:fukuoka",
  coordinates: { lat: 33.63, lng: 130.29 },
  kind: "park",
  tags: ["Park", "Nature", "Family", "Island", "Fukuoka"],
  localAccessModes: ["bus"],
  localAccessUnestimated: true,
  transportOptions: {},
} as unknown as Destination;

const FUKUOKA_ORIGIN = { lat: 33.5902, lng: 130.4017 }; // Hakata area

describe("KAI-157 Nokonoshima transport topology", () => {
  it("resolves Nokonoshima to its own zone, not mainland-kyushu", () => {
    expect(resolveDestinationTransportZone(NOKONOSHIMA_PARK)).toBe(
      "nokonoshima",
    );
  });

  it("mainland train/car/bus cannot reach the island without a ferry", () => {
    // A mainland-kyushu → nokonoshima ground corridor must not exist: the
    // zone has no rail/road edge to the mainland. getOriginAwareTransportEstimate
    // with train/bus returns null because the destination zone's localModes
    // (bus/car) plus edges exclude train, and the ferry is the only route.
    const train = getOriginAwareTransportEstimate(
      NOKONOSHIMA_PARK,
      {
        homeStationCoords: FUKUOKA_ORIGIN,
        originMunicipalityId: "Fukuoka:fukuoka",
      },
      ["train"],
    );
    expect(train).toBeNull();
  });

  it("no direct train route appears for the island", () => {
    // The record has localAccessModes ["bus"] and no static transportOptions;
    // train must be unsupported both via the origin-aware path and the
    // recommendation gate (RecommendationScorer's train branch requires
    // localAccessModes to include train).
    expect(NOKONOSHIMA_PARK.localAccessModes).not.toContain("train");
    expect(NOKONOSHIMA_PARK.transportOptions?.train).toBeUndefined();
  });

  it("ferry service exists Meinohama ↔ Nokonoshima (~10 min, verified fare)", () => {
    const meinohama = "MEINOHAMA";
    const nokonoshima = "NOKONOSHIMA";
    const services = getFerryServices(meinohama, nokonoshima, {});
    expect(services.length).toBeGreaterThan(0);
    const svc = services[0];
    expect(svc.durationMinutes).toEqual([10, 10]);
    expect(svc.fare).toEqual([230, 230]);
    expect(svc.passengerService).toBe(true);
    // Bidirectional: the return direction is served too.
    expect(serviceMatchesDirection(svc, nokonoshima, meinohama)).toBe(true);
  });

  it("arrival ferry port for Nokonoshima is the island terminal", () => {
    const port = findArrivalFerryPort(NOKONOSHIMA_PARK);
    expect(port).not.toBeNull();
    expect(port!.id).toBe("NOKONOSHIMA");
    expect(port!.zoneId).toBe("nokonoshima");
  });

  it("ferry trip from a supported Fukuoka origin is available", () => {
    // Same-day out-and-back on a summer date.
    const date = new Date("2026-08-06T12:00:00+09:00");
    expect(
      isFerryTripAvailable(NOKONOSHIMA_PARK, FUKUOKA_ORIGIN, [date, date]),
    ).toBe(true);
  });

  it("hasFerryRoute between mainland-kyushu and nokonoshima is true", () => {
    expect(hasFerryRoute("mainland-kyushu", "nokonoshima")).toBe(true);
  });
});
