import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  getCarZoneArcEstimate,
  getTravelDurationEvidence,
} from "../TripDurationService";
import type { GroundRouteEstimate } from "@/shared/services/transport/GroundRouteEstimator";
import { getGroundRoute } from "@/shared/services/transport/GroundRouteEstimator";

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const OSAKA = { lat: 34.6937, lng: 135.5023 };

function carDestination(overrides: Partial<Destination>): Destination {
  return {
    id: "test-car-destination",
    name: "Test Car Destination",
    nameJa: "テスト",
    kind: "onsen",
    role: "standalone",
    region: "Kanto",
    status: "verified",
    placeType: "destination",
    recommendedVisitHours: { min: 2, max: 3 },
    carEligible: true,
    localAccessModes: ["car"],
    ...overrides,
  } as Destination;
}

const shimaOnsen = carDestination({
  id: "gunma-shima-onsen",
  name: "Shima Onsen",
  prefecture: "Gunma",
  municipalityId: "Gunma:minakami",
  region: "Kanto",
  coordinates: { lat: 36.6853, lng: 138.7789 },
  transportOptions: { car: 150, train: 140 },
});

describe("rental-car SafeGround fallback (discovery)", () => {
  it("estimates Shima Onsen from Tokyo with rental car (was unavailable)", () => {
    const result = getTravelDurationEvidence(
      shimaOnsen,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(result.evidence).toBe("estimated");
    expect(result.estimate?.mode).toBe("car");
    expect(result.estimate?.timeRange[0]).toBe(115);
    expect(result.estimate?.timeRange[1]).toBe(160);
  });

  it("keeps provider evidence as precedence when a normalized route exists", () => {
    // Structural guarantee: the originAware branch returns before the
    // estimated branch, so a usable provider route always wins over the arc.
    // (Normalized provider fixtures are covered by the
    // OriginAwareTransportService and CarRouteProvider suites.)
    const result = getTravelDurationEvidence(
      shimaOnsen,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(result.evidence).toBe("estimated");
    expect(result.estimate?.mode).toBe("car");
  });

  it("falls back to the car arc when the provider fails", () => {
    const result = getTravelDurationEvidence(
      shimaOnsen,
      {
        homeStationCoords: TOKYO,
        carRoutes: {
          [shimaOnsen.id]: {
            outbound: {
              availability: "unavailable",
              provider: "openrouteservice",
              reason: "request_failed",
              label: "OR",
            },
            returnRoute: {
              availability: "unavailable",
              provider: "openrouteservice",
              reason: "request_failed",
              label: "OR",
            },
          },
        },
      } as never,
      ["car"],
    );
    expect(result.evidence).toBe("estimated");
    expect(result.estimate?.mode).toBe("car");
    expect(result.estimate?.timeRange[0]).toBe(115);
  });

  it("estimates normal Tokyo→Kanagawa and distant mainland pairs", () => {
    const kanagawa = carDestination({
      id: "kanagawa-hakone",
      name: "Hakone",
      prefecture: "Kanagawa",
      municipalityId: "Kanagawa:hakone",
      coordinates: { lat: 35.2324, lng: 139.1069 },
    });
    // Within 120 km the same-zone km estimator wins (more granular); the
    // arc itself is still available for the pair.
    const kanagawaResult = getTravelDurationEvidence(
      kanagawa,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(kanagawaResult.evidence).toBe("estimated");
    expect(kanagawaResult.estimate?.mode).toBe("car");
    const kanagawaArc = getCarZoneArcEstimate(
      kanagawa,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(kanagawaArc?.timeRange).toEqual([40, 75]);

    const fukushima = carDestination({
      id: "fukushima-azuma",
      name: "Azuma",
      prefecture: "Fukushima",
      municipalityId: "Fukushima:fukushima",
      coordinates: { lat: 37.754, lng: 140.476 },
    });
    const farResult = getTravelDurationEvidence(
      fukushima,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(farResult.evidence).toBe("estimated");
    expect(farResult.estimate?.timeRange).toEqual([165, 215]);
  });

  it("respects Gunma subzones (Takasaki south vs Minakami northwest)", () => {
    const takasaki = carDestination({
      id: "gunma-takasaki",
      name: "Takasaki",
      prefecture: "Gunma",
      municipalityId: "Gunma:takasaki",
      coordinates: { lat: 36.322, lng: 139.003 },
    });
    const south = getCarZoneArcEstimate(
      takasaki,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(south?.timeRange).toEqual([85, 125]);
    const north = getCarZoneArcEstimate(
      shimaOnsen,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(north?.timeRange).toEqual([115, 160]);
  });

  it("supports other origins (Osaka → Kyoto uses its own arc)", () => {
    const kyoto = carDestination({
      id: "kyoto-kiyomizu",
      name: "Kiyomizu",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 34.9949, lng: 135.7849 },
    });
    // Osaka→Kyoto is within the same-zone km window, so the chain returns
    // an estimate; the arc registry still carries the defensible range.
    const result = getTravelDurationEvidence(
      kyoto,
      { homeStationCoords: OSAKA },
      ["car"],
    );
    expect(result.evidence).toBe("estimated");
    const arc = getCarZoneArcEstimate(kyoto, { homeStationCoords: OSAKA }, [
      "car",
    ]);
    expect(arc?.timeRange).toEqual([35, 70]);
  });

  it("keeps ferry-only islands unavailable even with a prefecture arc", () => {
    const sado = carDestination({
      id: "niigata-sado",
      name: "Sado",
      prefecture: "Niigata",
      municipalityId: "Niigata:sado",
      transportZoneId: "sado",
      coordinates: { lat: 38.005, lng: 138.35 },
    });
    const result = getTravelDurationEvidence(
      sado,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(result.evidence).toBe("unknown");
  });

  it("never uses a train arc for a car request", () => {
    // Kyoto: the train corridor exists but no Kyoto car arc is registered
    // (out of the Tokyo discovery envelope), so a car request must stay
    // unknown — a train arc must not masquerade as car duration.
    const kyoto = carDestination({
      id: "kyoto-city-kiyomizu",
      name: "Kiyomizu-dera",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 34.9949, lng: 135.7849 },
    });
    const trainArc: GroundRouteEstimate | null = getGroundRoute(
      "tokyo",
      "kyoto",
      "train",
    );
    expect(trainArc).not.toBeNull();
    const result = getTravelDurationEvidence(
      kyoto,
      { homeStationCoords: TOKYO },
      ["car"],
    );
    expect(result.evidence).toBe("unknown");
  });

  it("returns no estimate without a car-authorized mode", () => {
    const result = getTravelDurationEvidence(
      shimaOnsen,
      { homeStationCoords: TOKYO },
      ["train"],
    );
    expect(result.evidence).not.toBe("estimated");
  });
});
