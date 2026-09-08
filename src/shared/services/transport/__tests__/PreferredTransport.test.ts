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
  // KAI-204 phase 3 (positive trust): trusted provenance required.
  budgetMetadata: {
    method: "manual",
    confidence: "low",
    basis: "test fixture — trusted provenance",
  },
  totalTripHours: 8,
} as Destination;

const TOKYO = { lat: 35.6812, lng: 139.7671 };

describe("getFastestPreferredTransport", () => {
  it("chooses the fastest verified origin-aware mode and pairs its estimate with that mode", () => {
    const preferred = getFastestPreferredTransport(
      destination,
      "rental",
      ["train", "bus"],
      2,
      TOKYO,
      "mainland-honshu",
    );

    // Coordinate fallback is intentionally labeled estimated and wider than
    // the old catalogue band; the mode/evidence pairing remains the contract.
    expect(preferred?.mode).toBe("train");
    expect(preferred?.estimateSource).toBe("rough");
    expect(preferred?.timeRange[1]).toBeGreaterThan(
      preferred?.timeRange[0] ?? 0,
    );
    expect(preferred?.estimatedBudget).toBeGreaterThan(0);
  });

  it("does not select a mode the traveller has disabled or that lacks a verified duration", () => {
    const preferred = getFastestPreferredTransport(
      destination,
      "none",
      ["train", "bus"],
      2,
      TOKYO,
      "mainland-honshu",
    );

    expect(preferred?.mode).toBe("train");
    expect(preferred?.estimateSource).toBe("rough");
    expect(preferred?.timeRange[1]).toBeGreaterThan(
      preferred?.timeRange[0] ?? 0,
    );
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
