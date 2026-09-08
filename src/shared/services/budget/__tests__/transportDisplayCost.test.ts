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
    });
  });
});
