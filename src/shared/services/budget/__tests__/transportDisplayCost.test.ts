import { describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import { calculateTripEstimate } from "../tripEstimateEngine";
import { getTransportDisplayCost } from "../transportDisplayCost";

describe("getTransportDisplayCost", () => {
  it("projects transport-only per-person cost instead of the whole-trip total", () => {
    const destination = destinations.find(
      (candidate) => candidate.id === "ueno-zoo",
    );
    expect(destination).toBeDefined();

    const estimate = calculateTripEstimate({
      dest: destination!,
      mode: "train",
      partySize: 4,
      duration: "2d1n",
      homeCoords: { lat: 35.6812, lng: 139.7671 },
    });

    expect(estimate.total).toEqual({
      kind: "bounded",
      min: 37200,
      max: 76800,
    });
    expect(getTransportDisplayCost(estimate, "train", 4)).toEqual({
      range: [600, 2000],
      unit: "per_person_round_trip",
      completeness: "complete",
    });
  });

  it("keeps car transport costs on a per-car basis", () => {
    const estimate = {
      components: [
        {
          cost: { kind: "bounded" as const, min: 12000, max: 18000 },
          evidence: {
            scope: "origin_travel" as const,
            derivation: "model_estimate" as const,
          },
        },
      ],
    } as unknown as Parameters<typeof getTransportDisplayCost>[0];

    expect(getTransportDisplayCost(estimate, "my_car", 4)).toEqual({
      range: [12000, 18000],
      unit: "per_car_round_trip",
      completeness: "complete",
    });
  });

  it("projects a bounded known subtotal as partial when toll is unknown", () => {
    const estimate = {
      components: [
        {
          cost: { kind: "unavailable" as const, reason: "source_missing" },
          knownCost: { kind: "bounded" as const, min: 3200, max: 4600 },
          evidence: {
            scope: "origin_travel" as const,
            derivation: "computed" as const,
            reason: "toll_unknown",
          },
        },
      ],
    } as unknown as Parameters<typeof getTransportDisplayCost>[0];

    expect(getTransportDisplayCost(estimate, "my_car", 2)).toEqual({
      range: [3200, 4600],
      unit: "per_car_round_trip",
      completeness: "partial",
      reason: "toll_unknown",
    });
  });

  it("retains unavailable status when no bounded subtotal exists", () => {
    const estimate = {
      components: [
        {
          cost: { kind: "unavailable" as const, reason: "source_missing" },
          evidence: {
            scope: "origin_travel" as const,
            derivation: "computed" as const,
            reason: "route_unavailable",
          },
        },
      ],
    } as unknown as Parameters<typeof getTransportDisplayCost>[0];

    expect(getTransportDisplayCost(estimate, "car", 2)).toEqual({
      unit: "per_car_round_trip",
      completeness: "unavailable",
      reason: "route_unavailable",
    });
  });
});
