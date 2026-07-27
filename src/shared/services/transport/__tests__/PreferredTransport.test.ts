import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getFastestPreferredTransport } from "../PreferredTransport";

const destination = {
  id: "test-destination",
  name: "Test Destination",
  transportOptions: { train: 95, bus: 130, car: 70, my_car: 65 },
  budgetRecommended: 12000,
  budgetMin: 8000,
  budgetMax: 16000,
  budgetBreakdown: { transport: 3000, tickets: 2000, food: 5000, cafe: 2000 },
  totalTripHours: 8,
} as Destination;

describe("getFastestPreferredTransport", () => {
  it("chooses the fastest enabled mode and pairs its estimate with that mode", () => {
    const preferred = getFastestPreferredTransport(
      destination,
      "rental",
      ["train", "bus"],
      2,
    );

    expect(preferred).toMatchObject({
      mode: "car",
      timeRange: [70, 70],
    });
    expect(preferred?.estimatedBudget).toBeGreaterThan(0);
  });

  it("does not select a faster mode that the traveller has disabled", () => {
    const preferred = getFastestPreferredTransport(destination, "none", [
      "train",
      "bus",
    ]);

    expect(preferred?.mode).toBe("train");
    expect(preferred?.timeRange).toEqual([95, 95]);
  });
});
