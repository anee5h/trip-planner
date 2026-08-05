import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getFastestPreferredTransport } from "../PreferredTransport";

const destination = {
  id: "test-destination",
  name: "Test Destination",
  prefecture: "Kanagawa",
  coordinates: { lat: 35.4, lng: 139.5 },
  transportOptions: { train: 95, bus: 130, car: 70, my_car: 65 },
  budgetRecommended: 12000,
  budgetMin: 8000,
  budgetMax: 16000,
  budgetBreakdown: { transport: 3000, tickets: 2000, food: 5000, cafe: 2000 },
  totalTripHours: 8,
} as Destination;

const TOKYO = { lat: 35.6812, lng: 139.7671 };

describe("getFastestPreferredTransport", () => {
  it("chooses the fastest enabled mode and pairs its estimate with that mode", () => {
    const preferred = getFastestPreferredTransport(
      destination,
      "rental",
      ["train", "bus"],
      2,
      TOKYO,
      "mainland-honshu",
    );

    expect(preferred).toMatchObject({
      mode: "car",
      timeRange: [70, 70],
    });
    expect(preferred?.estimatedBudget).toBeGreaterThan(0);
  });

  it("does not select a faster mode that the traveller has disabled", () => {
    const preferred = getFastestPreferredTransport(
      destination,
      "none",
      ["train", "bus"],
      2,
      TOKYO,
      "mainland-honshu",
    );

    expect(preferred?.mode).toBe("train");
    expect(preferred?.timeRange).toEqual([95, 95]);
  });

  it("returns null when no authorized mode exists", () => {
    const preferred = getFastestPreferredTransport(
      destination,
      "none",
      ["train", "bus"],
      2,
      TOKYO,
      "unknown",
    );
    expect(preferred).toBeNull();
  });
});
