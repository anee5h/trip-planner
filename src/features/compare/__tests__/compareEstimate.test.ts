import { beforeAll, describe, expect, it } from "vitest";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import type { TripContext } from "@/shared/context/TripContext";
import { resolveCompareEstimate } from "../compareEstimate";
import { resolveChildCount } from "@/shared/utils/tripComposition";

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
  budget: { kind: "custom", cap: 30000 },
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

  it("drops a child count that exceeds the party before resolving compare cost", () => {
    const venueWithTicketOptions = {
      id: "compare-ticket-fixture",
      name: "Compare Ticket Fixture",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 500, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "entry",
            variantId: "standard",
            category: "adult",
            min: 1000,
            max: 1000,
          },
          {
            productId: "entry",
            variantId: "standard",
            category: "child",
            min: 500,
            max: 500,
          },
        ],
      },
    } as unknown as (typeof destinations)[number];
    const context = {
      ...contextFor(2, []),
      origin: null,
      childCount: 3,
    };
    const estimate = resolveCompareEstimate(
      venueWithTicketOptions,
      context,
      true,
    );
    const allAdults = resolveCompareEstimate(
      venueWithTicketOptions,
      { ...context, childCount: undefined },
      true,
    );

    expect(resolveChildCount(context)).toBeUndefined();
    expect(estimate.total).toEqual(allAdults.total);
    expect(
      estimate.components.find(
        (component) => component.evidence.scope === "admission",
      )?.cost,
    ).toEqual({ kind: "bounded", min: 2000, max: 2000 });
  });
});
