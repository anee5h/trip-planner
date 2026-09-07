import { describe, expect, it } from "vitest";
import type { Journey, JourneyEndpoint } from "@/shared/types/journey";
import { buildJourneyHandoff } from "../JourneyHandoff";

const origin: JourneyEndpoint = {
  id: "tokyo-station",
  anchorKey: "anchor:tokyo-station",
  kind: "origin",
  name: "Tokyo Station",
  coordinates: { lat: 35.6812, lng: 139.7671 },
};

const destination: JourneyEndpoint = {
  id: "hakone-town",
  anchorKey: "anchor:hakone-town",
  kind: "destination",
  name: "Hakone Town",
  coordinates: { lat: 35.2324, lng: 139.1069 },
};

function journey(
  mode: Journey["legs"][number]["mode"],
  overrides = {},
): Journey {
  return {
    kind: "journey",
    origin,
    destination,
    scope: "origin_journey",
    directionality: "one_way",
    completeness: "complete",
    availability: "available",
    confidence: "low",
    provenance: {
      source: "calculated_ground_display",
      confidence: "low",
      duration: "estimated",
      cost: "unknown",
    },
    externalHandoff:
      mode === "my_car" || mode === "car"
        ? { supported: true, mode: "driving" }
        : { supported: true, mode: "transit" },
    legs: [
      {
        mode,
        direction: "one_way",
        origin,
        destination,
        duration: {
          minutes: [74, 94],
          evidence: "estimated",
          source: "calculated_ground_display",
        },
        cost: {
          currency: "JPY",
          representation: null,
          state: "unknown",
          evidence: "unknown",
          scope: "unknown",
          completeness: "unknown",
          basis: "unknown",
        },
        availability: "available",
        confidence: "low",
        provenance: {
          source: "calculated_ground_display",
          confidence: "low",
          duration: "estimated",
          cost: "unknown",
        },
      },
    ],
    ...overrides,
  };
}

describe("JourneyHandoff", () => {
  it.each(["my_car", "car"] as const)(
    "maps %s to driving without changing the canonical endpoint",
    (mode) => {
      const handoff = buildJourneyHandoff(journey(mode));

      expect(handoff).toMatchObject({
        externalMode: "driving",
        internalMode: mode,
        origin: origin.coordinates,
        destination: destination.coordinates,
      });
      expect(handoff?.href).toContain("travelmode=driving");
      expect(handoff?.href).toContain("destination=35.2324%2C139.1069");
      expect(handoff?.href).not.toContain("travelmode=transit");
    },
  );

  it("maps a supported public journey to generic transit", () => {
    const handoff = buildJourneyHandoff(journey("train"));

    expect(handoff?.externalMode).toBe("transit");
    expect(handoff?.href).toContain("travelmode=transit");
  });

  it.each(["ferry", "flight"] as const)(
    "does not invent a transit handoff for %s",
    (mode) => {
      expect(buildJourneyHandoff(journey(mode))).toBeNull();
    },
  );

  it("does not hand off a partial journey", () => {
    expect(
      buildJourneyHandoff(
        journey("bus", {
          completeness: "partial",
          availability: "unknown",
        }),
      ),
    ).toBeNull();
  });
});
