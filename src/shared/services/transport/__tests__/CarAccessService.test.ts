import { beforeAll, describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  getCarAccess,
  getCarAccessEligibility,
  getRoutableCarAccessAnchors,
  isCarModeEligible,
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

  it("keeps local car metadata unresolved when no access anchor is documented", () => {
    const unresolved = catalogue.find(
      (destination) =>
        destination.localAccessModes?.includes("car") &&
        destination.transportOptions?.car === undefined &&
        destination.carAccess === undefined,
    );
    expect(unresolved).toBeDefined();
    expect(getCarAccessEligibility(unresolved!)).toBe("unknown");
    expect(isCarModeEligible(unresolved!)).toBe(false);
    expect(getCarAccess(unresolved!).anchors).toEqual([]);
  });

  it("retains old car eligibility as an explicit compatibility state", () => {
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
    expect(isCarModeEligible(legacy!)).toBe(false);
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
