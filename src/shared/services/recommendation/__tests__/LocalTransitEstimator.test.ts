import { describe, it, expect } from "vitest";
import { estimateLocalTransitMinutes } from "../LocalTransitEstimator";
import type { Destination } from "@/shared/types/destination";

describe("LocalTransitEstimator", () => {
  it("returns 0 minutes for same destination", () => {
    const dest = {
      id: "tokyo-skytree",
      coordinates: { lat: 35.7101, lng: 139.8107 },
    } as Destination;
    const res = estimateLocalTransitMinutes(dest, dest, "nearby");
    expect(res.usable).toBe(true);
    expect(res.durationMinutes).toBe(0);
    expect(res.source).toBe("curated");
  });

  it("prioritizes curated minutes context when valid", () => {
    const d1 = {
      id: "d1",
      coordinates: { lat: 35.7, lng: 139.8 },
    } as Destination;
    const d2 = {
      id: "d2",
      coordinates: { lat: 35.71, lng: 139.81 },
    } as Destination;

    const res = estimateLocalTransitMinutes(d1, d2, "nearby", {
      curatedMinutes: 20,
    });
    expect(res.usable).toBe(true);
    expect(res.durationMinutes).toBe(20);
    expect(res.source).toBe("curated");
    expect(res.confidence).toBe("verified");
  });

  it("rejects transit over scope max minutes (35m nearby) even for curated data", () => {
    const d1 = { id: "d1" } as Destination;
    const d2 = { id: "d2" } as Destination;

    const res = estimateLocalTransitMinutes(d1, d2, "nearby", {
      curatedMinutes: 40,
    });
    expect(res.usable).toBe(false);
    expect(res.durationMinutes).toBe(0);
    expect(res.reason).toBe("outside_local_catchment");
  });

  it("rejects routes with missing coordinates when no curated minutes exist", () => {
    const d1 = { id: "d1" } as Destination; // No coords
    const d2 = {
      id: "d2",
      coordinates: { lat: 35.7, lng: 139.8 },
    } as Destination;

    const res = estimateLocalTransitMinutes(d1, d2, "nearby");
    expect(res.usable).toBe(false);
    expect(res.durationMinutes).toBe(0);
    expect(res.reason).toBe("missing_coordinates");
  });
});
