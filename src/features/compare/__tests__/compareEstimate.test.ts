import { beforeAll, describe, expect, it } from "vitest";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import type { TripContext } from "@/shared/context/TripContext";
import { resolveCompareEstimate } from "../compareEstimate";

const contextFor = (partySize: number, publicModes: string[]): TripContext => ({
  origin: {
    label: "Tokyo Station",
    coordinates: { lat: 35.6812, lng: 139.7671 },
    source: "station",
    transportZoneId: "mainland-honshu",
  },
  travelDate: "2026-08-20",
  dateSemantics: "custom",
  duration: "2d1n",
  partySize,
  publicModes,
  carMode: "none",
  budget: { kind: "cap", cap: 30000, tier: "standard" },
});

describe("resolveCompareEstimate", () => {
  let destinations: Awaited<ReturnType<typeof loadDestinationsIndex>>;

  beforeAll(async () => {
    destinations = await loadDestinationsIndex();
  });

  it("keeps Kyoto's explicit 2D1N shinkansen context on the canonical engine", () => {
    const kyoto = destinations.find(
      (destination) => destination.id === "kyoto-city",
    );
    expect(kyoto).toBeDefined();
    const context = contextFor(2, ["shinkansen"]);

    const actual = resolveCompareEstimate(kyoto!, context, true);
    const expected = calculateTripEstimate({
      dest: kyoto!,
      duration: "2d1n",
      partySize: 2,
      mode: "shinkansen",
      homeCoords: context.origin?.coordinates,
      includeOriginTravel: true,
    });

    expect(actual.total).toEqual(expected.total);
    expect(actual.completeness).toBe(expected.completeness);
  });

  it("keeps Ueno party size 4 and train context on the canonical engine", () => {
    const ueno = destinations.find(
      (destination) => destination.id === "ueno-zoo",
    );
    expect(ueno).toBeDefined();
    const context = contextFor(4, ["train"]);

    const actual = resolveCompareEstimate(ueno!, context, true);
    const expected = calculateTripEstimate({
      dest: ueno!,
      duration: "2d1n",
      partySize: 4,
      mode: "train",
      homeCoords: context.origin?.coordinates,
      includeOriginTravel: true,
    });

    expect(actual.total).toEqual(expected.total);
    expect(actual.completeness).toBe(expected.completeness);
  });
});
