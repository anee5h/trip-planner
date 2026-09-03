import { beforeAll, describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  getCarAccess,
  getCarAccessEligibility,
  getRoutableCarAccessAnchors,
  isCarModeEligible,
  resolveCarAccess,
} from "../CarAccessService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";

const catalogue = destinations as Destination[];
const kyuKaruizawa = catalogue.find(
  (destination) => destination.id === "kyu-karuizawa-ginza",
)!;
const explicitKaruizawa = catalogue.find(
  (destination) => destination.id === "karuizawa-town",
)!;

beforeAll(async () => {
  await loadDestinationsIndex();
});

describe("KAI-264 canonical car access", () => {
  it("represents the Karuizawa class as eligible parking-plus-walk access", () => {
    const access = getCarAccess(kyuKaruizawa);

    expect(access.state).toBe("parking_walk");
    expect(access.eligibility).toBe("eligible");
    expect(access.evidence).toBe("tourism_board");
    expect(access.anchors).toHaveLength(1);
    expect(access.anchors[0].kind).toBe("official_parking");
    expect(access.anchors[0].coordinates).toEqual({
      lat: 36.357333,
      lng: 138.633287,
    });
    expect(getRoutableCarAccessAnchors(kyuKaruizawa)).toHaveLength(1);
    expect(isCarModeEligible(kyuKaruizawa)).toBe(true);
  });

  it("does not use the catalogue centroid as a fabricated access anchor", () => {
    const access = getCarAccess(explicitKaruizawa);
    expect(access.state).toBe("parking_walk");
    expect(access.anchors[0].coordinates).toEqual({
      lat: 36.357333,
      lng: 138.633287,
    });
    expect(getRoutableCarAccessAnchors(explicitKaruizawa)).toHaveLength(1);
  });

  it("keeps local car metadata as a resolvable candidate when no canonical anchor exists", () => {
    const unresolved = catalogue.find(
      (destination) =>
        destination.localAccessModes?.includes("car") &&
        destination.transportOptions?.car === undefined &&
        destination.carAccess === undefined &&
        destination.coordinates !== undefined,
    );
    expect(unresolved).toBeDefined();
    // The truth record stays explicitly unknown: metadata is not proof.
    expect(getCarAccessEligibility(unresolved!)).toBe("unknown");
    expect(getCarAccess(unresolved!).anchors).toEqual([]);
    // ... but it is resolvable: a routing candidate is derived so road
    // routing may be attempted without manually authored parking data.
    expect(resolveCarAccess(unresolved!).kind).toBe("candidate");
    expect(isCarModeEligible(unresolved!)).toBe(true);
    const anchors = getRoutableCarAccessAnchors(unresolved!);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].kind).toBe("documented_endpoint");
    expect(anchors[0].id).toBe(`${unresolved!.id}@candidate`);
    expect(anchors[0].coordinates).toEqual(unresolved!.coordinates);
    // The derived candidate never claims to be a verified parking location.
    expect(anchors[0].label).toContain("not a verified parking location");
  });

  it("retains old car eligibility as an explicit compatibility state, resolvable via candidate", () => {
    const legacy = catalogue.find(
      (destination) =>
        destination.transportOptions.car !== undefined &&
        destination.carAccess === undefined,
    );
    expect(legacy).toBeDefined();
    const access = getCarAccess(legacy!);
    expect(access.state).toBe("unknown");
    expect(access.eligibility).toBe("unknown");
    expect(access.evidence).toBe("legacy_compatibility");
    expect(access.anchors).toEqual([]);
    // Legacy metadata alone never proves availability; it only makes the
    // destination a car-resolution candidate worth attempting.
    expect(resolveCarAccess(legacy!).kind).toBe("candidate");
    expect(isCarModeEligible(legacy!)).toBe(true);
  });

  it("never overrides an explicit restriction with a derived candidate", () => {
    const restricted = {
      ...kyuKaruizawa,
      id: "restricted-fixture",
      carAccess: {
        state: "restricted",
        eligibility: "restricted",
        anchors: [],
        evidence: "official",
        sourceUrls: [],
        reason: "Private-car access prohibited.",
      },
      transportOptions: { car: 40, my_car: 40 },
      coordinates: { lat: 36.35, lng: 138.63 },
    } as Destination;
    const resolution = resolveCarAccess(restricted);
    expect(resolution.kind).toBe("restricted");
    expect(resolution.anchors).toEqual([]);
    expect(isCarModeEligible(restricted)).toBe(false);
  });

  it("makes scorer car and my_car agree with canonical eligibility", () => {
    const origin = { lat: 35.6812, lng: 139.7671 };
    const carModes = getValidModes(kyuKaruizawa, "rental", [], origin);
    const personalModes = getValidModes(kyuKaruizawa, "my_car", [], origin);

    expect(carModes).toContain("car");
    expect(personalModes).toContain("my_car");
    expect(isCarModeEligible(kyuKaruizawa)).toBe(true);
  });
});
